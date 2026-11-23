import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { useStore } from '../context/StoreContext';
import { trackEcommerceEvent } from '../lib/analytics';
import { toPersianDigits } from '../lib/jalali';
import { buildResponsiveImageProps } from '../lib/media';
import { scoreSearchMatch } from '../lib/persian-search';
import { getProductPriceSummary } from '../lib/pricing';
import { applySeoHead } from '../lib/seo';

import { Product, VerticalType } from '../types/domain';

const VERTICAL_OPTIONS: { id: '' | VerticalType; label: string }[] = [
  { id: '', label: 'همه حوزه‌ها' },
  { id: 'dental', label: 'دندانپزشکی' },
  { id: 'medical', label: 'پزشکی عمومی' },
  { id: 'lab', label: 'آزمایشگاهی' },
];

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
  const [reqForm, setReqForm] = useState({ contactName: '', mobile: '', titleText: q, brandText: '', description: '' });
  const [serverData, setServerData] = useState<{
    items: Product[];
    total: number;
    totalPages: number;
    facets?: {
      brands?: Array<{ id: string; slug: string; nameFa: string; count: number }>;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q);
    if (q.trim()) {
      trackEcommerceEvent('search', { search_term: q.trim() });
    }
    applySeoHead({
      title: `جستجو: ${q || 'کاتالوگ'} | ${settings.storeNameFa}`,
      description: 'جستجوی تخصصی در محصولات تجهیزات پزشکی و دندانپزشکی',
      canonicalPath: '/search',
      robots: 'noindex, follow',
    });
  }, [q, settings.storeNameFa]);

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
    await submitStockRequest(reqForm);
    setReqForm({ contactName: '', mobile: '', titleText: '', brandText: '', description: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-extrabold">جستجو در کاتالوگ تجهیزات و مواد</h1>
        <form onSubmit={handleSearch} className="flex flex-wrap gap-2 max-w-4xl">
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="نام محصول، کد SKU، کد IMED یا برند..."
            className="flex-1 min-w-[220px] px-4 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
          />
          <select
            value={verticalParam}
            onChange={(e) => updateQuery(input, e.target.value as '' | VerticalType, 1)}
            aria-label="فیلتر حوزه تخصصی"
            className="px-3.5 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
          >
            {VERTICAL_OPTIONS.map((v) => (
              <option key={v.id || 'all'} value={v.id}>{v.label}</option>
            ))}
          </select>
          {brandFacets.length > 0 && (
            <select
              value={brandParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, discountParam, e.target.value)}
              aria-label="فیلتر برند"
              className="px-3.5 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
            >
              <option value="">همه برندها</option>
              {brandFacets.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.nameFa} ({toPersianDigits(b.count)})
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={inStockParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, discountParam, brandParam, e.target.checked)}
              className="accent-brand"
            />
            <span>فقط موجود</span>
          </label>
          <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={discountParam}
              onChange={(e) => updateQuery(input, verticalParam, 1, e.target.checked)}
              className="accent-brand"
            />
            <span>فقط تخفیف‌دارها</span>
          </label>
          <button type="submit" className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold inline-flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span>جستجو</span>
          </button>
        </form>
        <p className="text-xs text-ink/60 dark:text-slate-400 tabular-nums">
          {loading ? 'در حال جستجو روی سرور...' : `${toPersianDigits(totalCount)} نتیجه یافت شد`}
          {totalPages > 1 ? ` · صفحه ${toPersianDigits(pageParam)} از ${toPersianDigits(totalPages)}` : ''}
        </p>
      </div>

      {displayItems.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
                className="px-4 py-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
              >
                صفحه قبل
              </button>
              <span className="tabular-nums">
                {toPersianDigits(pageParam)} / {toPersianDigits(totalPages)}
              </span>
              <button
                type="button"
                disabled={pageParam >= totalPages}
                onClick={() => updateQuery(q, verticalParam, pageParam + 1)}
                className="px-4 py-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
              >
                صفحه بعد
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-extrabold">کالای مورد نظر را پیدا نکردید؟ درخواست تأمین ثبت کنید</h2>
          <p className="text-xs text-ink/65 dark:text-slate-400">
            تیم تأمین دنتال‌مارکت کالای درخواستی شما را از تأمین‌کنندگان رسمی استعلام گرفته و اطلاع می‌دهد.
          </p>
          <form onSubmit={handleRequestSubmit} className="space-y-3 text-sm">
            <input
              required
              placeholder="نام کالا / مشخصات (مثلاً سمان RelyX)"
              value={reqForm.titleText}
              onChange={(e) => setReqForm((f) => ({ ...f, titleText: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                required
                placeholder="نام و نام خانوادگی"
                value={reqForm.contactName}
                onChange={(e) => setReqForm((f) => ({ ...f, contactName: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                required
                placeholder="شماره موبایل"
                value={reqForm.mobile}
                onChange={(e) => setReqForm((f) => ({ ...f, mobile: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </div>
            <input
              placeholder="برند مدنظر (اختیاری)"
              value={reqForm.brandText}
              onChange={(e) => setReqForm((f) => ({ ...f, brandText: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              rows={2}
              placeholder="توضیحات بیشتر یا تعداد مورد نیاز"
              value={reqForm.description}
              onChange={(e) => setReqForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="px-5 py-2.5 rounded-lg bg-brand text-white text-xs font-bold">
              ثبت درخواست تأمین کالا
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function ComparePage() {
  const { compareIds, toggleCompare, products, brands, attributes, campaigns, contractPrices, authUser, currency, customerGroup, settings } = useStore();

  useEffect(() => {
    applySeoHead({
      title: `مقایسه محصولات | ${settings.storeNameFa}`,
      description: 'مقایسه فنی مشخصات تجهیزات دندانپزشکی',
      canonicalPath: '/compare',
      robots: 'noindex, follow',
    });
  }, [settings.storeNameFa]);

  const items = products.filter((p) => compareIds.includes(p.id));
  const comparableAttrs = attributes.filter(
    (a) => a.isComparable && items.some((p) => p.attributes[a.code] !== undefined)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold">مقایسه فنی محصولات ({toPersianDigits(items.length)} از ۴)</h1>
      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-ink/60">هنوز محصولی برای مقایسه انتخاب نشده است.</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold">بازگشت به فروشگاه</Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="border-b border-line dark:border-slate-800">
              <tr>
                <th className="p-4 w-44 text-ink/60">مشخصه</th>
                {items.map((p) => (
                  <th key={p.id} className="p-4 min-w-[220px] align-top">
                    <div className="space-y-2">
                      <img
                        {...buildResponsiveImageProps(p.imageUrl, {
                          widths: [240, 480],
                          sizes: '220px',
                        })}
                        alt={p.titleFa}
                        width={240}
                        height={160}
                        className="w-full h-32 object-cover rounded-lg bg-surface"
                      />
                      <Link to={`/product/${p.slug}`} className="block font-bold hover:text-brand">{p.titleFa}</Link>
                      <button
                        type="button"
                        onClick={() => toggleCompare(p.id)}
                        className="text-xs text-rose-600 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-slate-800">
              <tr>
                <td className="p-4 font-bold text-ink/70">قیمت</td>
                {items.map((p) => (
                  <td key={p.id} className="p-4 font-extrabold text-brand tabular-nums">
                    {getProductPriceSummary(p, { customerGroup, campaigns, currency, settings, contractPrices, userId: authUser?.uid }).label}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 font-bold text-ink/70">برند / کشور</td>
                {items.map((p) => (
                  <td key={p.id} className="p-4">
                    {brands.find((b) => b.id === p.brandId)?.nameFa} · {p.originCountryFa}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 font-bold text-ink/70">گارانتی</td>
                {items.map((p) => (
                  <td key={p.id} className="p-4 tabular-nums">
                    {p.warrantyMonths ? `${toPersianDigits(p.warrantyMonths)} ماه` : 'مصرفی'}
                  </td>
                ))}
              </tr>
              {comparableAttrs.map((attr) => (
                <tr key={attr.id}>
                  <td className="p-4 font-bold text-ink/70">{attr.labelFa}</td>
                  {items.map((p) => {
                    const val = p.attributes[attr.code];
                    return (
                      <td key={p.id} className="p-4 tabular-nums">
                        {val === undefined
                          ? '—'
                          : typeof val === 'boolean'
                          ? val ? 'دارد' : 'ندارد'
                          : Array.isArray(val)
                          ? val.join('، ')
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
  useEffect(() => {
    applySeoHead({
      title: `علاقه‌مندی‌ها | ${settings.storeNameFa}`,
      description: 'فهرست محصولات نشان‌شده',
      canonicalPath: '/wishlist',
      robots: 'noindex, follow',
    });
  }, [settings.storeNameFa]);

  const items = products.filter((p) => wishlistIds.includes(p.id));
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold">لیست علاقه‌مندی‌ها</h1>
      {items.length === 0 ? (
        <p className="text-sm text-ink/60">محصولی در لیست علاقه‌مندی‌ها وجود ندارد.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
