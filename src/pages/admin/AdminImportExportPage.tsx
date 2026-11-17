import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, FileUp } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { normalizePersian } from '../../lib/persian-search';
import { Product } from '../../types/domain';

const IMPORT_TEMPLATES: Record<string, { label: string; sample: Record<string, string | number>[] }> = {
  products: { label: 'قالب محصولات', sample: [{ sku: 'DM-DEMO-01', title_fa: 'کامپوزیت نانو نمونه', title_en: 'Nano Composite', base_price: 1950000, stock_on_hand: 12 }] },
  variants: { label: 'قالب تنوع و شید', sample: [{ product_sku: 'DM-COMP-01', variant_sku: 'DM-COMP-01-A2', label_fa: 'شید A2', base_price: 2450000, stock: 15 }] },
  prices: { label: 'قالب بروزرسانی قیمت', sample: [{ sku: 'DM-ENDO-01', base_price: 1650000, dentist_price: 1490000 }] },
  stock: { label: 'قالب تعدیل موجودی', sample: [{ sku: 'DM-GLOVE-01', stock_on_hand: 120, warehouse: 'TEH-CENTRAL' }] },
  categories: { label: 'قالب دسته‌بندی', sample: [{ slug: 'composite-tools', name_fa: 'ابزارهای کامپوزیت', name_en: 'Composite Instruments' }] },
  brands: { label: 'قالب برندها', sample: [{ slug: 'ivoclar', name_fa: 'ایووکلار ویوادنت', country_fa: 'لیختن‌اشتاین' }] },
  redirects: { label: 'قالب ریدایرکت‌ها', sample: [{ from_path: '/old-dental-unit', to_path: '/category/equipment', status_code: 301 }] },
};

export function AdminImportExportPage() {
  const { products, brands, categories, upsertProduct, pushToast } = useStore();
  const [templateKey, setTemplateKey] = useState('products');
  const [csvText, setCsvText] = useState('');
  const [dryRunRows, setDryRunRows] = useState<{ row: number; sku: string; titleFa: string; price: number; status: 'ok' | 'error'; msg: string }[]>([]);
  const [importJobs, setImportJobs] = useState<{ id: string; count: number; errors: number; createdAt: string }[]>([]);

  const handleDownloadXlsxTemplate = () => {
    const tpl = IMPORT_TEMPLATES[templateKey];
    const ws = XLSX.utils.json_to_sheet(tpl.sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, templateKey);
    XLSX.writeFile(wb, `template-${templateKey}.xlsx`);
  };

  const runValidationFromMatrix = (rows: string[][]) => {
    if (rows.length < 2) {
      pushToast('فایل حداقل باید شامل سرستون و یک ردیف داده باشد.', 'error');
      return;
    }
    const parsed = rows.slice(1).map((cols, idx) => {
      const sku = normalizePersian(String(cols[0] ?? '').trim());
      const titleFa = normalizePersian(String(cols[1] ?? '').trim());
      const rawPrice = normalizePersian(String(cols[3] ?? cols[2] ?? '0').trim());
      const price = Number(rawPrice);
      if (!sku || !titleFa || Number.isNaN(price) || price <= 0) {
        return { row: idx + 2, sku, titleFa, price: 0, status: 'error' as const, msg: 'SKU، عنوان یا قیمت نامعتبر است' };
      }
      return { row: idx + 2, sku, titleFa, price, status: 'ok' as const, msg: 'آماده ثبت' };
    });
    setDryRunRows(parsed);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    runValidationFromMatrix(matrix);
  };

  const handleDryRunText = () => {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split(',').map((s) => s.trim()));
    runValidationFromMatrix(lines);
  };

  const handleDownloadErrorXlsx = () => {
    const errs = dryRunRows.filter((r) => r.status === 'error');
    const ws = XLSX.utils.json_to_sheet(errs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'import-errors.xlsx');
  };

  const handleCommitImport = async () => {
    const valid = dryRunRows.filter((r) => r.status === 'ok');
    const errCount = dryRunRows.filter((r) => r.status === 'error').length;
    for (const r of valid) {
      const existing = products.find((p) => p.sku === r.sku);
      if (existing) {
        const nextVars = existing.variants.map((v, i) => (i === 0 ? { ...v, basePrice: r.price } : v));
        await upsertProduct({ ...existing, titleFa: r.titleFa, variants: nextVars });
      } else {
        const prod: Product = {
          id: `imp_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
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
    setImportJobs((prev) => [{ id: `JOB-${Date.now().toString().slice(-4)}`, count: valid.length, errors: errCount, createdAt: new Date().toISOString() }, ...prev]);
    setDryRunRows([]);
    setCsvText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">ورود و خروج Excel / CSV با Dry-Run و ۷ قالب استاندارد (§13)</h1>
        <div className="flex items-center gap-2 text-xs">
          <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="px-3 py-2 rounded-xl border border-line bg-white dark:bg-slate-900">
            {Object.entries(IMPORT_TEMPLATES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleDownloadXlsxTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
          >
            <Download className="w-4 h-4" />
            <span>دانلود قالب .xlsx</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand text-brand font-bold cursor-pointer">
            <FileSpreadsheet className="w-4 h-4" />
            <span>آپلود مستقیم فایل Excel (.xlsx) یا CSV</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          </label>
          <span className="text-ink/60">یا متن CSV زیر را وارد کنید (ارقام فارسی و حروف عربی خودکار نرمال‌سازی می‌شوند):</span>
        </div>

        <textarea
          rows={4}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'sku,title_fa,title_en,base_price\nDM-TEST-01,ماده قالب‌گیری آلژینات,Alginate,480000'}
          className="w-full p-3 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-mono text-xs"
          dir="ltr"
        />

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleDryRunText} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white font-bold">
            <FileUp className="w-4 h-4" />
            <span>اعتبارسنجی Dry-Run</span>
          </button>
          {dryRunRows.some((r) => r.status === 'ok') && (
            <button type="button" onClick={handleCommitImport} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
              ثبت ردیف‌های سالم در کاتالوگ
            </button>
          )}
          {dryRunRows.some((r) => r.status === 'error') && (
            <button type="button" onClick={handleDownloadErrorXlsx} className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 font-bold">
              دانلود فایل خطاها (.xlsx)
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

      {importJobs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
          <h2 className="text-base font-extrabold">تاریخچه عملیات ورود داده (Import Jobs)</h2>
          {importJobs.map((j) => (
            <div key={j.id} className="p-2.5 rounded-lg border border-line flex justify-between">
              <span className="font-bold">{j.id}: {toPersianDigits(j.count)} ردیف موفق · {toPersianDigits(j.errors)} خطا</span>
              <span className="tabular-nums text-ink/55">{formatJalaliDateTime(j.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminImportExportPage;
