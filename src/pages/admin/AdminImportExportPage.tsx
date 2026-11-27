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
import { useI18n } from '../../context/i18n';
import { downloadCsvFile } from '../../lib/csv';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  exportRowsToXlsx,
  parseCsvToMatrix,
  readSpreadsheetToMatrix,
} from '../../lib/excel';
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
  const { t, formatDateTime, formatDigits } = useI18n();

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
      pushToast(t('adminImport.exportError'), 'error');
    }
  };

  const runValidationFromMatrix = async (
    rowsMatrix: string[][],
    targetTemplateKey: ImportTemplateKey = templateKey,
    mappingOverride?: ColumnMapping
  ) => {
    if (rowsMatrix.length < 2) {
      pushToast(t('adminImport.minRowsError'), 'error');
      return;
    }
    if (rowsMatrix.length - 1 > MAX_IMPORT_ROWS) {
      pushToast(t('adminImport.maxRowsError', { max: formatDigits(MAX_IMPORT_ROWS) }), 'error');
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
      pushToast(t('adminImport.noDataRowsError'), 'error');
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
      pushToast(t('adminImport.fileSizeExceeded'), 'error');
      e.target.value = '';
      return;
    }

    try {
      const parsedMatrix = await readSpreadsheetToMatrix(file, {
        maxBytes: MAX_IMPORT_FILE_BYTES,
        maxRows: MAX_IMPORT_ROWS,
      });
      if (parsedMatrix.length < 2) {
        pushToast(t('adminImport.minRowsError'), 'error');
        return;
      }

      const fileHeaders = parsedMatrix[0] ?? [];
      const detection = detectTemplateFromHeaders(fileHeaders);
      setFilename(file.name);

      if (detection.confidence !== 'low' && detection.templateKey !== templateKey) {
        const detectedTpl = IMPORT_TEMPLATE_REGISTRY[detection.templateKey];
        setTemplateKey(detection.templateKey);
        setDetectionNote(t('adminImport.templateAutoDetected', { label: detectedTpl.label }));
        await runValidationFromMatrix(parsedMatrix, detection.templateKey, detection.mapping);
      } else {
        setDetectionNote(
          detection.confidence === 'high'
            ? t('adminImport.headersMatched', { label: activeTemplate.label })
            : t('adminImport.reviewMappingNote')
        );
        await runValidationFromMatrix(parsedMatrix, templateKey, autoMapColumns(fileHeaders, activeTemplate));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('adminImport.invalidFileError');
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
        pushToast(t('adminImport.minCsvRowsError'), 'error');
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
        setDetectionNote(t('adminImport.templateDetected', { label: IMPORT_TEMPLATE_REGISTRY[chosenKey].label }));
      }
      setFilename(`csv-paste-${chosenKey}.csv`);
      const chosenTpl = IMPORT_TEMPLATE_REGISTRY[chosenKey];
      await runValidationFromMatrix(lines, chosenKey, autoMapColumns(textHeaders, chosenTpl));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('adminImport.invalidCsvError');
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
      pushToast(t('adminImport.noActionableRows'), 'error');
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
        pushToast(data.message || t('adminImport.commitServerError'), 'error');
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
        t('adminImport.commitSuccessToast', {
          created: formatDigits(data.job.counts.createCount),
          updated: formatDigits(data.job.counts.updateCount),
        }),
        'success'
      );
    } catch {
      pushToast(t('adminImport.commitNetworkError'), 'error');
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
        pushToast(data.message || t('adminImport.rollbackNotAllowed'), 'error');
        return;
      }
      setImportJobs((prev) => prev.map((j) => (j.id === jobId ? data.job! : j)));
      setConfirmRollbackJobId(null);
      await refreshInventory().catch(() => {});
      pushToast(t('adminImport.rollbackSuccessToast', { id: jobId }), 'success');
    } catch {
      pushToast(t('adminImport.rollbackNetworkError'), 'error');
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
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-extrabold text-ink dark:text-slate-100">
            {t('adminImport.title')}
          </h1>
          <p className="text-xs text-ink/65 dark:text-slate-400 mt-1">{t('adminImport.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => void handleDownloadSample('xlsx')}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{t('adminImport.sampleXlsx')}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadSample('csv')}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{t('adminImport.sampleCsv')}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportCurrentData('xlsx')}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-white font-bold"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>{t('adminImport.exportAllXlsx')}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportCurrentData('csv')}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-brand/40 text-brand dark:text-sky-300 font-bold"
          >
            <span>{t('adminImport.exportCsv')}</span>
          </button>
        </div>
      </div>

      {/* Template Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {IMPORT_TEMPLATE_LIST.map((tpl) => {
          const active = tpl.key === templateKey;
          return (
            <button
              key={tpl.key}
              type="button"
              onClick={() => handleSelectTemplate(tpl.key)}
              className={`text-start p-3.5 rounded-2xl border transition-colors min-h-[72px] ${
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
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              {t('adminImport.step1Title', { label: activeTemplate.label })}
            </h2>
            <p className="text-[11px] text-ink/60 dark:text-slate-400 mt-0.5 tabular-nums">
              {t('adminImport.step1Meta', {
                maxMb: formatDigits(5),
                maxRows: formatDigits(MAX_IMPORT_ROWS),
                key: activeTemplate.upsertKeyLabel,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand text-brand dark:text-sky-300 font-bold cursor-pointer hover:bg-brand/5">
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>{t('adminImport.uploadFileBtn')}</span>
              <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleFillSampleCsv}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-line dark:border-slate-700 font-semibold hover:border-brand"
            >
              {t('adminImport.fillSampleCsv')}
            </button>
          </div>
        </div>

        <div className="text-[11px] text-ink/70 dark:text-slate-400 break-words">
          {t('adminImport.currentColumnsLabel')}{' '}
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
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white font-bold disabled:opacity-50"
          >
            <FileUp className="w-4 h-4 shrink-0" />
            <span>{isValidating ? t('adminImport.validating') : t('adminImport.analyzeDryRun')}</span>
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
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 text-brand shrink-0" />
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100 break-all">
              {t('adminImport.step2Title', { filename })}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTemplate.columns.map((col) => {
              const selectedIdx = columnMapping[col.key];
              return (
                <label
                  key={col.key}
                  className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40 flex flex-col gap-1.5 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink dark:text-slate-200 truncate">
                      {col.labelFa}
                      {col.required && <span className="text-rose-600 ms-1">*</span>}
                    </span>
                    <span className="font-mono text-[10px] text-ink/55 dark:text-slate-400 shrink-0">
                      {col.key}
                    </span>
                  </div>
                  <select
                    value={selectedIdx === null || selectedIdx === undefined ? '' : String(selectedIdx)}
                    onChange={(e) => handleMappingChange(col.key, e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="">{t('adminImport.noMapping')}</option>
                    {headers.map((h, idx) => (
                      <option key={`${h}-${idx}`} value={String(idx)}>
                        {t('adminImport.columnHeaderOption', { index: formatDigits(idx + 1), name: h })}
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
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">
              {t('adminImport.step3Title', { label: dryRunResult.templateLabel })}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {dryRunResult.summary.errorCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDownloadErrors('xlsx')}
                    className="min-h-[38px] inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('adminImport.errorReportXlsx')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadErrors('csv')}
                    className="min-h-[38px] inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
                  >
                    <span>{t('adminImport.errorReportCsv')}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={isCommitting || actionableCount === 0}
                onClick={() => void handleCommitImport()}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isCommitting
                    ? t('adminImport.committing')
                    : t('adminImport.commitValidRows', { count: formatDigits(actionableCount) })}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40">
              <div className="text-[11px] text-ink/60 dark:text-slate-400">{t('adminImport.summaryTotal')}</div>
              <div className="text-lg font-extrabold tabular-nums mt-0.5">
                {formatDigits(dryRunResult.summary.totalRows)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">{t('adminImport.summaryCreate')}</div>
              <div className="text-lg font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                {formatDigits(dryRunResult.summary.createCount)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20">
              <div className="text-[11px] text-sky-700 dark:text-sky-300">{t('adminImport.summaryUpdate')}</div>
              <div className="text-lg font-extrabold tabular-nums text-sky-700 dark:text-sky-300 mt-0.5">
                {formatDigits(dryRunResult.summary.updateCount)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-line dark:border-slate-800 bg-paper/50 dark:bg-slate-800/40">
              <div className="text-[11px] text-ink/60 dark:text-slate-400">{t('adminImport.summarySkip')}</div>
              <div className="text-lg font-extrabold tabular-nums mt-0.5">
                {formatDigits(dryRunResult.summary.skipCount)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="text-[11px] text-rose-700 dark:text-rose-300">{t('adminImport.summaryError')}</div>
              <div className="text-lg font-extrabold tabular-nums text-rose-700 dark:text-rose-300 mt-0.5">
                {formatDigits(dryRunResult.summary.errorCount)}
              </div>
            </div>
          </div>

          <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 border-b border-line dark:border-slate-800 pb-3">
            {(
              [
                ['all', t('adminImport.filterAll', { count: formatDigits(dryRunResult.rows.length) })],
                ['actionable', t('adminImport.filterActionable', { count: formatDigits(actionableCount) })],
                ['error', t('adminImport.filterError', { count: formatDigits(dryRunResult.summary.errorCount) })],
                ['skip', t('adminImport.filterSkip', { count: formatDigits(dryRunResult.summary.skipCount) })],
              ] as const
            ).map(([fKey, label]) => (
              <button
                key={fKey}
                type="button"
                onClick={() => {
                  setActionFilter(fKey);
                  setPreviewPage(1);
                }}
                className={`whitespace-nowrap shrink-0 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold border ${
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
            <table className="w-full min-w-[640px] text-start border-collapse">
              <thead>
                <tr className="border-b border-line dark:border-slate-800 text-[11px] text-ink/60 dark:text-slate-400">
                  <th className="py-2 px-2 text-start">{t('adminImport.colRow')}</th>
                  <th className="py-2 px-2 text-start">{t('adminImport.colKey')}</th>
                  <th className="py-2 px-2 text-start">{t('adminImport.colActionDesc')}</th>
                  <th className="py-2 px-2 text-start">{t('adminImport.colStatus')}</th>
                  <th className="py-2 px-2 text-start">{t('adminImport.colMessage')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {pagedPreviewRows.map((row) => (
                  <tr key={row.rowNumber} className="align-top">
                    <td className="py-2.5 px-2 tabular-nums font-bold">{formatDigits(row.rowNumber)}</td>
                    <td className="py-2.5 px-2 font-mono text-[11px]" dir="ltr">
                      {row.upsertKey}
                    </td>
                    <td className="py-2.5 px-2 font-semibold">{row.summaryFa}</td>
                    <td className="py-2.5 px-2 font-bold">
                      {row.action === 'create' && (
                        <span className="text-emerald-600 dark:text-emerald-400">{t('adminImport.actionCreate')}</span>
                      )}
                      {row.action === 'update' && (
                        <span className="text-sky-600 dark:text-sky-400">{t('adminImport.actionUpdate')}</span>
                      )}
                      {row.action === 'skip' && (
                        <span className="text-ink/55 dark:text-slate-400">{t('adminImport.actionSkip')}</span>
                      )}
                      {row.action === 'error' && (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{t('adminImport.actionError')}</span>
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
                        <span className="text-ink/55 dark:text-slate-400">{t('adminImport.rowValidMsg')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPreviewPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
              <span className="text-ink/60 dark:text-slate-400 tabular-nums">
                {t('common.pageOf', {
                  page: formatDigits(previewPage),
                  total: formatDigits(totalPreviewPages),
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  {t('common.prev')}
                </button>
                <button
                  type="button"
                  disabled={previewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 disabled:opacity-40"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Persistent Import Jobs & Rollback */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-brand shrink-0" />
            <h2 className="text-sm font-extrabold text-ink dark:text-slate-100">{t('adminImport.step4Title')}</h2>
          </div>
          {isLoadingJobs && <span className="text-ink/55 dark:text-slate-400">{t('adminImport.refreshingJobs')}</span>}
        </div>

        {importJobs.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-line dark:border-slate-700 text-center text-ink/60 dark:text-slate-400">
            {t('adminImport.noJobsEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {importJobs.map((job) => (
              <div
                key={job.id}
                className="p-3.5 rounded-xl border border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-extrabold flex flex-wrap items-center gap-2">
                    <span className="font-mono break-all">{job.id}</span>
                    <span>· {job.templateLabel}</span>
                    <span className="text-ink/60 dark:text-slate-400 font-normal break-all">({job.filename})</span>
                  </div>
                  <div className="text-[11px] text-ink/70 dark:text-slate-400 tabular-nums">
                    {t('adminImport.jobMeta', {
                      created: formatDigits(job.counts.createCount),
                      updated: formatDigits(job.counts.updateCount),
                      skipped: formatDigits(job.counts.skipCount),
                      errors: formatDigits(job.counts.errorCount),
                      actor: job.actorEmail,
                      date: formatDateTime(job.createdAt),
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {job.status === 'rolled_back' ? (
                    <span className="text-amber-700 dark:text-amber-300 font-bold">
                      {t('adminImport.rolledBackAt', {
                        date: job.rolledBackAt ? formatDateTime(job.rolledBackAt) : '',
                      })}
                    </span>
                  ) : confirmRollbackJobId === job.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={rollingBackJobId === job.id}
                        onClick={() => void handleRollbackJob(job.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-50"
                      >
                        {rollingBackJobId === job.id
                          ? t('adminImport.rollingBack')
                          : t('adminImport.confirmRollback')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRollbackJobId(null)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700"
                      >
                        {t('actions.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRollbackJobId(job.id)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('adminImport.rollbackBtn')}</span>
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
