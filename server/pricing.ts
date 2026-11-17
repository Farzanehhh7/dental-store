import { getVariantAvailableStock, resolveVariantPrice } from '../src/lib/pricing';
import { CustomerGroupCode, OrderItem } from '../src/types/domain';
import { ServerCatalogSnapshot } from './persistence';

export const SHIPPING_FEES: Record<string, number> = {
  courier_tehran: 120000,
  tehran_courier: 120000,
  tipax: 185000,
  post_pishtaz: 145000,
  heavy_freight: 0,
  express_post: 250000,
};

export interface CartCalculationInputItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export type AuthoritativeCalculationResult =
  | {
      ok: true;
      items: OrderItem[];
      subtotal: number;
      couponDiscount: number;
      discountTotal: number;
      shippingTotal: number;
      taxTotal: number;
      grandTotal: number;
      shippingMethod: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export function calculateAuthoritativeCheckout(
  catalog: ServerCatalogSnapshot,
  params: {
    items: CartCalculationInputItem[];
    customerGroup?: CustomerGroupCode;
    userId?: string;
    couponCode?: string;
    shippingMethod?: string;
  }
): AuthoritativeCalculationResult {
  const { items, customerGroup = 'retail', userId, couponCode = '', shippingMethod = 'courier_tehran' } = params;

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, message: 'سبد خرید خالی است.' };
  }

  const normalizedShipping = String(shippingMethod || 'courier_tehran').trim();
  if (!(normalizedShipping in SHIPPING_FEES)) {
    return { ok: false, status: 400, message: 'روش ارسال انتخاب‌شده نامعتبر است.' };
  }

  const pricedItems: OrderItem[] = [];
  for (const raw of items) {
    const qty = Number(raw?.quantity);
    if (!raw?.productId || !raw?.variantId || !Number.isInteger(qty) || qty <= 0) {
      return { ok: false, status: 400, message: 'اقلام یا تعداد انتخاب‌شده در سبد خرید نامعتبر است.' };
    }
    const product = catalog.products.find((p) => p.id === raw.productId);
    const variant = product?.variants.find((v) => v.id === raw.variantId && v.isActive);
    if (!product || !variant) {
      return { ok: false, status: 400, message: 'یکی از کالاها یا تنوع‌های سبد در کاتالوگ یافت نشد.' };
    }
    if (product.status !== 'active') {
      return { ok: false, status: 400, message: `کالای «${product.titleFa}» در حال حاضر قابل سفارش نیست.` };
    }
    if (product.pricingMode === 'call_for_price') {
      return {
        ok: false,
        status: 400,
        message: `کالای «${product.titleFa}» نیاز به استعلام قیمت (RFQ) یا ثبت پیش‌فاکتور دارد و خرید آنلاین مستقیم ندارد.`,
      };
    }
    const availableStock = getVariantAvailableStock(variant);
    if (qty > availableStock) {
      return {
        ok: false,
        status: 400,
        message: `موجودی انبار برای «${product.titleFa} (${variant.labelFa})» کافی نیست (موجود: ${availableStock}).`,
      };
    }
    if (qty < (product.minOrderQty || 1)) {
      return {
        ok: false,
        status: 400,
        message: `حداقل تعداد سفارش برای «${product.titleFa}» برابر ${product.minOrderQty} عدد است.`,
      };
    }

    const resolved = resolveVariantPrice(product, variant, {
      customerGroup,
      quantity: qty,
      campaigns: catalog.campaigns,
      settings: catalog.settings,
      contractPrices: catalog.contractPrices,
      userId,
    });
    if (resolved.state !== 'fixed' || resolved.unitPrice === null || resolved.unitPrice <= 0) {
      return {
        ok: false,
        status: 400,
        message: `قیمت معتبر برای «${product.titleFa}» در دسترس نیست.`,
      };
    }

    const base = variant.basePrice ?? resolved.unitPrice;
    const discountAmount = Math.max(0, (base - resolved.unitPrice) * qty);
    pricedItems.push({
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
      titleFa: product.titleFa,
      variantLabelFa: variant.labelFa,
      quantity: qty,
      unitPrice: resolved.unitPrice,
      discountAmount,
      lineTotal: resolved.unitPrice * qty,
      priceSource: resolved.priceSource,
      batchNo: resolved.nearestBatchNo ?? undefined,
    });
  }

  const subtotal = pricedItems.reduce((s, i) => s + i.lineTotal, 0);
  const cleanCode = String(couponCode || '').trim().toUpperCase();
  const now = Date.now();
  const coupon = cleanCode
    ? catalog.coupons.find(
        (c) =>
          c.isActive &&
          c.code.toUpperCase() === cleanCode &&
          subtotal >= c.minOrderAmount &&
          new Date(c.startsAt).getTime() <= now &&
          new Date(c.endsAt).getTime() > now &&
          c.usageCount < c.usageLimit
      )
    : undefined;

  let couponDiscount = 0;
  if (coupon) {
    if (coupon.type === 'percent') {
      couponDiscount = Math.round((subtotal * coupon.value) / 100);
      if (coupon.maxDiscountAmount) {
        couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
      }
    } else if (coupon.type === 'fixed') {
      couponDiscount = Math.min(coupon.value, subtotal);
    }
  }

  const baseShipping = SHIPPING_FEES[normalizedShipping];
  const afterDiscount = Math.max(0, subtotal - couponDiscount);
  const shippingTotal =
    afterDiscount >= catalog.settings.freeShippingThreshold || coupon?.type === 'free_shipping'
      ? 0
      : baseShipping;
  const taxTotal = Math.round((afterDiscount * catalog.settings.taxRatePercent) / 100);
  const grandTotal = afterDiscount + shippingTotal + taxTotal;
  const itemDiscountTotal = pricedItems.reduce((s, i) => s + i.discountAmount, 0);

  return {
    ok: true,
    items: pricedItems,
    subtotal,
    couponDiscount,
    discountTotal: itemDiscountTotal + couponDiscount,
    shippingTotal,
    taxTotal,
    grandTotal,
    shippingMethod: normalizedShipping,
  };
}
