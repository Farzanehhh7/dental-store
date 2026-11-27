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

// --- Strict /api/seo/sync Catalog Schemas (Phase 4: No arbitrary z.record objects) ---
const stockBatchSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    batchNo: z.string().trim().min(1).max(80),
    warehouseId: z.string().trim().max(128).optional(),
    warehouseCode: z.string().trim().min(1).max(40),
    producedAt: z.string().trim().max(40).optional(),
    expiresAt: z.string().trim().min(1).max(40),
    expiryDate: z.string().trim().max(40).optional(),
    qtyOnHand: z.number().finite().min(0),
    qty: z.number().finite().min(0).optional(),
    reserved: z.number().finite().min(0).optional(),
    unitCost: z.number().finite().min(0).optional(),
    specialPrice: z.number().finite().min(0).nullable().optional(),
    condition: z.enum(['resellable', 'damaged']).optional(),
  })
  .strict();

const stockLevelSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    productId: z.string().trim().min(1).max(128),
    variantId: z.string().trim().min(1).max(128),
    sku: z.string().trim().max(64).optional(),
    warehouseId: z.string().trim().min(1).max(128),
    warehouseCode: z.string().trim().max(40).optional(),
    onHand: z.number().finite().min(0),
    reserved: z.number().finite().min(0),
    lowStockThreshold: z.number().finite().min(0),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

const tierPriceSyncSchema = z
  .object({
    minQty: z.number().int().min(1),
    unitPrice: z.number().finite().min(0),
  })
  .strict();

const groupPricesSyncSchema = z
  .object({
    retail: z.number().finite().min(0).optional(),
    dentist: z.number().finite().min(0).optional(),
    clinic: z.number().finite().min(0).optional(),
    lab: z.number().finite().min(0).optional(),
    student: z.number().finite().min(0).optional(),
    agent: z.number().finite().min(0).optional(),
    wholesale: z.number().finite().min(0).optional(),
  })
  .strict();

const productVariantSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    sku: z.string().trim().min(1).max(64),
    barcode: z.string().trim().max(64).optional(),
    labelFa: z.string().trim().min(1).max(120),
    optionType: z.enum(['shade', 'size', 'pack', 'model', 'unit']),
    optionValueFa: z.string().trim().min(1).max(120),
    colorHex: z.string().trim().max(20).optional(),
    basePrice: z.number().finite().min(0).nullable(),
    costPrice: z.number().finite().min(0).optional(),
    groupPrices: groupPricesSyncSchema.optional(),
    tierPrices: z.array(tierPriceSyncSchema).max(30).optional(),
    stockOnHand: z.number().finite().min(0),
    reserved: z.number().finite().min(0),
    lowStockThreshold: z.number().finite().min(0),
    weightG: z.number().finite().min(0),
    isDefault: z.boolean().optional(),
    isActive: z.boolean(),
    batches: z.array(stockBatchSyncSchema).max(50).optional(),
    stockLevels: z.array(stockLevelSyncSchema).max(50).optional(),
  })
  .strict();

const productFileSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    type: z.enum(['catalog', 'manual', 'certificate_ce', 'certificate_iso', 'certificate_fda', 'ministry_license']),
    titleFa: z.string().trim().min(1).max(180),
    fileSizeLabel: z.string().trim().max(40),
    code: z.string().trim().max(80).optional(),
    fileUrl: z.string().trim().max(500).optional(),
    isVerified: z.boolean().optional(),
    issuer: z.string().trim().max(160).optional(),
    verifiedUntil: z.string().trim().max(40).optional(),
  })
  .strict();

const priceHistorySyncSchema = z
  .object({
    variantId: z.string().trim().min(1).max(128),
    variantLabel: z.string().trim().max(120),
    oldPrice: z.number().finite().min(0),
    newPrice: z.number().finite().min(0),
    changedAt: z.string().trim().max(40),
    source: z.enum(['admin', 'import', 'campaign']),
  })
  .strict();

