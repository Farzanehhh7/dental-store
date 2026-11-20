export type VerticalType = 'dental' | 'medical' | 'lab';
export type ProductKind = 'consumable' | 'capital_equipment';
export type ProductStatus = 'draft' | 'active' | 'out_of_stock' | 'coming_soon' | 'archived';
export type PricingMode = 'fixed' | 'range' | 'call_for_price';
export type CustomerGroupCode = 'retail' | 'dentist' | 'clinic' | 'lab' | 'student' | 'agent' | 'wholesale';
export type AccountType = 'individual' | 'clinic' | 'lab' | 'student' | 'agent' | 'company';
export type CurrencyMode = 'IRT' | 'IRR';

export type AdminRoleCode =
  | 'super_admin'
  | 'admin'
  | 'sales_mgr'
  | 'warehouse'
  | 'content'
  | 'support'
  | 'accountant';

export type OrderStatus =
  | 'pending_payment'
  | 'awaiting_review'
  | 'payment_failed'
  | 'paid'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'return_requested'
  | 'returned';

export type OrderSource = 'google' | 'otp' | 'guest' | 'admin_manual' | 'proforma';

export type PaymentSessionStatus = 'initiated' | 'redirected' | 'verified' | 'failed' | 'expired' | 'refunded';

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  changedAt: string;
  actorType: 'system' | 'customer' | 'admin' | 'gateway';
  actorId?: string;
  note?: string;
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'pending_credit';
export type PaymentMethod =
  | 'online'
  | 'cash_on_delivery'
  | 'bank_transfer'
  | 'credit_request'
  | 'cheque_request'
  | 'installment_request';

export type ProformaStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'converted';
export type PaymentPlanStatus =
  | 'submitted'
  | 'under_review'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'settled'
  | 'defaulted'
  | 'cancelled';
export type B2BStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'needs_info';
export type TicketStatus = 'open' | 'pending_customer' | 'pending_staff' | 'resolved' | 'closed';

export interface Category {
  id: string;
  parentId: string | null;
  path: string;
  depth: number;
  vertical: VerticalType;
  nameFa: string;
  nameEn: string;
  slug: string;
  descriptionFa: string;
  seoTextFa: string;
  metaTitle?: string;
  metaDescription?: string;
  isActive: boolean;
  showInMenu: boolean;
  showOnHome: boolean;
  sortOrder: number;
  attributeIds: string[];
  updatedAt: string;
}

