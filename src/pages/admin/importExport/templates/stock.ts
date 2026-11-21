import { z } from 'zod';
import type { Product, ProductVariant } from '../../../../types/domain';
import type { ImportTemplateDefinition } from '../types';
import {
  INVALID_NUMBER,
  hasAnyFormulaPayload,
  normalizeDigitsAndArabic,
  parseOptionalNumber,
} from '../normalize';

const stockRowSchema = z.object({
  sku: z.string().min(2, 'کد SKU الزامی است').max(64),
  warehouse_code: z.string().min(2, 'کد انبار الزامی است').max(40),
  stock_on_hand: z.number().int('موجودی باید عدد صحیح باشد').min(0, 'موجودی نمی‌تواند منفی باشد'),
  low_stock_threshold: z.number().int().min(0).optional(),
  reason: z.string().min(2, 'علت تعدیل باید حداقل ۲ کاراکتر باشد').max(200),
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

export const stockTemplate: ImportTemplateDefinition = {
  key: 'stock',
  label: 'قالب تعدیل موجودی انبار (Stock)',
  description: 'انبارگردانی و تنظیم موجودی فیزیکی به تفکیک انبار با ثبت در دفترکل حرکات انبار (کلید: sku + warehouse_code)',
  upsertKeyField: 'sku+warehouse_code',
  upsertKeyLabel: 'SKU + کد انبار',
  columns: [
    { key: 'sku', labelFa: 'کد SKU تنوع/محصول', required: true, aliases: ['variant_sku', 'کد کالا'], type: 'string' },
    { key: 'warehouse_code', labelFa: 'کد انبار', required: true, aliases: ['warehouse', 'انبار'], type: 'string' },
    { key: 'stock_on_hand', labelFa: 'موجودی فیزیکی جدید', required: true, aliases: ['on_hand', 'stock', 'موجودی'], type: 'number' },
    { key: 'low_stock_threshold', labelFa: 'آستانه هشدار', required: false, aliases: ['threshold'], type: 'number' },
    { key: 'reason', labelFa: 'شرح / علت تعدیل', required: false, aliases: ['note', 'توضیح'], type: 'string' },
  ],
  sampleRows: [
    {
      sku: 'DM-CON-1001-S',
      warehouse_code: 'TEH-CENTRAL',
      stock_on_hand: 90,
      low_stock_threshold: 15,
      reason: 'انبارگردانی دوره‌ای',
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
      errors.push(`تنوع یا محصول با کد SKU «${sku}» یافت نشد.`);
    }

    const whInput = normalizeDigitsAndArabic(raw.warehouse_code ?? '').toUpperCase();
    const defaultWh = context.warehouses.find((w) => w.isDefault && w.isActive) ?? context.warehouses[0];
    const matchedWh = whInput
      ? context.warehouses.find(
          (w) =>
            w.code.toUpperCase() === whInput ||
            w.id.toUpperCase() === whInput ||
            normalizeDigitsAndArabic(w.nameFa).toUpperCase() === whInput
        )
      : defaultWh;

    if (whInput && !matchedWh) {
      errors.push(`انبار با کد «${whInput}» وجود ندارد.`);
    } else if (!matchedWh) {
      errors.push('کد انبار مشخص نیست و هیچ انبار فعالی یافت نشد.');
    } else if (!matchedWh.isActive) {
      errors.push(`انبار «${matchedWh.code}» غیرفعال است.`);
    }

    const parsedOnHand = parseOptionalNumber(raw.stock_on_hand ?? '');
    if (parsedOnHand === INVALID_NUMBER || parsedOnHand === undefined) {
      errors.push('موجودی جدید باید عدد صحیح غیرمنفی باشد.');
    }

    const parsedThreshold = parseOptionalNumber(raw.low_stock_threshold ?? '');
    if (parsedThreshold === INVALID_NUMBER) {
      errors.push('آستانه هشدار موجودی باید عدد صحیح باشد.');
    }

    const reason = normalizeDigitsAndArabic(raw.reason ?? '') || 'بروزرسانی موجودی از فایل اکسل';

    const canonicalSku = target?.variant.sku.toUpperCase() || sku;
    const whCode = matchedWh?.code.toUpperCase() || whInput;
    const compositeKey = `${canonicalSku}::${whCode}`;

    if (canonicalSku && whCode) {
      const prevRow = batchState.seenUpsertKeys.get(compositeKey);
      if (prevRow !== undefined) {
        errors.push(`ترکیب SKU و کد انبار تکراری در فایل (قبلاً در ردیف ${prevRow} ثبت شده است).`);
      } else {
        batchState.seenUpsertKeys.set(compositeKey, rowNumber);
      }
    }

    const currentLevel =
      target && matchedWh
        ? context.stockLevels.find((l) => l.variantId === target.variant.id && l.warehouseId === matchedWh.id)
        : undefined;

    if (
      currentLevel &&
      typeof parsedOnHand === 'number' &&
      parsedOnHand < currentLevel.reserved
    ) {
      errors.push(
        `موجودی جدید (${parsedOnHand}) نمی‌تواند کمتر از تعداد رزروشده سفارش‌های باز (${currentLevel.reserved}) باشد.`
      );
    }

    const candidate = {
      sku: canonicalSku,
      warehouse_code: whCode,
      stock_on_hand: typeof parsedOnHand === 'number' ? parsedOnHand : -1,
      ...(typeof parsedThreshold === 'number' ? { low_stock_threshold: parsedThreshold } : {}),
      reason,
    };

    if (errors.length === 0) {
      const zodRes = stockRowSchema.safeParse(candidate);
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
      warehouseId: matchedWh?.id ?? '',
    };

    if (errors.length > 0 || !target || !matchedWh) {
      return {
        upsertKey: compositeKey,
        action: 'error',
        summaryFa: target ? `${target.product.titleFa} (${whCode})` : compositeKey,
        normalized,
        errors: Array.from(new Set(errors)),
      };
    }

    const currentOnHand = currentLevel ? currentLevel.onHand : target.variant.stockOnHand;
    const currentThreshold = currentLevel ? currentLevel.lowStockThreshold : target.variant.lowStockThreshold;
    const unchanged =
      currentOnHand === candidate.stock_on_hand &&
      (candidate.low_stock_threshold === undefined || candidate.low_stock_threshold === currentThreshold);

    return {
      upsertKey: compositeKey,
      action: unchanged ? 'skip' : 'update',
      summaryFa: `${target.product.titleFa} (${canonicalSku} @ ${whCode})${unchanged ? ' (بدون تغییر)' : ''}`,
      normalized,
      errors: [],
    };
  },
  exportRows(context) {
    const whCodeMap = new Map(context.warehouses.map((w) => [w.id, w.code]));
    const defaultWhCode = context.warehouses.find((w) => w.isDefault)?.code ?? 'TEH-CENTRAL';
    const rows: Record<string, unknown>[] = [];

    for (const p of context.products) {
      for (const v of p.variants) {
        const levels = context.stockLevels.filter((l) => l.variantId === v.id);
        if (levels.length > 0) {
          for (const lvl of levels) {
            rows.push({
              sku: v.sku,
              warehouse_code: lvl.warehouseCode || whCodeMap.get(lvl.warehouseId) || defaultWhCode,
              stock_on_hand: lvl.onHand,
              low_stock_threshold: lvl.lowStockThreshold,
              reason: 'خروجی موجودی انبار',
            });
          }
        } else {
          rows.push({
            sku: v.sku,
            warehouse_code: defaultWhCode,
            stock_on_hand: v.stockOnHand,
            low_stock_threshold: v.lowStockThreshold,
            reason: 'خروجی موجودی انبار',
          });
        }
      }
    }
    return rows;
  },
};
