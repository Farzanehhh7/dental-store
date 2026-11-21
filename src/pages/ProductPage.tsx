import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileText,
  GitCompareArrows,
  Heart,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  ZoomIn,
  X,
} from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import CountdownTimer from '../components/store/CountdownTimer';
import { useStore } from '../context/StoreContext';
import { trackEcommerceEvent } from '../lib/analytics';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../lib/jalali';
import { buildResponsiveImageProps } from '../lib/media';
import { resolveVariantPrice } from '../lib/pricing';
import { applySeoHead, buildBreadcrumbJsonLd, buildFaqJsonLd, buildProductJsonLd } from '../lib/seo';

export default function ProductPage() {
  const { slug } = useParams();
  const {
    products,
    categories,
    brands,
    attributes,
    campaigns,
    contractPrices,
    reviews,
    questions,
    recentlyViewedIds,
    currency,
    customerGroup,
    settings,
    addToCart,
    wishlistIds,
    toggleWishlist,
    compareIds,
    toggleCompare,
    markViewed,
    requestProforma,
    submitConsultation,
    submitStockNotification,
    submitReview,
    submitQuestion,
    submitRfq,
    authUser,
    mobileSession,
    userProfile,
    pushToast,
  } = useStore();

  const product = products.find((p) => p.slug === slug);
  const brand = brands.find((b) => b.id === product?.brandId);
  const category = categories.find((c) => c.id === product?.primaryCategoryId);

  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Modals & Forms
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultForm, setConsultForm] = useState({ name: '', mobile: '', clinicName: '', budgetRange: '', message: '' });
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqForm, setRfqForm] = useState({
    customerName: '',
    customerMobile: '',
    clinicName: '',
    quantity: 5,
    targetUnitPrice: '',
    note: '',
  });
  const [notifyMobile, setNotifyMobile] = useState('');
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', body: '' });
  const [questionText, setQuestionText] = useState('');

  useEffect(() => {
    if (product) {
      const def = product.variants.find((v) => v.isDefault) ?? product.variants[0];
      setSelectedVariantId(def?.id ?? '');
      setActiveImage(product.imageUrl);
      setShowVideo(false);
      setQty(product.minOrderQty || 1);
      markViewed(product.id);
      trackEcommerceEvent('view_item', {
        item_id: product.id,
        item_name: product.titleFa,
        sku: product.sku,
      });
    }
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      ...(category ? [{ name: category.nameFa, path: `/category/${category.slug}` }] : []),
      { name: product.titleFa, path: `/product/${product.slug}` },
    ];
    const faqLd = product.faqs?.length ? buildFaqJsonLd(product.faqs) : null;
    const jsonLdList: Record<string, unknown>[] = [
      buildBreadcrumbJsonLd(breadcrumbs),
      buildProductJsonLd(product, brand, campaigns, settings, attributes),
    ];
    if (faqLd) jsonLdList.push(faqLd);

    applySeoHead({
      title: product.metaTitle || `${product.titleFa} | ${brand?.nameFa ?? ''} | ${settings.storeNameFa}`,
      description: product.metaDescription || product.shortDescriptionFa,
      canonicalPath: `/product/${product.slug}`,
      robots: product.status === 'active' || product.status === 'out_of_stock' ? 'index, follow' : 'noindex, follow',
      ogType: 'product',
      ogImage: product.imageUrl,
      jsonLd: jsonLdList,
    });
  }, [product, brand, category, campaigns, settings, attributes]);

  const variant = useMemo(() => {
    if (!product) return undefined;
    return product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0];
  }, [product, selectedVariantId]);

  const recentProducts = useMemo(() => {
    return recentlyViewedIds
      .filter((id) => id !== product?.id)
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 4);
  }, [recentlyViewedIds, products, product?.id]);

  if (!product || !variant) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-extrabold">محصول مورد نظر یافت نشد</h1>
        <Link to="/" className="inline-block px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold">
          بازگشت به فروشگاه
        </Link>
      </div>
    );
  }

  const resolved = resolveVariantPrice(product, variant, {
    customerGroup,
    quantity: qty,
    campaigns,
    settings,
    contractPrices,
    userId: authUser?.uid,
  });

  const productReviews = reviews.filter((r) => r.productId === product.id && r.status === 'approved');
  const productQuestions = questions.filter((q) => q.productId === product.id && q.status === 'approved');
  const relatedProducts = products.filter((p) => (product.relatedIds ?? []).includes(p.id) && p.id !== product.id);
  const specAttributes = attributes.filter((a) => a.showInSpec && product.attributes[a.code] !== undefined);

  const handleRequestProforma = async () => {
    if (!authUser && !mobileSession) {
      pushToast('برای صدور پیش‌فاکتور رسمی لطفاً ابتدا وارد حساب کاربری یا نشست موبایلی شوید.', 'error');
      return;
    }
    const contactMobile = (userProfile?.mobile || mobileSession?.mobile || '').trim();
    if (!/^09\d{9}$/.test(contactMobile)) {
      pushToast('لطفاً ابتدا شماره موبایل معتبر خود را در حساب کاربری ثبت کنید.', 'error');
      return;
    }
    const unitPrice = resolved.unitPrice ?? variant.basePrice ?? 0;
    await requestProforma({
      contactName: userProfile?.displayName || authUser?.displayName || mobileSession?.displayName || 'مشتری کلینیک',
      contactMobile,
      clinicName: userProfile?.clinicName,
      items: [
        {
          productId: product.id,
          variantId: variant.id,
          sku: variant.sku,
          titleFa: product.titleFa,
          variantLabelFa: variant.labelFa,
          quantity: qty,
          unitPrice,
          discountAmount: 0,
          lineTotal: unitPrice * qty,
          priceSource: resolved.priceSource,
        },
      ],
    });
  };

  const handleConsultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitConsultation({
      ...consultForm,
      productId: product.id,
      productName: product.titleFa,
    });
    setConsultOpen(false);
    setConsultForm({ name: '', mobile: '', clinicName: '', budgetRange: '', message: '' });
  };

  const openRfqModal = () => {
    setRfqForm((prev) => ({
      ...prev,
      customerName: prev.customerName || userProfile?.displayName || authUser?.displayName || mobileSession?.displayName || '',
      customerMobile: prev.customerMobile || userProfile?.mobile || mobileSession?.mobile || '',
      clinicName: prev.clinicName || userProfile?.clinicName || '',
      quantity: Math.max(qty, product.minOrderQty || 1),
    }));
    setRfqOpen(true);
  };

  const handleRfqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await submitRfq({
      productId: product.id,
      variantId: variant.id,
      quantity: rfqForm.quantity,
      customerName: rfqForm.customerName.trim(),
      customerMobile: rfqForm.customerMobile.trim(),
      clinicName: rfqForm.clinicName.trim() || undefined,
      targetUnitPrice: rfqForm.targetUnitPrice ? Number(rfqForm.targetUnitPrice) : undefined,
      note: rfqForm.note.trim() || undefined,
    });
    if (created) {
      setRfqOpen(false);
      setRfqForm({ customerName: '', customerMobile: '', clinicName: '', quantity: 5, targetUnitPrice: '', note: '' });
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitReview(product.id, reviewForm.rating, reviewForm.title, reviewForm.body);
    setReviewForm({ rating: 5, title: '', body: '' });
  };

  const handleQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    await submitQuestion(product.id, questionText);
    setQuestionText('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-12">
      {/* Visible Breadcrumbs */}
      <nav aria-label="مسیر راهنما" className="flex items-center gap-1.5 text-xs text-ink/60 dark:text-slate-400">
        <Link to="/" className="hover:text-brand">خانه</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        {category && (
          <>
            <Link to={`/category/${category.slug}`} className="hover:text-brand">{category.nameFa}</Link>
            <ChevronLeft className="w-3.5 h-3.5" />
          </>
        )}
        <span className="text-ink dark:text-slate-200 font-bold truncate">{product.titleFa}</span>
      </nav>

      {/* Main Contiguous Product Showcase + Purchase Module */}
      <section className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left: Zoomable Gallery + Optional Video Slot */}
        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-24">
          <div className="relative aspect-[4/3] bg-white border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
            {showVideo && product.videoUrl ? (
              <video src={product.videoUrl} controls autoPlay className="w-full h-full object-cover" />
            ) : (
              <>
                <img
                  {...buildResponsiveImageProps(activeImage || product.imageUrl, {
                    widths: [480, 640, 960],
                    sizes: '(max-width: 1024px) 100vw, 42vw',
                    eager: true,
                  })}
                  alt={product.titleFa}
                  width={640}
                  height={480}
                  className={`w-full h-full ${
                    (activeImage || product.imageUrl).startsWith('/assets/products/')
                      ? 'object-contain p-4 bg-white'
                      : 'object-cover'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label="بزرگنمایی تصویر"
                  className="absolute bottom-3 left-3 p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-line dark:border-slate-700 text-ink dark:text-slate-100 hover:border-brand"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          {(product.galleryUrls.length > 1 || product.videoUrl) && (
            <div className="flex gap-2 flex-wrap">
              {product.galleryUrls.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setShowVideo(false); setActiveImage(url); }}
                  className={`w-20 h-16 rounded-lg overflow-hidden border bg-white ${
                    !showVideo && activeImage === url ? 'border-brand ring-2 ring-brand/30' : 'border-line dark:border-slate-800'
                  }`}
                >
                  <img
                    {...buildResponsiveImageProps(url, {
                      widths: [160, 320],
                      sizes: '80px',
                    })}
                    alt={`${product.titleFa} - ${idx + 1}`}
                    width={80}
                    height={64}
                    className={`w-full h-full ${url.startsWith('/assets/products/') ? 'object-contain p-1' : 'object-cover'}`}
                  />
                </button>
              ))}
              {product.videoUrl && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  className={`w-20 h-16 rounded-lg border flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${
                    showVideo ? 'border-brand bg-brand/10 text-brand' : 'border-line dark:border-slate-800'
                  }`}
                >
                  <PlayCircle className="w-5 h-5" />
                  <span>ویدئو</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Title, Variants, Pricing, Actions */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6">
          <div className="space-y-2 border-b border-line dark:border-slate-800 pb-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink/65 dark:text-slate-400">
              {brand && (
                <Link to={`/brand/${brand.slug}`} className="font-bold text-brand hover:underline">
                  {brand.nameFa}
                </Link>
              )}
              <span aria-hidden="true">·</span>
              <span>ساخت {product.originCountryFa}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">SKU: {variant.sku}</span>
              {product.imedCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-medium text-ink/80 dark:text-slate-200">کد IMED: {product.imedCode}</span>
                </>
              )}
            </div>

            <h1 className="text-2xl lg:text-3xl font-extrabold text-ink dark:text-slate-100 leading-snug">
              {product.titleFa}
            </h1>
            <p className="text-xs text-ink/50 dark:text-slate-400" dir="ltr">{product.titleEn}</p>

            {product.ratingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs pt-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold tabular-nums">{toPersianDigits(product.ratingAvg.toFixed(1))}</span>
                <span className="text-ink/55">({toPersianDigits(product.ratingCount)} دیدگاه تاییدشده)</span>
              </div>
            )}
          </div>

          <p className="text-sm text-ink/80 dark:text-slate-300 leading-relaxed">{product.shortDescriptionFa}</p>

          {/* Variant Selector */}
          <div className="space-y-2.5">
            <h2 className="text-sm font-bold">انتخاب نوع / بسته / شید:</h2>
            <div className="flex flex-wrap gap-2">
              {product.variants.filter((v) => v.isActive).map((v) => {
                const isSelected = v.id === variant.id;
                const avail = v.stockOnHand - v.reserved;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                      isSelected
                        ? 'border-brand bg-brand text-white'
                        : 'border-line dark:border-slate-700 bg-paper dark:bg-slate-800 hover:border-brand'
                    } ${avail <= 0 ? 'opacity-60' : ''}`}
                  >
                    {v.colorHex && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20"
                        style={{ backgroundColor: v.colorHex }}
                      />
                    )}
                    <span>{v.labelFa}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Batch / Expiry & Stock Status */}
          <div className="bg-surface/70 dark:bg-slate-800/60 rounded-xl p-4 grid sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${resolved.availableStock > 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              <span>
                وضعیت انبار:{' '}
                <strong className="tabular-nums">
                  {resolved.availableStock > 0 ? `${toPersianDigits(resolved.availableStock)} عدد آماده ارسال` : 'ناموجود'}
                </strong>
              </span>
            </div>
            {resolved.nearestExpiryDate && (
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-brand shrink-0" />
                <span>
                  بچ فعلی (FEFO): <strong className="tabular-nums">{resolved.nearestBatchNo}</strong> · انقضا{' '}
                  <strong className="tabular-nums">{formatJalaliDate(resolved.nearestExpiryDate)}</strong>
                  {resolved.nearExpiry && <span className="text-amber-700 dark:text-amber-400 font-bold"> (انقضا نزدیک)</span>}
                </span>
              </div>
            )}
            {product.kind === 'capital_equipment' && (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                  <span>
                    گارانتی: <strong>{toPersianDigits(product.warrantyMonths ?? 12)} ماه ({product.warrantyProvider})</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand shrink-0" />
                  <span>
                    {product.installationAvailable ? 'نصب و راه‌اندازی رایگان در محل' : 'تحویل استاندارد'}
                    {product.trainingAvailable ? ' + آموزش پرسنل' : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Tiered & Group Pricing Preview */}
          {(variant.tierPrices?.length || variant.groupPrices) && resolved.state === 'fixed' && (
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              {variant.tierPrices && variant.tierPrices.length > 0 && (
                <div className="border border-line dark:border-slate-800 rounded-xl p-3 space-y-1.5">
                  <p className="font-bold text-ink/80 dark:text-slate-200">تخفیف پلکانی خرید عمده</p>
                  {variant.tierPrices.map((tier) => (
                    <div key={tier.minQty} className="flex justify-between tabular-nums">
                      <span>از {toPersianDigits(tier.minQty)} عدد به بالا</span>
                      <span className="font-bold text-brand dark:text-teal-300">{formatMoney(tier.unitPrice, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {variant.groupPrices && (
                <div className="border border-line dark:border-slate-800 rounded-xl p-3 space-y-1.5">
                  <p className="font-bold text-ink/80 dark:text-slate-200">تعرفه گروه‌های حرفه‌ای B2B</p>
                  {variant.groupPrices.dentist && (
                    <div className="flex justify-between tabular-nums">
                      <span>پزشکان تاییدشده</span>
                      <span className="font-bold">{formatMoney(variant.groupPrices.dentist, currency)}</span>
                    </div>
                  )}
                  {variant.groupPrices.clinic && (
                    <div className="flex justify-between tabular-nums">
                      <span>کلینیک و درمانگاه</span>
                      <span className="font-bold">{formatMoney(variant.groupPrices.clinic, currency)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price & Primary CTA Box */}
          <div className="pt-4 border-t border-line dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                {resolved.discountVerified && resolved.originalPrice && resolved.discountPercent > 0 && (
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="line-through text-ink/45 tabular-nums">{formatMoney(resolved.originalPrice, currency)}</span>
                    <span className="font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                      {toPersianDigits(resolved.discountPercent)}٪ تخفیف تاییدشده
                    </span>
                    {resolved.campaignEndsAt && <CountdownTimer endsAt={resolved.campaignEndsAt} />}
                  </div>
                )}
                {resolved.priceSource === 'contract' && (
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-0.5">
                    نرخ قرارداد اختصاصی حساب شما
                  </p>
                )}
                <p className="text-2xl font-extrabold text-brand dark:text-teal-300 tabular-nums">
                  {resolved.state === 'out_of_stock'
                    ? 'ناموجود'
                    : resolved.state === 'coming_soon'
                    ? 'به‌زودی'
                    : resolved.state === 'call_for_price'
                    ? 'تماس برای قیمت روز'
                    : formatMoney(resolved.unitPrice, currency)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className={`p-2.5 rounded-lg border ${wishlistIds.includes(product.id) ? 'border-rose-500 text-rose-600' : 'border-line dark:border-slate-700'}`}
                  aria-label="علاقه‌مندی"
                >
                  <Heart className={`w-4 h-4 ${wishlistIds.includes(product.id) ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleCompare(product.id)}
                  className={`p-2.5 rounded-lg border ${compareIds.includes(product.id) ? 'border-brand text-brand' : 'border-line dark:border-slate-700'}`}
                  aria-label="مقایسه"
                >
                  <GitCompareArrows className="w-4 h-4" />
                </button>
              </div>
            </div>

            {resolved.state === 'fixed' ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center border border-line dark:border-slate-700 rounded-lg">
                  <button type="button" onClick={() => setQty((q) => q + 1)} className="px-3 py-2.5 text-sm font-bold">+</button>
                  <span className="px-4 text-sm font-bold tabular-nums">{toPersianDigits(qty)}</span>
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2.5 text-sm font-bold">-</button>
                </div>
                <button
                  type="button"
                  data-testid="add-to-cart-button"
                  onClick={() => addToCart(product.id, variant.id, qty)}
                  className="flex-1 min-w-[200px] py-3 px-6 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors inline-flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>افزودن به سبد خرید</span>
                </button>
                {(product.kind === 'capital_equipment' || qty >= 5) && (
                  <button
                    type="button"
                    onClick={handleRequestProforma}
                    className="py-3 px-4 rounded-lg border border-brand text-brand dark:text-teal-300 text-sm font-bold hover:bg-brand hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    <span>صدور پیش‌فاکتور</span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid="open-rfq-modal-button"
                  onClick={openRfqModal}
                  className="py-3 px-4 rounded-lg border border-line dark:border-slate-700 text-xs font-bold hover:border-brand transition-colors"
                >
                  استعلام قیمت همکاری / چانه‌زنی (RFQ)
                </button>
              </div>
            ) : resolved.state === 'call_for_price' ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConsultOpen(true)}
                  className="flex-1 py-3 px-6 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark"
                >
                  درخواست مشاوره و استعلام قیمت
                </button>
                <button
                  type="button"
                  data-testid="open-rfq-modal-button"
                  onClick={openRfqModal}
                  className="py-3 px-5 rounded-lg border border-brand text-brand dark:text-teal-300 text-sm font-bold"
                >
                  ثبت استعلام قیمت رسمی (RFQ)
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!notifyMobile.trim()) return;
                  await submitStockNotification({
                    productId: product.id,
                    variantId: variant.id,
                    productTitleFa: product.titleFa,
                    mobile: notifyMobile.trim(),
                  });
                  setNotifyMobile('');
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  type="tel"
                  required
                  value={notifyMobile}
                  onChange={(e) => setNotifyMobile(e.target.value)}
                  placeholder="شماره موبایل جهت اطلاع از موجودی..."
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
                />
                <button type="submit" className="px-5 py-2.5 rounded-lg bg-brand text-white text-xs font-bold">
                  موجود شد خبرم کن
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Spec Table + Description + Real Certificate Downloads */}
      <section className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-extrabold mb-3">توضیحات تخصصی محصول</h2>
            <p className="text-sm leading-relaxed text-ink/80 dark:text-slate-300 whitespace-pre-line">{product.descriptionFa}</p>
          </div>

          {specAttributes.length > 0 && (
            <div>
              <h2 className="text-lg font-extrabold mb-3">جدول مشخصات فنی</h2>
              <div className="border border-line dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-line dark:divide-slate-800 text-sm">
                {specAttributes.map((attr) => {
                  const raw = product.attributes[attr.code];
                  let displayVal = String(raw);
                  if (typeof raw === 'boolean') displayVal = raw ? 'بله' : 'خیر';
                  else if (Array.isArray(raw)) displayVal = raw.join('، ');
                  else if (attr.options) {
                    displayVal = attr.options.find((o) => o.key === String(raw))?.labelFa ?? String(raw);
                  }
                  return (
                    <div key={attr.id} className="grid grid-cols-3 px-4 py-3 bg-white dark:bg-slate-900">
                      <span className="text-ink/65 dark:text-slate-400 font-medium">{attr.labelFa}</span>
                      <span className="col-span-2 font-bold tabular-nums">
                        {displayVal} {attr.unit ? attr.unit : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          {product.files && product.files.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
              <h2 className="text-lg font-extrabold">کاتالوگ و مستندات فنی (CE / ISO / IMED)</h2>
              <div className="space-y-2">
                {product.files.map((f) => (
                  <a
                    key={f.id}
                    href={`/api/files/certificate?productId=${encodeURIComponent(product.id)}&fileId=${encodeURIComponent(f.id)}&sku=${encodeURIComponent(product.sku)}`}
                    download
                    className="w-full p-3 rounded-xl border border-line dark:border-slate-800 flex items-center justify-between text-right hover:border-brand transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold">{f.titleFa}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            f.isVerified
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface dark:bg-slate-800 text-ink/60 dark:text-slate-400'
                          }`}
                        >
                          {f.isVerified ? 'مدرک تاییدشده' : 'برگه مشخصات فنی'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink/55 tabular-nums mt-0.5">
                        {f.fileSizeLabel}
                        {f.code ? ` · ${f.code}` : ''}
                        {f.issuer ? ` · مرجع: ${f.issuer}` : ''}
                      </p>
                    </div>
                    <Download className="w-4 h-4 text-brand shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {product.faqs && product.faqs.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
              <h2 className="text-lg font-extrabold">سوالات متداول محصول</h2>
              <div className="space-y-3 text-sm">
                {product.faqs.map((faq, idx) => (
                  <div key={idx} className="border-b last:border-b-0 border-line dark:border-slate-800 pb-3 last:pb-0">
                    <p className="font-bold text-ink dark:text-slate-100">{faq.q}</p>
                    <p className="text-xs text-ink/70 dark:text-slate-400 mt-1 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Reviews & Q&A */}
      <section className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-extrabold">دیدگاه خریداران ({toPersianDigits(productReviews.length)})</h2>
          {productReviews.length === 0 ? (
            <p className="text-xs text-ink/60">هنوز دیدگاهی ثبت نشده است.</p>
          ) : (
            <div className="space-y-4">
              {productReviews.map((rev) => (
                <div key={rev.id} className="border-b border-line dark:border-slate-800 pb-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">{rev.authorName}</span>
                    <span className="tabular-nums text-amber-600 font-bold">{toPersianDigits(rev.rating)} از ۵</span>
                  </div>
                  {rev.title && <p className="text-sm font-bold">{rev.title}</p>}
                  <p className="text-xs text-ink/75 dark:text-slate-300 leading-relaxed">{rev.body}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleReviewSubmit} className="pt-3 border-t border-line dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">ثبت دیدگاه تخصصی</h3>
            <div className="flex items-center gap-3 text-xs">
              <span>امتیاز:</span>
              <select
                value={reviewForm.rating}
                onChange={(e) => setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                className="px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{toPersianDigits(n)} ستاره</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="عنوان دیدگاه (اختیاری)"
              value={reviewForm.title}
              onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs"
            />
            <textarea
              required
              rows={3}
              placeholder="تجربه بالینی یا نظر خود درباره این کالا..."
              value={reviewForm.body}
              onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold">
              ارسال دیدگاه
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-extrabold inline-flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-brand" />
            پرسش و پاسخ فنی ({toPersianDigits(productQuestions.length)})
          </h2>
          {productQuestions.length === 0 ? (
            <p className="text-xs text-ink/60">هنوز پرسشی ثبت نشده است.</p>
          ) : (
            <div className="space-y-4">
              {productQuestions.map((q) => (
                <div key={q.id} className="border-b border-line dark:border-slate-800 pb-3 space-y-1.5">
                  <p className="text-xs font-bold">{q.authorName}: {q.body}</p>
                  {q.answerBody && (
                    <p className="text-xs bg-surface dark:bg-slate-800 p-2.5 rounded-lg text-ink/80 dark:text-slate-300">
                      <strong>{q.answeredBy}:</strong> {q.answerBody}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleQuestionSubmit} className="pt-3 border-t border-line dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">پرسش از کارشناس تجهیزات</h3>
            <textarea
              required
              rows={3}
              placeholder="سوال فنی درباره سازگاری، ولتاژ، شید یا گارانتی..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs"
            />
            <button type="submit" className="px-4 py-2 rounded-lg border border-brand text-brand dark:text-teal-300 text-xs font-bold">
              ثبت پرسش
            </button>
          </form>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">محصولات مکمل و مرتبط</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {recentProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">بازدیدهای اخیر شما</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {recentProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Zoom Modal */}
      {zoomOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setZoomOpen(false)}>
          <div className="relative max-w-4xl w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              className="absolute top-3 left-3 p-2 rounded-lg bg-white/90 dark:bg-slate-800 text-ink dark:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={activeImage || product.imageUrl} alt={product.titleFa} className="w-full max-h-[80vh] object-contain" />
          </div>
        </div>
      )}

      {/* Capital Equipment Consultation Modal */}
      {consultOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-base">درخواست مشاوره و استعلام قیمت</h2>
              <button type="button" onClick={() => setConsultOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleConsultSubmit} className="space-y-3 text-sm">
              <input
                required
                placeholder="نام و نام خانوادگی"
                value={consultForm.name}
                onChange={(e) => setConsultForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                required
                placeholder="شماره تماس (۰۹۱۲...)"
                value={consultForm.mobile}
                onChange={(e) => setConsultForm((f) => ({ ...f, mobile: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                placeholder="نام کلینیک / مطب"
                value={consultForm.clinicName}
                onChange={(e) => setConsultForm((f) => ({ ...f, clinicName: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <textarea
                rows={3}
                placeholder="توضیحات، شرایط پرداخت مدنظر یا سوالات فنی..."
                value={consultForm.message}
                onChange={(e) => setConsultForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <button type="submit" className="w-full py-2.5 rounded-lg bg-brand text-white font-bold">
                ثبت درخواست مشاوره
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Two-Way RFQ Modal */}
      {rfqOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-base">استعلام قیمت و چانه‌زنی B2B (RFQ)</h2>
              <button type="button" onClick={() => setRfqOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-ink/65 dark:text-slate-400">
              {product.titleFa} ({variant.labelFa}) — وضعیت درخواست و قیمت پیشنهادی کارشناس در پنل کاربری قابل پیگیری و مذاکره است.
            </p>
            <form onSubmit={handleRfqSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  data-testid="rfq-name-input"
                  placeholder="نام و نام خانوادگی *"
                  value={rfqForm.customerName}
                  onChange={(e) => setRfqForm((f) => ({ ...f, customerName: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <input
                  required
                  type="tel"
                  data-testid="rfq-mobile-input"
                  placeholder="موبایل * (0912...)"
                  value={rfqForm.customerMobile}
                  onChange={(e) => setRfqForm((f) => ({ ...f, customerMobile: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="font-bold">تعداد درخواستی *</span>
                  <input
                    required
                    type="number"
                    min={1}
                    data-testid="rfq-quantity-input"
                    value={rfqForm.quantity}
                    onChange={(e) => setRfqForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold">قیمت هدف واحد (تومان - اختیاری)</span>
                  <input
                    type="number"
                    min={0}
                    data-testid="rfq-target-price-input"
                    value={rfqForm.targetUnitPrice}
                    onChange={(e) => setRfqForm((f) => ({ ...f, targetUnitPrice: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
              </div>
              <input
                placeholder="نام کلینیک / شرکت (اختیاری)"
                value={rfqForm.clinicName}
                onChange={(e) => setRfqForm((f) => ({ ...f, clinicName: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <textarea
                rows={3}
                data-testid="rfq-note-input"
                placeholder="توضیحات تعداد بسته، شرایط تحویل یا درخواست تخفیف همکاری..."
                value={rfqForm.note}
                onChange={(e) => setRfqForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <button type="submit" data-testid="rfq-submit-button" className="w-full py-2.5 rounded-lg bg-brand text-white font-bold">
                ثبت و ارسال استعلام قیمت
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
