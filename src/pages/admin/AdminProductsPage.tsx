import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { toPersianDigits } from '../../lib/jalali';
import { getProductPriceSummary } from '../../lib/pricing';
import { Product, ProductFile, ProductStatus } from '../../types/domain';
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
    productCosts,
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
  const [costMapDraft, setCostMapDraft] = useState<Record<string, number>>({});
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

  const openEditor = (p: Product) => {
    const clone = structuredClone(p);
    const existingCost = productCosts.find((c) => c.productId === p.id)?.variantCosts ?? {};
    const draft: Record<string, number> = {};
    clone.variants.forEach((v) => {
      draft[v.id] = existingCost[v.id] ?? v.costPrice ?? 0;
    });
    setCostMapDraft(draft);
    setEditing(clone);
    setModalTab('basic');
  };

  const handleCreateNew = () => {
    const firstCat = categories[0]?.id ?? 'cat_restorative';
    const firstBrand = brands[0]?.id ?? 'br_3m';
    const varId = `var_${Date.now()}`;
    setCostMapDraft({ [varId]: 1100000 });
    setEditing({
      id: `prod_${Date.now()}`,
      vertical: 'dental',
      sku: `DM-NEW-${String(Date.now()).slice(-4)}`,
      imedCode: '',
      gtin: '',
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
      imageUrl: '/assets/images/product_composite_kit_1794921818527.jpg',
      galleryUrls: ['/assets/images/product_composite_kit_1794921818527.jpg'],
      videoUrl: '',
      warrantyMonths: 12,
      warrantyProvider: 'گارانتی اصلی دنتال‌مارکت',
      installationAvailable: false,
      trainingAvailable: false,
      minOrderQty: 1,
      ratingAvg: 0,
      ratingCount: 0,
      viewCount: 0,
      soldCount: 0,
      tags: [],
      attributes: {},
      files: [],
      variants: [
        {
          id: varId,
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
          batches: [],
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
        <h1 className="text-xl font-extrabold">مدیریت محصولات، واریانت‌ها و بچ‌های FEFO ({toPersianDigits(filteredProducts.length)})</h1>
        <div className="flex flex-wrap items-center gap-2">
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
                          onClick={() => openEditor(p)}
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

      {/* Multi-tab Product Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-line dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-extrabold">{editing.titleFa || 'ایجاد محصول جدید'}</h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-3 flex flex-wrap gap-2 border-b border-line dark:border-slate-800 text-xs">
              {[
                { id: 'basic', label: '۱. اطلاعات پایه و گارانتی' },
                { id: 'variants', label: '۲. تنوع‌ها، هزینه و بچ‌های FEFO' },
                { id: 'attrs', label: '۳. مشخصات، رسانه و گواهینامه‌ها' },
                { id: 'seo', label: '۴. سئو و برچسب‌ها' },
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="space-y-1 sm:col-span-2">
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
                    <span className="font-bold">کد IMED وزارت بهداشت</span>
                    <input
                      value={editing.imedCode ?? ''}
                      onChange={(e) => setEditing({ ...editing, imedCode: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">بارکد GTIN</span>
                    <input
                      value={editing.gtin ?? ''}
                      onChange={(e) => setEditing({ ...editing, gtin: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">حوزه کالا</span>
                    <select
                      value={editing.vertical}
                      onChange={(e) => setEditing({ ...editing, vertical: e.target.value as Product['vertical'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="dental">تجهیزات و مواد دندانپزشکی (Dental)</option>
                      <option value="medical">تجهیزات پزشکی و استریل (Medical)</option>
                      <option value="lab">تجهیزات لابراتواری (Lab)</option>
                    </select>
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
                    <span className="font-bold">نوع کالا</span>
                    <select
                      value={editing.kind}
                      onChange={(e) => setEditing({ ...editing, kind: e.target.value as Product['kind'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="consumable">مواد و ابزار مصرفی</option>
                      <option value="capital_equipment">تجهیزات سرمایه‌ای مطب</option>
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
                  <label className="space-y-1">
                    <span className="font-bold">مدت گارانتی (ماه)</span>
                    <input
                      type="number"
                      value={editing.warrantyMonths ?? 0}
                      onChange={(e) => setEditing({ ...editing, warrantyMonths: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap gap-4 pt-1">
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={editing.installationAvailable}
                        onChange={(e) => setEditing({ ...editing, installationAvailable: e.target.checked })}
                      />
                      <span>نصب و راه‌اندازی در مطب</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={editing.trainingAvailable}
                        onChange={(e) => setEditing({ ...editing, trainingAvailable: e.target.checked })}
                      />
                      <span>آموزش اپراتور کلینیک</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(editing.requiresLicense)}
                        onChange={(e) => setEditing({ ...editing, requiresLicense: e.target.checked })}
                      />
                      <span>نیازمند شماره نظام پزشکی / مجوز</span>
                    </label>
                  </div>
                  <label className="space-y-1 sm:col-span-3">
                    <span className="font-bold">معرفی کوتاه</span>
                    <textarea
                      rows={2}
                      value={editing.shortDescriptionFa}
                      onChange={(e) => setEditing({ ...editing, shortDescriptionFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-3">
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
                <div className="space-y-4">
                  {editing.variants.map((v, idx) => (
                    <div key={v.id} className="p-4 rounded-xl border border-line dark:border-slate-700 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                          <span className="font-bold">SKU تنوع</span>
                          <input
                            value={v.sku}
                            onChange={(e) => {
                              const next = [...editing.variants];
                              next[idx] = { ...v, sku: e.target.value };
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
                            <span className="font-bold text-amber-700">قیمت خرید محرمانه (productCosts)</span>
                            <input
                              type="number"
                              value={costMapDraft[v.id] ?? 0}
                              onChange={(e) => setCostMapDraft({ ...costMapDraft, [v.id]: Number(e.target.value) })}
                              className="w-full px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50/40 dark:bg-slate-800"
                            />
                          </label>
                        )}
                        <label className="space-y-1">
                          <span className="font-bold">آستانه هشدار موجودی</span>
                          <input
                            type="number"
                            value={v.lowStockThreshold}
                            onChange={(e) => {
                              const next = [...editing.variants];
                              next[idx] = { ...v, lowStockThreshold: Number(e.target.value) };
                              setEditing({ ...editing, variants: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="font-bold">کد رنگ (Swatch Hex)</span>
                          <input
                            value={v.colorHex ?? ''}
                            placeholder="#E8D7B2"
                            onChange={(e) => {
                              const next = [...editing.variants];
                              next[idx] = { ...v, colorHex: e.target.value };
                              setEditing({ ...editing, variants: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                        </label>
                      </div>

                      {/* FEFO Batches Sub-editor */}
                      <div className="pt-2 border-t border-line dark:border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-ink/70">بچ‌ها و تاریخ انقضای FEFO</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editing.variants];
                              const batches = [...(v.batches ?? [])];
                              batches.push({
                                id: `b_${Date.now()}`,
                                batchNo: `LOT-${String(Date.now()).slice(-4)}`,
                                warehouseCode: 'TEH-CENTRAL',
                                expiresAt: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
                                qtyOnHand: 5,
                              });
                              next[idx] = { ...v, batches };
                              setEditing({ ...editing, variants: next });
                            }}
                            className="text-brand font-bold hover:underline"
                          >
                            + افزودن بچ انقضا
                          </button>
                        </div>
                        {(v.batches ?? []).map((b, bIdx) => (
                          <div key={b.id} className="grid grid-cols-4 gap-2 bg-surface/50 dark:bg-slate-800/50 p-2 rounded-lg">
                            <input
                              value={b.batchNo}
                              placeholder="کد بچ"
                              onChange={(e) => {
                                const next = [...editing.variants];
                                const batches = [...(v.batches ?? [])];
                                batches[bIdx] = { ...b, batchNo: e.target.value };
                                next[idx] = { ...v, batches };
                                setEditing({ ...editing, variants: next });
                              }}
                              className="px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <input
                              type="date"
                              value={b.expiresAt.slice(0, 10)}
                              onChange={(e) => {
                                const next = [...editing.variants];
                                const batches = [...(v.batches ?? [])];
                                batches[bIdx] = { ...b, expiresAt: e.target.value };
                                next[idx] = { ...v, batches };
                                setEditing({ ...editing, variants: next });
                              }}
                              className="px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <input
                              type="number"
                              value={b.qtyOnHand}
                              placeholder="تعداد بچ"
                              onChange={(e) => {
                                const next = [...editing.variants];
                                const batches = [...(v.batches ?? [])];
                                batches[bIdx] = { ...b, qtyOnHand: Number(e.target.value) };
                                next[idx] = { ...v, batches };
                                setEditing({ ...editing, variants: next });
                              }}
                              className="px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <input
                              type="number"
                              value={b.specialPrice ?? ''}
                              placeholder="قیمت ویژه انقضا"
                              onChange={(e) => {
                                const next = [...editing.variants];
                                const batches = [...(v.batches ?? [])];
                                batches[bIdx] = { ...b, specialPrice: e.target.value ? Number(e.target.value) : null };
                                next[idx] = { ...v, batches };
                                setEditing({ ...editing, variants: next });
                              }}
                              className="px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const vid = `var_${Date.now()}`;
                      setEditing({
                        ...editing,
                        variants: [
                          ...editing.variants,
                          {
                            id: vid,
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
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-brand text-brand font-bold"
                  >
                    + افزودن تنوع جدید
                  </button>
                </div>
              )}

              {modalTab === 'attrs' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="font-bold">لینک تصویر شاخص</span>
                      <input
                        value={editing.imageUrl}
                        onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold">لینک ویدیو معرفی / آموزش</span>
                      <input
                        value={editing.videoUrl ?? ''}
                        onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </label>
                  </div>

                  {/* Verified Certificates & Technical Datasheets Editor */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">اسناد و گواهینامه‌های فنی (CE / ISO / FDA / IMED / کاتالوگ)</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            files: [
                              ...(editing.files ?? []),
                              {
                                id: `f_${Date.now()}`,
                                type: 'certificate_ce',
                                titleFa: 'کاتالوگ فنی محصول',
                                fileSizeLabel: '1.2 MB',
                                code: '',
                                issuer: '',
                                fileUrl: '',
                                isVerified: false,
                              },
                            ],
                          })
                        }
                        className="text-brand font-bold hover:underline"
                      >
                        + افزودن فایل سند
                      </button>
                    </div>
                    {(editing.files ?? []).map((f, fIdx) => (
                      <div key={f.id} className="p-3 rounded-xl border border-line dark:border-slate-700 space-y-2 bg-surface/30 dark:bg-slate-800/30">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <select
                            value={f.type}
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, type: e.target.value as ProductFile['type'] };
                              setEditing({ ...editing, files: next });
                            }}
                            className="px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          >
                            <option value="certificate_ce">گواهی CE اروپا</option>
                            <option value="certificate_iso">استاندارد ISO 13485</option>
                            <option value="certificate_fda">تاییدیه FDA</option>
                            <option value="certificate_imed">مجوز IMED وزارت بهداشت</option>
                            <option value="brochure">بروشور / کاتالوگ فنی</option>
                            <option value="manual">دفترچه راهنما</option>
                          </select>
                          <input
                            value={f.titleFa}
                            placeholder="عنوان سند"
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, titleFa: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-2 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <input
                            value={f.code ?? ''}
                            placeholder="شماره گواهی / کد سند"
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, code: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <input
                            value={f.issuer ?? ''}
                            placeholder="مرجع صادرکننده (مثلاً TÜV SÜD / IMED)"
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, issuer: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-4 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <input
                            value={f.fileUrl ?? ''}
                            placeholder="لینک فایل PDF اصلی (https://...)"
                            dir="ltr"
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, fileUrl: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-4 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-mono text-[11px]"
                          />
                          <label className="sm:col-span-3 inline-flex items-center gap-1.5 font-bold">
                            <input
                              type="checkbox"
                              checked={Boolean(f.isVerified)}
                              onChange={(e) => {
                                const next = [...(editing.files ?? [])];
                                next[fIdx] = { ...f, isVerified: e.target.checked };
                                setEditing({ ...editing, files: next });
                              }}
                            />
                            <span>تاییدشده</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (editing.files ?? []).filter((_, idx) => idx !== fIdx);
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-1 text-rose-600 font-bold text-left"
                            title="حذف فایل"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line dark:border-slate-800">
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
                </div>
              )}

              {modalTab === 'seo' && (
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="font-bold">Slug (نامک آدرس)</span>
                    <input
                      value={editing.slug}
                      onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
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
                  <label className="block space-y-1">
                    <span className="font-bold">برچسب‌ها (جدا با ویرگول انگلیسی یا فارسی)</span>
                    <input
                      value={editing.tags.join(', ')}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          tags: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
                        })
                      }
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
                  await upsertProduct(editing, costMapDraft);
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

export default AdminProductsPage;
