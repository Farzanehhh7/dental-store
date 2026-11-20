import crypto from 'node:crypto';
import type {
  CustomerGroupCode,
  Order,
  OrderSource,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentMethod,
  ProformaInvoice,
} from '../../src/types/domain';
import { issueGuestOrderToken, normalizeMobile, verifyGuestOrderToken } from '../auth';
import { envPositiveInt } from '../lib/http';
import { calculateAuthoritativeCheckout } from '../pricing';
import type { OrderQueryFilter, RepositoryBundle } from '../repositories';

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'payment_failed', 'cancelled', 'expired', 'processing'],
  payment_failed: ['paid', 'pending_payment', 'cancelled', 'expired'],
  awaiting_review: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'packed', 'shipped', 'cancelled', 'refunded'],
  processing: ['packed', 'shipped', 'cancelled', 'refunded'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'completed', 'return_requested'],
  delivered: ['completed', 'return_requested'],
  completed: ['return_requested', 'refunded'],
  return_requested: ['returned', 'refunded', 'completed'],
  returned: ['refunded'],
  cancelled: [],
  expired: [],
  refunded: [],
};

export const CANCELLABLE_BY_CUSTOMER: OrderStatus[] = ['pending_payment', 'awaiting_review', 'payment_failed'];

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export function appendOrderHistory(
  order: Order,
  entry: Omit<OrderStatusHistoryEntry, 'changedAt'> & { changedAt?: string }
): OrderStatusHistoryEntry[] {
  const existing = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  return [
    ...existing,
    {
      status: entry.status,
      ...(entry.paymentStatus ? { paymentStatus: entry.paymentStatus } : {}),
      changedAt: entry.changedAt ?? new Date().toISOString(),
      actorType: entry.actorType,
      ...(entry.actorId ? { actorId: entry.actorId } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    },
  ];
}

export interface CreateOrderInput {
  source: OrderSource;
  userId: string;
  isGuest: boolean;
  customerName: string;
  customerMobile: string;
  requestedCustomerGroup?: CustomerGroupCode;
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
  shippingMethod: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  shippingAddress: Order['shippingAddress'];
  customerNote?: string;
  idempotencyKey?: string;
  clientTotals?: {
    subtotal?: number;
    discountTotal?: number;
    shippingTotal?: number;
    taxTotal?: number;
    grandTotal?: number;
  };
  actorId?: string;
}

export type OrderActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

const FAKE_MOBILE_PLACEHOLDERS = new Set(['09120000000', '09000000000']);

export function assertValidRealMobile(raw: string): string | null {
  const clean = normalizeMobile(String(raw || ''));
  if (!/^09\d{9}$/.test(clean) || FAKE_MOBILE_PLACEHOLDERS.has(clean)) {
    return null;
  }
  return clean;
}

export function createOrderService(repos: RepositoryBundle) {
  const expiryMinutes = envPositiveInt('ORDER_PAYMENT_EXPIRY_MINUTES', 30);

  async function createOrder(input: CreateOrderInput): Promise<
    OrderActionResult<{ order: Order; orderToken: string; reused?: boolean }>
  > {
    const customerName = input.customerName.trim();
    const customerMobile = normalizeMobile(input.customerMobile);
    if (!customerName || !/^09\d{9}$/.test(customerMobile)) {
      return { ok: false, status: 400, message: 'نام و شماره موبایل معتبر برای ثبت سفارش الزامی است.' };
    }

    const cleanIdemp = input.idempotencyKey?.trim();
    if (cleanIdemp) {
      const existing = await repos.orders.findByIdempotencyKey(cleanIdemp);
      if (existing) {
        if (existing.userId !== input.userId && normalizeMobile(existing.customerMobile) !== customerMobile) {
          return { ok: false, status: 409, message: 'کلید یکتا قبلاً برای سفارش دیگری ثبت شده است.' };
        }
        return {
          ok: true,
          data: {
            order: existing,
            orderToken: issueGuestOrderToken(existing.id, existing.orderNo, existing.customerMobile),
            reused: true,
          },
        };
      }
    }

    // Resolve authoritative customerGroup (never hardcoded retail for OTP B2B / Google B2B users)
    let resolvedGroup: CustomerGroupCode = 'retail';
    if (input.source === 'admin_manual' || input.source === 'proforma') {
      resolvedGroup = input.requestedCustomerGroup ?? 'clinic';
    } else if (input.source === 'google' || input.source === 'otp') {
      const profile = await repos.catalog.getUserGroupAndProfile({
        uid: input.source === 'google' ? input.userId : undefined,
        mobile: customerMobile,
      });
      resolvedGroup = profile.customerGroup;
    }

    const catalogSnapshot = await repos.catalog.getSnapshot();
    const pricingUserId = input.source === 'google' ? input.userId : `mobile:${customerMobile}`;
    const calc = calculateAuthoritativeCheckout(catalogSnapshot, {
      items: input.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        quantity: it.quantity,
      })),
      customerGroup: resolvedGroup,
      userId: pricingUserId,
      couponCode: input.couponCode,
      shippingMethod: input.shippingMethod,
    });
    if (!calc.ok) {
      return { ok: false, status: calc.status, message: calc.message };
    }

    // Reject client-submitted price/total tampering (log mismatch without PII)
    const mismatchFields: string[] = [];
    const ct = input.clientTotals;
    if (ct) {
      if (typeof ct.subtotal === 'number' && Math.round(ct.subtotal) !== calc.subtotal) mismatchFields.push('subtotal');
      if (typeof ct.discountTotal === 'number' && Math.round(ct.discountTotal) !== calc.discountTotal) {
        mismatchFields.push('discountTotal');
      }
      if (typeof ct.shippingTotal === 'number' && Math.round(ct.shippingTotal) !== calc.shippingTotal) {
        mismatchFields.push('shippingTotal');
      }
      if (typeof ct.taxTotal === 'number' && Math.round(ct.taxTotal) !== calc.taxTotal) mismatchFields.push('taxTotal');
      if (typeof ct.grandTotal === 'number' && Math.round(ct.grandTotal) !== calc.grandTotal) {
        mismatchFields.push('grandTotal');
      }
    }
    input.items.forEach((submittedItem, idx) => {
      const calcItem = calc.items[idx];
      if (!calcItem) return;
      if (typeof submittedItem.unitPrice === 'number' && Math.round(submittedItem.unitPrice) !== calcItem.unitPrice) {
        mismatchFields.push(`items[${idx}].unitPrice`);
      }
      if (typeof submittedItem.lineTotal === 'number' && Math.round(submittedItem.lineTotal) !== calcItem.lineTotal) {
        mismatchFields.push(`items[${idx}].lineTotal`);
      }
    });

    if (mismatchFields.length > 0) {
      console.warn('[security] order price tampering detected', {
        source: input.source,
        mismatchFields,
      });
      return {
        ok: false,
        status: 400,
        message: 'مغایرت در مبلغ محاسبه‌شده سفارش با تعرفه قطعی سرور شناسایی شد.',
      };
    }

    const isCreditFlow =
      input.paymentMethod === 'credit_request' ||
      input.paymentMethod === 'cheque_request' ||
      input.paymentMethod === 'installment_request';

    const initialStatus: OrderStatus =
      input.source === 'admin_manual'
        ? 'processing'
        : input.paymentMethod === 'online'
        ? 'pending_payment'
        : 'awaiting_review';
    const initialPaymentStatus: Order['paymentStatus'] = isCreditFlow ? 'pending_credit' : 'unpaid';

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt =
      initialStatus === 'pending_payment'
        ? new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString()
        : undefined;

    const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const orderNo = `DM-${now.getFullYear()}-${crypto.randomInt(10000, 100000)}`;

    const txOutcome = await repos.runTransaction(async (): Promise<
      OrderActionResult<{ order: Order; orderToken: string; reused?: boolean }>
    > => {
      if (cleanIdemp) {
        const dup = await repos.orders.findByIdempotencyKey(cleanIdemp);
        if (dup) {
          return {
            ok: true,
            data: {
              order: dup,
              orderToken: issueGuestOrderToken(dup.id, dup.orderNo, dup.customerMobile),
              reused: true,
            },
          };
        }
      }

      const reserveRes = await repos.stock.reserveItems(
        calc.items.map((it) => ({ productId: it.productId, variantId: it.variantId, quantity: it.quantity })),
        {
          orderId,
          orderNo,
          actorEmail: input.actorId ?? customerMobile,
          reason: `رزرو سفارش ${orderNo}`,
        }
      );
      if (!reserveRes.ok) {
        return { ok: false, status: 400, message: reserveRes.message };
      }

      if (calc.appliedCouponCode) {
        await repos.stock.incrementCouponUsage(calc.appliedCouponCode);
      }

      const allocatedItems = calc.items.map((it) => {
        const alloc = reserveRes.allocationsByItem[`${it.productId}::${it.variantId}`];
        if (!alloc) return it;
        return {
          ...it,
          warehouseId: alloc.warehouseId,
          ...(alloc.batchNo ? { batchNo: alloc.batchNo } : {}),
          ...(alloc.batchAllocations.length > 0 ? { batchAllocations: alloc.batchAllocations } : {}),
        };
      });

      const newOrder: Order = {
        id: orderId,
        orderNo,
        userId: input.userId,
        isGuest: input.isGuest,
        source: input.source,
        ...(cleanIdemp ? { idempotencyKey: cleanIdemp } : {}),
        customerName,
        customerMobile,
        customerGroup: resolvedGroup,
        status: initialStatus,
        paymentStatus: initialPaymentStatus,
        paymentMethod: input.paymentMethod,
        subtotal: calc.subtotal,
        discountTotal: calc.discountTotal,
        shippingTotal: calc.shippingTotal,
        taxTotal: calc.taxTotal,
        grandTotal: calc.grandTotal,
        ...(calc.appliedCouponCode ? { couponCode: calc.appliedCouponCode } : {}),
        shippingMethod: calc.shippingMethod,
        shippingAddress: {
          province: String(input.shippingAddress.province || 'تهران').slice(0, 60),
          city: String(input.shippingAddress.city || 'تهران').slice(0, 60),
          postalCode: String(input.shippingAddress.postalCode || '').slice(0, 20),
          addressLine: String(input.shippingAddress.addressLine || '').slice(0, 400),
        },
        ...(input.customerNote ? { customerNote: input.customerNote } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        stockReserved: true,
        stockCommitted: false,
        statusHistory: [
          {
            status: initialStatus,
            paymentStatus: initialPaymentStatus,
            changedAt: nowIso,
            actorType: input.source === 'admin_manual' ? 'admin' : 'customer',
            actorId: input.actorId ?? input.userId,
            note: input.source === 'admin_manual' ? 'ثبت سفارش دستی توسط مدیر' : 'ایجاد سفارش',
          },
        ],
        items: allocatedItems,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await repos.orders.save(newOrder);
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: input.source === 'admin_manual' ? 'admin' : 'customer',
        actorId: input.actorId ?? input.userId,
        action: 'order.created',
        entityType: 'order',
        entityId: newOrder.id,
        summary: `Order ${newOrder.orderNo} created via ${input.source} (${newOrder.status})`,
        createdAt: nowIso,
      });

      return {
        ok: true,
        data: {
          order: newOrder,
          orderToken: issueGuestOrderToken(newOrder.id, newOrder.orderNo, newOrder.customerMobile),
        },
      };
    });

    return txOutcome;
  }

  async function cancelOrder(params: {
    idOrNo: string;
    isAdmin?: boolean;
    firebaseUid?: string;
    mobileSessionPhone?: string;
    orderToken?: string | null;
    reason?: string;
  }): Promise<OrderActionResult<Order>> {
    const cleanTarget = params.idOrNo.trim();
    const found = (await repos.orders.getById(cleanTarget)) ?? (await repos.orders.getByOrderNo(cleanTarget));
    if (!found) {
      return { ok: false, status: 404, message: 'سفارش مورد نظر یافت نشد.' };
    }

    const hasAdminAccess = Boolean(params.isAdmin);
    const hasFirebaseOwner = Boolean(params.firebaseUid && found.userId === params.firebaseUid);
    const hasMobileSessionOwner = Boolean(
      params.mobileSessionPhone && normalizeMobile(found.customerMobile) === normalizeMobile(params.mobileSessionPhone)
    );
    const hasOrderToken = verifyGuestOrderToken(params.orderToken, found);

    if (!hasAdminAccess && !hasFirebaseOwner && !hasMobileSessionOwner && !hasOrderToken) {
      const hasAnyCreds = Boolean(params.firebaseUid || params.mobileSessionPhone || params.orderToken);
      return {
        ok: false,
        status: hasAnyCreds ? 403 : 401,
        message: hasAnyCreds
          ? 'شما مجاز به لغو این سفارش نیستید.'
          : 'برای لغو سفارش احراز هویت یا توکن معتبر سفارش الزامی است.',
      };
    }

    return repos.runTransaction(async (): Promise<OrderActionResult<Order>> => {
      const current = (await repos.orders.getById(found.id)) ?? found;
      if (current.status === 'cancelled') {
        return { ok: true, data: current };
      }
      if (!hasAdminAccess && !CANCELLABLE_BY_CUSTOMER.includes(current.status)) {
        return {
          ok: false,
          status: 400,
          message: `سفارش در وضعیت «${current.status}» قابل لغو توسط مشتری نیست.`,
        };
      }
      if (!isValidOrderTransition(current.status, 'cancelled')) {
        return {
          ok: false,
          status: 400,
          message: `تغییر وضعیت از «${current.status}» به «cancelled» مجاز نیست.`,
        };
      }

      if (current.stockReserved && !current.stockCommitted) {
        await repos.stock.releaseItems(
          current.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
            warehouseId: it.warehouseId,
            batchAllocations: it.batchAllocations,
          })),
          {
            orderId: current.id,
            orderNo: current.orderNo,
            actorEmail: params.firebaseUid ?? (hasMobileSessionOwner ? 'mobile_session' : 'order_token'),
            reason: params.reason || `آزادسازی بابت لغو سفارش ${current.orderNo}`,
          }
        );
      }

      const nowIso = new Date().toISOString();
      const openSessions = await repos.payments.findOpenSessionsByOrderId(current.id);
      for (const sess of openSessions) {
        await repos.payments.saveSession({ ...sess, status: 'expired' });
      }

      const nextPaymentStatus = current.paymentStatus === 'paid' ? 'refunded' : 'unpaid';
      const updated: Order = {
        ...current,
        status: 'cancelled',
        paymentStatus: nextPaymentStatus,
        stockReserved: false,
        statusHistory: appendOrderHistory(current, {
          status: 'cancelled',
          paymentStatus: nextPaymentStatus,
          changedAt: nowIso,
          actorType: hasAdminAccess ? 'admin' : 'customer',
          actorId: params.firebaseUid ?? (hasMobileSessionOwner ? 'mobile_session' : 'order_token'),
          note: params.reason || 'لغو سفارش',
        }),
        updatedAt: nowIso,
      };

      await repos.orders.save(updated);
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: hasAdminAccess ? 'admin' : 'customer',
        actorId: params.firebaseUid,
        action: 'order.cancelled',
        entityType: 'order',
        entityId: updated.id,
        summary: `Order ${updated.orderNo} cancelled from ${current.status}`,
        createdAt: nowIso,
      });

      return { ok: true, data: updated };
    });
  }

  async function updateOrderStatusAdmin(params: {
    idOrNo: string;
    nextStatus: OrderStatus;
    adminUid: string;
    trackingCode?: string;
    note?: string;
  }): Promise<OrderActionResult<Order>> {
    const cleanTarget = params.idOrNo.trim();
    const found = (await repos.orders.getById(cleanTarget)) ?? (await repos.orders.getByOrderNo(cleanTarget));
    if (!found) {
      return { ok: false, status: 404, message: 'سفارش یافت نشد.' };
    }

    return repos.runTransaction(async (): Promise<OrderActionResult<Order>> => {
      const current = (await repos.orders.getById(found.id)) ?? found;
      if (!isValidOrderTransition(current.status, params.nextStatus)) {
        return {
          ok: false,
          status: 400,
          message: `انتقال وضعیت غیرمجاز: تغییر از «${current.status}» به «${params.nextStatus}» مجاز نیست.`,
        };
      }

      const nowIso = new Date().toISOString();
      let stockReserved = current.stockReserved;
      let stockCommitted = current.stockCommitted;

      if ((params.nextStatus === 'paid' || params.nextStatus === 'shipped') && stockReserved && !stockCommitted) {
        await repos.stock.commitItems(
          current.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
            warehouseId: it.warehouseId,
            batchAllocations: it.batchAllocations,
          })),
          {
            orderId: current.id,
            orderNo: current.orderNo,
            actorEmail: params.adminUid,
            reason: `خروج قطعی سفارش ${current.orderNo} توسط مدیر`,
          }
        );
        stockReserved = false;
        stockCommitted = true;
      } else if (
        (params.nextStatus === 'cancelled' || params.nextStatus === 'expired' || params.nextStatus === 'refunded') &&
        stockReserved &&
        !stockCommitted
      ) {
        await repos.stock.releaseItems(
          current.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
            warehouseId: it.warehouseId,
            batchAllocations: it.batchAllocations,
          })),
          {
            orderId: current.id,
            orderNo: current.orderNo,
            actorEmail: params.adminUid,
            reason: params.note || `آزادسازی موجودی سفارش ${current.orderNo}`,
          }
        );
        stockReserved = false;
      }

      const nextPaymentStatus: Order['paymentStatus'] =
        params.nextStatus === 'paid'
          ? 'paid'
          : params.nextStatus === 'refunded' || params.nextStatus === 'returned'
          ? 'refunded'
          : current.paymentStatus;

      const updated: Order = {
        ...current,
        status: params.nextStatus,
        paymentStatus: nextPaymentStatus,
        ...(params.trackingCode ? { trackingCode: params.trackingCode } : {}),
        stockReserved,
        stockCommitted,
        statusHistory: appendOrderHistory(current, {
          status: params.nextStatus,
          paymentStatus: nextPaymentStatus,
          changedAt: nowIso,
          actorType: 'admin',
          actorId: params.adminUid,
          note: params.note || `تغییر وضعیت به ${params.nextStatus}`,
        }),
        updatedAt: nowIso,
      };

      await repos.orders.save(updated);
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: params.adminUid,
        action: 'order.status_updated',
        entityType: 'order',
        entityId: updated.id,
        summary: `Order ${updated.orderNo}: ${current.status} -> ${params.nextStatus}`,
        createdAt: nowIso,
      });

      return { ok: true, data: updated };
    });
  }

  async function listOrdersForAdmin(filter: OrderQueryFilter) {
    return repos.orders.list(filter);
  }

  async function listOrdersForUser(uid: string) {
    const res = await repos.orders.list({ userId: uid, page: 1, limit: 100 });
    return res.items;
  }

  async function listOrdersForMobile(mobile: string, options?: { status?: string; limit?: number }) {
    const res = await repos.orders.list({
      mobile: normalizeMobile(mobile),
      status: options?.status,
      page: 1,
      limit: options?.limit ?? 100,
    });
    return res.items;
  }

  async function trackOrder(orderNo: string, mobile: string): Promise<Order | null> {
    const order = await repos.orders.getByOrderNo(orderNo.trim());
    if (!order) return null;
    if (normalizeMobile(order.customerMobile) !== normalizeMobile(mobile)) return null;
    return order;
  }

  async function createProforma(params: {
    userId: string;
    contactName: string;
    contactMobile: string;
    clinicName?: string;
    termsFa?: string;
    requestedCustomerGroup?: CustomerGroupCode;
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice?: number;
      lineTotal?: number;
    }>;
    clientTotals?: {
      subtotal?: number;
      discountTotal?: number;
      shippingTotal?: number;
      taxTotal?: number;
      grandTotal?: number;
    };
  }): Promise<OrderActionResult<ProformaInvoice>> {
    const cleanMobile = assertValidRealMobile(params.contactMobile);
    if (!cleanMobile) {
      return {
        ok: false,
        status: 400,
        message: 'شماره موبایل معتبر واقعی (09xxxxxxxxx) برای صدور پیش‌فاکتور الزامی است.',
      };
    }

    const profile = await repos.catalog.getUserGroupAndProfile({
      uid: params.userId.startsWith('mobile:') ? undefined : params.userId,
      mobile: cleanMobile,
    });
    const effectiveGroup = params.requestedCustomerGroup ?? profile.customerGroup;
    const catalogSnapshot = await repos.catalog.getSnapshot();
    const calc = calculateAuthoritativeCheckout(catalogSnapshot, {
      items: params.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      customerGroup: effectiveGroup,
      userId: params.userId,
      shippingMethod: 'heavy_freight',
    });
    if (!calc.ok) {
      return { ok: false, status: calc.status, message: calc.message };
    }

    const ct = params.clientTotals;
    const proformaGrand = calc.subtotal + calc.taxTotal;
    if (
      (typeof ct?.subtotal === 'number' && Math.round(ct.subtotal) !== calc.subtotal) ||
      (typeof ct?.taxTotal === 'number' && Math.round(ct.taxTotal) !== calc.taxTotal) ||
      (typeof ct?.grandTotal === 'number' && Math.round(ct.grandTotal) !== proformaGrand)
    ) {
      console.warn('[security] proforma total tampering detected');
      return {
        ok: false,
        status: 400,
        message: 'مغایرت در مبالغ ارسالی پیش‌فاکتور با محاسبه قطعی سرور.',
      };
    }

    const nowIso = new Date().toISOString();
    const id = `prf_${crypto.randomBytes(6).toString('hex')}`;
    const proformaNo = `PF-${new Date().getFullYear()}-${crypto.randomInt(1000, 10000)}`;
    const shareToken = `pf-${crypto.randomBytes(8).toString('hex')}`;
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const pf: ProformaInvoice = {
      id,
      proformaNo,
      shareToken,
      userId: params.userId,
      contactName: params.contactName.trim(),
      contactMobile: cleanMobile,
      ...(params.clinicName ? { clinicName: params.clinicName.trim() } : {}),
      status: 'draft',
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      taxTotal: calc.taxTotal,
      grandTotal: proformaGrand,
      items: calc.items,
      termsFa: params.termsFa?.trim() || 'اعتبار پیش‌فاکتور ۷ روز کاری · تحویل مطابق زمان‌بندی',
      validUntil,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await repos.proformas.save(pf);
    return { ok: true, data: pf };
  }

  return {
    createOrder,
    cancelOrder,
    updateOrderStatusAdmin,
    listOrdersForAdmin,
    listOrdersForUser,
    listOrdersForMobile,
    trackOrder,
    createProforma,
    proformaRepo: repos.proformas,
    catalogRepo: repos.catalog,
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
