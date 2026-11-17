import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  SUPER_ADMIN_EMAIL,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  isFirestorePermissionError,
  isFirestoreUnavailableError,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  SEED_AGENTS,
  SEED_AUDIT_LOGS,
  SEED_B2B_VERIFICATIONS,
  SEED_BLOG_POSTS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_CONSULTATIONS,
  SEED_COUPONS,
  SEED_PAYMENT_PLANS,
  SEED_PRODUCTS,
  SEED_PROFORMAS,
  SEED_QUESTIONS,
  SEED_REDIRECTS,
  SEED_REVIEWS,
  SEED_SAMPLE_ORDERS,
  SEED_SETTINGS,
  SEED_STOCK_REQUESTS,
  SEED_TICKETS,
} from '../data/seed';
import {
  EXPANDED_ATTRIBUTES,
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
  SEED_BANNERS,
  SEED_CONTRACT_PRICES,
  SEED_FAQS,
  SEED_INVOICES,
  SEED_NEWSLETTER_SUBSCRIBERS,
  SEED_NOT_FOUND_LOGS,
  SEED_PAGES,
  SEED_PAYMENT_LEDGER,
  SEED_PRODUCT_COSTS,
  SEED_RETURNS,
  SEED_STOCK_MOVEMENTS,
  SEED_STOCK_NOTIFICATIONS,
  SEED_SUPPLIERS,
  SEED_WAREHOUSES,
} from '../data/expandedCatalog';
import { resolveVariantPrice } from '../lib/pricing';
import { trackEcommerceEvent } from '../lib/analytics';
import {
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
  NewsletterSubscriber,
  NotFoundLog,
  Order,
  OrderItem,
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
  SitePage,
  SiteSettings,
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

interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface BulkPriceUndoSnapshot {
  scopeLabel: string;
  previousPrices: { productId: string; variantId: string; basePrice: number | null }[];
}

interface StoreContextValue {
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
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  usersList: UserProfile[];
  auditLogs: AuditLogEntry[];

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
  placeOrder: (payload: {
    customerName: string;
    customerMobile: string;
    shippingMethod: string;
    shippingTotal: number;
    address: Order['shippingAddress'];
    paymentMethod: PaymentMethod;
    couponCode?: string;
    customerNote?: string;
    installmentsCount?: number;
    proposedTermsFa?: string;
  }) => Promise<Order | null>;
  verifyOnlinePayment: (orderId: string, gateway?: string) => Promise<void>;
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
  submitStockRequest: (payload: { contactName: string; mobile: string; titleText: string; brandText?: string; description?: string }) => Promise<void>;
  submitStockNotification: (payload: { productId: string; variantId?: string; productTitleFa: string; mobile: string }) => Promise<void>;
  subscribeNewsletter: (contact: string) => Promise<void>;
  submitReturnRequest: (payload: {
    orderId: string;
    items: ReturnRequest['items'];
    reasonFa: string;
    resolution: ReturnRequest['resolution'];
    refundAmount: number;
  }) => Promise<void>;
  submitConsultation: (payload: { name: string; mobile: string; clinicName?: string; productId?: string; productName?: string; budgetRange?: string; message?: string }) => Promise<void>;
  submitTicket: (payload: { subject: string; department: SupportTicket['department']; priority: SupportTicket['priority']; body: string; orderNo?: string }) => Promise<void>;
  replyTicket: (ticketId: string, body: string, isStaff: boolean) => Promise<void>;
  recordNotFoundHit: (path: string) => Promise<void>;
  incrementRedirectHit: (redirectId: string) => Promise<void>;

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
  applyBulkPriceAdjustment: (payload: { scopeType: 'all' | 'category' | 'brand'; scopeId?: string; percent: number; roundingStep: number }) => Promise<void>;
  undoBulkPriceAdjustment: () => Promise<void>;
  canUndoBulkPrice: boolean;
  adjustVariantStock: (productId: string, variantId: string, delta: number, reason: string, warehouseCode?: string, type?: StockMovement['type']) => Promise<void>;
  applyNearExpirySpecialPrice: (productId: string, variantId: string, batchId: string, specialPrice: number) => Promise<void>;
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
  reviewB2BVerification: (id: string, status: 'approved' | 'rejected' | 'needs_info', rejectReason?: string) => Promise<void>;
  updateUserAdmin: (uid: string, patch: Partial<Pick<UserProfile, 'customerGroup' | 'isBlocked' | 'b2bStatus' | 'displayName' | 'clinicName' | 'medicalCouncilNo' | 'email' | 'mobile'>>) => Promise<void>;
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
  updateOwnProfile: (patch: Partial<Pick<UserProfile, 'displayName' | 'mobile' | 'accountType' | 'clinicName' | 'medicalCouncilNo' | 'specialty' | 'legalCompanyName' | 'economicCode' | 'nationalId' | 'registrationNo' | 'addresses'>>) => Promise<void>;
  assignAdminRole: (uid: string, email: string, role: AdminRoleCode, displayName?: string) => Promise<void>;
  removeAdminRole: (uid: string) => Promise<void>;
  seedDatabaseNow: () => Promise<void>;
  dbSynced: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const LS_CART = 'dm_cart_v1';
const LS_WISHLIST = 'dm_wishlist_v1';
const LS_COMPARE = 'dm_compare_v1';
const LS_RECENT = 'dm_recent_v1';
const LS_CURRENCY = 'dm_currency_v1';
const LS_DARK = 'dm_dark_v1';
const LS_GUEST_ORDERS = 'dm_guest_orders_v1';
const LS_DELETED_IDS = 'dm_deleted_catalog_v1';

function readJsonLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function stripCostFromProduct(p: Product): Product {
  return {
    ...p,
    variants: p.variants.map((v) => {
      const { costPrice: _c, ...rest } = v;
      void _c;
      return rest;
    }),
  };
}

function mergeById<T extends { id: string }>(baseline: T[], liveDocs: T[], deletedSet?: Set<string>): T[] {
  const map = new Map<string, T>();
  for (const item of baseline) {
    if (!deletedSet?.has(item.id)) map.set(item.id, item);
  }
  for (const item of liveDocs) {
    if (!deletedSet?.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const exists = list.some((x) => x.id === item.id);
  return exists ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

async function commitInChunks(operations: Array<(batch: ReturnType<typeof writeBatch>) => void>, chunkSize = 300) {
  for (let i = 0; i < operations.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = operations.slice(i, i + chunkSize);
    slice.forEach((op) => op(batch));
    await batch.commit();
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [actualAdminRole, setActualAdminRole] = useState<AdminRoleCode | null>(null);
  const [activeAdminRole, setActiveAdminRole] = useState<AdminRoleCode>('super_admin');
  const [adminsList, setAdminsList] = useState<AdminStaffRecord[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dbSynced, setDbSynced] = useState(false);
  const seededOnceRef = useRef(false);

  const [currency, setCurrencyState] = useState<CurrencyMode>(() => readJsonLS<CurrencyMode>(LS_CURRENCY, 'IRT'));
  const [darkMode, setDarkMode] = useState<boolean>(() => readJsonLS<boolean>(LS_DARK, false));
  const [deletedIds, setDeletedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_DELETED_IDS, []));
  const deletedSet = useMemo(() => new Set(deletedIds), [deletedIds]);

  const markIdDeleted = (id: string) => {
    setDeletedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem(LS_DELETED_IDS, JSON.stringify(next));
      return next;
    });
  };

  // Baseline catalog (104 categories, 80 brands, 49 attributes, 1024 products stripped of costPrice)
  const cleanBaselineProducts = useMemo(() => EXPANDED_PRODUCTS.map(stripCostFromProduct), []);

  const [settings, setSettings] = useState<SiteSettings>(SEED_SETTINGS);
  const [categories, setCategories] = useState<Category[]>(EXPANDED_CATEGORIES);
  const [brands, setBrands] = useState<Brand[]>(EXPANDED_BRANDS);
  const [attributes, setAttributes] = useState<AttributeDef[]>(EXPANDED_ATTRIBUTES);
  const [products, setProducts] = useState<Product[]>(cleanBaselineProducts);
  const [productCosts, setProductCosts] = useState<ProductCostRecord[]>(SEED_PRODUCT_COSTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [bundles, setBundles] = useState<Bundle[]>(SEED_BUNDLES);
  const [agents, setAgents] = useState<AgentBranch[]>(SEED_AGENTS);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(SEED_BLOG_POSTS);
  const [coupons, setCoupons] = useState<Coupon[]>(SEED_COUPONS);
  const [reviews, setReviews] = useState<Review[]>(SEED_REVIEWS);
  const [questions, setQuestions] = useState<ProductQuestion[]>(SEED_QUESTIONS);
  const [redirects, setRedirects] = useState<RedirectRule[]>(SEED_REDIRECTS);
  const [pages, setPages] = useState<SitePage[]>(SEED_PAGES);
  const [banners, setBanners] = useState<BannerItem[]>(SEED_BANNERS);
  const [faqs, setFaqs] = useState<FaqItem[]>(SEED_FAQS);
  const [notFoundLogs, setNotFoundLogs] = useState<NotFoundLog[]>(SEED_NOT_FOUND_LOGS);

  // Operational datasets
  const [orders, setOrders] = useState<Order[]>(SEED_SAMPLE_ORDERS);
  const [guestOrders, setGuestOrders] = useState<Order[]>(() => readJsonLS<Order[]>(LS_GUEST_ORDERS, []));
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(SEED_INVOICES);
  const [paymentLedger, setPaymentLedger] = useState<PaymentLedgerEntry[]>(SEED_PAYMENT_LEDGER);
  const [returns, setReturns] = useState<ReturnRequest[]>(SEED_RETURNS);
  const [proformas, setProformas] = useState<ProformaInvoice[]>(SEED_PROFORMAS);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(SEED_PAYMENT_PLANS);
  const [b2bVerifications, setB2BVerifications] = useState<B2BVerification[]>(SEED_B2B_VERIFICATIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(SEED_TICKETS);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>(SEED_STOCK_REQUESTS);
  const [stockNotifications, setStockNotifications] = useState<StockNotification[]>(SEED_STOCK_NOTIFICATIONS);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>(SEED_NEWSLETTER_SUBSCRIBERS);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(SEED_CONSULTATIONS);
  const [contractPrices, setContractPrices] = useState<ContractPrice[]>(SEED_CONTRACT_PRICES);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(SEED_WAREHOUSES);
  const [suppliers, setSuppliers] = useState<Supplier[]>(SEED_SUPPLIERS);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(SEED_STOCK_MOVEMENTS);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(SEED_AUDIT_LOGS);
  const [bulkPriceUndo, setBulkPriceUndo] = useState<BulkPriceUndoSnapshot | null>(null);

  // Client cart/wishlist/compare/recent
  const [cart, setCart] = useState<CartItem[]>(() => readJsonLS<CartItem[]>(LS_CART, []));
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => readJsonLS<string[]>(LS_WISHLIST, []));
  const [compareIds, setCompareIds] = useState<string[]>(() => readJsonLS<string[]>(LS_COMPARE, []));
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_RECENT, []));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const isAdmin = useMemo(() => {
    if (!authUser || !authUser.emailVerified) return false;
    return authUser.email === SUPER_ADMIN_EMAIL || isAdminDoc;
  }, [authUser, isAdminDoc]);

  const customerGroup: CustomerGroupCode = userProfile?.customerGroup ?? 'retail';

  const pushToast = (text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(LS_DARK, JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem(LS_CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(LS_WISHLIST, JSON.stringify(wishlistIds));
  }, [wishlistIds]);

  useEffect(() => {
    localStorage.setItem(LS_COMPARE, JSON.stringify(compareIds));
  }, [compareIds]);

  useEffect(() => {
    localStorage.setItem(LS_RECENT, JSON.stringify(recentlyViewedIds));
  }, [recentlyViewedIds]);

  useEffect(() => {
    localStorage.setItem(LS_GUEST_ORDERS, JSON.stringify(guestOrders));
  }, [guestOrders]);

  const setCurrency = (c: CurrencyMode) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, JSON.stringify(c));
  };

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const [connectionChecked, setConnectionChecked] = useState(false);

  // Debounced SEO / Redirect / Price-Comparison sync to Express server
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/seo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories,
          brands,
          products,
          campaigns,
          bundles,
          agents,
          blogPosts,
          redirects,
        }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [categories, brands, products, campaigns, bundles, agents, blogPosts, redirects]);

  // Startup Firestore connectivity probe
  useEffect(() => {
    let active = true;
    testFirestoreConnection()
      .then((ok) => {
        if (active) setDbSynced(ok);
      })
      .finally(() => {
        if (active) setConnectionChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleListenerError = (error: unknown, operationType: OperationType, path: string) => {
    if (isFirestoreUnavailableError(error) && !isFirestorePermissionError(error)) {
      console.warn(`Firestore listener temporarily unavailable (${path}):`, error);
      return;
    }
    handleFirestoreError(error, operationType, path);
  };

  // Auth listener & user profile / RBAC sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const online = await testFirestoreConnection();
        setDbSynced(online);
        setConnectionChecked(true);

        if (user.email === SUPER_ADMIN_EMAIL && user.emailVerified) {
          setActualAdminRole('super_admin');
          setActiveAdminRole('super_admin');
        }

        if (online) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            if (adminSnap.exists()) {
              setIsAdminDoc(true);
              const role = (adminSnap.data()?.role as AdminRoleCode) || 'admin';
              if (user.email !== SUPER_ADMIN_EMAIL) {
                setActualAdminRole(role);
                setActiveAdminRole(role);
              }
            } else {
              setIsAdminDoc(false);
              if (user.email !== SUPER_ADMIN_EMAIL) setActualAdminRole(null);
            }
          } catch {
            setIsAdminDoc(false);
          }

          const userRef = doc(db, 'users', user.uid);
          try {
            const snap = await getDoc(userRef);
            if (!snap.exists() && user.emailVerified) {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email ?? '',
                displayName: user.displayName ?? 'کاربر دنتال‌مارکت',
                mobile: '',
                customerGroup: 'retail',
                accountType: 'individual',
                b2bStatus: 'none',
                isBlocked: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            console.warn('User profile sync deferred:', err);
          }
        }
      } else {
        setIsAdminDoc(false);
        setActualAdminRole(null);
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // User profile snapshot listener
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const path = `users/${authUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          setUserProfile({
            uid: String(data.uid ?? authUser.uid),
            email: String(data.email ?? authUser.email ?? ''),
            displayName: String(data.displayName ?? authUser.displayName ?? ''),
            mobile: String(data.mobile ?? ''),
            customerGroup: (data.customerGroup as CustomerGroupCode) ?? 'retail',
            accountType: (data.accountType as UserProfile['accountType']) ?? 'individual',
            clinicName: data.clinicName ? String(data.clinicName) : undefined,
            medicalCouncilNo: data.medicalCouncilNo ? String(data.medicalCouncilNo) : undefined,
            specialty: data.specialty ? String(data.specialty) : undefined,
            legalCompanyName: data.legalCompanyName ? String(data.legalCompanyName) : undefined,
            economicCode: data.economicCode ? String(data.economicCode) : undefined,
            nationalId: data.nationalId ? String(data.nationalId) : undefined,
            registrationNo: data.registrationNo ? String(data.registrationNo) : undefined,
            isBlocked: Boolean(data.isBlocked),
            b2bStatus: (data.b2bStatus as UserProfile['b2bStatus']) ?? 'none',
            addresses: Array.isArray(data.addresses) ? (data.addresses as UserProfile['addresses']) : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      },
      (err) => handleListenerError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [connectionChecked, dbSynced, authReady, authUser]);

  // Public catalog sync: unary getDocs for guests; real-time onSnapshot when authenticated
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady) return;

    const mapAndMerge = <T extends { id: string }>(
      baseline: T[],
      docsList: T[],
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sanitize?: (item: T) => T
    ) => {
      const cleanedLive = sanitize ? docsList.map(sanitize) : docsList;
      setter(mergeById(baseline, cleanedLive, deletedSet));
    };

    if (!authUser) {
      let cancelled = false;
      const fetchOnce = async <T extends { id: string }>(
        colName: string,
        setter: React.Dispatch<React.SetStateAction<T[]>>,
        baseline: T[],
        sanitize?: (item: T) => T
      ) => {
        try {
          const snapshot = await getDocs(collection(db, colName));
          if (cancelled) return;
          const liveDocs = snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          mapAndMerge(baseline, liveDocs, setter, sanitize);
        } catch (error) {
          if (isFirestorePermissionError(error)) {
            console.warn(`Guest list skip for ${colName}`);
          }
        }
      };

      void Promise.allSettled([
        fetchOnce<Category>('categories', setCategories, EXPANDED_CATEGORIES),
        fetchOnce<Brand>('brands', setBrands, EXPANDED_BRANDS),
        fetchOnce<AttributeDef>('attributes', setAttributes, EXPANDED_ATTRIBUTES),
        fetchOnce<Product>('products', setProducts, cleanBaselineProducts, stripCostFromProduct),
        fetchOnce<Campaign>('campaigns', setCampaigns, SEED_CAMPAIGNS),
        fetchOnce<Bundle>('bundles', setBundles, SEED_BUNDLES),
        fetchOnce<AgentBranch>('agents', setAgents, SEED_AGENTS),
        fetchOnce<BlogPost>('blogPosts', setBlogPosts, SEED_BLOG_POSTS),
        fetchOnce<Coupon>('coupons', setCoupons, SEED_COUPONS),
        fetchOnce<RedirectRule>('redirects', setRedirects, SEED_REDIRECTS),
        fetchOnce<SitePage>('pages', setPages, SEED_PAGES),
        fetchOnce<BannerItem>('banners', setBanners, SEED_BANNERS),
        fetchOnce<FaqItem>('faqs', setFaqs, SEED_FAQS),
        getDoc(doc(db, 'settings', 'site_main')).then((snap) => {
          if (!cancelled && snap.exists()) setSettings(snap.data() as SiteSettings);
        }),
      ]);

      return () => {
        cancelled = true;
      };
    }

    const unsubs: (() => void)[] = [];
    const bindCollection = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      baseline: T[],
      sanitize?: (item: T) => T
    ) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snapshot) => {
          const liveDocs = snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          mapAndMerge(baseline, liveDocs, setter, sanitize);
        },
        (error) => handleListenerError(error, OperationType.LIST, colName)
      );
      unsubs.push(unsub);
    };

    bindCollection<Category>('categories', setCategories, EXPANDED_CATEGORIES);
    bindCollection<Brand>('brands', setBrands, EXPANDED_BRANDS);
    bindCollection<AttributeDef>('attributes', setAttributes, EXPANDED_ATTRIBUTES);
    bindCollection<Product>('products', setProducts, cleanBaselineProducts, stripCostFromProduct);
    bindCollection<Campaign>('campaigns', setCampaigns, SEED_CAMPAIGNS);
    bindCollection<Bundle>('bundles', setBundles, SEED_BUNDLES);
    bindCollection<AgentBranch>('agents', setAgents, SEED_AGENTS);
    bindCollection<BlogPost>('blogPosts', setBlogPosts, SEED_BLOG_POSTS);
    bindCollection<Coupon>('coupons', setCoupons, SEED_COUPONS);
    bindCollection<RedirectRule>('redirects', setRedirects, SEED_REDIRECTS);
    bindCollection<SitePage>('pages', setPages, SEED_PAGES);
    bindCollection<BannerItem>('banners', setBanners, SEED_BANNERS);
    bindCollection<FaqItem>('faqs', setFaqs, SEED_FAQS);

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'site_main'),
      (snap) => {
        if (snap.exists()) setSettings(snap.data() as SiteSettings);
      },
      (err) => handleListenerError(err, OperationType.GET, 'settings/site_main')
    );
    unsubs.push(unsubSettings);

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, cleanBaselineProducts, deletedSet]);

  // Moderated Reviews & Questions
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady) return;

    const revQuery = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'approved'));
    const qQuery = isAdmin
      ? collection(db, 'questions')
      : query(collection(db, 'questions'), where('status', '==', 'approved'));

    if (!authUser) {
      let cancelled = false;
      void getDocs(revQuery)
        .then((snap) => {
          if (!cancelled && !snap.empty) {
            setReviews(mergeById(SEED_REVIEWS, snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id }))));
          }
        })
        .catch(() => {});
      void getDocs(qQuery)
        .then((snap) => {
          if (!cancelled && !snap.empty) {
            setQuestions(mergeById(SEED_QUESTIONS, snap.docs.map((d) => ({ ...(d.data() as ProductQuestion), id: d.id }))));
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    const unsubRev = onSnapshot(
      revQuery,
      (snap) => {
        if (!snap.empty) {
          setReviews(mergeById(SEED_REVIEWS, snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id }))));
        }
      },
      (err) => handleListenerError(err, OperationType.LIST, 'reviews')
    );

    const unsubQ = onSnapshot(
      qQuery,
      (snap) => {
        if (!snap.empty) {
          setQuestions(mergeById(SEED_QUESTIONS, snap.docs.map((d) => ({ ...(d.data() as ProductQuestion), id: d.id }))));
        }
      },
      (err) => handleListenerError(err, OperationType.LIST, 'questions')
    );

    return () => {
      unsubRev();
      unsubQ();
    };
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin]);

  // Authenticated User & Admin Operational Listeners
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const unsubs: (() => void)[] = [];

    const bindScoped = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      fallbackWhenAdmin?: T[]
    ) => {
      const qRef = isAdmin
        ? collection(db, colName)
        : query(collection(db, colName), where('userId', '==', authUser.uid));
      const unsub = onSnapshot(
        qRef,
        (snap) => {
          const live = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          if (isAdmin && fallbackWhenAdmin) {
            setter(mergeById(fallbackWhenAdmin, live));
          } else {
            setter(live);
          }
        },
        (err) => handleListenerError(err, OperationType.LIST, colName)
      );
      unsubs.push(unsub);
    };

    bindScoped<Order>('orders', setOrders, SEED_SAMPLE_ORDERS);
    bindScoped<InvoiceRecord>('invoices', setInvoices, SEED_INVOICES);
    bindScoped<ReturnRequest>('returns', setReturns, SEED_RETURNS);
    bindScoped<ProformaInvoice>('proformas', setProformas, SEED_PROFORMAS);
    bindScoped<PaymentPlan>('paymentPlans', setPaymentPlans, SEED_PAYMENT_PLANS);
    bindScoped<B2BVerification>('b2bVerifications', setB2BVerifications, SEED_B2B_VERIFICATIONS);
    bindScoped<SupportTicket>('tickets', setTickets, SEED_TICKETS);
    bindScoped<StockRequest>('stockRequests', setStockRequests, SEED_STOCK_REQUESTS);
    bindScoped<ConsultationRequest>('consultationRequests', setConsultationRequests, SEED_CONSULTATIONS);
    bindScoped<ContractPrice>('contractPrices', setContractPrices, SEED_CONTRACT_PRICES);

    const roleEffective = actualAdminRole ?? activeAdminRole;
    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => setUsersList(snap.docs.map((d) => d.data() as UserProfile)),
          (err) => handleListenerError(err, OperationType.LIST, 'users')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'admins'),
          (snap) => setAdminsList(snap.docs.map((d) => ({ ...(d.data() as AdminStaffRecord), uid: d.id }))),
          (err) => handleListenerError(err, OperationType.LIST, 'admins')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            if (!snap.empty) {
              setAuditLogs(
                mergeById(SEED_AUDIT_LOGS, snap.docs.map((d) => ({ ...(d.data() as AuditLogEntry), id: d.id })))
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              );
            }
          },
          (err) => handleListenerError(err, OperationType.LIST, 'auditLogs')
        )
      );
      if (['super_admin', 'admin', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'productCosts'),
            (snap) => {
              if (!snap.empty) {
                const map = new Map<string, ProductCostRecord>();
                SEED_PRODUCT_COSTS.forEach((c) => map.set(c.productId, c));
                snap.docs.forEach((d) => map.set(d.id, d.data() as ProductCostRecord));
                setProductCosts(Array.from(map.values()));
              }
            },
            (err) => handleListenerError(err, OperationType.LIST, 'productCosts')
          )
        );
      }
      if (['super_admin', 'admin', 'accountant', 'sales_mgr'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'paymentLedger'),
            (snap) => setPaymentLedger(mergeById(SEED_PAYMENT_LEDGER, snap.docs.map((d) => ({ ...(d.data() as PaymentLedgerEntry), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'paymentLedger')
          )
        );
      }
      if (['super_admin', 'admin', 'warehouse', 'sales_mgr', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'warehouses'),
            (snap) => setWarehouses(mergeById(SEED_WAREHOUSES, snap.docs.map((d) => ({ ...(d.data() as Warehouse), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'warehouses')
          ),
          onSnapshot(
            collection(db, 'suppliers'),
            (snap) => setSuppliers(mergeById(SEED_SUPPLIERS, snap.docs.map((d) => ({ ...(d.data() as Supplier), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'suppliers')
          ),
          onSnapshot(
            collection(db, 'stockNotifications'),
            (snap) => setStockNotifications(mergeById(SEED_STOCK_NOTIFICATIONS, snap.docs.map((d) => ({ ...(d.data() as StockNotification), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'stockNotifications')
          )
        );
      }
      if (['super_admin', 'admin', 'warehouse', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'stockMovements'),
            (snap) => setStockMovements(mergeById(SEED_STOCK_MOVEMENTS, snap.docs.map((d) => ({ ...(d.data() as StockMovement), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'stockMovements')
          )
        );
      }
      if (['super_admin', 'admin', 'content', 'sales_mgr'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'newsletterSubscribers'),
            (snap) => setNewsletterSubscribers(mergeById(SEED_NEWSLETTER_SUBSCRIBERS, snap.docs.map((d) => ({ ...(d.data() as NewsletterSubscriber), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'newsletterSubscribers')
          )
        );
      }
      unsubs.push(
        onSnapshot(
          collection(db, 'notFoundLogs'),
          (snap) => setNotFoundLogs(mergeById(SEED_NOT_FOUND_LOGS, snap.docs.map((d) => ({ ...(d.data() as NotFoundLog), id: d.id })))),
          (err) => handleListenerError(err, OperationType.LIST, 'notFoundLogs')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin, actualAdminRole, activeAdminRole]);

  // Safe chunked Firestore database seeding (<=300 ops per WriteBatch)
  const seedDatabaseNow = async () => {
    if (!isAdmin) {
      pushToast('برای همگام‌سازی پایگاه داده با حساب مدیر وارد شوید.', 'error');
      return;
    }
    try {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) => b.set(doc(db, 'settings', 'site_main'), SEED_SETTINGS));
      EXPANDED_CATEGORIES.forEach((c) => ops.push((b) => b.set(doc(db, 'categories', c.id), c)));
      EXPANDED_BRANDS.forEach((br) => ops.push((b) => b.set(doc(db, 'brands', br.id), br)));
      EXPANDED_ATTRIBUTES.forEach((a) => ops.push((b) => b.set(doc(db, 'attributes', a.id), a)));
      // Seed curated + sample expanded products directly into Firestore cleanly stripped of costPrice
      SEED_PRODUCTS.map(stripCostFromProduct).forEach((p) => ops.push((b) => b.set(doc(db, 'products', p.id), p)));
      SEED_PRODUCT_COSTS.slice(0, 60).forEach((pc) => ops.push((b) => b.set(doc(db, 'productCosts', pc.productId), pc)));
      SEED_CAMPAIGNS.forEach((cp) => ops.push((b) => b.set(doc(db, 'campaigns', cp.id), cp)));
      SEED_BUNDLES.forEach((bn) => ops.push((b) => b.set(doc(db, 'bundles', bn.id), bn)));
      SEED_AGENTS.forEach((ag) => ops.push((b) => b.set(doc(db, 'agents', ag.id), ag)));
      SEED_BLOG_POSTS.forEach((bp) => ops.push((b) => b.set(doc(db, 'blogPosts', bp.id), bp)));
      SEED_COUPONS.forEach((cpn) => ops.push((b) => b.set(doc(db, 'coupons', cpn.id), cpn)));
      SEED_REDIRECTS.forEach((r) => ops.push((b) => b.set(doc(db, 'redirects', r.id), r)));
      SEED_PAGES.forEach((pg) => ops.push((b) => b.set(doc(db, 'pages', pg.id), pg)));
      SEED_BANNERS.forEach((bn) => ops.push((b) => b.set(doc(db, 'banners', bn.id), bn)));
      SEED_FAQS.forEach((fq) => ops.push((b) => b.set(doc(db, 'faqs', fq.id), fq)));
      SEED_WAREHOUSES.forEach((wh) => ops.push((b) => b.set(doc(db, 'warehouses', wh.id), wh)));
      SEED_SUPPLIERS.forEach((sp) => ops.push((b) => b.set(doc(db, 'suppliers', sp.id), sp)));

      await commitInChunks(ops, 280);
      pushToast('کاتالوگ، دسته‌بندی‌ها، برندها و پیکربندی پایه با موفقیت در Firestore ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seed_batch');
    }
  };

  useEffect(() => {
    if (isAdmin && !seededOnceRef.current) {
      seededOnceRef.current = true;
      getDoc(doc(db, 'settings', 'site_main'))
        .then((snap) => {
          if (!snap.exists()) {
            void seedDatabaseNow();
          }
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
      pushToast('ورود به حساب کاربری با موفقیت انجام شد.', 'success');
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      pushToast('ورود انجام نشد. لطفاً مجدداً تلاش کنید.', 'error');
    }
  };

  const logout = async () => {
    await signOut(auth);
    pushToast('از حساب کاربری خارج شدید.', 'info');
  };

  // Cart & Storefront Helpers
  const addToCart = (productId: string, variantId: string, qty = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === variantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { productId, variantId, quantity: qty }];
    });
    trackEcommerceEvent('add_to_cart', { productId, variantId, quantity: qty });
    setCartOpen(true);
    pushToast('محصول به سبد خرید اضافه شد.', 'success');
  };

  const addBundleToCart = (bundleId: string) => {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    setCart((prev) => {
      const next = [...prev];
      for (const item of bundle.items) {
        const idx = next.findIndex((i) => i.variantId === item.variantId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
        } else {
          next.push({ productId: item.productId, variantId: item.variantId, quantity: item.quantity });
        }
      }
      return next;
    });
    setCartOpen(true);
    pushToast(`پکیج «${bundle.nameFa}» به سبد خرید اضافه شد.`, 'success');
  };

  const updateCartQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(variantId);
      return;
    }
    setCart((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)));
  };

  const removeFromCart = (variantId: string) => {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const clearCart = () => setCart([]);

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(productId);
      pushToast(exists ? 'از علاقه‌مندی‌ها حذف شد.' : 'به لیست علاقه‌مندی‌ها اضافه شد.', 'info');
      return exists ? prev.filter((id) => id !== productId) : [...prev, productId];
    });
  };

  const toggleCompare = (productId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.length >= 4) {
        pushToast('حداکثر ۴ محصول هم‌زمان قابل مقایسه است.', 'error');
        return prev;
      }
      pushToast('به لیست مقایسه اضافه شد.', 'success');
      return [...prev, productId];
    });
  };

  const markViewed = (productId: string) => {
    setRecentlyViewedIds((prev) => [productId, ...prev.filter((id) => id !== productId)].slice(0, 8));
  };

  const writeAudit = async (action: string, entityType: string, entityId: string, summaryFa: string) => {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (!authUser || !isAdmin) {
      const localEntry: AuditLogEntry = {
        id,
        actorUid: authUser?.uid ?? 'preview_guest',
        actorEmail: authUser?.email ?? 'preview@dentalmarket.ir',
        action,
        entityType,
        entityId,
        summaryFa: `[پیش‌نمایش] ${summaryFa}`,
        createdAt: new Date().toISOString(),
      };
      setAuditLogs((prev) => [localEntry, ...prev]);
      return;
    }
    try {
      await setDoc(doc(db, 'auditLogs', id), {
        id,
        actorUid: authUser.uid,
        actorEmail: authUser.email ?? '',
        action,
        entityType,
        entityId,
        summaryFa,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Audit write skipped:', err);
    }
  };

  // --- Orders & Checkout (Authenticated OR Guest Checkout) ---
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    if (cart.length === 0) return null;
    if (userProfile?.isBlocked) {
      pushToast('حساب کاربری شما موقتاً محدود شده است. لطفاً با پشتیبانی تماس بگیرید.', 'error');
      return null;
    }

    const items: OrderItem[] = [];
    let subtotal = 0;
    let discountTotal = 0;

    for (const ci of cart) {
      const product = products.find((p) => p.id === ci.productId);
      const variant = product?.variants.find((v) => v.id === ci.variantId);
      if (!product || !variant) continue;
      const resolved = resolveVariantPrice(product, variant, {
        customerGroup,
        quantity: ci.quantity,
        campaigns,
        settings,
        contractPrices,
        userId: authUser?.uid,
      });
      if (resolved.state !== 'fixed' || !resolved.unitPrice) continue;

      const lineTotal = resolved.unitPrice * ci.quantity;
      const lineDisc = resolved.originalPrice ? (resolved.originalPrice - resolved.unitPrice) * ci.quantity : 0;
      subtotal += (resolved.originalPrice ?? resolved.unitPrice) * ci.quantity;
      discountTotal += lineDisc;

      items.push({
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        titleFa: product.titleFa,
        variantLabelFa: variant.labelFa,
        quantity: ci.quantity,
        unitPrice: resolved.unitPrice,
        discountAmount: lineDisc,
        lineTotal,
        priceSource: resolved.priceSource,
        batchNo: resolved.nearestBatchNo ?? undefined,
      });
    }

    if (items.length === 0) {
      pushToast('هیچ کالای قابل خریدی در سبد یافت نشد.', 'error');
      return null;
    }

    let couponDiscount = 0;
    let effectiveShipping = payload.shippingTotal;
    if (payload.couponCode) {
      const coupon = coupons.find((c) => c.code.toUpperCase() === payload.couponCode!.trim().toUpperCase() && c.isActive);
      if (coupon && subtotal - discountTotal >= coupon.minOrderAmount) {
        if (coupon.type === 'free_shipping') {
          effectiveShipping = 0;
        } else if (coupon.type === 'percent') {
          couponDiscount = Math.round(((subtotal - discountTotal) * coupon.value) / 100);
          if (coupon.maxDiscountAmount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
        } else {
          couponDiscount = coupon.value;
        }
      }
    }

    discountTotal += couponDiscount;
    const netItems = Math.max(0, subtotal - discountTotal);
    const taxTotal = Math.round((netItems * settings.taxRatePercent) / 100);
    const grandTotal = netItems + effectiveShipping + taxTotal;

    const isCreditFlow =
      payload.paymentMethod === 'credit_request' ||
      payload.paymentMethod === 'cheque_request' ||
      payload.paymentMethod === 'installment_request';

    const orderId = `ord_${Date.now()}`;
    const orderNo = `DM-1405-${String(Date.now()).slice(-5)}`;
    const now = new Date().toISOString();

    const orderBase: Order = {
      id: orderId,
      orderNo,
      userId: authUser ? authUser.uid : `guest_${payload.customerMobile.replace(/\D/g, '')}`,
      isGuest: !authUser,
      customerName: payload.customerName,
      customerMobile: payload.customerMobile,
      customerGroup,
      status: isCreditFlow ? 'awaiting_review' : 'pending_payment',
      paymentStatus: isCreditFlow ? 'pending_credit' : 'unpaid',
      paymentMethod: payload.paymentMethod,
      subtotal,
      discountTotal,
      shippingTotal: effectiveShipping,
      taxTotal,
      grandTotal,
      ...(payload.couponCode ? { couponCode: payload.couponCode } : {}),
      shippingMethod: payload.shippingMethod,
      shippingAddress: payload.address,
      ...(payload.customerNote ? { customerNote: payload.customerNote } : {}),
      items,
      createdAt: now,
      updatedAt: now,
    };

    trackEcommerceEvent('begin_checkout', { orderNo, grandTotal, items: items.length });

    // Guest checkout flow via server endpoint + local persistence
    if (!authUser) {
      try {
        await fetch('/api/orders/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: orderBase }),
        });
      } catch {
        // Fallback already stored in localStorage below
      }
      setGuestOrders((prev) => [orderBase, ...prev]);
      clearCart();
      pushToast(`سفارش مهمان ${orderNo} با موفقیت ثبت شد.`, 'success');
      return orderBase;
    }

    const orderDoc = {
      ...orderBase,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'orders', orderId), orderDoc);
      if (isCreditFlow) {
        const planId = `pp_${Date.now()}`;
        const planType: PaymentPlan['type'] =
          payload.paymentMethod === 'cheque_request'
            ? 'cheque'
            : payload.paymentMethod === 'installment_request'
            ? 'installment'
            : 'credit';
        await setDoc(doc(db, 'paymentPlans', planId), {
          id: planId,
          orderId,
          userId: authUser.uid,
          customerName: payload.customerName,
          type: planType,
          requestedAmount: grandTotal,
          installmentsCount: payload.installmentsCount ?? 3,
          proposedTermsFa: payload.proposedTermsFa || 'درخواست تسویه اعتباری / چکی',
          status: 'submitted',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      clearCart();
      pushToast(`سفارش ${orderNo} با موفقیت ثبت شد.`, 'success');
      return orderBase;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
      return null;
    }
  };

  const verifyOnlinePayment = async (orderId: string, gateway = 'zarinpal') => {
    const targetOrder = orders.find((o) => o.id === orderId) || guestOrders.find((o) => o.id === orderId);
    const amount = targetOrder?.grandTotal ?? 0;
    const orderNo = targetOrder?.orderNo ?? orderId;
    try {
      const initRes = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          orderNo,
          amount,
          gateway,
          idempotencyKey: `IDEMP-${orderId}`,
        }),
      });
      const initJson = await initRes.json();
      const authority = initJson?.session?.authority;
      const verRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authority, status: 'OK' }),
      });
      const verJson = await verRes.json();

      if (targetOrder?.isGuest) {
        setGuestOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: 'paid', paymentStatus: 'paid', updatedAt: new Date().toISOString() } : o))
        );
      } else if (authUser) {
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'paid',
          paymentStatus: 'paid',
          updatedAt: serverTimestamp(),
        });
        if (verJson?.ledgerEntry && isAdmin) {
          await setDoc(doc(db, 'paymentLedger', verJson.ledgerEntry.id), verJson.ledgerEntry);
        }
      }
      if (verJson?.ledgerEntry) {
        setPaymentLedger((prev) => [verJson.ledgerEntry as PaymentLedgerEntry, ...prev]);
      }
      trackEcommerceEvent('purchase', { transaction_id: orderNo, value: amount, currency: 'IRR' });
      pushToast(`پرداخت آنلاین با کد رهگیری ${verJson?.refId || 'تاییدشده'} ثبت شد.`, 'success');
    } catch (error) {
      if (authUser) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      } else {
        pushToast('خطا در تایید تراکنش بانکی.', 'error');
      }
    }
  };

  const lookupGuestOrder = async (orderNo: string, mobile: string): Promise<Order | null> => {
    const localMatch = guestOrders.find((o) => o.orderNo === orderNo.trim());
    if (localMatch) return localMatch;
    try {
      const res = await fetch(`/api/orders/track?orderNo=${encodeURIComponent(orderNo.trim())}&mobile=${encodeURIComponent(mobile.trim())}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.order as Order) ?? null;
    } catch {
      return null;
    }
  };

  const cancelOwnOrder = async (orderId: string) => {
    const guestMatch = guestOrders.find((o) => o.id === orderId);
    if (guestMatch) {
      setGuestOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled', updatedAt: new Date().toISOString() } : o)));
      pushToast('سفارش لغو شد.', 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        paymentStatus: 'unpaid',
        updatedAt: serverTimestamp(),
      });
      pushToast('سفارش لغو شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const requestProforma: StoreContextValue['requestProforma'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت پیش‌فاکتور رسمی لطفاً وارد حساب کاربری شوید.', 'error');
      return null;
    }
    const id = `prf_${Date.now()}`;
    const proformaNo = `PF-1405-${String(Date.now()).slice(-4)}`;
    const shareToken = `pf-${Math.random().toString(36).slice(2, 10)}`;
    const subtotal = payload.items.reduce((acc, i) => acc + i.lineTotal, 0);
    const taxTotal = Math.round((subtotal * settings.taxRatePercent) / 100);
    const grandTotal = subtotal + taxTotal;
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const docData = {
      id,
      proformaNo,
      shareToken,
      userId: authUser.uid,
      contactName: payload.contactName,
      contactMobile: payload.contactMobile,
      ...(payload.clinicName ? { clinicName: payload.clinicName } : {}),
      status: 'draft' as const,
      subtotal,
      discountTotal: 0,
      taxTotal,
      grandTotal,
      items: payload.items,
      termsFa: payload.termsFa || 'اعتبار پیش‌فاکتور ۷ روز کاری · تحویل مطابق زمان‌بندی',
      validUntil,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'proformas', id), docData);
      pushToast(`پیش‌فاکتور ${proformaNo} ثبت شد.`, 'success');
      return { ...docData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `proformas/${id}`);
      return null;
    }
  };

  const respondProforma = async (proformaId: string, status: 'accepted' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'proformas', proformaId), {
        status,
        updatedAt: serverTimestamp(),
      });
      pushToast(status === 'accepted' ? 'پیش‌فاکتور تأیید شد.' : 'پیش‌فاکتور رد شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `proformas/${proformaId}`);
    }
  };

  const submitB2BVerification: StoreContextValue['submitB2BVerification'] = async (payload) => {
    if (!authUser) {
      pushToast('ابتدا وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `b2b_${Date.now()}`;
    try {
      await setDoc(doc(db, 'b2bVerifications', id), {
        id,
        userId: authUser.uid,
        ...payload,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('درخواست احراز هویت حرفه‌ای B2B ارسال شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `b2bVerifications/${id}`);
    }
  };

  const submitReview = async (productId: string, rating: number, title: string, body: string) => {
    if (!authUser) {
      pushToast('برای ثبت نظر باید وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `rev_${Date.now()}`;
    try {
      await setDoc(doc(db, 'reviews', id), {
        id,
        productId,
        userId: authUser.uid,
        authorName: userProfile?.displayName || authUser.displayName || 'کاربر تاییدشده',
        rating,
        title,
        body,
        status: 'pending',
        isVerifiedPurchase: orders.some((o) => o.userId === authUser.uid && o.items.some((i) => i.productId === productId)),
        createdAt: serverTimestamp(),
      });
      pushToast('دیدگاه شما ثبت شد و پس از بررسی منتشر می‌شود.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${id}`);
    }
  };

  const submitQuestion = async (productId: string, body: string) => {
    if (!authUser) {
      pushToast('برای ثبت پرسش وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `q_${Date.now()}`;
    try {
      await setDoc(doc(db, 'questions', id), {
        id,
        productId,
        userId: authUser.uid,
        authorName: userProfile?.displayName || authUser.displayName || 'کاربر',
        body,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      pushToast('پرسش شما ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `questions/${id}`);
    }
  };

  const submitStockRequest: StoreContextValue['submitStockRequest'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت درخواست کالای ناموجود لطفاً وارد شوید.', 'error');
      return;
    }
    const id = `sr_${Date.now()}`;
    try {
      await setDoc(doc(db, 'stockRequests', id), {
        id,
        userId: authUser.uid,
        ...payload,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      pushToast('درخواست تأمین کالا با موفقیت ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stockRequests/${id}`);
    }
  };

  const submitStockNotification: StoreContextValue['submitStockNotification'] = async (payload) => {
    const id = `sn_${Date.now()}`;
    const item: StockNotification = {
      id,
      productId: payload.productId,
      ...(payload.variantId ? { variantId: payload.variantId } : {}),
      productTitleFa: payload.productTitleFa,
      mobile: payload.mobile,
      ...(authUser ? { userId: authUser.uid } : {}),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'stockNotifications', id), item);
      setStockNotifications((prev) => [item, ...prev]);
      pushToast('شماره شما برای اطلاع‌رسانی موجودی ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stockNotifications/${id}`);
    }
  };

  const subscribeNewsletter = async (contact: string) => {
    const trimmed = contact.trim();
    if (!trimmed || trimmed.length < 4) {
      pushToast('ایمیل یا شماره موبایل معتبر وارد کنید.', 'error');
      return;
    }
    const id = `sub_${Date.now()}`;
    const item: NewsletterSubscriber = {
      id,
      contact: trimmed,
      type: trimmed.includes('@') ? 'email' : 'mobile',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'newsletterSubscribers', id), item);
      setNewsletterSubscribers((prev) => [item, ...prev]);
      pushToast('عضویت شما در خبرنامه تخصصی دنتال‌مارکت ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `newsletterSubscribers/${id}`);
    }
  };

  const submitReturnRequest: StoreContextValue['submitReturnRequest'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت مرجوعی وارد حساب کاربری شوید.', 'error');
      return;
    }
    const ord = orders.find((o) => o.id === payload.orderId);
    if (!ord) return;
    const id = `ret_${Date.now()}`;
    const returnNo = `RT-1405-${String(Date.now()).slice(-4)}`;
    try {
      await setDoc(doc(db, 'returns', id), {
        id,
        returnNo,
        orderId: ord.id,
        orderNo: ord.orderNo,
        userId: authUser.uid,
        customerName: ord.customerName,
        items: payload.items,
        reasonFa: payload.reasonFa,
        resolution: payload.resolution,
        status: 'requested',
        refundAmount: payload.refundAmount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast(`درخواست مرجوعی ${returnNo} ثبت شد.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `returns/${id}`);
    }
  };

  const submitConsultation: StoreContextValue['submitConsultation'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت درخواست مشاوره لطفاً وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `con_${Date.now()}`;
    try {
      await setDoc(doc(db, 'consultationRequests', id), {
        id,
        userId: authUser.uid,
        ...payload,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      pushToast('درخواست مشاوره تخصصی تجهیزات ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `consultationRequests/${id}`);
    }
  };

  const submitTicket: StoreContextValue['submitTicket'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ارسال تیکت وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `tkt_${Date.now()}`;
    const ticketNo = `TK-1405-${String(Date.now()).slice(-4)}`;
    try {
      await setDoc(doc(db, 'tickets', id), {
        id,
        ticketNo,
        userId: authUser.uid,
        ...(payload.orderNo ? { orderNo: payload.orderNo } : {}),
        subject: payload.subject,
        department: payload.department,
        priority: payload.priority,
        status: 'open',
        messages: [
          {
            authorName: userProfile?.displayName || authUser.displayName || 'مشتری',
            isStaff: false,
            body: payload.body,
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast(`تیکت ${ticketNo} ایجاد شد.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tickets/${id}`);
    }
  };

  const replyTicket = async (ticketId: string, body: string, isStaff: boolean) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const nextMessages = [
      ...ticket.messages,
      {
        authorName: isStaff ? 'پشتیبانی دنتال‌مارکت' : userProfile?.displayName || 'مشتری',
        isStaff,
        body,
        createdAt: new Date().toISOString(),
      },
    ];
    const nextStatus: SupportTicket['status'] = isStaff ? 'pending_customer' : 'pending_staff';
    if (!isAdmin && isStaff) {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, messages: nextMessages, status: nextStatus, updatedAt: new Date().toISOString() } : t
        )
      );
      pushToast('پاسخ در حالت پیش‌نمایش موقت ثبت شد (برای ذخیره دائمی با حساب مدیر وارد شوید).', 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        messages: nextMessages,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      pushToast('پاسخ ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticketId}`);
    }
  };

  const recordNotFoundHit = async (pathStr: string) => {
    const safeId = `nf_${pathStr.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60) || 'root'}`;
    const existing = notFoundLogs.find((n) => n.path === pathStr);
    const nextDoc: NotFoundLog = {
      id: existing?.id ?? safeId,
      path: pathStr.slice(0, 240),
      hitCount: (existing?.hitCount ?? 0) + 1,
      lastSeenAt: new Date().toISOString(),
    };
    setNotFoundLogs((prev) => {
      const idx = prev.findIndex((x) => x.path === pathStr);
      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = nextDoc;
        return clone;
      }
      return [nextDoc, ...prev];
    });
    if (dbSynced) {
      setDoc(doc(db, 'notFoundLogs', nextDoc.id), nextDoc).catch(() => {});
    }
  };

  const incrementRedirectHit = async (redirectId: string) => {
    const rule = redirects.find((r) => r.id === redirectId);
    if (!rule) return;
    const nextCount = (rule.hitCount || 0) + 1;
    setRedirects((prev) => prev.map((r) => (r.id === redirectId ? { ...r, hitCount: nextCount } : r)));
    if (isAdmin && dbSynced) {
      updateDoc(doc(db, 'redirects', redirectId), { hitCount: nextCount }).catch(() => {});
    }
  };

  // --- Admin Mutations (with safe local-only preview fallback when !isAdmin) ---
  const PREVIEW_TOAST = 'تغییر در حالت پیش‌نمایش موقت اعمال شد (برای ذخیره دائمی با حساب مدیر وارد شوید).';

  const upsertProduct = async (product: Product, costMap?: Record<string, number>) => {
    const cleaned = stripCostFromProduct({ ...product, updatedAt: new Date().toISOString() });
    if (!isAdmin) {
      setProducts((prev) => upsertById(prev, cleaned));
      if (costMap && Object.keys(costMap).length > 0) {
        const costRec: ProductCostRecord = {
          productId: cleaned.id,
          variantCosts: costMap,
          updatedAt: new Date().toISOString(),
        };
        setProductCosts((prev) => {
          const exists = prev.some((c) => c.productId === cleaned.id);
          return exists ? prev.map((c) => (c.productId === cleaned.id ? costRec : c)) : [costRec, ...prev];
        });
      }
      await writeAudit('product.upsert', 'product', cleaned.id, `ذخیره/ویرایش محصول «${cleaned.titleFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'products', cleaned.id), cleaned);
      if (costMap && Object.keys(costMap).length > 0) {
        const costRec: ProductCostRecord = {
          productId: cleaned.id,
          variantCosts: costMap,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'productCosts', cleaned.id), costRec);
      }
      await writeAudit('product.upsert', 'product', cleaned.id, `ذخیره/ویرایش محصول «${cleaned.titleFa}»`);
      pushToast('محصول با موفقیت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${cleaned.id}`);
    }
  };

  const deleteProduct = async (productId: string) => {
    markIdDeleted(productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    if (!isAdmin) {
      await writeAudit('product.delete', 'product', productId, `حذف محصول ${productId}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'products', productId)).catch(() => {});
      await writeAudit('product.delete', 'product', productId, `حذف محصول ${productId}`);
      pushToast('محصول حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const upsertCategory = async (category: Category) => {
    const updated = { ...category, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setCategories((prev) => upsertById(prev, updated));
      await writeAudit('category.upsert', 'category', updated.id, `ویرایش دسته‌بندی «${updated.nameFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'categories', updated.id), updated);
      await writeAudit('category.upsert', 'category', updated.id, `ویرایش دسته‌بندی «${updated.nameFa}»`);
      pushToast('دسته‌بندی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${updated.id}`);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (products.some((p) => p.primaryCategoryId === categoryId) || categories.some((c) => c.parentId === categoryId)) {
      pushToast('این دسته‌بندی دارای زیرمجموعه یا کالای فعال است و نمی‌توان آن را حذف کرد.', 'error');
      return;
    }
    markIdDeleted(categoryId);
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    if (!isAdmin) {
      await writeAudit('category.delete', 'category', categoryId, `حذف دسته‌بندی ${categoryId}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'categories', categoryId)).catch(() => {});
      await writeAudit('category.delete', 'category', categoryId, `حذف دسته‌بندی ${categoryId}`);
      pushToast('دسته‌بندی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
    }
  };

  const upsertBrand = async (brand: Brand) => {
    const updated = { ...brand, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setBrands((prev) => upsertById(prev, updated));
      await writeAudit('brand.upsert', 'brand', updated.id, `ویرایش برند «${updated.nameFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'brands', updated.id), updated);
      await writeAudit('brand.upsert', 'brand', updated.id, `ویرایش برند «${updated.nameFa}»`);
      pushToast('برند ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `brands/${updated.id}`);
    }
  };

  const deleteBrand = async (brandId: string) => {
    markIdDeleted(brandId);
    setBrands((prev) => prev.filter((b) => b.id !== brandId));
    if (!isAdmin) {
      await writeAudit('brand.delete', 'brand', brandId, `حذف برند ${brandId}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'brands', brandId)).catch(() => {});
      await writeAudit('brand.delete', 'brand', brandId, `حذف برند ${brandId}`);
      pushToast('برند حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `brands/${brandId}`);
    }
  };

  const upsertAttribute = async (attr: AttributeDef) => {
    const updated = { ...attr, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setAttributes((prev) => upsertById(prev, updated));
      await writeAudit('attribute.upsert', 'attribute', updated.id, `ویرایش ویژگی «${updated.labelFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'attributes', updated.id), updated);
      await writeAudit('attribute.upsert', 'attribute', updated.id, `ویرایش ویژگی «${updated.labelFa}»`);
      pushToast('ویژگی فنی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attributes/${updated.id}`);
    }
  };

  const deleteAttribute = async (attrId: string) => {
    markIdDeleted(attrId);
    setAttributes((prev) => prev.filter((a) => a.id !== attrId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'attributes', attrId)).catch(() => {});
      pushToast('ویژگی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `attributes/${attrId}`);
    }
  };

  const upsertBundle = async (bundle: Bundle) => {
    const updated = { ...bundle, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setBundles((prev) => upsertById(prev, updated));
      await writeAudit('bundle.upsert', 'bundle', updated.id, `بروزرسانی پکیج «${updated.nameFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'bundles', updated.id), updated);
      await writeAudit('bundle.upsert', 'bundle', updated.id, `بروزرسانی پکیج «${updated.nameFa}»`);
      pushToast('پکیج / باندل ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bundles/${updated.id}`);
    }
  };

  const deleteBundle = async (bundleId: string) => {
    markIdDeleted(bundleId);
    setBundles((prev) => prev.filter((b) => b.id !== bundleId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'bundles', bundleId)).catch(() => {});
      pushToast('پکیج حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bundles/${bundleId}`);
    }
  };

  const upsertCampaign = async (campaign: Campaign) => {
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setCampaigns((prev) => upsertById(prev, updated));
      await writeAudit('campaign.upsert', 'campaign', updated.id, `بروزرسانی کمپین «${updated.nameFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'campaigns', updated.id), updated);
      await writeAudit('campaign.upsert', 'campaign', updated.id, `بروزرسانی کمپین «${updated.nameFa}»`);
      pushToast('کمپین ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${updated.id}`);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    markIdDeleted(campaignId);
    setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
    if (!isAdmin) {
      await writeAudit('campaign.delete', 'campaign', campaignId, `حذف کمپین ${campaignId}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'campaigns', campaignId)).catch(() => {});
      await writeAudit('campaign.delete', 'campaign', campaignId, `حذف کمپین ${campaignId}`);
      pushToast('کمپین حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `campaigns/${campaignId}`);
    }
  };

  const upsertContractPrice = async (contract: ContractPrice) => {
    if (!isAdmin) {
      setContractPrices((prev) => upsertById(prev, contract));
      await writeAudit('contract.upsert', 'contractPrice', contract.id, `تنظیم قرارداد قیمت ${contract.customerName}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'contractPrices', contract.id), contract);
      await writeAudit('contract.upsert', 'contractPrice', contract.id, `تنظیم قرارداد قیمت ${contract.customerName}`);
      pushToast('قرارداد قیمت اختصاصی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `contractPrices/${contract.id}`);
    }
  };

  const deleteContractPrice = async (contractId: string) => {
    if (!isAdmin) {
      setContractPrices((prev) => prev.filter((c) => c.id !== contractId));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'contractPrices', contractId));
      pushToast('قرارداد قیمت حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contractPrices/${contractId}`);
    }
  };

  const applyBulkPriceAdjustment: StoreContextValue['applyBulkPriceAdjustment'] = async ({
    scopeType,
    scopeId,
    percent,
    roundingStep,
  }) => {
    const targets = products.filter((p) => {
      if (scopeType === 'category' && scopeId) return p.primaryCategoryId === scopeId || p.categoryIds.includes(scopeId);
      if (scopeType === 'brand' && scopeId) return p.brandId === scopeId;
      return true;
    });

    const previousPrices: BulkPriceUndoSnapshot['previousPrices'] = [];
    const now = new Date().toISOString();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const updatedMap = new Map<string, Product>();

    for (const p of targets) {
      let changed = false;
      const newVariants = p.variants.map((v) => {
        if (v.basePrice === null || v.basePrice <= 0) return v;
        previousPrices.push({ productId: p.id, variantId: v.id, basePrice: v.basePrice });
        const raw = v.basePrice * (1 + percent / 100);
        const step = Math.max(1000, roundingStep);
        const rounded = Math.max(1000, Math.round(raw / step) * step);
        changed = true;
        return { ...v, basePrice: rounded };
      });
      if (changed) {
        const nextP = stripCostFromProduct({ ...p, variants: newVariants, updatedAt: now });
        updatedMap.set(p.id, nextP);
        if (ops.length < 250) {
          ops.push((b) => b.set(doc(db, 'products', p.id), nextP));
        }
      }
    }

    setBulkPriceUndo({ scopeLabel: `${scopeType}:${scopeId || 'all'} (${percent}%)`, previousPrices });
    setProducts((prev) => prev.map((p) => updatedMap.get(p.id) ?? p));
    if (isAdmin && ops.length > 0) await commitInChunks(ops, 250);
    await writeAudit('pricing.bulk_adjust', 'products', scopeId || 'all', `اصلاح گروهی قیمت ${percent}٪ (${targets.length} کالا)`);
    pushToast(isAdmin ? `قیمت ${targets.length} محصول بروزرسانی شد (امکان بازگشت وجود دارد).` : PREVIEW_TOAST, isAdmin ? 'success' : 'info');
  };

  const undoBulkPriceAdjustment = async () => {
    if (!bulkPriceUndo) return;
    const mapByProd = new Map<string, Map<string, number | null>>();
    bulkPriceUndo.previousPrices.forEach((rec) => {
      if (!mapByProd.has(rec.productId)) mapByProd.set(rec.productId, new Map());
      mapByProd.get(rec.productId)!.set(rec.variantId, rec.basePrice);
    });
    const now = new Date().toISOString();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    setProducts((prev) =>
      prev.map((p) => {
        const vMap = mapByProd.get(p.id);
        if (!vMap) return p;
        const nextP = stripCostFromProduct({
          ...p,
          variants: p.variants.map((v) => (vMap.has(v.id) ? { ...v, basePrice: vMap.get(v.id)! } : v)),
          updatedAt: now,
        });
        if (ops.length < 250) ops.push((b) => b.set(doc(db, 'products', p.id), nextP));
        return nextP;
      })
    );
    if (isAdmin && ops.length > 0) await commitInChunks(ops, 250);
    setBulkPriceUndo(null);
    pushToast(isAdmin ? 'تغییرات قیمت گروهی به حالت قبل بازگردانده شد.' : PREVIEW_TOAST, 'info');
  };

  const adjustVariantStock = async (
    productId: string,
    variantId: string,
    delta: number,
    reason: string,
    warehouseCode = 'TEH-CENTRAL',
    type: StockMovement['type'] = 'adjust'
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const variant = product.variants.find((v) => v.id === variantId);
    const nextVariants = product.variants.map((v) =>
      v.id === variantId ? { ...v, stockOnHand: Math.max(0, v.stockOnHand + delta) } : v
    );
    const now = new Date().toISOString();
    const updatedProd = stripCostFromProduct({ ...product, variants: nextVariants, updatedAt: now });
    const mvId = `sm_${Date.now()}`;
    const movement: StockMovement = {
      id: mvId,
      productId,
      productTitleFa: product.titleFa,
      variantId,
      sku: variant?.sku ?? product.sku,
      warehouseCode,
      delta,
      type,
      reason,
      actorEmail: authUser?.email ?? 'preview@dentalmarket.ir',
      createdAt: now,
    };
    if (!isAdmin) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? updatedProd : p)));
      setStockMovements((prev) => [movement, ...prev]);
      await writeAudit('inventory.adjust', 'product', productId, `تعدیل موجودی (${delta > 0 ? `+${delta}` : delta}): ${reason}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'products', productId), updatedProd);
      await setDoc(doc(db, 'stockMovements', mvId), movement);
      await writeAudit('inventory.adjust', 'product', productId, `تعدیل موجودی (${delta > 0 ? `+${delta}` : delta}): ${reason}`);
      pushToast('موجودی انبار و دفترکل انبار بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const applyNearExpirySpecialPrice = async (
    productId: string,
    variantId: string,
    batchId: string,
    specialPrice: number
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const nextVariants = product.variants.map((v) => {
      if (v.id !== variantId) return v;
      return {
        ...v,
        batches: (v.batches ?? []).map((b) => (b.id === batchId ? { ...b, specialPrice } : b)),
      };
    });
    const updated = stripCostFromProduct({ ...product, variants: nextVariants, updatedAt: new Date().toISOString() });
    if (!isAdmin) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
      await writeAudit('inventory.near_expiry_price', 'product', productId, `تنظیم قیمت ویژه انقضای نزدیک: ${specialPrice} تومان`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'products', productId), updated);
      await writeAudit('inventory.near_expiry_price', 'product', productId, `تنظیم قیمت ویژه انقضای نزدیک: ${specialPrice} تومان`);
      pushToast('قیمت ویژه سری ساخت انقضای نزدیک ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const markStockNotificationSent = async (id: string) => {
    if (!isAdmin) {
      setStockNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'notified' } : n)));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'stockNotifications', id), { status: 'notified' });
      pushToast('وضعیت اطلاع‌رسانی به «ارسال‌شده» تغییر یافت.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stockNotifications/${id}`);
    }
  };

  const upsertWarehouse = async (warehouse: Warehouse) => {
    if (!isAdmin) {
      setWarehouses((prev) => upsertById(prev, warehouse));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'warehouses', warehouse.id), warehouse);
      pushToast('انبار ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `warehouses/${warehouse.id}`);
    }
  };

  const deleteWarehouse = async (id: string) => {
    if (!isAdmin) {
      setWarehouses((prev) => prev.filter((w) => w.id !== id));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'warehouses', id));
      pushToast('انبار حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `warehouses/${id}`);
    }
  };

  const upsertSupplier = async (supplier: Supplier) => {
    if (!isAdmin) {
      setSuppliers((prev) => upsertById(prev, supplier));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'suppliers', supplier.id), supplier);
      pushToast('تامین‌کننده ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `suppliers/${supplier.id}`);
    }
  };

  const deleteSupplier = async (id: string) => {
    if (!isAdmin) {
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      pushToast('تامین‌کننده حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus, trackingCode?: string) => {
    if (!isAdmin) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status,
                ...(status === 'paid' ? { paymentStatus: 'paid' as const } : {}),
                ...(status === 'returned' ? { paymentStatus: 'refunded' as const } : {}),
                ...(trackingCode ? { trackingCode } : {}),
                updatedAt: new Date().toISOString(),
              }
            : o
        )
      );
      await writeAudit('order.status_change', 'order', orderId, `تغییر وضعیت سفارش به ${status}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      const updates: Record<string, unknown> = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (status === 'paid') updates.paymentStatus = 'paid';
      if (status === 'returned') updates.paymentStatus = 'refunded';
      if (trackingCode) updates.trackingCode = trackingCode;
      await updateDoc(doc(db, 'orders', orderId), updates);
      await writeAudit('order.status_change', 'order', orderId, `تغییر وضعیت سفارش به ${status}`);
      pushToast('وضعیت سفارش بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const createManualOrder: StoreContextValue['createManualOrder'] = async (payload) => {
    const subtotal = payload.items.reduce((s, i) => s + i.lineTotal, 0);
    const taxTotal = Math.round((subtotal * settings.taxRatePercent) / 100);
    const grandTotal = subtotal + payload.shippingTotal + taxTotal;
    const orderId = `ord_${Date.now()}`;
    const orderNo = `DM-1405-${String(Date.now()).slice(-5)}`;
    const now = new Date().toISOString();
    const orderObj: Order = {
      id: orderId,
      orderNo,
      userId: authUser?.uid || 'manual_admin',
      customerName: payload.customerName,
      customerMobile: payload.customerMobile,
      customerGroup: payload.customerGroup,
      status: 'processing',
      paymentStatus: 'unpaid',
      paymentMethod: payload.paymentMethod,
      subtotal,
      discountTotal: 0,
      shippingTotal: payload.shippingTotal,
      taxTotal,
      grandTotal,
      shippingMethod: payload.shippingMethod,
      shippingAddress: payload.address,
      ...(payload.customerNote ? { customerNote: payload.customerNote } : {}),
      items: payload.items,
      createdAt: now,
      updatedAt: now,
    };
    if (!isAdmin) {
      setOrders((prev) => [orderObj, ...prev]);
      await writeAudit('order.manual_create', 'order', orderId, `ثبت سفارش تلفنی/دستی ${orderNo}`);
      pushToast(PREVIEW_TOAST, 'info');
      return orderObj;
    }
    try {
      await setDoc(doc(db, 'orders', orderId), {
        ...orderObj,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAudit('order.manual_create', 'order', orderId, `ثبت سفارش تلفنی/دستی ${orderNo}`);
      pushToast(`سفارش دستی ${orderNo} ثبت شد.`, 'success');
      return orderObj;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
      return null;
    }
  };

  const issueInvoice = async (orderId: string, isOfficial = true) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;
    const customer = usersList.find((u) => u.uid === ord.userId);
    const id = `inv_${Date.now()}`;
    const rec: InvoiceRecord = {
      id,
      invoiceNo: `INV-1405-${String(Date.now()).slice(-4)}`,
      orderId: ord.id,
      orderNo: ord.orderNo,
      userId: ord.userId,
      customerName: ord.customerName,
      isOfficial,
      ...(customer?.nationalId ? { nationalId: customer.nationalId } : {}),
      ...(customer?.economicCode ? { economicCode: customer.economicCode } : {}),
      subtotal: ord.subtotal,
      discountTotal: ord.discountTotal,
      taxTotal: ord.taxTotal,
      grandTotal: ord.grandTotal,
      status: 'issued',
      issuedAt: new Date().toISOString(),
    };
    if (!isAdmin) {
      setInvoices((prev) => [rec, ...prev]);
      await writeAudit('invoice.issue', 'invoice', id, `صدور فاکتور ${rec.invoiceNo} برای سفارش ${ord.orderNo}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'invoices', id), rec);
      await writeAudit('invoice.issue', 'invoice', id, `صدور فاکتور ${rec.invoiceNo} برای سفارش ${ord.orderNo}`);
      pushToast(`فاکتور ${rec.invoiceNo} صادر شد.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `invoices/${id}`);
    }
  };

  const voidInvoice = async (invoiceId: string) => {
    if (!isAdmin) {
      setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'voided' } : inv)));
      await writeAudit('invoice.void', 'invoice', invoiceId, `ابطال فاکتور ${invoiceId}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), { status: 'voided' });
      await writeAudit('invoice.void', 'invoice', invoiceId, `ابطال فاکتور ${invoiceId}`);
      pushToast('فاکتور باطل شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
    }
  };

  const recordPaymentEntry = async (entry: PaymentLedgerEntry) => {
    if (!isAdmin) {
      setPaymentLedger((prev) => upsertById(prev, entry));
      if (entry.status === 'verified') {
        setOrders((prev) => prev.map((o) => (o.id === entry.orderId ? { ...o, paymentStatus: 'paid', status: 'paid' } : o)));
      } else if (entry.status === 'refunded') {
        setOrders((prev) => prev.map((o) => (o.id === entry.orderId ? { ...o, paymentStatus: 'refunded' } : o)));
      }
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'paymentLedger', entry.id), entry);
      if (entry.status === 'verified') {
        await updateDoc(doc(db, 'orders', entry.orderId), { paymentStatus: 'paid', status: 'paid', updatedAt: serverTimestamp() }).catch(() => {});
      } else if (entry.status === 'refunded') {
        await updateDoc(doc(db, 'orders', entry.orderId), { paymentStatus: 'refunded', updatedAt: serverTimestamp() }).catch(() => {});
      }
      pushToast('سند پرداخت در دفترکل مالی ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `paymentLedger/${entry.id}`);
    }
  };

  const updateReturnStatus = async (id: string, status: ReturnRequest['status'], adminNote?: string) => {
    if (!isAdmin) {
      setReturns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, ...(adminNote ? { adminNote } : {}), updatedAt: new Date().toISOString() } : r))
      );
      await writeAudit('return.update', 'return', id, `تغییر وضعیت مرجوعی به ${status}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'returns', id), {
        status,
        ...(adminNote ? { adminNote } : {}),
        updatedAt: serverTimestamp(),
      });
      await writeAudit('return.update', 'return', id, `تغییر وضعیت مرجوعی به ${status}`);
      pushToast('پرونده مرجوعی بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `returns/${id}`);
    }
  };

  const reviewB2BVerification = async (
    id: string,
    status: 'approved' | 'rejected' | 'needs_info',
    rejectReason?: string
  ) => {
    const item = b2bVerifications.find((b) => b.id === id);
    if (!item) return;
    if (!isAdmin) {
      setB2BVerifications((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, status, ...(rejectReason ? { rejectReason } : {}), reviewedBy: 'preview', updatedAt: new Date().toISOString() }
            : b
        )
      );
      await writeAudit('b2b.review', 'b2bVerification', id, `بررسی حساب B2B (${item.applicantName}): ${status}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'b2bVerifications', id), {
        status,
        ...(rejectReason ? { rejectReason } : {}),
        reviewedBy: authUser?.email ?? 'admin',
        updatedAt: serverTimestamp(),
      });
      if (status === 'approved') {
        await updateDoc(doc(db, 'users', item.userId), {
          customerGroup: item.requestedGroup,
          b2bStatus: 'approved',
          clinicName: item.clinicName,
          medicalCouncilNo: item.medicalCouncilNo,
          updatedAt: serverTimestamp(),
        });
      }
      await writeAudit('b2b.review', 'b2bVerification', id, `بررسی حساب B2B (${item.applicantName}): ${status}`);
      pushToast('وضعیت درخواست B2B بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `b2bVerifications/${id}`);
    }
  };

  const updateUserAdmin: StoreContextValue['updateUserAdmin'] = async (uid, patch) => {
    if (!isAdmin) {
      pushToast('برای تغییر دسترسی پرسنل یا اطلاعات کاربران، ورود واقعی با حساب مدیر الزامی است.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      await writeAudit('user.admin_update', 'user', uid, `ویرایش کاربری ${uid}`);
      pushToast('اطلاعات کاربر بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const upsertProformaAdmin = async (proforma: ProformaInvoice) => {
    const next = { ...proforma, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setProformas((prev) => upsertById(prev, next));
      await writeAudit('proforma.upsert', 'proforma', proforma.id, `بروزرسانی پیش‌فاکتور ${proforma.proformaNo}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'proformas', proforma.id), next);
      await writeAudit('proforma.upsert', 'proforma', proforma.id, `بروزرسانی پیش‌فاکتور ${proforma.proformaNo}`);
      pushToast('پیش‌فاکتور بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `proformas/${proforma.id}`);
    }
  };

  const convertProformaToOrder = async (proformaId: string) => {
    const pf = proformas.find((p) => p.id === proformaId);
    if (!pf) return;
    const orderId = `ord_${Date.now()}`;
    const orderNo = `DM-1405-${String(Date.now()).slice(-5)}`;
    const now = new Date().toISOString();
    const orderObj: Order = {
      id: orderId,
      orderNo,
      userId: pf.userId,
      customerName: pf.contactName,
      customerMobile: pf.contactMobile,
      customerGroup: 'clinic',
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      paymentMethod: 'bank_transfer',
      subtotal: pf.subtotal,
      discountTotal: pf.discountTotal,
      shippingTotal: 0,
      taxTotal: pf.taxTotal,
      grandTotal: pf.grandTotal,
      shippingMethod: 'حمل تخصصی تجهیزات',
      shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '۱۴۱۷۹۳۳۱۱۱', addressLine: pf.clinicName || 'تحویل مطب' },
      proformaId: pf.id,
      items: pf.items,
      createdAt: now,
      updatedAt: now,
    };
    if (!isAdmin) {
      setOrders((prev) => [orderObj, ...prev]);
      setProformas((prev) => prev.map((p) => (p.id === proformaId ? { ...p, status: 'converted', orderId, updatedAt: now } : p)));
      await writeAudit('proforma.convert', 'proforma', proformaId, `تبدیل پیش‌فاکتور ${pf.proformaNo} به سفارش ${orderNo}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'orders', orderId), {
        ...orderObj,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'proformas', proformaId), {
        status: 'converted',
        orderId,
        updatedAt: serverTimestamp(),
      });
      await writeAudit('proforma.convert', 'proforma', proformaId, `تبدیل پیش‌فاکتور ${pf.proformaNo} به سفارش ${orderNo}`);
      pushToast(`پیش‌فاکتور به سفارش ${orderNo} تبدیل شد.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `proformas/${proformaId}`);
    }
  };

  const updatePaymentPlanStatus = async (planId: string, status: PaymentPlan['status'], decisionNote?: string) => {
    if (!isAdmin) {
      setPaymentPlans((prev) =>
        prev.map((pp) =>
          pp.id === planId ? { ...pp, status, ...(decisionNote ? { decisionNote } : {}), updatedAt: new Date().toISOString() } : pp
        )
      );
      await writeAudit('payment_plan.update', 'paymentPlan', planId, `تغییر وضعیت پرونده اعتبار/چک به ${status}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'paymentPlans', planId), {
        status,
        ...(decisionNote ? { decisionNote } : {}),
        updatedAt: serverTimestamp(),
      });
      await writeAudit('payment_plan.update', 'paymentPlan', planId, `تغییر وضعیت پرونده اعتبار/چک به ${status}`);
      pushToast('پرونده اعتباری بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `paymentPlans/${planId}`);
    }
  };

  const moderateReview = async (reviewId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin) {
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, status } : r)));
      await writeAudit('review.moderate', 'review', reviewId, `تغییر وضعیت دیدگاه به ${status}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'reviews', reviewId), { status });
      await writeAudit('review.moderate', 'review', reviewId, `تغییر وضعیت دیدگاه به ${status}`);
      pushToast('وضعیت دیدگاه بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
    }
  };

  const answerQuestion = async (questionId: string, answerBody: string) => {
    if (!isAdmin) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId ? { ...q, answerBody, answeredBy: 'کارشناس تخصصی دنتال‌مارکت', status: 'approved' } : q
        )
      );
      await writeAudit('question.answer', 'question', questionId, 'پاسخ و انتشار پرسش محصول');
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'questions', questionId), {
        answerBody,
        answeredBy: 'کارشناس تخصصی دنتال‌مارکت',
        status: 'approved',
      });
      await writeAudit('question.answer', 'question', questionId, 'پاسخ و انتشار پرسش محصول');
      pushToast('پاسخ ثبت و منتشر شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `questions/${questionId}`);
    }
  };

  const updateStockRequestStatus = async (id: string, status: StockRequest['status'], adminNote?: string) => {
    if (!isAdmin) {
      setStockRequests((prev) =>
        prev.map((sr) => (sr.id === id ? { ...sr, status, ...(adminNote ? { adminNote } : {}) } : sr))
      );
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'stockRequests', id), {
        status,
        ...(adminNote ? { adminNote } : {}),
      });
      pushToast('وضعیت درخواست تأمین کالا بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stockRequests/${id}`);
    }
  };

  const updateConsultationStatus = async (id: string, status: ConsultationRequest['status']) => {
    if (!isAdmin) {
      setConsultationRequests((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'consultationRequests', id), { status });
      pushToast('وضعیت درخواست مشاوره بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `consultationRequests/${id}`);
    }
  };

  const upsertAgent = async (agent: AgentBranch) => {
    const next = { ...agent, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setAgents((prev) => upsertById(prev, next));
      await writeAudit('agent.upsert', 'agent', next.id, `ثبت/ویرایش نمایندگی «${next.nameFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'agents', next.id), next);
      await writeAudit('agent.upsert', 'agent', next.id, `ثبت/ویرایش نمایندگی «${next.nameFa}»`);
      pushToast('نمایندگی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `agents/${next.id}`);
    }
  };

  const deleteAgent = async (agentId: string) => {
    markIdDeleted(agentId);
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'agents', agentId)).catch(() => {});
    pushToast('نمایندگی حذف شد.', 'info');
  };

  const upsertBlogPost = async (post: BlogPost) => {
    const next = { ...post, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setBlogPosts((prev) => upsertById(prev, next));
      await writeAudit('blog.upsert', 'blogPost', next.id, `ویرایش مقاله «${next.titleFa}»`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'blogPosts', next.id), next);
      await writeAudit('blog.upsert', 'blogPost', next.id, `ویرایش مقاله «${next.titleFa}»`);
      pushToast('مقاله ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `blogPosts/${next.id}`);
    }
  };

  const deleteBlogPost = async (postId: string) => {
    markIdDeleted(postId);
    setBlogPosts((prev) => prev.filter((p) => p.id !== postId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'blogPosts', postId)).catch(() => {});
    pushToast('مقاله حذف شد.', 'info');
  };

  const upsertCoupon = async (coupon: Coupon) => {
    if (!isAdmin) {
      setCoupons((prev) => upsertById(prev, coupon));
      await writeAudit('coupon.upsert', 'coupon', coupon.id, `ثبت/ویرایش کد تخفیف ${coupon.code}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'coupons', coupon.id), coupon);
      await writeAudit('coupon.upsert', 'coupon', coupon.id, `ثبت/ویرایش کد تخفیف ${coupon.code}`);
      pushToast('کد تخفیف ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `coupons/${coupon.id}`);
    }
  };

  const deleteCoupon = async (couponId: string) => {
    markIdDeleted(couponId);
    setCoupons((prev) => prev.filter((c) => c.id !== couponId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'coupons', couponId)).catch(() => {});
    pushToast('کد تخفیف حذف شد.', 'info');
  };

  const upsertSitePage = async (page: SitePage) => {
    const next = { ...page, updatedAt: new Date().toISOString() };
    if (!isAdmin) {
      setPages((prev) => upsertById(prev, next));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'pages', next.id), next);
      pushToast('صفحه اطلاع‌رسانی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `pages/${next.id}`);
    }
  };

  const deleteSitePage = async (pageId: string) => {
    markIdDeleted(pageId);
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'pages', pageId)).catch(() => {});
    pushToast('صفحه حذف شد.', 'info');
  };

  const upsertBanner = async (banner: BannerItem) => {
    if (!isAdmin) {
      setBanners((prev) => upsertById(prev, banner));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'banners', banner.id), banner);
      pushToast('بنر تبلیغاتی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `banners/${banner.id}`);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    markIdDeleted(bannerId);
    setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'banners', bannerId)).catch(() => {});
    pushToast('بنر حذف شد.', 'info');
  };

  const upsertFaq = async (faq: FaqItem) => {
    if (!isAdmin) {
      setFaqs((prev) => upsertById(prev, faq));
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'faqs', faq.id), faq);
      pushToast('سوال متداول ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `faqs/${faq.id}`);
    }
  };

  const deleteFaq = async (faqId: string) => {
    markIdDeleted(faqId);
    setFaqs((prev) => prev.filter((f) => f.id !== faqId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'faqs', faqId)).catch(() => {});
    pushToast('سوال حذف شد.', 'info');
  };

  const upsertRedirect = async (rule: RedirectRule) => {
    if (!isAdmin) {
      setRedirects((prev) => upsertById(prev, rule));
      await writeAudit('redirect.upsert', 'redirect', rule.id, `ثبت ریدایرکت ${rule.fromPath} -> ${rule.toPath}`);
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'redirects', rule.id), rule);
      await writeAudit('redirect.upsert', 'redirect', rule.id, `ثبت ریدایرکت ${rule.fromPath} -> ${rule.toPath}`);
      pushToast('قانون ریدایرکت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `redirects/${rule.id}`);
    }
  };

  const deleteRedirect = async (ruleId: string) => {
    markIdDeleted(ruleId);
    setRedirects((prev) => prev.filter((r) => r.id !== ruleId));
    if (!isAdmin) {
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    await deleteDoc(doc(db, 'redirects', ruleId)).catch(() => {});
    pushToast('ریدایرکت حذف شد.', 'info');
  };

  const updateSettings = async (next: SiteSettings) => {
    if (!isAdmin) {
      setSettings(next);
      await writeAudit('settings.update', 'settings', 'site_main', 'بروزرسانی تنظیمات کلان فروشگاه');
      pushToast(PREVIEW_TOAST, 'info');
      return;
    }
    try {
      await setDoc(doc(db, 'settings', 'site_main'), next);
      await writeAudit('settings.update', 'settings', 'site_main', 'بروزرسانی تنظیمات کلان فروشگاه');
      pushToast('تنظیمات فروشگاه ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/site_main');
    }
  };

  const updateOwnProfile: StoreContextValue['updateOwnProfile'] = async (patch) => {
    if (!authUser) {
      pushToast('ابتدا وارد حساب کاربری شوید.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      pushToast('اطلاعات پروفایل و حقوقی بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${authUser.uid}`);
    }
  };

  const assignAdminRole = async (uid: string, email: string, role: AdminRoleCode, displayName?: string) => {
    if (!isAdmin) {
      pushToast('برای تغییر دسترسی پرسنل یا اطلاعات کاربران، ورود واقعی با حساب مدیر الزامی است.', 'error');
      return;
    }
    const rec: AdminStaffRecord = {
      uid: uid.trim(),
      email: email.trim(),
      role,
      displayName: displayName?.trim() || email.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'admins', rec.uid), rec);
      await writeAudit('rbac.assign', 'admin', rec.uid, `تخصیص نقش ${role} به ${rec.email}`);
      pushToast('نقش دسترسی مدیر ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `admins/${rec.uid}`);
    }
  };

  const removeAdminRole = async (uid: string) => {
    if (!isAdmin) {
      pushToast('برای تغییر دسترسی پرسنل یا اطلاعات کاربران، ورود واقعی با حساب مدیر الزامی است.', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'admins', uid));
      await writeAudit('rbac.revoke', 'admin', uid, `لغو دسترسی مدیریتی ${uid}`);
      pushToast('دسترسی مدیر حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
    }
  };

  return (
    <StoreContext.Provider
      value={{
        authUser,
        authReady,
        isAdmin,
        actualAdminRole,
        activeAdminRole,
        setActiveAdminRole,
        adminsList,
        userProfile,
        customerGroup,
        signInWithGoogle,
        logout,
        currency,
        setCurrency,
        darkMode,
        toggleDarkMode,
        settings,
        categories,
        brands,
        attributes,
        products,
        productCosts,
        campaigns,
        bundles,
        agents,
        blogPosts,
        coupons,
        reviews,
        questions,
        redirects,
        pages,
        banners,
        faqs,
        notFoundLogs,
        orders,
        guestOrders,
        invoices,
        paymentLedger,
        returns,
        proformas,
        paymentPlans,
        b2bVerifications,
        tickets,
        stockRequests,
        stockNotifications,
        newsletterSubscribers,
        consultationRequests,
        contractPrices,
        warehouses,
        suppliers,
        stockMovements,
        usersList,
        auditLogs,
        cart,
        cartOpen,
        setCartOpen,
        addToCart,
        addBundleToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        wishlistIds,
        toggleWishlist,
        compareIds,
        toggleCompare,
        recentlyViewedIds,
        markViewed,
        toasts,
        pushToast,
        placeOrder,
        verifyOnlinePayment,
        lookupGuestOrder,
        cancelOwnOrder,
        requestProforma,
        respondProforma,
        submitB2BVerification,
        submitReview,
        submitQuestion,
        submitStockRequest,
        submitStockNotification,
        subscribeNewsletter,
        submitReturnRequest,
        submitConsultation,
        submitTicket,
        replyTicket,
        recordNotFoundHit,
        incrementRedirectHit,
        upsertProduct,
        deleteProduct,
        upsertCategory,
        deleteCategory,
        upsertBrand,
        deleteBrand,
        upsertAttribute,
        deleteAttribute,
        upsertBundle,
        deleteBundle,
        upsertCampaign,
        deleteCampaign,
        upsertContractPrice,
        deleteContractPrice,
        applyBulkPriceAdjustment,
        undoBulkPriceAdjustment,
        canUndoBulkPrice: Boolean(bulkPriceUndo),
        adjustVariantStock,
        applyNearExpirySpecialPrice,
        markStockNotificationSent,
        upsertWarehouse,
        deleteWarehouse,
        upsertSupplier,
        deleteSupplier,
        updateOrderStatus,
        createManualOrder,
        issueInvoice,
        voidInvoice,
        recordPaymentEntry,
        updateReturnStatus,
        reviewB2BVerification,
        updateUserAdmin,
        upsertProformaAdmin,
        convertProformaToOrder,
        updatePaymentPlanStatus,
        moderateReview,
        answerQuestion,
        updateStockRequestStatus,
        updateConsultationStatus,
        upsertAgent,
        deleteAgent,
        upsertBlogPost,
        deleteBlogPost,
        upsertCoupon,
        deleteCoupon,
        upsertSitePage,
        deleteSitePage,
        upsertBanner,
        deleteBanner,
        upsertFaq,
        deleteFaq,
        upsertRedirect,
        deleteRedirect,
        updateSettings,
        updateOwnProfile,
        assignAdminRole,
        removeAdminRole,
        seedDatabaseNow,
        dbSynced,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
