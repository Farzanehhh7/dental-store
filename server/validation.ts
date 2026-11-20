import type express from 'express';
import { z } from 'zod';

export const otpSendBodySchema = z.object({
  mobile: z.string().trim().min(1, 'شماره موبایل الزامی است.').max(30),
});

export const otpVerifyBodySchema = z.object({
  mobile: z.string().trim().min(1, 'شماره موبایل الزامی است.').max(30),
  code: z.string().trim().min(4, 'کد تایید نامعتبر است.').max(12),
  displayName: z.string().trim().max(80).optional(),
});

export const checkoutItemSchema = z.object({
  productId: z.string().trim().min(1, 'شناسه محصول الزامی است.').max(128),
  variantId: z.string().trim().min(1, 'شناسه تنوع الزامی است.').max(128),
  quantity: z.number().int('تعداد باید عدد صحیح باشد.').min(1, 'تعداد باید حداقل ۱ باشد.').max(100000),
});

export const checkoutCalculateBodySchema = z.object({
  items: z.array(checkoutItemSchema).min(1, 'سبد خرید خالی است.').max(100),
  customerGroup: z
    .enum(['retail', 'dentist', 'clinic', 'lab', 'student', 'agent', 'wholesale'])
    .optional()
    .default('retail'),
  couponCode: z.string().trim().max(40).optional().default(''),
  shippingMethod: z.string().trim().min(1).max(60).optional().default('courier_tehran'),
  userId: z.string().trim().max(128).optional(),
});

export const clientSubmittedTotalsSchema = {
  subtotal: z.number().optional(),
  discountTotal: z.number().optional(),
  shippingTotal: z.number().optional(),
  taxTotal: z.number().optional(),
  grandTotal: z.number().optional(),
};

export const checkoutItemWithOptionalClientPriceSchema = checkoutItemSchema.extend({
  unitPrice: z.number().optional(),
  lineTotal: z.number().optional(),
});

export const shippingAddressBodySchema = z.object({
  province: z.string().trim().max(60).optional().default('تهران'),
  city: z.string().trim().min(1, 'شهر و نشانی کامل تحویل الزامی است.').max(60),
  postalCode: z.string().trim().max(20).optional().default(''),
  addressLine: z.string().trim().min(1, 'شهر و نشانی کامل تحویل الزامی است.').max(400),
});

export const guestOrderBodySchema = z.object({
  customerName: z.string().trim().min(1, 'نام مشتری برای ثبت سفارش الزامی است.').max(120),
  customerMobile: z.string().trim().min(1, 'شماره موبایل الزامی است.').max(30),
  items: z.array(checkoutItemWithOptionalClientPriceSchema).min(1, 'سبد خرید خالی است.').max(100),
  shippingMethod: z.string().trim().min(1).max(60).optional().default('courier_tehran'),
  paymentMethod: z
    .enum([
      'online',
      'cash_on_delivery',
      'bank_transfer',
      'credit_request',
      'cheque_request',
      'installment_request',
    ])
    .optional()
    .default('online'),
  couponCode: z.string().trim().max(40).optional().default(''),
  shippingAddress: shippingAddressBodySchema,
  verifiedToken: z.string().trim().max(200).optional(),
  customerNote: z.string().trim().max(400).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  ...clientSubmittedTotalsSchema,
});

export const authenticatedOrderBodySchema = guestOrderBodySchema.extend({
  customerGroup: z
    .enum(['retail', 'dentist', 'clinic', 'lab', 'student', 'agent', 'wholesale'])
    .optional(),
  installmentsCount: z.number().int().min(1).max(36).optional(),
  proposedTermsFa: z.string().trim().max(400).optional(),
});

export const manualOrderBodySchema = z.object({
  customerName: z.string().trim().min(1, 'نام مشتری الزامی است.').max(120),
  customerMobile: z.string().trim().min(1, 'شماره موبایل الزامی است.').max(30),
  customerGroup: z
    .enum(['retail', 'dentist', 'clinic', 'lab', 'student', 'agent', 'wholesale'])
    .optional()
    .default('clinic'),
  paymentMethod: z
    .enum([
      'online',
      'cash_on_delivery',
      'bank_transfer',
      'credit_request',
      'cheque_request',
      'installment_request',
    ])
    .optional()
    .default('bank_transfer'),
  shippingMethod: z.string().trim().min(1).max(60).optional().default('courier_tehran'),
  couponCode: z.string().trim().max(40).optional().default(''),
  shippingAddress: shippingAddressBodySchema,
  items: z.array(checkoutItemWithOptionalClientPriceSchema).min(1).max(100),
  customerNote: z.string().trim().max(400).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  ...clientSubmittedTotalsSchema,
});