export interface Brand {
  id: string;
  nameFa: string;
  nameEn: string;
  slug: string;
  countryCode: string;
  countryFa: string;
  descriptionFa: string;
  websiteUrl?: string;
  isAuthorizedDealer: boolean;
  warrantyProvider?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface AttributeOption {
  key: string;
  labelFa: string;
  labelEn: string;
  colorHex?: string;
}

export interface AttributeDef {
  id: string;
  code: string;
  labelFa: string;
  labelEn: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'range';
  unit?: string;
  isFilterable: boolean;
  isComparable: boolean;
  showInSpec: boolean;
  options?: AttributeOption[];
  updatedAt: string;
}

export interface StockBatch {
  id: string;
  batchNo: string;
  warehouseId?: string;
  warehouseCode: string;
  producedAt?: string;
  expiresAt: string;
  expiryDate?: string;
  qtyOnHand: number;
  qty?: number;
  reserved?: number;
  unitCost?: number;
  specialPrice?: number | null;
  condition?: 'resellable' | 'damaged';
}

export interface StockLevel {
  id: string; // `${warehouseId}__${variantId}`
  productId: string;
  variantId: string;
  sku?: string;
  warehouseId: string;
  warehouseCode?: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface StockBatchRecord {
  id: string;
  productId: string;
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  reserved: number;
  unitCost?: number;
  specialPrice?: number | null;
  condition: 'resellable' | 'damaged';
  createdAt?: string;
  updatedAt: string;
}

export interface OrderBatchAllocation {
  warehouseId: string;
  warehouseCode?: string;
  batchId?: string;
  batchNo: string;
  expiryDate?: string;
  qty: number;
}

export interface TierPrice {
  minQty: number;
  unitPrice: number;
}

export type VariantOptionType = 'shade' | 'size' | 'pack' | 'model' | 'unit';

export interface ProductVariant {
  id: string;
  sku: string;
  barcode?: string;
  labelFa: string;
  optionType: VariantOptionType;
  optionValueFa: string;
  colorHex?: string;
  basePrice: number | null;
  costPrice?: number;
  groupPrices?: Partial<Record<CustomerGroupCode, number>>;
  tierPrices?: TierPrice[];
  stockOnHand: number;
  reserved: number;
  lowStockThreshold: number;
  weightG: number;
  isDefault?: boolean;
  isActive: boolean;
  batches?: StockBatch[];
  stockLevels?: StockLevel[];
}

export interface ProductFile {
  id: string;
  type: 'catalog' | 'manual' | 'certificate_ce' | 'certificate_iso' | 'certificate_fda' | 'ministry_license';
  titleFa: string;
  fileSizeLabel: string;
  code?: string;
  fileUrl?: string;
  isVerified?: boolean;
  issuer?: string;
  verifiedUntil?: string;
}

export interface PriceHistoryEntry {
  variantId: string;
  variantLabel: string;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  source: 'admin' | 'import' | 'campaign';
}

export interface Product {
  id: string;
  vertical: VerticalType;
  sku: string;
  imedCode?: string;
  gtin?: string;
  titleFa: string;
  titleEn: string;
  slug: string;
  brandId: string;
  originCountryCode: string;
  originCountryFa: string;
  primaryCategoryId: string;
  categoryIds: string[];
  kind: ProductKind;
  status: ProductStatus;
  pricingMode: PricingMode;
  shortDescriptionFa: string;
  descriptionFa: string;
  imageUrl: string;
  galleryUrls: string[];
  videoUrl?: string;
  warrantyMonths?: number;
  warrantyProvider?: string;
  installationAvailable: boolean;
  installationFee?: number;
  trainingAvailable: boolean;
  requiresLicense?: boolean;
  minOrderQty: number;
  ratingAvg: number;
  ratingCount: number;
  viewCount: number;
  soldCount: number;
  tags: string[];
  attributes: Record<string, string | number | boolean | string[]>;
  variants: ProductVariant[];
  files?: ProductFile[];
  relatedIds?: string[];
  alternativeIds?: string[];
  complementaryIds?: string[];
  priceHistory?: PriceHistoryEntry[];
  faqs?: { q: string; a: string }[];
  metaTitle?: string;
  metaDescription?: string;
  publishedAt: string;
  updatedAt: string;
}

export interface ProductCostRecord {
  productId: string;
  variantCosts: Record<string, number>;
  updatedAt: string;
}

export interface ContractPrice {
  id: string;
  userId: string;
  customerName: string;
  productId: string;
  productTitleFa: string;
  variantId: string;
  unitPrice: number;
  validUntil: string;
  isActive: boolean;
}

export interface Campaign {
  id: string;
  nameFa: string;
  slug: string;
  type: 'percent' | 'fixed';
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  showTimer: boolean;
  badgeTextFa: string;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  productIds: string[];
  updatedAt: string;
}

export interface Bundle {
  id: string;
  nameFa: string;
  slug: string;
  kind: 'starter_pack' | 'economy_pack' | 'promo';
  descriptionFa: string;
  imageUrl: string;
  discountPercent: number;
  items: { productId: string; variantId: string; quantity: number }[];
  status: 'active' | 'draft';
  updatedAt: string;
}

export interface AgentBranch {
  id: string;
  nameFa: string;
  type: 'agent' | 'branch' | 'partner';
  province: string;
  provinceSlug: string;
  city: string;
  address: string;
  phone: string;
  mobile: string;
  workingHoursFa: string;
  brandIds: string[];
  lat: number;
  lng: number;
  isActive: boolean;
  updatedAt: string;
}

export interface BlogPost {
  id: string;
  titleFa: string;
  slug: string;
  categoryFa: string;
  categorySlug?: string;
  excerptFa: string;
  bodyFa: string;
  imageUrl: string;
  authorName: string;
  authorRole: string;
  reviewedBy?: string;
  readingMinutes: number;
  productIds: string[];
  faq?: { q: string; a: string }[];
  metaTitle?: string;
  metaDescription?: string;
  status: 'draft' | 'published';
  publishedAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  startsAt: string;
  endsAt: string;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
}

export interface OrderItem {
  productId: string;
  variantId: string;
  sku: string;
  titleFa: string;
  variantLabelFa: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  priceSource: 'base' | 'group' | 'tier' | 'campaign' | 'contract';
  warehouseId?: string;
  batchNo?: string;
  batchAllocations?: OrderBatchAllocation[];
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  isGuest?: boolean;
  source?: OrderSource;
  idempotencyKey?: string;
  customerName: string;
  customerMobile: string;
  customerGroup: CustomerGroupCode;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  couponCode?: string;
  shippingMethod: string;
  shippingAddress: {
    province: string;
    city: string;
    postalCode: string;
    addressLine: string;
  };
  customerNote?: string;
  trackingCode?: string;
  proformaId?: string;
  expiresAt?: string;
  stockReserved?: boolean;
  stockCommitted?: boolean;
  statusHistory?: OrderStatusHistoryEntry[];
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNo: string;
  orderId: string;
  orderNo: string;
  userId: string;
  customerName: string;
  isOfficial: boolean;
  nationalId?: string;
  economicCode?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: 'issued' | 'voided';
  issuedAt: string;
}

export interface PaymentLedgerEntry {
  id: string;
  orderId: string;
  orderNo: string;
  gateway: string;
  amount: number;
  idempotencyKey: string;
  refId: string;
  status: 'initiated' | 'verified' | 'failed' | 'refunded';
  createdAt: string;
}

export interface ReturnRequest {
  id: string;
  returnNo: string;
  orderId: string;
  orderNo: string;
  userId: string;
  customerName: string;
  items: { productId: string; variantId: string; titleFa: string; quantity: number; batchNo?: string }[];
  reasonFa: string;
  resolution: 'refund' | 'replacement' | 'credit';
  status: 'requested' | 'approved' | 'received' | 'refunded' | 'rejected';
  condition?: 'resellable' | 'damaged';
  warehouseId?: string;
  restockedAt?: string;
  refundAmount: number;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProformaInvoice {
  id: string;
  proformaNo: string;
  shareToken?: string;
  userId: string;
  contactName: string;
  contactMobile: string;
  clinicName?: string;
  status: ProformaStatus;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  items: OrderItem[];
  termsFa: string;
  validUntil: string;
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPlan {
  id: string;
  orderId?: string;
  proformaId?: string;
  userId: string;
  customerName: string;
  type: 'credit' | 'installment' | 'cheque';
  requestedAmount: number;
  installmentsCount: number;
  proposedTermsFa: string;
  decisionNote?: string;
  status: PaymentPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  rating: number;
  title?: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  isVerifiedPurchase?: boolean;
  createdAt: string;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  body: string;
  answerBody?: string;
  answeredBy?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  userId: string;
  orderNo?: string;
  subject: string;
  department: 'sales' | 'support' | 'accounting' | 'technical';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: TicketStatus;
  messages: {
    authorName: string;
    isStaff: boolean;
    body: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface StockRequest {
  id: string;
  userId: string;
  contactName: string;
  mobile: string;
  titleText: string;
  brandText?: string;
  description?: string;
  status: 'new' | 'in_review' | 'sourcing' | 'available' | 'rejected' | 'closed';
  adminNote?: string;
  createdAt: string;
}

export interface StockNotification {
  id: string;
  productId: string;
  variantId?: string;
  productTitleFa: string;
  mobile: string;
  userId?: string;
  status: 'pending' | 'notified';
  createdAt: string;
}

export interface NewsletterSubscriber {
  id: string;
  contact: string;
  type: 'email' | 'mobile';
  status: 'active' | 'unsubscribed';
  createdAt: string;
}

export interface ConsultationRequest {
  id: string;
  userId: string;
  name: string;
  mobile: string;
  clinicName?: string;
  productId?: string;
  productName?: string;
  budgetRange?: string;
  message?: string;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  createdAt: string;
}

export interface B2BVerification {
  id: string;
  userId: string;
  applicantName: string;
  mobile: string;
  requestedGroup: Exclude<CustomerGroupCode, 'retail'>;
  clinicName: string;
  medicalCouncilNo: string;
  documentSummary?: string;
  attachmentName?: string;
  attachmentPreview?: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_info';
  rejectReason?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  mobile?: string;
  customerGroup: CustomerGroupCode;
  accountType: AccountType;
  clinicName?: string;
  medicalCouncilNo?: string;
  specialty?: string;
  legalCompanyName?: string;
  economicCode?: string;
  nationalId?: string;
  registrationNo?: string;
  isBlocked?: boolean;
  b2bStatus: B2BStatus;
  addresses?: {
    id: string;
    label: string;
    province: string;
    city: string;
    postalCode: string;
    addressLine: string;
    isDefault: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  code: string;
  nameFa: string;
  city: string;
  address: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface Supplier {
  id: string;
  nameFa: string;
  contactName: string;
  phone: string;
  brandIds: string[];
  leadTimeDays: number;
  isActive: boolean;
}

export type StockMovementType =
  | 'receive'
  | 'reserve'
  | 'release'
  | 'commit'
  | 'adjust'
  | 'transfer'
  | 'return'
  | 'sale'
  | 'stocktake';

export interface StockMovement {
  id: string;
  productId: string;
  productTitleFa: string;
  variantId: string;
  sku: string;
  warehouseId?: string;
  warehouseCode: string;
  toWarehouseId?: string;
  toWarehouseCode?: string;
  batchId?: string;
  batchNo?: string;
  orderId?: string;
  orderNo?: string;
  returnId?: string;
  condition?: 'resellable' | 'damaged';
  delta: number;
  type: StockMovementType;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

export interface SitePage {
  id: string;
  slug: string;
  titleFa: string;
  bodyFa: string;
  metaTitle?: string;
  metaDescription?: string;
  status: 'published' | 'draft';
  updatedAt: string;
}

export interface BannerItem {
  id: string;
  slot: 'hero' | 'top_strip' | 'mid_promo';
  layout?: 'split' | 'overlay';
  badgeTextFa?: string;
  titleFa: string;
  subtitleFa: string;
  ctaTextFa: string;
  linkPath: string;
  secondaryCtaTextFa?: string;
  secondaryLinkPath?: string;
  accentTone?: 'brand' | 'rose' | 'amber' | 'slate';
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
}

export interface FaqItem {
  id: string;
  categoryFa: string;
  questionFa: string;
  answerFa: string;
  sortOrder: number;
  isActive: boolean;
}

export interface NotFoundLog {
  id: string;
  path: string;
  hitCount: number;
  lastSeenAt: string;
}

export interface RedirectRule {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302 | 410;
  hitCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summaryFa: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

export interface SiteSettings {
  id: string;
  storeNameFa: string;
  phone: string;
  addressFa: string;
  workingHoursFa: string;
  imedRegistryCode: string;
  enamadCode: string;
  taxRatePercent: number;
  freeShippingThreshold: number;
  nearExpiryThresholdDays: number;
  discountProofMinDays: number;
  indexableFacetThreshold: number;
  discontinuedGraceDays: number;
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export type RfqStatus = 'submitted' | 'in_review' | 'quoted' | 'accepted' | 'rejected' | 'converted';

export interface RfqMessage {
  id: string;
  authorName: string;
  isStaff: boolean;
  body: string;
  proposedUnitPrice?: number;
  createdAt: string;
}

export interface RfqRequest {
  id: string;
  rfqNo: string;
  userId: string;
  customerMobile: string;
  customerName: string;
  clinicName?: string;
  productId: string;
  productTitleFa: string;
  variantId: string;
  variantLabelFa: string;
  quantity: number;
  targetUnitPrice?: number;
  quotedUnitPrice?: number;
  quotedTotal?: number;
  status: RfqStatus;
  validUntil?: string;
  proformaId?: string;
  messages: RfqMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MobileSessionUser {
  mobile: string;
  displayName?: string;
  token: string;
  expiresAt: string;
}
