import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Filter, RotateCcw } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { useStore } from '../context/StoreContext';
import { formatMoney, toPersianDigits } from '../lib/jalali';
import { getProductPriceSummary } from '../lib/pricing';
import { applySeoHead, buildBreadcrumbJsonLd } from '../lib/seo';

type SortOption = 'newest' | 'best_selling' | 'price_asc' | 'price_desc' | 'discount';

export default function CategoryPage() {
  const { slug, brandSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, brands, attributes, products, campaigns, currency, customerGroup, settings } = useStore();

  const category = categories.find((c) => c.slug === slug);
  const routeBrand = brandSlug ? brands.find((b) => b.slug === brandSlug) : undefined;

  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => {
    if (routeBrand) return [routeBrand.id];
    const bParam = searchParams.get('brand');
    return bParam ? bParam.split(',').filter(Boolean) : [];
  });
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [onlyInStock, setOnlyInStock] = useState(searchParams.get('inStock') === '1');
  const [onlyDiscount, setOnlyDiscount] = useState(searchParams.get('discount') === '1');
  const [attrFilters, setAttrFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sort') as SortOption) || 'best_selling');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));

  useEffect(() => {
    if (routeBrand) setSelectedBrands([routeBrand.id]);
    else {
      const bParam = searchParams.get('brand');
      setSelectedBrands(bParam ? bParam.split(',').filter(Boolean) : []);
    }
  }, [slug, brandSlug]);

  // All products belonging to this category or its child categories
  const categoryProducts = useMemo(() => {
    if (!category) return [];
    const childIds = categories.filter((c) => c.parentId === category.id).map((c) => c.id);
    const validCatIds = new Set([category.id, ...childIds]);
    return products.filter(
      (p) =>
        p.status === 'active' &&
        (validCatIds.has(p.primaryCategoryId) || p.categoryIds.some((id) => validCatIds.has(id)))
    );
  }, [category, categories, products]);

  // Dynamic attributes configured for this category
  const categoryAttrs = useMemo(() => {
    if (!category) return [];
    return attributes.filter((a) => category.attributeIds.includes(a.id) && a.isFilterable);
  }, [category, attributes]);

  const availableBrands = useMemo(() => {
    const counts = new Map<string, number>();
    categoryProducts.forEach((p) => counts.set(p.brandId, (counts.get(p.brandId) ?? 0) + 1));
    return brands
      .filter((b) => counts.has(b.id))
      .map((b) => ({ brand: b, count: counts.get(b.id) ?? 0 }));
  }, [categoryProducts, brands]);

  const availableOrigins = useMemo(() => {
    const counts = new Map<string, number>();
    categoryProducts.forEach((p) => counts.set(p.originCountryFa, (counts.get(p.originCountryFa) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [categoryProducts]);

  const filteredProducts = useMemo(() => {
    const list = categoryProducts.filter((p) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(p.brandId)) return false;
      if (selectedOrigins.length > 0 && !selectedOrigins.includes(p.originCountryFa)) return false;
      const summary = getProductPriceSummary(p, { customerGroup, campaigns, currency, settings });
      if (onlyInStock && !summary.inStock) return false;
      if (onlyDiscount && summary.discountPercent <= 0) return false;

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
      const sa = getProductPriceSummary(a, { customerGroup, campaigns, currency, settings });
      const sb = getProductPriceSummary(b, { customerGroup, campaigns, currency, settings });
      if (sortBy === 'newest') return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortBy === 'price_asc') return (sa.minPrice ?? Number.MAX_SAFE_INTEGER) - (sb.minPrice ?? Number.MAX_SAFE_INTEGER);
      if (sortBy === 'price_desc') return (sb.minPrice ?? 0) - (sa.minPrice ?? 0);
      if (sortBy === 'discount') return sb.discountPercent - sa.discountPercent;
      return b.soldCount - a.soldCount;
    });
  }, [categoryProducts, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, attrFilters, sortBy, customerGroup, campaigns, currency, settings]);

  // SEO Indexation Matrix §17.2
  useEffect(() => {
    if (!category) return;
    const hasFilterParams =
      (!routeBrand && selectedBrands.length > 0) ||
      selectedOrigins.length > 0 ||
      onlyInStock ||
      onlyDiscount ||
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
      : `${category.nameFa}: مشخصات و قیمت | ${settings.storeNameFa}`;

    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: category.nameFa, path: `/category/${category.slug}` },
      ...(routeBrand ? [{ name: routeBrand.nameFa, path: `/category/${category.slug}/brand/${routeBrand.slug}` }] : []),
    ];

    applySeoHead({
      title,
      description: category.seoTextFa || category.descriptionFa,
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
  }, [category, routeBrand, selectedBrands, selectedOrigins, onlyInStock, onlyDiscount, attrFilters, sortBy, page, filteredProducts, settings]);

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
    setAttrFilters({});
    setSortBy('best_selling');
    setSearchParams({});
  };

  if (!category) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-extrabold">دسته‌بندی مورد نظر یافت نشد</h1>
        <p className="text-sm text-ink/60 dark:text-slate-400">ممکن است نشانی تغییر کرده باشد یا دسته‌بندی غیرفعال باشد.</p>
        <Link to="/" className="inline-block px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold">
          بازگشت به صفحه اصلی
        </Link>
      </div>
    );
  }

  const subCategories = categories.filter((c) => c.parentId === category.id && c.isActive);
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const pagedProducts = filteredProducts.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* Visible Breadcrumbs */}
      <nav aria-label="مسیر راهنما" className="flex items-center gap-1.5 text-xs text-ink/60 dark:text-slate-400">
        <Link to="/" className="hover:text-brand">خانه</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <Link to={`/category/${category.slug}`} className="hover:text-brand font-medium">{category.nameFa}</Link>
        {routeBrand && (
          <>
            <ChevronLeft className="w-3.5 h-3.5" />
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
          <span className="text-xs text-ink/60 dark:text-slate-400 tabular-nums">
            {toPersianDigits(filteredProducts.length)} محصول
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
        {/* Dynamic Faceted Filters Sidebar */}
        <aside className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-line dark:border-slate-800">
            <span className="font-bold text-sm inline-flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-brand" />
              فیلترهای تخصصی
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-brand hover:underline inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              پاک‌کردن
            </button>
          </div>

          {/* Stock & Discount Toggles */}
          <div className="space-y-2.5 text-sm">
            <label className="flex items-center justify-between cursor-pointer">
              <span>فقط کالاهای موجود</span>
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="rounded border-line text-brand"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span>فقط پیشنهادهای تخفیف‌دار</span>
              <input
                type="checkbox"
                checked={onlyDiscount}
                onChange={(e) => setOnlyDiscount(e.target.checked)}
                className="rounded border-line text-brand"
              />
            </label>
          </div>

          {/* Brands Filter */}
          {availableBrands.length > 0 && (
            <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
              <h2 className="font-bold text-xs text-ink/70 dark:text-slate-400">برند سازنده</h2>
              {availableBrands.map(({ brand, count }) => (
                <label key={brand.id} className="flex items-center justify-between text-xs cursor-pointer py-0.5">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(brand.id)}
                      onChange={() => toggleBrand(brand.id)}
                    />
                    <span>{brand.nameFa}</span>
                  </span>
                  <span className="text-ink/50 tabular-nums">({toPersianDigits(count)})</span>
                </label>
              ))}
            </div>
          )}

          {/* Origin Country Filter */}
          {availableOrigins.length > 0 && (
            <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
              <h2 className="font-bold text-xs text-ink/70 dark:text-slate-400">کشور سازنده</h2>
              {availableOrigins.map(([country, count]) => (
                <label key={country} className="flex items-center justify-between text-xs cursor-pointer py-0.5">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedOrigins.includes(country)}
                      onChange={() =>
                        setSelectedOrigins((prev) =>
                          prev.includes(country) ? prev.filter((x) => x !== country) : [...prev, country]
                        )
                      }
                    />
                    <span>{country}</span>
                  </span>
                  <span className="text-ink/50 tabular-nums">({toPersianDigits(count)})</span>
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
                  <label className="flex items-center justify-between text-xs cursor-pointer font-medium">
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
                <h2 className="font-bold text-xs text-ink/70 dark:text-slate-400">{attr.labelFa}</h2>
                {attr.options.map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
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

          {/* Whitelisted Indexable Category+Brand Links */}
          {availableBrands.length > 0 && !routeBrand && (
            <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2">
              <h2 className="font-bold text-xs text-ink/70 dark:text-slate-400">دسترسی سریع برند در این دسته</h2>
              <div className="flex flex-wrap gap-1.5">
                {availableBrands.map(({ brand }) => (
                  <Link
                    key={brand.id}
                    to={`/category/${category.slug}/brand/${brand.slug}`}
                    className="text-[11px] px-2 py-1 rounded bg-surface dark:bg-slate-800 hover:text-brand"
                  >
                    {brand.nameFa}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Product Grid + Sort Bar */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-ink/70 dark:text-slate-400">مرتب‌سازی:</span>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['best_selling', 'پرفروش‌ترین'],
                  ['newest', 'جدیدترین'],
                  ['price_asc', 'ارزان‌ترین'],
                  ['price_desc', 'گران‌ترین'],
                  ['discount', 'بیشترین تخفیف'],
                ] as [SortOption, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortBy(key)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
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

          {pagedProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm font-bold">محصولی با فیلترهای انتخاب‌شده پیدا نشد.</p>
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold"
              >
                حذف فیلترها
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pagedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Crawlable Pagination Links */}
          {totalPages > 1 && (
            <nav aria-label="صفحه‌بندی" className="flex items-center justify-center gap-2 pt-4">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  to={n === 1 ? `/category/${category.slug}` : `/category/${category.slug}?page=${n}`}
                  onClick={() => setPage(n)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold border ${
                    n === page
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white dark:bg-slate-900 border-line dark:border-slate-700'
                  }`}
                >
                  {toPersianDigits(n)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
