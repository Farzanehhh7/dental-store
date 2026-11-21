import express from 'express';
import type { Order } from '../../src/types/domain';
import {
  extractOrderToken,
  hashToken,
  normalizeMobile,
  resolveMobileSession,
  verifyFirebaseUser,
} from '../auth';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerStore } from '../persistence';
import { calculateAuthoritativeCheckout } from '../pricing';
import type { OrderService } from '../services/orderService';
import {
  authenticatedOrderBodySchema,
  cancelOrderBodySchema,
  checkoutCalculateBodySchema,
  guestOrderBodySchema,
  mobileOrdersQuerySchema,
  parseRequestBody,
  parseRequestQuery,
  proformaCreateBodySchema,
} from '../validation';

function extractIdempotencyKey(req: express.Request, bodyKey?: string): string | undefined {
  const headerVal = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (typeof headerVal === 'string' && headerVal.trim()) {
    return headerVal.trim();
  }
  if (typeof bodyKey === 'string' && bodyKey.trim()) {
    return bodyKey.trim();
  }
  return undefined;
}

export function createCheckoutRouter(store: ServerStore, orderService: OrderService): express.Router {
  const router = express.Router();

  // --- Authoritative Cart / Checkout Pricing Verification ---
  router.post('/api/checkout/calculate', async (req, res) => {
    const parsed = parseRequestBody(checkoutCalculateBodySchema, req, res);
    if (!parsed) return;

    const snapshot = await orderService.catalogRepo.getSnapshot();
    const calc = calculateAuthoritativeCheckout(snapshot, {
      items: parsed.items,
      customerGroup: parsed.customerGroup,
      couponCode: parsed.couponCode,
      shippingMethod: parsed.shippingMethod,
      userId: parsed.userId,
    });
    if (!calc.ok) {
      return res.status(calc.status).json({ ok: false, message: calc.message });
    }
    return res.json(calc);
  });

  // --- Authenticated Firebase User Order Placement (Single Source of Truth) ---
  router.post('/api/orders', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    if (!fbUser) {
      return res.status(401).json({ ok: false, message: 'برای ثبت سفارش کاربری لطفاً وارد حساب گوگل شوید.' });
    }

    const parsed = parseRequestBody(authenticatedOrderBodySchema, req, res);
    if (!parsed) return;

    const result = await orderService.createOrder({
      source: 'google',
      userId: fbUser.uid,
      isGuest: false,
      customerName: parsed.customerName,
      customerMobile: parsed.customerMobile,
      items: parsed.items,
      shippingMethod: parsed.shippingMethod,
      paymentMethod: parsed.paymentMethod as Order['paymentMethod'],
      couponCode: parsed.couponCode,
      shippingAddress: {
        province: parsed.shippingAddress.province,
        city: parsed.shippingAddress.city,
        postalCode: parsed.shippingAddress.postalCode,
        addressLine: parsed.shippingAddress.addressLine,
      },
      customerNote: parsed.customerNote,
      idempotencyKey: extractIdempotencyKey(req, parsed.idempotencyKey),
      clientTotals: {
        subtotal: parsed.subtotal,
        discountTotal: parsed.discountTotal,
        shippingTotal: parsed.shippingTotal,
        taxTotal: parsed.taxTotal,
        grandTotal: parsed.grandTotal,
      },
      actorId: fbUser.uid,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }

    return res.json({
      ok: true,
      ...(result.data.reused ? { reused: true } : {}),
      order: result.data.order,
      orderToken: result.data.orderToken,
    });
  });

  // --- Guest & Mobile-OTP Authenticated Order Placement ---
  router.post('/api/orders/guest', async (req, res) => {
    const parsed = parseRequestBody(guestOrderBodySchema, req, res);
    if (!parsed) return;

    const customerMobile = normalizeMobile(parsed.customerMobile);
    if (!parsed.customerName.trim() || !/^09\d{9}$/.test(customerMobile)) {
      return res.status(400).json({ ok: false, message: 'نام و شماره موبایل معتبر برای ثبت سفارش الزامی است.' });
    }

    const mobSession = resolveMobileSession(store, req);
    let authenticatedMobile: string | null = mobSession ? mobSession.mobile : null;

    if (parsed.verifiedToken) {
      const vHash = hashToken(parsed.verifiedToken);
      const vRecord = store.data.otpVerifiedTokens[vHash];
      if (!vRecord || Date.now() > vRecord.expiresAt || vRecord.mobile !== customerMobile) {
        return res.status(403).json({ ok: false, message: 'توکن تایید شماره موبایل نامعتبر یا منقضی شده است.' });
      }
      authenticatedMobile = vRecord.mobile;
      vRecord.consumedAt = new Date().toISOString();
      store.save();
    }

    const source = authenticatedMobile ? 'otp' : 'guest';
    const userId = authenticatedMobile ? `mobile:${authenticatedMobile}` : 'guest';

    const result = await orderService.createOrder({
      source,
      userId,
      isGuest: !authenticatedMobile,
      customerName: parsed.customerName,
      customerMobile,
      items: parsed.items,
      shippingMethod: parsed.shippingMethod,
      paymentMethod: parsed.paymentMethod as Order['paymentMethod'],
      couponCode: parsed.couponCode,
      shippingAddress: {
        province: parsed.shippingAddress.province,
        city: parsed.shippingAddress.city,
        postalCode: parsed.shippingAddress.postalCode,
        addressLine: parsed.shippingAddress.addressLine,
      },
      customerNote: parsed.customerNote,
      idempotencyKey: extractIdempotencyKey(req, parsed.idempotencyKey),
      clientTotals: {
        subtotal: parsed.subtotal,
        discountTotal: parsed.discountTotal,
        shippingTotal: parsed.shippingTotal,
        taxTotal: parsed.taxTotal,
        grandTotal: parsed.grandTotal,
      },
      actorId: userId,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }

    return res.json({
      ok: true,
      ...(result.data.reused ? { reused: true } : {}),
      order: result.data.order,
      orderToken: result.data.orderToken,
    });
  });

  // --- List Orders for Signed-In Google User ---
  router.get('/api/orders/mine', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    if (!fbUser) {
      return res.status(401).json({ ok: false, message: 'احراز هویت کاربری الزامی است.' });
    }
    const orders = await orderService.listOrdersForUser(fbUser.uid);
    return res.json({ ok: true, orders });
  });

  // --- List Orders for Mobile-OTP User ---
  router.get('/api/orders/mobile', async (req, res) => {
    const query = parseRequestQuery(mobileOrdersQuerySchema, req, res);
    if (!query) return;

    const mobSession = resolveMobileSession(store, req);
    if (!mobSession) {
      return res.status(401).json({ ok: false, message: 'برای مشاهده سفارش‌های موبایلی ابتدا با کد تایید وارد شوید.' });
    }
    const orders = await orderService.listOrdersForMobile(mobSession.mobile, {
      status: query.status,
      limit: query.limit,
    });
    return res.json({ ok: true, mobile: mobSession.mobile, orders });
  });

  // --- Guest Order Tracking (Unified Orders Store) ---
  router.get('/api/orders/track', async (req, res) => {
    const orderNo = String(req.query.orderNo || '').trim();
    const mobile = normalizeMobile(String(req.query.mobile || ''));
    if (!orderNo || !mobile) {
      return res.status(400).json({ ok: false, message: 'شماره سفارش و شماره موبایل الزامی است.' });
    }
    const order = await orderService.trackOrder(orderNo, mobile);
    if (!order) {
      return res.status(404).json({ ok: false, message: 'سفارشی با این شماره پیگیری و موبایل یافت نشد.' });
    }
    return res.json({ ok: true, order });
  });

  // --- Cancel Order (Enforces Owner Token/Session/UID/Admin + State Machine + Stock Release) ---
  router.post('/api/orders/:id/cancel', async (req, res) => {
    const parsed = parseRequestBody(cancelOrderBodySchema, req, res);
    if (!parsed) return;

    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'orders:update_status') : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
    const mobSession = resolveMobileSession(store, req);
    const orderToken = parsed.orderToken || extractOrderToken(req);

    const result = await orderService.cancelOrder({
      idOrNo: String(req.params.id || ''),
      isAdmin,
      firebaseUid: fbUser?.uid,
      mobileSessionPhone: mobSession?.mobile,
      orderToken,
      reason: parsed.reason,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, order: result.data });
  });

  // --- Authoritative Server Proforma Creation & Response ---
  router.post('/api/proformas', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    const mobSession = resolveMobileSession(store, req);
    if (!fbUser && !mobSession) {
      return res.status(401).json({ ok: false, message: 'برای صدور پیش‌فاکتور رسمی لطفاً ابتدا وارد حساب کاربری یا نشست موبایلی شوید.' });
    }

    const parsed = parseRequestBody(proformaCreateBodySchema, req, res);
    if (!parsed) return;

    const userId = fbUser ? fbUser.uid : `mobile:${mobSession!.mobile}`;
    const result = await orderService.createProforma({
      userId,
      contactName: parsed.contactName,
      contactMobile: parsed.contactMobile,
      clinicName: parsed.clinicName,
      termsFa: parsed.termsFa,
      requestedCustomerGroup: parsed.customerGroup,
      items: parsed.items,
      clientTotals: {
        subtotal: parsed.subtotal,
        discountTotal: parsed.discountTotal,
        taxTotal: parsed.taxTotal,
        grandTotal: parsed.grandTotal,
      },
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, proforma: result.data });
  });

  router.get('/api/proformas', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    const mobSession = resolveMobileSession(store, req);
    if (!fbUser && !mobSession) {
      return res.status(401).json({ ok: false, message: 'احراز هویت الزامی است.' });
    }
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'proforma:read_all') : null;
    if (adminCheck && !('errorStatus' in adminCheck)) {
      const proformas = await orderService.proformaRepo.listAll();
      return res.json({ ok: true, proformas });
    }
    const userId = fbUser ? fbUser.uid : `mobile:${mobSession!.mobile}`;
    const proformas = await orderService.proformaRepo.listByUser(userId);
    return res.json({ ok: true, proformas });
  });

  router.post('/api/proformas/:id/respond', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    const mobSession = resolveMobileSession(store, req);
    if (!fbUser && !mobSession) {
      return res.status(401).json({ ok: false, message: 'احراز هویت الزامی است.' });
    }
    const decision = req.body?.status;
    if (decision !== 'accepted' && decision !== 'rejected') {
      return res.status(400).json({ ok: false, message: 'وضعیت پاسخ باید accepted یا rejected باشد.' });
    }
    const pf = await orderService.proformaRepo.getById(String(req.params.id || ''));
    if (!pf) {
      return res.status(404).json({ ok: false, message: 'پیش‌فاکتور یافت نشد.' });
    }
    const callerUid = fbUser ? fbUser.uid : `mobile:${mobSession!.mobile}`;
    if (pf.userId !== callerUid) {
      return res.status(403).json({ ok: false, message: 'شما مجاز به پاسخ‌گویی به این پیش‌فاکتور نیستید.' });
    }
    const updated = { ...pf, status: decision, updatedAt: new Date().toISOString() };
    await orderService.proformaRepo.save(updated);
    return res.json({ ok: true, proforma: updated });
  });

  return router;
}
