import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Download,
  Edit3,
  Layers,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../../lib/jalali';
import { getProductPriceSummary } from '../../lib/pricing';
import {
  AttributeDef,
  Brand,
  Bundle,
  Campaign,
  Category,
  ContractPrice,
  Coupon,
  CustomerGroupCode,
  Product,
  ProductStatus,
} from '../../types/domain';
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
      imageUrl: '/src/assets/images/product_composite_kit_1794921818527.jpg',
      galleryUrls: ['/src/assets/images/product_composite_kit_1794921818527.jpg'],
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

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">اسناد و گواهینامه‌های فنی (CE / ISO / IMED / کاتالوگ)</span>
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
                                titleFa: 'گواهینامه استاندارد CE و کاتالوگ فنی',
                                fileSizeLabel: '1.2 MB',
                                code: 'CE-ISO13485',
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
                      <div key={f.id} className="grid grid-cols-3 gap-2">
                        <input
                          value={f.titleFa}
                          onChange={(e) => {
                            const next = [...(editing.files ?? [])];
                            next[fIdx] = { ...f, titleFa: e.target.value };
                            setEditing({ ...editing, files: next });
                          }}
                          className="col-span-2 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <input
                          value={f.code ?? ''}
                          placeholder="کد سند"
                          onChange={(e) => {
                            const next = [...(editing.files ?? [])];
                            next[fIdx] = { ...f, code: e.target.value };
                            setEditing({ ...editing, files: next });
                          }}
                          className="px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
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

