import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { useStore } from '../context/StoreContext';
import { trackEcommerceEvent } from '../lib/analytics';
import { toPersianDigits } from '../lib/jalali';
import { scoreSearchMatch } from '../lib/persian-search';
import { getProductPriceSummary } from '../lib/pricing';
import { applySeoHead } from '../lib/seo';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const { products, brands, categories, settings, submitStockRequest } = useStore();
  const [reqForm, setReqForm] = useState({ contactName: '', mobile: '', titleText: q, brandText: '', description: '' });

  useEffect(() => {
    setInput(q);
    if (q.trim()) {
      trackEcommerceEvent('search', { search_term: q.trim() });
    }
    applySeoHead({
      title: `جستجو: ${q || 'کاتالوگ'} | ${settings.storeNameFa}`,
      description: 'جستجوی تخصصی در محصولات دندانپزشکی',
      canonicalPath: '/search',
      robots: 'noindex, follow',
    });
  }, [q, settings.storeNameFa]);

  const results = useMemo(() => {
    if (!q.trim()) return products.filter((p) => p.status === 'active');
    return products
      .filter((p) => p.status === 'active')
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
  }, [q, products, brands, categories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitStockRequest(reqForm);
    setReqForm({ contactName: '', mobile: '', titleText: '', brandText: '', description: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-extrabold">جستجو در کاتالوگ تجهیزات و مواد دندانپزشکی</h1>
        <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl">
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="نام محصول، کد SKU، کد IMED یا برند..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm"
          />
          <button type="submit" className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-bold inline-flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span>جستجو</span>
          </button>
        </form>
        <p className="text-xs text-ink/60 dark:text-slate-400 tabular-nums">
          {toPersianDigits(results.length)} نتیجه یافت شد
        </p>
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {results.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
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
                      <img src={p.imageUrl} alt={p.titleFa} className="w-full h-32 object-cover rounded-lg bg-surface" />
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
