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

export const guestOrderBodySchema = z.object({
  customerName: z.string().trim().min(1, 'نام مشتری برای ثبت سفارش الزامی است.').max(120),
  customerMobile: z.string().trim().min(1, 'شماره موبایل الزامی است.').max(30),
  items: z.array(checkoutItemSchema).min(1, 'سبد خرید خالی است.').max(100),
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
  shippingAddress: z.object({
    province: z.string().trim().max(60).optional().default('تهران'),
    city: z.string().trim().min(1, 'شهر و نشانی کامل تحویل الزامی است.').max(60),
    postalCode: z.string().trim().max(20).optional().default(''),
    addressLine: z.string().trim().min(1, 'شهر و نشانی کامل تحویل الزامی است.').max(400),
  }),
  verifiedToken: z.string().trim().max(200).optional(),
  customerNote: z.string().trim().max(400).optional(),
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
});

export const paymentVerifyBodySchema = z.object({
  authority: z.string().trim().min(1, 'شناسه مرجع تراکنش الزامی است.').max(160),
  status: z.string().trim().min(1).max(32).optional().default('OK'),
  sandboxToken: z.string().trim().max(200).optional(),
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
