import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitCompareArrows, Heart, ShoppingBag, Star } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatMoney, toPersianDigits } from '../../lib/jalali';
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
            alt={product.titleFa}
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
            <span className="text-xs font-medium text-ink/50 dark:text-slate-400">{product.titleFa}</span>
          </div>
        )}
      </Link>

      <div className="p-4 flex-1 flex flex-col gap-2.5">
        {/* Unboxed typographic metadata (Zero-pill discipline) */}
        <div className="flex items-center justify-between gap-2 text-xs text-ink/60 dark:text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <span>{brand?.nameFa ?? 'برند تخصصی'}</span>
            <span aria-hidden="true">·</span>
            <span>{product.originCountryFa}</span>
          </div>
          {product.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums text-ink/80 dark:text-slate-200 shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {toPersianDigits(product.ratingAvg.toFixed(1))}
            </span>
          )}
        </div>

        <Link to={`/product/${product.slug}`} data-testid="product-card-link" className="block">
          <h3 className="font-bold text-[15px] leading-snug text-ink dark:text-slate-100 line-clamp-2 hover:text-brand dark:hover:text-teal-300 transition-colors">
            {product.titleFa}
          </h3>
          <p className="text-xs text-ink/50 dark:text-slate-500 mt-0.5 truncate" dir="ltr">
            {product.titleEn}
          </p>
        </Link>

        {/* Quiet inline status notices (no pill clusters) */}
        {(summary.nearExpiry || summary.discountPercent > 0 || product.kind === 'capital_equipment') && (
          <div className="flex items-center gap-2 text-xs text-ink/70 dark:text-slate-300">
            {summary.discountPercent > 0 && (
              <span className="font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {toPersianDigits(summary.discountPercent)}٪ تخفیف جشنواره
              </span>
            )}
            {summary.campaignEndsAt && (
              <>
                <span aria-hidden="true">·</span>
                <CountdownTimer endsAt={summary.campaignEndsAt} />
              </>
            )}
            {summary.nearExpiry && (
              <span className="font-medium text-amber-700 dark:text-amber-400">انقضا نزدیک</span>
            )}
            {!summary.nearExpiry && summary.discountPercent === 0 && product.kind === 'capital_equipment' && (
              <span className="text-brandDark dark:text-teal-300">نصب و گارانتی رسمی</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-line/70 dark:border-slate-800 flex items-end justify-between gap-2">
          <div>
            {summary.originalMinPrice && summary.discountPercent > 0 && (
              <p className="text-xs text-ink/45 dark:text-slate-500 line-through tabular-nums">
                {formatMoney(summary.originalMinPrice, currency)}
              </p>
            )}
            <p
              className={`font-extrabold tabular-nums text-[15px] ${
                summary.state === 'out_of_stock'
                  ? 'text-ink/50 dark:text-slate-500'
                  : summary.state === 'call_for_price'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-brand dark:text-teal-300'
              }`}
            >
              {summary.label}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => toggleCompare(product.id)}
              aria-label="افزودن به مقایسه"
              title="مقایسه"
              className={`p-2 rounded-lg border transition-colors ${
                isCompared
                  ? 'border-brand bg-brand/10 text-brand dark:text-teal-300'
                  : 'border-line dark:border-slate-700 text-ink/60 dark:text-slate-400 hover:border-brand'
              }`}
            >
              <GitCompareArrows className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              aria-label="افزودن به علاقه‌مندی"
              title="علاقه‌مندی"
              className={`p-2 rounded-lg border transition-colors ${
                isWishlisted
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-600'
                  : 'border-line dark:border-slate-700 text-ink/60 dark:text-slate-400 hover:border-rose-400'
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
            className="w-full py-2 px-3 rounded-lg border border-line dark:border-slate-700 text-center text-xs font-bold text-ink/70 dark:text-slate-300 hover:border-brand transition-colors"
          >
            مشاهده جزئیات و جایگزین‌ها
          </Link>
        ) : summary.state === 'call_for_price' ? (
          <Link
            to={`/product/${product.slug}`}
            className="w-full py-2 px-3 rounded-lg border border-brand text-center text-xs font-bold text-brand dark:text-teal-300 hover:bg-brand hover:text-white transition-colors"
          >
            استعلام قیمت / پیش‌فاکتور
          </Link>
        ) : hasMultipleVariants ? (
          <Link
            to={`/product/${product.slug}`}
            className="w-full py-2 px-3 rounded-lg bg-surface dark:bg-slate-800 text-center text-xs font-bold text-ink dark:text-slate-100 hover:bg-brand hover:text-white transition-colors"
          >
            انتخاب تنوع ({toPersianDigits(activeVariants.length)})
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => defaultVariant && addToCart(product.id, defaultVariant.id, 1)}
            className="w-full py-2 px-3 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>افزودن به سبد خرید</span>
          </button>
        )}
      </div>
    </article>
  );
}
