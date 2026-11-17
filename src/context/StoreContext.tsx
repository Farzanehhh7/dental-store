import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  testFirestoreConnection,
} from '../lib/firebase';
import {
  SEED_AGENTS,
  SEED_ATTRIBUTES,
  SEED_AUDIT_LOGS,
  SEED_B2B_VERIFICATIONS,
  SEED_BLOG_POSTS,
  SEED_BRANDS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_CATEGORIES,
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
import { resolveVariantPrice } from '../lib/pricing';
import {
  AdminRoleCode,
  AgentBranch,
  AttributeDef,
  AuditLogEntry,
  B2BVerification,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  CartItem,
  Category,
  ConsultationRequest,
  Coupon,
  CurrencyMode,
  CustomerGroupCode,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentPlan,
  Product,
  ProductQuestion,
  ProformaInvoice,
  RedirectRule,
  Review,
  SiteSettings,
  StockRequest,
  SupportTicket,
  UserProfile,
} from '../types/domain';

interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface StoreContextValue {
  // Auth & RBAC
  authUser: User | null;
  authReady: boolean;
  isAdmin: boolean;
  activeAdminRole: AdminRoleCode;
  setActiveAdminRole: (role: AdminRoleCode) => void;
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
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  coupons: Coupon[];
  reviews: Review[];
  questions: ProductQuestion[];
  redirects: RedirectRule[];

  // Operational Data
  orders: Order[];
  proformas: ProformaInvoice[];
  paymentPlans: PaymentPlan[];
  b2bVerifications: B2BVerification[];
  tickets: SupportTicket[];
  stockRequests: StockRequest[];
  consultationRequests: ConsultationRequest[];
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
  verifyOnlinePayment: (orderId: string) => Promise<void>;
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
  }) => Promise<void>;
  submitReview: (productId: string, rating: number, title: string, body: string) => Promise<void>;
  submitQuestion: (productId: string, body: string) => Promise<void>;
  submitStockRequest: (payload: { contactName: string; mobile: string; titleText: string; brandText?: string; description?: string }) => Promise<void>;
  submitConsultation: (payload: { name: string; mobile: string; clinicName?: string; productId?: string; productName?: string; budgetRange?: string; message?: string }) => Promise<void>;
  submitTicket: (payload: { subject: string; department: SupportTicket['department']; priority: SupportTicket['priority']; body: string; orderNo?: string }) => Promise<void>;
  replyTicket: (ticketId: string, body: string, isStaff: boolean) => Promise<void>;

  // Admin Actions
  upsertProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  upsertCategory: (category: Category) => Promise<void>;
  upsertBrand: (brand: Brand) => Promise<void>;
  upsertCampaign: (campaign: Campaign) => Promise<void>;
  adjustVariantStock: (productId: string, variantId: string, delta: number, reason: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus, trackingCode?: string) => Promise<void>;
  reviewB2BVerification: (id: string, status: 'approved' | 'rejected' | 'needs_info', rejectReason?: string) => Promise<void>;
  convertProformaToOrder: (proformaId: string) => Promise<void>;
  updatePaymentPlanStatus: (planId: string, status: PaymentPlan['status'], decisionNote?: string) => Promise<void>;
  moderateReview: (reviewId: string, status: 'approved' | 'rejected') => Promise<void>;
  answerQuestion: (questionId: string, answerBody: string) => Promise<void>;
  updateStockRequestStatus: (id: string, status: StockRequest['status'], adminNote?: string) => Promise<void>;
  updateConsultationStatus: (id: string, status: ConsultationRequest['status']) => Promise<void>;
  upsertBlogPost: (post: BlogPost) => Promise<void>;
  upsertCoupon: (coupon: Coupon) => Promise<void>;
  upsertRedirect: (rule: RedirectRule) => Promise<void>;
  updateSettings: (next: SiteSettings) => Promise<void>;
  updateOwnProfile: (patch: Partial<Pick<UserProfile, 'displayName' | 'mobile' | 'accountType' | 'clinicName' | 'medicalCouncilNo' | 'specialty' | 'addresses'>>) => Promise<void>;
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

function readJsonLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [activeAdminRole, setActiveAdminRole] = useState<AdminRoleCode>('super_admin');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dbSynced, setDbSynced] = useState(false);
  const seededOnceRef = useRef(false);

  const [currency, setCurrencyState] = useState<CurrencyMode>(() => readJsonLS<CurrencyMode>(LS_CURRENCY, 'IRT'));
  const [darkMode, setDarkMode] = useState<boolean>(() => readJsonLS<boolean>(LS_DARK, false));

  // Public datasets initialized from SEED so SSR/first paint is instantaneous, then live-synced from Firestore
  const [settings, setSettings] = useState<SiteSettings>(SEED_SETTINGS);
  const [categories, setCategories] = useState<Category[]>(SEED_CATEGORIES);
  const [brands, setBrands] = useState<Brand[]>(SEED_BRANDS);
  const [attributes, setAttributes] = useState<AttributeDef[]>(SEED_ATTRIBUTES);
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [bundles, setBundles] = useState<Bundle[]>(SEED_BUNDLES);
  const [agents, setAgents] = useState<AgentBranch[]>(SEED_AGENTS);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(SEED_BLOG_POSTS);
  const [coupons, setCoupons] = useState<Coupon[]>(SEED_COUPONS);
  const [reviews, setReviews] = useState<Review[]>(SEED_REVIEWS);
  const [questions, setQuestions] = useState<ProductQuestion[]>(SEED_QUESTIONS);
  const [redirects, setRedirects] = useState<RedirectRule[]>(SEED_REDIRECTS);

  // Operational datasets
  const [orders, setOrders] = useState<Order[]>(SEED_SAMPLE_ORDERS);
  const [proformas, setProformas] = useState<ProformaInvoice[]>(SEED_PROFORMAS);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(SEED_PAYMENT_PLANS);
  const [b2bVerifications, setB2BVerifications] = useState<B2BVerification[]>(SEED_B2B_VERIFICATIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(SEED_TICKETS);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>(SEED_STOCK_REQUESTS);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(SEED_CONSULTATIONS);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(SEED_AUDIT_LOGS);

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

  const setCurrency = (c: CurrencyMode) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, JSON.stringify(c));
  };

  const toggleDarkMode = () => setDarkMode((d) => !d);

  // Startup Firestore connectivity probe
  useEffect(() => {
    testFirestoreConnection().then((ok) => setDbSynced(ok));
  }, []);

  // Auth listener & user profile sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          setIsAdminDoc(adminSnap.exists());
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
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('User profile sync deferred:', err);
        }
      } else {
        setIsAdminDoc(false);
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // User profile snapshot listener
  useEffect(() => {
    if (!authReady || !authUser) return;
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
            b2bStatus: (data.b2bStatus as UserProfile['b2bStatus']) ?? 'none',
            addresses: Array.isArray(data.addresses) ? (data.addresses as UserProfile['addresses']) : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [authReady, authUser]);

  // Public catalog listeners
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const bindCollection = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      fallbackSeed: T[]
    ) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snapshot) => {
          if (!snapshot.empty) {
            const list = snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
            setter(list);
          } else {
            setter(fallbackSeed);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, colName);
        }
      );
      unsubs.push(unsub);
    };

    bindCollection<Category>('categories', setCategories, SEED_CATEGORIES);
    bindCollection<Brand>('brands', setBrands, SEED_BRANDS);
    bindCollection<AttributeDef>('attributes', setAttributes, SEED_ATTRIBUTES);
    bindCollection<Product>('products', setProducts, SEED_PRODUCTS);
    bindCollection<Campaign>('campaigns', setCampaigns, SEED_CAMPAIGNS);
    bindCollection<Bundle>('bundles', setBundles, SEED_BUNDLES);
    bindCollection<AgentBranch>('agents', setAgents, SEED_AGENTS);
    bindCollection<BlogPost>('blogPosts', setBlogPosts, SEED_BLOG_POSTS);
    bindCollection<Coupon>('coupons', setCoupons, SEED_COUPONS);
    bindCollection<RedirectRule>('redirects', setRedirects, SEED_REDIRECTS);

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'site_main'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as SiteSettings);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/site_main')
    );
    unsubs.push(unsubSettings);

    return () => unsubs.forEach((u) => u());
  }, []);

  // Moderated Reviews & Questions listeners (authenticated or approved only)
  useEffect(() => {
    const revQuery = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'approved'));
    const unsubRev = onSnapshot(
      revQuery,
      (snap) => {
        if (!snap.empty) {
          setReviews(snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id })));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const qQuery = isAdmin
      ? collection(db, 'questions')
      : query(collection(db, 'questions'), where('status', '==', 'approved'));
    const unsubQ = onSnapshot(
      qQuery,
      (snap) => {
        if (!snap.empty) {
          setQuestions(snap.docs.map((d) => ({ ...(d.data() as ProductQuestion), id: d.id })));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
    );

    return () => {
      unsubRev();
      unsubQ();
    };
  }, [isAdmin]);

  // Authenticated User & Admin operational listeners
  useEffect(() => {
    if (!authReady || !authUser) return;
    const unsubs: (() => void)[] = [];

    const bindScoped = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      fallbackWhenEmpty?: T[]
    ) => {
      const qRef = isAdmin
        ? collection(db, colName)
        : query(collection(db, colName), where('userId', '==', authUser.uid));
      const unsub = onSnapshot(
        qRef,
        (snap) => {
          if (!snap.empty) {
            setter(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })));
          } else if (fallbackWhenEmpty && isAdmin) {
            setter(fallbackWhenEmpty);
          } else if (!isAdmin) {
            setter([]);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
      unsubs.push(unsub);
    };

    bindScoped<Order>('orders', setOrders, SEED_SAMPLE_ORDERS);
    bindScoped<ProformaInvoice>('proformas', setProformas, SEED_PROFORMAS);
    bindScoped<PaymentPlan>('paymentPlans', setPaymentPlans, SEED_PAYMENT_PLANS);
    bindScoped<B2BVerification>('b2bVerifications', setB2BVerifications, SEED_B2B_VERIFICATIONS);
    bindScoped<SupportTicket>('tickets', setTickets, SEED_TICKETS);
    bindScoped<StockRequest>('stockRequests', setStockRequests, SEED_STOCK_REQUESTS);
    bindScoped<ConsultationRequest>('consultationRequests', setConsultationRequests, SEED_CONSULTATIONS);

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setUsersList(snap.docs.map((d) => d.data() as UserProfile));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            if (!snap.empty) {
              setAuditLogs(
                snap.docs
                  .map((d) => ({ ...(d.data() as AuditLogEntry), id: d.id }))
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              );
            }
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [authReady, authUser, isAdmin]);

  // Seed Firestore automatically once when super admin signs in and products collection is empty
  const seedDatabaseNow = async () => {
    if (!isAdmin) {
      pushToast('برای همگام‌سازی اولیه پایگاه داده، با حساب مدیر وارد شوید.', 'error');
      return;
    }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'site_main'), SEED_SETTINGS);
      SEED_CATEGORIES.forEach((c) => batch.set(doc(db, 'categories', c.id), c));
      SEED_BRANDS.forEach((b) => batch.set(doc(db, 'brands', b.id), b));
      SEED_ATTRIBUTES.forEach((a) => batch.set(doc(db, 'attributes', a.id), a));
      SEED_PRODUCTS.forEach((p) => batch.set(doc(db, 'products', p.id), p));
      SEED_CAMPAIGNS.forEach((cp) => batch.set(doc(db, 'campaigns', cp.id), cp));
      SEED_BUNDLES.forEach((bn) => batch.set(doc(db, 'bundles', bn.id), bn));
      SEED_AGENTS.forEach((ag) => batch.set(doc(db, 'agents', ag.id), ag));
      SEED_BLOG_POSTS.forEach((bp) => batch.set(doc(db, 'blogPosts', bp.id), bp));
      SEED_COUPONS.forEach((cpn) => batch.set(doc(db, 'coupons', cpn.id), cpn));
      SEED_REDIRECTS.forEach((r) => batch.set(doc(db, 'redirects', r.id), r));
      await batch.commit();
      pushToast('کاتالوگ و تنظیمات اولیه با موفقیت در پایگاه داده ثبت شد.', 'success');
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
    if (!authUser || !isAdmin) return;
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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

  // --- Orders & Checkout ---
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت نهایی سفارش ابتدا با حساب کاربری وارد شوید.', 'error');
      return null;
    }
    if (cart.length === 0) return null;

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

    const orderDoc = {
      id: orderId,
      orderNo,
      userId: authUser.uid,
      customerName: payload.customerName,
      customerMobile: payload.customerMobile,
      customerGroup,
      status: (isCreditFlow ? 'awaiting_review' : 'pending_payment') as OrderStatus,
      paymentStatus: (isCreditFlow ? 'pending_credit' : 'unpaid') as Order['paymentStatus'],
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
      return { ...orderDoc, createdAt: now, updatedAt: now };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
    }
  };

  const verifyOnlinePayment = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'paid',
        paymentStatus: 'paid',
        updatedAt: serverTimestamp(),
      });
      pushToast('تراکنش بانکی با موفقیت تأیید و سفارش پرداخت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const cancelOwnOrder = async (orderId: string) => {
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
      pushToast('برای ثبت درخواست پیش‌فاکتور لطفاً وارد حساب شوید.', 'error');
      return null;
    }
    const id = `prf_${Date.now()}`;
    const proformaNo = `PF-1405-${String(Date.now()).slice(-4)}`;
    const subtotal = payload.items.reduce((acc, i) => acc + i.lineTotal, 0);
    const taxTotal = Math.round((subtotal * settings.taxRatePercent) / 100);
    const grandTotal = subtotal + taxTotal;
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const docData = {
      id,
      proformaNo,
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
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        messages: nextMessages,
        status: isStaff ? 'pending_customer' : 'pending_staff',
        updatedAt: serverTimestamp(),
      });
      pushToast('پاسخ ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticketId}`);
    }
  };

  // --- Admin Mutations ---
  const upsertProduct = async (product: Product) => {
    const updated = { ...product, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'products', updated.id), updated);
      await writeAudit('product.upsert', 'product', updated.id, `ذخیره/ویرایش محصول «${updated.titleFa}»`);
      pushToast('محصول با موفقیت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${updated.id}`);
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      await deleteDoc(doc(db, 'products', productId));
      await writeAudit('product.delete', 'product', productId, `حذف محصول ${productId}`);
      pushToast('محصول حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const upsertCategory = async (category: Category) => {
    const updated = { ...category, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'categories', updated.id), updated);
      await writeAudit('category.upsert', 'category', updated.id, `ویرایش دسته‌بندی «${updated.nameFa}»`);
      pushToast('دسته‌بندی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${updated.id}`);
    }
  };

  const upsertBrand = async (brand: Brand) => {
    const updated = { ...brand, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'brands', updated.id), updated);
      await writeAudit('brand.upsert', 'brand', updated.id, `ویرایش برند «${updated.nameFa}»`);
      pushToast('برند ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `brands/${updated.id}`);
    }
  };

  const upsertCampaign = async (campaign: Campaign) => {
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'campaigns', updated.id), updated);
      await writeAudit('campaign.upsert', 'campaign', updated.id, `بروزرسانی کمپین «${updated.nameFa}»`);
      pushToast('کمپین ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${updated.id}`);
    }
  };

  const adjustVariantStock = async (productId: string, variantId: string, delta: number, reason: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const nextVariants = product.variants.map((v) =>
      v.id === variantId ? { ...v, stockOnHand: Math.max(0, v.stockOnHand + delta) } : v
    );
    try {
      await updateDoc(doc(db, 'products', productId), {
        variants: nextVariants,
        updatedAt: new Date().toISOString(),
      });
      await writeAudit('inventory.adjust', 'product', productId, `تعدیل موجودی (${delta > 0 ? `+${delta}` : delta}): ${reason}`);
      pushToast('موجودی انبار بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus, trackingCode?: string) => {
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

  const reviewB2BVerification = async (
    id: string,
    status: 'approved' | 'rejected' | 'needs_info',
    rejectReason?: string
  ) => {
    const item = b2bVerifications.find((b) => b.id === id);
    if (!item) return;
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

  const convertProformaToOrder = async (proformaId: string) => {
    const pf = proformas.find((p) => p.id === proformaId);
    if (!pf) return;
    const orderId = `ord_${Date.now()}`;
    const orderNo = `DM-1405-${String(Date.now()).slice(-5)}`;
    try {
      await setDoc(doc(db, 'orders', orderId), {
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
    try {
      await updateDoc(doc(db, 'reviews', reviewId), { status });
      await writeAudit('review.moderate', 'review', reviewId, `تغییر وضعیت دیدگاه به ${status}`);
      pushToast('وضعیت دیدگاه بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
    }
  };

  const answerQuestion = async (questionId: string, answerBody: string) => {
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
    try {
      await updateDoc(doc(db, 'consultationRequests', id), { status });
      pushToast('وضعیت درخواست مشاوره بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `consultationRequests/${id}`);
    }
  };

  const upsertBlogPost = async (post: BlogPost) => {
    const next = { ...post, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'blogPosts', next.id), next);
      await writeAudit('blog.upsert', 'blogPost', next.id, `ویرایش مقاله «${next.titleFa}»`);
      pushToast('مقاله ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `blogPosts/${next.id}`);
    }
  };

  const upsertCoupon = async (coupon: Coupon) => {
    try {
      await setDoc(doc(db, 'coupons', coupon.id), coupon);
      await writeAudit('coupon.upsert', 'coupon', coupon.id, `ثبت/ویرایش کد تخفیف ${coupon.code}`);
      pushToast('کد تخفیف ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `coupons/${coupon.id}`);
    }
  };

  const upsertRedirect = async (rule: RedirectRule) => {
    try {
      await setDoc(doc(db, 'redirects', rule.id), rule);
      await writeAudit('redirect.upsert', 'redirect', rule.id, `ثبت ریدایرکت ${rule.fromPath} -> ${rule.toPath}`);
      pushToast('قانون ریدایرکت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `redirects/${rule.id}`);
    }
  };

  const updateSettings = async (next: SiteSettings) => {
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
      pushToast('اطلاعات پروفایل و آدرس‌ها بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${authUser.uid}`);
    }
  };

  return (
    <StoreContext.Provider
      value={{
        authUser,
        authReady,
        isAdmin,
        activeAdminRole,
        setActiveAdminRole,
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
        campaigns,
        bundles,
        agents,
        blogPosts,
        coupons,
        reviews,
        questions,
        redirects,
        orders,
        proformas,
        paymentPlans,
        b2bVerifications,
        tickets,
        stockRequests,
        consultationRequests,
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
        cancelOwnOrder,
        requestProforma,
        respondProforma,
        submitB2BVerification,
        submitReview,
        submitQuestion,
        submitStockRequest,
        submitConsultation,
        submitTicket,
        replyTicket,
        upsertProduct,
        deleteProduct,
        upsertCategory,
        upsertBrand,
        upsertCampaign,
        adjustVariantStock,
        updateOrderStatus,
        reviewB2BVerification,
        convertProformaToOrder,
        updatePaymentPlanStatus,
        moderateReview,
        answerQuestion,
        updateStockRequestStatus,
        updateConsultationStatus,
        upsertBlogPost,
        upsertCoupon,
        upsertRedirect,
        updateSettings,
        updateOwnProfile,
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
