import { z } from 'zod';
import type { Product, ProductVariant } from '../../../../types/domain';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_BOOLEAN,
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  parseOptionalBoolean,
  parseOptionalNumber,
} from '../normalize';

const variantRowSchema = z.object({
  product_sku: z.string().min(2, 'کد محصول مرجع (product_sku) الزامی است').max(64),
  variant_sku: z.string().min(2, 'کد تنوع (variant_sku) باید حداقل ۲ کاراکتر باشد').max(64),
  label_fa: z.string().min(2, 'عنوان فارسی تنوع الزامی است').max(140),
  option_type: z.enum(['shade', 'size', 'pack', 'model', 'unit']),
  option_value_fa: z.string().min(1, 'مقدار ویژگی الزامی است').max(80),
  color_hex: z
    .string()
    .regex(/^$|^#[0-9a-fA-F]{6}$/, 'کد رنگ باید فرمت #RRGGBB داشته باشد')
    .optional()
    .default(''),
  base_price: z.number().finite().min(0, 'قیمت پایه نمی‌تواند منفی باشد').nullable(),
  stock_on_hand: z.number().int('موجودی باید عدد صحیح باشد').min(0, 'موجودی نمی‌تواند منفی باشد'),
  low_stock_threshold: z.number().int().min(0),
  weight_g: z.number().finite().min(0),
  is_active: z.boolean(),
});

function findVariantBySku(products: Product[], variantSkuUpper: string): { product: Product; variant: ProductVariant } | null {
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.sku.toUpperCase() === variantSkuUpper) {
        return { product, variant };
      }
    }
  }
  return null;
}