export const adminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().trim().max(40).optional(),
  source: z.enum(['google', 'otp', 'guest', 'admin_manual', 'proforma']).optional(),
  q: z.string().trim().max(120).optional(),
  fromDate: z.string().trim().max(40).optional(),
  toDate: z.string().trim().max(40).optional(),
});

export const adminOrderStatusBodySchema = z.object({
  status: z.enum([
    'pending_payment',
    'awaiting_review',
    'payment_failed',
    'paid',
    'processing',
    'packed',
    'shipped',
    'delivered',
    'completed',
    'cancelled',
    'expired',
    'refunded',
    'return_requested',
    'returned',
  ]),
  trackingCode: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const cancelOrderBodySchema = z.object({
  orderToken: z.string().trim().max(300).optional(),
  mobile: z.string().trim().max(30).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const proformaCreateBodySchema = z.object({
  contactName: z.string().trim().min(1, 'نام مخاطب الزامی است.').max(120),
  contactMobile: z.string().trim().min(1, 'شماره موبایل معتبر برای صدور پیش‌فاکتور الزامی است.').max(30),
  clinicName: z.string().trim().max(160).optional(),
  termsFa: z.string().trim().max(500).optional(),
  items: z.array(checkoutItemWithOptionalClientPriceSchema).min(1, 'حداقل یک کالا لازم است.').max(100),
  customerGroup: z
    .enum(['retail', 'dentist', 'clinic', 'lab', 'student', 'agent', 'wholesale'])
    .optional(),
  ...clientSubmittedTotalsSchema,
});

export const mobileOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().max(40).optional(),
});

export const paymentInitiateBodySchema = z.object({
  orderId: z.string().trim().min(1, 'شناسه سفارش برای شروع پرداخت الزامی است.').max(128),
  orderNo: z.string().trim().max(60).optional(),
  gateway: z.enum(['zarinpal', 'idpay']).optional().default('zarinpal'),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  orderToken: z.string().trim().max(300).optional(),
});

export const paymentVerifyBodySchema = z.object({
  authority: z.string().trim().min(1, 'شناسه مرجع تراکنش الزامی است.').max(160),
  status: z.string().trim().min(1).max(32).optional().default('OK'),
  sandboxToken: z.string().trim().max(200).optional(),
  amount: z.number().optional(),
});

export const rfqListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(['submitted', 'in_review', 'quoted', 'accepted', 'rejected', 'converted'])
    .optional(),
});

export const rfqCreateBodySchema = z.object({
  productId: z.string().trim().min(1, 'شناسه محصول الزامی است.').max(128),
  variantId: z.string().trim().max(128).optional().default(''),
  quantity: z.number().int('تعداد درخواستی معتبر نیست.').min(1, 'تعداد درخواستی معتبر نیست.').max(100000),
  customerName: z.string().trim().max(120).optional().default(''),
  customerMobile: z.string().trim().max(30).optional().default(''),
  clinicName: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional().default(''),
  targetUnitPrice: z
    .union([z.number().positive(), z.literal('')])
    .optional()
    .transform((val) => (typeof val === 'number' ? val : undefined)),
});

export const rfqMessageBodySchema = z.object({
  body: z.string().trim().min(1, 'متن پیام نمی‌تواند خالی باشد.').max(1000),
  proposedUnitPrice: z.number().positive().optional(),
});

export const rfqQuoteBodySchema = z.object({
  quotedUnitPrice: z.number().positive('قیمت پیشنهادی واحد باید بزرگ‌تر از صفر باشد.'),
  validDays: z.number().int().min(1).max(90).optional().default(7),
  note: z.string().trim().max(500).optional().default(''),
});

export const rfqRespondBodySchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
});

export const rfqConvertBodySchema = z.object({}).default({});

const recordArraySchema = z.array(z.record(z.string(), z.unknown()));

