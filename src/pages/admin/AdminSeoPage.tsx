import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { auditSeoHealth, findOrphanProducts } from '../../lib/seo';
import { RedirectRule } from '../../types/domain';

export function AdminSeoPage() {
  const { products, categories, blogPosts, brands, redirects, notFoundLogs, upsertRedirect, deleteRedirect } = useStore();
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [code, setCode] = useState<301 | 302 | 410>(301);

  const findings = useMemo(() => auditSeoHealth(products, categories, blogPosts), [products, categories, blogPosts]);
  const orphans = useMemo(() => findOrphanProducts(products, categories), [products, categories]);

  const handleAddRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPath.startsWith('/')) return;
    const rule: RedirectRule = {
      id: `red_${Date.now()}`,
      fromPath: fromPath.trim(),
      toPath: toPath.trim() || '/',
      statusCode: code,
      hitCount: 0,
      createdAt: new Date().toISOString(),
    };
    await upsertRedirect(rule);
    setFromPath('');
    setToPath('');
  };

  const indexableCount =
    1 +
    categories.filter((c) => c.isActive).length +
    products.filter((p) => p.status === 'active').length +
    brands.filter((b) => b.isActive).length +
    blogPosts.filter((p) => p.status === 'published').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">سلامت سئو، صفحات یتیم، ۴۰۴، ریدایرکت و سایت‌مپ (§17)</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line font-bold hover:border-brand">
            <Globe className="w-3.5 h-3.5 text-brand" /> sitemap.xml
          </a>
          <a href="/robots.txt" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line font-bold hover:border-brand">
            robots.txt
          </a>
          <a href="/feeds/price-comparison.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line font-bold hover:border-brand">
            فید ترب / ایمالز
          </a>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold">چک‌لیست سلامت خودکار سئو و Schema</h2>
          <span className="text-xs font-bold text-brand tabular-nums">
            URLهای ایندکس‌شونده در Sitemap: {toPersianDigits(indexableCount)} صفحه
          </span>
        </div>
        <div className="divide-y divide-line dark:divide-slate-800 text-xs">
          {findings.map((f) => (
            <div key={f.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
              <div className="space-y-0.5">
                <p className="font-bold flex items-center gap-2">
                  {f.severity === 'pass' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className={`w-4 h-4 ${f.severity === 'error' ? 'text-rose-600' : 'text-amber-600'}`} />}
                  <span>{f.rule}</span>
                </p>
                <p className="text-ink/60">{f.descriptionFa}</p>
              </div>
              <span className="font-extrabold tabular-nums">
                {f.affectedCount === 0 ? 'سالم (۰ خطا)' : `${toPersianDigits(f.affectedCount)} مورد`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Orphan Pages Detector + 404 Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">تشخیص صفحات یتیم (Orphan Products)</h2>
          {orphans.length === 0 ? (
            <p className="text-emerald-700 font-bold">هیچ محصول یتیم بدون دسته‌بندی فعال یافت نشد.</p>
          ) : (
            orphans.map((p) => <p key={p.id} className="p-2 rounded bg-amber-50">{p.titleFa} (/product/{p.slug})</p>)
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">لاگ خطاهای ۴۰۴ پرتکرار + ایجاد ریدایرکت یک‌کلیک</h2>
          {notFoundLogs.map((nf) => (
            <div key={nf.id} className="p-2.5 rounded-lg border border-line flex justify-between items-center gap-2">
              <div>
                <p dir="ltr" className="font-mono font-bold">{nf.path}</p>
                <p className="text-ink/55 tabular-nums">{toPersianDigits(nf.hitCount)} بازدید · {formatJalaliDateTime(nf.lastSeenAt)}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  upsertRedirect({
                    id: `red_${Date.now()}`,
                    fromPath: nf.path,
                    toPath: '/',
                    statusCode: 301,
                    hitCount: 0,
                    createdAt: new Date().toISOString(),
                  })
                }
                className="px-2.5 py-1 rounded bg-brand text-white font-bold"
              >
                ریدایرکت ۳۰۱
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Redirects CRUD */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
        <h2 className="text-base font-extrabold">مدیریت قوانین ریدایرکت (301 / 302 / 410)</h2>
        <form onSubmit={handleAddRedirect} className="flex flex-wrap gap-2">
          <input required value={fromPath} onChange={(e) => setFromPath(e.target.value)} placeholder="/old-path" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
          <input value={toPath} onChange={(e) => setToPath(e.target.value)} placeholder="/new-path" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
          <select value={code} onChange={(e) => setCode(Number(e.target.value) as 301 | 302 | 410)} className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800">
            <option value={301}>301 دائم</option>
            <option value={302}>302 موقت</option>
            <option value={410}>410 حذف‌شده</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand text-white font-bold">افزودن ریدایرکت</button>
        </form>
        <div className="divide-y divide-line dark:divide-slate-800">
          {redirects.map((r) => (
            <div key={r.id} className="py-2 flex justify-between items-center">
              <span dir="ltr" className="font-mono">{r.fromPath} → {r.toPath}</span>
              <div className="flex items-center gap-3">
                <span className="font-bold">{r.statusCode} · {toPersianDigits(r.hitCount)} بازدید</span>
                <button type="button" onClick={() => deleteRedirect(r.id)} className="text-rose-600 font-bold">حذف</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminSeoPage;