const faqPairSyncSchema = z
  .object({
    q: z.string().trim().min(1).max(300),
    a: z.string().trim().min(1).max(2000),
  })
  .strict();

export const categorySyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    parentId: z.string().trim().max(128).nullable(),
    path: z.string().trim().max(256),
    depth: z.number().int().min(0).max(20),
    vertical: z.enum(['dental', 'medical', 'lab']),
    nameFa: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().max(120),
    slug: z.string().trim().min(1).max(140),
    descriptionFa: z.string().trim().max(1000),
    seoTextFa: z.string().trim().max(4000),
    metaTitle: z.string().trim().max(200).optional(),
    metaDescription: z.string().trim().max(400).optional(),
    isActive: z.boolean(),
    showInMenu: z.boolean(),
    showOnHome: z.boolean(),
    sortOrder: z.number().finite(),
    attributeIds: z.array(z.string().trim().max(128)).max(100),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const brandSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    nameFa: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(140),
    countryCode: z.string().trim().min(1).max(8),
    countryFa: z.string().trim().max(60),
    descriptionFa: z.string().trim().max(2000),
    websiteUrl: z.string().trim().max(300).optional(),
    isAuthorizedDealer: z.boolean(),
    warrantyProvider: z.string().trim().max(160).optional(),
    isActive: z.boolean(),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const productSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    vertical: z.enum(['dental', 'medical', 'lab']),
    sku: z.string().trim().min(1).max(64),
    imedCode: z.string().trim().max(64).optional(),
    gtin: z.string().trim().max(64).optional(),
    titleFa: z.string().trim().min(1).max(200),
    titleEn: z.string().trim().max(200),
    slug: z.string().trim().min(1).max(160),
    brandId: z.string().trim().min(1).max(128),
    originCountryCode: z.string().trim().max(8),
    originCountryFa: z.string().trim().max(60),
    primaryCategoryId: z.string().trim().min(1).max(128),
    categoryIds: z.array(z.string().trim().max(128)).max(50),
    kind: z.enum(['consumable', 'capital_equipment']),
    status: z.enum(['draft', 'active', 'out_of_stock', 'coming_soon', 'archived']),
    pricingMode: z.enum(['fixed', 'range', 'call_for_price']),
    shortDescriptionFa: z.string().trim().max(1000),
    descriptionFa: z.string().trim().max(10000),
    imageUrl: z.string().trim().max(2000),
    galleryUrls: z.array(z.string().trim().max(2000)).max(20),
    videoUrl: z.string().trim().max(500).optional(),
    warrantyMonths: z.number().finite().min(0).optional(),
    warrantyProvider: z.string().trim().max(160).optional(),
    installationAvailable: z.boolean(),
    installationFee: z.number().finite().min(0).optional(),
    trainingAvailable: z.boolean(),
    requiresLicense: z.boolean().optional(),
    minOrderQty: z.number().int().min(1),
    ratingAvg: z.number().finite().min(0).max(5),
    ratingCount: z.number().int().min(0),
    viewCount: z.number().int().min(0),
    soldCount: z.number().int().min(0),
    tags: z.array(z.string().trim().max(80)).max(50),
    attributes: z.record(
      z.string().trim().max(64),
      z.union([z.string().max(300), z.number().finite(), z.boolean(), z.array(z.string().max(120)).max(30)])
    ),
    variants: z.array(productVariantSyncSchema).min(1).max(50),
    files: z.array(productFileSyncSchema).max(20).optional(),
    relatedIds: z.array(z.string().trim().max(128)).max(30).optional(),
    alternativeIds: z.array(z.string().trim().max(128)).max(30).optional(),
    complementaryIds: z.array(z.string().trim().max(128)).max(30).optional(),
    priceHistory: z.array(priceHistorySyncSchema).max(100).optional(),
    faqs: z.array(faqPairSyncSchema).max(30).optional(),
    metaTitle: z.string().trim().max(200).optional(),
    metaDescription: z.string().trim().max(400).optional(),
    publishedAt: z.string().trim().max(40),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const campaignSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    nameFa: z.string().trim().min(1).max(160),
    slug: z.string().trim().min(1).max(140),
    type: z.enum(['percent', 'fixed']),
    discountPercent: z.number().finite().min(0).max(100),
    startsAt: z.string().trim().max(40),
    endsAt: z.string().trim().max(40),
    showTimer: z.boolean(),
    badgeTextFa: z.string().trim().max(80),
    status: z.enum(['draft', 'scheduled', 'active', 'ended', 'cancelled']),
    productIds: z.array(z.string().trim().max(128)).max(500),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const bundleSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    nameFa: z.string().trim().min(1).max(160),
    slug: z.string().trim().min(1).max(140),
    kind: z.enum(['starter_pack', 'economy_pack', 'promo']),
    descriptionFa: z.string().trim().max(2000),
    imageUrl: z.string().trim().max(2000),
    discountPercent: z.number().finite().min(0).max(100),
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(128),
            variantId: z.string().trim().min(1).max(128),
            quantity: z.number().int().min(1).max(1000),
          })
          .strict()
      )
      .max(100),
    status: z.enum(['active', 'draft']),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const agentSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    nameFa: z.string().trim().min(1).max(160),
    type: z.enum(['agent', 'branch', 'partner']),
    province: z.string().trim().max(60),
    provinceSlug: z.string().trim().max(60),
    city: z.string().trim().max(60),
    address: z.string().trim().max(400),
    phone: z.string().trim().max(40),
    mobile: z.string().trim().max(30),
    workingHoursFa: z.string().trim().max(120),
    brandIds: z.array(z.string().trim().max(128)).max(100),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    isActive: z.boolean(),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const blogPostSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    titleFa: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(160),
    categoryFa: z.string().trim().max(80),
    categorySlug: z.string().trim().max(80).optional(),
    excerptFa: z.string().trim().max(600),
    bodyFa: z.string().trim().max(30000),
    imageUrl: z.string().trim().max(2000),
    authorName: z.string().trim().max(120),
    authorRole: z.string().trim().max(120),
    reviewedBy: z.string().trim().max(120).optional(),
    readingMinutes: z.number().int().min(1).max(240),
    productIds: z.array(z.string().trim().max(128)).max(50),
    faq: z.array(faqPairSyncSchema).max(30).optional(),
    metaTitle: z.string().trim().max(200).optional(),
    metaDescription: z.string().trim().max(400).optional(),
    status: z.enum(['draft', 'published']),
    publishedAt: z.string().trim().max(40),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const redirectSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    fromPath: z.string().trim().min(1).max(240).startsWith('/'),
    toPath: z.string().trim().max(240),
    statusCode: z.union([z.literal(301), z.literal(302), z.literal(410)]),
    hitCount: z.number().int().min(0),
    createdAt: z.string().trim().max(40),
  })
  .strict();

