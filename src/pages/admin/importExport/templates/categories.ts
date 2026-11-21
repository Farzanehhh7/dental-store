import { z } from 'zod';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_BOOLEAN,
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  normalizeSlugValue,
  parseOptionalBoolean,
  parseOptionalNumber,
} from '../normalize';

const categoryRowSchema = z.object({
  slug: z.string().min(2, 'اسلاگ دسته‌بندی باید حداقل ۲ کاراکتر باشد').max(100),
  name_fa: z.string().min(2, 'نام فارسی دسته‌بندی الزامی است').max(140),
  name_en: z.string().max(140),
  parent_slug: z.string().max(100),
  vertical: z.enum(['dental', 'medical', 'lab']),
  is_active: z.boolean(),
  sort_order: z.number().int('ترتیب نمایش باید عدد صحیح باشد').min(0),
  description_fa: z.string().max(500),
});

export const categoriesTemplate: ImportTemplateDefinition = {
  key: 'categories',
  label: 'قالب دسته‌بندی‌ها (Categories)',
  description: 'ایجاد و بروزرسانی دسته‌بندی‌های درختی کالا با کنترل parent_slug (کلید یکتا: slug)',
  upsertKeyField: 'slug',
  upsertKeyLabel: 'اسلاگ دسته‌بندی (slug)',
  columns: [
    { key: 'slug', labelFa: 'اسلاگ دسته‌بندی', required: true, aliases: ['category_slug', 'کد دسته'], type: 'string' },
    { key: 'name_fa', labelFa: 'نام فارسی', required: true, aliases: ['title_fa', 'نام دسته'], type: 'string' },
    { key: 'name_en', labelFa: 'نام انگلیسی', required: false, aliases: ['title_en'], type: 'string' },
    { key: 'parent_slug', labelFa: 'اسلاگ دسته والد', required: false, aliases: ['parent', 'والد'], type: 'string' },
    { key: 'vertical', labelFa: 'حوزه تخصصی', required: false, aliases: ['حوزه'], type: 'enum', enumValues: ['dental', 'medical', 'lab'] },
    { key: 'is_active', labelFa: 'فعال', required: false, aliases: ['active'], type: 'boolean' },
    { key: 'sort_order', labelFa: 'ترتیب نمایش', required: false, aliases: ['order', 'ترتیب'], type: 'number' },
    { key: 'description_fa', labelFa: 'توضیح فارسی', required: false, aliases: ['description', 'توضیح'], type: 'string' },
  ],
  sampleRows: [
    {
      slug: 'digital-cad-cam',
      name_fa: 'تجهیزات دیجیتال CAD/CAM',
      name_en: 'Digital CAD/CAM',
      parent_slug: 'clinic-equipment',
      vertical: 'dental',
      is_active: true,
      sort_order: 25,
      description_fa: 'اسکنرها و فرزهای دیجیتال لابراتواری و مطب',
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const slug = normalizeSlugValue(raw.slug ?? '');
    const nameFa = normalizeDigitsAndArabic(raw.name_fa ?? '');
    const existing = slug ? context.categories.find((c) => c.slug.toLowerCase() === slug) : undefined;

    const nameEn = normalizeDigitsAndArabic(raw.name_en ?? '') || existing?.nameEn || slug;
    const parentRaw = normalizeDigitsAndArabic(raw.parent_slug ?? '');
    const parentSlug = parentRaw ? normalizeSlugValue(parentRaw) : '';

    const parentCat = parentSlug
      ? context.categories.find((c) => c.slug.toLowerCase() === parentSlug || c.id.toLowerCase() === parentSlug)
      : undefined;
    const parentPending = parentSlug ? batchState.pendingCategorySlugs.has(parentSlug) : false;

    if (parentSlug) {
      if (parentSlug === slug) {
        errors.push('دسته‌بندی نمی‌تواند والد خودش باشد.');
      } else if (!parentCat && !parentPending) {
        errors.push(`دسته‌بندی والد «${parentRaw}» یافت نشد.`);
      }
    }

    const vertical = normalizeDigitsAndArabic(raw.vertical ?? '').toLowerCase() || existing?.vertical || 'dental';
    const parsedActive = parseOptionalBoolean(raw.is_active ?? '');
    if (parsedActive === INVALID_BOOLEAN) {
      errors.push('مقدار فیلد فعال (is_active) نامعتبر است.');
    }
    const isActive = parsedActive !== INVALID_BOOLEAN && parsedActive !== undefined ? parsedActive : existing?.isActive ?? true;

    const parsedOrder = parseOptionalNumber(raw.sort_order ?? '');
    if (parsedOrder === INVALID_NUMBER) {
      errors.push('ترتیب نمایش (sort_order) باید عدد صحیح باشد.');
    }
    const sortOrder =
      parsedOrder !== INVALID_NUMBER && parsedOrder !== undefined ? parsedOrder : existing?.sortOrder ?? 10;

    const descriptionFa = normalizeDigitsAndArabic(raw.description_fa ?? '') || existing?.descriptionFa || '';

    if (slug) {
      const prevRow = batchState.seenUpsertKeys.get(slug);
      if (prevRow !== undefined) {
        errors.push(`اسلاگ تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(slug, rowNumber);
      }
    }

    const candidate = {
      slug,
      name_fa: nameFa,
      name_en: nameEn,
      parent_slug: parentCat?.slug ?? parentSlug,
      vertical,
      is_active: isActive,
      sort_order: sortOrder,
      description_fa: descriptionFa,
    };

    const zodRes = categoryRowSchema.safeParse(candidate);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        errors.push(issue.message);
      }
    }

    if (errors.length === 0 && slug) {
      batchState.pendingCategorySlugs.add(slug);
    }

    const normalized = {
      ...candidate,
      parentId: parentCat?.id ?? null,
    };

    if (errors.length > 0) {
      return {
        upsertKey: slug || `row-${rowNumber}`,
        action: 'error',
        summaryFa: nameFa || slug || 'نامشخص',
        normalized,
        errors: Array.from(new Set(errors)),
      };
    }

    if (existing) {
      const existingParentSlug = existing.parentId
        ? normalizeSlugValue(context.categories.find((c) => c.id === existing.parentId)?.slug ?? '')
        : '';
      const unchanged =
        normalizeDigitsAndArabic(existing.nameFa) === candidate.name_fa &&
        normalizeDigitsAndArabic(existing.nameEn) === candidate.name_en &&
        existingParentSlug === candidate.parent_slug &&
        existing.vertical === candidate.vertical &&
        existing.isActive === candidate.is_active &&
        existing.sortOrder === candidate.sort_order &&
        normalizeDigitsAndArabic(existing.descriptionFa) === candidate.description_fa;

      return {
        upsertKey: slug,
        action: unchanged ? 'skip' : 'update',
        summaryFa: unchanged ? `${nameFa} (بدون تغییر)` : `${nameFa} (بروزرسانی دسته)`,
        normalized,
        errors: [],
      };
    }

    return {
      upsertKey: slug,
      action: 'create',
      summaryFa: `${nameFa} (دسته جدید)`,
      normalized,
      errors: [],
    };
  },
  exportRows(context) {
    const slugById = new Map(context.categories.map((c) => [c.id, c.slug]));
    return context.categories.map((c) => ({
      slug: c.slug,
      name_fa: c.nameFa,
      name_en: c.nameEn,
      parent_slug: c.parentId ? slugById.get(c.parentId) ?? '' : '',
      vertical: c.vertical,
      is_active: c.isActive,
      sort_order: c.sortOrder,
      description_fa: c.descriptionFa,
    }));
  },
};
