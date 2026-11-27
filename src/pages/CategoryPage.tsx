import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Filter, RotateCcw, X } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { AccessibleModal } from '../components/ui/Modal';
import { EmptyState, ProductGridSkeleton } from '../components/ui/States';
import { useStore } from '../context/StoreContext';
import { useI18n } from '../context/i18n';
import { getProductPriceSummary } from '../lib/pricing';
import { applySeoHead, buildBreadcrumbJsonLd } from '../lib/seo';
import type { Product } from '../types/domain';

type SortOption = 'newest' | 'best_selling' | 'price_asc' | 'price_desc' | 'discount';

export default function CategoryPage() {
  const { slug, brandSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, brands, attributes, products, campaigns, contractPrices, authUser, currency, customerGroup, settings } = useStore();
  const { t, formatDigits } = useI18n();

  const category = categories.find((c) => c.slug === slug);
  const routeBrand = brandSlug ? brands.find((b) => b.slug === brandSlug) : undefined;

  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => {
    if (routeBrand) return [routeBrand.id];
    const bParam = searchParams.get('brand');
    return bParam ? bParam.split(',').filter(Boolean) : [];
  });
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>(() => {
    const oParam = searchParams.get('origin');
    return oParam ? oParam.split(',').filter(Boolean) : [];
  });
  const [onlyInStock, setOnlyInStock] = useState(searchParams.get('inStock') === '1');
  const [onlyDiscount, setOnlyDiscount] = useState(searchParams.get('discount') === '1');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [attrFilters, setAttrFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sort') as SortOption) || 'best_selling');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverData, setServerData] = useState<{
    items: Product[];
    total: number;
    totalPages: number;
    facets?: {
      brands?: Array<{ id: string; slug: string; nameFa: string; nameEn: string; count: number }>;
      origins?: Array<{ code: string; nameFa: string; count: number }>;
    };
  } | null>(null);

  useEffect(() => {
    if (routeBrand) setSelectedBrands([routeBrand.id]);
    else {
      const bParam = searchParams.get('brand');
      setSelectedBrands(bParam ? bParam.split(',').filter(Boolean) : []);
    }
    setPage(Number(searchParams.get('page') || 1));
    setServerData(null);
  }, [slug, brandSlug]);

  // Bidirectional URL Query Parameter Synchronization
  useEffect(() => {
    const next = new URLSearchParams();
    if (!routeBrand && selectedBrands.length > 0) next.set('brand', selectedBrands.join(','));
    if (selectedOrigins.length > 0) next.set('origin', selectedOrigins.join(','));
    if (onlyInStock) next.set('inStock', '1');
    if (onlyDiscount) next.set('discount', '1');
    if (minPrice) next.set('minPrice', minPrice);
    if (maxPrice) next.set('maxPrice', maxPrice);
    if (sortBy !== 'best_selling') next.set('sort', sortBy);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [routeBrand, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, minPrice, maxPrice, sortBy, page, setSearchParams]);

  // All products belonging to this category or its descendant categories
  const categoryProducts = useMemo(() => {
    if (!category) return [];
    const childIds = categories.filter((c) => c.parentId === category.id || c.path.includes(category.slug)).map((c) => c.id);
    const validCatIds = new Set([category.id, ...childIds]);
    return products.filter(
      (p) =>
        p.status === 'active' &&
        (validCatIds.has(p.primaryCategoryId) || p.categoryIds.some((id) => validCatIds.has(id)))
    );
  }, [category, categories, products]);

  useEffect(() => {
    if (!category) {
      setServerData(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({
      category: category.slug,
      sort: sortBy,
      group: customerGroup,
      page: String(page),
      limit: '12',
    });
    if (selectedBrands.length > 0) qs.set('brand', selectedBrands.join(','));
    if (selectedOrigins.length > 0) qs.set('origin', selectedOrigins.join(','));
    if (onlyInStock) qs.set('inStock', '1');
    if (onlyDiscount) qs.set('discount', '1');
    if (minPrice) qs.set('minPrice', minPrice);
    if (maxPrice) qs.set('maxPrice', maxPrice);
    const activeAttrs = Object.fromEntries(
      Object.entries(attrFilters).filter(([, vals]) => vals.length > 0)
    );
    if (Object.keys(activeAttrs).length > 0) {
      qs.set('attrs', JSON.stringify(activeAttrs));
    }

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
        // Offline or local-only fallback uses client-side filteredProducts
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [category, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, minPrice, maxPrice, attrFilters, sortBy, customerGroup, page]);

  // Dynamic attributes configured for this category
  const categoryAttrs = useMemo(() => {
    if (!category) return [];
    return attributes.filter((a) => category.attributeIds.includes(a.id) && a.isFilterable);
  }, [category, attributes]);

  const availableBrands = useMemo(() => {
    if (serverData?.facets?.brands) {
      return serverData.facets.brands
        .map((fb) => {
          const brand = brands.find((b) => b.id === fb.id);
          return brand ? { brand, count: fb.count } : null;
        })
        .filter((x): x is { brand: (typeof brands)[number]; count: number } => x !== null);
    }
    const counts = new Map<string, number>();
    categoryProducts.forEach((p) => counts.set(p.brandId, (counts.get(p.brandId) ?? 0) + 1));
    return brands
      .filter((b) => counts.has(b.id))
      .map((b) => ({ brand: b, count: counts.get(b.id) ?? 0 }));
  }, [serverData?.facets?.brands, categoryProducts, brands]);

  const availableOrigins = useMemo(() => {
    if (serverData?.facets?.origins) {
      return serverData.facets.origins.map((o) => [o.nameFa, o.count] as [string, number]);
    }
    const counts = new Map<string, number>();
    categoryProducts.forEach((p) => counts.set(p.originCountryFa, (counts.get(p.originCountryFa) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [serverData?.facets?.origins, categoryProducts]);

  const filteredProducts = useMemo(() => {
    const minP = minPrice ? Number(minPrice) : null;
    const maxP = maxPrice ? Number(maxPrice) : null;

    const list = categoryProducts.filter((p) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(p.brandId)) return false;
      if (selectedOrigins.length > 0 && !selectedOrigins.includes(p.originCountryFa)) return false;
      const summary = getProductPriceSummary(p, { customerGroup, campaigns, currency, settings, contractPrices, userId: authUser?.uid });
      if (onlyInStock && !summary.inStock) return false;
      if (onlyDiscount && summary.discountPercent <= 0) return false;
      if (minP !== null && (summary.minPrice === null || summary.minPrice < minP)) return false;
      if (maxP !== null && (summary.minPrice === null || summary.minPrice > maxP)) return false;

      for (const [attrCode, wantedKeys] of Object.entries(attrFilters)) {
        if (wantedKeys.length === 0) continue;
        const val = p.attributes[attrCode];
        if (val === undefined) return false;
        if (Array.isArray(val)) {
          if (!wantedKeys.some((wk) => val.includes(wk))) return false;
        } else if (typeof val === 'boolean') {
          if (!wantedKeys.includes(String(val))) return false;
        } else {
          if (!wantedKeys.includes(String(val))) return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const sa = getProductPriceSummary(a, { customerGroup, campaigns, currency, settings, contractPrices, userId: authUser?.uid });
      const sb = getProductPriceSummary(b, { customerGroup, campaigns, currency, settings, contractPrices, userId: authUser?.uid });
      if (sortBy === 'newest') return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortBy === 'price_asc') return (sa.minPrice ?? Number.MAX_SAFE_INTEGER) - (sb.minPrice ?? Number.MAX_SAFE_INTEGER);
      if (sortBy === 'price_desc') return (sb.minPrice ?? 0) - (sa.minPrice ?? 0);
      if (sortBy === 'discount') return sb.discountPercent - sa.discountPercent;
      return b.soldCount - a.soldCount;
    });
  }, [categoryProducts, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, minPrice, maxPrice, attrFilters, sortBy, customerGroup, campaigns, currency, settings, contractPrices, authUser?.uid]);

  // SEO Indexation Matrix §17.2
  useEffect(() => {
    if (!category) return;
    const hasFilterParams =
      (!routeBrand && selectedBrands.length > 0) ||
      selectedOrigins.length > 0 ||
      onlyInStock ||
      onlyDiscount ||
      Boolean(minPrice) ||
      Boolean(maxPrice) ||
      Object.values(attrFilters).some((v) => v.length > 0) ||
      sortBy !== 'best_selling';

    const isFacetWhitelisted = Boolean(routeBrand && categoryProducts.length >= settings.indexableFacetThreshold);
    const canonicalPath = routeBrand
      ? `/category/${category.slug}/brand/${routeBrand.slug}`
      : page > 1 && !hasFilterParams
      ? `/category/${category.slug}?page=${page}`
      : `/category/${category.slug}`;

    const robots = hasFilterParams || (routeBrand && !isFacetWhitelisted) ? 'noindex, follow' : 'index, follow';

    const title = routeBrand
      ? `${category.nameFa} ${routeBrand.nameFa} | ${settings.storeNameFa}`
      : category.metaTitle || `${category.nameFa}: ${t('categoryPage.seoTitleSuffix')} | ${settings.storeNameFa}`;

    const breadcrumbs = [
      { name: t('common.home'), path: '/' },
      { name: category.nameFa, path: `/category/${category.slug}` },
      ...(routeBrand ? [{ name: routeBrand.nameFa, path: `/category/${category.slug}/brand/${routeBrand.slug}` }] : []),
    ];

    applySeoHead({
      title,
      description: category.metaDescription || category.seoTextFa || category.descriptionFa,
      canonicalPath,
      robots,
      jsonLd: [
        buildBreadcrumbJsonLd(breadcrumbs),
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: filteredProducts.slice(0, 12).map((p, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              name: p.titleFa,
              url: `${window.location.origin}/product/${p.slug}`,
            })),
          },
        },
      ],
    });
  }, [category, routeBrand, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, minPrice, maxPrice, attrFilters, sortBy, page, filteredProducts, categoryProducts.length, settings, t]);

  const toggleBrand = (id: string) => {
    setSelectedBrands((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  };

  const toggleAttr = (code: string, key: string) => {
    setAttrFilters((prev) => {
      const cur = prev[code] ?? [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...prev, [code]: next };
    });
    setPage(1);
  };

  const resetFilters = () => {
    setSelectedBrands([]);
    setSelectedOrigins([]);
    setOnlyInStock(false);
    setOnlyDiscount(false);
    setMinPrice('');
    setMaxPrice('');
    setAttrFilters({});
    setSortBy('best_selling');
    setPage(1);
    setSearchParams({});
  };

  if (!category) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          title={t('categoryPage.notFoundTitle')}
          description={t('categoryPage.notFoundDesc')}
          actionLabel={t('actions.backHome')}
          actionTo="/"
        />
      </div>
    );
  }

  const subCategories = categories.filter((c) => c.parentId === category.id && c.isActive);
  const perPage = 12;
  const totalCount = serverData ? serverData.total : filteredProducts.length;
  const totalPages = serverData ? serverData.totalPages : Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const pagedProducts = serverData ? serverData.items : filteredProducts.slice((page - 1) * perPage, page * perPage);
  const activeFilterCount =
    selectedBrands.length +
    selectedOrigins.length +
    (onlyInStock ? 1 : 0) +
    (onlyDiscount ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    Object.values(attrFilters).reduce((s, arr) => s + arr.length, 0);

  const renderFiltersContent = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-line dark:border-slate-800">
        <span className="font-bold text-sm inline-flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-brand" aria-hidden="true" />
          <span>{t('categoryPage.filtersTitle')}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-brand hover:underline inline-flex items-center gap-1 min-h-[36px] px-1"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>{t('categoryPage.clearBtn')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            aria-label={t('actions.close')}
            className="lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-surface dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stock & Discount Toggles */}
      <div className="space-y-2.5 text-sm">
        <label className="flex items-center justify-between cursor-pointer min-h-[36px]">
          <span>{t('categoryPage.onlyInStock')}</span>
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(e) => { setOnlyInStock(e.target.checked); setPage(1); }}
            className="rounded border-line text-brand"
          />
        </label>
        <label className="flex items-center justify-between cursor-pointer min-h-[36px]">
          <span>{t('categoryPage.onlyDiscount')}</span>
          <input
            type="checkbox"
            checked={onlyDiscount}
            onChange={(e) => { setOnlyDiscount(e.target.checked); setPage(1); }}
            className="rounded border-line text-brand"
          />
        </label>
      </div>

      {/* Price Range Filter */}
      <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2 text-xs">
        <h2 className="font-bold text-ink/75 dark:text-slate-300">{t('categoryPage.priceRangeTitle')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            aria-label={t('categoryPage.priceFromPh')}
            placeholder={t('categoryPage.priceFromPh')}
            value={minPrice}
            onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
            className="w-full px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
          />
          <input
            type="number"
            aria-label={t('categoryPage.priceToPh')}
            placeholder={t('categoryPage.priceToPh')}
            value={maxPrice}
            onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
            className="w-full px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
          />
        </div>
      </div>

      {/* Brands Filter */}
      {availableBrands.length > 0 && (
        <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2 max-h-56 overflow-y-auto">
          <h2 className="font-bold text-xs text-ink/75 dark:text-slate-300">{t('categoryPage.brandFilterTitle')}</h2>
          {availableBrands.map(({ brand, count }) => (
            <label key={brand.id} className="flex items-center justify-between text-xs cursor-pointer py-1">
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(brand.id)}
                  onChange={() => toggleBrand(brand.id)}
                />
                <span>{brand.nameFa}</span>
              </span>
              <span className="text-ink/60 dark:text-slate-400 tabular-nums">({formatDigits(count)})</span>
            </label>
          ))}
        </div>
      )}

      {/* Origin Country Filter */}
      {availableOrigins.length > 0 && (
        <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
          <h2 className="font-bold text-xs text-ink/75 dark:text-slate-300">{t('categoryPage.originFilterTitle')}</h2>
          {availableOrigins.map(([country, count]) => (
            <label key={country} className="flex items-center justify-between text-xs cursor-pointer py-1">
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedOrigins.includes(country)}
                  onChange={() => {
                    setSelectedOrigins((prev) =>
                      prev.includes(country) ? prev.filter((x) => x !== country) : [...prev, country]
                    );
                    setPage(1);
                  }}
                />
                <span>{country}</span>
              </span>
              <span className="text-ink/60 dark:text-slate-400 tabular-nums">({formatDigits(count)})</span>
            </label>
          ))}
        </div>
      )}

      {/* Category-Specific Dynamic Attributes */}
      {categoryAttrs.map((attr) => {
        if (attr.type === 'boolean') {
          const checked = (attrFilters[attr.code] ?? []).includes('true');
          return (
            <div key={attr.id} className="pt-4 border-t border-line dark:border-slate-800">
              <label className="flex items-center justify-between text-xs cursor-pointer font-medium py-1">
                <span>{attr.labelFa}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAttr(attr.code, 'true')}
                />
              </label>
            </div>
          );
        }
        if (!attr.options || attr.options.length === 0) return null;
        return (
          <div key={attr.id} className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
            <h2 className="font-bold text-xs text-ink/75 dark:text-slate-300">{attr.labelFa}</h2>
            {attr.options.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={(attrFilters[attr.code] ?? []).includes(opt.key)}
                  onChange={() => toggleAttr(attr.code, opt.key)}
                />
                {opt.colorHex && (
                  <span
                    className="w-3 h-3 rounded-full border border-line"
                    style={{ backgroundColor: opt.colorHex }}
                  />
                )}
                <span>{opt.labelFa}</span>
              </label>
            ))}
          </div>
        );
      })}

      {/* Whitelisted Indexable Category+Brand Links (nofollow if under threshold) */}
      {availableBrands.length > 0 && !routeBrand && (
        <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
          <h2 className="font-bold text-xs text-ink/75 dark:text-slate-300">{t('categoryPage.quickBrandAccess')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {availableBrands.slice(0, 12).map(({ brand, count }) => (
              <Link
                key={brand.id}
                to={`/category/${category.slug}/brand/${brand.slug}`}
                onClick={() => setMobileFiltersOpen(false)}
                rel={count < settings.indexableFacetThreshold ? 'nofollow' : undefined}
                className="text-[11px] px-2.5 py-1.5 rounded bg-surface dark:bg-slate-800 hover:text-brand"
              >
                {brand.nameFa}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* Visible Breadcrumbs */}
      <nav aria-label={t('categoryPage.breadcrumbsAria')} className="flex items-center gap-1.5 text-xs text-ink/70 dark:text-slate-400">
        <Link to="/" className="hover:text-brand">{t('common.home')}</Link>
        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        <Link to={`/category/${category.slug}`} className="hover:text-brand font-medium">{category.nameFa}</Link>
        {routeBrand && (
          <>
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-ink dark:text-slate-200 font-bold">{routeBrand.nameFa}</span>
          </>
        )}
      </nav>

      {/* Single H1 + Short SEO Intro */}
      <header className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold text-ink dark:text-slate-100">
            {routeBrand ? `${category.nameFa} ${routeBrand.nameFa}` : category.nameFa}
          </h1>
          <span className="text-xs text-ink/70 dark:text-slate-400 tabular-nums">
            {t('counts.products', { count: totalCount })}
          </span>
        </div>
        <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed max-w-4xl">
          {category.seoTextFa || category.descriptionFa}
        </p>

        {subCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {subCategories.map((sub) => (
              <Link
                key={sub.id}
                to={`/category/${sub.slug}`}
                className="px-3 py-1.5 rounded-lg bg-surface dark:bg-slate-800 text-xs font-bold hover:text-brand transition-colors"
              >
                {sub.nameFa}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="grid lg:grid-cols-[270px_1fr] gap-6 items-start">
        {/* Desktop Faceted Filters Sidebar */}
        <aside className="hidden lg:block bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-5 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
          {renderFiltersContent()}
        </aside>

        {/* Mobile & Tablet Filter Drawer */}
        <AccessibleModal
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          align="start"
          ariaLabel={t('categoryPage.filtersTitle')}
          containerClassName="lg:hidden"
          panelClassName="w-80 max-w-[88vw] bg-white dark:bg-slate-900 h-full p-5 overflow-y-auto shadow-2xl"
        >
          {renderFiltersContent()}
        </AccessibleModal>

        {/* Product Grid + Sort Bar */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-brand text-brand dark:text-teal-300 text-xs font-bold"
              >
                <Filter className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('categoryPage.filtersTitle')}</span>
                {activeFilterCount > 0 && (
                  <span className="tabular-nums font-extrabold">({formatDigits(activeFilterCount)})</span>
                )}
              </button>
              <span className="text-xs font-bold text-ink/75 dark:text-slate-300">{t('categoryPage.sortLabel')}</span>
            </div>
            <div className="flex flex-nowrap overflow-x-auto no-scrollbar w-full sm:w-auto sm:flex-wrap items-center gap-1.5 text-xs pb-0.5 sm:pb-0">
              {(
                [
                  ['best_selling', t('categoryPage.sorts.bestSelling')],
                  ['newest', t('categoryPage.sorts.newest')],
                  ['price_asc', t('categoryPage.sorts.priceAsc')],
                  ['price_desc', t('categoryPage.sorts.priceDesc')],
                  ['discount', t('categoryPage.sorts.discount')],
                ] as [SortOption, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSortBy(key); setPage(1); }}
                  className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
                    sortBy === key
                      ? 'bg-brand text-white font-bold'
                      : 'bg-surface dark:bg-slate-800 text-ink/80 dark:text-slate-300 hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading && !serverData && pagedProducts.length === 0 ? (
            <ProductGridSkeleton count={6} />
          ) : pagedProducts.length === 0 ? (
            <EmptyState
              title={t('categoryPage.emptyProducts')}
              actionLabel={t('adminReports.empty.clearFilters')}
              onAction={resetFilters}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
              {pagedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Crawlable Pagination Links */}
          {totalPages > 1 && (
            <nav aria-label={t('categoryPage.paginationAria')} className="flex flex-wrap items-center justify-center gap-2 pt-4">
              {Array.from({ length: Math.min(totalPages, 12) }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  to={n === 1 ? `/category/${category.slug}` : `/category/${category.slug}?page=${n}`}
                  onClick={() => setPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                  className={`min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center px-3 rounded-lg text-xs font-bold border ${
                    n === page
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white dark:bg-slate-900 border-line dark:border-slate-700'
                  }`}
                >
                  {formatDigits(n)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
