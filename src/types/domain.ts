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
  | 'return_requested'
  | 'returned';

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
  warehouseCode: string;
  producedAt?: string;
  expiresAt: string;
  qtyOnHand: number;
  unitCost?: number;
  specialPrice?: number | null;
}

export interface TierPrice {
  minQty: number;
  unitPrice: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode?: string;
  labelFa: string;
  optionType: 'shade' | 'size' | 'pack' | 'model' | 'unit';
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
}

export interface ProductFile {
  id: string;
  type: 'catalog' | 'manual' | 'certificate_ce' | 'certificate_iso' | 'certificate_fda' | 'ministry_license';
  titleFa: string;
  fileSizeLabel: string;
  code?: string;
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
  excerptFa: string;
  bodyFa: string;
  imageUrl: string;
  authorName: string;
  authorRole: string;
  reviewedBy?: string;
  readingMinutes: number;
  productIds: string[];
  faq?: { q: string; a: string }[];
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
  priceSource: 'base' | 'group' | 'tier' | 'campaign';
  batchNo?: string;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
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
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ProformaInvoice {
  id: string;
  proformaNo: string;
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
