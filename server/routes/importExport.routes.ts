import express from 'express';
import { buildCsvContent } from '../../src/lib/csv';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  parseCsvToMatrix,
  parseXlsxBufferToMatrix,
  rowsToXlsxBuffer,
} from '../../src/lib/excel';
import {
  IMPORT_TEMPLATE_LIST,
  applyColumnMappingToMatrix,
  autoMapColumns,
  buildErrorReportRows,
  detectTemplateFromHeaders,
  getImportTemplate,
  type ImportTemplateKey,
} from '../../src/pages/admin/importExport';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import { hasAdminPermission } from '../lib/rbac';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import {
  commitImportService,
  exportTemplateService,
  rollbackImportJobService,
  toJobSummaryDto,
  validateImportRowsService,
} from '../services/importExportService';
import {
  importCommitBodySchema,
  importParseBodySchema,
  importTemplateKeySchema,
  importValidateBodySchema,
  parseRequestBody,
} from '../validation';

async function authorizeTemplateAccess(req: express.Request, templateKey?: ImportTemplateKey) {
  const baseCheck = await verifyFirebaseAdmin(req, ['super_admin', 'admin', 'sales_mgr', 'warehouse', 'content']);
  if ('errorStatus' in baseCheck) return baseCheck;

  const role = baseCheck.role;
  if (templateKey === 'stock') {
    if (hasAdminPermission(role, 'inventory:write') || hasAdminPermission(role, 'catalog:import')) {
      return baseCheck;
    }
    return { errorStatus: 403 as const, message: 'دسترسی کافی برای ورود یا خروج موجودی انبار ندارید.' };
  }

  if (!hasAdminPermission(role, 'catalog:import')) {
    return { errorStatus: 403 as const, message: 'دسترسی کافی برای ایمپورت یا اکسپورت کاتالوگ ندارید.' };
  }
  return baseCheck;
}

