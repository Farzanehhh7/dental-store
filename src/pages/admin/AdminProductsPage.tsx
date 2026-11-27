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
import { useI18n } from '../../context/i18n';
import { AccessibleModal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/States';
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
  const { t, formatDigits } = useI18n();

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
      originCountryFa: t('common.germany'),
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
      warrantyProvider: t('adminProducts.defaultWarrantyProvider'),
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
          labelFa: t('adminProducts.defaultVariantLabel'),
          optionType: 'pack',
          optionValueFa: t('adminProducts.defaultVariantOption'),
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

  const modalTabs = [
    { id: 'basic' as const, label: t('adminProducts.modal.tabBasic') },
    { id: 'variants' as const, label: t('adminProducts.modal.tabVariants') },
    { id: 'attrs' as const, label: t('adminProducts.modal.tabAttrs') },
    { id: 'seo' as const, label: t('adminProducts.modal.tabSeo') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">
          {t('adminProducts.title', { count: formatDigits(filteredProducts.length) })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDense((d) => !d)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            {dense ? t('adminProducts.normalView') : t('adminProducts.denseView')}
          </button>
          <button
            type="button"
            onClick={() => setShowImedCol((s) => !s)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            {showImedCol ? t('adminProducts.hideImed') : t('adminProducts.showImed')}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{t('actions.exportCsv')}</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{t('adminProducts.addBtn')}</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-ink/50 absolute start-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            aria-label={t('adminProducts.searchPlaceholder')}
            placeholder={t('adminProducts.searchPlaceholder')}
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
        </div>
        <select
          value={catFilter}
          aria-label={t('adminProducts.allCategories')}
          onChange={(e) => {
            setCatFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
        >
          <option value="all">{t('adminProducts.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.nameFa}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          aria-label={t('adminProducts.allStatuses')}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
        >
          <option value="all">{t('adminProducts.allStatuses')}</option>
          <option value="active">{t('adminProducts.statusLabels.active')}</option>
          <option value="out_of_stock">{t('adminProducts.statusLabels.out_of_stock')}</option>
          <option value="coming_soon">{t('adminProducts.statusLabels.coming_soon')}</option>
          <option value="draft">{t('adminProducts.statusLabels.draft')}</option>
          <option value="archived">{t('adminProducts.statusLabels.archived')}</option>
        </select>
      </div>

      {selectedList.length > 0 && (
        <div className="bg-brand/10 border border-brand/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold">{t('adminProducts.selectedCount', { count: formatDigits(selectedList.length) })}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => handleBulkStatus('active')} className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold">
              {t('adminProducts.bulkActivate')}
            </button>
            <button type="button" onClick={() => handleBulkStatus('out_of_stock')} className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold">
              {t('adminProducts.statusLabels.out_of_stock')}
            </button>
            <button type="button" onClick={() => handleBulkStatus('archived')} className="px-3 py-1 rounded-lg bg-slate-600 text-white font-bold">
              {t('adminProducts.statusLabels.archived')}
            </button>
          </div>
        </div>
      )}

      {/* Sortable Paginated Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
        {pageRows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={t('adminProducts.emptyTitle')}
              description={t('adminProducts.emptyDesc')}
              actionLabel={t('adminReports.filters.resetBtn')}
              onAction={() => {
                setSearch('');
                setStatusFilter('all');
                setCatFilter('all');
                setPage(0);
              }}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <thead className="sticky top-0 bg-surface/90 dark:bg-slate-800/90 text-xs text-ink/75 dark:text-slate-300 border-b border-line dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-bold text-start">{t('adminProducts.colSelect')}</th>
                    <th className="px-4 py-3 font-bold text-start">
                      <button type="button" onClick={() => toggleSort('titleFa')} className="inline-flex items-center gap-1 font-bold">
                        <span>{t('adminProducts.colProduct')}</span>
                        <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </th>
                    {showImedCol && <th className="px-4 py-3 font-bold text-start">{t('adminProducts.colImed')}</th>}
                    <th className="px-4 py-3 font-bold text-start">{t('adminProducts.colBrandCat')}</th>
                    <th className="px-4 py-3 font-bold text-start">
                      <button type="button" onClick={() => toggleSort('price')} className="inline-flex items-center gap-1 font-bold">
                        <span>{t('adminProducts.colPrice')}</span>
                        <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-bold text-start">
                      <button type="button" onClick={() => toggleSort('stock')} className="inline-flex items-center gap-1 font-bold">
                        <span>{t('adminProducts.colStock')}</span>
                        <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-bold text-start">{t('adminProducts.colStatus')}</th>
                    <th className="px-4 py-3 font-bold text-start">{t('adminProducts.colActions')}</th>
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
                            aria-label={p.titleFa}
                            checked={Boolean(selectedIds[p.id])}
                            onChange={(e) => setSelectedIds((s) => ({ ...s, [p.id]: e.target.checked }))}
                          />
                        </td>
                        <td className={`px-4 ${padY}`}>
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <img src={p.imageUrl} alt={p.titleFa} className="w-11 h-8 rounded object-cover bg-surface shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate max-w-[220px]">{p.titleFa}</p>
                              <p className="text-[11px] text-ink/65 dark:text-slate-400 tabular-nums">{p.sku}</p>
                            </div>
                          </div>
                        </td>
                        {showImedCol && (
                          <td className={`px-4 ${padY} text-xs tabular-nums text-ink/75 dark:text-slate-400`}>
                            {p.imedCode || '—'}
                          </td>
                        )}
                        <td className={`px-4 ${padY} text-xs`}>
                          <p className="font-bold">{b?.nameFa ?? '—'}</p>
                          <p className="text-[11px] text-ink/65 dark:text-slate-400">{c?.nameFa ?? '—'}</p>
                        </td>
                        <td className={`px-4 ${padY} text-xs font-extrabold text-brand tabular-nums`}>
                          {sum.label}
                        </td>
                        <td className={`px-4 ${padY} text-xs font-bold tabular-nums`}>
                          {t('adminProducts.stockUnitCount', { count: formatDigits(totalStock) })}
                        </td>
                        <td className={`px-4 ${padY}`}>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-surface dark:bg-slate-800">
                            {t(`adminProducts.statusLabels.${p.status}`, undefined, p.status)}
                          </span>
                        </td>
                        <td className={`px-4 ${padY}`}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditor(p)}
                              aria-label={t('actions.edit')}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg border border-line dark:border-slate-700 hover:border-brand"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(p.id)}
                              aria-label={t('actions.delete')}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg border border-line dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <Trash2 className="w-4 h-4" />
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
                {t('adminProducts.pagination', {
                  page: formatDigits(safePage + 1),
                  totalPages: formatDigits(totalPages),
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="px-3 py-1 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  {t('common.prevPage')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="px-3 py-1 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  {t('common.nextPage')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Multi-tab Product Edit Modal */}
      <AccessibleModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        ariaLabel={editing?.titleFa || t('adminProducts.modal.createTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {editing && (
          <>
            <div className="px-6 py-4 border-b border-line dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-extrabold">{editing.titleFa || t('adminProducts.modal.createTitle')}</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label={t('actions.close')}
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-surface dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 pt-3 flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 border-b border-line dark:border-slate-800 text-xs">
              {modalTabs.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setModalTab(tb.id)}
                  className={`whitespace-nowrap shrink-0 px-3 py-2 border-b-2 font-bold ${
                    modalTab === tb.id ? 'border-brand text-brand' : 'border-transparent text-ink/70 dark:text-slate-400'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {modalTab === 'basic' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="font-bold">{t('adminProducts.modal.titleFa')}</span>
                    <input
                      value={editing.titleFa}
                      onChange={(e) => setEditing({ ...editing, titleFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.titleEn')}</span>
                    <input
                      value={editing.titleEn}
                      onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.sku')}</span>
                    <input
                      value={editing.sku}
                      onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.imedCode')}</span>
                    <input
                      value={editing.imedCode ?? ''}
                      onChange={(e) => setEditing({ ...editing, imedCode: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.gtin')}</span>
                    <input
                      value={editing.gtin ?? ''}
                      onChange={(e) => setEditing({ ...editing, gtin: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.vertical')}</span>
                    <select
                      value={editing.vertical}
                      onChange={(e) => setEditing({ ...editing, vertical: e.target.value as Product['vertical'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="dental">{t('adminProducts.modal.vertDental')}</option>
                      <option value="medical">{t('adminProducts.modal.vertMedical')}</option>
                      <option value="lab">{t('adminProducts.modal.vertLab')}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.brand')}</span>
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
                    <span className="font-bold">{t('adminProducts.modal.primaryCategory')}</span>
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
                    <span className="font-bold">{t('adminProducts.modal.kind')}</span>
                    <select
                      value={editing.kind}
                      onChange={(e) => setEditing({ ...editing, kind: e.target.value as Product['kind'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="consumable">{t('adminProducts.modal.kindConsumable')}</option>
                      <option value="capital_equipment">{t('adminProducts.modal.kindEquipment')}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.status')}</span>
                    <select
                      value={editing.status}
                      onChange={(e) => setEditing({ ...editing, status: e.target.value as ProductStatus })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="active">{t('adminProducts.statusLabels.active')}</option>
                      <option value="out_of_stock">{t('adminProducts.statusLabels.out_of_stock')}</option>
                      <option value="coming_soon">{t('adminProducts.statusLabels.coming_soon')}</option>
                      <option value="draft">{t('adminProducts.statusLabels.draft')}</option>
                      <option value="archived">{t('adminProducts.statusLabels.archived')}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.pricingMode')}</span>
                    <select
                      value={editing.pricingMode}
                      onChange={(e) => setEditing({ ...editing, pricingMode: e.target.value as Product['pricingMode'] })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    >
                      <option value="fixed">{t('adminProducts.modal.priceFixed')}</option>
                      <option value="range">{t('adminProducts.modal.priceRange')}</option>
                      <option value="call_for_price">{t('adminProducts.modal.priceCall')}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">{t('adminProducts.modal.warrantyMonths')}</span>
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
                      <span>{t('adminProducts.modal.installation')}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={editing.trainingAvailable}
                        onChange={(e) => setEditing({ ...editing, trainingAvailable: e.target.checked })}
                      />
                      <span>{t('adminProducts.modal.training')}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(editing.requiresLicense)}
                        onChange={(e) => setEditing({ ...editing, requiresLicense: e.target.checked })}
                      />
                      <span>{t('adminProducts.modal.requiresLicense')}</span>
                    </label>
                  </div>
                  <label className="space-y-1 sm:col-span-3">
                    <span className="font-bold">{t('adminProducts.modal.shortDesc')}</span>
                    <textarea
                      rows={2}
                      value={editing.shortDescriptionFa}
                      onChange={(e) => setEditing({ ...editing, shortDescriptionFa: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-3">
                    <span className="font-bold">{t('adminProducts.modal.fullDesc')}</span>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <label className="space-y-1">
                          <span className="font-bold">{t('adminProducts.modal.varLabel')}</span>
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
                          <span className="font-bold">{t('adminProducts.modal.varSku')}</span>
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
                          <span className="font-bold">{t('adminProducts.modal.varBasePrice')}</span>
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
                          <span className="font-bold">{t('adminProducts.modal.varStock')}</span>
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
                            <span className="font-bold text-amber-700 dark:text-amber-300">{t('adminProducts.modal.varCostPrice')}</span>
                            <input
                              type="number"
                              value={costMapDraft[v.id] ?? 0}
                              onChange={(e) => setCostMapDraft({ ...costMapDraft, [v.id]: Number(e.target.value) })}
                              className="w-full px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50/40 dark:bg-slate-800"
                            />
                          </label>
                        )}
                        <label className="space-y-1">
                          <span className="font-bold">{t('adminProducts.modal.varThreshold')}</span>
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
                          <span className="font-bold">{t('adminProducts.modal.varColorHex')}</span>
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
                          <span className="font-bold text-ink/75 dark:text-slate-300">{t('adminProducts.modal.batchesTitle')}</span>
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
                            {t('adminProducts.modal.addBatchBtn')}
                          </button>
                        </div>
                        {(v.batches ?? []).map((b, bIdx) => (
                          <div key={b.id} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 bg-surface/50 dark:bg-slate-800/50 p-2 rounded-lg">
                            <input
                              value={b.batchNo}
                              placeholder={t('adminProducts.modal.batchCodePh')}
                              aria-label={t('adminProducts.modal.batchCodePh')}
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
                              aria-label={t('adminProducts.modal.batchExpiryAria')}
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
                              placeholder={t('adminProducts.modal.batchQtyPh')}
                              aria-label={t('adminProducts.modal.batchQtyPh')}
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
                              placeholder={t('adminProducts.modal.batchSpecialPricePh')}
                              aria-label={t('adminProducts.modal.batchSpecialPricePh')}
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
                            labelFa: t('adminProducts.modal.newVariantLabel', { n: editing.variants.length + 1 }),
                            optionType: 'pack',
                            optionValueFa: t('adminProducts.modal.newVariantOption'),
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
                    {t('adminProducts.modal.addVariantBtn')}
                  </button>
                </div>
              )}

              {modalTab === 'attrs' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="font-bold">{t('adminProducts.modal.imageUrl')}</span>
                      <input
                        value={editing.imageUrl}
                        onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold">{t('adminProducts.modal.videoUrl')}</span>
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
                      <span className="font-bold">{t('adminProducts.modal.filesTitle')}</span>
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
                                titleFa: t('adminProducts.modal.defaultFileTitle'),
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
                        {t('adminProducts.modal.addFileBtn')}
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
                            <option value="certificate_ce">{t('adminProducts.modal.fileTypeCe')}</option>
                            <option value="certificate_iso">{t('adminProducts.modal.fileTypeIso')}</option>
                            <option value="certificate_fda">{t('adminProducts.modal.fileTypeFda')}</option>
                            <option value="certificate_imed">{t('adminProducts.modal.fileTypeImed')}</option>
                            <option value="brochure">{t('adminProducts.modal.fileTypeBrochure')}</option>
                            <option value="manual">{t('adminProducts.modal.fileTypeManual')}</option>
                          </select>
                          <input
                            value={f.titleFa}
                            placeholder={t('adminProducts.modal.fileTitlePh')}
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, titleFa: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-2 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <input
                            value={f.code ?? ''}
                            placeholder={t('adminProducts.modal.fileCodePh')}
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
                            placeholder={t('adminProducts.modal.fileIssuerPh')}
                            onChange={(e) => {
                              const next = [...(editing.files ?? [])];
                              next[fIdx] = { ...f, issuer: e.target.value };
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-4 px-2.5 py-1.5 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <input
                            value={f.fileUrl ?? ''}
                            placeholder={t('adminProducts.modal.fileUrlPh')}
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
                            <span>{t('adminProducts.modal.fileVerified')}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (editing.files ?? []).filter((_, idx) => idx !== fIdx);
                              setEditing({ ...editing, files: next });
                            }}
                            className="sm:col-span-1 text-rose-600 font-bold text-end"
                            title={t('actions.delete')}
                          >
                            {t('actions.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line dark:border-slate-800">
                    {attributes.map((attr) => (
                      <label key={attr.id} className="space-y-1">
                        <span className="font-bold">
                          {attr.labelFa} ({attr.code})
                        </span>
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
                    <span className="font-bold">{t('adminProducts.modal.slug')}</span>
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
                    <span className="font-bold">{t('adminProducts.modal.tags')}</span>
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
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      https://dentalmarket.ir/product/{editing.slug}
                    </p>
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
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertProduct(editing, costMapDraft);
                  setEditing(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
              >
                {t('adminProducts.modal.saveBtn')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>
    </div>
  );
}

export default AdminProductsPage;
