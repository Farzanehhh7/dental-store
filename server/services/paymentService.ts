import crypto from 'node:crypto';
import type { Order, PaymentLedgerEntry, PaymentSessionStatus } from '../../src/types/domain';
import {
  getPaymentModeConfig,
  normalizeMobile,
  verifyGuestOrderToken,
  verifyWebhookSignature,
} from '../auth';
import { envPositiveInt } from '../lib/http';
import { resolvePaymentGateway } from '../payments/gateways';
import type { ServerPaymentSession } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import { appendOrderHistory, isValidOrderTransition } from './orderService';

export const PAYMENT_TRANSITIONS: Record<PaymentSessionStatus, PaymentSessionStatus[]> = {
  initiated: ['redirected', 'verified', 'failed', 'expired'],
  redirected: ['verified', 'failed', 'expired'],
  verified: ['refunded'],
  failed: [],
  expired: [],
  refunded: [],
};

export function isValidPaymentTransition(from: PaymentSessionStatus, to: PaymentSessionStatus): boolean {
  if (from === to) return true;
  return (PAYMENT_TRANSITIONS[from] ?? []).includes(to);
}

export interface CallerCredentials {
  isAdmin?: boolean;
  firebaseUid?: string;
  mobileSessionPhone?: string;
  orderToken?: string | null;
}

