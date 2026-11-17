import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Download, FileUp, ShieldCheck } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { normalizePersian } from '../../lib/persian-search';
import { auditSeoHealth } from '../../lib/seo';
import { AdminRoleCode, BlogPost, Product, RedirectRule } from '../../types/domain';
import { ADMIN_ROLE_LABELS } from '../../components/admin/rbac';

export function AdminReportsPage() {
  const { orders, products, categories, brands, currency } = useStore();

  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    orders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const catName = categories.find((c) => c.id === prod?.primaryCategoryId)?.nameFa ?? 'سایر';
          map.set(catName, (map.get(catName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries()).map(([category, revenue]) => ({ category, revenue }));
  }, [orders, products, categories]);

  const brandShare = useMemo(() => {
    return brands.map((b) => ({
      brand: b.nameFa,
      productsCount: products.filter((p) => p.brandId === b.id).length,
      soldCount: products.filter((p) => p.brandId === b.id).reduce((s, p) => s + p.soldCount, 0),
    }));
  }, [brands, products]);

  const exportSalesCsv = () => {
    const rows = orders.map((o) => [o.orderNo, o.customerName, o.customerGroup, o.status, String(o.grandTotal)]);
    const csv = ['order_no,customer,group,status,grand_total', ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dental-sales-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-extrabold">گزارش‌های تحلیلی و مالی (§12)</h1>
        <button
          type="button"
          onClick={exportSalesCsv}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          <Download className="w-4 h-4" />
          <span>خروجی گزارش فروش CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">فروش به تفکیک دسته‌بندی</h2>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="revenue" fill="#17788C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">عملکرد برندها</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">برند</th>
                  <th className="py-2 text-right">تعداد کالا</th>
                  <th className="py-2 text-right">فروش تجمیعی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {brandShare.map((b) => (
                  <tr key={b.brand}>
                    <td className="py-2 font-bold">{b.brand}</td>
                    <td className="py-2 tabular-nums">{toPersianDigits(b.productsCount)}</td>
                    <td className="py-2 tabular-nums font-bold text-brand">{toPersianDigits(b.soldCount)} عدد</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminContentPage() {
  const { blogPosts, agents, upsertBlogPost } = useStore();
  const [postForm, setPostForm] = useState({ titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const post: BlogPost = {
      id: `blog_${now}`,
      titleFa: postForm.titleFa,
      slug: `post-${now}`,
      categoryFa: postForm.categoryFa,
      excerptFa: postForm.excerptFa,
      bodyFa: postForm.bodyFa,
      imageUrl: '/src/assets/images/hero_dental_clinic_1794921818923.jpg',
      authorName: 'دکتر سارا احمدی',
      authorRole: 'متخصص دندانپزشکی ترمیمی',
      reviewedBy: 'هیئت علمی دنتال‌مارکت',
      readingMinutes: 5,
      productIds: [],
      status: 'published',
      publishedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await upsertBlogPost(post);
    setPostForm({ titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">مدیریت محتوا، مجله تخصصی و شعب استانی</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handlePublish} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">انتشار مقاله تخصصی جدید</h2>
          <input
            required
            value={postForm.titleFa}
            onChange={(e) => setPostForm({ ...postForm, titleFa: e.target.value })}
            placeholder="عنوان مقاله..."
            className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <input
            value={postForm.categoryFa}
            onChange={(e) => setPostForm({ ...postForm, categoryFa: e.target.value })}
            placeholder="دسته علمی..."
            className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <input
            required
            value={postForm.excerptFa}
            onChange={(e) => setPostForm({ ...postForm, excerptFa: e.target.value })}
            placeholder="چکیده مقاله برای سئو..."
            className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <textarea
            required
            rows={4}
            value={postForm.bodyFa}
            onChange={(e) => setPostForm({ ...postForm, bodyFa: e.target.value })}
            placeholder="متن کامل علمی مقاله..."
            className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">
            انتشار مقاله
          </button>
        </form>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <h2 className="text-base font-extrabold">مقالات منتشرشده ({toPersianDigits(blogPosts.length)})</h2>
          {blogPosts.map((bp) => (
            <div key={bp.id} className="p-3 rounded-xl border border-line dark:border-slate-800">
              <p className="font-bold">{bp.titleFa}</p>
              <p className="text-ink/55">{bp.authorName} · {formatJalaliDate(bp.publishedAt)}</p>
            </div>
          ))}
          <h2 className="text-base font-extrabold pt-2">شعب و نمایندگان فعال ({toPersianDigits(agents.length)})</h2>
          {agents.map((ag) => (
            <div key={ag.id} className="p-3 rounded-xl bg-surface/60 dark:bg-slate-800">
              <p className="font-bold">{ag.nameFa}</p>
              <p className="text-ink/60">{ag.province}، {ag.city} · {ag.phone}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminSeoPage() {
  const { products, categories, blogPosts, brands, redirects, upsertRedirect } = useStore();
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [code, setCode] = useState<301 | 302 | 410>(301);

  const findings = useMemo(
    () => auditSeoHealth(products, categories, blogPosts),
    [products, categories, blogPosts]
  );

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
      <h1 className="text-xl font-extrabold">سلامت سئو، قوانین ریدایرکت و سایت‌مپ (§17)</h1>

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold">چک‌لیست سلامت خودکار سئو و Schema</h2>
          <span className="text-xs font-bold text-brand tabular-nums">
            تعداد URLهای قابل ایندکس در Sitemap: {toPersianDigits(indexableCount)} صفحه
          </span>
        </div>
        <div className="divide-y divide-line dark:divide-slate-800 text-xs">
          {findings.map((f) => (
            <div key={f.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
              <div className="space-y-0.5">
                <p className="font-bold flex items-center gap-2">
                  {f.severity === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className={`w-4 h-4 ${f.severity === 'error' ? 'text-rose-600' : 'text-amber-600'}`} />
                  )}
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

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
        <h2 className="text-base font-extrabold">مدیریت ریدایرکت‌ها (301 / 302 / 410)</h2>
        <form onSubmit={handleAddRedirect} className="flex flex-wrap gap-2">
          <input
            required
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            placeholder="/old-path"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <input
            value={toPath}
            onChange={(e) => setToPath(e.target.value)}
            placeholder="/new-path"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <select
            value={code}
            onChange={(e) => setCode(Number(e.target.value) as 301 | 302 | 410)}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value={301}>301 دائم</option>
            <option value={302}>302 موقت</option>
            <option value={410}>410 حذف‌شده</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand text-white font-bold">
            افزودن ریدایرکت
          </button>
        </form>
        <div className="divide-y divide-line dark:divide-slate-800">
          {redirects.map((r) => (
            <div key={r.id} className="py-2 flex justify-between">
              <span dir="ltr" className="font-mono">{r.fromPath} → {r.toPath}</span>
              <span className="font-bold">{r.statusCode} · {toPersianDigits(r.hitCount)} بازدید</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminImportExportPage() {
  const { products, brands, categories, upsertProduct, pushToast } = useStore();
  const [csvText, setCsvText] = useState('');
  const [dryRunRows, setDryRunRows] = useState<{ row: number; sku: string; titleFa: string; price: number; status: 'ok' | 'error'; msg: string }[]>([]);

  const handleDownloadTemplate = () => {
    const csv = [
      'sku,title_fa,title_en,base_price,stock_on_hand',
      'DM-DEMO-01,کامپوزیت نانو نمونه,Nano Composite Sample,1950000,12',
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDryRun = () => {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      pushToast('فایل یا متن CSV حداقل باید شامل سرستون و یک ردیف داده باشد.', 'error');
      return;
    }
    const parsed = lines.slice(1).map((line, idx) => {
      const [sku = '', titleFa = '', , rawPrice = '0'] = line.split(',').map((s) => normalizePersian(s.trim()));
      const price = Number(rawPrice);
      if (!sku || !titleFa || Number.isNaN(price) || price <= 0) {
        return { row: idx + 2, sku, titleFa, price: 0, status: 'error' as const, msg: 'SKU، عنوان یا قیمت نامعتبر است' };
      }
      return { row: idx + 2, sku, titleFa, price, status: 'ok' as const, msg: 'آماده ثبت' };
    });
    setDryRunRows(parsed);
  };

  const handleCommitImport = async () => {
    const valid = dryRunRows.filter((r) => r.status === 'ok');
    for (const r of valid) {
      const existing = products.find((p) => p.sku === r.sku);
      if (existing) {
        const nextVars = existing.variants.map((v, i) => (i === 0 ? { ...v, basePrice: r.price } : v));
        await upsertProduct({ ...existing, titleFa: r.titleFa, variants: nextVars });
      } else {
        const prod: Product = {
          id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          vertical: 'dental',
          sku: r.sku,
          titleFa: r.titleFa,
          titleEn: r.sku,
          slug: `imp-${r.sku.toLowerCase()}`,
          brandId: brands[0]?.id ?? 'br_3m',
          originCountryCode: 'DE',
          originCountryFa: 'آلمان',
          primaryCategoryId: categories[0]?.id ?? 'cat_restorative',
          categoryIds: [categories[0]?.id ?? 'cat_restorative'],
          kind: 'consumable',
          status: 'active',
          pricingMode: 'fixed',
          shortDescriptionFa: r.titleFa,
          descriptionFa: r.titleFa,
          imageUrl: '/src/assets/images/product_composite_kit_1794921818527.jpg',
          galleryUrls: ['/src/assets/images/product_composite_kit_1794921818527.jpg'],
          installationAvailable: false,
          trainingAvailable: false,
          minOrderQty: 1,
          ratingAvg: 0,
          ratingCount: 0,
          viewCount: 0,
          soldCount: 0,
          tags: [],
          attributes: {},
          variants: [
            {
              id: `var_${Date.now()}`,
              sku: `${r.sku}-STD`,
              labelFa: 'بسته استاندارد',
              optionType: 'pack',
              optionValueFa: 'استاندارد',
              basePrice: r.price,
              stockOnHand: 10,
              reserved: 0,
              lowStockThreshold: 2,
              weightG: 120,
              isDefault: true,
              isActive: true,
            },
          ],
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await upsertProduct(prod);
      }
    }
    setDryRunRows([]);
    setCsvText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">ورود و خروج گروهی داده با اعتبارسنجی Dry-Run (§13)</h1>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
        >
          <Download className="w-4 h-4" />
          <span>دانلود قالب CSV محصولات</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <p className="text-ink/70 dark:text-slate-400">
          اعداد فارسی و حروف عربی به‌صورت خودکار نرمال‌سازی می‌شوند. پیش از هر تغییری، اعتبارسنجی ردیف‌به‌ردیف (Dry-Run) انجام می‌شود.
        </p>
        <textarea
          rows={5}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'sku,title_fa,title_en,base_price\nDM-TEST-01,ماده قالب‌گیری آلژینات,Alginate,480000'}
          className="w-full p-3 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-mono text-xs"
          dir="ltr"
        />
        <div className="flex gap-2">
          <button type="button" onClick={handleDryRun} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white font-bold">
            <FileUp className="w-4 h-4" />
            <span>اعتبارسنجی Dry-Run</span>
          </button>
          {dryRunRows.some((r) => r.status === 'ok') && (
            <button type="button" onClick={handleCommitImport} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
              ثبت ردیف‌های سالم در کاتالوگ
            </button>
          )}
        </div>

        {dryRunRows.length > 0 && (
          <div className="divide-y divide-line dark:divide-slate-800 pt-2">
            {dryRunRows.map((r) => (
              <div key={r.row} className="py-2 flex justify-between">
                <span>ردیف {toPersianDigits(r.row)}: {r.sku} — {r.titleFa}</span>
                <span className={`font-bold ${r.status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{r.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminSystemPage() {
  const { settings, auditLogs, updateSettings } = useStore();
  const [form, setForm] = useState(settings);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(form);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">تنظیمات کلان فروشگاه، ماتریس دسترسی RBAC و لاگ Audit (§14-15)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">تنظیمات عملیاتی و مالیاتی</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-bold">نام فروشگاه</span>
              <input
                value={form.storeNameFa}
                onChange={(e) => setForm({ ...form, storeNameFa: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">نرخ مالیات (٪)</span>
              <input
                type="number"
                value={form.taxRatePercent}
                onChange={(e) => setForm({ ...form, taxRatePercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">آستانه ارسال رایگان (تومان)</span>
              <input
                type="number"
                value={form.freeShippingThreshold}
                onChange={(e) => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">آستانه هشدار نزدیک انقضا (روز)</span>
              <input
                type="number"
                value={form.nearExpiryThresholdDays}
                onChange={(e) => setForm({ ...form, nearExpiryThresholdDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-bold">نشانی فروشگاه</span>
              <input
                value={form.addressFa}
                onChange={(e) => setForm({ ...form, addressFa: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
          </div>
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
            ذخیره تنظیمات
          </button>
        </form>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>ماتریس نقش‌ها و دسترسی‌های سازمانی (RBAC)</span>
          </h2>
          <div className="space-y-2">
            {(Object.keys(ADMIN_ROLE_LABELS) as AdminRoleCode[]).map((role) => (
              <div key={role} className="p-2.5 rounded-lg bg-surface/60 dark:bg-slate-800 flex justify-between">
                <span className="font-bold">{ADMIN_ROLE_LABELS[role]}</span>
                <span className="text-ink/60">{role === 'super_admin' ? 'دسترسی کامل + کلیدهای امنیتی' : 'محدود به ماژول‌های تخصصی نقش'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
        <h2 className="text-base font-extrabold">لاگ تغییرناپذیر فعالیت‌ها (Audit Log)</h2>
        <div className="divide-y divide-line dark:divide-slate-800 max-h-80 overflow-y-auto">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-2.5 flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-bold">{log.summaryFa}</p>
                <p className="text-ink/55">{log.actorEmail} · {log.action}</p>
              </div>
              <span className="tabular-nums text-ink/55">{formatJalaliDateTime(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