export function createImportExportRouter(store: ServerStore, repos: RepositoryBundle): express.Router {
  const router = express.Router();
  const largeJsonParser = express.json({ limit: '8mb' });

  router.get('/api/admin/import/templates', async (req, res) => {
    const auth = await authorizeTemplateAccess(req);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }
    return res.json({
      ok: true,
      maxFileBytes: MAX_IMPORT_FILE_BYTES,
      maxRows: MAX_IMPORT_ROWS,
      templates: IMPORT_TEMPLATE_LIST.map((t) => ({
        key: t.key,
        label: t.label,
        description: t.description,
        upsertKeyField: t.upsertKeyField,
        upsertKeyLabel: t.upsertKeyLabel,
        columns: t.columns,
        sampleRows: t.sampleRows,
      })),
    });
  });

  router.get('/api/admin/import/export/:templateKey', async (req, res) => {
    const tplParse = importTemplateKeySchema.safeParse(req.params.templateKey);
    if (!tplParse.success) {
      return res.status(404).json({ ok: false, message: 'قالب درخواستی یافت نشد.' });
    }
    const templateKey = tplParse.data;
    const auth = await authorizeTemplateAccess(req, templateKey);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    const format = String(req.query.format ?? 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const isSample = String(req.query.sample ?? '') === '1';
    const template = getImportTemplate(templateKey)!;

    let headers: string[];
    let rows: Record<string, unknown>[];
    if (isSample) {
      headers = template.columns.map((c) => c.key);
      rows = template.sampleRows;
    } else {
      const exported = await exportTemplateService(repos, templateKey);
      headers = exported.headers;
      rows = exported.rows;
    }

    const suffix = isSample ? 'template' : 'export';
    if (format === 'xlsx') {
      const buf = await rowsToXlsxBuffer(rows, templateKey, headers);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${templateKey}-${suffix}.xlsx"`);
      return res.send(Buffer.from(buf));
    }

    const csv = buildCsvContent(
      headers,
      rows.map((r) => headers.map((h) => r[h] ?? ''))
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${templateKey}-${suffix}.csv"`);
    return res.send(Buffer.from(csv, 'utf8'));
  });

  router.post('/api/admin/import/parse', largeJsonParser, async (req, res) => {
    const auth = await authorizeTemplateAccess(req);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    const body = parseRequestBody(importParseBodySchema, req, res);
    if (!body) return;

    const rawBase64 = body.contentBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength === 0) {
      return res.status(400).json({ ok: false, message: 'فایل ارسالی خالی است.' });
    }
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      return res.status(413).json({
        ok: false,
        message: 'حجم فایل بیش از سقف مجاز (۵ مگابایت) است.',
      });
    }

    try {
      const lower = body.filename.toLowerCase();
      const isCsv = lower.endsWith('.csv') || body.mimeType.includes('csv') || body.mimeType === 'text/plain';
      const matrix = isCsv
        ? parseCsvToMatrix(buffer.toString('utf8'), { maxBytes: MAX_IMPORT_FILE_BYTES, maxRows: MAX_IMPORT_ROWS })
        : await parseXlsxBufferToMatrix(buffer, { maxBytes: MAX_IMPORT_FILE_BYTES, maxRows: MAX_IMPORT_ROWS });

      if (matrix.length < 2) {
        return res.status(400).json({ ok: false, message: 'فایل باید حداقل شامل یک سطر سرستون و یک سطر داده باشد.' });
      }

      const headers = matrix[0] ?? [];
      const detected = detectTemplateFromHeaders(headers);
      const template = getImportTemplate(detected.templateKey)!;
      const mappedPreviewRows = applyColumnMappingToMatrix(matrix, template, detected.mapping);

      return res.json({
        ok: true,
        headers,
        rowCount: Math.max(0, matrix.length - 1),
        detectedTemplateKey: detected.templateKey,
        confidence: detected.confidence,
        suggestedMapping: detected.mapping,
        allSuggestedMappings: Object.fromEntries(
          IMPORT_TEMPLATE_LIST.map((t) => [t.key, autoMapColumns(headers, t)])
        ),
        matrix,
        previewSampleCount: mappedPreviewRows.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'امکان خواندن فایل ارسالی وجود ندارد.';
      return res.status(400).json({ ok: false, message });
    }
  });

  router.post('/api/admin/import/validate', largeJsonParser, async (req, res) => {
    const body = parseRequestBody(importValidateBodySchema, req, res);
    if (!body) return;

    const auth = await authorizeTemplateAccess(req, body.templateKey);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    try {
      const dryRun = await validateImportRowsService(repos, {
        templateKey: body.templateKey,
        rawRows: body.rows,
      });
      return res.json({
        ok: true,
        dryRun,
        errorReportRows: buildErrorReportRows(dryRun),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در اعتبارسنجی داده‌ها.';
      return res.status(400).json({ ok: false, message });
    }
  });

  router.post('/api/admin/import/commit', largeJsonParser, async (req, res) => {
    const body = parseRequestBody(importCommitBodySchema, req, res);
    if (!body) return;

    const auth = await authorizeTemplateAccess(req, body.templateKey);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    const result = await commitImportService(store, repos, {
      templateKey: body.templateKey,
      filename: body.filename,
      rawRows: body.rows,
      actorUid: auth.user.uid,
      actorEmail: auth.user.email,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message,
        ...(result.dryRun ? { dryRun: result.dryRun } : {}),
      });
    }

    return res.json({
      ok: true,
      job: result.data.job,
      dryRun: result.data.dryRun,
      errorReportRows: buildErrorReportRows(result.data.dryRun),
    });
  });

  router.get('/api/admin/import/jobs', async (req, res) => {
    const auth = await authorizeTemplateAccess(req);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    const jobList = await repos.engagement.listImportJobs(100);
    const jobs = jobList.map((j) => toJobSummaryDto(j));
    return res.json({ ok: true, jobs });
  });

  router.post('/api/admin/import/jobs/:id/rollback', async (req, res) => {
    const jobId = String(req.params.id ?? '').trim();
    const existing = await repos.engagement.getImportJob(jobId);
    const auth = await authorizeTemplateAccess(req, existing?.templateKey);
    if ('errorStatus' in auth) {
      return res.status(auth.errorStatus).json({ ok: false, message: auth.message });
    }

    const result = await rollbackImportJobService(store, repos, {
      jobId,
      actorUid: auth.user.uid,
      actorEmail: auth.user.email,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, job: result.job });
  });

  return router;
}