export const couponSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    code: z.string().trim().min(1).max(40),
    type: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().finite().min(0),
    minOrderAmount: z.number().finite().min(0),
    maxDiscountAmount: z.number().finite().min(0).optional(),
    startsAt: z.string().trim().max(40),
    endsAt: z.string().trim().max(40),
    usageCount: z.number().int().min(0),
    usageLimit: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .strict();

export const contractPriceSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    userId: z.string().trim().min(1).max(128),
    customerName: z.string().trim().min(1).max(120),
    productId: z.string().trim().min(1).max(128),
    productTitleFa: z.string().trim().max(200),
    variantId: z.string().trim().min(1).max(128),
    unitPrice: z.number().finite().min(0),
    validUntil: z.string().trim().max(40),
    isActive: z.boolean(),
  })
  .strict();

export const settingsSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    storeNameFa: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(40),
    addressFa: z.string().trim().max(400),
    workingHoursFa: z.string().trim().max(120),
    imedRegistryCode: z.string().trim().max(80),
    enamadCode: z.string().trim().max(80),
    taxRatePercent: z.number().finite().min(0).max(100),
    freeShippingThreshold: z.number().finite().min(0),
    nearExpiryThresholdDays: z.number().int().min(1).max(3650),
    discountProofMinDays: z.number().int().min(1).max(365),
    indexableFacetThreshold: z.number().int().min(0).max(1000),
    discontinuedGraceDays: z.number().int().min(0).max(3650),
  })
  .strict();

