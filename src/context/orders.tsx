import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { bindScopedCollection } from '../lib/firestoreStore';
import { trackEcommerceEvent } from '../lib/analytics';
import {
  SEED_CONSULTATIONS,
  SEED_PAYMENT_PLANS,
} from '../data/seed';
import { SEED_INVOICES } from '../data/expandedCatalog';
import type {
  ConsultationRequest,
  InvoiceRecord,
  Order,
  OrderStatus,
  PaymentLedgerEntry,
  PaymentPlan,
  ProformaInvoice,
  ReturnRequest,
} from '../types/domain';
import type { AdminOrdersMeta, AdminOrdersQuery, StoreContextValue } from './storeTypes';
import {
  ADMIN_REQUIRED_MSG,
  getGuestOrderToken,
  resolveAuthHeaders,
  saveGuestOrderToken,
  upsertById,
} from './storeHelpers';
import { useAuth } from './auth';
import { useCatalog } from './catalog';
import { useContent } from './content';
import { useCart } from './cart';
import { useRfq } from './rfq';

export interface OrdersContextValue {
  orders: Order[];
  guestOrders: Order[];
  mobileOrders: Order[];
  adminOrdersMeta: AdminOrdersMeta;
  adminOrdersLoading: boolean;
  fetchAdminOrders: (query?: AdminOrdersQuery) => Promise<void>;
  invoices: InvoiceRecord[];
  paymentLedger: PaymentLedgerEntry[];
  returns: ReturnRequest[];
  proformas: ProformaInvoice[];
  paymentPlans: PaymentPlan[];
  consultationRequests: ConsultationRequest[];
  placeOrder: StoreContextValue['placeOrder'];
  verifyOnlinePayment: StoreContextValue['verifyOnlinePayment'];
  fetchOrderPaymentStatus: StoreContextValue['fetchOrderPaymentStatus'];
  lookupGuestOrder: StoreContextValue['lookupGuestOrder'];
  cancelOwnOrder: StoreContextValue['cancelOwnOrder'];
  requestProforma: StoreContextValue['requestProforma'];
  respondProforma: StoreContextValue['respondProforma'];
  submitReturnRequest: StoreContextValue['submitReturnRequest'];
  submitConsultation: StoreContextValue['submitConsultation'];
  updateConsultationStatus: StoreContextValue['updateConsultationStatus'];
  updateOrderStatus: StoreContextValue['updateOrderStatus'];
  createManualOrder: StoreContextValue['createManualOrder'];
  issueInvoice: StoreContextValue['issueInvoice'];
  voidInvoice: StoreContextValue['voidInvoice'];
  recordPaymentEntry: StoreContextValue['recordPaymentEntry'];
  updateReturnStatus: StoreContextValue['updateReturnStatus'];
  processReturnAdmin: StoreContextValue['processReturnAdmin'];
  upsertProformaAdmin: StoreContextValue['upsertProformaAdmin'];
  convertProformaToOrder: StoreContextValue['convertProformaToOrder'];
  updatePaymentPlanStatus: StoreContextValue['updatePaymentPlanStatus'];
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const {
    authUser,
    authReady,
    isAdmin,
    actualAdminRole,
    activeAdminRole,
    userProfile,
    usersList,
    customerGroup,
    dbSynced,
    connectionChecked,
    pushToast,
    writeAudit,
  } = useAuth();
  const { refreshInventory } = useCatalog();
  const { settings, registerOrderPurchaseChecker } = useContent();
  const { cart, clearCart } = useCart();
  const {
    mobileSession,
    mobileSessionToken,
    rawMobileOrders,
    refreshMobileOrders,
    registerProformaCreatedListener,
  } = useRfq();

  const [orders, setOrders] = useState<Order[]>([]);
  const [guestOrders, setGuestOrders] = useState<Order[]>([]);
  const [adminOrdersMeta, setAdminOrdersMeta] = useState<AdminOrdersMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const lastAdminQueryRef = useRef<AdminOrdersQuery>({ page: 1, limit: 20 });

