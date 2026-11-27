import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { AccessibleModal } from '../components/ui/Modal';
import { useI18n } from '../context/i18n';
import { useStore } from '../context/StoreContext';
import { trackEcommerceEvent } from '../lib/analytics';
import { buildResponsiveImageProps } from '../lib/media';
import { resolveVariantPrice } from '../lib/pricing';
import { applySeoHead } from '../lib/seo';
import { Order, OrderItem, PaymentMethod } from '../types/domain';

export function CartPage() {
  const {
    cart,
    products,
    campaigns,
    contractPrices,
    coupons,
    authUser,
    mobileSession,
    currency,
    customerGroup,
    settings,
    updateCartQty,
    removeFromCart,
    requestProforma,
    userProfile,
    pushToast,
  } = useStore();
  const { t, formatDigits, formatMoney } = useI18n();
  const navigate = useNavigate();

  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [proformaMobilePromptOpen, setProformaMobilePromptOpen] = useState(false);
  const [proformaMobileInput, setProformaMobileInput] = useState('');

  useEffect(() => {
    applySeoHead({
      title: `${t('nav.cart', 'سبد خرید')} | ${settings.storeNameFa}`,
      description: t('cart.seoDesc', 'مدیریت اقلام سبد خرید تجهیزات و مواد دندانپزشکی'),
      canonicalPath: '/cart',
      robots: 'noindex, follow',
    });
  }, [settings.storeNameFa, t]);

  const lines = useMemo(() => {
    return cart
      .map((ci) => {
        const product = products.find((p) => p.id === ci.productId);
        const variant = product?.variants.find((v) => v.id === ci.variantId);
        if (!product || !variant) return null;
        const resolved = resolveVariantPrice(product, variant, {
          customerGroup,
          quantity: ci.quantity,
          campaigns,
          settings,
          contractPrices,
          userId: authUser?.uid,
        });
        const unitPrice = resolved.unitPrice ?? 0;
        const originalUnit = resolved.originalPrice ?? unitPrice;
        return {
          ci,
          product,
          variant,
          resolved,
          unitPrice,
          lineTotal: unitPrice * ci.quantity,
          lineDiscount: Math.max(0, (originalUnit - unitPrice) * ci.quantity),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cart, products, customerGroup, campaigns, settings, contractPrices, authUser?.uid]);

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemDiscount = lines.reduce((sum, l) => sum + l.lineDiscount, 0);

  const activeCoupon = coupons.find(
    (c) => c.code.toUpperCase() === appliedCouponCode.toUpperCase() && c.isActive
  );
  let couponDiscount = 0;
  if (activeCoupon && subtotal >= activeCoupon.minOrderAmount) {
    if (activeCoupon.type === 'percent') {
      couponDiscount = Math.round((subtotal * activeCoupon.value) / 100);
      if (activeCoupon.maxDiscountAmount) {
        couponDiscount = Math.min(couponDiscount, activeCoupon.maxDiscountAmount);
      }
    } else if (activeCoupon.type === 'fixed') {
      couponDiscount = activeCoupon.value;
    }
  }

  const netSubtotal = Math.max(0, subtotal - couponDiscount);
  const taxTotal = Math.round((netSubtotal * settings.taxRatePercent) / 100);
  const freeShipping = netSubtotal >= settings.freeShippingThreshold || activeCoupon?.type === 'free_shipping';
  const remainingFree = Math.max(0, settings.freeShippingThreshold - netSubtotal);

  const complementaryProducts = useMemo(() => {
    const cartProductIds = new Set(lines.map((l) => l.product.id));
    const relatedIds = new Set(lines.flatMap((l) => l.product.complementaryIds ?? l.product.relatedIds ?? []));
    const matches = products.filter((p) => p.status === 'active' && !cartProductIds.has(p.id) && relatedIds.has(p.id));
    if (matches.length >= 2) return matches.slice(0, 4);
    return products.filter((p) => p.status === 'active' && !cartProductIds.has(p.id)).slice(0, 4);
  }, [lines, products]);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    const match = coupons.find((c) => c.code.toUpperCase() === code && c.isActive);
    if (!match) {
      pushToast(t('cart.toasts.invalidCoupon', 'کد تخفیف معتبر نیست یا منقضی شده است.'), 'error');
      return;
    }
    if (subtotal < match.minOrderAmount) {
      pushToast(
        t('cart.toasts.minOrderForCoupon', { amount: formatMoney(match.minOrderAmount, currency) }),
        'error'
      );
      return;
    }
    setAppliedCouponCode(match.code);
    pushToast(t('cart.toasts.couponApplied', { code: match.code }), 'success');
  };

  const submitProformaWithMobile = async (contactMobile: string) => {
    const orderItems: OrderItem[] = lines
      .filter((l) => l.unitPrice > 0)
      .map((l) => ({
        productId: l.product.id,
        variantId: l.variant.id,
        sku: l.variant.sku,
        titleFa: l.product.titleFa,
        variantLabelFa: l.variant.labelFa,
        quantity: l.ci.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.lineDiscount,
        lineTotal: l.lineTotal,
        priceSource: l.resolved.priceSource,
        batchNo: l.resolved.nearestBatchNo ?? undefined,
      }));
    if (orderItems.length === 0) return;
    const pf = await requestProforma({
      contactName: userProfile?.displayName || mobileSession?.displayName || t('common.clinicCustomer', 'مشتری کلینیک'),
      contactMobile,
      clinicName: userProfile?.clinicName,
      items: orderItems,
    });
    if (pf) {
      setProformaMobilePromptOpen(false);
      navigate(pf.shareToken ? `/proforma/${pf.shareToken}` : '/account');
    }
  };

  const handleRequestProformaFromCart = async () => {
    const knownMobile = (userProfile?.mobile || mobileSession?.mobile || '').trim();
    if (!/^09\d{9}$/.test(knownMobile)) {
      setProformaMobileInput(knownMobile);
      setProformaMobilePromptOpen(true);
      return;
    }
    await submitProformaWithMobile(knownMobile);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8 space-y-8 sm:space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-extrabold">{t('cart.pageTitle', 'سبد خرید شما')}</h1>
        <Link to="/category/consumables" className="text-sm font-bold text-brand hover:underline">
          {t('cart.continueShopping', 'ادامه خرید در کاتالوگ')}
        </Link>
      </div>

      {lines.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <ShoppingBag className="w-12 h-12 mx-auto text-ink/20 dark:text-slate-700" aria-hidden="true" />
          <p className="text-base font-bold">{t('cart.emptyTitle', 'سبد خرید شما خالی است.')}</p>
          <p className="text-sm text-ink/60 dark:text-slate-400">
            {t('cart.emptySubtitle', 'برای ثبت سفارش یا دریافت پیش‌فاکتور رسمی، محصولات مورد نیاز مطب را انتخاب کنید.')}
          </p>
          <Link
            to="/category/consumables"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
          >
            {t('cart.browseProducts', 'مشاهده محصولات فروشگاه')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
              {lines.map(({ ci, product, variant, resolved, unitPrice, lineTotal }) => (
                <div key={variant.id} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
                  <Link to={`/product/${product.slug}`} className="shrink-0">
                    <img
                      {...buildResponsiveImageProps(product.imageUrl, {
                        widths: [160, 320],
                        sizes: '112px',
                      })}
                      alt={product.titleFa}
                      width={112}
                      height={80}
                      className="w-24 sm:w-28 h-20 object-cover rounded-xl bg-surface border border-line dark:border-slate-800"
                    />
                  </Link>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Link to={`/product/${product.slug}`} className="text-base font-bold hover:text-brand line-clamp-1">
                      {product.titleFa}
                    </Link>
                    <p className="text-xs text-ink/60 dark:text-slate-400">
                      {variant.labelFa} · <span className="tabular-nums">{variant.sku}</span>
                      {resolved.nearestBatchNo ? ` · ${t('cart.batchPrefix', { batch: resolved.nearestBatchNo })}` : ''}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      {resolved.priceSource === 'contract'
                        ? t('cart.priceSource.contract', 'تعرفه قرارداد اختصاصی کلینیک')
                        : resolved.priceSource === 'tier'
                        ? t('cart.priceSource.tier', 'قیمت پلکانی عمده اعمال شد')
                        : resolved.priceSource === 'group'
                        ? t('cart.priceSource.group', 'تعرفه اختصاصی گروه همکار')
                        : resolved.priceSource === 'campaign'
                        ? t('cart.priceSource.campaign', 'تخفیف جشنواره فعال')
                        : resolved.nearExpiry
                        ? t('cart.priceSource.nearExpiry', 'تخفیف ویژه انقضای نزدیک')
                        : t('cart.priceSource.base', 'قیمت مصوب واحد')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4">
                    <div className="inline-flex items-center border border-line dark:border-slate-700 rounded-xl">
                      <button
                        type="button"
                        onClick={() => updateCartQty(variant.id, ci.quantity + 1)}
                        aria-label={t('cart.increaseQty', 'افزایش')}
                        className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center hover:bg-surface dark:hover:bg-slate-800"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-sm font-bold tabular-nums">{formatDigits(ci.quantity)}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(variant.id, ci.quantity - 1)}
                        aria-label={t('cart.decreaseQty', 'کاهش')}
                        className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center hover:bg-surface dark:hover:bg-slate-800"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-end min-w-0 sm:min-w-[120px]">
                      <p className="text-sm font-extrabold text-brand dark:text-teal-300 tabular-nums">
                        {unitPrice > 0 ? formatMoney(lineTotal, currency) : t('cart.callForQuote', 'استعلام قیمت')}
                      </p>
                      <p className="text-[11px] text-ink/50 dark:text-slate-400 tabular-nums">
                        {t('cart.unitPricePrefix', { price: formatMoney(unitPrice, currency) })}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(variant.id)}
                      aria-label={t('cart.removeItem', 'حذف کالا')}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center text-ink/40 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleApplyCoupon}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-3"
            >
              <Tag className="w-4 h-4 text-brand shrink-0 hidden sm:block" aria-hidden="true" />
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder={t('cart.couponPlaceholder', 'کد تخفیف (مثلاً CLINIC5 یا FREESHIP)...')}
                className="w-full sm:flex-1 min-h-[44px] px-3.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
              />
              <button
                type="submit"
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg bg-surface dark:bg-slate-800 text-sm font-bold hover:bg-brand hover:text-white transition-colors whitespace-nowrap"
              >
                {t('cart.applyCouponBtn', 'اعمال کد تخفیف')}
              </button>
            </form>
          </div>

          <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 lg:sticky lg:top-20">
            <h2 className="text-lg font-extrabold">{t('cart.summaryTitle', 'خلاصه صورتحساب')}</h2>

            <div className="p-3 rounded-xl bg-surface/80 dark:bg-slate-800/70 text-xs flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
              {freeShipping ? (
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {t('cart.freeShippingReached', 'ارسال این سفارش رایگان است.')}
                </span>
              ) : (
                <span>
                  <strong className="tabular-nums">{formatMoney(remainingFree, currency)}</strong>{' '}
                  {t('cart.untilFreeShipping', 'تا ارسال رایگان تهران')}
                </span>
              )}
            </div>

            <div className="space-y-2.5 text-sm border-b border-line dark:border-slate-800 pb-4">
              <div className="flex justify-between">
                <span className="text-ink/70 dark:text-slate-400">{t('cart.itemsTotal', 'جمع کالاها')}</span>
                <span className="font-bold tabular-nums">{formatMoney(subtotal + itemDiscount, currency)}</span>
              </div>
              {itemDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t('cart.tierCampaignDiscount', 'تخفیف پلکانی / همکار / جشنواره')}</span>
                  <span className="font-bold tabular-nums">−{formatMoney(itemDiscount, currency)}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t('cart.couponCodeLabel', { code: appliedCouponCode })}</span>
                  <span className="font-bold tabular-nums">−{formatMoney(couponDiscount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink/70 dark:text-slate-400">
                  {t('cart.vatWithPercent', { rate: formatDigits(settings.taxRatePercent) })}
                </span>
                <span className="font-bold tabular-nums">{formatMoney(taxTotal, currency)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-base">
              <span className="font-extrabold">{t('cart.payableAmount', 'مبلغ قابل پرداخت')}</span>
              <span className="text-xl font-extrabold text-brand dark:text-teal-300 tabular-nums">
                {formatMoney(netSubtotal + taxTotal, currency)}
              </span>
            </div>

            <div className="space-y-2.5">
              <Link
                to={`/checkout${appliedCouponCode ? `?coupon=${encodeURIComponent(appliedCouponCode)}` : ''}`}
                className="flex items-center justify-center w-full min-h-[44px] py-3 rounded-xl bg-brand text-white text-center text-sm font-bold hover:bg-brandDark transition-colors"
              >
                {t('cart.proceedCheckoutBtn', 'ادامه و ثبت نهایی سفارش')}
              </Link>
              <button
                type="button"
                onClick={handleRequestProformaFromCart}
                className="w-full min-h-[44px] py-2.5 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand transition-colors"
              >
                {t('cart.issueCartProformaBtn', 'صدور پیش‌فاکتور رسمی برای این سبد')}
              </button>
            </div>
          </aside>
        </div>
      )}

      {complementaryProducts.length > 0 && (
        <section className="space-y-5 pt-4">
          <h2 className="text-xl font-extrabold">{t('cart.complementaryHeading', 'محصولات مکمل پیشنهادی')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {complementaryProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <AccessibleModal
        open={proformaMobilePromptOpen}
        onClose={() => setProformaMobilePromptOpen(false)}
        ariaLabel={t('cart.proformaModalTitle', 'شماره تماس برای صدور پیش‌فاکتور رسمی')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto text-xs"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^09\d{9}$/.test(proformaMobileInput.trim())) {
              pushToast(
                t('cart.toasts.invalidMobile', 'لطفاً شماره موبایل معتبر ۱۱ رقمی (با شروع 09) وارد کنید.'),
                'error'
              );
              return;
            }
            await submitProformaWithMobile(proformaMobileInput.trim());
          }}
          className="space-y-4"
        >
          <h2 className="text-base font-extrabold">{t('cart.proformaModalTitle', 'شماره تماس برای صدور پیش‌فاکتور رسمی')}</h2>
          <p className="text-ink/70 dark:text-slate-400">
            {t('cart.proformaModalDesc', 'برای ثبت پیش‌فاکتور رسمی در سامانه، وارد کردن شماره موبایل واقعی خریدار الزامی است.')}
          </p>
          <input
            required
            type="tel"
            value={proformaMobileInput}
            onChange={(e) => setProformaMobileInput(e.target.value)}
            placeholder="0912..."
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setProformaMobilePromptOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
            >
              {t('actions.cancel', 'انصراف')}
            </button>
            <button type="submit" className="min-h-[44px] px-5 py-2 rounded-xl bg-brand text-white font-bold">
              {t('cart.proformaModalSubmit', 'تایید و صدور پیش‌فاکتور')}
            </button>
          </div>
        </form>
      </AccessibleModal>
    </div>
  );
}

const SHIPPING_OPTIONS_BASE = [
  { id: 'courier_tehran', baseFee: 120000 },
  { id: 'tipax', baseFee: 185000 },
  { id: 'post_pishtaz', baseFee: 145000 },
  { id: 'heavy_freight', baseFee: 0 },
];

export function CheckoutPage() {
  const {
    cart,
    products,
    campaigns,
    contractPrices,
    coupons,
    currency,
    customerGroup,
    settings,
    authUser,
    mobileSession,
    userProfile,
    signInWithGoogle,
    sendMobileOtp,
    verifyMobileOtp,
    placeOrder,
    verifyOnlinePayment,
    fetchOrderPaymentStatus,
    pushToast,
  } = useStore();
  const { t, formatDigits, formatMoney, formatDateTime } = useI18n();

  const shippingOptions = useMemo(
    () =>
      SHIPPING_OPTIONS_BASE.map((opt) => ({
        ...opt,
        label: t(`checkout.shippingOptions.${opt.id}`),
      })),
    [t]
  );

  const [searchParams] = useSearchParams();
  const initialCoupon = searchParams.get('coupon') ?? '';
  const paymentCallbackParam = searchParams.get('paymentCallback');
  const callbackOrderId = searchParams.get('orderId') ?? '';
  const callbackAuthority = searchParams.get('Authority') || searchParams.get('authority') || searchParams.get('id') || '';
  const callbackRawStatus = searchParams.get('Status') || searchParams.get('status') || '';
  const callbackRefIdParam = searchParams.get('refId') ?? '';
  const callbackMessageParam = searchParams.get('message') ?? '';

  const [customerName, setCustomerName] = useState(userProfile?.displayName || authUser?.displayName || '');
  const [customerMobile, setCustomerMobile] = useState(userProfile?.mobile || '');
  const [province, setProvince] = useState(userProfile?.addresses?.[0]?.province || t('common.tehran', 'تهران'));
  const [city, setCity] = useState(userProfile?.addresses?.[0]?.city || t('common.tehran', 'تهران'));
  const [postalCode, setPostalCode] = useState(userProfile?.addresses?.[0]?.postalCode || '');
  const [addressLine, setAddressLine] = useState(userProfile?.addresses?.[0]?.addressLine || '');
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_OPTIONS_BASE[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');
  const [gatewayName, setGatewayName] = useState<'zarinpal' | 'idpay'>('zarinpal');
  const [installmentsCount, setInstallmentsCount] = useState(3);
  const [proposedTermsFa, setProposedTermsFa] = useState(() =>
    t('checkout.defaultProposedTerms', 'پیش‌پرداخت ۳۰ درصد + ۳ فقره چک صیادی ماهانه')
  );
  const [couponCode, setCouponCode] = useState(initialCoupon);
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Mobile OTP verification (optional quick verify for guest/checkout)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifiedToken, setOtpVerifiedToken] = useState('');
  const [otpHint, setOtpHint] = useState('');

  // Server calculation verification
  const [serverTotals, setServerTotals] = useState<{
    subtotal: number;
    couponDiscount: number;
    shippingTotal: number;
    taxTotal: number;
    grandTotal: number;
  } | null>(null);

  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [gatewayModalOpen, setGatewayModalOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [callbackState, setCallbackState] = useState<{
    loading: boolean;
    paid: boolean;
    order?: Order;
    refId?: string;
    gateway?: string;
    verifiedAt?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    applySeoHead({
      title: `${t('checkout.seoTitle', 'تسویه‌حساب و ثبت سفارش')} | ${settings.storeNameFa}`,
      description: t('checkout.seoDesc', 'تکمیل اطلاعات ارسال و پرداخت سفارش در دنتال‌مارکت'),
      canonicalPath: '/checkout',
      robots: 'noindex, nofollow',
    });
  }, [settings.storeNameFa, t]);

  useEffect(() => {
    if (paymentCallbackParam !== '1' || !callbackOrderId) {
      setCallbackState(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setCallbackState({ loading: true, paid: false });
      if (callbackAuthority && callbackRawStatus !== 'success' && callbackRawStatus !== 'failed') {
        const cbQs = new URLSearchParams({
          orderId: callbackOrderId,
          Authority: callbackAuthority,
          Status: callbackRawStatus || 'OK',
          format: 'json',
        });
        await fetch(`/api/payments/callback?${cbQs.toString()}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }).catch(() => null);
      }
      const statusRes = await fetchOrderPaymentStatus(callbackOrderId);
      if (cancelled) return;
      if (!statusRes.ok) {
        setCallbackState({
          loading: false,
          paid: false,
          refId: callbackRefIdParam || undefined,
          message:
            callbackMessageParam ||
            statusRes.message ||
            t('checkout.callbackVerifyFailed', 'تایید وضعیت پرداخت از سرور ناموفق بود.'),
        });
        return;
      }
      setCallbackState({
        loading: false,
        paid: statusRes.paid,
        order: statusRes.order,
        refId: statusRes.refId || callbackRefIdParam || undefined,
        gateway: statusRes.gateway,
        verifiedAt: statusRes.verifiedAt,
        message: statusRes.paid
          ? undefined
          : callbackMessageParam ||
            t('checkout.callbackUnverifiedMsg', 'پرداخت تایید نشد یا لغو گردید. در صورت کسر وجه، تا ۷۲ ساعت به حساب شما بازمی‌گردد.'),
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [paymentCallbackParam, callbackOrderId, callbackAuthority, callbackRawStatus, callbackRefIdParam, callbackMessageParam, fetchOrderPaymentStatus, t]);

  useEffect(() => {
    if (cart.length > 0) {
      trackEcommerceEvent('begin_checkout', { item_count: cart.length });
    }
  }, [cart.length]);

  useEffect(() => {
    if (userProfile) {
      if (!customerName && userProfile.displayName) setCustomerName(userProfile.displayName);
      if (!customerMobile && userProfile.mobile) setCustomerMobile(userProfile.mobile);
      const def = userProfile.addresses?.find((a) => a.isDefault) ?? userProfile.addresses?.[0];
      if (def && !addressLine) {
        setProvince(def.province);
        setCity(def.city);
        setPostalCode(def.postalCode);
        setAddressLine(def.addressLine);
      }
    }
  }, [userProfile]);

  useEffect(() => {
    if (mobileSession) {
      if (!customerMobile) setCustomerMobile(mobileSession.mobile);
      if (!customerName && mobileSession.displayName) setCustomerName(mobileSession.displayName);
    }
  }, [mobileSession]);

  const resolvedCartLines = useMemo(() => {
    return cart
      .map((ci) => {
        const p = products.find((x) => x.id === ci.productId);
        const v = p?.variants.find((x) => x.id === ci.variantId);
        if (!p || !v) return null;
        const res = resolveVariantPrice(p, v, {
          customerGroup,
          quantity: ci.quantity,
          campaigns,
          settings,
          contractPrices,
          userId: authUser?.uid,
        });
        return { unitPrice: res.unitPrice ?? 0, quantity: ci.quantity };
      })
      .filter((x): x is { unitPrice: number; quantity: number } => x !== null);
  }, [cart, products, customerGroup, campaigns, settings, contractPrices, authUser?.uid]);

  const subtotal = useMemo(
    () => resolvedCartLines.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [resolvedCartLines]
  );

  const activeCoupon = coupons.find((c) => c.code.toUpperCase() === couponCode.trim().toUpperCase() && c.isActive);
  let couponDiscount = 0;
  if (activeCoupon && subtotal >= activeCoupon.minOrderAmount) {
    if (activeCoupon.type === 'percent') {
      couponDiscount = Math.round((subtotal * activeCoupon.value) / 100);
      if (activeCoupon.maxDiscountAmount) couponDiscount = Math.min(couponDiscount, activeCoupon.maxDiscountAmount);
    } else if (activeCoupon.type === 'fixed') {
      couponDiscount = activeCoupon.value;
    }
  }

  const chosenShipping = shippingOptions.find((s) => s.id === shippingMethod) ?? shippingOptions[0];
  const isFreeShipping =
    subtotal - couponDiscount >= settings.freeShippingThreshold || activeCoupon?.type === 'free_shipping';
  const shippingFee = isFreeShipping ? 0 : chosenShipping.baseFee;
  const taxTotal = Math.round(((Math.max(0, subtotal - couponDiscount) * settings.taxRatePercent)) / 100);
  const grandTotal = Math.max(0, subtotal - couponDiscount) + shippingFee + taxTotal;

  // Authoritative server-side total recalculation
  useEffect(() => {
    if (cart.length === 0) {
      setServerTotals(null);
      return;
    }
    const ctrl = new AbortController();
    fetch('/api/checkout/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        items: cart,
        customerGroup,
        couponCode,
        shippingMethod,
        userId: authUser?.uid,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok && typeof data.grandTotal === 'number') setServerTotals(data);
      })
      .catch(() => {
        // Offline / fallback already computed above
      });
    return () => ctrl.abort();
  }, [cart, customerGroup, couponCode, shippingMethod, authUser?.uid]);

  const handleSendOtp = async () => {
    const mobile = customerMobile.trim();
    if (!mobile) {
      pushToast(t('checkout.toasts.enterMobileFirst', 'ابتدا شماره موبایل خود را وارد کنید.'), 'error');
      return;
    }
    const res = await sendMobileOtp(mobile);
    if (!res.ok) return;
    setOtpSent(true);
    setOtpHint(
      res.sandboxCode
        ? t('checkout.sandboxCodeHint', { code: res.sandboxCode })
        : res.message || ''
    );
  };

  const handleVerifyOtp = async () => {
    const res = await verifyMobileOtp(customerMobile.trim(), otpCode.trim(), customerName.trim() || undefined);
    if (!res.ok) return;
    setOtpVerified(true);
    setOtpVerifiedToken(res.verifiedToken || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerMobile.trim() || !addressLine.trim()) {
      pushToast(
        t('checkout.toasts.requiredContactAddress', 'لطفاً نام تحویل‌گیرنده، شماره همراه و نشانی دقیق را وارد کنید.'),
        'error'
      );
      return;
    }

    setSubmitting(true);
    try {
      const order = await placeOrder({
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        shippingMethod: chosenShipping.label,
        shippingMethodId: shippingMethod,
        shippingTotal: serverTotals?.shippingTotal ?? shippingFee,
        address: { province, city, postalCode: postalCode || '1417933111', addressLine },
        paymentMethod,
        couponCode: activeCoupon?.code,
        customerNote: customerNote.trim() || undefined,
        installmentsCount,
        proposedTermsFa,
        verifiedToken: otpVerifiedToken || undefined,
      });
      if (order) {
        setCreatedOrder(order);
        if (paymentMethod === 'online') {
          setGatewayModalOpen(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!createdOrder) return;
    setVerifying(true);
    try {
      const ok = await verifyOnlinePayment(createdOrder.id, gatewayName);
      if (ok) {
        setCreatedOrder({ ...createdOrder, status: 'paid', paymentStatus: 'paid' });
        setGatewayModalOpen(false);
      }
    } finally {
      setVerifying(false);
    }
  };

  const gatewayLabel =
    gatewayName === 'zarinpal'
      ? t('checkout.gateways.zarinpal', 'زرین‌پال')
      : t('checkout.gateways.idpay', 'آی‌دی‌پی');

  if (paymentCallbackParam === '1' && callbackOrderId && callbackState) {
    return (
      <div data-testid="payment-callback-receipt" className="max-w-2xl mx-auto px-3 sm:px-4 py-8 sm:py-12 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-5">
          {callbackState.loading ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-base font-extrabold">{t('checkout.callbackLoadingTitle', 'در حال استعلام قطعی وضعیت تراکنش از سرور...')}</p>
              <p className="text-xs text-ink/60">{t('checkout.callbackLoadingHint', 'لطفاً تا دریافت تاییدیه بانکی صفحه را نبندید.')}</p>
            </div>
          ) : callbackState.paid ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-9 h-9 text-emerald-600 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {t('checkout.callbackSuccessTitle', 'پرداخت با موفقیت تایید و ثبت شد')}
                  </h1>
                  <p className="text-xs text-ink/60 dark:text-slate-400 mt-1">
                    {callbackState.verifiedAt
                      ? t('checkout.callbackVerifiedAt', { time: formatDateTime(callbackState.verifiedAt) })
                      : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-4 rounded-xl bg-surface/60 dark:bg-slate-800/60">
                <div>
                  <span className="text-ink/50 block">{t('checkout.receiptOrderNo', 'شماره سفارش')}</span>
                  <strong className="mt-1 block tabular-nums">{callbackState.order?.orderNo || callbackOrderId}</strong>
                </div>
                <div>
                  <span className="text-ink/50 block">{t('checkout.receiptRefId', 'کد رهگیری پرداخت')}</span>
                  <strong className="mt-1 block font-mono break-all">{callbackState.refId || t('checkout.recordedBadge', 'ثبت‌شده')}</strong>
                </div>
                <div>
                  <span className="text-ink/50 block">{t('checkout.receiptGateway', 'درگاه')}</span>
                  <strong className="mt-1 block">{callbackState.gateway || t('checkout.bankGatewayFallback', 'بانکی')}</strong>
                </div>
                <div>
                  <span className="text-ink/50 block">{t('checkout.receiptAmount', 'مبلغ پرداختی')}</span>
                  <strong className="mt-1 block tabular-nums text-brand">
                    {callbackState.order ? formatMoney(callbackState.order.grandTotal, currency) : '—'}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-9 h-9 text-rose-600 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-extrabold text-rose-700 dark:text-rose-400">
                    {t('checkout.callbackFailedTitle', 'پرداخت تایید نشد یا ناتمام ماند')}
                  </h1>
                  <p className="text-xs text-ink/65 dark:text-slate-400 mt-1">
                    {callbackState.message || t('checkout.callbackFailedDefault', 'تراکنش توسط درگاه تایید نگردید.')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void verifyOnlinePayment(callbackOrderId, gatewayName)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
                >
                  {t('checkout.retryOnlinePayBtn', 'تلاش مجدد برای پرداخت آنلاین')}
                </button>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-line dark:border-slate-800">
            <Link to="/account" className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
              {t('checkout.viewOrderInAccount', 'مشاهده سفارش در حساب کاربری')}
            </Link>
            <Link to="/" className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 text-sm font-bold">
              {t('product.backToStore', 'بازگشت به فروشگاه')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (createdOrder) {
    return (
      <div data-testid="order-success-card" className="max-w-3xl mx-auto px-3 sm:px-4 py-8 sm:py-12 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold">
                {t('checkout.orderCreatedPrefix', 'سفارش با شماره')}{' '}
                <span data-testid="order-success-number" className="tabular-nums text-brand">{createdOrder.orderNo}</span>{' '}
                {t('checkout.orderCreatedSuffix', 'ثبت شد')}
              </h1>
              <p className="text-xs text-ink/60 dark:text-slate-400 mt-1">
                {t('checkout.createdAtLabel', { time: formatDateTime(createdOrder.createdAt) })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-4 rounded-xl bg-surface/60 dark:bg-slate-800/60">
            <div>
              <span className="text-ink/50 block">{t('checkout.orderStatusLabel', 'وضعیت سفارش')}</span>
              <strong data-testid="order-success-status" className="mt-1 block">
                {createdOrder.status === 'paid'
                  ? t('checkout.orderSuccessPaidStatus', 'پرداخت‌شده و آماده پردازش')
                  : createdOrder.status === 'awaiting_review'
                  ? t('checkout.orderSuccessAwaitingReview', 'در انتظار بررسی واحد اعتبار')
                  : t('orderStatus.pending_payment', 'در انتظار پرداخت')}
              </strong>
            </div>
            <div>
              <span className="text-ink/50 block">{t('checkout.paymentMethodCol', 'روش پرداخت')}</span>
              <strong className="mt-1 block">{createdOrder.paymentMethod}</strong>
            </div>
            <div>
              <span className="text-ink/50 block">{t('checkout.shippingCol', 'ارسال')}</span>
              <strong className="mt-1 block">{createdOrder.shippingAddress.city}</strong>
            </div>
            <div>
              <span className="text-ink/50 block">{t('checkout.totalAmountCol', 'مبلغ کل')}</span>
              <strong className="mt-1 block tabular-nums text-brand">{formatMoney(createdOrder.grandTotal, currency)}</strong>
            </div>
          </div>

          {createdOrder.userId === 'guest' && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
              {t('checkout.guestTrackingNotice', {
                orderNo: createdOrder.orderNo,
                mobile: createdOrder.customerMobile,
              })}
            </div>
          )}

          {createdOrder.status === 'pending_payment' && createdOrder.paymentMethod === 'online' && (
            <button
              type="button"
              onClick={() => setGatewayModalOpen(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              {t('checkout.completeOnlinePaymentBtn', { gateway: gatewayLabel })}
            </button>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link to="/account" className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
              {t('checkout.trackInAccountOrGuest', 'پیگیری در حساب کاربری / سفارش مهمان')}
            </Link>
            <Link to="/" className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 text-sm font-bold">
              {t('product.backToStore', 'بازگشت به فروشگاه')}
            </Link>
          </div>
        </div>

        <AccessibleModal
          open={gatewayModalOpen}
          onClose={() => setGatewayModalOpen(false)}
          ariaLabel={t('checkout.sandboxGatewayTitle', { gateway: gatewayLabel })}
          panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck className="w-6 h-6 shrink-0" />
            <h2 className="text-base sm:text-lg font-extrabold">
              {t('checkout.sandboxGatewayTitle', { gateway: gatewayLabel })}
            </h2>
          </div>
          <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed">
            {t('checkout.sandboxGatewayDesc', 'حالت آزمایشی (Demo / Sandbox): پرداخت آنلاین با تایید قطعی سمت سرور و کلید یکتای تراکنش انجام می‌شود. مبلغ قابل پرداخت:')}
          </p>
          <p className="text-2xl font-extrabold text-brand tabular-nums text-center py-3 bg-surface/60 dark:bg-slate-800 rounded-xl">
            {formatMoney(createdOrder.grandTotal, currency)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={verifying}
              data-testid="sandbox-verify-payment-button"
              onClick={handleVerifyPayment}
              className="min-h-[44px] py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              {verifying
                ? t('checkout.verifyingBtn', 'در حال استعلام تایید...')
                : t('checkout.sandboxPaySuccessBtn', 'پرداخت موفق و Verify')}
            </button>
            <button
              type="button"
              onClick={() => setGatewayModalOpen(false)}
              className="min-h-[44px] py-2.5 rounded-xl border border-line dark:border-slate-700 text-sm font-bold"
            >
              {t('actions.cancel', 'انصراف')}
            </button>
          </div>
        </AccessibleModal>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8 space-y-6">
      <h1 className="text-xl sm:text-2xl font-extrabold">{t('checkout.pageTitle', 'تکمیل اطلاعات و تسویه‌حساب')}</h1>

      {!authUser && (
        <div className="bg-surface/60 dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-sm text-ink dark:text-slate-100">
              {t('checkout.guestBannerTitle', 'امکان خرید به‌صورت مهمان (بدون نیاز به ورود) فعال است.')}
            </p>
            <p className="text-xs text-ink/65 dark:text-slate-400 mt-0.5">
              {t('checkout.guestBannerSub', 'در صورت تمایل به اعمال تعرفه همکار (B2B) یا ذخیره دائمی سفارش‌ها، با گوگل وارد شوید.')}
            </p>
          </div>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
          >
            {t('actions.signInGoogle', 'ورود با حساب گوگل')}
          </button>
        </div>
      )}

      {cart.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center space-y-3">
          <p className="font-bold">{t('cart.emptyTitle', 'سبد خرید شما خالی است.')}</p>
          <Link to="/category/consumables" className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
            {t('actions.viewProducts', 'مشاهده محصولات')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            {/* Address */}
            <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-extrabold">{t('checkout.step1Title', '۱. مشخصات تحویل‌گیرنده و نشانی مطب / کلینیک')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs space-y-1.5">
                  <span className="font-bold">{t('checkout.fullNameLabel', 'نام و نام خانوادگی *')}</span>
                  <input
                    required
                    type="text"
                    data-testid="checkout-name-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                  />
                </label>
                <div className="text-xs space-y-1.5">
                  <span className="font-bold block">{t('checkout.mobileLabel', 'شماره همراه *')}</span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      required
                      type="tel"
                      data-testid="checkout-mobile-input"
                      value={customerMobile}
                      onChange={(e) => {
                        setCustomerMobile(e.target.value);
                        setOtpVerified(false);
                        setOtpVerifiedToken('');
                      }}
                      placeholder="0912..."
                      className="w-full sm:flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-2 rounded-xl border border-brand text-brand text-xs font-bold shrink-0 whitespace-nowrap"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>
                        {otpVerified || (mobileSession && mobileSession.mobile === customerMobile)
                          ? t('checkout.otpVerifiedBadge', 'تایید شد')
                          : t('checkout.sendOtpShort', 'ارسال کد OTP')}
                      </span>
                    </button>
                  </div>
                  {otpSent && !otpVerified && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder={t('checkout.otpCodePlaceholder', 'کد تایید ۶ رقمی')}
                        className="w-full sm:w-40 min-h-[44px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold whitespace-nowrap"
                      >
                        {t('checkout.verifyOtpBtn', 'تایید کد')}
                      </button>
                      {otpHint && <span className="text-[11px] text-ink/60">{otpHint}</span>}
                    </div>
                  )}
                </div>
                <label className="text-xs space-y-1.5">
                  <span className="font-bold">{t('checkout.provinceLabel', 'استان *')}</span>
                  <input
                    required
                    type="text"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                  />
                </label>
                <label className="text-xs space-y-1.5">
                  <span className="font-bold">{t('checkout.cityLabel', 'شهر *')}</span>
                  <input
                    required
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                  />
                </label>
                <label className="text-xs space-y-1.5">
                  <span className="font-bold">{t('checkout.postalCodeLabel', 'کد پستی ۱۰ رقمی')}</span>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                  />
                </label>
                <label className="text-xs space-y-1.5 sm:col-span-2">
                  <span className="font-bold">{t('checkout.addressLineLabel', 'نشانی دقیق پستی *')}</span>
                  <textarea
                    required
                    rows={2}
                    data-testid="checkout-address-input"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                  />
                </label>
              </div>
            </section>

            {/* Shipping Method */}
            <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-extrabold">{t('checkout.step2Title', '۲. روش ارسال مرسوله')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shippingOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`p-4 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      shippingMethod === opt.id
                        ? 'border-brand bg-brand/5'
                        : 'border-line dark:border-slate-700 hover:border-brand/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="shippingMethod"
                      checked={shippingMethod === opt.id}
                      onChange={() => setShippingMethod(opt.id)}
                      className="mt-1"
                    />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm">{opt.label}</p>
                      <p className="text-ink/60 dark:text-slate-400 tabular-nums">
                        {isFreeShipping || opt.baseFee === 0
                          ? t('checkout.freeOrNegotiated', 'رایگان / توافقی')
                          : formatMoney(opt.baseFee, currency)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Payment Method */}
            <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-extrabold">{t('checkout.step3Title', '۳. شیوه پرداخت و تسویه')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['online', 'bank_transfer', 'cash_on_delivery', 'credit_request', 'cheque_request', 'installment_request'] as PaymentMethod[]).map((methodId) => (
                  <label
                    key={methodId}
                    className={`p-4 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      paymentMethod === methodId
                        ? 'border-brand bg-brand/5'
                        : 'border-line dark:border-slate-700 hover:border-brand/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === methodId}
                      onChange={() => setPaymentMethod(methodId)}
                      className="mt-1"
                    />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm">{t(`checkout.paymentMethods.${methodId}.label`)}</p>
                      <p className="text-ink/60 dark:text-slate-400">{t(`checkout.paymentMethods.${methodId}.sub`)}</p>
                    </div>
                  </label>
                ))}
              </div>

              {paymentMethod === 'online' && (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <span className="text-xs font-bold">{t('checkout.chooseGatewayLabel', 'انتخاب درگاه:')}</span>
                  {(['zarinpal', 'idpay'] as const).map((gw) => (
                    <button
                      key={gw}
                      type="button"
                      onClick={() => setGatewayName(gw)}
                      className={`min-h-[40px] px-4 py-1.5 rounded-lg border text-xs font-bold ${
                        gatewayName === gw ? 'border-brand bg-brand text-white' : 'border-line dark:border-slate-700'
                      }`}
                    >
                      {gw === 'zarinpal' ? t('checkout.gateways.zarinpal', 'زرین‌پال') : t('checkout.gateways.idpay', 'آی‌دی‌پی')}
                    </button>
                  ))}
                </div>
              )}

              {(paymentMethod === 'credit_request' ||
                paymentMethod === 'cheque_request' ||
                paymentMethod === 'installment_request') && (
                <div className="p-4 rounded-xl bg-surface/70 dark:bg-slate-800/70 space-y-3">
                  <p className="text-xs font-bold text-brand dark:text-teal-300">
                    {t('checkout.creditReviewNotice', 'توجه: این گزینه یک درخواست بررسی اعتباری / اقساطی ثبت می‌کند و تایید نهایی منوط به بررسی واحد مالی است.')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs space-y-1">
                      <span className="font-bold">{t('checkout.installmentsCountLabel', 'تعداد قسط / چک')}</span>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={installmentsCount}
                        onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-xs space-y-1 sm:col-span-2">
                      <span className="font-bold">{t('checkout.proposedTermsLabel', 'شرایط پیشنهادی پرداخت')}</span>
                      <input
                        type="text"
                        value={proposedTermsFa}
                        onChange={(e) => setProposedTermsFa(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </label>
                  </div>
                </div>
              )}

              <label className="block text-xs space-y-1.5 pt-2">
                <span className="font-bold">{t('checkout.customerNoteLabel', 'توضیحات تکمیلی سفارش یا اطلاعات فاکتور رسمی حقوقی')}</span>
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder={t('checkout.customerNotePh', 'در صورت نیاز به فاکتور رسمی شرکتی، شناسه ملی و کد اقتصادی را قید فرمایید...')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                />
              </label>
            </section>
          </div>

          <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 lg:sticky lg:top-20">
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand" aria-hidden="true" />
              <span>{t('checkout.financialReviewTitle', 'مرور مالی سفارش')}</span>
            </h2>

            <div className="space-y-2 text-xs">
              <label className="block space-y-1">
                <span className="font-bold">{t('checkout.couponLabel', 'کد تخفیف')}</span>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder={t('common.optionalPlaceholder', 'اختیاری...')}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
            </div>

            <div className="space-y-2 text-sm border-y border-line dark:border-slate-800 py-4">
              <div className="flex justify-between">
                <span className="text-ink/70 dark:text-slate-400">
                  {t('checkout.itemsCountTotal', { count: formatDigits(cart.length) })}
                </span>
                <span className="font-bold tabular-nums">{formatMoney(serverTotals?.subtotal ?? subtotal, currency)}</span>
              </div>
              {(serverTotals?.couponDiscount ?? couponDiscount) > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t('checkout.couponDiscountLabel', 'تخفیف کد')}</span>
                  <span className="font-bold tabular-nums">
                    −{formatMoney(serverTotals?.couponDiscount ?? couponDiscount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink/70 dark:text-slate-400">{t('checkout.shippingFeeLabel', 'هزینه ارسال')}</span>
                <span className="font-bold tabular-nums">
                  {(serverTotals?.shippingTotal ?? shippingFee) === 0
                    ? t('common.free', 'رایگان')
                    : formatMoney(serverTotals?.shippingTotal ?? shippingFee, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/70 dark:text-slate-400">
                  {t('checkout.taxWithPercent', { rate: formatDigits(settings.taxRatePercent) })}
                </span>
                <span className="font-bold tabular-nums">{formatMoney(serverTotals?.taxTotal ?? taxTotal, currency)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="font-extrabold">{t('checkout.grandTotalLabel', 'جمع نهایی')}</span>
              <span className="text-xl font-extrabold text-brand dark:text-teal-300 tabular-nums">
                {formatMoney(serverTotals?.grandTotal ?? grandTotal, currency)}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="checkout-submit-button"
              className="w-full min-h-[44px] py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark disabled:opacity-50 transition-colors"
            >
              {submitting
                ? t('checkout.submittingBtn', 'در حال ثبت سفارش...')
                : t('checkout.submitOrderBtn', 'تایید و ثبت نهایی سفارش')}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
}
