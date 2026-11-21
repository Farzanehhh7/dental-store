import { z } from 'zod';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  normalizePathValue,
  parseOptionalNumber,
} from '../normalize';

const redirectRowSchema = z.object({
  from_path: z
    .string()
    .min(2, 'مسیر مبدا (from_path) باید حداقل ۲ کاراکتر باشد')
    .max(300)
    .refine((v) => v.startsWith('/'), 'مسیر مبدا باید با / شروع شود')
    .refine((v) => !/^\/\//.test(v), 'مسیر مبدا نباید با // شروع شود'),
  to_path: z.string().max(300),
  status_code: z.union([z.literal(301), z.literal(302), z.literal(410)]),
});

export const redirectsTemplate: ImportTemplateDefinition = {
  key: 'redirects',
  label: 'قالب ریدایرکت‌های SEO (Redirects)',
  description: 'مدیریت ریدایرکت‌های ۳۰۱ / ۳۰۲ و صفحات حذف‌شده ۴۱۰ با جلوگیری از حلقه تغییر مسیر (کلید یکتا: from_path)',
  upsertKeyField: 'from_path',
  upsertKeyLabel: 'مسیر مبدا (from_path)',
  columns: [
    { key: 'from_path', labelFa: 'مسیر مبدا', required: true, aliases: ['source', 'from', 'مسیر مبدا'], type: 'string' },
    { key: 'to_path', labelFa: 'مسیر مقصد', required: false, aliases: ['target', 'to', 'مسیر مقصد'], type: 'string' },
    { key: 'status_code', labelFa: 'کد وضعیت HTTP', required: true, aliases: ['code', 'status', 'کد وضعیت'], type: 'number' },
  ],
  sampleRows: [
    {
      from_path: '/old-rotary-endo',
      to_path: '/category/rotary-files',
      status_code: 301,
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const fromPath = normalizePathValue(raw.from_path ?? '');
    const toPathRaw = normalizeDigitsAndArabic(raw.to_path ?? '');
    const toPath = toPathRaw ? normalizePathValue(toPathRaw) : '';

    const parsedStatus = parseOptionalNumber(raw.status_code ?? '');
    if (parsedStatus === INVALID_NUMBER) {
      errors.push('کد وضعیت HTTP باید یکی از اعداد 301، 302 یا 410 باشد.');
    }
    const statusCodeNum = typeof parsedStatus === 'number' ? parsedStatus : 301;
    if (![301, 302, 410].includes(statusCodeNum)) {
      errors.push('کد وضعیت فقط می‌تواند 301، 302 یا 410 باشد.');
    }

    if (statusCodeNum !== 410) {
      if (!toPath) {
        errors.push('برای کدهای ۳۰۱ و ۳۰۲ وارد کردن مسیر مقصد (to_path) الزامی است.');
      } else if (toPath === fromPath) {
        errors.push('مسیر مبدا و مقصد نمی‌توانند یکسان باشند (حلقه ریدایرکت).');
      } else if (/^\/\//.test(toPath)) {
        errors.push('مسیر مقصد نباید با // شروع شود.');
      }
    }

    const fromLower = fromPath.toLowerCase();
    if (fromLower) {
      const prevRow = batchState.seenUpsertKeys.get(fromLower);
      if (prevRow !== undefined) {
        errors.push(`مسیر مبدا تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(fromLower, rowNumber);
      }
    }

    const candidate = {
      from_path: fromPath,
      to_path: statusCodeNum === 410 ? '' : toPath,
      status_code: ([301, 302, 410].includes(statusCodeNum) ? statusCodeNum : 301) as 301 | 302 | 410,
    };

    const zodRes = redirectRowSchema.safeParse(candidate);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        errors.push(issue.message);
      }
    }

    if (errors.length > 0) {
      return {
        upsertKey: fromPath || `row-${rowNumber}`,
        action: 'error',
        summaryFa: `${fromPath || '-'} -> ${candidate.to_path || candidate.status_code}`,
        normalized: candidate,
        errors: Array.from(new Set(errors)),
      };
    }

    const existing = context.redirects.find((r) => r.fromPath.toLowerCase() === fromLower);
    if (existing) {
      const unchanged =
        existing.toPath === candidate.to_path && existing.statusCode === candidate.status_code;
      return {
        upsertKey: fromPath,
        action: unchanged ? 'skip' : 'update',
        summaryFa: `${fromPath} -> ${candidate.to_path || '410'}${unchanged ? ' (بدون تغییر)' : ' (بروزرسانی)'}`,
        normalized: candidate,
        errors: [],
      };
    }

    return {
      upsertKey: fromPath,
      action: 'create',
      summaryFa: `${fromPath} -> ${candidate.to_path || '410'} (جدید)`,
      normalized: candidate,
      errors: [],
    };
  },
  exportRows(context) {
    return context.redirects.map((r) => ({
      from_path: r.fromPath,
      to_path: r.toPath,
      status_code: r.statusCode,
    }));
  },
};
