import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatMoney, toPersianDigits } from '../../lib/jalali';
import { resolveVariantPrice } from '../../lib/pricing';

export default function CartDrawer() {
  const {
    cart,
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

  if (!cartOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="سبد خرید">
      <div className="fixed inset-0" onClick={() => setCartOpen(false)} />
      <aside className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-r border-line dark:border-slate-800 shadow-2xl">
        <div className="px-5 py-4 border-b border-line dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-brand" />
            <h2 className="font-extrabold text-base text-ink dark:text-slate-100">
              سبد خرید ({toPersianDigits(cart.reduce((s, i) => s + i.quantity, 0))})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="بستن سبد خرید"
            className="p-2 rounded-lg text-ink/60 dark:text-slate-400 hover:bg-surface dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {lineItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
            <ShoppingBag className="w-12 h-12 text-ink/20 dark:text-slate-700" />
            <p className="text-sm text-ink/70 dark:text-slate-400">سبد خرید شما در حال حاضر خالی است.</p>
            <Link
              to="/category/consumables"
              onClick={() => setCartOpen(false)}
              className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              مشاهده محصولات فروشگاه
            </Link>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-surface/70 dark:bg-slate-800/60 border-b border-line dark:border-slate-800 text-xs text-ink/80 dark:text-slate-300">
              {remainingForFree === 0 ? (
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  تبریک! ارسال این سفارش در تهران رایگان است.
                </span>
              ) : (
                <span>
                  با افزودن <strong className="tabular-nums">{formatMoney(remainingForFree, currency)}</strong> دیگر، ارسال رایگان فعال می‌شود.
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-slate-800 px-5">
              {lineItems.map(({ ci, product, variant, unitPrice, lineTotal }) => (
                <div key={variant.id} className="py-4 flex gap-3">
                  <img
                    src={product.imageUrl}
                    alt={product.titleFa}
                    width={72}
                    height={54}
                    className="w-18 h-14 rounded-lg object-cover bg-surface shrink-0 border border-line dark:border-slate-800"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/product/${product.slug}`}
                      onClick={() => setCartOpen(false)}
                      className="text-sm font-bold text-ink dark:text-slate-100 line-clamp-1 hover:text-brand"
                    >
                      {product.titleFa}
                    </Link>
                    <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">{variant.labelFa}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center border border-line dark:border-slate-700 rounded-lg">
                        <button
                          type="button"
                          onClick={() => updateCartQty(variant.id, ci.quantity + 1)}
                          aria-label="افزایش تعداد"
                          className="p-1.5 hover:bg-surface dark:hover:bg-slate-800"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-bold tabular-nums">{toPersianDigits(ci.quantity)}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(variant.id, ci.quantity - 1)}
                          aria-label="کاهش تعداد"
                          className="p-1.5 hover:bg-surface dark:hover:bg-slate-800"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-brand dark:text-teal-300 tabular-nums">
                          {unitPrice > 0 ? formatMoney(lineTotal, currency) : 'تماس بگیرید'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(variant.id)}
                          aria-label="حذف"
                          className="p-1 text-ink/40 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-line dark:border-slate-800 space-y-3 bg-paper dark:bg-slate-950">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/70 dark:text-slate-400">جمع کل کالاها</span>
                <span className="font-extrabold text-base tabular-nums text-ink dark:text-slate-100">
                  {subtotal > 0 ? formatMoney(subtotal, currency) : 'نیازمند استعلام'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/cart"
                  onClick={() => setCartOpen(false)}
                  className="py-2.5 px-4 rounded-lg border border-line dark:border-slate-700 text-center text-sm font-bold hover:border-brand"
                >
                  مشاهده سبد
                </Link>
                <Link
                  to="/checkout"
                  data-testid="cart-drawer-checkout-link"
                  onClick={() => setCartOpen(false)}
                  className="py-2.5 px-4 rounded-lg bg-brand text-white text-center text-sm font-bold hover:bg-brandDark"
                >
                  ادامه تسویه‌حساب
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