  const [invoices, setInvoices] = useState<InvoiceRecord[]>(SEED_INVOICES);
  const [paymentLedger, setPaymentLedger] = useState<PaymentLedgerEntry[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [proformas, setProformas] = useState<ProformaInvoice[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(SEED_PAYMENT_PLANS);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(SEED_CONSULTATIONS);

  const mobileOrders = useMemo(() => rawMobileOrders, [rawMobileOrders]);

  useEffect(() => {
    registerProformaCreatedListener((pf) => setProformas((prev) => upsertById(prev, pf)));
  }, [registerProformaCreatedListener]);

  useEffect(() => {
    registerOrderPurchaseChecker((uid, productId) =>
      orders.some((o) => o.userId === uid && o.items.some((i) => i.productId === productId))
    );
  }, [orders, registerOrderPurchaseChecker]);

  const fetchMyOrders = useCallback(async () => {
    if (!authUser) return;
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/orders/mine', { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as Order[]);
      }
    } catch {
      // Ignore transient network errors
    }
  }, [authUser, mobileSessionToken]);

  const fetchAdminOrders = useCallback(
    async (query?: AdminOrdersQuery) => {
      if (!isAdmin || !authUser) return;
      const effective: AdminOrdersQuery = {
        ...lastAdminQueryRef.current,
        ...(query ?? {}),
      };
      lastAdminQueryRef.current = effective;
      const qs = new URLSearchParams();
      if (effective.page) qs.set('page', String(effective.page));
      if (effective.limit) qs.set('limit', String(effective.limit));
      if (effective.status) qs.set('status', effective.status);
      if (effective.source) qs.set('source', effective.source);
      if (effective.q) qs.set('q', effective.q);
      if (effective.fromDate) qs.set('fromDate', effective.fromDate);
      if (effective.toDate) qs.set('toDate', effective.toDate);

      setAdminOrdersLoading(true);
      try {
        const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
        const res = await fetch(`/api/admin/orders?${qs.toString()}`, {
          headers,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.orders)) {
          setOrders(data.orders as Order[]);
          setAdminOrdersMeta({
            total: Number(data.total ?? data.orders.length),
            page: Number(data.page ?? effective.page ?? 1),
            limit: Number(data.limit ?? effective.limit ?? 20),
            totalPages: Math.max(1, Number(data.totalPages ?? 1)),
          });
        }
      } catch {
        // Ignore transient fetch errors
      } finally {
        setAdminOrdersLoading(false);
      }
    },
    [authUser, isAdmin, mobileSessionToken]
  );

