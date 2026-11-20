import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  AdminStaffRecord,
  BulkPriceUndoSnapshot,
  StoreContextValue,
  ToastMessage,
} from './storeTypes';
import {
  ADMIN_REQUIRED_MSG,
  LS_CART,
  LS_COMPARE,
  LS_CURRENCY,
  LS_DARK,
  LS_DELETED_IDS,
  LS_GUEST_ORDERS,
  LS_RECENT,
  LS_VERIFIED_PAYMENTS,
  LS_WISHLIST,
  VerifiedPaymentMark,
  applyVerifiedPaymentOverlay,
  commitInChunks,
  mergeById,
  readJsonLS,
  resolveAuthHeaders,
  stripCostFromProduct,
  upsertById,
} from './storeHelpers';
import { useMobileSessionAndRfq } from './useMobileSessionAndRfq';

export type { AdminStaffRecord } from './storeTypes';

const StoreContext = createContext<StoreContextValue | null>(null);

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

  const [rawOrders, setRawOrders] = useState<Order[]>(SEED_SAMPLE_ORDERS);
  const [rawGuestOrders, setRawGuestOrders] = useState<Order[]>(() => readJsonLS<Order[]>(LS_GUEST_ORDERS, []));
  const [verifiedPayments, setVerifiedPayments] = useState<Record<string, VerifiedPaymentMark>>(() =>
    readJsonLS<Record<string, VerifiedPaymentMark>>(LS_VERIFIED_PAYMENTS, {})
  );
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(SEED_INVOICES);
  const [paymentLedger, setPaymentLedger] = useState<PaymentLedgerEntry[]>(SEED_PAYMENT_LEDGER);
  const [returns, setReturns] = useState<ReturnRequest[]>(SEED_RETURNS);
  const [proformas, setProformas] = useState<ProformaInvoice[]>(SEED_PROFORMAS);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(SEED_PAYMENT_PLANS);
  const [b2bVerifications, setB2BVerifications] = useState<B2BVerification[]>(SEED_B2B_VERIFICATIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(SEED_TICKETS);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>(SEED_STOCK_REQUESTS);
  const [stockNotifications, setStockNotifications] = useState<StockNotification[]>(SEED_STOCK_NOTIFICATIONS);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>(
    SEED_NEWSLETTER_SUBSCRIBERS
  );
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(SEED_CONSULTATIONS);
  const [contractPrices, setContractPrices] = useState<ContractPrice[]>(SEED_CONTRACT_PRICES);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(SEED_WAREHOUSES);
  const [suppliers, setSuppliers] = useState<Supplier[]>(SEED_SUPPLIERS);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(SEED_STOCK_MOVEMENTS);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(SEED_AUDIT_LOGS);
  const [bulkPriceUndo, setBulkPriceUndo] = useState<BulkPriceUndoSnapshot | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => readJsonLS<CartItem[]>(LS_CART, []));
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => readJsonLS<string[]>(LS_WISHLIST, []));
  const [compareIds, setCompareIds] = useState<string[]>(() => readJsonLS<string[]>(LS_COMPARE, []));
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_RECENT, []));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Strict RBAC check exclusively backed by Firestore admins/{uid} document (no hardcoded email fallback)
  const isAdmin = useMemo(() => {
    if (!authUser || !authUser.emailVerified) return false;
    return isAdminDoc && actualAdminRole !== null;
  }, [authUser, isAdminDoc, actualAdminRole]);

  const customerGroup: CustomerGroupCode = userProfile?.customerGroup ?? 'retail';

  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  const mobileAndRfq = useMobileSessionAndRfq({
    authUser,
    authReady,
    isAdmin,
    dbSynced,
    pushToast,
    onProformaCreated: (pf) => setProformas((prev) => upsertById(prev, pf)),
  });

  const orders = useMemo(
    () => applyVerifiedPaymentOverlay(rawOrders, verifiedPayments),
    [rawOrders, verifiedPayments]
  );
  const guestOrders = useMemo(
    () => applyVerifiedPaymentOverlay(rawGuestOrders, verifiedPayments),
    [rawGuestOrders, verifiedPayments]
  );
  const mobileOrders = useMemo(
    () => applyVerifiedPaymentOverlay(mobileAndRfq.mobileOrders, verifiedPayments),
    [mobileAndRfq.mobileOrders, verifiedPayments]
  );

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
    localStorage.setItem(LS_GUEST_ORDERS, JSON.stringify(rawGuestOrders));
  }, [rawGuestOrders]);

  useEffect(() => {
    localStorage.setItem(LS_VERIFIED_PAYMENTS, JSON.stringify(verifiedPayments));
  }, [verifiedPayments]);

  const setCurrency = (c: CurrencyMode) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, JSON.stringify(c));
  };

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const [connectionChecked, setConnectionChecked] = useState(false);

  // Authenticated admin-only catalog / pricing / SEO sync to Express server
  useEffect(() => {
    if (!isAdmin || !authUser) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const headers = await resolveAuthHeaders(authUser);
          if (!headers.Authorization) return;
          await fetch('/api/seo/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              categories,
              brands,
              products,
              campaigns,
              bundles,
              agents,
              blogPosts,
              redirects,
              coupons,
              contractPrices,
              settings,
            }),
          });
        } catch {
          // Non-fatal background sync
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [
    isAdmin,
    authUser,
    categories,
    brands,
    products,
    campaigns,
    bundles,
    agents,
    blogPosts,
    redirects,
    coupons,
    contractPrices,
    settings,
  ]);

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

  // Auth listener & Firestore admins/{uid} RBAC verification
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const online = await testFirestoreConnection();
        setDbSynced(online);
        setConnectionChecked(true);

        if (online) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            if (adminSnap.exists()) {
              setIsAdminDoc(true);
              const role = (adminSnap.data()?.role as AdminRoleCode) || 'admin';
              setActualAdminRole(role);
              setActiveAdminRole(role);
            } else {
              setIsAdminDoc(false);
              setActualAdminRole(null);
            }
          } catch {
            setIsAdminDoc(false);
            setActualAdminRole(null);
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
        } else {
          setIsAdminDoc(false);
          setActualAdminRole(null);
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

  // Public catalog sync
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

    bindScoped<Order>('orders', setRawOrders, SEED_SAMPLE_ORDERS);
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
                mergeById(SEED_AUDIT_LOGS, snap.docs.map((d) => ({ ...(d.data() as AuditLogEntry), id: d.id }))).sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
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
            (snap) =>
              setPaymentLedger(
                mergeById(SEED_PAYMENT_LEDGER, snap.docs.map((d) => ({ ...(d.data() as PaymentLedgerEntry), id: d.id })))
              ),
            (err) => handleListenerError(err, OperationType.LIST, 'paymentLedger')
          )
        );
      }
      if (['super_admin', 'admin', 'warehouse', 'sales_mgr', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'warehouses'),
            (snap) =>
              setWarehouses(mergeById(SEED_WAREHOUSES, snap.docs.map((d) => ({ ...(d.data() as Warehouse), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'warehouses')
          ),
          onSnapshot(
            collection(db, 'suppliers'),
            (snap) =>
              setSuppliers(mergeById(SEED_SUPPLIERS, snap.docs.map((d) => ({ ...(d.data() as Supplier), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'suppliers')
          ),
          onSnapshot(
            collection(db, 'stockNotifications'),
            (snap) =>
              setStockNotifications(
                mergeById(SEED_STOCK_NOTIFICATIONS, snap.docs.map((d) => ({ ...(d.data() as StockNotification), id: d.id })))
              ),
            (err) => handleListenerError(err, OperationType.LIST, 'stockNotifications')
          )
        );
      }
      if (['super_admin', 'admin', 'warehouse', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'stockMovements'),
            (snap) =>
              setStockMovements(
                mergeById(SEED_STOCK_MOVEMENTS, snap.docs.map((d) => ({ ...(d.data() as StockMovement), id: d.id })))
              ),
            (err) => handleListenerError(err, OperationType.LIST, 'stockMovements')
          )
        );
      }
      if (['super_admin', 'admin', 'content', 'sales_mgr'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'newsletterSubscribers'),
            (snap) =>
              setNewsletterSubscribers(
                mergeById(
                  SEED_NEWSLETTER_SUBSCRIBERS,
                  snap.docs.map((d) => ({ ...(d.data() as NewsletterSubscriber), id: d.id }))
                )
              ),
            (err) => handleListenerError(err, OperationType.LIST, 'newsletterSubscribers')
          )
        );
      }
      unsubs.push(
        onSnapshot(
          collection(db, 'notFoundLogs'),
          (snap) =>
            setNotFoundLogs(
              mergeById(SEED_NOT_FOUND_LOGS, snap.docs.map((d) => ({ ...(d.data() as NotFoundLog), id: d.id })))
            ),
          (err) => handleListenerError(err, OperationType.LIST, 'notFoundLogs')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin, actualAdminRole, activeAdminRole]);

  const seedDatabaseNow = async () => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) => b.set(doc(db, 'settings', 'site_main'), SEED_SETTINGS));
      EXPANDED_CATEGORIES.forEach((c) => ops.push((b) => b.set(doc(db, 'categories', c.id), c)));
      EXPANDED_BRANDS.forEach((br) => ops.push((b) => b.set(doc(db, 'brands', br.id), br)));
      EXPANDED_ATTRIBUTES.forEach((a) => ops.push((b) => b.set(doc(db, 'attributes', a.id), a)));
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
    pushToast('از حساب گوگل خارج شدید.', 'info');
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
    if (!authUser || !isAdmin) return;
    const id = `aud_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
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

  // --- Orders & Checkout (Authoritative Server Verification + Authenticated Firestore) ---
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    if (cart.length === 0) return null;
    if (userProfile?.isBlocked) {
      pushToast('حساب کاربری شما موقتاً محدود شده است. لطفاً با پشتیبانی تماس بگیرید.', 'error');
      return null;
    }

    const shippingMethodId = payload.shippingMethodId || payload.shippingMethod || 'courier_tehran';

    // 1. Guest OR Mobile-OTP Authenticated Checkout -> Authoritative server calculation & creation
    if (!authUser) {
      try {
        const headers = await resolveAuthHeaders(null, mobileAndRfq.mobileSessionToken);
        const res = await fetch('/api/orders/guest', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            customerName: payload.customerName,
            customerMobile: payload.customerMobile,
            items: cart,
            shippingMethod: shippingMethodId,
            paymentMethod: payload.paymentMethod,
            couponCode: payload.couponCode || '',
            shippingAddress: payload.address,
            customerNote: payload.customerNote,
            verifiedToken: payload.verifiedToken,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok || !data.order) {
          pushToast(data?.message || 'ثبت سفارش با خطا مواجه شد.', 'error');
          return null;
        }
        const serverOrder = data.order as Order;
        setRawGuestOrders((prev) => [serverOrder, ...prev.filter((o) => o.id !== serverOrder.id)]);
        await mobileAndRfq.refreshMobileOrders();
        trackEcommerceEvent('begin_checkout', {
          orderNo: serverOrder.orderNo,
          grandTotal: serverOrder.grandTotal,
          items: serverOrder.items.length,
        });
        clearCart();
        pushToast(`سفارش ${serverOrder.orderNo} با محاسبه قطعی سرور ثبت شد.`, 'success');
        return serverOrder;
      } catch {
        pushToast('ارتباط با سرور برای تایید قیمت و ثبت سفارش برقرار نشد.', 'error');
        return null;
      }
    }

    // 2. Firebase Authenticated Checkout -> Validate via authoritative /api/checkout/calculate first
    let calcItems: OrderItem[] = [];
    let subtotal = 0;
    let discountTotal = 0;
    let effectiveShipping = payload.shippingTotal;
    let taxTotal = 0;
    let grandTotal = 0;

    try {
      const calcRes = await fetch('/api/checkout/calculate', {
        method: 'POST',
        headers: await resolveAuthHeaders(authUser, mobileAndRfq.mobileSessionToken),
        body: JSON.stringify({
          items: cart,
          customerGroup,
          couponCode: payload.couponCode || '',
          shippingMethod: shippingMethodId,
          userId: authUser.uid,
        }),
      });
      const calcJson = await calcRes.json();
      if (!calcRes.ok || !calcJson?.ok) {
        pushToast(calcJson?.message || 'اعتبارسنجی سبد خرید ناموفق بود.', 'error');
        return null;
      }
      calcItems = calcJson.items as OrderItem[];
      subtotal = calcJson.subtotal;
      discountTotal = calcJson.discountTotal;
      effectiveShipping = calcJson.shippingTotal;
      taxTotal = calcJson.taxTotal;
      grandTotal = calcJson.grandTotal;
    } catch {
      pushToast('خطا در محاسبه قطعی سفارش روی سرور.', 'error');
      return null;
    }

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
      userId: authUser.uid,
      isGuest: false,
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
      items: calcItems,
      createdAt: now,
      updatedAt: now,
    };

    trackEcommerceEvent('begin_checkout', { orderNo, grandTotal, items: calcItems.length });

    try {
      await setDoc(doc(db, 'orders', orderId), {
        ...orderBase,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

  const verifyOnlinePayment = async (orderId: string, gateway = 'zarinpal'): Promise<boolean> => {
    const targetOrder =
      orders.find((o) => o.id === orderId) ||
      guestOrders.find((o) => o.id === orderId) ||
      mobileOrders.find((o) => o.id === orderId);
    const orderNo = targetOrder?.orderNo ?? orderId;

    try {
      const headers = await resolveAuthHeaders(authUser, mobileAndRfq.mobileSessionToken);
      const initRes = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          orderNo,
          gateway,
          idempotencyKey: `IDEMP-${orderId}`,
        }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.ok) {
        pushToast(initJson?.message || 'ایجاد نشست پرداخت درگاه ناموفق بود.', 'error');
        return false;
      }

      const authority = initJson?.session?.authority;
      const sandboxToken = initJson?.sandboxToken;

      if (initJson.mode === 'live' && initJson.redirectUrl && !sandboxToken) {
        pushToast('در حال انتقال به درگاه پرداخت بانکی...', 'info');
        window.location.href = String(initJson.redirectUrl);
        return false;
      }

      const verRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ authority, status: 'OK', sandboxToken }),
      });
      const verJson = await verRes.json();
      if (!verRes.ok || !verJson?.ok) {
        pushToast(verJson?.message || 'تایید تراکنش پرداخت بانکی ناموفق بود.', 'error');
        return false;
      }

      setVerifiedPayments((prev) => ({
        ...prev,
        [orderId]: {
          refId: verJson.refId ? String(verJson.refId) : undefined,
          paidAt: new Date().toISOString(),
        },
      }));

      setRawGuestOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'paid', paymentStatus: 'paid', updatedAt: new Date().toISOString() } : o
        )
      );

      if (verJson?.ledgerEntry) {
        setPaymentLedger((prev) => upsertById(prev, verJson.ledgerEntry as PaymentLedgerEntry));
        if (isAdmin && authUser) {
          await setDoc(doc(db, 'paymentLedger', verJson.ledgerEntry.id), verJson.ledgerEntry).catch(() => {});
        }
      }

      trackEcommerceEvent('purchase', {
        transaction_id: orderNo,
        value: targetOrder?.grandTotal ?? 0,
        currency: 'IRR',
      });
      pushToast(`پرداخت آنلاین با کد رهگیری ${verJson?.refId || 'تاییدشده'} ثبت شد.`, 'success');
      return true;
    } catch {
      pushToast('خطا در تایید تراکنش بانکی.', 'error');
      return false;
    }
  };

  const lookupGuestOrder = async (orderNo: string, mobile: string): Promise<Order | null> => {
    try {
      const res = await fetch(
        `/api/orders/track?orderNo=${encodeURIComponent(orderNo.trim())}&mobile=${encodeURIComponent(mobile.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.order) return data.order as Order;
      }
    } catch {
      // Fallback below
    }
    return guestOrders.find((o) => o.orderNo === orderNo.trim()) ?? null;
  };

  const cancelOwnOrder = async (orderId: string) => {
    const guestMatch = rawGuestOrders.find((o) => o.id === orderId);
    if (guestMatch) {
      setRawGuestOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled', updatedAt: new Date().toISOString() } : o))
      );
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
      pushToast('برای ثبت پیش‌فاکتور رسمی لطفاً با حساب گوگل وارد شوید.', 'error');
      return null;
    }
    const id = `prf_${Date.now()}`;
    const proformaNo = `PF-1405-${String(Date.now()).slice(-4)}`;
    const shareToken = `pf-${crypto.randomUUID().slice(0, 12)}`;
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
      pushToast('ابتدا وارد حساب کاربری گوگل شوید.', 'error');
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
    if (isStaff && !isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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

  // --- Strict Admin Mutations (Fail Closed: Zero Local Fallback When !isAdmin) ---
  const upsertProduct = async (product: Product, costMap?: Record<string, number>) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const cleaned = stripCostFromProduct({ ...product, updatedAt: new Date().toISOString() });
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'products', productId)).catch(() => {});
      markIdDeleted(productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      await writeAudit('product.delete', 'product', productId, `حذف محصول ${productId}`);
      pushToast('محصول حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const upsertCategory = async (category: Category) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...category, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'categories', updated.id), updated);
      await writeAudit('category.upsert', 'category', updated.id, `ویرایش دسته‌بندی «${updated.nameFa}»`);
      pushToast('دسته‌بندی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${updated.id}`);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    if (products.some((p) => p.primaryCategoryId === categoryId) || categories.some((c) => c.parentId === categoryId)) {
      pushToast('این دسته‌بندی دارای زیرمجموعه یا کالای فعال است و نمی‌توان آن را حذف کرد.', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'categories', categoryId)).catch(() => {});
      markIdDeleted(categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      await writeAudit('category.delete', 'category', categoryId, `حذف دسته‌بندی ${categoryId}`);
      pushToast('دسته‌بندی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
    }
  };

  const upsertBrand = async (brand: Brand) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...brand, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'brands', updated.id), updated);
      await writeAudit('brand.upsert', 'brand', updated.id, `ویرایش برند «${updated.nameFa}»`);
      pushToast('برند ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `brands/${updated.id}`);
    }
  };

  const deleteBrand = async (brandId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'brands', brandId)).catch(() => {});
      markIdDeleted(brandId);
      setBrands((prev) => prev.filter((b) => b.id !== brandId));
      await writeAudit('brand.delete', 'brand', brandId, `حذف برند ${brandId}`);
      pushToast('برند حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `brands/${brandId}`);
    }
  };

  const upsertAttribute = async (attr: AttributeDef) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...attr, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'attributes', updated.id), updated);
      await writeAudit('attribute.upsert', 'attribute', updated.id, `ویرایش ویژگی «${updated.labelFa}»`);
      pushToast('ویژگی فنی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attributes/${updated.id}`);
    }
  };

  const deleteAttribute = async (attrId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'attributes', attrId)).catch(() => {});
      markIdDeleted(attrId);
      setAttributes((prev) => prev.filter((a) => a.id !== attrId));
      pushToast('ویژگی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `attributes/${attrId}`);
    }
  };

  const upsertBundle = async (bundle: Bundle) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...bundle, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'bundles', updated.id), updated);
      await writeAudit('bundle.upsert', 'bundle', updated.id, `بروزرسانی پکیج «${updated.nameFa}»`);
      pushToast('پکیج / باندل ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bundles/${updated.id}`);
    }
  };

  const deleteBundle = async (bundleId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'bundles', bundleId)).catch(() => {});
      markIdDeleted(bundleId);
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      pushToast('پکیج حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bundles/${bundleId}`);
    }
  };

  const upsertCampaign = async (campaign: Campaign) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'campaigns', updated.id), updated);
      await writeAudit('campaign.upsert', 'campaign', updated.id, `بروزرسانی کمپین «${updated.nameFa}»`);
      pushToast('کمپین ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${updated.id}`);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'campaigns', campaignId)).catch(() => {});
      markIdDeleted(campaignId);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      await writeAudit('campaign.delete', 'campaign', campaignId, `حذف کمپین ${campaignId}`);
      pushToast('کمپین حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `campaigns/${campaignId}`);
    }
  };

  const upsertContractPrice = async (contract: ContractPrice) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
    if (ops.length > 0) await commitInChunks(ops, 250);
    await writeAudit('pricing.bulk_adjust', 'products', scopeId || 'all', `اصلاح گروهی قیمت ${percent}٪ (${targets.length} کالا)`);
    pushToast(`قیمت ${targets.length} محصول بروزرسانی شد (امکان بازگشت وجود دارد).`, 'success');
  };

  const undoBulkPriceAdjustment = async () => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
    if (ops.length > 0) await commitInChunks(ops, 250);
    setBulkPriceUndo(null);
    pushToast('تغییرات قیمت گروهی به حالت قبل بازگردانده شد.', 'info');
  };

  const adjustVariantStock = async (
    productId: string,
    variantId: string,
    delta: number,
    reason: string,
    warehouseCode = 'TEH-CENTRAL',
    type: StockMovement['type'] = 'adjust'
  ) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
      actorEmail: authUser?.email ?? 'admin@dentalmarket.ir',
      createdAt: now,
    };
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return null;
    }
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'paymentLedger', entry.id), entry);
      if (entry.status === 'verified') {
        await updateDoc(doc(db, 'orders', entry.orderId), {
          paymentStatus: 'paid',
          status: 'paid',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else if (entry.status === 'refunded') {
        await updateDoc(doc(db, 'orders', entry.orderId), {
          paymentStatus: 'refunded',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      pushToast('سند پرداخت در دفترکل مالی ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `paymentLedger/${entry.id}`);
    }
  };

  const updateReturnStatus = async (id: string, status: ReturnRequest['status'], adminNote?: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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

  const updateUserAdmin: StoreContextValue['updateUserAdmin'] = async (uid, patch) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...proforma, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'proformas', proforma.id), next);
      await writeAudit('proforma.upsert', 'proforma', proforma.id, `بروزرسانی پیش‌فاکتور ${proforma.proformaNo}`);
      pushToast('پیش‌فاکتور بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `proformas/${proforma.id}`);
    }
  };

  const convertProformaToOrder = async (proformaId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...agent, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'agents', next.id), next);
      await writeAudit('agent.upsert', 'agent', next.id, `ثبت/ویرایش نمایندگی «${next.nameFa}»`);
      pushToast('نمایندگی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `agents/${next.id}`);
    }
  };

  const deleteAgent = async (agentId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(agentId);
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    await deleteDoc(doc(db, 'agents', agentId)).catch(() => {});
    pushToast('نمایندگی حذف شد.', 'info');
  };

  const upsertBlogPost = async (post: BlogPost) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...post, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'blogPosts', next.id), next);
      await writeAudit('blog.upsert', 'blogPost', next.id, `ویرایش مقاله «${next.titleFa}»`);
      pushToast('مقاله ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `blogPosts/${next.id}`);
    }
  };

  const deleteBlogPost = async (postId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(postId);
    setBlogPosts((prev) => prev.filter((p) => p.id !== postId));
    await deleteDoc(doc(db, 'blogPosts', postId)).catch(() => {});
    pushToast('مقاله حذف شد.', 'info');
  };

  const upsertCoupon = async (coupon: Coupon) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(couponId);
    setCoupons((prev) => prev.filter((c) => c.id !== couponId));
    await deleteDoc(doc(db, 'coupons', couponId)).catch(() => {});
    pushToast('کد تخفیف حذف شد.', 'info');
  };

  const upsertSitePage = async (page: SitePage) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...page, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'pages', next.id), next);
      pushToast('صفحه اطلاع‌رسانی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `pages/${next.id}`);
    }
  };

  const deleteSitePage = async (pageId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(pageId);
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    await deleteDoc(doc(db, 'pages', pageId)).catch(() => {});
    pushToast('صفحه حذف شد.', 'info');
  };

  const upsertBanner = async (banner: BannerItem) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const cleanBanner = Object.fromEntries(
      Object.entries(banner).filter(([, value]) => value !== undefined)
    ) as BannerItem;
    try {
      await setDoc(doc(db, 'banners', cleanBanner.id), cleanBanner);
      setBanners((prev) => {
        const exists = prev.some((item) => item.id === cleanBanner.id);
        return exists
          ? prev.map((item) => (item.id === cleanBanner.id ? cleanBanner : item))
          : [...prev, cleanBanner];
      });
      pushToast('بنر تبلیغاتی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `banners/${cleanBanner.id}`);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(bannerId);
    setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    await deleteDoc(doc(db, 'banners', bannerId)).catch(() => {});
    pushToast('بنر حذف شد.', 'info');
  };

  const upsertFaq = async (faq: FaqItem) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(faqId);
    setFaqs((prev) => prev.filter((f) => f.id !== faqId));
    await deleteDoc(doc(db, 'faqs', faqId)).catch(() => {});
    pushToast('سوال حذف شد.', 'info');
  };

  const upsertRedirect = async (rule: RedirectRule) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(ruleId);
    setRedirects((prev) => prev.filter((r) => r.id !== ruleId));
    await deleteDoc(doc(db, 'redirects', ruleId)).catch(() => {});
    pushToast('ریدایرکت حذف شد.', 'info');
  };

  const updateSettings = async (next: SiteSettings) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
      pushToast(ADMIN_REQUIRED_MSG, 'error');
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
        mobileSession: mobileAndRfq.mobileSession,
        mobileSessionToken: mobileAndRfq.mobileSessionToken,
        mobileOrders,
        sendMobileOtp: mobileAndRfq.sendMobileOtp,
        verifyMobileOtp: mobileAndRfq.verifyMobileOtp,
        logoutMobile: mobileAndRfq.logoutMobile,
        refreshMobileOrders: mobileAndRfq.refreshMobileOrders,
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
        rfqs: mobileAndRfq.rfqs,
        refreshRfqs: mobileAndRfq.refreshRfqs,
        submitRfq: mobileAndRfq.submitRfq,
        sendRfqMessage: mobileAndRfq.sendRfqMessage,
        quoteRfq: mobileAndRfq.quoteRfq,
        respondRfq: mobileAndRfq.respondRfq,
        convertRfqToProforma: mobileAndRfq.convertRfqToProforma,
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
