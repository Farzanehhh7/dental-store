import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { bindScopedCollection, handleListenerError } from '../lib/firestoreStore';
import { trackEcommerceEvent } from '../lib/analytics';
import {
  SEED_CONSULTATIONS,
  SEED_PAYMENT_PLANS,
  SEED_PROFORMAS,
  SEED_SAMPLE_ORDERS,
} from '../data/seed';
import { SEED_INVOICES, SEED_PAYMENT_LEDGER, SEED_RETURNS } from '../data/expandedCatalog';
import type {
  ConsultationRequest,
  InvoiceRecord,
  Order,
  OrderItem,
  OrderStatus,
  PaymentLedgerEntry,
  PaymentPlan,
  ProformaInvoice,
  ReturnRequest,
} from '../types/domain';
import type { StoreContextValue } from './storeTypes';
import {
  ADMIN_REQUIRED_MSG,
  LS_GUEST_ORDERS,
  LS_VERIFIED_PAYMENTS,
  VerifiedPaymentMark,
  applyVerifiedPaymentOverlay,
  mergeById,
  readJsonLS,
  resolveAuthHeaders,
  upsertById,
} from './storeHelpers';
import { useAuth } from './auth';
import { useContent } from './content';
import { useCart } from './cart';
import { useRfq } from './rfq';

export interface OrdersContextValue {
  orders: Order[];
  guestOrders: Order[];
  mobileOrders: Order[];
  invoices: InvoiceRecord[];
  paymentLedger: PaymentLedgerEntry[];
  returns: ReturnRequest[];
  proformas: ProformaInvoice[];
  paymentPlans: PaymentPlan[];
  consultationRequests: ConsultationRequest[];
  placeOrder: StoreContextValue['placeOrder'];
  verifyOnlinePayment: StoreContextValue['verifyOnlinePayment'];
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
  const { settings, registerOrderPurchaseChecker } = useContent();
  const { cart, clearCart } = useCart();
  const {
    mobileSessionToken,
    rawMobileOrders,
    refreshMobileOrders,
    registerProformaCreatedListener,
  } = useRfq();

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
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(SEED_CONSULTATIONS);

  const orders = useMemo(
    () => applyVerifiedPaymentOverlay(rawOrders, verifiedPayments),
    [rawOrders, verifiedPayments]
  );
  const guestOrders = useMemo(
    () => applyVerifiedPaymentOverlay(rawGuestOrders, verifiedPayments),
    [rawGuestOrders, verifiedPayments]
  );
  const mobileOrders = useMemo(
    () => applyVerifiedPaymentOverlay(rawMobileOrders, verifiedPayments),
    [rawMobileOrders, verifiedPayments]
  );

  useEffect(() => {
    localStorage.setItem(LS_GUEST_ORDERS, JSON.stringify(rawGuestOrders));
  }, [rawGuestOrders]);

  useEffect(() => {
    localStorage.setItem(LS_VERIFIED_PAYMENTS, JSON.stringify(verifiedPayments));
  }, [verifiedPayments]);

  useEffect(() => {
    registerProformaCreatedListener((pf) => setProformas((prev) => upsertById(prev, pf)));
  }, [registerProformaCreatedListener]);

  useEffect(() => {
    registerOrderPurchaseChecker((uid, productId) =>
      orders.some((o) => o.userId === uid && o.items.some((i) => i.productId === productId))
    );
  }, [orders, registerOrderPurchaseChecker]);

  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const unsubs: (() => void)[] = [
      bindScopedCollection<Order>('orders', setRawOrders, isAdmin, authUser.uid, SEED_SAMPLE_ORDERS),
      bindScopedCollection<InvoiceRecord>('invoices', setInvoices, isAdmin, authUser.uid, SEED_INVOICES),
      bindScopedCollection<ReturnRequest>('returns', setReturns, isAdmin, authUser.uid, SEED_RETURNS),
      bindScopedCollection<ProformaInvoice>('proformas', setProformas, isAdmin, authUser.uid, SEED_PROFORMAS),
      bindScopedCollection<PaymentPlan>('paymentPlans', setPaymentPlans, isAdmin, authUser.uid, SEED_PAYMENT_PLANS),
      bindScopedCollection<ConsultationRequest>(
        'consultationRequests',
        setConsultationRequests,
        isAdmin,
        authUser.uid,
        SEED_CONSULTATIONS
      ),
    ];

    const roleEffective = actualAdminRole ?? activeAdminRole;
    if (isAdmin && ['super_admin', 'admin', 'accountant', 'sales_mgr'].includes(roleEffective)) {
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

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin, actualAdminRole, activeAdminRole]);

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
        const headers = await resolveAuthHeaders(null, mobileSessionToken);
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
        await refreshMobileOrders();
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
        headers: await resolveAuthHeaders(authUser, mobileSessionToken),
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
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
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

  return (
    <OrdersContext.Provider
      value={{
        orders,
        guestOrders,
        mobileOrders,
        invoices,
        paymentLedger,
        returns,
        proformas,
        paymentPlans,
        consultationRequests,
        placeOrder,
        verifyOnlinePayment,
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
