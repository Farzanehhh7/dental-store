import type { User } from 'firebase/auth';
import type {
  AdminRoleCode,
  AgentBranch,
  AttributeDef,
  AuditLogEntry,
  B2BVerification,
  BannerItem,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  CartItem,
  Category,
  ConsultationRequest,
  ContractPrice,
  Coupon,
  CurrencyMode,
  CustomerGroupCode,
  FaqItem,
  InvoiceRecord,
  MobileSessionUser,
  NewsletterSubscriber,
  NotFoundLog,
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  PaymentLedgerEntry,
  PaymentMethod,
  PaymentPlan,
  Product,
  ProductCostRecord,
  ProductQuestion,
  ProformaInvoice,
  RedirectRule,
  ReturnRequest,
  Review,
  RfqRequest,
  SitePage,
  SiteSettings,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  StockNotification,
  StockRequest,
  Supplier,
  SupportTicket,
  UserProfile,
  Warehouse,
} from '../types/domain';

export interface AdminStaffRecord {
  uid: string;
  email: string;
  role: AdminRoleCode;
  displayName?: string;
  updatedAt: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface BulkPriceUndoSnapshot {
  scopeLabel: string;
  previousPrices: { productId: string; variantId: string; basePrice: number | null }[];
}

export interface PlaceOrderPayload {
  customerName: string;
  customerMobile: string;
  shippingMethod: string;
  shippingMethodId?: string;
  shippingTotal: number;
  address: Order['shippingAddress'];
  paymentMethod: PaymentMethod;
  couponCode?: string;
  customerNote?: string;
  installmentsCount?: number;
  proposedTermsFa?: string;
  verifiedToken?: string;
}

export interface AdminOrdersQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus | '';
  source?: OrderSource | '';
  q?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AdminOrdersMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LowStockAlertItem {
  levelId: string;
  productId: string;
  productTitleFa: string;
  variantId: string;
  variantLabelFa: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export interface StoreContextValue {
  // Auth & RBAC
  authUser: User | null;
  authReady: boolean;
  isAdmin: boolean;
  actualAdminRole: AdminRoleCode | null;
  activeAdminRole: AdminRoleCode;
  setActiveAdminRole: (role: AdminRoleCode) => void;
  adminsList: AdminStaffRecord[];
  userProfile: UserProfile | null;
  customerGroup: CustomerGroupCode;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;

  // Mobile OTP Session
  mobileSession: MobileSessionUser | null;
  mobileSessionToken: string;
  mobileOrders: Order[];
  sendMobileOtp: (mobile: string) => Promise<{ ok: boolean; mode?: 'sandbox' | 'live'; sandboxCode?: string; message?: string }>;
  verifyMobileOtp: (
    mobile: string,
    code: string,
    displayName?: string
  ) => Promise<{ ok: boolean; verifiedToken?: string; message?: string }>;
  logoutMobile: () => Promise<void>;
  refreshMobileOrders: () => Promise<void>;

  // Theme & Currency
  currency: CurrencyMode;
  setCurrency: (c: CurrencyMode) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Catalog & Content
  settings: SiteSettings;
  categories: Category[];
  brands: Brand[];
  attributes: AttributeDef[];
  products: Product[];
  productCosts: ProductCostRecord[];
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  coupons: Coupon[];
  reviews: Review[];
  questions: ProductQuestion[];
  redirects: RedirectRule[];
  pages: SitePage[];
  banners: BannerItem[];
  faqs: FaqItem[];
  notFoundLogs: NotFoundLog[];

  // Operational Data
  orders: Order[];
  guestOrders: Order[];
  adminOrdersMeta: AdminOrdersMeta;
  adminOrdersLoading: boolean;
  fetchAdminOrders: (query?: AdminOrdersQuery) => Promise<void>;
  invoices: InvoiceRecord[];
  paymentLedger: PaymentLedgerEntry[];
  returns: ReturnRequest[];
  proformas: ProformaInvoice[];
  paymentPlans: PaymentPlan[];
  b2bVerifications: B2BVerification[];
  tickets: SupportTicket[];
  stockRequests: StockRequest[];
  stockNotifications: StockNotification[];
  newsletterSubscribers: NewsletterSubscriber[];
  consultationRequests: ConsultationRequest[];
  contractPrices: ContractPrice[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
  stockBatches: StockBatchRecord[];
  lowStockAlerts: LowStockAlertItem[];
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  usersList: UserProfile[];
  auditLogs: AuditLogEntry[];
  rfqs: RfqRequest[];

  // Cart & Storefront State
  cart: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (productId: string, variantId: string, qty?: number) => void;
  addBundleToCart: (bundleId: string) => void;
  updateCartQty: (variantId: string, qty: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => void;
  compareIds: string[];
  toggleCompare: (productId: string) => void;
  recentlyViewedIds: string[];
  markViewed: (productId: string) => void;

  // Notifications
  toasts: ToastMessage[];
  pushToast: (text: string, tone?: 'info' | 'success' | 'error') => void;

  // Storefront & Checkout Actions
  placeOrder: (payload: PlaceOrderPayload) => Promise<Order | null>;
  verifyOnlinePayment: (orderId: string, gateway?: string) => Promise<boolean>;
  fetchOrderPaymentStatus: (orderId: string) => Promise<{
    ok: boolean;
    paid: boolean;
    order?: Order;
    refId?: string;
    gateway?: string;
    verifiedAt?: string;
    message?: string;
  }>;
  lookupGuestOrder: (orderNo: string, mobile: string) => Promise<Order | null>;
  cancelOwnOrder: (orderId: string) => Promise<void>;
  requestProforma: (payload: {
    contactName: string;
    contactMobile: string;
    clinicName?: string;
    items: OrderItem[];
    termsFa?: string;
  }) => Promise<ProformaInvoice | null>;
  respondProforma: (proformaId: string, status: 'accepted' | 'rejected') => Promise<void>;
  submitB2BVerification: (payload: {
    applicantName: string;
    mobile: string;
    requestedGroup: B2BVerification['requestedGroup'];
    clinicName: string;
    medicalCouncilNo: string;
    documentSummary: string;
    attachmentName?: string;
    attachmentPreview?: string;
  }) => Promise<void>;
  submitReview: (productId: string, rating: number, title: string, body: string) => Promise<void>;
  submitQuestion: (productId: string, body: string) => Promise<void>;
  submitStockRequest: (payload: {
    contactName: string;
    mobile: string;
    titleText: string;
    brandText?: string;
    description?: string;
  }) => Promise<void>;
  submitStockNotification: (payload: {
    productId: string;
    variantId?: string;
    productTitleFa: string;
    mobile: string;
  }) => Promise<void>;
  subscribeNewsletter: (contact: string) => Promise<void>;
  submitReturnRequest: (payload: {
    orderId: string;
    items: ReturnRequest['items'];
    reasonFa: string;
    resolution: ReturnRequest['resolution'];
    refundAmount: number;
  }) => Promise<void>;
  submitConsultation: (payload: {
    name: string;
    mobile: string;
    clinicName?: string;
    productId?: string;
    productName?: string;
    budgetRange?: string;
    message?: string;
  }) => Promise<void>;
  submitTicket: (payload: {
    subject: string;
    department: SupportTicket['department'];
    priority: SupportTicket['priority'];
    body: string;
    orderNo?: string;
  }) => Promise<void>;
  replyTicket: (ticketId: string, body: string, isStaff: boolean) => Promise<void>;
  recordNotFoundHit: (path: string) => Promise<void>;
  incrementRedirectHit: (redirectId: string) => Promise<void>;

  // Two-Way RFQ Actions
  refreshRfqs: () => Promise<void>;
  submitRfq: (payload: {
    productId: string;
    variantId: string;
    quantity: number;
    customerName: string;
    customerMobile: string;
    clinicName?: string;
    targetUnitPrice?: number;
    note?: string;
  }) => Promise<RfqRequest | null>;
  sendRfqMessage: (rfqId: string, body: string, proposedUnitPrice?: number) => Promise<boolean>;
  quoteRfq: (rfqId: string, quotedUnitPrice: number, validDays?: number, note?: string) => Promise<boolean>;
  respondRfq: (rfqId: string, decision: 'accepted' | 'rejected') => Promise<boolean>;
  convertRfqToProforma: (rfqId: string) => Promise<ProformaInvoice | null>;

  // Admin Actions
  upsertProduct: (product: Product, costMap?: Record<string, number>) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  upsertCategory: (category: Category) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  upsertBrand: (brand: Brand) => Promise<void>;
  deleteBrand: (brandId: string) => Promise<void>;
  upsertAttribute: (attr: AttributeDef) => Promise<void>;
  deleteAttribute: (attrId: string) => Promise<void>;
  upsertBundle: (bundle: Bundle) => Promise<void>;
  deleteBundle: (bundleId: string) => Promise<void>;
  upsertCampaign: (campaign: Campaign) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  upsertContractPrice: (contract: ContractPrice) => Promise<void>;
  deleteContractPrice: (contractId: string) => Promise<void>;
  applyBulkPriceAdjustment: (payload: {
    scopeType: 'all' | 'category' | 'brand';
    scopeId?: string;
    percent: number;
    roundingStep: number;
  }) => Promise<void>;
  undoBulkPriceAdjustment: () => Promise<void>;
  canUndoBulkPrice: boolean;
  refreshInventory: () => Promise<void>;
  adjustVariantStock: (
    productId: string,
    variantId: string,
    delta: number,
    reason: string,
    warehouseCode?: string,
    type?: StockMovement['type'],
    options?: { batchNo?: string; expiryDate?: string; warehouseId?: string }
  ) => Promise<void>;
  stocktakeVariantStock: (payload: {
    productId: string;
    variantId: string;
    warehouseId?: string;
    warehouseCode?: string;
    onHand: number;
    reason: string;
  }) => Promise<boolean>;
  transferStock: (payload: {
    productId: string;
    variantId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    reason: string;
    batchNo?: string;
  }) => Promise<boolean>;
  applyNearExpirySpecialPrice: (
    productId: string,
    variantId: string,
    batchId: string,
    specialPrice: number
  ) => Promise<void>;
  markStockNotificationSent: (id: string) => Promise<void>;
  upsertWarehouse: (warehouse: Warehouse) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  upsertSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus, trackingCode?: string) => Promise<void>;
  createManualOrder: (payload: {
    customerName: string;
    customerMobile: string;
    customerGroup: CustomerGroupCode;
    paymentMethod: PaymentMethod;
    shippingMethod: string;
    shippingTotal: number;
    address: Order['shippingAddress'];
    items: OrderItem[];
    customerNote?: string;
  }) => Promise<Order | null>;
  issueInvoice: (orderId: string, isOfficial?: boolean) => Promise<void>;
  voidInvoice: (invoiceId: string) => Promise<void>;
  recordPaymentEntry: (entry: PaymentLedgerEntry) => Promise<void>;
  updateReturnStatus: (id: string, status: ReturnRequest['status'], adminNote?: string) => Promise<void>;
  processReturnAdmin: (
    id: string,
    payload: {
      status: ReturnRequest['status'];
      condition?: 'resellable' | 'damaged';
      warehouseId?: string;
      batchNo?: string;
      expiryDate?: string;
      adminNote?: string;
    }
  ) => Promise<void>;
  reviewB2BVerification: (
    id: string,
    status: 'approved' | 'rejected' | 'needs_info',
    rejectReason?: string
  ) => Promise<void>;
  updateUserAdmin: (
    uid: string,
    patch: Partial<
      Pick<
        UserProfile,
        | 'customerGroup'
        | 'isBlocked'
        | 'b2bStatus'
        | 'displayName'
        | 'clinicName'
        | 'medicalCouncilNo'
        | 'email'
        | 'mobile'
      >
    >
  ) => Promise<void>;
  upsertProformaAdmin: (proforma: ProformaInvoice) => Promise<void>;
  convertProformaToOrder: (proformaId: string) => Promise<void>;
  updatePaymentPlanStatus: (planId: string, status: PaymentPlan['status'], decisionNote?: string) => Promise<void>;
  moderateReview: (reviewId: string, status: 'approved' | 'rejected') => Promise<void>;
  answerQuestion: (questionId: string, answerBody: string) => Promise<void>;
  updateStockRequestStatus: (id: string, status: StockRequest['status'], adminNote?: string) => Promise<void>;
  updateConsultationStatus: (id: string, status: ConsultationRequest['status']) => Promise<void>;
  upsertAgent: (agent: AgentBranch) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  upsertBlogPost: (post: BlogPost) => Promise<void>;
  deleteBlogPost: (postId: string) => Promise<void>;
  upsertCoupon: (coupon: Coupon) => Promise<void>;
  deleteCoupon: (couponId: string) => Promise<void>;
  upsertSitePage: (page: SitePage) => Promise<void>;
  deleteSitePage: (pageId: string) => Promise<void>;
  upsertBanner: (banner: BannerItem) => Promise<void>;
  deleteBanner: (bannerId: string) => Promise<void>;
  upsertFaq: (faq: FaqItem) => Promise<void>;
  deleteFaq: (faqId: string) => Promise<void>;
  upsertRedirect: (rule: RedirectRule) => Promise<void>;
  deleteRedirect: (ruleId: string) => Promise<void>;
  updateSettings: (next: SiteSettings) => Promise<void>;
  updateOwnProfile: (
    patch: Partial<
      Pick<
        UserProfile,
        | 'displayName'
        | 'mobile'
        | 'accountType'
        | 'clinicName'
        | 'medicalCouncilNo'
        | 'specialty'
        | 'legalCompanyName'
        | 'economicCode'
        | 'nationalId'
        | 'registrationNo'
        | 'addresses'
      >
    >
  ) => Promise<void>;
  assignAdminRole: (uid: string, email: string, role: AdminRoleCode, displayName?: string) => Promise<void>;
  removeAdminRole: (uid: string) => Promise<void>;
  seedDatabaseNow: () => Promise<void>;
  dbSynced: boolean;
}
