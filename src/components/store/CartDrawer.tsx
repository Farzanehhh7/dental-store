import { Link } from 'react-router-dom';
import { Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useI18n } from '../../context/i18n';
import { useStore } from '../../context/StoreContext';
import { buildResponsiveImageProps } from '../../lib/media';
import { resolveVariantPrice } from '../../lib/pricing';
import { AccessibleModal } from '../ui/Modal';
import { EmptyState } from '../ui/States';

export default function CartDrawer() {
  const {
    cart,
    cartPendingVariantIds,
    cartOpen,
    setCartOpen,
    products,
    campaigns,
    currency,
    customerGroup,
    settings,
    updateCartQty,
    removeFromCart,
  } = useStore();
  const { t, locale, formatMoney, formatDigits } = useI18n();

  let subtotal = 0;
  const lineItems = cart
    .map((ci) => {
      const product = products.find((p) => p.id === ci.productId);
      const variant = product?.variants.find((v) => v.id === ci.variantId);
      if (!product || !variant) return null;
      const resolved = resolveVariantPrice(product, variant, {
        customerGroup,
        quantity: ci.quantity,
        campaigns,
        settings,
      });
      const unitPrice = resolved.unitPrice ?? 0;
      const lineTotal = unitPrice * ci.quantity;
      subtotal += lineTotal;
      return { ci, product, variant, unitPrice, lineTotal };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const freeThreshold = settings.freeShippingThreshold;
  const remainingForFree = Math.max(0, freeThreshold - subtotal);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <AccessibleModal
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      align="end"
      ariaLabel={t('cartDrawer.titleSimple')}
      containerClassName="!bg-black/40 !backdrop-blur-[1px]"
      panelClassName="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-e border-line dark:border-slate-800 shadow-2xl"
    >
      <aside className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-line dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-brand" aria-hidden="true" />
            <h2 className="font-extrabold text-base text-ink dark:text-slate-100">
              {t('cartDrawer.titleWithCount', { count: formatDigits(totalQty) })}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label={t('cartDrawer.closeAria')}
            className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg text-ink/70 dark:text-slate-300 hover:bg-surface dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {lineItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <EmptyState
              icon={<ShoppingBag className="w-7 h-7 text-brand" aria-hidden="true" />}
              title={t('cartDrawer.empty')}
              actionLabel={t('cartDrawer.browseCatalog')}
              onAction={() => {
                setCartOpen(false);
              }}
              actionTo="/category/consumables"
            />
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-surface/70 dark:bg-slate-800/60 border-b border-line dark:border-slate-800 text-xs text-ink/85 dark:text-slate-200">
              {remainingForFree === 0 ? (
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {t('cartDrawer.freeShippingReached')}
                </span>
              ) : (
                <span>
                  {t('cartDrawer.freeShippingRemaining', { amount: formatMoney(remainingForFree, currency) })}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-slate-800 px-5">
              {lineItems.map(({ ci, product, variant, unitPrice, lineTotal }) => {
                const isPending = cartPendingVariantIds.includes(variant.id);
                const title = locale === 'en' && product.titleEn ? product.titleEn : product.titleFa;
                return (
                  <div
                    key={variant.id}
                    aria-busy={isPending}
                    className={`py-4 flex gap-3 transition-opacity ${isPending ? 'opacity-75' : ''}`}
                  >
                    <img
                      {...buildResponsiveImageProps(product.imageUrl, {
                        widths: [144, 288],
                        sizes: '72px',
                      })}
                      alt={title}
                      width={72}
                      height={54}
                      className="w-18 h-14 rounded-lg object-cover bg-surface shrink-0 border border-line dark:border-slate-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/product/${product.slug}`}
                          onClick={() => setCartOpen(false)}
                          className="text-sm font-bold text-ink dark:text-slate-100 line-clamp-1 hover:text-brand"
                        >
                          {title}
                        </Link>
                        {isPending && (
                          <Loader2
                            className="w-3.5 h-3.5 text-brand animate-spin shrink-0"
                            aria-label={t('cartDrawer.syncing')}
                          />
                        )}
                      </div>
                      <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{variant.labelFa}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center border border-line dark:border-slate-700 rounded-lg">
                          <button
                            type="button"
                            onClick={() => updateCartQty(variant.id, ci.quantity + 1)}
                            aria-label={t('cartDrawer.increaseQty')}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center hover:bg-surface dark:hover:bg-slate-800"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-xs font-bold tabular-nums">{formatDigits(ci.quantity)}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(variant.id, ci.quantity - 1)}
                            aria-label={t('cartDrawer.decreaseQty')}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center hover:bg-surface dark:hover:bg-slate-800"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-brand dark:text-teal-300 tabular-nums">
                            {unitPrice > 0 ? formatMoney(lineTotal, currency) : t('cartDrawer.callForPriceShort')}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(variant.id)}
                            aria-label={t('cartDrawer.removeItem')}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-lg text-ink/65 dark:text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-line dark:border-slate-800 space-y-3 bg-paper dark:bg-slate-950">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/75 dark:text-slate-300">{t('cartDrawer.subtotalLabel')}</span>
                <span className="font-extrabold text-base tabular-nums text-ink dark:text-slate-100">
                  {subtotal > 0 ? formatMoney(subtotal, currency) : t('cartDrawer.needsInquiry')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link
                  to="/cart"
                  onClick={() => setCartOpen(false)}
                  className="min-h-[44px] inline-flex items-center justify-center py-2.5 px-4 rounded-lg border border-line dark:border-slate-700 text-center text-sm font-bold hover:border-brand"
                >
                  {t('cartDrawer.viewCart')}
                </Link>
                <Link
                  to="/checkout"
                  data-testid="cart-drawer-checkout-link"
                  onClick={() => setCartOpen(false)}
                  className="min-h-[44px] inline-flex items-center justify-center py-2.5 px-4 rounded-lg bg-brand text-white text-center text-sm font-bold hover:bg-brandDark"
                >
                  {t('cartDrawer.proceedCheckout')}
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </AccessibleModal>
  );
}