  const fetchProformas = useCallback(async () => {
    if (!authUser && !mobileSession && !mobileSessionToken) {
      setProformas([]);
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/proformas', { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.proformas)) {
        setProformas(data.proformas as ProformaInvoice[]);
      }
    } catch {
      // Ignore transient errors
    }
  }, [authUser, mobileSession, mobileSessionToken]);

  const fetchServerLedger = useCallback(async () => {
    const roleEffective = actualAdminRole ?? activeAdminRole;
    if (!isAdmin || !authUser || !['super_admin', 'admin', 'accountant', 'sales_mgr'].includes(roleEffective)) {
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/payments/ledger', { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.entries)) {
        setPaymentLedger(data.entries as PaymentLedgerEntry[]);
      }
    } catch {
      // Ignore transient errors
    }
  }, [actualAdminRole, activeAdminRole, authUser, isAdmin, mobileSessionToken]);

  const fetchReturns = useCallback(async () => {
    if (!authUser && !mobileSession && !mobileSessionToken) {
      setReturns([]);
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/returns', { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.returns)) {
        setReturns(data.returns as ReturnRequest[]);
      }
    } catch {
      // Ignore transient errors
    }
  }, [authUser, mobileSession, mobileSessionToken]);

  // Load authoritative server orders, proformas, returns, and ledger
  useEffect(() => {
    if (!authReady) return;
    if (isAdmin && authUser) {
      void fetchAdminOrders({ page: 1, limit: 20 });
      void fetchServerLedger();
    } else if (authUser) {
      void fetchMyOrders();
    } else {
      setOrders([]);
    }
    void fetchProformas();
    void fetchReturns();
  }, [authReady, authUser, isAdmin, fetchAdminOrders, fetchMyOrders, fetchProformas, fetchReturns, fetchServerLedger]);

  // Firestore listeners only for auxiliary collections (invoices, paymentPlans, consultations — NOT orders or returns)
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const unsubs: (() => void)[] = [
      bindScopedCollection<InvoiceRecord>('invoices', setInvoices, isAdmin, authUser.uid, SEED_INVOICES),
      bindScopedCollection<PaymentPlan>('paymentPlans', setPaymentPlans, isAdmin, authUser.uid, SEED_PAYMENT_PLANS),
      bindScopedCollection<ConsultationRequest>(
        'consultationRequests',
        setConsultationRequests,
        isAdmin,
        authUser.uid,
        SEED_CONSULTATIONS
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin]);

  const syncOrderIntoLocalLists = useCallback((updated: Order) => {
    setOrders((prev) => upsertById(prev, updated));
    setGuestOrders((prev) => (prev.some((o) => o.id === updated.id) ? upsertById(prev, updated) : prev));
  }, []);

  // --- Orders & Checkout (Single Source of Truth on Express Server) ---
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    if (cart.length === 0) return null;
    if (userProfile?.isBlocked) {
      pushToast('حساب کاربری شما موقتاً محدود شده است. لطفاً با پشتیبانی تماس بگیرید.', 'error');
      return null;
    }

    const shippingMethodId = payload.shippingMethodId || payload.shippingMethod || 'courier_tehran';
    const idempotencyKey = `ORD-${crypto.randomUUID()}`;

    const endpoint = authUser ? '/api/orders' : '/api/orders/guest';
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      headers['Idempotency-Key'] = idempotencyKey;

      const res = await fetch(endpoint, {
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
          idempotencyKey,
          ...(!authUser && payload.verifiedToken ? { verifiedToken: payload.verifiedToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.order) {
        pushToast(data?.message || 'ثبت سفارش با خطا مواجه شد.', 'error');
        return null;
      }
      const serverOrder = data.order as Order;
      if (typeof data.orderToken === 'string' && data.orderToken) {
        saveGuestOrderToken(serverOrder.id, data.orderToken);
      }

      if (authUser) {
        setOrders((prev) => upsertById(prev, serverOrder));
        const isCreditFlow =
          payload.paymentMethod === 'credit_request' ||
          payload.paymentMethod === 'cheque_request' ||
          payload.paymentMethod === 'installment_request';
        if (isCreditFlow && dbSynced) {
          const planId = `pp_${Date.now()}`;
          const planType: PaymentPlan['type'] =
            payload.paymentMethod === 'cheque_request'
              ? 'cheque'
              : payload.paymentMethod === 'installment_request'
              ? 'installment'
              : 'credit';
          await setDoc(doc(db, 'paymentPlans', planId), {
            id: planId,
            orderId: serverOrder.id,
            userId: authUser.uid,
            customerName: payload.customerName,
            type: planType,
            requestedAmount: serverOrder.grandTotal,
            installmentsCount: payload.installmentsCount ?? 3,
            proposedTermsFa: payload.proposedTermsFa || 'درخواست تسویه اعتباری / چکی',
            status: 'submitted',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } else {
        setGuestOrders((prev) => upsertById(prev, serverOrder));
        await refreshMobileOrders();
      }

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
  };

  const verifyOnlinePayment = async (orderId: string, gateway = 'zarinpal'): Promise<boolean> => {
    const targetOrder =
      orders.find((o) => o.id === orderId) ||
      guestOrders.find((o) => o.id === orderId) ||
      mobileOrders.find((o) => o.id === orderId);
    const orderNo = targetOrder?.orderNo ?? orderId;
    const orderToken = getGuestOrderToken(orderId);

    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      if (orderToken) headers['X-Order-Token'] = orderToken;
      const attemptKey = `PAY-${orderId}-${crypto.randomUUID().slice(0, 8)}`;

      const initRes = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': attemptKey },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          orderNo,
          gateway,
          idempotencyKey: attemptKey,
          ...(orderToken ? { orderToken } : {}),
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

      if (verJson.order) {
        syncOrderIntoLocalLists(verJson.order as Order);
      }
      if (verJson.ledgerEntry) {
        setPaymentLedger((prev) => upsertById(prev, verJson.ledgerEntry as PaymentLedgerEntry));
      }

      await Promise.all([
        authUser ? (isAdmin ? fetchAdminOrders() : fetchMyOrders()) : Promise.resolve(),
        refreshMobileOrders(),
        isAdmin ? fetchServerLedger() : Promise.resolve(),
      ]);

      trackEcommerceEvent('purchase', {
        transaction_id: orderNo,
        value: verJson.verifiedOrder?.amount ?? targetOrder?.grandTotal ?? 0,
        currency: 'IRR',
      });
      pushToast(`پرداخت آنلاین با کد رهگیری ${verJson?.refId || 'تاییدشده'} ثبت شد.`, 'success');
      return true;
    } catch {
      pushToast('خطا در تایید تراکنش بانکی.', 'error');
      return false;
    }
  };

  const fetchOrderPaymentStatus: StoreContextValue['fetchOrderPaymentStatus'] = async (orderId) => {
    const orderToken = getGuestOrderToken(orderId);
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      if (orderToken) headers['X-Order-Token'] = orderToken;
      const qs = orderToken ? `?orderToken=${encodeURIComponent(orderToken)}` : '';
      const res = await fetch(`/api/payments/status/${encodeURIComponent(orderId)}${qs}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        return {
          ok: false,
          paid: false,
          message: data?.message || 'امکان استعلام وضعیت پرداخت سفارش وجود ندارد.',
        };
      }
      if (data.order) {
        syncOrderIntoLocalLists(data.order as Order);
      }
      return {
        ok: true,
        paid: Boolean(data.paid),
        order: data.order as Order | undefined,
        refId: data.verifiedOrder?.refId ? String(data.verifiedOrder.refId) : undefined,
        gateway: data.verifiedOrder?.gateway ? String(data.verifiedOrder.gateway) : undefined,
        verifiedAt: data.verifiedOrder?.verifiedAt ? String(data.verifiedOrder.verifiedAt) : undefined,
      };
    } catch {
      return { ok: false, paid: false, message: 'خطا در ارتباط با سرور برای بررسی وضعیت پرداخت.' };
    }
  };

  const lookupGuestOrder = async (orderNo: string, mobile: string): Promise<Order | null> => {
    try {
      const res = await fetch(
        `/api/orders/track?orderNo=${encodeURIComponent(orderNo.trim())}&mobile=${encodeURIComponent(mobile.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.order) {
          syncOrderIntoLocalLists(data.order as Order);
          return data.order as Order;
        }
      }
    } catch {
      // Ignore network errors
    }
    return guestOrders.find((o) => o.orderNo === orderNo.trim()) ?? null;
  };

  const cancelOwnOrder = async (orderId: string) => {
    const orderToken = getGuestOrderToken(orderId);
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      if (orderToken) headers['X-Order-Token'] = orderToken;
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          ...(orderToken ? { orderToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'لغو سفارش امکان‌پذیر نیست.', 'error');
        return;
      }
      if (data.order) {
        syncOrderIntoLocalLists(data.order as Order);
      }
      await refreshMobileOrders();
      pushToast('سفارش با موفقیت لغو شد و موجودی رزروشده آزاد گردید.', 'info');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام لغو سفارش.', 'error');
    }
  };

  const requestProforma: StoreContextValue['requestProforma'] = async (payload) => {
    if (!authUser && !mobileSession && !mobileSessionToken) {
      pushToast('برای ثبت پیش‌فاکتور رسمی لطفاً وارد حساب کاربری یا نشست موبایلی شوید.', 'error');
      return null;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/proformas', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          contactName: payload.contactName,
          contactMobile: payload.contactMobile,
          clinicName: payload.clinicName,
          termsFa: payload.termsFa,
          customerGroup,
          items: payload.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.proforma) {
        pushToast(data?.message || 'ثبت پیش‌فاکتور ناموفق بود.', 'error');
        return null;
      }
      const created = data.proforma as ProformaInvoice;
      setProformas((prev) => upsertById(prev, created));
      pushToast(`پیش‌فاکتور ${created.proformaNo} با محاسبه قطعی سرور ثبت شد.`, 'success');
      return created;
    } catch {
      pushToast('خطا در ارتباط با سرور برای صدور پیش‌فاکتور.', 'error');
      return null;
    }
  };

  const respondProforma = async (proformaId: string, status: 'accepted' | 'rejected') => {
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/proformas/${encodeURIComponent(proformaId)}/respond`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'بروزرسانی وضعیت پیش‌فاکتور ناموفق بود.', 'error');
        return;
      }
      if (data.proforma) {
        setProformas((prev) => upsertById(prev, data.proforma as ProformaInvoice));
      }
      pushToast(status === 'accepted' ? 'پیش‌فاکتور تأیید شد.' : 'پیش‌فاکتور رد شد.', 'success');
    } catch {
      pushToast('خطا در ارسال پاسخ پیش‌فاکتور.', 'error');
    }
  };

  const submitReturnRequest: StoreContextValue['submitReturnRequest'] = async (payload) => {
    const orderToken = getGuestOrderToken(payload.orderId);
    if (!authUser && !mobileSession && !mobileSessionToken && !orderToken) {
      pushToast('برای ثبت مرجوعی وارد حساب کاربری شوید.', 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      if (orderToken) headers['X-Order-Token'] = orderToken;
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          orderId: payload.orderId,
          items: payload.items,
          reasonFa: payload.reasonFa,
          resolution: payload.resolution,
          refundAmount: payload.refundAmount,
          ...(orderToken ? { orderToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.returnRequest) {
        pushToast(data?.message || 'ثبت درخواست مرجوعی ناموفق بود.', 'error');
        return;
      }
      const created = data.returnRequest as ReturnRequest;
      setReturns((prev) => upsertById(prev, created));
      if (isAdmin && authUser) {
        await fetchAdminOrders();
      } else if (authUser) {
        await fetchMyOrders();
      } else {
        await refreshMobileOrders();
      }
      pushToast(`درخواست مرجوعی ${created.returnNo} ثبت شد.`, 'success');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام ثبت درخواست مرجوعی.', 'error');
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

  const updateOrderStatus = async (orderId: string, status: OrderStatus, trackingCode?: string) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status, trackingCode }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.order) {
        pushToast(data?.message || 'تغییر وضعیت سفارش نامعتبر است.', 'error');
        return;
      }
      syncOrderIntoLocalLists(data.order as Order);
      await writeAudit('order.status_change', 'order', orderId, `تغییر وضعیت سفارش به ${status}`);
      pushToast('وضعیت سفارش بروزرسانی شد.', 'success');
    } catch {
      pushToast('خطا در تغییر وضعیت سفارش.', 'error');
    }
  };

  const createManualOrder: StoreContextValue['createManualOrder'] = async (payload) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return null;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const idempotencyKey = `MAN-${crypto.randomUUID()}`;
      headers['Idempotency-Key'] = idempotencyKey;

      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          customerName: payload.customerName,
          customerMobile: payload.customerMobile,
          customerGroup: payload.customerGroup,
          paymentMethod: payload.paymentMethod,
          shippingMethod: payload.shippingMethod,
          shippingAddress: payload.address,
          items: payload.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
          })),
          customerNote: payload.customerNote,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.order) {
        pushToast(data?.message || 'ثبت سفارش دستی ناموفق بود.', 'error');
        return null;
      }
      const created = data.order as Order;
      syncOrderIntoLocalLists(created);
      await fetchAdminOrders();
      await writeAudit('order.manual_create', 'order', created.id, `ثبت سفارش تلفنی/دستی ${created.orderNo}`);
      pushToast(`سفارش دستی ${created.orderNo} با محاسبه قطعی سرور ثبت شد.`, 'success');
      return created;
    } catch {
      pushToast('خطا در ارتباط با سرور برای ثبت سفارش دستی.', 'error');
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
      setPaymentLedger((prev) => upsertById(prev, entry));
      if (entry.status === 'verified') {
        await updateOrderStatus(entry.orderId, 'paid');
      } else if (entry.status === 'refunded') {
        await updateOrderStatus(entry.orderId, 'refunded');
      }
      pushToast('سند پرداخت در دفترکل مالی ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `paymentLedger/${entry.id}`);
    }
  };

  const processReturnAdmin: StoreContextValue['processReturnAdmin'] = async (id, payload) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/admin/returns/${encodeURIComponent(id)}/process`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.returnRequest) {
        pushToast(data?.message || 'تغییر وضعیت پرونده مرجوعی نامعتبر است.', 'error');
        return;
      }
      setReturns((prev) => upsertById(prev, data.returnRequest as ReturnRequest));
      await Promise.all([fetchAdminOrders(), refreshInventory()]);
      pushToast(
        payload.status === 'received'
          ? 'کالای مرجوعی در انبار ثبت و موجودی/بچ بروزرسانی شد.'
          : 'پرونده مرجوعی با موفقیت بروزرسانی شد.',
        'success'
      );
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام پردازش مرجوعی.', 'error');
    }
  };

  const updateReturnStatus = async (id: string, status: ReturnRequest['status'], adminNote?: string) => {
    await processReturnAdmin(id, {
      status,
      ...(status === 'received' ? { condition: 'resellable' } : {}),
      adminNote,
    });
  };

  const upsertProformaAdmin = async (proforma: ProformaInvoice) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...proforma, updatedAt: new Date().toISOString() };
    setProformas((prev) => upsertById(prev, next));
    await writeAudit('proforma.upsert', 'proforma', proforma.id, `بروزرسانی پیش‌فاکتور ${proforma.proformaNo}`);
    pushToast('پیش‌فاکتور بروزرسانی شد.', 'success');
  };

  const convertProformaToOrder = async (proformaId: string) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const pf = proformas.find((p) => p.id === proformaId);
    if (!pf) return;
    const created = await createManualOrder({
      customerName: pf.contactName,
      customerMobile: pf.contactMobile,
      customerGroup: 'clinic',
      paymentMethod: 'bank_transfer',
      shippingMethod: 'courier_tehran',
      shippingTotal: 0,
      address: {
        province: 'تهران',
        city: 'تهران',
        postalCode: '1417933111',
        addressLine: pf.clinicName || 'تحویل مطب (تبدیل از پیش‌فاکتور)',
      },
      items: pf.items,
      customerNote: `تبدیل‌شده از پیش‌فاکتور ${pf.proformaNo}`,
    });
    if (created) {
      setProformas((prev) =>
        prev.map((p) => (p.id === pf.id ? { ...p, status: 'converted', orderId: created.id } : p))
      );
      await writeAudit('proforma.convert', 'proforma', proformaId, `تبدیل پیش‌فاکتور ${pf.proformaNo} به سفارش ${created.orderNo}`);
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

  return (
    <OrdersContext.Provider
      value={{
        orders,
        guestOrders,
        mobileOrders,
        adminOrdersMeta,
        adminOrdersLoading,
        fetchAdminOrders,
        invoices,
        paymentLedger,
        returns,
        proformas,
        paymentPlans,
        consultationRequests,
        placeOrder,
        verifyOnlinePayment,
        fetchOrderPaymentStatus,
        lookupGuestOrder,
        cancelOwnOrder,
        requestProforma,
        respondProforma,
        submitReturnRequest,
        submitConsultation,
        updateConsultationStatus,
        updateOrderStatus,
        createManualOrder,
        issueInvoice,
        voidInvoice,
        recordPaymentEntry,
        updateReturnStatus,
        processReturnAdmin,
        upsertProformaAdmin,
        convertProformaToOrder,
        updatePaymentPlanStatus,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used inside OrdersProvider');
  return ctx;
}
