import { z } from 'zod';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  normalizeSlugValue,
  parseOptionalNumber,
} from '../normalize';

const productRowSchema = z.object({
  sku: z.string().min(2, 'کد SKU باید حداقل ۲ کاراکتر باشد').max(64),
  title_fa: z.string().min(2, 'عنوان فارسی الزامی است').max(220),
  title_en: z.string().max(220),
  slug: z.string().min(2, 'اسلاگ نامعتبر است').max(140),
  brand_slug: z.string().min(1, 'اسلاگ برند الزامی است').max(80),
  category_slug: z.string().min(1, 'اسلاگ دسته‌بندی الزامی است').max(80),
  vertical: z.enum(['dental', 'medical', 'lab']),
  kind: z.enum(['consumable', 'capital_equipment']),
  status: z.enum(['draft', 'active', 'out_of_stock', 'coming_soon', 'archived']),
  pricing_mode: z.enum(['fixed', 'range', 'call_for_price']),
  base_price: z.number().finite().min(0, 'قیمت پایه نمی‌تواند منفی باشد').nullable(),
  stock_on_hand: z.number().int('موجودی باید عدد صحیح باشد').min(0, 'موجودی نمی‌تواند منفی باشد').optional(),
  imed_code: z.string().max(64),
  short_description_fa: z.string().max(600),
});