export const pageSyncSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    slug: z.string().trim().min(1).max(160),
    titleFa: z.string().trim().min(1).max(200),
    bodyFa: z.string().trim().max(30000),
    metaTitle: z.string().trim().max(200).optional(),
    metaDescription: z.string().trim().max(400).optional(),
    status: z.enum(['published', 'draft']),
    updatedAt: z.string().trim().max(40),
  })
  .strict();

export const seoSyncBodySchema = z
  .object({
    categories: z.array(categorySyncSchema).max(500).optional(),
    brands: z.array(brandSyncSchema).max(500).optional(),
    products: z.array(productSyncSchema).max(500).optional(),
    campaigns: z.array(campaignSyncSchema).max(200).optional(),
    bundles: z.array(bundleSyncSchema).max(200).optional(),
    agents: z.array(agentSyncSchema).max(300).optional(),
    blogPosts: z.array(blogPostSyncSchema).max(300).optional(),
    pages: z.array(pageSyncSchema).max(300).optional(),
    redirects: z.array(redirectSyncSchema).max(1000).optional(),
    coupons: z.array(couponSyncSchema).max(500).optional(),
    contractPrices: z.array(contractPriceSyncSchema).max(1000).optional(),
    settings: settingsSyncSchema.optional(),
  })
  .strict();

export const telemetry404BodySchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1, 'مسیر ۴۰۴ الزامی است.')
      .max(240, 'طول مسیر بیش از حد مجاز است.'),
    referrer: z.string().trim().max(400).optional(),
  })
  .strict();

export const newsletterSubscribeBodySchema = z
  .object({
    contact: z
      .string()
      .trim()
      .min(4, 'ایمیل یا شماره موبایل معتبر وارد کنید.')
      .max(160),
  })
  .strict();

export const stockNotificationBodySchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    variantId: z.string().trim().max(128).optional(),
    productTitleFa: z.string().trim().min(1).max(200),
    mobile: z.string().trim().min(8).max(30),
  })
  .strict();

export const fileUploadJsonBodySchema = z
  .object({
    filename: z.string().trim().min(1, 'نام فایل الزامی است.').max(180),
    dataBase64: z.string().trim().min(4, 'محتوای فایل نامعتبر است.').max(10_000_000),
    purpose: z.enum(['b2b_doc', 'catalog_asset', 'banner', 'certificate']).optional().default('catalog_asset'),
  })
  .strict();

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

