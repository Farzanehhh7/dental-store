import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  History,
  RotateCcw,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { downloadCsvFile } from '../../lib/csv';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  exportRowsToXlsx,
  parseCsvToMatrix,
  readSpreadsheetToMatrix,
} from '../../lib/excel';
import { formatJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import {
  IMPORT_TEMPLATE_LIST,
  IMPORT_TEMPLATE_REGISTRY,
  applyColumnMappingToMatrix,
  autoMapColumns,
  buildErrorReportRows,
  detectTemplateFromHeaders,
  exportTemplateDataRows,
  validateMatrixWithTemplate,
  type ColumnMapping,
  type ImportDryRunResult,
  type ImportJobSummaryDto,
  type ImportTemplateKey,
} from './importExport';

type ActionFilter = 'all' | 'actionable' | 'error' | 'skip';

const PREVIEW_PAGE_SIZE = 50;

export function AdminImportExportPage() {
  const {
    authUser,
    products,
    brands,
    categories,
    redirects,
    warehouses,
    stockLevels,
    refreshInventory,
    pushToast,
  } = useStore();

  const [templateKey, setTemplateKey] = useState<ImportTemplateKey>('products');
  const [filename, setFilename] = useState<string>('manual-paste.csv');
  const [csvText, setCsvText] = useState('');
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [detectionNote, setDetectionNote] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ImportDryRunResult | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [previewPage, setPreviewPage] = useState(1);

  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [confirmRollbackJobId, setConfirmRollbackJobId] = useState<string | null>(null);
  const [rollingBackJobId, setRollingBackJobId] = useState<string | null>(null);
  const [importJobs, setImportJobs] = useState<ImportJobSummaryDto[]>([]);

  const activeTemplate = IMPORT_TEMPLATE_REGISTRY[templateKey];

  const localCatalogContext = useMemo(
    () => ({
      products,
      categories,
      brands,
      redirects,
      warehouses,
      stockLevels,
    }),
    [products, categories, brands, redirects, warehouses, stockLevels]
  );

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!authUser) return {};
    const token = await authUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [authUser]);

  const fetchImportJobs = useCallback(async () => {
    if (!authUser) return;
    setIsLoadingJobs(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin/import/jobs', { headers: authHeaders });
      const data = (await res.json()) as { ok?: boolean; jobs?: ImportJobSummaryDto[] };
      if (res.ok && data.ok && Array.isArray(data.jobs)) {
        setImportJobs(data.jobs);
      }
    } catch {
      // Silent fallback if backend unreachable
    } finally {
      setIsLoadingJobs(false);
    }
  }, [authUser, getAuthHeaders]);

  useEffect(() => {
    void fetchImportJobs();
  }, [fetchImportJobs]);

  const handleSelectTemplate = (nextKey: ImportTemplateKey) => {
    setTemplateKey(nextKey);
    const tpl = IMPORT_TEMPLATE_REGISTRY[nextKey];
    if (headers.length > 0) {
      const nextMap = autoMapColumns(headers, tpl);
      setColumnMapping(nextMap);
    }
    setDryRunResult(null);
    setDetectionNote(null);
    setPreviewPage(1);
  };

  const handleFillSampleCsv = () => {
    const cols = activeTemplate.columns.map((c) => c.key);
    const sample = activeTemplate.sampleRows[0] ?? {};
    const headerLine = cols.join(',');
    const valueLine = cols.map((k) => String(sample[k] ?? '')).join(',');
    setCsvText(`${headerLine}\n${valueLine}`);
    setFilename(`sample-${templateKey}.csv`);
    setDetectionNote(null);
  };

  const handleDownloadSample = async (format: 'xlsx' | 'csv') => {
    const keys = activeTemplate.columns.map((c) => c.key);
    if (format === 'csv') {
      downloadCsvFile(
        `template-${templateKey}.csv`,
        keys,
        activeTemplate.sampleRows.map((row) => keys.map((k) => row[k] ?? ''))
      );
      return;
    }
    await exportRowsToXlsx(activeTemplate.sampleRows, templateKey, `template-${templateKey}.xlsx`, keys);
  };

  const handleExportCurrentData = async (format: 'xlsx' | 'csv') => {
    try {
      if (authUser) {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`/api/admin/import/export/${templateKey}?format=${format}`, {
          headers: authHeaders,
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `export-${templateKey}.${format}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return;
        }
      }

      const { headers: expHeaders, rows } = exportTemplateDataRows(templateKey, localCatalogContext);
      if (format === 'csv') {
        downloadCsvFile(
          `export-${templateKey}.csv`,
          expHeaders,
          rows.map((r) => expHeaders.map((h) => r[h] ?? ''))
        );
      } else {
        await exportRowsToXlsx(rows, templateKey, `export-${templateKey}.xlsx`, expHeaders);
      }
    } catch {
      pushToast('خطا در تولید خروجی از اطلاعات کاتالوگ.', 'error');
    }
  };

  const runValidationFromMatrix = async (
    rowsMatrix: string[][],
    targetTemplateKey: ImportTemplateKey = templateKey,
    mappingOverride?: ColumnMapping
  ) => {
    if (rowsMatrix.length < 2) {
      pushToast('فایل حداقل باید شامل سرستون و یک ردیف داده باشد.', 'error');
      return;
    }
    if (rowsMatrix.length - 1 > MAX_IMPORT_ROWS) {
      pushToast(`حداکثر ${toPersianDigits(MAX_IMPORT_ROWS)} ردیف داده در هر فایل مجاز است.`, 'error');
      return;
    }

    const tpl = IMPORT_TEMPLATE_REGISTRY[targetTemplateKey];
    const effectiveHeaders = rowsMatrix[0] ?? [];
    const effectiveMapping = mappingOverride ?? autoMapColumns(effectiveHeaders, tpl);
    setMatrix(rowsMatrix);
    setHeaders(effectiveHeaders);
    setColumnMapping(effectiveMapping);
    setPreviewPage(1);
    setActionFilter('all');

    const mappedRawRows = applyColumnMappingToMatrix(rowsMatrix, tpl, effectiveMapping);
    if (mappedRawRows.length === 0) {
      pushToast('هیچ ردیف داده‌ای برای بررسی یافت نشد.', 'error');
      return;
    }

    setIsValidating(true);
    try {
      if (authUser) {
        const authHeaders = await getAuthHeaders();
        const res = await fetch('/api/admin/import/validate', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateKey: targetTemplateKey,
            rows: mappedRawRows,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; dryRun?: ImportDryRunResult; message?: string };
        if (res.ok && data.ok && data.dryRun) {
          setDryRunResult(data.dryRun);
          return;
        }
      }

      const localDryRun = validateMatrixWithTemplate(
        targetTemplateKey,
        rowsMatrix,
        localCatalogContext,
        effectiveMapping
      );
      setDryRunResult(localDryRun);
    } catch {
      const localDryRun = validateMatrixWithTemplate(
        targetTemplateKey,
        rowsMatrix,
        localCatalogContext,
        effectiveMapping
      );
      setDryRunResult(localDryRun);
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      pushToast('حجم فایل بیش از سقف مجاز (۵ مگابایت) است.', 'error');
      e.target.value = '';
      return;
    }

    try {
      const parsedMatrix = await readSpreadsheetToMatrix(file, {
        maxBytes: MAX_IMPORT_FILE_BYTES,
        maxRows: MAX_IMPORT_ROWS,
      });
      if (parsedMatrix.length < 2) {
        pushToast('فایل باید شامل سرستون و حداقل یک ردیف داده باشد.', 'error');
        return;
      }

      const fileHeaders = parsedMatrix[0] ?? [];
      const detection = detectTemplateFromHeaders(fileHeaders);
      setFilename(file.name);

      if (detection.confidence !== 'low' && detection.templateKey !== templateKey) {
        const detectedTpl = IMPORT_TEMPLATE_REGISTRY[detection.templateKey];
        setTemplateKey(detection.templateKey);
        setDetectionNote(
          `قالب «${detectedTpl.label}» بر اساس سرستون‌های فایل به‌صورت خودکار تشخیص داده شد.`
        );
        await runValidationFromMatrix(parsedMatrix, detection.templateKey, detection.mapping);
      } else {
        setDetectionNote(
          detection.confidence === 'high'
            ? `سرستون‌ها با قالب «${activeTemplate.label}» مطابقت دارند.`
            : 'در صورت نیاز، نگاشت ستون‌ها را پیش از ثبت نهایی بررسی کنید.'
        );
        await runValidationFromMatrix(parsedMatrix, templateKey, autoMapColumns(fileHeaders, activeTemplate));
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'امکان خواندن فایل وجود ندارد. لطفاً فایل معتبر .xlsx یا .csv انتخاب کنید.';
      pushToast(msg, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDryRunText = async () => {
    try {
      const lines = parseCsvToMatrix(csvText, {
        maxBytes: MAX_IMPORT_FILE_BYTES,
        maxRows: MAX_IMPORT_ROWS,
      });
      if (lines.length < 2) {
        pushToast('متن CSV حداقل باید شامل سطر سرستون و یک سطر داده باشد.', 'error');
        return;
      }
      const textHeaders = lines[0] ?? [];
      const detection = detectTemplateFromHeaders(textHeaders);
      const chosenKey =
        detection.confidence === 'high' && detection.templateKey !== templateKey
          ? detection.templateKey
          : templateKey;
      if (chosenKey !== templateKey) {
        setTemplateKey(chosenKey);
        setDetectionNote(`قالب «${IMPORT_TEMPLATE_REGISTRY[chosenKey].label}» تشخیص داده شد.`);
      }
      setFilename(`csv-paste-${chosenKey}.csv`);
      const chosenTpl = IMPORT_TEMPLATE_REGISTRY[chosenKey];
      await runValidationFromMatrix(lines, chosenKey, autoMapColumns(textHeaders, chosenTpl));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'متن CSV نامعتبر است.';
      pushToast(msg, 'error');
    }
  };

  const handleMappingChange = (colKey: string, headerIndexStr: string) => {
    const nextIdx = headerIndexStr === '' ? null : Number(headerIndexStr);
    const nextMap: ColumnMapping = {
      ...columnMapping,
      [colKey]: nextIdx !== null && Number.isFinite(nextIdx) ? nextIdx : null,
    };
    setColumnMapping(nextMap);
    if (matrix.length >= 2) {
      void runValidationFromMatrix(matrix, templateKey, nextMap);
    }
  };

  const handleDownloadErrors = async (format: 'xlsx' | 'csv') => {
    if (!dryRunResult) return;
    const errorRows = buildErrorReportRows(dryRunResult);
    if (errorRows.length === 0) return;
    const keys = Object.keys(errorRows[0]);
    if (format === 'csv') {
      downloadCsvFile(
        `import-errors-${templateKey}.csv`,
        keys,
        errorRows.map((r) => keys.map((k) => r[k] ?? ''))
      );
    } else {
      await exportRowsToXlsx(errorRows, 'Errors', `import-errors-${templateKey}.xlsx`, keys);
    }
  };

  const handleCommitImport = async () => {
    if (!dryRunResult || matrix.length < 2) return;
    const actionableCount = dryRunResult.summary.createCount + dryRunResult.summary.updateCount;
    if (actionableCount === 0) {
      pushToast('هیچ ردیف جدید یا ویرایش‌شده‌ای برای ثبت وجود ندارد.', 'error');
      return;
    }

    const mappedRawRows = applyColumnMappingToMatrix(matrix, IMPORT_TEMPLATE_REGISTRY[templateKey], columnMapping);
    setIsCommitting(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin/import/commit', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateKey,
          filename,
          rows: mappedRawRows,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        job?: ImportJobSummaryDto;
        dryRun?: ImportDryRunResult;
        message?: string;
      };

      if (!res.ok || !data.ok || !data.job) {
        pushToast(data.message || 'خطا در ثبت دسته‌ای اطلاعات روی سرور.', 'error');
        return;
      }

      setImportJobs((prev) => [data.job!, ...prev]);
      setDryRunResult(null);
      setMatrix([]);
      setHeaders([]);
      setCsvText('');
      setDetectionNote(null);
      await refreshInventory().catch(() => {});
      pushToast(
        `ایمپورت با موفقیت انجام شد (${toPersianDigits(data.job.counts.createCount)} جدید، ${toPersianDigits(
          data.job.counts.updateCount
        )} بروزرسانی).`,
        'success'
      );
    } catch {
      pushToast('ارتباط با سرور برای ثبت ایمپورت برقرار نشد.', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRollbackJob = async (jobId: string) => {
    setRollingBackJobId(jobId);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/admin/import/jobs/${encodeURIComponent(jobId)}/rollback`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as { ok?: boolean; job?: ImportJobSummaryDto; message?: string };
      if (!res.ok || !data.ok || !data.job) {
        pushToast(data.message || 'امکان بازگردانی این ایمپورت وجود ندارد.', 'error');
        return;
      }
      setImportJobs((prev) => prev.map((j) => (j.id === jobId ? data.job! : j)));
      setConfirmRollbackJobId(null);
      await refreshInventory().catch(() => {});
      pushToast(`عملیات ${jobId} با موفقیت بازگردانی شد.`, 'success');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام بازگردانی.', 'error');
    } finally {
      setRollingBackJobId(null);
    }
  };

  const filteredPreviewRows = useMemo(() => {
    if (!dryRunResult) return [];
    if (actionFilter === 'all') return dryRunResult.rows;
    if (actionFilter === 'actionable') {
      return dryRunResult.rows.filter((r) => r.action === 'create' || r.action === 'update');
    }
    return dryRunResult.rows.filter((r) => r.action === actionFilter);
  }, [dryRunResult, actionFilter]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / PREVIEW_PAGE_SIZE));
  const pagedPreviewRows = filteredPreviewRows.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE
  );

  const actionableCount = dryRunResult
    ? dryRunResult.summary.createCount + dryRunResult.summary.updateCount
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-ink dark:text-slate-100">
            مرکز ورود و خروج گروهی کاتالوگ و انبار (Excel / CSV)
          </h1>
          <p className="text-xs text-ink/65 dark:text-slate-400 mt-1">
            پشتیبانی از ۷ قالب استاندارد با تشخیص خودکار ستون‌ها، اعتبارسنجی Dry-Run، ثبت دسته‌ای و بازگردانی (Rollback)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => void handleDownloadSample('xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <Download className="w-4 h-4" />
            <span>قالب خام .xlsx</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadSample('csv')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <Download className="w-4 h-4" />
            <span>قالب خام .csv</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportCurrentData('xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-white font-bold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>خروجی کل داده‌های این قالب (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportCurrentData('csv')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-brand/40 text-brand dark:text-sky-300 font-bold"
          >
            <span>خروجی .csv</span>
          </button>
        </div>
      </div>

      {/* Template Selector Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {IMPORT_TEMPLATE_LIST.map((tpl) => {
          const active = tpl.key === templateKey;
          return (
            <button
              key={tpl.key}
              type="button"
              onClick={() => handleSelectTemplate(tpl.key)}
              className={`text-right p-3.5 rounded-2xl border transition-colors ${
                active
                  ? 'border-brand bg-brand/5 dark:bg-sky-950/30 text-ink dark:text-slate-100'
                  : 'border-line dark:border-slate-800 bg-white dark:bg-slate-900 text-ink/80 dark:text-slate-300 hover:border-brand/50'
              }`}
            >
              <div className="font-extrabold text-xs flex items-center justify-between gap-2">
                <span>{tpl.label}</span>
                {active && <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />}
              </div>
              <p className="text-[11px] text-ink/60 dark:text-slate-400 mt-1 line-clamp-2">{tpl.description}</p>
            </button>
          );
        })}
      </div>

      {/* Step 1: Upload / Paste */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line dark:border-slate-800">
          <div>
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              گام ۱: بارگذاری فایل Excel (.xlsx) یا CSV برای «{activeTemplate.label}»
            </h2>
            <p className="text-[11px] text-ink/60 dark:text-slate-400 mt-0.5">
              سقف مجاز: {toPersianDigits(5)} مگابایت · حداکثر {toPersianDigits(MAX_IMPORT_ROWS)} ردیف · کلید یکتا: {activeTemplate.upsertKeyLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand text-brand dark:text-sky-300 font-bold cursor-pointer hover:bg-brand/5">
              <FileSpreadsheet className="w-4 h-4" />
              <span>آپلود مستقیم فایل .xlsx یا .csv</span>
              <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleFillSampleCsv}
              className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 font-semibold hover:border-brand"
            >
              درج نمونه CSV این قالب
            </button>
          </div>
        </div>

        <div className="text-[11px] text-ink/70 dark:text-slate-400">
          ستون‌های قالب فعلی:{' '}
          {activeTemplate.columns.map((c, i) => (
            <span key={c.key} className="font-mono">
              {i > 0 ? ' · ' : ''}
              <span className={c.required ? 'font-bold text-ink dark:text-slate-200' : ''}>
                {c.key}
                {c.required ? '*' : ''}
              </span>
            </span>
          ))}
        </div>

        <textarea
          rows={4}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`${activeTemplate.columns.map((c) => c.key).join(',')}\n${activeTemplate.columns
            .map((c) => String(activeTemplate.sampleRows[0]?.[c.key] ?? ''))
            .join(',')}`}
          className="w-full p-3 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-ink dark:text-slate-100 font-mono text-xs"
          dir="ltr"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isValidating || !csvText.trim()}
            onClick={() => void handleDryRunText()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white font-bold disabled:opacity-50"
          >
            <FileUp className="w-4 h-4" />
            <span>{isValidating ? 'در حال بررسی...' : 'تحلیل و پیش‌نمایش Dry-Run'}</span>
          </button>

          {detectionNote && (
            <span className="text-[11px] text-brand dark:text-sky-300 font-semibold px-2">
              {detectionNote}
            </span>
          )}
        </div>
      </div>

      {/* Step 2: Column Mapping */}
      {headers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              گام ۲: نگاشت ستون‌های فایل ({filename})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTemplate.columns.map((col) => {
              const selectedIdx = columnMapping[col.key];
              return (
                <label
                  key={col.key}
                  className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink dark:text-slate-200">
                      {col.labelFa}
                      {col.required && <span className="text-rose-600 mr-1">*</span>}
                    </span>
                    <span className="font-mono text-[10px] text-ink/55 dark:text-slate-400">{col.key}</span>
                  </div>
                  <select
                    value={selectedIdx === null || selectedIdx === undefined ? '' : String(selectedIdx)}
                    onChange={(e) => handleMappingChange(col.key, e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="">-- بدون نگاشت --</option>
                    {headers.map((h, idx) => (
                      <option key={`${h}-${idx}`} value={String(idx)}>
                        ستون {toPersianDigits(idx + 1)}: {h}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Dry-Run Preview */}
      {dryRunResult && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              گام ۳: گزارش Dry-Run ({dryRunResult.templateLabel})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {dryRunResult.summary.errorCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDownloadErrors('xlsx')}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>گزارش خطاها (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadErrors('csv')}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
                  >
                    <span>گزارش خطاها (.csv)</span>
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={isCommitting || actionableCount === 0}
                onClick={() => void handleCommitImport()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isCommitting
                    ? 'در حال ثبت...'
                    : `ثبت نهایی ${toPersianDigits(actionableCount)} ردیف معتبر`}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40">
              <div className="text-[11px] text-ink/60 dark:text-slate-400">کل ردیف‌ها</div>
              <div className="text-lg font-extrabold tabular-nums mt-0.5">
                {toPersianDigits(dryRunResult.summary.totalRows)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">ایجاد جدید</div>
              <div className="text-lg font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                {toPersianDigits(dryRunResult.summary.createCount)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20">
              <div className="text-[11px] text-sky-700 dark:text-sky-300">بروزرسانی</div>
              <div className="text-lg font-extrabold tabular-nums text-sky-700 dark:text-sky-300 mt-0.5">
                {toPersianDigits(dryRunResult.summary.updateCount)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40">
              <div className="text-[11px] text-ink/60 dark:text-slate-400">بدون تغییر (Skip)</div>
              <div className="text-lg font-extrabold tabular-nums mt-0.5">
                {toPersianDigits(dryRunResult.summary.skipCount)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="text-[11px] text-rose-700 dark:text-rose-300">خطا (Error)</div>
              <div className="text-lg font-extrabold tabular-nums text-rose-700 dark:text-rose-300 mt-0.5">
                {toPersianDigits(dryRunResult.summary.errorCount)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-line dark:border-slate-800 pb-3">
            {(
              [
                ['all', `همه (${toPersianDigits(dryRunResult.rows.length)})`],
                ['actionable', `ایجاد و بروزرسانی (${toPersianDigits(actionableCount)})`],
                ['error', `دارای خطا (${toPersianDigits(dryRunResult.summary.errorCount)})`],
                ['skip', `بدون تغییر (${toPersianDigits(dryRunResult.summary.skipCount)})`],
              ] as const
            ).map(([fKey, label]) => (
              <button
                key={fKey}
                type="button"
                onClick={() => {
                  setActionFilter(fKey);
                  setPreviewPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  actionFilter === fKey
                    ? 'border-brand text-brand dark:text-sky-300 bg-brand/5'
                    : 'border-line dark:border-slate-700 text-ink/70 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-line dark:border-slate-800 text-[11px] text-ink/60 dark:text-slate-400">
                  <th className="py-2 px-2">ردیف</th>
                  <th className="py-2 px-2">کلید یکتا</th>
                  <th className="py-2 px-2">شرح عملیات</th>
                  <th className="py-2 px-2">وضعیت</th>
                  <th className="py-2 px-2">پیام اعتبارسنجی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {pagedPreviewRows.map((row) => (
                  <tr key={row.rowNumber} className="align-top">
                    <td className="py-2.5 px-2 tabular-nums font-bold">{toPersianDigits(row.rowNumber)}</td>
                    <td className="py-2.5 px-2 font-mono text-[11px]" dir="ltr">
                      {row.upsertKey}
                    </td>
                    <td className="py-2.5 px-2 font-semibold">{row.summaryFa}</td>
                    <td className="py-2.5 px-2 font-bold">
                      {row.action === 'create' && <span className="text-emerald-600 dark:text-emerald-400">ایجاد</span>}
                      {row.action === 'update' && <span className="text-sky-600 dark:text-sky-400">بروزرسانی</span>}
                      {row.action === 'skip' && <span className="text-ink/55 dark:text-slate-400">بدون تغییر</span>}
                      {row.action === 'error' && (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>خطا</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-ink/80 dark:text-slate-300">
                      {row.errors.length > 0 ? (
                        <ul className="space-y-0.5 text-rose-700 dark:text-rose-300">
                          {row.errors.map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-ink/55 dark:text-slate-400">معتبر و آماده اجرا</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPreviewPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="text-ink/60 dark:text-slate-400">
                صفحه {toPersianDigits(previewPage)} از {toPersianDigits(totalPreviewPages)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  قبلی
                </button>
                <button
                  type="button"
                  disabled={previewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  بعدی
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Persistent Import Jobs & Rollback */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              تاریخچه عملیات ایمپورت و بازگردانی (Rollback)
            </h2>
          </div>
          {isLoadingJobs && <span className="text-ink/55 dark:text-slate-400">در حال بروزرسانی...</span>}
        </div>

        {importJobs.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-line dark:border-slate-700 text-center text-ink/60 dark:text-slate-400">
            هنوز عملیات ورود داده ثبت‌شده‌ای در سرور وجود ندارد.
          </div>
        ) : (
          <div className="space-y-2">
            {importJobs.map((job) => (
              <div
                key={job.id}
                className="p-3.5 rounded-xl border border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-extrabold flex flex-wrap items-center gap-2">
                    <span className="font-mono">{job.id}</span>
                    <span>· {job.templateLabel}</span>
                    <span className="text-ink/60 dark:text-slate-400 font-normal">({job.filename})</span>
                  </div>
                  <div className="text-[11px] text-ink/70 dark:text-slate-400 tabular-nums">
                    جدید: {toPersianDigits(job.counts.createCount)} · بروزرسانی:{' '}
                    {toPersianDigits(job.counts.updateCount)} · بدون تغییر:{' '}
                    {toPersianDigits(job.counts.skipCount)} · خطا: {toPersianDigits(job.counts.errorCount)} · ثبت‌شده
                    توسط {job.actorEmail} در {formatJalaliDateTime(job.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {job.status === 'rolled_back' ? (
                    <span className="text-amber-700 dark:text-amber-300 font-bold">
                      بازگردانی شده ({job.rolledBackAt ? formatJalaliDateTime(job.rolledBackAt) : ''})
                    </span>
                  ) : confirmRollbackJobId === job.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={rollingBackJobId === job.id}
                        onClick={() => void handleRollbackJob(job.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-50"
                      >
                        {rollingBackJobId === job.id ? 'در حال بازگردانی...' : 'تایید بازگردانی'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRollbackJobId(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700"
                      >
                        انصراف
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRollbackJobId(job.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>بازگردانی (Rollback)</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminImportExportPage;
