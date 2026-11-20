import crypto from 'node:crypto';
import express from 'express';
import type { Order } from '../../src/types/domain';
import { hashToken, normalizeMobile, resolveMobileSession } from '../auth';
import type { ServerStore } from '../persistence';
import { calculateAuthoritativeCheckout } from '../pricing';
import {
  checkoutCalculateBodySchema,
  guestOrderBodySchema,
  mobileOrdersQuerySchema,
  parseRequestBody,
  parseRequestQuery,
} from '../validation';

export function createCheckoutRouter(store: ServerStore): express.Router {
  const router = express.Router();

  // --- Authoritative Cart / Checkout Pricing Verification (§8.2 / §16) ---
  router.post('/api/checkout/calculate', (req, res) => {
    const parsed = parseRequestBody(checkoutCalculateBodySchema, req, res);
    if (!parsed) return;

    const calc = calculateAuthoritativeCheckout(store.data.catalogState, {
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

  // --- Authoritative Guest & Mobile-Authenticated Order Placement ---
  router.post('/api/orders/guest', (req, res) => {
    const parsed = parseRequestBody(guestOrderBodySchema, req, res);
    if (!parsed) return;

    const customerName = parsed.customerName;
    const customerMobile = normalizeMobile(parsed.customerMobile);
    const items = parsed.items;
    const shippingMethod = parsed.shippingMethod;
    const paymentMethod = parsed.paymentMethod as Order['paymentMethod'];
    const couponCode = parsed.couponCode;
    const shippingAddress = parsed.shippingAddress;
    const verifiedToken = parsed.verifiedToken || '';

    if (!customerName || !/^09\d{9}$/.test(customerMobile)) {
      return res.status(400).json({ ok: false, message: 'نام و شماره موبایل معتبر برای ثبت سفارش الزامی است.' });
    }

    const mobSession = resolveMobileSession(store, req);
    let authenticatedMobile: string | null = mobSession ? mobSession.mobile : null;
    if (verifiedToken) {
      const vHash = hashToken(verifiedToken);
      const vRecord = store.data.otpVerifiedTokens[vHash];
      if (!vRecord || Date.now() > vRecord.expiresAt || vRecord.mobile !== customerMobile) {
        return res.status(403).json({ ok: false, message: 'توکن تایید شماره موبایل نامعتبر یا منقضی شده است.' });
      }
      authenticatedMobile = vRecord.mobile;
      vRecord.consumedAt = new Date().toISOString();
    }

    const calc = calculateAuthoritativeCheckout(store.data.catalogState, {
      items,
      customerGroup: 'retail',
      couponCode,
      shippingMethod,
    });
    if (!calc.ok) {
      return res.status(calc.status).json({ ok: false, message: calc.message });
    }

    const ALLOWED_PAYMENT_METHODS: Order['paymentMethod'][] = [
      'online',
      'cash_on_delivery',
      'bank_transfer',
      'credit_request',
      'cheque_request',
      'installment_request',
    ];
    const safePaymentMethod = ALLOWED_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'online';
    const initialStatus: Order['status'] =
      safePaymentMethod === 'online' ? 'pending_payment' : 'awaiting_review';
    const initialPaymentStatus: Order['paymentStatus'] =
      safePaymentMethod === 'credit_request' ||
      safePaymentMethod === 'cheque_request' ||
      safePaymentMethod === 'installment_request'
        ? 'pending_credit'
        : 'unpaid';

    const now = new Date().toISOString();
    const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const orderNo = `DM-${new Date().getFullYear()}-${crypto.randomInt(10000, 100000)}`;

    const order: Order = {
      id: orderId,
      orderNo,
      userId: authenticatedMobile ? `mobile:${authenticatedMobile}` : 'guest',
      isGuest: !authenticatedMobile,
      customerName,
      customerMobile,
      customerGroup: 'retail',
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      paymentMethod: safePaymentMethod,
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      shippingTotal: calc.shippingTotal,
      taxTotal: calc.taxTotal,
      grandTotal: calc.grandTotal,
      ...(couponCode ? { couponCode } : {}),
      shippingMethod: calc.shippingMethod,
      shippingAddress: {
        province: String(shippingAddress.province || 'تهران').slice(0, 60),
        city: String(shippingAddress.city || 'تهران').slice(0, 60),
        postalCode: String(shippingAddress.postalCode || '').slice(0, 20),
        addressLine: String(shippingAddress.addressLine || '').slice(0, 400),
      },
      customerNote: parsed.customerNote,
      items: calc.items,
      createdAt: now,
      updatedAt: now,
    };

    store.data.guestOrders[order.orderNo] = order;
    store.save();

    return res.json({ ok: true, order });
  });

  router.get('/api/orders/mobile', (req, res) => {
    const query = parseRequestQuery(mobileOrdersQuerySchema, req, res);
    if (!query) return;

    const mobSession = resolveMobileSession(store, req);
    if (!mobSession) {
      return res.status(401).json({ ok: false, message: 'برای مشاهده سفارش‌های موبایلی ابتدا با کد تایید وارد شوید.' });
    }
    let orders = Object.values(store.data.guestOrders)
      .filter((o) => normalizeMobile(o.customerMobile) === mobSession.mobile)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (query.status) {
      orders = orders.filter((o) => o.status === query.status);
    }
    if (query.limit) {
      orders = orders.slice(0, query.limit);
    }
    return res.json({ ok: true, mobile: mobSession.mobile, orders });
  });

  router.get('/api/orders/track', (req, res) => {
    const orderNo = String(req.query.orderNo || '').trim();
    const mobile = normalizeMobile(String(req.query.mobile || ''));
    const order = store.data.guestOrders[orderNo];
    if (!order || normalizeMobile(order.customerMobile) !== mobile) {
      return res.status(404).json({ ok: false, message: 'سفارشی با این شماره پیگیری و موبایل یافت نشد.' });
    }
    return res.json({ ok: true, order });
  });

  return router;
}
