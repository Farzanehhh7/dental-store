import { z } from 'zod';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_BOOLEAN,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  normalizeSlugValue,
  parseOptionalBoolean,
} from '../normalize';

const brandRowSchema = z.object({
  slug: z.string().min(2, 'اسلاگ برند باید حداقل ۲ کاراکتر باشد').max(80),
  name_fa: z.string().min(2, 'نام فارسی برند الزامی است').max(140),
  name_en: z.string().max(140),
  country_code: z.string().min(2, 'کد کشور باید ۲ کاراکتر باشد').max(4),
  country_fa: z.string().min(2, 'نام فارسی کشور سازنده الزامی است').max(80),
  is_authorized_dealer: z.boolean(),
  is_active: z.boolean(),
  description_fa: z.string().max(600),
});

export const brandsTemplate: ImportTemplateDefinition = {
  key: 'brands',
  label: 'قالب برندها (Brands)',
  description: 'ایجاد و بروزرسانی برندهای دندانپزشکی و پزشکی (کلید یکتا: slug)',
  upsertKeyField: 'slug',
  upsertKeyLabel: 'اسلاگ برند (slug)',
  columns: [
    { key: 'slug', labelFa: 'اسلاگ برند', required: true, aliases: ['brand_slug'], type: 'string' },
    { key: 'name_fa', labelFa: 'نام فارسی برند', required: true, aliases: ['title_fa', 'نام برند'], type: 'string' },
    { key: 'name_en', labelFa: 'نام انگلیسی', required: false, aliases: ['title_en'], type: 'string' },
    { key: 'country_code', labelFa: 'کد کشور (ISO)', required: false, aliases: ['country'], type: 'string' },
    { key: 'country_fa', labelFa: 'کشور سازنده', required: true, aliases: ['origin_country'], type: 'string' },
    { key: 'is_authorized_dealer', labelFa: 'نماینده رسمی', required: false, aliases: ['authorized'], type: 'boolean' },
    { key: 'is_active', labelFa: 'فعال', required: false, aliases: ['active'], type: 'boolean' },
    { key: 'description_fa', labelFa: 'توضیح برند', required: false, aliases: ['description', 'توضیح'], type: 'string' },
  ],
  sampleRows: [
    {
      slug: 'ivoclar-vivadent',
      name_fa: 'ایووکلار ویوادنت',
      name_en: 'Ivoclar Vivadent',
      country_code: 'LI',
      country_fa: 'لیختن‌اشتاین',
      is_authorized_dealer: true,
      is_active: true,
      description_fa: 'تولیدکننده پیشرو سرامیک‌ها و کامپوزیت‌های دندانی',
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const slug = normalizeSlugValue(raw.slug ?? '');
    const nameFa = normalizeDigitsAndArabic(raw.name_fa ?? '');
    const existing = slug ? context.brands.find((b) => b.slug.toLowerCase() === slug) : undefined;

    const nameEn = normalizeDigitsAndArabic(raw.name_en ?? '') || existing?.nameEn || slug;
    const countryCode = (normalizeDigitsAndArabic(raw.country_code ?? '') || existing?.countryCode || 'DE').toUpperCase();
    const countryFa = normalizeDigitsAndArabic(raw.country_fa ?? '') || existing?.countryFa || '';
    const descriptionFa = normalizeDigitsAndArabic(raw.description_fa ?? '') || existing?.descriptionFa || '';

    const parsedDealer = parseOptionalBoolean(raw.is_authorized_dealer ?? '');
    if (parsedDealer === INVALID_BOOLEAN) {
      errors.push('مقدار فیلد نماینده رسمی (is_authorized_dealer) نامعتبر است.');
    }
    const isAuthorizedDealer =
      parsedDealer !== INVALID_BOOLEAN && parsedDealer !== undefined
        ? parsedDealer
        : existing?.isAuthorizedDealer ?? false;

    const parsedActive = parseOptionalBoolean(raw.is_active ?? '');
    if (parsedActive === INVALID_BOOLEAN) {
      errors.push('مقدار فیلد فعال (is_active) نامعتبر است.');
    }
    const isActive = parsedActive !== INVALID_BOOLEAN && parsedActive !== undefined ? parsedActive : existing?.isActive ?? true;

    if (slug) {
      const prevRow = batchState.seenUpsertKeys.get(slug);
      if (prevRow !== undefined) {
        errors.push(`اسلاگ برند تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(slug, rowNumber);
      }
    }

    const candidate = {
      slug,
      name_fa: nameFa,
      name_en: nameEn,
      country_code: countryCode,
      country_fa: countryFa,
      is_authorized_dealer: isAuthorizedDealer,
      is_active: isActive,
      description_fa: descriptionFa,
    };

    const zodRes = brandRowSchema.safeParse(candidate);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        errors.push(issue.message);
      }
    }

    if (errors.length === 0 && slug) {
      batchState.pendingBrandSlugs.add(slug);
    }

    if (errors.length > 0) {
      return {
        upsertKey: slug || `row-${rowNumber}`,
        action: 'error',
        summaryFa: nameFa || slug || 'نامشخص',
        normalized: candidate,
        errors: Array.from(new Set(errors)),
      };
    }

    if (existing) {
      const unchanged =
        normalizeDigitsAndArabic(existing.nameFa) === candidate.name_fa &&
        normalizeDigitsAndArabic(existing.nameEn) === candidate.name_en &&
        existing.countryCode.toUpperCase() === candidate.country_code &&
        normalizeDigitsAndArabic(existing.countryFa) === candidate.country_fa &&
        existing.isAuthorizedDealer === candidate.is_authorized_dealer &&
        existing.isActive === candidate.is_active &&
        normalizeDigitsAndArabic(existing.descriptionFa) === candidate.description_fa;

      return {
        upsertKey: slug,
        action: unchanged ? 'skip' : 'update',
        summaryFa: unchanged ? `${nameFa} (بدون تغییر)` : `${nameFa} (بروزرسانی برند)`,
        normalized: candidate,
        errors: [],
      };
    }

    return {
      upsertKey: slug,
      action: 'create',
      summaryFa: `${nameFa} (برند جدید)`,
      normalized: candidate,
      errors: [],
    };
  },
  exportRows(context) {
    return context.brands.map((b) => ({
      slug: b.slug,
      name_fa: b.nameFa,
      name_en: b.nameEn,
      country_code: b.countryCode,
      country_fa: b.countryFa,
      is_authorized_dealer: b.isAuthorizedDealer,
      is_active: b.isActive,
      description_fa: b.descriptionFa,
    }));
  },
};