export function AdminCategoriesPage() {
  const {
    categories,
    attributes,
    bundles,
    products,
    upsertCategory,
    deleteCategory,
    upsertAttribute,
    deleteAttribute,
    upsertBundle,
    deleteBundle,
  } = useStore();

  const [tab, setTab] = useState<'cats' | 'attrs' | 'bundles'>('cats');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingAttr, setEditingAttr] = useState<AttributeDef | null>(null);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">دسته‌بندی‌ها، ویژگی‌های فنی و پکیج‌ها</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('cats')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'cats' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            دسته‌بندی‌ها ({toPersianDigits(categories.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('attrs')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'attrs' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            ویژگی‌های فنی ({toPersianDigits(attributes.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('bundles')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'bundles' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            باندل و کیت‌ها ({toPersianDigits(bundles.length)})
          </button>
        </div>
      </div>

      {tab === 'cats' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingCat({
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
            {[...categories]
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCat(structuredClone(cat))}
                        className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tab === 'attrs' && (
        <div className="space-y-4 text-xs">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingAttr({
                  id: `attr_${Date.now()}`,
                  code: `attr_${String(Date.now()).slice(-4)}`,
                  labelFa: '',
                  labelEn: '',
                  type: 'select',
                  unit: '',
                  isFilterable: true,
                  isComparable: true,
                  showInSpec: true,
                  options: [],
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              + ویژگی جدید
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
            {attributes.map((a) => (
              <div key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-sm">{a.labelFa} ({a.code})</p>
                  <p className="text-ink/60">
                    نوع: {a.type} {a.unit ? `· واحد: ${a.unit}` : ''} · {a.isFilterable ? 'فیلترپذیر' : ''} {a.isComparable ? '· قابل مقایسه' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingAttr(structuredClone(a))} className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold">
                    ویرایش
                  </button>
                  <button type="button" onClick={() => deleteAttribute(a.id)} className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold">
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'bundles' && (
        <div className="space-y-4 text-xs">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingBundle({
                  id: `bnd_${Date.now()}`,
                  nameFa: '',
                  slug: `bundle-${Date.now()}`,
                  kind: 'starter_pack',
                  descriptionFa: '',
                  imageUrl: '/src/assets/images/product_composite_kit_1794921818527.jpg',
                  discountPercent: 10,
                  items: products.slice(0, 2).map((p) => ({ productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 })),
                  status: 'active',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              + پکیج / باندل جدید
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bundles.map((bn) => (
              <div key={bn.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-extrabold text-sm">{bn.nameFa}</p>
                    <p className="text-ink/55 tabular-nums">/{bn.slug} · {toPersianDigits(bn.discountPercent)}٪ تخفیف · {toPersianDigits(bn.items.length)} کالا</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setEditingBundle(structuredClone(bn))} className="px-2.5 py-1 rounded border border-line font-bold">
                      ویرایش
                    </button>
                    <button type="button" onClick={() => deleteBundle(bn.id)} className="px-2.5 py-1 rounded border border-rose-200 text-rose-600 font-bold">
                      حذف
                    </button>
                  </div>
                </div>
                <p className="text-ink/70">{bn.descriptionFa}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingCat && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 text-xs">
            <h2 className="text-base font-extrabold">ویرایش دسته‌بندی</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-bold">نام فارسی</span>
                <input
                  value={editingCat.nameFa}
                  onChange={(e) => setEditingCat({ ...editingCat, nameFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">نامک (Slug)</span>
                <input
                  value={editingCat.slug}
                  onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">دسته والد</span>
                <select
                  value={editingCat.parentId ?? ''}
                  onChange={(e) => {
                    const pid = e.target.value || null;
                    const parent = categories.find((c) => c.id === pid);
                    setEditingCat({
                      ...editingCat,
                      parentId: pid,
                      depth: parent ? parent.depth + 1 : 0,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                >
                  <option value="">سطح ریشه (دسته اصلی)</option>
                  {categories.filter((c) => c.id !== editingCat.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.nameFa}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-bold">ترتیب نمایش</span>
                <input
                  type="number"
                  value={editingCat.sortOrder}
                  onChange={(e) => setEditingCat({ ...editingCat, sortOrder: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="font-bold">متن مقدمه سئو</span>
                <textarea
                  rows={2}
                  value={editingCat.seoTextFa}
                  onChange={(e) => setEditingCat({ ...editingCat, seoTextFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <div className="col-span-2 space-y-1">
                <span className="font-bold block">ویژگی‌های فیلترپذیر متصل (Attribute Set):</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {attributes.map((a) => {
                    const checked = editingCat.attributeIds.includes(a.id);
                    return (
                      <label key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditingCat({
                              ...editingCat,
                              attributeIds: checked
                                ? editingCat.attributeIds.filter((id) => id !== a.id)
                                : [...editingCat.attributeIds, a.id],
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
              <button type="button" onClick={() => setEditingCat(null)} className="px-4 py-2 rounded-xl border border-line font-bold">
                بستن
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertCategory(editingCat);
                  setEditingCat(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                ذخیره دسته‌بندی
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAttr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">ویرایش ویژگی فنی</h2>
            <div className="grid grid-cols-2 gap-3">
              <input value={editingAttr.labelFa} onChange={(e) => setEditingAttr({ ...editingAttr, labelFa: e.target.value })} placeholder="عنوان فارسی" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={editingAttr.code} onChange={(e) => setEditingAttr({ ...editingAttr, code: e.target.value })} placeholder="کد انگلیسی (code)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <select value={editingAttr.type} onChange={(e) => setEditingAttr({ ...editingAttr, type: e.target.value as AttributeDef['type'] })} className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800">
                <option value="select">انتخابی (Select)</option>
                <option value="boolean">بله/خیر (Boolean)</option>
                <option value="number">عددی</option>
                <option value="text">متنی</option>
              </select>
              <input value={editingAttr.unit ?? ''} onChange={(e) => setEditingAttr({ ...editingAttr, unit: e.target.value })} placeholder="واحد (مثلاً W یا ml)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            </div>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-1.5 font-bold">
                <input type="checkbox" checked={editingAttr.isFilterable} onChange={(e) => setEditingAttr({ ...editingAttr, isFilterable: e.target.checked })} /> فیلترپذیر
              </label>
              <label className="inline-flex items-center gap-1.5 font-bold">
                <input type="checkbox" checked={editingAttr.isComparable} onChange={(e) => setEditingAttr({ ...editingAttr, isComparable: e.target.checked })} /> قابل مقایسه
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAttr(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertAttribute(editingAttr); setEditingAttr(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره ویژگی</button>
            </div>
          </div>
        </div>
      )}

      {editingBundle && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">ویرایش پکیج / باندل</h2>
            <input value={editingBundle.nameFa} onChange={(e) => setEditingBundle({ ...editingBundle, nameFa: e.target.value })} placeholder="عنوان پکیج" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-2">
              <input value={editingBundle.slug} onChange={(e) => setEditingBundle({ ...editingBundle, slug: e.target.value })} placeholder="slug" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input type="number" value={editingBundle.discountPercent} onChange={(e) => setEditingBundle({ ...editingBundle, discountPercent: Number(e.target.value) })} placeholder="درصد تخفیف پکیج" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            </div>
            <textarea rows={2} value={editingBundle.descriptionFa} onChange={(e) => setEditingBundle({ ...editingBundle, descriptionFa: e.target.value })} placeholder="توضیحات پکیج" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <div className="space-y-1 max-h-36 overflow-y-auto border border-line rounded-lg p-2">
              <span className="font-bold block mb-1">اقلام داخل پکیج:</span>
              {products.slice(0, 12).map((p) => {
                const active = editingBundle.items.some((it) => it.productId === p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const nextItems = active
                          ? editingBundle.items.filter((it) => it.productId !== p.id)
                          : [...editingBundle.items, { productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 }];
                        setEditingBundle({ ...editingBundle, items: nextItems });
                      }}
                    />
                    <span>{p.titleFa}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingBundle(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertBundle(editingBundle); setEditingBundle(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره پکیج</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminBrandsPage() {
  const { brands, products, upsertBrand, deleteBrand } = useStore();
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
              warrantyProvider: 'نمایندگی رسمی دنتال‌مارکت',
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
            <div className="flex justify-between items-start gap-2">
              <div>
                <h2 className="text-base font-extrabold">{b.nameFa}</h2>
                <p className="text-ink/55">{b.nameEn} · {b.countryFa}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(structuredClone(b))}
                  className="px-2.5 py-1 rounded-lg border border-line dark:border-slate-700 font-bold"
                >
                  ویرایش
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrand(b.id)}
                  className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 font-bold"
                >
                  حذف
                </button>
              </div>
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
            <input value={editing.nameFa} onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })} placeholder="نام فارسی" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} placeholder="نام انگلیسی" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <input value={editing.countryFa} onChange={(e) => setEditing({ ...editing, countryFa: e.target.value })} placeholder="کشور سازنده" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <label className="inline-flex items-center gap-2 font-bold">
              <input type="checkbox" checked={editing.isAuthorizedDealer} onChange={(e) => setEditing({ ...editing, isAuthorizedDealer: e.target.checked })} />
              <span>نماینده رسمی با ضمانت اصالت</span>
            </label>
            <textarea rows={2} value={editing.descriptionFa} onChange={(e) => setEditing({ ...editing, descriptionFa: e.target.value })} placeholder="توضیحات برند" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertBrand(editing); setEditing(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره برند</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPricingCampaignsPage() {
  const {
    campaigns,
    coupons,
    products,
    categories,
    brands,
    contractPrices,
    usersList,
    currency,
    canUndoBulkPrice,
    applyBulkPriceAdjustment,
    undoBulkPriceAdjustment,
    upsertCampaign,
    deleteCampaign,
    upsertCoupon,
    deleteCoupon,
    upsertContractPrice,
    deleteContractPrice,
  } = useStore();

  const [newCamp, setNewCamp] = useState({
    nameFa: '',
    discountPercent: 10,
    days: 7,
    badgeTextFa: 'پیشنهاد ویژه',
    productIds: products.slice(0, 3).map((p) => p.id),
  });
  const [newCoupon, setNewCoupon] = useState({ code: '', type: 'percent' as Coupon['type'], value: 5, minOrderAmount: 2000000 });
  const [bulkForm, setBulkForm] = useState({ scopeType: 'all' as 'all' | 'category' | 'brand', scopeId: '', percent: 5, roundingStep: 10000 });
  const [contractForm, setContractForm] = useState({
    userId: usersList[0]?.uid ?? 'usr_demo_clinic',
    productId: products[0]?.id ?? '',
    unitPrice: 1250000,
    days: 60,
  });

  // Detect active campaign overlaps for selected productIds
  const overlappingCampaigns = useMemo(() => {
    const now = Date.now();
    return campaigns.filter(
      (c) =>
        c.status === 'active' &&
        new Date(c.endsAt).getTime() > now &&
        c.productIds.some((pid) => newCamp.productIds.includes(pid))
    );
  }, [campaigns, newCamp.productIds]);

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
      productIds: newCamp.productIds,
      updatedAt: new Date().toISOString(),
    };
    await upsertCampaign(c);
    setNewCamp({ ...newCamp, nameFa: '' });
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

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = usersList.find((u) => u.uid === contractForm.userId);
    const prod = products.find((p) => p.id === contractForm.productId);
    const varId = prod?.variants[0]?.id;
    if (!prod || !varId) return;
    const rec: ContractPrice = {
      id: `ctr_${Date.now()}`,
      userId: contractForm.userId,
      customerName: user?.clinicName || user?.displayName || contractForm.userId,
      productId: prod.id,
      productTitleFa: prod.titleFa,
      variantId: varId,
      unitPrice: contractForm.unitPrice,
      validUntil: new Date(Date.now() + contractForm.days * 86400000).toISOString(),
      isActive: true,
    };
    await upsertContractPrice(rec);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">مدیریت قیمت‌گذاری گروهی، قراردادهای B2B، کمپین‌ها و کوپن‌ها</h1>

      {/* Bulk Price Adjustment + Undo (§11.6) */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <span>اصلاح گروهی قیمت‌ها + گرد کردن + دکمه بازگشت (Undo)</span>
          </h2>
          {canUndoBulkPrice && (
            <button
              type="button"
              onClick={undoBulkPriceAdjustment}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازگردانی آخرین تغییر گروهی</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <select
            value={bulkForm.scopeType}
            onChange={(e) => setBulkForm({ ...bulkForm, scopeType: e.target.value as 'all' | 'category' | 'brand', scopeId: '' })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value="all">کل کاتالوگ محصولات</option>
            <option value="category">بر اساس دسته‌بندی</option>
            <option value="brand">بر اساس برند</option>
          </select>
          {bulkForm.scopeType === 'category' && (
            <select
              value={bulkForm.scopeId}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">انتخاب دسته...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
            </select>
          )}
          {bulkForm.scopeType === 'brand' && (
            <select
              value={bulkForm.scopeId}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">انتخاب برند...</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.nameFa}</option>)}
            </select>
          )}
          <input
            type="number"
            value={bulkForm.percent}
            onChange={(e) => setBulkForm({ ...bulkForm, percent: Number(e.target.value) })}
            placeholder="درصد تغییر (مثلاً 5 یا -10)"
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <select
            value={bulkForm.roundingStep}
            onChange={(e) => setBulkForm({ ...bulkForm, roundingStep: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value={1000}>گرد به ۱,۰۰۰ تومان</option>
            <option value={10000}>گرد به ۱۰,۰۰۰ تومان</option>
            <option value={50000}>گرد به ۵۰,۰۰۰ تومان</option>
          </select>
          <button
            type="button"
            onClick={() => applyBulkPriceAdjustment(bulkForm)}
            className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
          >
            اعمال گروهی
          </button>
        </div>
      </div>

      {/* Contract Prices (§11.6) */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <h2 className="text-base font-extrabold flex items-center gap-2">
          <PackagePlus className="w-4 h-4 text-brand" />
          <span>قراردادهای قیمت اختصاصی کلینیک‌ها (Contract Prices)</span>
        </h2>
        <form onSubmit={handleCreateContract} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <select
            value={contractForm.userId}
            onChange={(e) => setContractForm({ ...contractForm, userId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            {usersList.map((u) => (
              <option key={u.uid} value={u.uid}>{u.clinicName || u.displayName || u.email}</option>
            ))}
          </select>
          <select
            value={contractForm.productId}
            onChange={(e) => setContractForm({ ...contractForm, productId: e.target.value })}
            className="sm:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.titleFa}</option>
            ))}
          </select>
          <input
            type="number"
            value={contractForm.unitPrice}
            onChange={(e) => setContractForm({ ...contractForm, unitPrice: Number(e.target.value) })}
            placeholder="قیمت قراردادی (تومان)"
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">
            ثبت قرارداد قیمت
          </button>
        </form>
        <div className="divide-y divide-line dark:divide-slate-800">
          {contractPrices.map((cp) => (
            <div key={cp.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
              <div>
                <p className="font-bold">{cp.customerName} — {cp.productTitleFa}</p>
                <p className="text-ink/55 tabular-nums">
                  قیمت توافقی: {formatMoney(cp.unitPrice, currency)} · اعتبار تا {formatJalaliDate(cp.validUntil)}
                </p>
              </div>
              <button type="button" onClick={() => deleteContractPrice(cp.id)} className="px-2.5 py-1 rounded border border-rose-200 text-rose-600 font-bold">
                لغو قرارداد
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Campaigns & Coupons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold">کمپین‌های زمان‌دار و بررسی تداخل تخفیف</h2>
          <div className="space-y-2 text-xs">
            {campaigns.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{c.nameFa} ({toPersianDigits(c.discountPercent)}٪)</p>
                  <p className="text-ink/55">پایان: {formatJalaliDate(c.endsAt)} · {toPersianDigits(c.productIds.length)} محصول</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand">{c.status}</span>
                  <button type="button" onClick={() => deleteCampaign(c.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateCampaign} className="pt-3 border-t border-line dark:border-slate-800 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
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
            </div>
            <div className="max-h-32 overflow-y-auto border border-line dark:border-slate-700 rounded-lg p-2 space-y-1">
              <span className="font-bold block">انتخاب محصولات کمپین:</span>
              {products.slice(0, 12).map((p) => {
                const checked = newCamp.productIds.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setNewCamp({
                          ...newCamp,
                          productIds: checked
                            ? newCamp.productIds.filter((id) => id !== p.id)
                            : [...newCamp.productIds, p.id],
                        })
                      }
                    />
                    <span>{p.titleFa}</span>
                  </label>
                );
              })}
            </div>
            {overlappingCampaigns.length > 0 && (
              <p className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  هشدار تداخل: برخی کالاهای انتخابی هم‌اکنون در کمپین «{overlappingCampaigns[0].nameFa}» قرار دارند (در ویترین بیشترین تخفیف اعمال می‌شود).
                </span>
              </p>
            )}
            <button type="submit" className="w-full py-2 rounded-xl bg-brand text-white font-bold">
              ثبت کمپین جدید
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand" />
            <span>کدهای تخفیف (کوپن‌ها)</span>
          </h2>
          <div className="space-y-2 text-xs">
            {coupons.map((cp) => (
              <div key={cp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-extrabold tabular-nums">{cp.code}</p>
                  <p className="text-ink/55 tabular-nums">حداقل سبد: {formatMoney(cp.minOrderAmount, currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-700">
                    {cp.type === 'free_shipping' ? 'ارسال رایگان' : `${toPersianDigits(cp.value)} ${cp.type === 'percent' ? '٪' : 'تومان'}`}
                  </span>
                  <button type="button" onClick={() => deleteCoupon(cp.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
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
