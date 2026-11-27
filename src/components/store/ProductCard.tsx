import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitCompareArrows, Heart, ShoppingBag, Star } from 'lucide-react';
import { useI18n } from '../../context/i18n';
import { useStore } from '../../context/StoreContext';
import { buildResponsiveImageProps } from '../../lib/media';
import { getProductPriceSummary } from '../../lib/pricing';
import { Product } from '../../types/domain';
import CountdownTimer from './CountdownTimer';

export default function ProductCard({ product }: { product: Product }) {
  const {
    brands,
    campaigns,
    contractPrices,
    authUser,
    currency,
    customerGroup,
    settings,
    addToCart,
    wishlistIds,
    toggleWishlist,
    compareIds,
    toggleCompare,
  } = useStore();
  const { t, locale, formatMoney, formatDigits } = useI18n();

  const [imgFailed, setImgFailed] = useState(false);
  const brand = brands.find((b) => b.id === product.brandId);
  const summary = getProductPriceSummary(product, {
    customerGroup,
    campaigns,
    currency,
    settings,
    contractPrices,
    userId: authUser?.uid,
  });
  const isWishlisted = wishlistIds.includes(product.id);
  const isCompared = compareIds.includes(product.id);
  const activeVariants = product.variants.filter((v) => v.isActive);
  const defaultVariant = activeVariants.find((v) => v.isDefault) ?? activeVariants[0];
  const hasMultipleVariants = activeVariants.length > 1;
  const primaryTitle = locale === 'en' && product.titleEn ? product.titleEn : product.titleFa;
  const secondaryTitle = locale === 'en' ? product.titleFa : product.titleEn;

  return (
    <article
      data-testid={`product-card-${product.id}`}
      className="group bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
    >
      <Link
        to={`/product/${product.slug}`}
        className={`relative block aspect-[4/3] overflow-hidden ${
          product.imageUrl?.startsWith('/assets/products/') ? 'bg-white' : 'bg-surface dark:bg-slate-800'
        }`}
      >
        {!imgFailed && product.imageUrl ? (
          <img
            {...buildResponsiveImageProps(product.imageUrl, {
              widths: [320, 480, 720],
              sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw',
            })}
            alt={primaryTitle}
            width={400}
            height={300}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`w-full h-full transition-transform duration-300 group-hover:scale-[1.03] ${
              product.imageUrl.startsWith('/assets/products/') ? 'object-contain p-3' : 'object-cover'
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-surface to-paper dark:from-slate-800 dark:to-slate-900">
            <span className="text-xs font-medium text-ink/70 dark:text-slate-300">{primaryTitle}</span>
          </div>
        )}
      </Link>

      <div className="p-4 flex-1 flex flex-col gap-2.5">
        {/* Unboxed typographic metadata (Zero-pill discipline) */}
        <div className="flex items-center justify-between gap-2 text-xs text-ink/70 dark:text-slate-300">
          <div className="flex items-center gap-1.5 truncate">
            <span>{(locale === 'en' ? brand?.nameEn || brand?.nameFa : brand?.nameFa) ?? t('productCard.specialtyBrand')}</span>
            <span aria-hidden="true">·</span>
            <span>{product.originCountryFa}</span>
          </div>
          {product.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums text-ink/85 dark:text-slate-200 shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {formatDigits(product.ratingAvg.toFixed(1))}
            </span>
          )}
        </div>

        <Link to={`/product/${product.slug}`} data-testid="product-card-link" className="block">
          <h3 className="font-bold text-[15px] leading-snug text-ink dark:text-slate-100 line-clamp-2 hover:text-brand dark:hover:text-teal-300 transition-colors">
            {primaryTitle}
          </h3>
          <p className="text-xs text-ink/65 dark:text-slate-400 mt-0.5 truncate" dir={locale === 'en' ? 'rtl' : 'ltr'}>
            {secondaryTitle}
          </p>
        </Link>

        {/* Quiet inline status notices (no pill clusters) */}
        {(summary.nearExpiry || summary.discountPercent > 0 || product.kind === 'capital_equipment') && (
          <div className="flex items-center gap-2 text-xs text-ink/75 dark:text-slate-300">
            {summary.discountPercent > 0 && (
              <span className="font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {t('productCard.festivalDiscount', { percent: formatDigits(summary.discountPercent) })}
              </span>
            )}
            {summary.campaignEndsAt && (
              <>
                <span aria-hidden="true">·</span>
                <CountdownTimer endsAt={summary.campaignEndsAt} />
              </>
            )}
            {summary.nearExpiry && (
              <span className="font-medium text-amber-700 dark:text-amber-400">{t('price.nearExpiry')}</span>
            )}
            {!summary.nearExpiry && summary.discountPercent === 0 && product.kind === 'capital_equipment' && (
              <span className="text-brandDark dark:text-teal-300">{t('productCard.installAndWarranty')}</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-line/70 dark:border-slate-800 flex items-end justify-between gap-2">
          <div>
            {summary.originalMinPrice && summary.discountPercent > 0 && (
              <p className="text-xs text-ink/65 dark:text-slate-400 line-through tabular-nums">
                {formatMoney(summary.originalMinPrice, currency)}
              </p>
            )}
            <p
              className={`font-extrabold tabular-nums text-[15px] ${
                summary.state === 'out_of_stock'
                  ? 'text-ink/70 dark:text-slate-400'
                  : summary.state === 'call_for_price'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-brand dark:text-teal-300'
              }`}
            >
              {summary.label}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleCompare(product.id)}
              aria-label={t('productCard.addCompare')}
              aria-pressed={isCompared}
              title={t('actions.compare')}
              className={`min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg border transition-colors ${
                isCompared
                  ? 'border-brand bg-brand/10 text-brand dark:text-teal-300'
                  : 'border-line dark:border-slate-700 text-ink/70 dark:text-slate-300 hover:border-brand'
              }`}
            >
              <GitCompareArrows className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              aria-label={t('productCard.addWishlist')}
              aria-pressed={isWishlisted}
              title={t('actions.wishlist')}
              className={`min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg border transition-colors ${
                isWishlisted
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-600'
                  : 'border-line dark:border-slate-700 text-ink/70 dark:text-slate-300 hover:border-rose-400'
              }`}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Action Button */}
        {summary.state === 'out_of_stock' || summary.state === 'coming_soon' ? (
          <Link
            to={`/product/${product.slug}`}
            className="w-full min-h-[44px] inline-flex items-center justify-center py-2.5 px-3 rounded-lg border border-line dark:border-slate-700 text-center text-xs font-bold text-ink/75 dark:text-slate-300 hover:border-brand transition-colors"
          >
            {t('productCard.viewDetailsAndAlts')}
          </Link>
        ) : summary.state === 'call_for_price' ? (
          <Link
            to={`/product/${product.slug}`}
            className="w-full min-h-[44px] inline-flex items-center justify-center py-2.5 px-3 rounded-lg border border-brand text-center text-xs font-bold text-brand dark:text-teal-300 hover:bg-brand hover:text-white transition-colors"
          >
            {t('productCard.inquireOrProforma')}
          </Link>
        ) : hasMultipleVariants ? (
          <Link
            to={`/product/${product.slug}`}
            className="w-full min-h-[44px] inline-flex items-center justify-center py-2.5 px-3 rounded-lg bg-surface dark:bg-slate-800 text-center text-xs font-bold text-ink dark:text-slate-100 hover:bg-brand hover:text-white transition-colors"
          >
            {t('productCard.chooseVariantCount', { count: activeVariants.length })}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => defaultVariant && addToCart(product.id, defaultVariant.id, 1)}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{t('actions.addToCart')}</span>
          </button>
        )}
      </div>
    </article>
  );
}
