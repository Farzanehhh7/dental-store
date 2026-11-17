import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Download, Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../../lib/jalali';
import { getProductPriceSummary } from '../../lib/pricing';
import { Brand, Campaign, Category, Coupon, Product, ProductStatus } from '../../types/domain';
import { canSeeCostPrice } from '../../components/admin/rbac';

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminProductsPage() {
  const {
    products,
    categories,
    brands,
    attributes,
    campaigns,
    currency,
    settings,
    activeAdminRole,
    upsertProduct,
    deleteProduct,
  } = useStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'titleFa' | 'stock' | 'price'>('titleFa');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [dense, setDense] = useState(false);
  const [showImedCol, setShowImedCol] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [modalTab, setModalTab] = useState<'basic' | 'variants' | 'attrs' | 'seo'>('basic');

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (catFilter !== 'all' && p.primaryCategoryId !== catFilter) return false;
      if (q) {
        const hit =
          p.titleFa.toLowerCase().includes(q) ||
          p.titleEn.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.imedCode ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'titleFa') {
        cmp = a.titleFa.localeCompare(b.titleFa, 'fa');
      } else if (sortBy === 'stock') {
        const sa = a.variants.reduce((s, v) => s + Math.max(0, v.stockOnHand - v.reserved), 0);
        const sb = b.variants.reduce((s, v) => s + Math.max(0, v.stockOnHand - v.reserved), 0);
        cmp = sa - sb;
      } else {
        const pa = getProductPriceSummary(a, { campaigns, currency, settings }).minPrice ?? 0;
        const pb = getProductPriceSummary(b, { campaigns, currency, settings }).minPrice ?? 0;
        cmp = pa - pb;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, search, statusFilter, catFilter, sortBy, sortDir, campaigns, currency, settings]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filteredProducts.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const selectedList = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k);

  const handleBulkStatus = async (status: ProductStatus) => {
    for (const id of selectedList) {
      const p = products.find((x) => x.id === id);
      if (p) await upsertProduct({ ...p, status });
    }
    setSelectedIds({});
  };

  const handleCreateNew = () => {
    const firstCat = categories[0]?.id ?? 'cat_restorative';
    const firstBrand = brands[0]?.id ?? 'br_3m';
    setEditing({
      id: `prod_${Date.now()}`,
      vertical: 'dental',
      sku: `DM-NEW-${String(Date.now()).slice(-4)}`,
      imedCode: '',
      titleFa: '',
      titleEn: '',
      slug: `product-${Date.now()}`,
      brandId: firstBrand,
      originCountryCode: 'DE',
      originCountryFa: 'آلمان',
      primaryCategoryId: firstCat,
      categoryIds: [firstCat],
      kind: 'consumable',
      status: 'active',
      pricingMode: 'fixed',
      shortDescriptionFa: '',
      descriptionFa: '',
      imageUrl: '/src/assets/images/product_composite_kit_1794921818527.jpg',
      galleryUrls: ['/src/assets/images/product_composite_kit_1794921818527.jpg'],
      warrantyMonths: 12,
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
          sku: `DM-VAR-${String(Date.now()).slice(-4)}`,
          labelFa: 'بسته استاندارد',
          optionType: 'pack',
          optionValueFa: 'استاندارد',
          basePrice: 1500000,
          stockOnHand: 10,
          reserved: 0,
          lowStockThreshold: 3,
          weightG: 150,
          isDefault: true,
          isActive: true,
        },
      ],
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setModalTab('basic');
  };

  const handleExport = () => {
    downloadCsv(
      'dental-products.csv',
      ['sku', 'title_fa', 'title_en', 'imed_code', 'status', 'pricing_mode'],
      filteredProducts.map((p) => [p.sku, p.titleFa, p.titleEn, p.imedCode ?? '', p.status, p.pricingMode])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">مدیریت محصولات و تنوع‌ها ({toPersianDigits(filteredProducts.length)})</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDense((d) => !d)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            {dense ? 'نمای عادی' : 'نمای فشرده'}
          </button>
          <button
            type="button"
            onClick={() => setShowImedCol((s) => !s)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            {showImedCol ? 'مخفی‌سازی کد IMED' : 'نمایش کد IMED'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            <Download className="w-4 h-4" />
            <span>خروجی CSV</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن محصول</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-ink/40 absolute right-3 top-2.5" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="جستجو با نام، SKU یا کد IMED..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
        >
          <option value="all">همه دسته‌ها</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.nameFa}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="out_of_stock">ناموجود</option>
          <option value="coming_soon">به‌زودی</option>
          <option value="draft">پیش‌نویس</option>
          <option value="archived">بایگانی</option>
        </select>
      </div>

      {selectedList.length > 0 && (
        <div className="bg-brand/10 border border-brand/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold">{toPersianDigits(selectedList.length)} محصول انتخاب شده</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => handleBulkStatus('active')} className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold">
              فعال‌سازی
            </button>
            <button type="button" onClick={() => handleBulkStatus('out_of_stock')} className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold">
              ناموجود
            </button>
            <button type="button" onClick={() => handleBulkStatus('archived')} className="px-3 py-1 rounded-lg bg-slate-600 text-white font-bold">
              بایگانی
            </button>
          </div>
        </div>
      )}

      {/* Sortable Paginated Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 bg-surface/90 dark:bg-slate-800/90 text-xs text-ink/70 dark:text-slate-300 border-b border-line dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-bold">انتخاب</th>
                <th className="px-4 py-3 font-bold">
                  <button type="button" onClick={() => toggleSort('titleFa')} className="inline-flex items-center gap-1 font-bold">
                    <span>محصول و SKU</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </th>
                {showImedCol && <th className="px-4 py-3 font-bold">کد IMED</th>}
                <th className="px-4 py-3 font-bold">برند / دسته</th>
                <th className="px-4 py-3 font-bold">
                  <button type="button" onClick={() => toggleSort('price')} className="inline-flex items-center gap-1 font-bold">
                    <span>قیمت ویترین</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3 font-bold">
                  <button type="button" onClick={() => toggleSort('stock')} className="inline-flex items-center gap-1 font-bold">
                    <span>موجودی کل</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3 font-bold">وضعیت</th>
                <th className="px-4 py-3 font-bold">اقدام</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-slate-800">
              {pageRows.map((p) => {
                const b = brands.find((x) => x.id === p.brandId);
                const c = categories.find((x) => x.id === p.primaryCategoryId);
                const sum = getProductPriceSummary(p, { campaigns, currency, settings });
                const totalStock = p.variants.reduce((s, v) => s + Math.max(0, v.stockOnHand - v.reserved), 0);
                const padY = dense ? 'py-1.5' : 'py-3';
                return (
                  <tr key={p.id} className="hover:bg-paper/60 dark:hover:bg-slate-800/40">
                    <td className={`px-4 ${padY}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[p.id])}
                        onChange={(e) => setSelectedIds((s) => ({ ...s, [p.id]: e.target.checked }))}
                      />
                    </td>
                    <td className={`px-4 ${padY}`}>
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <img src={p.imageUrl} alt={p.titleFa} className="w-11 h-8 rounded object-cover bg-surface shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate max-w-[220px]">{p.titleFa}</p>
                          <p className="text-[11px] text-ink/55 tabular-nums">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    {showImedCol && (
                      <td className={`px-4 ${padY} text-xs tabular-nums text-ink/70 dark:text-slate-400`}>
                        {p.imedCode || '—'}
                      </td>
                    )}
                    <td className={`px-4 ${padY} text-xs`}>
                      <p className="font-bold">{b?.nameFa ?? '—'}</p>
                      <p className="text-[11px] text-ink/55">{c?.nameFa ?? '—'}</p>
                    </td>
                    <td className={`px-4 ${padY} text-xs font-extrabold text-brand tabular-nums`}>
                      {sum.label}
                    </td>
                    <td className={`px-4 ${padY} text-xs font-bold tabular-nums`}>
                      {toPersianDigits(totalStock)} عدد
                    </td>
                    <td className={`px-4 ${padY}`}>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-surface dark:bg-slate-800">
                        {p.status}
                      </span>
                    </td>
                    <td className={`px-4 ${padY}`}>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(structuredClone(p));
                            setModalTab('basic');
                          }}
                          aria-label="ویرایش"
                          className="p-1.5 rounded-lg border border-line dark:border-slate-700 hover:border-brand"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProduct(p.id)}
                          aria-label="حذف"
                          className="p-1.5 rounded-lg border border-line dark:border-slate-700 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="tabular-nums">
            صفحه {toPersianDigits(safePage + 1)} از {toPersianDigits(totalPages)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-3 py-1 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
            >
              قبلی
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-3 py-1 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        </div>
      </div>

      {/* Product Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-line dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-extrabold">{editing.titleFa || 'ایجاد محصول جدید'}</h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-3 flex gap-2 border-b border-line dark:border-slate-800 text-xs">
              {[
                { id: 'basic', label: '۱. اطلاعات پایه' },
                { id: 'variants', label: '۲. تنوع‌ها و قیمت' },
                { id: 'attrs', label: '۳. مشخصات فنی' },
                { id: 'seo', label: '۴. سئو و پیش‌نمایش' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setModalTab(t.id as typeof modalTab)}
                  className={`px-3 py-2 border-b-2 font-bold ${
                    modalTab === t.id ? 'border-brand text-brand' : 'border-transparent text-ink/60'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {modalTab === 'basic' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-bold">نام فارسی *</span>
                    <input
                      value={editing.titleFa}
                      onChange={(e) => setEditing({ ...editing, titleFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">نام انگلیسی</span>
                    <input
                      value={editing.titleEn}
                      onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">SKU *</span>
                    <input
                      value={editing.sku}
                      onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">کد IMED</span>
                    <input
                      value={editing.imedCode ?? ''}
                      onChange={(e) => setEditing({ ...editing, imedCode: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">برند</span>
                    <select
                      value={editing.brandId}
                      onChange={(e) => setEditing({ ...editing, brandId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.nameFa}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">دسته‌بندی اصلی</span>
                    <select
                      value={editing.primaryCategoryId}
                      onChange={(e) => setEditing({ ...editing, primaryCategoryId: e.target.value, categoryIds: [e.target.value] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.nameFa}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">وضعیت</span>
                    <select
                      value={editing.status}
                      onChange={(e) => setEditing({ ...editing, status: e.target.value as ProductStatus })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="active">فعال</option>
                      <option value="out_of_stock">ناموجود</option>
                      <option value="coming_soon">به‌زودی</option>
                      <option value="draft">پیش‌نویس</option>
                      <option value="archived">بایگانی</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">مدل قیمت‌گذاری</span>
                    <select
                      value={editing.pricingMode}
                      onChange={(e) => setEditing({ ...editing, pricingMode: e.target.value as Product['pricingMode'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="fixed">قیمت قطعی</option>
                      <option value="range">بازه قیمتی تنوع‌ها</option>
                      <option value="call_for_price">تماس برای قیمت</option>
                    </select>
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="font-bold">معرفی کوتاه</span>
                    <textarea
                      rows={2}
                      value={editing.shortDescriptionFa}
                      onChange={(e) => setEditing({ ...editing, shortDescriptionFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="font-bold">توضیحات تخصصی</span>
                    <textarea
                      rows={3}
                      value={editing.descriptionFa}
                      onChange={(e) => setEditing({ ...editing, descriptionFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                </div>
              )}

              {modalTab === 'variants' && (
                <div className="space-y-3">
                  {editing.variants.map((v, idx) => (
                    <div key={v.id} className="p-3 rounded-xl border border-line dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="space-y-1">
                        <span className="font-bold">برچسب تنوع</span>
                        <input
                          value={v.labelFa}
                          onChange={(e) => {
                            const next = [...editing.variants];
                            next[idx] = { ...v, labelFa: e.target.value };
                            setEditing({ ...editing, variants: next });
                          }}
                          className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">قیمت پایه (تومان)</span>
                        <input
                          type="number"
                          value={v.basePrice ?? 0}
                          onChange={(e) => {
                            const next = [...editing.variants];
                            next[idx] = { ...v, basePrice: Number(e.target.value) || null };
                            setEditing({ ...editing, variants: next });
                          }}
                          className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">موجودی انبار</span>
                        <input
                          type="number"
                          value={v.stockOnHand}
                          onChange={(e) => {
                            const next = [...editing.variants];
                            next[idx] = { ...v, stockOnHand: Number(e.target.value) };
                            setEditing({ ...editing, variants: next });
                          }}
                          className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                      </label>
                      {canSeeCostPrice(activeAdminRole) && (
                        <label className="space-y-1">
                          <span className="font-bold">قیمت خرید (محرمانه)</span>
                          <input
                            type="number"
                            value={v.costPrice ?? 0}
                            onChange={(e) => {
                              const next = [...editing.variants];
                              next[idx] = { ...v, costPrice: Number(e.target.value) };
                              setEditing({ ...editing, variants: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                        </label>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        variants: [
                          ...editing.variants,
                          {
                            id: `var_${Date.now()}`,
                            sku: `${editing.sku}-V${editing.variants.length + 1}`,
                            labelFa: `تنوع ${editing.variants.length + 1}`,
                            optionType: 'pack',
                            optionValueFa: 'جدید',
                            basePrice: editing.variants[0]?.basePrice ?? 1000000,
                            stockOnHand: 5,
                            reserved: 0,
                            lowStockThreshold: 2,
                            weightG: 100,
                            isActive: true,
                          },
                        ],
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-brand text-brand font-bold"
                  >
                    + افزودن تنوع جدید
                  </button>
                </div>
              )}

              {modalTab === 'attrs' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attributes.map((attr) => (
                    <label key={attr.id} className="space-y-1">
                      <span className="font-bold">{attr.labelFa} ({attr.code})</span>
                      <input
                        value={String(editing.attributes[attr.code] ?? '')}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            attributes: { ...editing.attributes, [attr.code]: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </label>
                  ))}
                </div>
              )}

              {modalTab === 'seo' && (
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="font-bold">Meta Title</span>
                    <input
                      value={editing.metaTitle ?? ''}
                      onChange={(e) => setEditing({ ...editing, metaTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-bold">Meta Description</span>
                    <textarea
                      rows={2}
                      value={editing.metaDescription ?? ''}
                      onChange={(e) => setEditing({ ...editing, metaDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <div className="p-4 rounded-xl bg-surface/60 dark:bg-slate-800 space-y-1">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">https://dentalmarket.ir/product/{editing.slug}</p>
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                      {editing.metaTitle || `${editing.titleFa} | ${settings.storeNameFa}`}
                    </p>
                    <p className="text-xs text-ink/70 dark:text-slate-400">
                      {editing.metaDescription || editing.shortDescriptionFa}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-line dark:border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-line text-xs font-bold">
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertProduct(editing);
                  setEditing(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
              >
                ذخیره نهایی محصول
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminCategoriesPage() {
  const { categories, attributes, products, upsertCategory } = useStore();
  const [editing, setEditing] = useState<Category | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-extrabold">مدیریت درخت دسته‌بندی‌ها و مجموعه ویژگی‌ها</h1>
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: `cat_${Date.now()}`,
              parentId: null,
              path: `cat-${Date.now()}`,
              depth: 0,
              vertical: 'dental',
              nameFa: '',
              nameEn: '',
              slug: `category-${Date.now()}`,
              descriptionFa: '',
              seoTextFa: '',
              isActive: true,
              showInMenu: true,
              showOnHome: true,
              sortOrder: categories.length + 1,
              attributeIds: [],
              updatedAt: new Date().toISOString(),
            })
          }
          className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          + دسته‌بندی جدید
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
        {categories
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => {
            const count = products.filter((p) => p.categoryIds.includes(cat.id)).length;
            return (
              <div key={cat.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div style={{ paddingRight: `${cat.depth * 24}px` }}>
                  <p className="font-extrabold text-sm">{cat.depth > 0 ? '↳ ' : ''}{cat.nameFa} ({cat.nameEn})</p>
                  <p className="text-ink/55 tabular-nums">
                    /{cat.slug} · {toPersianDigits(count)} محصول · {toPersianDigits(cat.attributeIds.length)} ویژگی متصل
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(structuredClone(cat))}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                >
                  ویرایش و مجموعه ویژگی
                </button>
              </div>
            );
          })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 text-xs">
            <h2 className="text-base font-extrabold">ویرایش دسته‌بندی</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-bold">نام فارسی</span>
                <input
                  value={editing.nameFa}
                  onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">نامک (Slug)</span>
                <input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="font-bold">متن مقدمه سئو</span>
                <textarea
                  rows={2}
                  value={editing.seoTextFa}
                  onChange={(e) => setEditing({ ...editing, seoTextFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <div className="col-span-2 space-y-1">
                <span className="font-bold block">ویژگی‌های فیلترپذیر متصل (Attribute Set):</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {attributes.map((a) => {
                    const checked = editing.attributeIds.includes(a.id);
                    return (
                      <label key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditing({
                              ...editing,
                              attributeIds: checked
                                ? editing.attributeIds.filter((id) => id !== a.id)
                                : [...editing.attributeIds, a.id],
                            })
                          }
                        />
                        <span>{a.labelFa}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-line font-bold">
                بستن
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertCategory(editing);
                  setEditing(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                ذخیره دسته‌بندی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminBrandsPage() {
  const { brands, products, upsertBrand } = useStore();
  const [editing, setEditing] = useState<Brand | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-extrabold">مدیریت برندها و نمایندگی اصالت</h1>
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: `br_${Date.now()}`,
              nameFa: '',
              nameEn: '',
              slug: `brand-${Date.now()}`,
              countryCode: 'DE',
              countryFa: 'آلمان',
              descriptionFa: '',
              isAuthorizedDealer: true,
              isActive: true,
              updatedAt: new Date().toISOString(),
            })
          }
          className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          + برند جدید
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((b) => (
          <div key={b.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-base font-extrabold">{b.nameFa}</h2>
                <p className="text-ink/55">{b.nameEn} · {b.countryFa}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(structuredClone(b))}
                className="px-3 py-1 rounded-lg border border-line dark:border-slate-700 font-bold"
              >
                ویرایش
              </button>
            </div>
            <p className="text-ink/70 dark:text-slate-400 line-clamp-2">{b.descriptionFa}</p>
            <p className="font-bold text-brand tabular-nums">
              {toPersianDigits(products.filter((p) => p.brandId === b.id).length)} محصول · {b.isAuthorizedDealer ? 'نماینده رسمی' : 'عرضه‌کننده'}
            </p>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">اطلاعات برند</h2>
            <input
              value={editing.nameFa}
              onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })}
              placeholder="نام فارسی"
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={editing.nameEn}
              onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
              placeholder="نام انگلیسی"
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={editing.countryFa}
              onChange={(e) => setEditing({ ...editing, countryFa: e.target.value })}
              placeholder="کشور سازنده"
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              rows={2}
              value={editing.descriptionFa}
              onChange={(e) => setEditing({ ...editing, descriptionFa: e.target.value })}
              placeholder="توضیحات برند"
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-line font-bold">
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertBrand(editing);
                  setEditing(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                ذخیره برند
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPricingCampaignsPage() {
  const { campaigns, coupons, products, currency, upsertCampaign, upsertCoupon } = useStore();
  const [newCamp, setNewCamp] = useState({ nameFa: '', discountPercent: 10, days: 7, badgeTextFa: 'پیشنهاد ویژه' });
  const [newCoupon, setNewCoupon] = useState({ code: '', type: 'percent' as Coupon['type'], value: 5, minOrderAmount: 2000000 });

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const c: Campaign = {
      id: `cmp_${now}`,
      nameFa: newCamp.nameFa,
      slug: `camp-${now}`,
      type: 'percent',
      discountPercent: newCamp.discountPercent,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + newCamp.days * 86400000).toISOString(),
      showTimer: true,
      badgeTextFa: newCamp.badgeTextFa,
      status: 'active',
      productIds: products.slice(0, 3).map((p) => p.id),
      updatedAt: new Date().toISOString(),
    };
    await upsertCampaign(c);
    setNewCamp({ nameFa: '', discountPercent: 10, days: 7, badgeTextFa: 'پیشنهاد ویژه' });
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    await upsertCoupon({
      id: `cpn_${now}`,
      code: newCoupon.code.trim().toUpperCase(),
      type: newCoupon.type,
      value: newCoupon.value,
      minOrderAmount: newCoupon.minOrderAmount,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 30 * 86400000).toISOString(),
      usageCount: 0,
      usageLimit: 100,
      isActive: true,
    });
    setNewCoupon({ code: '', type: 'percent', value: 5, minOrderAmount: 2000000 });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">مدیریت قیمت‌گذاری، کمپین‌ها و کدهای تخفیف</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold">کمپین‌های زمان‌دار فعال</h2>
          <div className="space-y-2 text-xs">
            {campaigns.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{c.nameFa} ({toPersianDigits(c.discountPercent)}٪)</p>
                  <p className="text-ink/55">پایان: {formatJalaliDate(c.endsAt)} · {toPersianDigits(c.productIds.length)} محصول</p>
                </div>
                <span className="font-bold text-brand">{c.status}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateCampaign} className="pt-3 border-t border-line dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
            <input
              required
              value={newCamp.nameFa}
              onChange={(e) => setNewCamp({ ...newCamp, nameFa: e.target.value })}
              placeholder="عنوان کمپین..."
              className="col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              type="number"
              min={1}
              max={60}
              value={newCamp.discountPercent}
              onChange={(e) => setNewCamp({ ...newCamp, discountPercent: Number(e.target.value) })}
              placeholder="درصد تخفیف"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              type="number"
              min={1}
              max={60}
              value={newCamp.days}
              onChange={(e) => setNewCamp({ ...newCamp, days: Number(e.target.value) })}
              placeholder="مدت (روز)"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="col-span-2 py-2 rounded-xl bg-brand text-white font-bold">
              ثبت کمپین جدید
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold">کدهای تخفیف</h2>
          <div className="space-y-2 text-xs">
            {coupons.map((cp) => (
              <div key={cp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-extrabold tabular-nums">{cp.code}</p>
                  <p className="text-ink/55 tabular-nums">حداقل سبد: {formatMoney(cp.minOrderAmount, currency)}</p>
                </div>
                <span className="font-bold text-emerald-700">
                  {cp.type === 'free_shipping' ? 'ارسال رایگان' : `${toPersianDigits(cp.value)} ${cp.type === 'percent' ? '٪' : 'تومان'}`}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateCoupon} className="pt-3 border-t border-line dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
            <input
              required
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
              placeholder="کد تخفیف (مثلاً ENDO10)"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={newCoupon.type}
              onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value as Coupon['type'] })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="percent">درصدی</option>
              <option value="fixed">مبلغ ثابت</option>
              <option value="free_shipping">ارسال رایگان</option>
            </select>
            <input
              type="number"
              value={newCoupon.value}
              onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
              placeholder="مقدار"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              type="number"
              value={newCoupon.minOrderAmount}
              onChange={(e) => setNewCoupon({ ...newCoupon, minOrderAmount: Number(e.target.value) })}
              placeholder="حداقل خرید"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="col-span-2 py-2 rounded-xl bg-brand text-white font-bold">
              ثبت کد تخفیف
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
