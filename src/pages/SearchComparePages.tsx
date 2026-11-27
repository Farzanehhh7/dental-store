import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { EmptyState, FieldError, ProductGridSkeleton } from '../components/ui/States';
import { useStore } from '../context/StoreContext';
import { useI18n } from '../context/i18n';
import { trackEcommerceEvent } from '../lib/analytics';
import { buildResponsiveImageProps } from '../lib/media';
import { scoreSearchMatch } from '../lib/persian-search';
import { getProductPriceSummary } from '../lib/pricing';
import { applySeoHead } from '../lib/seo';
import { isValidIranMobile, normalizeAsciiDigits } from '../lib/validation';

import { Product, VerticalType } from '../types/domain';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const verticalParam = (params.get('vertical') ?? '') as '' | VerticalType;
  const brandParam = params.get('brand') ?? '';
  const inStockParam = params.get('inStock') === '1' || params.get('inStock') === 'true';
  const discountParam = params.get('discount') === '1' || params.get('discount') === 'true';
  const pageParam = Math.max(1, Number(params.get('page') || 1) || 1);

  const [input, setInput] = useState(q);
  const { products, brands, categories, campaigns, currency, contractPrices, authUser, customerGroup, settings, submitStockRequest } = useStore();
  const { t, formatDigits } = useI18n();

  const [reqForm, setReqForm] = useState({ contactName: '', mobile: '', titleText: q, brandText: '', description: '' });
  const [reqErrors, setReqErrors] = useState<{ titleText?: string; contactName?: string; mobile?: string }>({});
  const [serverData, setServerData] = useState<{
    items: Product[];
    total: number;
    totalPages: number;
    facets?: {
      brands?: Array<{ id: string; slug: string; nameFa: string; count: number }>;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const verticalOptions: { id: '' | VerticalType; label: string }[] = [
    { id: '', label: t('searchPage.verticals.all') },
    { id: 'dental', label: t('searchPage.verticals.dental') },
    { id: 'medical', label: t('searchPage.verticals.medical') },
    { id: 'lab', label: t('searchPage.verticals.lab') },
  ];

  useEffect(() => {
    setInput(q);
    if (q.trim()) {
      trackEcommerceEvent('search', { search_term: q.trim() });
    }
    applySeoHead({
      title: `${t('searchPage.seoTitlePrefix')}: ${q || t('searchPage.seoCatalogFallback')} | ${settings.storeNameFa}`,
      description: t('searchPage.seoDescription'),
      canonicalPath: '/search',
      robots: 'noindex, follow',
    });
  }, [q, settings.storeNameFa, t]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(verticalParam ? { vertical: verticalParam } : {}),
      ...(brandParam ? { brand: brandParam } : {}),
      ...(inStockParam ? { inStock: '1' } : {}),
      ...(discountParam ? { discount: '1', sort: 'discount' } : {}),
      group: customerGroup,
      page: String(pageParam),
      limit: '24',
    });
    fetch(`/api/catalog/products?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.items)) {
          setServerData({
            items: data.items as Product[],
            total: Number(data.total ?? data.items.length),
            totalPages: Number(data.totalPages ?? 1),
            facets: data.facets,
          });
        }
      })
      .catch(() => {
        // Offline / client fallback handled below
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, verticalParam, brandParam, inStockParam, discountParam, pageParam, customerGroup]);

  const localResults = useMemo(() => {
    const filtered = products.filter((p) => {
      if (p.status !== 'active') return false;
      if (verticalParam && p.vertical !== verticalParam) return false;
      if (brandParam) {
        const br = brands.find((b) => b.id === brandParam || b.slug === brandParam);
        if (p.brandId !== (br?.id ?? brandParam)) return false;
      }
      if (inStockParam || discountParam) {
        const summary = getProductPriceSummary(p, {
          customerGroup,
          campaigns,
          currency,
          settings,
          contractPrices,
          userId: authUser?.uid,
        });
        if (inStockParam && !summary.inStock) return false;
        if (discountParam && summary.discountPercent <= 0) return false;
      }
      return true;
    });
    if (!q.trim()) return filtered;
    return filtered
      .map((p) => {
        const brand = brands.find((b) => b.id === p.brandId);
        const cat = categories.find((c) => c.id === p.primaryCategoryId);
        const score = scoreSearchMatch(q, {
          exactCodes: [p.sku, p.imedCode ?? '', ...p.variants.map((v) => v.sku)],
          textFields: [p.titleFa, p.titleEn, brand?.nameFa ?? '', brand?.nameEn ?? '', cat?.nameFa ?? '', ...p.tags],
        });
        return { product: p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.product);
  }, [q, verticalParam, brandParam, inStockParam, discountParam, products, brands, categories, customerGroup, campaigns, currency, settings, contractPrices, authUser?.uid]);

  const displayItems = serverData ? serverData.items : localResults.slice((pageParam - 1) * 24, pageParam * 24);
  const totalCount = serverData ? serverData.total : localResults.length;
  const totalPages = serverData ? serverData.totalPages : Math.max(1, Math.ceil(localResults.length / 24));
  const brandFacets = serverData?.facets?.brands ?? [];

  const updateQuery = (
    nextQ: string,
    nextVertical: '' | VerticalType,
    nextPage = 1,
    nextDiscount = discountParam,
    nextBrand = brandParam,
    nextInStock = inStockParam
  ) => {
    const next: Record<string, string> = {};
    if (nextQ.trim()) next.q = nextQ.trim();
    if (nextVertical) next.vertical = nextVertical;
    if (nextBrand) next.brand = nextBrand;
    if (nextInStock) next.inStock = '1';
    if (nextDiscount) next.discount = '1';
    if (nextPage > 1) next.page = String(nextPage);
    setParams(next);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateQuery(input, verticalParam, 1, discountParam, brandParam, inStockParam);
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof reqErrors = {};
    if (!reqForm.titleText.trim() || reqForm.titleText.trim().length < 2) {
      errs.titleText = t('searchPage.requestForm.titleError');
    }
    if (!reqForm.contactName.trim() || reqForm.contactName.trim().length < 2) {
      errs.contactName = t('validation.nameRequired');
    }
    if (!isValidIranMobile(reqForm.mobile)) {
      errs.mobile = t('validation.mobileInvalid');
    }
    setReqErrors(errs);
    if (Object.keys(errs).length > 0) return;

    await submitStockRequest({
      ...reqForm,
      mobile: normalizeAsciiDigits(reqForm.mobile),
    });
    setReqForm({ contactName: '', mobile: '', titleText: '', brandText: '', description: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <h1 className="text-xl sm:text-2xl font-extrabold">{t('searchPage.title')}</h1>
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 max-w-4xl">
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label={t('searchPage.inputPh')}
            placeholder={t('searchPage.inputPh')}
            className="flex-1 min-w-0 sm:min-w-[220px] min-h-[44px] px-4 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
          />
          <select
            value={verticalParam}
            onChange={(e) => updateQuery(input, e.target.value as '' | VerticalType, 1)}
            aria-label={t('searchPage.verticalAria')}
            className="min-h-[44px] px-3.5 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
          >
            {verticalOptions.map((v) => (
              <option key={v.id || 'all'} value={v.id}>{v.label}</option>
            ))}
          </select>
          {brandFacets.length > 0 && (
            <select
              value={brandParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, discountParam, e.target.value)}
              aria-label={t('searchPage.brandAria')}
              className="min-h-[44px] px-3.5 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
            >
              <option value="">{t('adminReports.filters.allBrands')}</option>
              {brandFacets.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.nameFa} ({formatDigits(b.count)})
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={inStockParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, discountParam, brandParam, e.target.checked)}
              className="accent-brand"
            />
            <span>{t('searchPage.onlyInStockChip')}</span>
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={discountParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, e.target.checked)}
              className="accent-brand"
            />
            <span>{t('searchPage.onlyDiscountChip')}</span>
          </label>
          <button type="submit" className="min-h-[44px] px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold inline-flex items-center justify-center gap-2">
            <Search className="w-4 h-4" aria-hidden="true" />
            <span>{t('nav.search')}</span>
          </button>
        </form>
        <p className="text-xs text-ink/70 dark:text-slate-400 tabular-nums">
          {loading ? t('searchPage.searchingServer') : t('searchPage.resultsFound', { count: formatDigits(totalCount) })}
          {totalPages > 1
            ? ` · ${t('adminProducts.pagination', { page: formatDigits(pageParam), totalPages: formatDigits(totalPages) })}`
            : ''}
        </p>
      </div>

      {loading && displayItems.length === 0 ? (
        <ProductGridSkeleton count={8} />
      ) : displayItems.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {displayItems.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs font-bold">
              <button
                type="button"
                disabled={pageParam <= 1}
                onClick={() => updateQuery(q, verticalParam, pageParam - 1)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
              >
                {t('common.prevPage')}
              </button>
              <span className="tabular-nums">
                {formatDigits(pageParam)} / {formatDigits(totalPages)}
              </span>
              <button
                type="button"
                disabled={pageParam >= totalPages}
                onClick={() => updateQuery(q, verticalParam, pageParam + 1)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
              >
                {t('common.nextPage')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-extrabold">{t('searchPage.requestForm.heading')}</h2>
          <p className="text-xs text-ink/70 dark:text-slate-400">
            {t('searchPage.requestForm.description')}
          </p>
          <form onSubmit={handleRequestSubmit} noValidate className="space-y-3 text-sm">
            <div>
              <input
                required
                aria-invalid={Boolean(reqErrors.titleText)}
                aria-describedby={reqErrors.titleText ? 'req-title-err' : undefined}
                placeholder={t('searchPage.requestForm.titlePh')}
                aria-label={t('searchPage.requestForm.titlePh')}
                value={reqForm.titleText}
                onChange={(e) => {
                  setReqForm((f) => ({ ...f, titleText: e.target.value }));
                  if (reqErrors.titleText) setReqErrors((er) => ({ ...er, titleText: undefined }));
                }}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <FieldError id="req-title-err" message={reqErrors.titleText} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <input
                  required
                  aria-invalid={Boolean(reqErrors.contactName)}
                  aria-describedby={reqErrors.contactName ? 'req-name-err' : undefined}
                  placeholder={t('searchPage.requestForm.namePh')}
                  aria-label={t('searchPage.requestForm.namePh')}
                  value={reqForm.contactName}
                  onChange={(e) => {
                    setReqForm((f) => ({ ...f, contactName: e.target.value }));
                    if (reqErrors.contactName) setReqErrors((er) => ({ ...er, contactName: undefined }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <FieldError id="req-name-err" message={reqErrors.contactName} />
              </div>
              <div>
                <input
                  required
                  dir="ltr"
                  aria-invalid={Boolean(reqErrors.mobile)}
                  aria-describedby={reqErrors.mobile ? 'req-mobile-err' : undefined}
                  placeholder={t('searchPage.requestForm.mobilePh')}
                  aria-label={t('searchPage.requestForm.mobilePh')}
                  value={reqForm.mobile}
                  onChange={(e) => {
                    setReqForm((f) => ({ ...f, mobile: e.target.value }));
                    if (reqErrors.mobile) setReqErrors((er) => ({ ...er, mobile: undefined }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <FieldError id="req-mobile-err" message={reqErrors.mobile} />
              </div>
            </div>
            <input
              placeholder={t('searchPage.requestForm.brandPh')}
              aria-label={t('searchPage.requestForm.brandPh')}
              value={reqForm.brandText}
              onChange={(e) => setReqForm((f) => ({ ...f, brandText: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              rows={2}
              placeholder={t('searchPage.requestForm.notesPh')}
              aria-label={t('searchPage.requestForm.notesPh')}
              value={reqForm.description}
              onChange={(e) => setReqForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="px-5 py-2.5 rounded-lg bg-brand text-white text-xs font-bold">
              {t('searchPage.requestForm.submitBtn')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function ComparePage() {
  const { compareIds, toggleCompare, products, brands, attributes, campaigns, contractPrices, authUser, currency, customerGroup, settings } = useStore();
  const { t, formatDigits } = useI18n();

  useEffect(() => {
    applySeoHead({
      title: `${t('comparePage.titleSimple')} | ${settings.storeNameFa}`,
      description: t('comparePage.seoDescription'),
      canonicalPath: '/compare',
      robots: 'noindex, follow',
    });
  }, [settings.storeNameFa, t]);

  const items = products.filter((p) => compareIds.includes(p.id));
  const comparableAttrs = attributes.filter(
    (a) => a.isComparable && items.some((p) => p.attributes[a.code] !== undefined)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold">
        {t('comparePage.headingWithCount', { count: formatDigits(items.length) })}
      </h1>
      {items.length === 0 ? (
        <EmptyState
          title={t('comparePage.empty')}
          actionLabel={t('comparePage.backToStore')}
          actionTo="/"
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-start">
            <thead className="border-b border-line dark:border-slate-800">
              <tr>
                <th className="sticky start-0 z-10 bg-white dark:bg-slate-900 border-e border-line dark:border-slate-800 p-3 sm:p-4 min-w-[120px] sm:w-44 text-ink/70 dark:text-slate-400 text-start">{t('comparePage.colFeature')}</th>
                {items.map((p) => (
                  <th key={p.id} className="p-3 sm:p-4 min-w-[175px] sm:min-w-[220px] align-top text-start">
                    <div className="space-y-2">
                      <img
                        {...buildResponsiveImageProps(p.imageUrl, {
                          widths: [240, 480],
                          sizes: '220px',
                        })}
                        alt={p.titleFa}
                        width={240}
                        height={160}
                        className="w-full h-28 sm:h-32 object-cover rounded-lg bg-surface"
                      />
                      <Link to={`/product/${p.slug}`} className="block font-bold hover:text-brand">{p.titleFa}</Link>
                      <button
                        type="button"
                        onClick={() => toggleCompare(p.id)}
                        className="min-h-[36px] text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('actions.delete')}</span>
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-slate-800">
              <tr>
                <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 border-e border-line dark:border-slate-800 p-3 sm:p-4 font-bold text-ink/75 dark:text-slate-300">{t('comparePage.rowPrice')}</td>
                {items.map((p) => (
                  <td key={p.id} className="p-3 sm:p-4 font-extrabold text-brand tabular-nums">
                    {getProductPriceSummary(p, { customerGroup, campaigns, currency, settings, contractPrices, userId: authUser?.uid }).label}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 border-e border-line dark:border-slate-800 p-3 sm:p-4 font-bold text-ink/75 dark:text-slate-300">{t('comparePage.rowBrandOrigin')}</td>
                {items.map((p) => (
                  <td key={p.id} className="p-3 sm:p-4">
                    {brands.find((b) => b.id === p.brandId)?.nameFa} · {p.originCountryFa}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 border-e border-line dark:border-slate-800 p-3 sm:p-4 font-bold text-ink/75 dark:text-slate-300">{t('comparePage.rowWarranty')}</td>
                {items.map((p) => (
                  <td key={p.id} className="p-3 sm:p-4 tabular-nums">
                    {p.warrantyMonths
                      ? t('comparePage.warrantyMonths', { months: formatDigits(p.warrantyMonths) })
                      : t('comparePage.consumableLabel')}
                  </td>
                ))}
              </tr>
              {comparableAttrs.map((attr) => (
                <tr key={attr.id}>
                  <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 border-e border-line dark:border-slate-800 p-3 sm:p-4 font-bold text-ink/75 dark:text-slate-300">{attr.labelFa}</td>
                  {items.map((p) => {
                    const val = p.attributes[attr.code];
                    return (
                      <td key={p.id} className="p-3 sm:p-4 tabular-nums">
                        {val === undefined
                          ? '—'
                          : typeof val === 'boolean'
                          ? val ? t('comparePage.boolYes') : t('comparePage.boolNo')
                          : Array.isArray(val)
                          ? val.join(t('common.commaSeparator'))
                          : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WishlistPage() {
  const { wishlistIds, products, settings } = useStore();
  const { t } = useI18n();

  useEffect(() => {
    applySeoHead({
      title: `${t('wishlistPage.title')} | ${settings.storeNameFa}`,
      description: t('wishlistPage.seoDescription'),
      canonicalPath: '/wishlist',
      robots: 'noindex, follow',
    });
  }, [settings.storeNameFa, t]);

  const items = products.filter((p) => wishlistIds.includes(p.id));
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold">{t('wishlistPage.heading')}</h1>
      {items.length === 0 ? (
        <EmptyState
          title={t('wishlistPage.empty')}
          actionLabel={t('comparePage.backToStore')}
          actionTo="/"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