export const seoSyncBodySchema = z.object({
  categories: recordArraySchema.optional(),
  brands: recordArraySchema.optional(),
  products: recordArraySchema.optional(),
  campaigns: recordArraySchema.optional(),
  bundles: recordArraySchema.optional(),
  agents: recordArraySchema.optional(),
  blogPosts: recordArraySchema.optional(),
  redirects: recordArraySchema.optional(),
  coupons: recordArraySchema.optional(),
  contractPrices: recordArraySchema.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// --- Phase 3: Per-Warehouse Inventory, Transfers & RMA Schemas ---
export const inventoryQuerySchema = z.object({
  warehouseId: z.string().trim().max(128).optional(),
  lowStockOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const inventoryAdjustBodySchema = z.object({
  productId: z.string().trim().min(1, 'شناسه محصول الزامی است.').max(128),
  variantId: z.string().trim().min(1, 'شناسه تنوع الزامی است.').max(128),
  warehouseId: z.string().trim().max(128).optional(),
  warehouseCode: z.string().trim().max(40).optional(),
  delta: z.number().int('تغییر موجودی باید عدد صحیح باشد.').refine((v) => v !== 0, 'مقدار تغییر نمی‌تواند صفر باشد.'),
  type: z.enum(['receive', 'adjust']).optional().default('adjust'),
  reason: z.string().trim().min(2, 'ذکر علت تعدیل موجودی الزامی است.').max(400),
  batchNo: z.string().trim().max(80).optional(),
  expiryDate: z.string().trim().max(60).optional(),
  unitCost: z.number().nonnegative().optional(),
  specialPrice: z.number().nonnegative().nullable().optional(),
});

export const inventoryStocktakeBodySchema = z.object({
  productId: z.string().trim().min(1, 'شناسه محصول الزامی است.').max(128),
  variantId: z.string().trim().min(1, 'شناسه تنوع الزامی است.').max(128),
  warehouseId: z.string().trim().max(128).optional(),
  warehouseCode: z.string().trim().max(40).optional(),
  onHand: z.number().int('تعداد شمارش باید عدد صحیح باشد.').min(0, 'موجودی شمارش نمی‌تواند منفی باشد.'),
  reason: z.string().trim().min(2, 'ذکر علت انبارگردانی الزامی است.').max(400),
});

export const inventoryTransferBodySchema = z.object({
  productId: z.string().trim().min(1, 'شناسه محصول الزامی است.').max(128),
  variantId: z.string().trim().min(1, 'شناسه تنوع الزامی است.').max(128),
  fromWarehouseId: z.string().trim().min(1, 'انبار مبدا الزامی است.').max(128),
  toWarehouseId: z.string().trim().min(1, 'انبار مقصد الزامی است.').max(128),
  quantity: z.number().int('تعداد انتقال باید عدد صحیح باشد.').min(1, 'حداقل تعداد انتقال ۱ است.').max(100000),
  reason: z.string().trim().min(2, 'ذکر علت انتقال الزامی است.').max(400),
  batchNo: z.string().trim().max(80).optional(),
});

export const batchSpecialPriceBodySchema = z.object({
  productId: z.string().trim().min(1).max(128),
  variantId: z.string().trim().min(1).max(128),
  batchId: z.string().trim().min(1).max(128),
  specialPrice: z.number().nonnegative().nullable(),
});

export const warehouseUpsertBodySchema = z.object({
  id: z.string().trim().max(128).optional(),
  code: z.string().trim().min(1, 'کد انبار الزامی است.').max(40),
  nameFa: z.string().trim().min(1, 'نام فارسی انبار الزامی است.').max(120),
  city: z.string().trim().min(1, 'شهر انبار الزامی است.').max(80),
  address: z.string().trim().max(300).optional().default(''),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const returnItemBodySchema = z.object({
  productId: z.string().trim().min(1).max(128),
  variantId: z.string().trim().min(1).max(128),
  titleFa: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(10000),
  batchNo: z.string().trim().max(80).optional(),
  condition: z.enum(['resellable', 'damaged']).optional(),
});

export const returnCreateBodySchema = z.object({
  orderId: z.string().trim().min(1, 'شناسه سفارش الزامی است.').max(128),
  items: z.array(returnItemBodySchema).min(1, 'حداقل یک قلم برای مرجوعی انتخاب کنید.').max(100),
  reasonFa: z.string().trim().min(3, 'توضیح دلیل مرجوعی الزامی است.').max(500),
  resolution: z.enum(['refund', 'replacement', 'credit']).optional().default('refund'),
  refundAmount: z.number().nonnegative().optional(),
  orderToken: z.string().trim().max(300).optional(),
});

export const returnProcessBodySchema = z.object({
  status: z.enum(['requested', 'approved', 'received', 'refunded', 'rejected']),
  condition: z.enum(['resellable', 'damaged']).optional(),
  warehouseId: z.string().trim().max(128).optional(),
  batchNo: z.string().trim().max(80).optional(),
  expiryDate: z.string().trim().max(60).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

export function parseRequestBody<T extends z.ZodTypeAny>(
  schema: T,
  req: express.Request,
  res: express.Response
): z.infer<T> | null {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    res.status(400).json({
      ok: false,
      message: firstIssue?.message || 'داده‌های ارسالی نامعتبر است.',
    });
    return null;
  }
  return result.data;
}

export function parseRequestQuery<T extends z.ZodTypeAny>(
  schema: T,
  req: express.Request,
  res: express.Response
): z.infer<T> | null {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    res.status(400).json({
      ok: false,
      message: firstIssue?.message || 'پارامترهای درخواست نامعتبر است.',
    });
    return null;
  }
  return result.data;
}