export const variantsTemplate: ImportTemplateDefinition = {
  key: 'variants',
  label: 'قالب تنوع و شید (Variants)',
  description: 'افزودن یا ویرایش تنوع‌های محصول (رنگ/شید/سایز/بسته) متصل به product_sku',
  upsertKeyField: 'variant_sku',
  upsertKeyLabel: 'کد تنوع (variant_sku)',
  columns: [
    { key: 'product_sku', labelFa: 'کد محصول مرجع', required: true, aliases: ['parent_sku', 'sku_محصول'], type: 'string' },
    { key: 'variant_sku', labelFa: 'کد تنوع (SKU)', required: true, aliases: ['sku', 'کد تنوع'], type: 'string' },
    { key: 'label_fa', labelFa: 'عنوان فارسی تنوع', required: true, aliases: ['label', 'نام تنوع'], type: 'string' },
    { key: 'option_type', labelFa: 'نوع ویژگی', required: false, aliases: ['type'], type: 'enum', enumValues: ['shade', 'size', 'pack', 'model', 'unit'] },
    { key: 'option_value_fa', labelFa: 'مقدار ویژگی', required: false, aliases: ['value', 'مقدار'], type: 'string' },
    { key: 'color_hex', labelFa: 'کد رنگ Hex', required: false, aliases: ['color'], type: 'string' },
    { key: 'base_price', labelFa: 'قیمت پایه (تومان)', required: false, aliases: ['price', 'قیمت'], type: 'number' },
    { key: 'stock_on_hand', labelFa: 'موجودی', required: false, aliases: ['stock', 'موجودی'], type: 'number' },
    { key: 'low_stock_threshold', labelFa: 'آستانه هشدار موجودی', required: false, aliases: ['threshold'], type: 'number' },
    { key: 'weight_g', labelFa: 'وزن (گرم)', required: false, aliases: ['weight'], type: 'number' },
    { key: 'is_active', labelFa: 'فعال', required: false, aliases: ['active'], type: 'boolean' },
  ],
  sampleRows: [
    {
      product_sku: 'DM-CON-1001',
      variant_sku: 'DM-CON-1001-L',
      label_fa: 'سایز L - بسته ۱۰۰ عددی',
      option_type: 'size',
      option_value_fa: 'سایز L',
      color_hex: '',
      base_price: 440000,
      stock_on_hand: 35,
      low_stock_threshold: 10,
      weight_g: 510,
      is_active: true,
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const productSku = normalizeDigitsAndArabic(raw.product_sku ?? '').toUpperCase();
    const variantSku = normalizeDigitsAndArabic(raw.variant_sku ?? '').toUpperCase();
    const labelFa = normalizeDigitsAndArabic(raw.label_fa ?? '');

    const parentProduct = context.products.find((p) => p.sku.toUpperCase() === productSku);
    const parentPendingTitle = batchState.pendingProductSkus.get(productSku);
    if (!productSku) {
      errors.push('کد محصول مرجع (product_sku) الزامی است.');
    } else if (!parentProduct && !parentPendingTitle) {
      errors.push(`محصول مرجع با کد SKU «${productSku}» در کاتالوگ یافت نشد.`);
    }

    const hit = variantSku ? findVariantBySku(context.products, variantSku) : null;
    if (hit && productSku && hit.product.sku.toUpperCase() !== productSku) {
      errors.push(`تنوع «${variantSku}» متعلق به محصول «${hit.product.sku}» است، نه «${productSku}».`);
    }

    const optionType = normalizeDigitsAndArabic(raw.option_type ?? '').toLowerCase() || hit?.variant.optionType || 'pack';
    const optionValueFa =
      normalizeDigitsAndArabic(raw.option_value_fa ?? '') || hit?.variant.optionValueFa || labelFa || variantSku;
    const colorHex = normalizeDigitsAndArabic(raw.color_hex ?? '') || hit?.variant.colorHex || '';

    const parsedPrice = parseOptionalNumber(raw.base_price ?? '');
    if (parsedPrice === INVALID_NUMBER) {
      errors.push('قیمت پایه تنوع باید عدد معتبر باشد.');
    }
    let resolvedPrice: number | null =
      parsedPrice !== INVALID_NUMBER && parsedPrice !== undefined
        ? parsedPrice
        : hit?.variant.basePrice ?? null;

    if (parentProduct?.pricingMode !== 'call_for_price') {
      if (resolvedPrice === null || resolvedPrice <= 0) {
        errors.push('قیمت پایه تنوع برای این محصول باید بزرگ‌تر از صفر باشد.');
      }
    } else if (parsedPrice === 0) {
      resolvedPrice = null;
    }

    const parsedStock = parseOptionalNumber(raw.stock_on_hand ?? '');
    if (parsedStock === INVALID_NUMBER) {
      errors.push('موجودی تنوع باید عدد صحیح باشد.');
    }
    const resolvedStock =
      parsedStock !== INVALID_NUMBER && parsedStock !== undefined ? parsedStock : hit?.variant.stockOnHand ?? 0;

    const parsedThreshold = parseOptionalNumber(raw.low_stock_threshold ?? '');
    if (parsedThreshold === INVALID_NUMBER) {
      errors.push('آستانه هشدار موجودی باید عدد صحیح باشد.');
    }
    const resolvedThreshold =
      parsedThreshold !== INVALID_NUMBER && parsedThreshold !== undefined
        ? parsedThreshold
        : hit?.variant.lowStockThreshold ?? 5;

    const parsedWeight = parseOptionalNumber(raw.weight_g ?? '');
    if (parsedWeight === INVALID_NUMBER) {
      errors.push('وزن کالا باید عدد معتبر باشد.');
    }
    const resolvedWeight =
      parsedWeight !== INVALID_NUMBER && parsedWeight !== undefined ? parsedWeight : hit?.variant.weightG ?? 100;

    const parsedActive = parseOptionalBoolean(raw.is_active ?? '');
    if (parsedActive === INVALID_BOOLEAN) {
      errors.push('مقدار فیلد فعال (is_active) نامعتبر است.');
    }
    const resolvedActive =
      parsedActive !== INVALID_BOOLEAN && parsedActive !== undefined ? parsedActive : hit?.variant.isActive ?? true;

    if (variantSku) {
      const prevRow = batchState.seenUpsertKeys.get(variantSku);
      if (prevRow !== undefined) {
        errors.push(`کد تنوع تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(variantSku, rowNumber);
      }
    }

    const candidate = {
      product_sku: productSku,
      variant_sku: variantSku,
      label_fa: labelFa,
      option_type: optionType,
      option_value_fa: optionValueFa,
      color_hex: colorHex,
      base_price: resolvedPrice,
      stock_on_hand: resolvedStock,
      low_stock_threshold: resolvedThreshold,
      weight_g: resolvedWeight,
      is_active: resolvedActive,
    };

    const zodRes = variantRowSchema.safeParse(candidate);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        errors.push(issue.message);
      }
    }

    if (errors.length > 0) {
      return {
        upsertKey: variantSku || `row-${rowNumber}`,
        action: 'error',
        summaryFa: `${variantSku || '-'} — ${labelFa || 'خطا'}`,
        normalized: candidate,
        errors: Array.from(new Set(errors)),
      };
    }

    if (hit) {
      const v = hit.variant;
      const unchanged =
        normalizeDigitsAndArabic(v.labelFa) === candidate.label_fa &&
        v.optionType === candidate.option_type &&
        normalizeDigitsAndArabic(v.optionValueFa) === candidate.option_value_fa &&
        normalizeDigitsAndArabic(v.colorHex ?? '') === candidate.color_hex &&
        (v.basePrice ?? null) === candidate.base_price &&
        v.stockOnHand === candidate.stock_on_hand &&
        v.lowStockThreshold === candidate.low_stock_threshold &&
        v.weightG === candidate.weight_g &&
        v.isActive === candidate.is_active;

      return {
        upsertKey: variantSku,
        action: unchanged ? 'skip' : 'update',
        summaryFa: unchanged ? `${labelFa} (بدون تغییر)` : `${labelFa} (بروزرسانی تنوع)`,
        normalized: candidate,
        errors: [],
      };
    }

    return {
      upsertKey: variantSku,
      action: 'create',
      summaryFa: `${labelFa} (تنوع جدید برای ${productSku})`,
      normalized: candidate,
      errors: [],
    };
  },
  exportRows(context) {
    const rows: Record<string, unknown>[] = [];
    for (const p of context.products) {
      for (const v of p.variants) {
        rows.push({
          product_sku: p.sku,
          variant_sku: v.sku,
          label_fa: v.labelFa,
          option_type: v.optionType,
          option_value_fa: v.optionValueFa,
          color_hex: v.colorHex ?? '',
          base_price: v.basePrice ?? '',
          stock_on_hand: v.stockOnHand,
          low_stock_threshold: v.lowStockThreshold,
          weight_g: v.weightG,
          is_active: v.isActive,
        });
      }
    }
    return rows;
  },
};