export const adminReportQuerySchema = z.object({
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  status: z.string().trim().max(64).optional(),
  brandId: z.string().trim().max(128).optional(),
  categoryId: z.string().trim().max(128).optional(),
  warehouseId: z.string().trim().max(128).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(25),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export const importTemplateKeySchema = z.enum([
  'products',
  'variants',
  'prices',
  'stock',
  'categories',
  'brands',
  'redirects',
]);

export const importParseBodySchema = z.object({
  filename: z.string().trim().min(1, 'نام فایل الزامی است').max(200),
  contentBase64: z.string().min(1, 'محتوای فایل الزامی است').max(8 * 1024 * 1024),
  mimeType: z.string().trim().max(120).optional().default(''),
});

export const importRawRowRecordSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const importValidateBodySchema = z.object({
  templateKey: importTemplateKeySchema,
  rows: z.array(importRawRowRecordSchema).max(5000, 'حداکثر ۵۰۰۰ ردیف در هر بار ورود داده مجاز است.'),
});

export const importCommitBodySchema = z.object({
  templateKey: importTemplateKeySchema,
  filename: z.string().trim().max(200).optional().default('manual-import.csv'),
  rows: z
    .array(importRawRowRecordSchema)
    .min(1, 'حداقل یک ردیف برای ثبت الزامی است.')
    .max(5000, 'حداکثر ۵۰۰۰ ردیف در هر بار ورود داده مجاز است.'),
});

// --- Phase 9: Marketing Automation, Consent, Outbox & Abandoned Cart Schemas ---
export const cartSyncBodySchema = z
  .object({
    items: z.array(checkoutItemSchema).max(100),
    consentGranted: z.boolean().optional().default(false),
    customerName: z.string().trim().max(120).optional(),
    email: z.string().trim().max(160).optional(),
    mobile: z.string().trim().max(30).optional(),
  })
  .strict();

export const marketingConsentPutBodySchema = z
  .object({
    marketingOptIn: z.boolean().optional(),
    smsOptIn: z.boolean().optional(),
    emailOptIn: z.boolean().optional(),
    abandonedCartConsent: z.boolean().optional(),
    mobile: z.string().trim().max(30).optional(),
    email: z.string().trim().max(160).optional(),
    displayName: z.string().trim().max(120).optional(),
  })
  .strict();

export const marketingUnsubscribeBodySchema = z
  .object({
    token: z.string().trim().min(8, 'توکن لغو اشتراک الزامی است.').max(600),
  })
  .strict();

export const inboundSmsWebhookBodySchema = z.object({
  from: z.string().trim().min(4, 'شماره فرستنده الزامی است.').max(30),
  text: z.string().trim().min(1, 'متن پیام الزامی است.').max(500),
  providerMessageId: z.string().trim().max(120).optional(),
});

export const adminCampaignSendBodySchema = z
  .object({
    title: z.string().trim().min(2, 'عنوان کمپین الزامی است.').max(160),
    channel: z.enum(['sms', 'email']).optional().default('sms'),
    segment: z.enum([
      'newsletter_subscribers',
      'approved_b2b',
      'all_customers',
      'abandoned_cart_users',
      'custom_contacts',
    ]),
    message: z.string().trim().min(3, 'متن پیام کمپین نمی‌تواند خالی باشد.').max(1000),
    subject: z.string().trim().max(200).optional(),
    customContacts: z.array(z.string().trim().min(4).max(160)).max(1000).optional(),
    respectQuietHours: z.boolean().optional().default(true),
    nowIso: z.string().trim().max(40).optional(),
  })
  .strict();

export const adminOutboxQuerySchema = z.object({
  status: z
    .enum(['queued', 'scheduled_quiet_hours', 'sent', 'delivered', 'failed', 'suppressed', 'rate_limited'])
    .optional(),
  channel: z.enum(['sms', 'email']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

export const adminOutboxStatusBodySchema = z
  .object({
    status: z.enum(['sent', 'delivered', 'failed']),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const adminOutboxFlushBodySchema = z
  .object({
    nowIso: z.string().trim().max(40).optional(),
  })
  .default({});

export const adminSuppressionAddBodySchema = z
  .object({
    contact: z.string().trim().min(4, 'ایمیل یا شماره موبایل معتبر وارد کنید.').max(160),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const adminAbandonedCartsQuerySchema = z.object({
  status: z.enum(['active', 'abandoned', 'reminded', 'recovered', 'opted_out']).optional(),
  thresholdMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  nowIso: z.string().trim().max(40).optional(),
});

export const adminAbandonedReminderBodySchema = z
  .object({
    channel: z.enum(['sms', 'email']).optional().default('sms'),
    customMessage: z.string().trim().max(500).optional(),
    respectQuietHours: z.boolean().optional().default(true),
    nowIso: z.string().trim().max(40).optional(),
  })
  .default({ channel: 'sms', respectQuietHours: true });

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
