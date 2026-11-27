import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ListFilter,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { canSeeCostPrice } from '../../components/admin/rbac';
import { AccessibleModal } from '../../components/ui/Modal';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { ChartSkeleton, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/States';
import { downloadCsvFile } from '../../lib/csv';
import { exportRowsToXlsx } from '../../lib/excel';
import {
  REPORT_CATALOG,
  getReportDefinition,
  runReportById,
  type ReportColumn,
  type ReportDataset,
  type ReportGroup,
  type ReportParams,
  type ReportResult,
} from './reports';

const ReportChart = lazy(() => import('../../components/admin/ReportChart'));

const GROUP_ORDER: ReportGroup[] = [
  'فروش و سفارش',
  'مالی و پرداخت',
  'انبار و FEFO',
  'مشتریان و B2B',
  'محتوا و سئو',
];

const GROUP_I18N_KEYS: Record<ReportGroup, string> = {
  'فروش و سفارش': 'adminReports.groups.sales',
  'مالی و پرداخت': 'adminReports.groups.finance',
  'انبار و FEFO': 'adminReports.groups.inventory',
  'مشتریان و B2B': 'adminReports.groups.customers',
  'محتوا و سئو': 'adminReports.groups.contentSeo',
};

const PAGE_LIMIT = 20;

export function AdminReportsPage() {
  const {
    authUser,
    activeAdminRole,
    orders,
    invoices,
    proformas,
    returns,
    paymentPlans,
    paymentLedger,
    rfqs,
    products,
    productCosts,
    categories,
    brands,
    campaigns,
    coupons,
    warehouses,
    stockLevels,
    stockBatches,
    stockMovements,
    b2bVerifications,
    tickets,
    consultationRequests,
    usersList,
    blogPosts,
    redirects,
    notFoundLogs,
    reviews,
    questions,
    settings,
    currency,
    pushToast,
  } = useStore();
  const { t, formatDigits, formatMoney } = useI18n();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialReportId = searchParams.get('report') || REPORT_CATALOG[0].id;

  const [selectedReportId, setSelectedReportId] = useState<string>(initialReportId);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const [serverReport, setServerReport] = useState<ReportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);

  const activeDef = useMemo(() => getReportDefinition(selectedReportId), [selectedReportId]);

  const localDataset: ReportDataset = useMemo(
    () => ({
      orders,
      invoices,
      proformas,
      returns,
      paymentPlans,
      paymentLedger,
      rfqs,
      products,
      productCosts,
      categories,
      brands,
      campaigns,
      coupons,
      warehouses,
      stockLevels,
      stockBatches,
      stockMovements,
      b2bVerifications,
      tickets,
      consultationRequests,
      usersList,
      blogPosts,
      redirects,
      notFoundLogs,
      reviews,
      questions,
      settings,
    }),
    [
      orders,
      invoices,
      proformas,
      returns,
      paymentPlans,
      paymentLedger,
      rfqs,
      products,
      productCosts,
      categories,
      brands,
      campaigns,
      coupons,
      warehouses,
      stockLevels,
      stockBatches,
      stockMovements,
      b2bVerifications,
      tickets,
      consultationRequests,
      usersList,
      blogPosts,
      redirects,
      notFoundLogs,
      reviews,
      questions,
      settings,
    ]
  );

  const queryParams: ReportParams = useMemo(
    () => ({
      from: fromDate.trim() || undefined,
      to: toDate.trim() || undefined,
      status: statusFilter.trim() || undefined,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      warehouseId: warehouseId || undefined,
      q: searchQuery.trim() || undefined,
      page,
      limit: PAGE_LIMIT,
    }),
    [fromDate, toDate, statusFilter, brandId, categoryId, warehouseId, searchQuery, page]
  );

  const handleSelectReport = (id: string) => {
    setSelectedReportId(id);
    setPage(1);
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setBrandId('');
    setCategoryId('');
    setWarehouseId('');
    setSearchQuery('');
    setCatalogDrawerOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set('report', id);
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setFromDate('');
    setToDate('');
    setStatusFilter('');
    setBrandId('');
    setCategoryId('');
    setWarehouseId('');
    setSearchQuery('');
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!authUser) {
        setServerReport(null);
        setServerError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setServerError(null);

      try {
        const token = await authUser.getIdToken();
        const qs = new URLSearchParams();
        if (queryParams.from) qs.set('from', queryParams.from);
        if (queryParams.to) qs.set('to', queryParams.to);
        if (queryParams.status) qs.set('status', queryParams.status);
        if (queryParams.brandId) qs.set('brandId', queryParams.brandId);
        if (queryParams.categoryId) qs.set('categoryId', queryParams.categoryId);
        if (queryParams.warehouseId) qs.set('warehouseId', queryParams.warehouseId);
        if (queryParams.q) qs.set('q', queryParams.q);
        qs.set('page', String(queryParams.page ?? 1));
        qs.set('limit', String(queryParams.limit ?? PAGE_LIMIT));

        const res = await fetch(`/api/admin/reports/${encodeURIComponent(selectedReportId)}?${qs.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await res.json()) as { ok?: boolean; report?: ReportResult; message?: string };

        if (cancelled) return;
        if (!res.ok || !payload.ok || !payload.report) {
          setServerReport(null);
          setServerError(payload.message || t('adminReports.errors.fetchStatus', { status: res.status }));
        } else {
          setServerReport(payload.report);
          setServerError(null);
        }
      } catch {
        if (!cancelled) {
          setServerReport(null);
          setServerError(t('adminReports.errors.network'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser, selectedReportId, queryParams, t]);

  const activeOutcome = useMemo(() => {
    if (authUser) {
      if (serverError) {
        return { ok: false as const, message: serverError };
      }
      if (serverReport) {
        return { ok: true as const, report: serverReport };
      }
      return null;
    }

    if (activeDef?.sensitiveFinancial && !canSeeCostPrice(activeAdminRole)) {
      return {
        ok: false as const,
        message: t('adminReports.errors.sensitiveDenied'),
      };
    }

    const res = runReportById(selectedReportId, localDataset, queryParams);
    if (!res.ok) {
      return { ok: false as const, message: res.message };
    }
    return { ok: true as const, report: res.report };
  }, [authUser, serverError, serverReport, activeDef, activeAdminRole, selectedReportId, localDataset, queryParams, t]);

  const fetchFullRowsForExport = async (): Promise<ReportResult | null> => {
    if (authUser) {
      const token = await authUser.getIdToken();
      const qs = new URLSearchParams();
      if (queryParams.from) qs.set('from', queryParams.from);
      if (queryParams.to) qs.set('to', queryParams.to);
      if (queryParams.status) qs.set('status', queryParams.status);
      if (queryParams.brandId) qs.set('brandId', queryParams.brandId);
      if (queryParams.categoryId) qs.set('categoryId', queryParams.categoryId);
      if (queryParams.warehouseId) qs.set('warehouseId', queryParams.warehouseId);
      if (queryParams.q) qs.set('q', queryParams.q);
      qs.set('page', '1');
      qs.set('limit', '5000');

      const res = await fetch(`/api/admin/reports/${encodeURIComponent(selectedReportId)}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json()) as { ok?: boolean; report?: ReportResult; message?: string };
      if (!res.ok || !payload.ok || !payload.report) {
        pushToast(payload.message || t('adminReports.errors.exportFetch'), 'error');
        return null;
      }
      return payload.report;
    }

    const outcome = runReportById(selectedReportId, localDataset, { ...queryParams, page: 1, limit: 5000 });
    if (!outcome.ok) {
      pushToast(outcome.message, 'error');
      return null;
    }
    return outcome.report;
  };

  const handleExportXlsx = async () => {
    if (!activeOutcome || !activeOutcome.ok || !activeOutcome.report.available) return;
    setExporting(true);
    try {
      const full = await fetchFullRowsForExport();
      if (!full) return;
      const exportRows = full.rows.map((r) => {
        const mapped: Record<string, string | number> = {};
        for (const col of full.columns) {
          mapped[col.label] = r[col.key] ?? '';
        }
        return mapped;
      });
      if (full.totalsRow) {
        const mappedTotal: Record<string, string | number> = {};
        for (const col of full.columns) {
          mappedTotal[col.label] = full.totalsRow[col.key] ?? '';
        }
        exportRows.push(mappedTotal);
      }
      await exportRowsToXlsx(exportRows, full.id.slice(0, 31), `dentalmarket-${full.id}.xlsx`);
      pushToast(t('adminReports.toasts.xlsxSaved'), 'success');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    if (!activeOutcome || !activeOutcome.ok || !activeOutcome.report.available) return;
    setExporting(true);
    try {
      const full = await fetchFullRowsForExport();
      if (!full) return;
      const headers = full.columns.map((c) => c.label);
      const keys = full.columns.map((c) => c.key);
      const matrix: Array<Array<string | number>> = full.rows.map((r) => keys.map((k) => r[k] ?? ''));
      if (full.totalsRow) {
        matrix.push(keys.map((k) => full.totalsRow?.[k] ?? ''));
      }
      downloadCsvFile(`dentalmarket-${full.id}.csv`, headers, matrix);
      pushToast(t('adminReports.toasts.csvSaved'), 'success');
    } finally {
      setExporting(false);
    }
  };

  const formatCellValue = (col: ReportColumn, raw: string | number | undefined): string => {
    if (raw === undefined || raw === null || raw === '') return '—';
    if (col.type === 'money') {
      const num = Number(raw);
      if (!Number.isFinite(num) || num === 0) return formatDigits('0');
      return formatMoney(num, currency);
    }
    if (col.type === 'percent') {
      const num = Number(raw);
      return Number.isFinite(num) ? t('common.percentValue', { value: formatDigits(num) }) : String(raw);
    }
    if (col.type === 'number') {
      const num = Number(raw);
      return Number.isFinite(num) ? formatDigits(num.toLocaleString('en-US')) : String(raw);
    }
    return formatDigits(String(raw));
  };

  const report = activeOutcome?.ok ? activeOutcome.report : null;
  const visibleParams = activeDef?.params ?? [];
  const supportsFilter = (key: NonNullable<typeof activeDef>['params'][number]) =>
    visibleParams.includes(key);

  const renderCatalogGroups = () => (
    <>
      {GROUP_ORDER.map((group) => {
        const items = REPORT_CATALOG.filter((r) => r.group === group);
        return (
          <div key={group} className="space-y-1">
            <p className="text-[11px] font-extrabold text-brand dark:text-sky-400 px-2 pt-1">
              {t(GROUP_I18N_KEYS[group], undefined, group)}
            </p>
            {items.map((rep) => {
              const isActive = selectedReportId === rep.id;
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => handleSelectReport(rep.id)}
                  className={`w-full text-start px-2.5 py-2 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 ${
                    isActive
                      ? 'bg-brand text-white font-bold'
                      : 'text-ink/85 dark:text-slate-200 hover:bg-surface/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="leading-5">{rep.title}</span>
                  {!rep.available && (
                    <span
                      className={`text-[10px] shrink-0 ${
                        isActive ? 'text-amber-100' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {t('adminReports.unavailableBadge')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="space-y-5">
      {/* Page Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-line dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold text-ink dark:text-slate-100">{t('adminReports.title')}</h1>
          <p className="text-xs text-ink/70 dark:text-slate-400 mt-1">{t('adminReports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCatalogDrawerOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-brand text-brand dark:text-teal-300 bg-white dark:bg-slate-900 text-xs font-bold whitespace-nowrap shrink-0"
          >
            <ListFilter className="w-4 h-4" aria-hidden="true" />
            <span>{t('adminReports.catalogTitle')}</span>
          </button>
          <button
            type="button"
            disabled={!report || !report.available || exporting}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-ink dark:text-slate-200 hover:bg-surface/60 dark:hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{t('actions.exportCsv')}</span>
          </button>
          <button
            type="button"
            disabled={!report || !report.available || exporting}
            onClick={handleExportXlsx}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            <span>{t('adminReports.exportXlsxFull')}</span>
          </button>
        </div>
      </div>

      {/* Mobile/Tablet Report Catalog Drawer */}
      <AccessibleModal
        open={catalogDrawerOpen}
        onClose={() => setCatalogDrawerOpen(false)}
        align="start"
        ariaLabel={t('adminReports.catalogTitle')}
        containerClassName="lg:hidden"
        panelClassName="w-80 max-w-[90vw] bg-white dark:bg-slate-900 h-full p-4 flex flex-col gap-3 overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between pb-2 border-b border-line dark:border-slate-800">
          <div>
            <span className="font-extrabold text-xs text-ink dark:text-slate-100">
              {t('adminReports.catalogTitle')}
            </span>
            <span className="ms-2 text-[11px] font-bold text-ink/65 dark:text-slate-400 tabular-nums">
              {t('adminReports.activeFraction', {
                active: formatDigits(REPORT_CATALOG.filter((r) => r.available).length),
                total: formatDigits(REPORT_CATALOG.length),
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCatalogDrawerOpen(false)}
            aria-label={t('actions.close')}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {renderCatalogGroups()}
      </AccessibleModal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sidebar Registry */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-3.5 space-y-4 max-h-[760px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-line dark:border-slate-800">
            <span className="font-extrabold text-xs text-ink dark:text-slate-100">
              {t('adminReports.catalogTitle')}
            </span>
            <span className="text-[11px] font-bold text-ink/65 dark:text-slate-400 tabular-nums">
              {t('adminReports.activeFraction', {
                active: formatDigits(REPORT_CATALOG.filter((r) => r.available).length),
                total: formatDigits(REPORT_CATALOG.length),
              })}
            </span>
          </div>

          {renderCatalogGroups()}
        </aside>

        {/* Main Workspace */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Active Report Header & Dynamic Filter Bar */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold text-ink/65 dark:text-slate-400">
                  {activeDef ? t(GROUP_I18N_KEYS[activeDef.group], undefined, activeDef.group) : t('adminReports.customGroup')}
                </p>
                <h2 className="text-base font-extrabold text-ink dark:text-slate-100 mt-0.5">
                  {activeDef?.title ?? t('adminReports.invalidReportId', { id: selectedReportId })}
                </h2>
                {activeDef?.description && (
                  <p className="text-xs text-ink/70 dark:text-slate-400 mt-1">{activeDef.description}</p>
                )}
              </div>
              {report && (
                <span className="text-xs font-bold text-ink/70 dark:text-slate-400 tabular-nums shrink-0">
                  {t('adminReports.totalRows', { count: formatDigits(report.allRowsCount) })}
                </span>
              )}
            </div>

            {activeDef && activeDef.available && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-line dark:border-slate-800 text-xs">
                {supportsFilter('dateRange') && (
                  <>
                    <label className="space-y-1">
                      <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                        {t('adminReports.filters.fromDateLabel')}
                      </span>
                      <input
                        type="text"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setPage(1);
                        }}
                        placeholder={t('adminReports.filters.fromDatePlaceholder')}
                        dir="ltr"
                        className="w-full px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100 tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                        {t('adminReports.filters.toDateLabel')}
                      </span>
                      <input
                        type="text"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setPage(1);
                        }}
                        placeholder={t('adminReports.filters.toDatePlaceholder')}
                        dir="ltr"
                        className="w-full px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100 tabular-nums"
                      />
                    </label>
                  </>
                )}

                {supportsFilter('brandId') && (
                  <label className="space-y-1">
                    <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                      {t('adminReports.filters.brandLabel')}
                    </span>
                    <select
                      value={brandId}
                      onChange={(e) => {
                        setBrandId(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100"
                    >
                      <option value="">{t('adminReports.filters.allBrands')}</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nameFa}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {supportsFilter('categoryId') && (
                  <label className="space-y-1">
                    <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                      {t('adminReports.filters.categoryLabel')}
                    </span>
                    <select
                      value={categoryId}
                      onChange={(e) => {
                        setCategoryId(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100"
                    >
                      <option value="">{t('adminReports.filters.allCategories')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nameFa}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {supportsFilter('warehouseId') && (
                  <label className="space-y-1">
                    <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                      {t('adminReports.filters.warehouseLabel')}
                    </span>
                    <select
                      value={warehouseId}
                      onChange={(e) => {
                        setWarehouseId(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100"
                    >
                      <option value="">{t('adminReports.filters.allWarehouses')}</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.nameFa}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {supportsFilter('status') && (
                  <label className="space-y-1">
                    <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                      {t('adminReports.filters.statusLabel')}
                    </span>
                    <input
                      type="text"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      placeholder={t('adminReports.filters.statusPlaceholder')}
                      dir="ltr"
                      className="w-full px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100"
                    />
                  </label>
                )}

                {supportsFilter('search') && (
                  <label className="space-y-1">
                    <span className="block text-[11px] text-ink/70 dark:text-slate-400">
                      {t('adminReports.filters.searchLabel')}
                    </span>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-ink/50 absolute start-2.5 top-2" aria-hidden="true" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPage(1);
                        }}
                        placeholder={t('adminReports.filters.searchPlaceholder')}
                        className="w-full ps-8 pe-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100"
                      />
                    </div>
                  </label>
                )}

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 text-ink/80 dark:text-slate-300 hover:bg-surface/60 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('adminReports.filters.resetBtn')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* State 1: Loading Skeleton */}
          {loading && <TableSkeleton rows={6} cols={5} />}

          {/* State 2: Error / Unknown ID / Permission Denied */}
          {!loading && activeOutcome && !activeOutcome.ok && (
            <ErrorState
              title={t('adminReports.errors.loadTitle')}
              message={activeOutcome.message}
              onRetry={() => handleSelectReport(REPORT_CATALOG[0].id)}
            />
          )}

          {/* State 3: Honest Unavailable Report */}
          {!loading && report && !report.available && (
            <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-2xl p-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1.5">
                <h3 className="text-sm font-extrabold text-amber-800 dark:text-amber-300">
                  {t('adminReports.unavailableTitle')}
                </h3>
                <p className="text-xs text-ink/80 dark:text-slate-300 leading-6">
                  {report.unavailableReason || t('adminReports.unavailableDefaultReason')}
                </p>
              </div>
            </div>
          )}

          {/* State 4 & 5: Available Report — KPI Summary, Chart, Data Grid & Pagination */}
          {!loading && report && report.available && (
            <>
              {/* KPI Summary Strip */}
              {report.summary.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {report.summary.map((item) => {
                    const toneClass =
                      item.tone === 'good'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : item.tone === 'warn'
                        ? 'text-amber-700 dark:text-amber-400'
                        : item.tone === 'bad'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-ink dark:text-slate-100';

                    let displayVal = String(item.value);
                    if (item.type === 'money') {
                      const n = Number(item.value);
                      displayVal = n === 0 ? formatDigits('0') : formatMoney(n, currency);
                    } else if (item.type === 'percent') {
                      displayVal = t('common.percentValue', { value: formatDigits(item.value) });
                    } else if (item.type === 'number') {
                      const n = Number(item.value);
                      displayVal = Number.isFinite(n) ? formatDigits(n.toLocaleString('en-US')) : String(item.value);
                    } else {
                      displayVal = formatDigits(String(item.value));
                    }

                    return (
                      <div
                        key={item.label}
                        className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-3.5"
                      >
                        <p className="text-[11px] text-ink/70 dark:text-slate-400">{item.label}</p>
                        <p className={`text-sm font-extrabold mt-1 tabular-nums ${toneClass}`}>{displayVal}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Data Table */}
              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
                {report.rows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      title={t('adminReports.empty.title')}
                      description={t('adminReports.empty.description')}
                      actionLabel={t('adminReports.empty.clearFilters')}
                      onAction={resetFilters}
                    />
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto max-h-[420px]">
                      <table className="w-full text-xs">
                        <thead className="border-b border-line dark:border-slate-800 text-ink/75 dark:text-slate-300 sticky top-0 bg-paper dark:bg-slate-950">
                          <tr>
                            {report.columns.map((col) => (
                              <th key={col.key} className="py-2.5 px-3 text-start font-bold whitespace-nowrap">
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line dark:divide-slate-800">
                          {report.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-surface/40 dark:hover:bg-slate-800/50">
                              {report.columns.map((col) => (
                                <td
                                  key={col.key}
                                  className="py-2.5 px-3 tabular-nums text-ink/90 dark:text-slate-200 whitespace-nowrap"
                                >
                                  {formatCellValue(col, row[col.key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        {report.totalsRow && (
                          <tfoot className="border-t-2 border-line dark:border-slate-700 bg-surface/70 dark:bg-slate-800/80 font-extrabold">
                            <tr>
                              {report.columns.map((col) => (
                                <td
                                  key={col.key}
                                  className="py-2.5 px-3 tabular-nums text-ink dark:text-slate-100 whitespace-nowrap"
                                >
                                  {formatCellValue(col, report.totalsRow?.[col.key])}
                                </td>
                              ))}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>

                    {report.totalPages > 1 && (
                      <div className="px-4 py-3 border-t border-line dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-ink/70 dark:text-slate-400 tabular-nums">
                          {t('adminReports.paginationLabel', {
                            page: formatDigits(report.page),
                            totalPages: formatDigits(report.totalPages),
                            allRows: formatDigits(report.allRowsCount),
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={report.page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                          >
                            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('common.prevPage')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={report.page >= report.totalPages}
                            onClick={() => setPage((p) => Math.min(report.totalPages, p + 1))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                          >
                            <span>{t('common.nextPage')}</span>
                            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Lazy-Loaded Report Chart */}
              {report.chart && report.chart.data.length > 0 && (
                <Suspense fallback={<ChartSkeleton heightClass="h-60" />}>
                  <ReportChart chart={report.chart} currency={currency} />
                </Suspense>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default AdminReportsPage;
