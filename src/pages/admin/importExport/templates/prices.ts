import { z } from 'zod';
import type { Product, ProductVariant } from '../../../../types/domain';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  parseOptionalNumber,
} from '../normalize';

const priceRowSchema = z.object({
  sku: z.string().min(2, 'کد SKU الزامی است').max(64),
  base_price: z.number().finite().positive('قیمت پایه باید بزرگ‌تر از صفر باشد'),
  dentist_price: z.number().finite().positive('قیمت دندانپزشک باید مثبت باشد').optional(),
  clinic_price: z.number().finite().positive('قیمت کلینیک باید مثبت باشد').optional(),
  lab_price: z.number().finite().positive('قیمت لابراتوار باید مثبت باشد').optional(),
  wholesale_price: z.number().finite().positive('قیمت عمده‌فروشی باید مثبت باشد').optional(),
});

function resolveTargetVariant(products: Product[], skuUpper: string): { product: Product; variant: ProductVariant } | null {
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.sku.toUpperCase() === skuUpper) {
        return { product, variant };
      }
    }
  }
  const prod = products.find((p) => p.sku.toUpperCase() === skuUpper);
  if (prod) {
    const defVar = prod.variants.find((v) => v.isDefault) ?? prod.variants[0];
    if (defVar) return { product: prod, variant: defVar };
  }
  return null;
}

export const pricesTemplate: ImportTemplateDefinition = {
  key: 'prices',
  label: 'قالب بروزرسانی قیمت (Prices)',
  description: 'بروزرسانی نرخ پایه و تعرفه‌های صنفی (دندانپزشک، کلینیک، لابراتوار، عمده) با کلید SKU تنوع یا محصول',
  upsertKeyField: 'sku',
  upsertKeyLabel: 'کد SKU تنوع / محصول',
  columns: [
    { key: 'sku', labelFa: 'کد SKU', required: true, aliases: ['variant_sku', 'product_sku', 'کد کالا'], type: 'string' },
    { key: 'base_price', labelFa: 'قیمت پایه (تومان)', required: true, aliases: ['price', 'قیمت پایه'], type: 'number' },
    { key: 'dentist_price', labelFa: 'قیمت دندانپزشک', required: false, aliases: ['dentist'], type: 'number' },
    { key: 'clinic_price', labelFa: 'قیمت کلینیک', required: false, aliases: ['clinic'], type: 'number' },
    { key: 'lab_price', labelFa: 'قیمت لابراتوار', required: false, aliases: ['lab'], type: 'number' },
    { key: 'wholesale_price', labelFa: 'قیمت عمده', required: false, aliases: ['wholesale'], type: 'number' },
  ],
  sampleRows: [
    {
      sku: 'DM-CON-1001-S',
      base_price: 455000,
      dentist_price: 425000,
      clinic_price: 405000,
      lab_price: 410000,
      wholesale_price: 380000,
    },
  ],
  validateRow(raw, rowNumber, context, batchState) {
    const errors: string[] = [];
    if (hasAnyFormulaPayload(raw)) {
      errors.push('کاراکتر شروع فرمول اکسل (=، +، -، @) در سلول مجاز نیست.');
    }

    const sku = normalizeDigitsAndArabic(raw.sku ?? '').toUpperCase();
    const target = sku ? resolveTargetVariant(context.products, sku) : null;
    if (!sku) {
      errors.push('کد SKU الزامی است.');
    } else if (!target) {
      errors.push(`کالا یا تنوع با کد SKU «${sku}» یافت نشد.`);
    }

    const basePriceParsed = parseOptionalNumber(raw.base_price ?? '');
    const dentistParsed = parseOptionalNumber(raw.dentist_price ?? '');
    const clinicParsed = parseOptionalNumber(raw.clinic_price ?? '');
    const labParsed = parseOptionalNumber(raw.lab_price ?? '');
    const wholesaleParsed = parseOptionalNumber(raw.wholesale_price ?? '');

    if (basePriceParsed === INVALID_NUMBER || basePriceParsed === undefined) {
      errors.push('قیمت پایه معتبر و بزرگ‌تر از صفر الزامی است.');
    }
    if (dentistParsed === INVALID_NUMBER) errors.push('قیمت دندانپزشک عدد معتبر نیست.');
    if (clinicParsed === INVALID_NUMBER) errors.push('قیمت کلینیک عدد معتبر نیست.');
    if (labParsed === INVALID_NUMBER) errors.push('قیمت لابراتوار عدد معتبر نیست.');
    if (wholesaleParsed === INVALID_NUMBER) errors.push('قیمت عمده عدد معتبر نیست.');

    const canonicalSku = target?.variant.sku.toUpperCase() || sku;
    if (canonicalSku) {
      const prevRow = batchState.seenUpsertKeys.get(canonicalSku);
      if (prevRow !== undefined) {
        errors.push(`کد SKU تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(canonicalSku, rowNumber);
      }
    }

    const candidate = {
      sku: canonicalSku,
      base_price: typeof basePriceParsed === 'number' ? basePriceParsed : 0,
      ...(typeof dentistParsed === 'number' ? { dentist_price: dentistParsed } : {}),
      ...(typeof clinicParsed === 'number' ? { clinic_price: clinicParsed } : {}),
      ...(typeof labParsed === 'number' ? { lab_price: labParsed } : {}),
      ...(typeof wholesaleParsed === 'number' ? { wholesale_price: wholesaleParsed } : {}),
    };

    if (errors.length === 0) {
      const zodRes = priceRowSchema.safeParse(candidate);
      if (!zodRes.success) {
        for (const issue of zodRes.error.issues) {
          errors.push(issue.message);
        }
      }
    }

    const normalized = {
      ...candidate,
      productId: target?.product.id ?? '',
      variantId: target?.variant.id ?? '',
    };

    if (errors.length > 0 || !target) {
      return {
        upsertKey: canonicalSku || `row-${rowNumber}`,
        action: 'error',
        summaryFa: target ? `${target.product.titleFa} (${target.variant.sku})` : sku || 'نامشخص',
        normalized,
        errors: Array.from(new Set(errors)),
      };
    }

    const v = target.variant;
    const gp = v.groupPrices ?? {};
    const unchanged =
      v.basePrice === candidate.base_price &&
      gp.dentist === candidate.dentist_price &&
      gp.clinic === candidate.clinic_price &&
      gp.lab === candidate.lab_price &&
      gp.wholesale === candidate.wholesale_price;

    return {
      upsertKey: canonicalSku,
      action: unchanged ? 'skip' : 'update',
      summaryFa: `${target.product.titleFa} — ${v.labelFa}${unchanged ? ' (بدون تغییر)' : ''}`,
      normalized,
      errors: [],
    };
  },
  exportRows(context) {
    const rows: Record<string, unknown>[] = [];
    for (const p of context.products) {
      for (const v of p.variants) {
        if (typeof v.basePrice !== 'number' || v.basePrice <= 0) continue;
        rows.push({
          sku: v.sku,
          base_price: v.basePrice,
          dentist_price: v.groupPrices?.dentist ?? '',
          clinic_price: v.groupPrices?.clinic ?? '',
          lab_price: v.groupPrices?.lab ?? '',
          wholesale_price: v.groupPrices?.wholesale ?? '',
        });
      }
    }
    return rows;
  },
};