export function sanitizePaymentSession(session: ServerPaymentSession) {
  return {
    authority: session.authority,
    orderId: session.orderId,
    orderNo: session.orderNo,
    amount: session.amount,
    gateway: session.gateway,
    idempotencyKey: session.idempotencyKey,
    status: session.status,
    refId: session.refId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
}

function checkOrderAccess(order: Order, caller: CallerCredentials): { allowed: true } | { allowed: false; status: 401 | 403; message: string } {
  if (caller.isAdmin) return { allowed: true };
  if (caller.firebaseUid && order.userId === caller.firebaseUid) return { allowed: true };
  if (
    caller.mobileSessionPhone &&
    normalizeMobile(order.customerMobile) === normalizeMobile(caller.mobileSessionPhone)
  ) {
    return { allowed: true };
  }
  if (caller.orderToken && verifyGuestOrderToken(caller.orderToken, order)) {
    return { allowed: true };
  }

  const hasAnyCred = Boolean(caller.firebaseUid || caller.mobileSessionPhone || caller.orderToken);
  return {
    allowed: false,
    status: hasAnyCred ? 403 : 401,
    message: hasAnyCred
      ? 'شما مجاز به دسترسی یا پرداخت این سفارش نیستید.'
      : 'احراز هویت یا توکن معتبر سفارش برای عملیات پرداخت الزامی است.',
  };
}

export function createPaymentService(repos: RepositoryBundle) {
  const sessionExpiryMinutes = envPositiveInt('ORDER_PAYMENT_EXPIRY_MINUTES', 30);

  async function initiate(params: {
    orderId: string;
    orderNo?: string;
    gateway: 'zarinpal' | 'idpay';
    idempotencyKey?: string;
    callbackUrl: string;
    caller: CallerCredentials;
  }) {
    const modeConfig = getPaymentModeConfig(params.gateway);
    if (!modeConfig.ok) {
      return { ok: false as const, status: modeConfig.status, message: modeConfig.message };
    }

    const order =
      (await repos.orders.getById(params.orderId.trim())) ??
      (params.orderNo ? await repos.orders.getByOrderNo(params.orderNo.trim()) : null);

    if (!order) {
      return {
        ok: false as const,
        status: 404,
        message: 'سفارش برای محاسبه مبلغ معتبر در سرور یافت نشد.',
      };
    }

    const access = checkOrderAccess(order, params.caller);
    if (!access.allowed) {
      return { ok: false as const, status: access.status, message: access.message };
    }

    if (order.status === 'paid' || order.paymentStatus === 'paid') {
      return { ok: false as const, status: 400, message: 'این سفارش قبلاً پرداخت و تسویه شده است.' };
    }
    if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
      return {
        ok: false as const,
        status: 400,
        message: `سفارش در وضعیت «${order.status}» امکان شروع پرداخت آنلاین ندارد.`,
      };
    }

    if (order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) {
      await expireSingleOrder(order.id, 'انقضای مهلت پرداخت هنگام شروع تراکنش');
      return {
        ok: false as const,
        status: 400,
        message: 'مهلت پرداخت این سفارش منقضی شده و موجودی رزروشده آزاد شده است.',
      };
    }

    const authoritativeAmount = order.grandTotal;
    if (!Number.isFinite(authoritativeAmount) || authoritativeAmount <= 0) {
      return { ok: false as const, status: 400, message: 'مبلغ قابل پرداخت سفارش نامعتبر است.' };
    }

    const requestedKey = String(params.idempotencyKey || `IDEMP-${order.id}`).trim();
    const existing = await repos.payments.findSessionByIdempotencyKey(requestedKey);
    if (existing && (existing.status === 'initiated' || existing.status === 'redirected' || existing.status === 'verified')) {
      if (existing.orderId !== order.id) {
        return { ok: false as const, status: 409, message: 'کلید یکتای پرداخت متعلق به سفارش دیگری است.' };
      }
      if (existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now()) {
        return {
          ok: true as const,
          reused: true,
          mode: existing.mode,
          ...(existing.redirectUrl ? { redirectUrl: existing.redirectUrl } : {}),
          session: sanitizePaymentSession(existing),
        };
      }
    }

    const storageKey =
      existing && (existing.status === 'failed' || existing.status === 'expired' || (existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now()))
        ? `${requestedKey}#retry_${crypto.randomBytes(4).toString('hex')}`
        : requestedKey;

    const gatewayImpl = resolvePaymentGateway(params.gateway, modeConfig.mode);
    const initRes = await gatewayImpl.initiate({
      amountToman: authoritativeAmount,
      orderId: order.id,
      orderNo: order.orderNo,
      callbackUrl: params.callbackUrl,
      mobile: order.customerMobile,
    });

    if (!initRes.ok) {
      return { ok: false as const, status: initRes.status, message: initRes.message };
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = order.expiresAt || new Date(now.getTime() + sessionExpiryMinutes * 60 * 1000).toISOString();
    const initialStatus: PaymentSessionStatus = modeConfig.mode === 'live' ? 'redirected' : 'initiated';

    const session: ServerPaymentSession = {
      authority: initRes.authority,
      orderId: order.id,
      orderNo: order.orderNo,
      amount: authoritativeAmount,
      gateway: params.gateway,
      mode: modeConfig.mode,
      idempotencyKey: storageKey,
      status: initialStatus,
      ...(initRes.sandboxTokenHash ? { sandboxTokenHash: initRes.sandboxTokenHash } : {}),
      ...(initRes.redirectUrl ? { redirectUrl: initRes.redirectUrl } : {}),
      ownerUid: order.userId,
      ownerMobile: order.customerMobile,
      expiresAt,
      createdAt,
    };

    await repos.runTransaction(async () => {
      await repos.payments.saveSession(session);
      await repos.payments.addLedgerEntry({
        id: `pay_init_${crypto.randomBytes(6).toString('hex')}`,
        orderId: order.id,
        orderNo: order.orderNo,
        gateway: params.gateway,
        amount: authoritativeAmount,
        idempotencyKey: storageKey,
        refId: session.authority,
        status: 'initiated',
        createdAt,
      });
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: params.caller.isAdmin ? 'admin' : 'customer',
        action: 'payment.initiated',
        entityType: 'payment',
        entityId: session.authority,
        summary: `Payment initiated (${params.gateway}/${modeConfig.mode}) for order ${order.orderNo}`,
        createdAt,
      });
    });

    return {
      ok: true as const,
      mode: modeConfig.mode,
      ...(initRes.sandboxToken ? { sandboxToken: initRes.sandboxToken } : {}),
      ...(initRes.redirectUrl ? { redirectUrl: initRes.redirectUrl } : {}),
      session: sanitizePaymentSession(session),
    };
  }

  async function verifyOrCallback(params: {
    authority: string;
    status: string;
    sandboxToken?: string;
    expectedAmount?: number;
    expectedOrderId?: string;
    via: 'verify_api' | 'callback' | 'webhook';
  }) {
    const cleanAuthority = params.authority.trim();
    if (!cleanAuthority) {
      return { ok: false as const, status: 400, message: 'شناسه مرجع تراکنش الزامی است.' };
    }

    const session = await repos.payments.getSessionByAuthority(cleanAuthority);
    if (!session) {
      return { ok: false as const, status: 404, message: 'نشست تراکنش پرداخت یافت نشد.' };
    }

    if (params.expectedOrderId && params.expectedOrderId.trim() !== session.orderId) {
      return { ok: false as const, status: 400, message: 'شناسه سفارش با نشست تراکنش مطابقت ندارد.' };
    }

    // Idempotent no-op if already verified
    if (session.status === 'verified') {
      const [verifiedOrder, order] = await Promise.all([
        repos.payments.getVerifiedOrder(session.orderId),
        repos.orders.getById(session.orderId),
      ]);
      return {
        ok: true as const,
        alreadyVerified: true,
        refId: session.refId || '',
        session: sanitizePaymentSession(session),
        verifiedOrder,
        ...(order ? { order } : {}),
      };
    }

    if (session.status === 'expired' || session.status === 'failed' || session.status === 'refunded') {
      return {
        ok: false as const,
        status: 400,
        message: `نشست پرداخت در وضعیت «${session.status}» است و قابل تایید نیست.`,
      };
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      await expireSingleOrder(session.orderId, 'انقضای مهلت تراکنش پیش از تایید');
      return { ok: false as const, status: 400, message: 'مهلت نشست پرداخت به پایان رسیده است.' };
    }

    // Reject amount tampering if caller/gateway reported a mismatched amount (security rejection: do not mutate session)
    if (typeof params.expectedAmount === 'number' && Math.round(params.expectedAmount) !== session.amount) {
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'gateway',
        action: 'payment.amount_mismatch_rejected',
        entityType: 'payment',
        entityId: session.authority,
        summary: `Rejected callback amount mismatch (${params.via}) for order ${session.orderNo}`,
        createdAt: new Date().toISOString(),
      });
      return { ok: false as const, status: 400, message: 'مغایرت مبلغ تراکنش با مبلغ سفارش شناسایی شد.' };
    }

    const modeConfig = getPaymentModeConfig(session.gateway);
    if (!modeConfig.ok) {
      return { ok: false as const, status: modeConfig.status, message: modeConfig.message };
    }

    const cleanStatus = String(params.status || '').trim().toUpperCase();
    const isOkStatus = cleanStatus === 'OK' || cleanStatus === '100' || cleanStatus === '101' || cleanStatus === 'PAID';
    if (!isOkStatus) {
      await markPaymentFailed(session, `لغو یا خطای بازگشتی درگاه (${cleanStatus || 'NOK'})`);
      return { ok: false as const, status: 400, message: 'پرداخت توسط کاربر لغو یا ناموفق شد.' };
    }

    if (session.mode === 'sandbox' && modeConfig.mode !== 'sandbox') {
      return { ok: false as const, status: 403, message: 'امکان تایید تراکنش آزمایشی در حالت غیر sandbox وجود ندارد.' };
    }

    const gatewayImpl = resolvePaymentGateway(session.gateway, session.mode);
    const verifyRes = await gatewayImpl.verify({
      session,
      sandboxToken: params.sandboxToken,
      authority: cleanAuthority,
    });

    if (!verifyRes.ok) {
      if (!verifyRes.isSecurityRejection) {
        await markPaymentFailed(session, verifyRes.message);
      } else {
        await repos.audit.append({
          id: `aud_${crypto.randomBytes(6).toString('hex')}`,
          actorType: 'gateway',
          action: 'payment.security_rejected',
          entityType: 'payment',
          entityId: session.authority,
          summary: `Payment verification rejected (${params.via}) for ${session.orderNo}`,
          createdAt: new Date().toISOString(),
        });
      }
      return { ok: false as const, status: verifyRes.status, message: verifyRes.message };
    }

    const refId = verifyRes.refId;

    // Perform state transitions + ledger + verified status + stock commit inside ONE atomic transaction
    return repos.runTransaction(async () => {
      const freshSession = (await repos.payments.getSessionByAuthority(cleanAuthority)) ?? session;
      if (freshSession.status === 'verified') {
        const [verifiedOrder, existingOrder] = await Promise.all([
          repos.payments.getVerifiedOrder(freshSession.orderId),
          repos.orders.getById(freshSession.orderId),
        ]);
        return {
          ok: true as const,
          alreadyVerified: true,
          refId: freshSession.refId || refId,
          session: sanitizePaymentSession(freshSession),
          verifiedOrder,
          ...(existingOrder ? { order: existingOrder } : {}),
        };
      }

      if (!isValidPaymentTransition(freshSession.status, 'verified')) {
        return { ok: false as const, status: 400, message: 'انتقال وضعیت تراکنش به تاییدشده مجاز نیست.' };
      }

      const ord = await repos.orders.getById(freshSession.orderId);
      if (!ord) {
        return { ok: false as const, status: 404, message: 'سفارش متناظر با تراکنش یافت نشد.' };
      }

      if (!isValidOrderTransition(ord.status, 'paid')) {
        return {
          ok: false as const,
          status: 400,
          message: `سفارش در وضعیت «${ord.status}» قابل تسویه به پرداخت‌شده نیست.`,
        };
      }

      const verifiedAt = new Date().toISOString();
      const updatedSession: ServerPaymentSession = {
        ...freshSession,
        status: 'verified',
        refId,
        verifiedAt,
      };
      delete updatedSession.sandboxTokenHash;
      await repos.payments.saveSession(updatedSession);

      const ledgerEntry: PaymentLedgerEntry = {
        id: `pay_${crypto.randomBytes(6).toString('hex')}`,
        orderId: freshSession.orderId,
        orderNo: freshSession.orderNo,
        gateway: freshSession.gateway,
        amount: freshSession.amount,
        idempotencyKey: freshSession.idempotencyKey,
        refId,
        status: 'verified',
        createdAt: verifiedAt,
      };
      await repos.payments.addLedgerEntry(ledgerEntry);

      const verifiedOrder = {
        orderId: freshSession.orderId,
        orderNo: freshSession.orderNo,
        status: 'paid' as const,
        paymentStatus: 'paid' as const,
        refId,
        gateway: freshSession.gateway,
        amount: freshSession.amount,
        verifiedAt,
      };
      await repos.payments.saveVerifiedOrder(verifiedOrder);

      let stockCommitted = ord.stockCommitted ?? false;
      let stockReserved = ord.stockReserved ?? false;
      let savedOrder: Order = ord;
      if (ord.status !== 'paid') {
        if (ord.stockReserved && !ord.stockCommitted) {
          await repos.stock.commitItems(
            ord.items.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              quantity: it.quantity,
              warehouseId: it.warehouseId,
              batchAllocations: it.batchAllocations,
            })),
            {
              orderId: ord.id,
              orderNo: ord.orderNo,
              actorEmail: 'gateway',
              reason: `قطعی‌شدن خروج بابت پرداخت ${ord.orderNo} (${refId})`,
            }
          );
          stockCommitted = true;
          stockReserved = false;
        }

        const updatedOrder: Order = {
          ...ord,
          status: 'paid',
          paymentStatus: 'paid',
          trackingCode: `PAY-${refId}`,
          stockReserved,
          stockCommitted,
          statusHistory: appendOrderHistory(ord, {
            status: 'paid',
            paymentStatus: 'paid',
            changedAt: verifiedAt,
            actorType: 'gateway',
            note: `تایید پرداخت (${freshSession.gateway}) — کد رهگیری ${refId}`,
          }),
          updatedAt: verifiedAt,
        };
        await repos.orders.save(updatedOrder);
        savedOrder = updatedOrder;
      }

      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'gateway',
        action: 'payment.verified',
        entityType: 'payment',
        entityId: freshSession.authority,
        summary: `Payment verified via ${params.via} for order ${freshSession.orderNo} (refId: ${refId})`,
        createdAt: verifiedAt,
      });

      return {
        ok: true as const,
        refId,
        order: savedOrder,
        verifiedOrder,
        ledgerEntry,
        session: sanitizePaymentSession(updatedSession),
      };
    });
  }

  async function markPaymentFailed(session: ServerPaymentSession, note: string) {
    return repos.runTransaction(async () => {
      const fresh = (await repos.payments.getSessionByAuthority(session.authority)) ?? session;
      if (fresh.status === 'verified' || fresh.status === 'failed') return;

      const nowIso = new Date().toISOString();
      await repos.payments.saveSession({
        ...fresh,
        status: 'failed',
      });
      await repos.payments.addLedgerEntry({
        id: `pay_fail_${crypto.randomBytes(6).toString('hex')}`,
        orderId: fresh.orderId,
        orderNo: fresh.orderNo,
        gateway: fresh.gateway,
        amount: fresh.amount,
        idempotencyKey: fresh.idempotencyKey,
        refId: fresh.authority,
        status: 'failed',
        createdAt: nowIso,
      });

      const ord = await repos.orders.getById(fresh.orderId);
      if (ord && ord.status === 'pending_payment') {
        await repos.orders.save({
          ...ord,
          status: 'payment_failed',
          statusHistory: appendOrderHistory(ord, {
            status: 'payment_failed',
            paymentStatus: ord.paymentStatus,
            changedAt: nowIso,
            actorType: 'gateway',
            note,
          }),
          updatedAt: nowIso,
        });
      }

      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'gateway',
        action: 'payment.failed',
        entityType: 'payment',
        entityId: fresh.authority,
        summary: `Payment failed for order ${fresh.orderNo}: ${note}`,
        createdAt: nowIso,
      });
    });
  }

  async function handleWebhook(params: {
    gateway: 'zarinpal' | 'idpay';
    rawBody: string;
    signatureHeader?: string;
    payload: {
      eventId?: string;
      authority?: string;
      status?: string;
      amount?: number;
      sandboxToken?: string;
      timestamp?: number;
    };
  }) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim() || '';
    if (!secret) {
      return {
        ok: false as const,
        status: 503,
        message: 'کلید امنیتی وب‌هوک پرداخت (PAYMENT_WEBHOOK_SECRET) پیکربندی نشده است.',
      };
    }

    if (!verifyWebhookSignature(params.rawBody, params.signatureHeader, secret)) {
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'gateway',
        action: 'payment.webhook_invalid_signature',
        entityType: 'payment',
        entityId: params.payload.authority || 'unknown',
        summary: `Rejected webhook with invalid signature (${params.gateway})`,
        createdAt: new Date().toISOString(),
      });
      return { ok: false as const, status: 401, message: 'امضای دیجیتال وب‌هوک نامعتبر است.' };
    }

    // Freshness check if timestamp provided (5 min tolerance)
    if (typeof params.payload.timestamp === 'number') {
      const tsMs = params.payload.timestamp > 1e12 ? params.payload.timestamp : params.payload.timestamp * 1000;
      if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        return { ok: false as const, status: 400, message: 'بازه زمانی وب‌هوک منقضی شده است.' };
      }
    }

    const digest = crypto.createHash('sha256').update(params.rawBody).digest('hex').slice(0, 24);
    const eventKey = `wh:${params.gateway}:${params.payload.eventId?.trim() || digest}`;
    if (await repos.payments.hasProcessedWebhook(eventKey)) {
      return { ok: true as const, replayed: true, message: 'رویداد وب‌هوک قبلاً پردازش شده است.' };
    }

    const authority = String(params.payload.authority || '').trim();
    if (!authority) {
      return { ok: false as const, status: 400, message: 'شناسه مرجع (authority) در وب‌هوک الزامی است.' };
    }

    const res = await verifyOrCallback({
      authority,
      status: String(params.payload.status || 'NOK'),
      sandboxToken: params.payload.sandboxToken,
      expectedAmount: params.payload.amount,
      via: 'webhook',
    });

    await repos.payments.markWebhookProcessed(eventKey, new Date().toISOString());
    return res;
  }

  async function getStatusForOrder(orderId: string, caller: CallerCredentials) {
    const cleanId = orderId.trim();
    const order = (await repos.orders.getById(cleanId)) ?? (await repos.orders.getByOrderNo(cleanId));

    if (!order) {
      // Fall back to checking legacy verified map only for admins
      const legacyVerified = await repos.payments.getVerifiedOrder(cleanId);
      if (legacyVerified && caller.isAdmin) {
        return { ok: true as const, paid: true, order: null, verifiedOrder: legacyVerified };
      }
      if (!caller.firebaseUid && !caller.mobileSessionPhone && !caller.orderToken && !caller.isAdmin) {
        return { ok: false as const, status: 401, message: 'احراز هویت برای استعلام وضعیت پرداخت الزامی است.' };
      }
      return { ok: false as const, status: 404, message: 'سفارش یافت نشد.' };
    }

    const access = checkOrderAccess(order, caller);
    if (!access.allowed) {
      return { ok: false as const, status: access.status, message: access.message };
    }

    const verified = await repos.payments.getVerifiedOrder(order.id);
    const isPaid = order.status === 'paid' || order.paymentStatus === 'paid' || Boolean(verified);
    return {
      ok: true as const,
      paid: isPaid,
      order,
      verifiedOrder: verified,
    };
  }

  async function expireSingleOrder(orderId: string, reason: string): Promise<boolean> {
    return repos.runTransaction(async () => {
      const ord = await repos.orders.getById(orderId);
      if (!ord || (ord.status !== 'pending_payment' && ord.status !== 'payment_failed')) {
        return false;
      }

      if (ord.stockReserved && !ord.stockCommitted) {
        await repos.stock.releaseItems(
          ord.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
            warehouseId: it.warehouseId,
            batchAllocations: it.batchAllocations,
          })),
          {
            orderId: ord.id,
            orderNo: ord.orderNo,
            actorEmail: 'system',
            reason,
          }
        );
      }

      const nowIso = new Date().toISOString();
      const openSessions = await repos.payments.findOpenSessionsByOrderId(ord.id);
      for (const s of openSessions) {
        if (isValidPaymentTransition(s.status, 'expired')) {
          await repos.payments.saveSession({ ...s, status: 'expired' });
        }
      }

      await repos.orders.save({
        ...ord,
        status: 'expired',
        stockReserved: false,
        statusHistory: appendOrderHistory(ord, {
          status: 'expired',
          paymentStatus: ord.paymentStatus,
          changedAt: nowIso,
          actorType: 'system',
          note: reason,
        }),
        updatedAt: nowIso,
      });

      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'system',
        action: 'order.expired',
        entityType: 'order',
        entityId: ord.id,
        summary: `Expired unpaid order ${ord.orderNo} and released stock`,
        createdAt: nowIso,
      });

      return true;
    });
  }

  async function runExpirySweep(
    nowDate: Date = new Date()
  ): Promise<{ expiredCount: number; expiredOrderIds: string[] }> {
    const expiredCandidates = await repos.orders.listExpiredPending(nowDate.toISOString());
    const expiredOrderIds: string[] = [];
    for (const ord of expiredCandidates) {
      const didExpire = await expireSingleOrder(ord.id, 'انقضای خودکار مهلت پرداخت و آزادسازی موجودی');
      if (didExpire) expiredOrderIds.push(ord.id);
    }
    return { expiredCount: expiredOrderIds.length, expiredOrderIds };
  }

  return {
    initiate,
    verifyOrCallback,
    handleWebhook,
    getStatusForOrder,
    runExpirySweep,
    listLedger: () => repos.payments.listLedger(),
    listVerifiedOrders: () => repos.payments.listVerifiedOrders(),
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