export const productsTemplate: ImportTemplateDefinition = {
  key: 'products',
  label: 'قالب محصولات (Products)',
  description: 'ایجاد و بروزرسانی محصولات اصلی کاتالوگ با بررسی برند و دسته‌بندی (کلید یکتا: sku)',
  upsertKeyField: 'sku',
  upsertKeyLabel: 'کد کالا (SKU)',
  columns: [
    { key: 'sku', labelFa: 'کد کالا (SKU)', required: true, aliases: ['کد کالا', 'کد محصول', 'product_sku'], type: 'string' },
    { key: 'title_fa', labelFa: 'عنوان فارسی', required: true, aliases: ['عنوان', 'نام محصول', 'title'], type: 'string' },
    { key: 'title_en', labelFa: 'عنوان انگلیسی', required: false, aliases: ['english_title'], type: 'string' },
    { key: 'slug', labelFa: 'اسلاگ URL', required: false, aliases: ['url_slug'], type: 'string' },
    { key: 'brand_slug', labelFa: 'اسلاگ برند', required: true, aliases: ['brand', 'brand_id', 'برند'], type: 'string' },
    { key: 'category_slug', labelFa: 'اسلاگ دسته‌بندی', required: true, aliases: ['category', 'category_id', 'دسته', 'دسته‌بندی'], type: 'string' },
    { key: 'vertical', labelFa: 'حوزه تخصصی', required: false, aliases: ['حوزه'], type: 'enum', enumValues: ['dental', 'medical', 'lab'] },
    { key: 'kind', labelFa: 'نوع کالا', required: false, aliases: ['product_kind'], type: 'enum', enumValues: ['consumable', 'capital_equipment'] },
    { key: 'status', labelFa: 'وضعیت', required: false, aliases: ['product_status'], type: 'enum', enumValues: ['draft', 'active', 'out_of_stock', 'coming_soon', 'archived'] },
    { key: 'pricing_mode', labelFa: 'نحوه قیمت‌گذاری', required: false, aliases: ['pricing'], type: 'enum', enumValues: ['fixed', 'range', 'call_for_price'] },
    { key: 'base_price', labelFa: 'قیمت پایه (تومان)', required: false, aliases: ['price', 'قیمت', 'قیمت پایه'], type: 'number' },
    { key: 'stock_on_hand', labelFa: 'موجودی پیش‌فرض', required: false, aliases: ['stock', 'موجودی'], type: 'number' },
    { key: 'imed_code', labelFa: 'کد IMED', required: false, aliases: ['imed'], type: 'string' },
    { key: 'short_description_fa', labelFa: 'توضیح کوتاه', required: false, aliases: ['description', 'توضیح'], type: 'string' },
  ],
  sampleRows: [
    {
      sku: 'DM-DEMO-101',
      title_fa: 'کامپوزیت نانو سرامیک نمونه',
      title_en: 'Demo Nano Ceramic Composite',
      slug: 'demo-nano-ceramic-composite',
      brand_slug: '3m',
      category_slug: 'composites',
      vertical: 'dental',
      kind: 'consumable',
      status: 'active',
      pricing_mode: 'fixed',
      base_price: 2450000,
      stock_on_hand: 20,
      imed_code: 'IMED-DEMO-101',
      short_description_fa: 'کامپوزیت ترمیمی با پولیش‌پذیری بالا',
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const skuRaw = normalizeDigitsAndArabic(raw.sku ?? '');
    const sku = skuRaw.toUpperCase();
    const titleFa = normalizeDigitsAndArabic(raw.title_fa ?? '');
    const titleEn = normalizeDigitsAndArabic(raw.title_en ?? '') || sku;
    const rawSlug = normalizeDigitsAndArabic(raw.slug ?? '');
    const slug = normalizeSlugValue(rawSlug || sku);

    const existing = context.products.find((p) => p.sku.toUpperCase() === sku);

    const brandInput = normalizeDigitsAndArabic(raw.brand_slug ?? '');
    const brandInputLower = brandInput.toLowerCase();
    const matchedBrand = brandInput
      ? context.brands.find(
          (b) =>
            b.slug.toLowerCase() === brandInputLower ||
            b.id.toLowerCase() === brandInputLower ||
            normalizeDigitsAndArabic(b.nameFa).toLowerCase() === brandInputLower ||
            normalizeDigitsAndArabic(b.nameEn).toLowerCase() === brandInputLower
        )
      : existing
        ? context.brands.find((b) => b.id === existing.brandId)
        : undefined;
    const pendingBrandHit = brandInputLower ? batchState.pendingBrandSlugs.has(brandInputLower) : false;

    if (!brandInput && !existing) {
      errors.push('اسلاگ برند (brand_slug) برای محصول جدید الزامی است.');
    } else if (brandInput && !matchedBrand && !pendingBrandHit) {
      errors.push(`برند «${brandInput}» در کاتالوگ وجود ندارد.`);
    }

    const catInput = normalizeDigitsAndArabic(raw.category_slug ?? '');
    const catInputLower = catInput.toLowerCase();
    const matchedCat = catInput
      ? context.categories.find(
          (c) =>
            c.slug.toLowerCase() === catInputLower ||
            c.id.toLowerCase() === catInputLower ||
            normalizeDigitsAndArabic(c.nameFa).toLowerCase() === catInputLower ||
            normalizeDigitsAndArabic(c.nameEn).toLowerCase() === catInputLower
        )
      : existing
        ? context.categories.find((c) => c.id === existing.primaryCategoryId)
        : undefined;
    const pendingCatHit = catInputLower ? batchState.pendingCategorySlugs.has(catInputLower) : false;

    if (!catInput && !existing) {
      errors.push('اسلاگ دسته‌بندی (category_slug) برای محصول جدید الزامی است.');
    } else if (catInput && !matchedCat && !pendingCatHit) {
      errors.push(`دسته‌بندی «${catInput}» در کاتالوگ وجود ندارد.`);
    }

    const verticalRaw = normalizeDigitsAndArabic(raw.vertical ?? '').toLowerCase() || existing?.vertical || 'dental';
    const kindRaw = normalizeDigitsAndArabic(raw.kind ?? '').toLowerCase() || existing?.kind || 'consumable';
    const statusRaw = normalizeDigitsAndArabic(raw.status ?? '').toLowerCase() || existing?.status || 'active';
    const pricingModeRaw = normalizeDigitsAndArabic(raw.pricing_mode ?? '').toLowerCase() || existing?.pricingMode || 'fixed';

    const parsedPrice = parseOptionalNumber(raw.base_price ?? '');
    if (parsedPrice === INVALID_NUMBER) {
      errors.push('قیمت پایه باید عدد معتبر باشد.');
    }

    const existingDefaultVar = existing?.variants.find((v) => v.isDefault) ?? existing?.variants[0];
    let resolvedBasePrice: number | null =
      parsedPrice !== INVALID_NUMBER && parsedPrice !== undefined
        ? parsedPrice
        : pricingModeRaw === 'call_for_price'
          ? null
          : existingDefaultVar?.basePrice ?? null;

    if (pricingModeRaw === 'call_for_price' && (parsedPrice === undefined || parsedPrice === 0)) {
      resolvedBasePrice = null;
    } else if (pricingModeRaw !== 'call_for_price') {
      if (resolvedBasePrice === null || resolvedBasePrice <= 0) {
        errors.push('قیمت پایه برای کالاهای غیرتماسی باید بزرگ‌تر از صفر باشد.');
      }
    }

    const parsedStock = parseOptionalNumber(raw.stock_on_hand ?? '');
    if (parsedStock === INVALID_NUMBER) {
      errors.push('موجودی پیش‌فرض باید عدد صحیح معتبر باشد.');
    }

    const resolvedStock =
      parsedStock !== INVALID_NUMBER && parsedStock !== undefined
        ? parsedStock
        : existingDefaultVar?.stockOnHand;

    const imedCode = normalizeDigitsAndArabic(raw.imed_code ?? '') || existing?.imedCode || '';
    const shortDesc = normalizeDigitsAndArabic(raw.short_description_fa ?? '') || existing?.shortDescriptionFa || titleFa;

    if (sku) {
      const prevRow = batchState.seenUpsertKeys.get(sku);
      if (prevRow !== undefined) {
        errors.push(`کد SKU تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(sku, rowNumber);
      }
    }

    const candidate = {
      sku,
      title_fa: titleFa,
      title_en: titleEn,
      slug,
      brand_slug: matchedBrand?.slug ?? brandInputLower,
      category_slug: matchedCat?.slug ?? catInputLower,
      vertical: verticalRaw,
      kind: kindRaw,
      status: statusRaw,
      pricing_mode: pricingModeRaw,
      base_price: resolvedBasePrice,
      stock_on_hand: resolvedStock,
      imed_code: imedCode,
      short_description_fa: shortDesc,
    };

    const zodRes = productRowSchema.safeParse(candidate);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        errors.push(issue.message);
      }
    }

    if (errors.length === 0 && sku) {
      batchState.pendingProductSkus.set(sku, titleFa);
    }

    const normalized = {
      ...candidate,
      brandId: matchedBrand?.id ?? existing?.brandId ?? '',
      categoryId: matchedCat?.id ?? existing?.primaryCategoryId ?? '',
    };

    if (errors.length > 0) {
      return {
        upsertKey: sku || `row-${rowNumber}`,
        action: 'error',
        summaryFa: titleFa || sku || 'نامشخص',
        normalized,
        errors: Array.from(new Set(errors)),
      };
    }

    if (existing) {
      const sameTitle = normalizeDigitsAndArabic(existing.titleFa) === candidate.title_fa;
      const sameEn = normalizeDigitsAndArabic(existing.titleEn) === candidate.title_en;
      const sameSlug = normalizeSlugValue(existing.slug) === candidate.slug;
      const sameBrand = matchedBrand ? existing.brandId === matchedBrand.id : true;
      const sameCat = matchedCat ? existing.primaryCategoryId === matchedCat.id : true;
      const sameVertical = existing.vertical === candidate.vertical;
      const sameKind = existing.kind === candidate.kind;
      const sameStatus = existing.status === candidate.status;
      const samePricing = existing.pricingMode === candidate.pricing_mode;
      const samePrice = (existingDefaultVar?.basePrice ?? null) === candidate.base_price;
      const sameStock =
        candidate.stock_on_hand === undefined ||
        (existingDefaultVar?.stockOnHand ?? 0) === candidate.stock_on_hand;
      const sameImed = normalizeDigitsAndArabic(existing.imedCode ?? '') === candidate.imed_code;
      const sameDesc =
        normalizeDigitsAndArabic(existing.shortDescriptionFa ?? '') === candidate.short_description_fa;

      if (
        sameTitle &&
        sameEn &&
        sameSlug &&
        sameBrand &&
        sameCat &&
        sameVertical &&
        sameKind &&
        sameStatus &&
        samePricing &&
        samePrice &&
        sameStock &&
        sameImed &&
        sameDesc
      ) {
        return {
          upsertKey: sku,
          action: 'skip',
          summaryFa: `${titleFa} (بدون تغییر)`,
          normalized,
          errors: [],
        };
      }

      return {
        upsertKey: sku,
        action: 'update',
        summaryFa: `${titleFa} (بروزرسانی محصول)`,
        normalized,
        errors: [],
      };
    }

    return {
      upsertKey: sku,
      action: 'create',
      summaryFa: `${titleFa} (محصول جدید)`,
      normalized,
      errors: [],
    };
  },
  exportRows(context) {
    const brandMap = new Map(context.brands.map((b) => [b.id, b.slug]));
    const catMap = new Map(context.categories.map((c) => [c.id, c.slug]));
    return context.products.map((p) => {
      const defVar = p.variants.find((v) => v.isDefault) ?? p.variants[0];
      return {
        sku: p.sku,
        title_fa: p.titleFa,
        title_en: p.titleEn,
        slug: p.slug,
        brand_slug: brandMap.get(p.brandId) ?? p.brandId,
        category_slug: catMap.get(p.primaryCategoryId) ?? p.primaryCategoryId,
        vertical: p.vertical,
        kind: p.kind,
        status: p.status,
        pricing_mode: p.pricingMode,
        base_price: defVar?.basePrice ?? '',
        stock_on_hand: defVar?.stockOnHand ?? 0,
        imed_code: p.imedCode ?? '',
        short_description_fa: p.shortDescriptionFa ?? '',
      };
    });
  },
};
