import crypto from 'node:crypto';
import type express from 'express';
import { Order, PaymentLedgerEntry } from '../src/types/domain';
import {
  fetchFirebaseOrderForUser,
  getPaymentModeConfig,
  hashToken,
  normalizeMobile,
  resolveMobileSession,
  timingSafeHashEquals,
  verifyFirebaseUser,
} from './auth';
import { ServerPaymentSession, ServerStore } from './persistence';

function findServerOrder(store: ServerStore, orderId: string, orderNo?: string): Order | null {
  if (orderNo && store.data.guestOrders[orderNo]) {
    return store.data.guestOrders[orderNo];
  }
  for (const ord of Object.values(store.data.guestOrders)) {
    if (ord.id === orderId || (orderNo && ord.orderNo === orderNo)) {
      return ord;
    }
  }
  return null;
}

function getCallbackUrl(req: express.Request, orderId: string): string {
  const origin =
    process.env.SITE_URL?.replace(/\/$/, '') ||
    `${(req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'}://${req.headers.host || 'localhost:3000'}`;
  return `${origin}/checkout?paymentCallback=1&orderId=${encodeURIComponent(orderId)}`;
}

async function initiateLiveGateway(
  gateway: 'zarinpal' | 'idpay',
  amountToman: number,
  orderId: string,
  orderNo: string,
  callbackUrl: string,
  mobile?: string
): Promise<{ ok: true; authority: string; redirectUrl?: string } | { ok: false; status: number; message: string }> {
  const amountRial = Math.round(amountToman * 10);
  if (gateway === 'zarinpal') {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID!.trim();
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        callback_url: callbackUrl,
        description: `پرداخت سفارش ${orderNo}`,
        metadata: { order_id: orderNo, mobile },
      }),
    });
    const json = (await res.json()) as { data?: { code?: number; authority?: string }; errors?: unknown };
    if (!res.ok || json.data?.code !== 100 || !json.data.authority) {
      return { ok: false, status: 502, message: 'خطا در برقراری ارتباط با درگاه زرین‌پال.' };
    }
    return {
      ok: true,
      authority: json.data.authority,
      redirectUrl: `https://www.zarinpal.com/pg/StartPay/${json.data.authority}`,
    };
  }

  const apiKey = process.env.IDPAY_API_KEY!.trim();
  const res = await fetch('https://api.idpay.ir/v1.1/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({
      order_id: orderNo || orderId,
      amount: amountRial,
      phone: mobile,
      desc: `پرداخت سفارش ${orderNo}`,
      callback: callbackUrl,
    }),
  });
  const json = (await res.json()) as { id?: string; link?: string };
  if (!res.ok || !json.id) {
    return { ok: false, status: 502, message: 'خطا در برقراری ارتباط با درگاه آیدی‌پی.' };
  }
  return { ok: true, authority: json.id, redirectUrl: json.link };
}

async function verifyLiveGateway(
  session: ServerPaymentSession
): Promise<{ ok: true; refId: string } | { ok: false; status: number; message: string }> {
  const amountRial = Math.round(session.amount * 10);
  if (session.gateway === 'zarinpal') {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID!.trim();
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        authority: session.authority,
      }),
    });
    const json = (await res.json()) as { data?: { code?: number; ref_id?: number | string } };
    if (!res.ok || (json.data?.code !== 100 && json.data?.code !== 101) || !json.data?.ref_id) {
      return { ok: false, status: 400, message: 'تراکنش توسط زرین‌پال تایید نشد.' };
    }
    return { ok: true, refId: String(json.data.ref_id) };
  }

  const apiKey = process.env.IDPAY_API_KEY!.trim();
  const res = await fetch('https://api.idpay.ir/v1.1/payment/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ id: session.authority, order_id: session.orderNo || session.orderId }),
  });
  const json = (await res.json()) as { status?: number; track_id?: string | number };
  if (!res.ok || (json.status !== 100 && json.status !== 101) || !json.track_id) {
    return { ok: false, status: 400, message: 'تراکنش توسط آیدی‌پی تایید نشد.' };
  }
  return { ok: true, refId: String(json.track_id) };
}

export async function handlePaymentInitiate(store: ServerStore, req: express.Request, res: express.Response) {
  const { orderId, orderNo, gateway = 'zarinpal', idempotencyKey } = req.body || {};
  const cleanOrderId = String(orderId || '').trim();
  const cleanOrderNo = String(orderNo || '').trim();
  const cleanGateway: 'zarinpal' | 'idpay' = gateway === 'idpay' ? 'idpay' : 'zarinpal';

  if (!cleanOrderId) {
    return res.status(400).json({ ok: false, message: 'شناسه سفارش برای شروع پرداخت الزامی است.' });
  }

  const modeConfig = getPaymentModeConfig(cleanGateway);
  if (!modeConfig.ok) {
    return res.status(modeConfig.status).json({ ok: false, message: modeConfig.message });
  }

  const key = String(idempotencyKey || `IDEMP-${cleanOrderId}`);
  for (const existing of Object.values(store.data.paymentSessions)) {
    if (existing.idempotencyKey === key) {
      return res.json({
        ok: true,
        reused: true,
        mode: existing.mode,
        session: {
          authority: existing.authority,
          orderId: existing.orderId,
          orderNo: existing.orderNo,
          amount: existing.amount,
          gateway: existing.gateway,
          idempotencyKey: existing.idempotencyKey,
          status: existing.status,
          refId: existing.refId,
          createdAt: existing.createdAt,
        },
      });
    }
  }

  // Look up authoritative order amount (NEVER trust req.body.amount)
  const serverOrder = findServerOrder(store, cleanOrderId, cleanOrderNo);
  const fbUser = await verifyFirebaseUser(req);
  const mobSession = resolveMobileSession(store, req);

  let authoritativeAmount = 0;
  let authoritativeOrderNo = cleanOrderNo;
  let ownerUid: string | undefined;
  let ownerMobile: string | undefined;

  if (serverOrder) {
    if (serverOrder.userId && serverOrder.userId !== 'guest' && !serverOrder.userId.startsWith('mobile:')) {
      if (!fbUser || fbUser.uid !== serverOrder.userId) {
        return res.status(403).json({ ok: false, message: 'شما مجاز به پرداخت این سفارش نیستید.' });
      }
      ownerUid = fbUser.uid;
    } else if (mobSession && normalizeMobile(serverOrder.customerMobile) !== mobSession.mobile) {
      return res.status(403).json({ ok: false, message: 'این سفارش متعلق به شماره موبایل فعلی نیست.' });
    }
    if (serverOrder.status === 'paid' || serverOrder.paymentStatus === 'paid') {
      return res.status(400).json({ ok: false, message: 'این سفارش قبلاً پرداخت و تسویه شده است.' });
    }
    authoritativeAmount = serverOrder.grandTotal;
    authoritativeOrderNo = serverOrder.orderNo;
    ownerMobile = serverOrder.customerMobile;
  } else if (fbUser) {
    const fsOrder = await fetchFirebaseOrderForUser(cleanOrderId, fbUser.idToken);
    if (!fsOrder) {
      return res.status(404).json({ ok: false, message: 'سفارش معتبر در سرور یا Firestore برای استعلام مبلغ یافت نشد.' });
    }
    if (fsOrder.userId !== fbUser.uid) {
      return res.status(403).json({ ok: false, message: 'مالکیت سفارش با کاربر احرازشده مطابقت ندارد.' });
    }
    if (fsOrder.status !== 'pending_payment') {
      return res.status(400).json({ ok: false, message: 'وضعیت فعلی سفارش در انتظار پرداخت آنلاین نیست.' });
    }
    authoritativeAmount = fsOrder.grandTotal;
    authoritativeOrderNo = fsOrder.orderNo || cleanOrderNo;
    ownerUid = fbUser.uid;
    ownerMobile = fsOrder.customerMobile;
  } else {
    return res.status(404).json({
      ok: false,
      message: 'سفارش برای محاسبه مبلغ معتبر در سرور یافت نشد.',
    });
  }

  if (!Number.isFinite(authoritativeAmount) || authoritativeAmount <= 0) {
    return res.status(400).json({ ok: false, message: 'مبلغ قابل پرداخت سفارش نامعتبر است.' });
  }

  let authority = `AUTH-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  let redirectUrl: string | undefined;
  let sandboxToken: string | undefined;
  let sandboxTokenHash: string | undefined;

  if (modeConfig.mode === 'live') {
    const liveInit = await initiateLiveGateway(
      cleanGateway,
      authoritativeAmount,
      cleanOrderId,
      authoritativeOrderNo,
      getCallbackUrl(req, cleanOrderId),
      ownerMobile
    );
    if (!liveInit.ok) {
      return res.status(liveInit.status).json({ ok: false, message: liveInit.message });
    }
    authority = liveInit.authority;
    redirectUrl = liveInit.redirectUrl;
  } else {
    sandboxToken = `SBX-${crypto.randomBytes(16).toString('hex')}`;
    sandboxTokenHash = hashToken(sandboxToken);
  }

  const createdAt = new Date().toISOString();
  const session: ServerPaymentSession = {
    authority,
    orderId: cleanOrderId,
    orderNo: authoritativeOrderNo,
    amount: authoritativeAmount,
    gateway: cleanGateway,
    mode: modeConfig.mode,
    idempotencyKey: key,
    status: 'initiated',
    sandboxTokenHash,
    ownerUid,
    ownerMobile,
    createdAt,
  };

  store.data.paymentSessions[authority] = session;
  store.data.paymentLedger.unshift({
    id: `pay_init_${crypto.randomBytes(6).toString('hex')}`,
    orderId: cleanOrderId,
    orderNo: authoritativeOrderNo,
    gateway: cleanGateway,
    amount: authoritativeAmount,
    idempotencyKey: key,
    refId: authority,
    status: 'initiated',
    createdAt,
  });
  store.save();

  return res.json({
    ok: true,
    mode: modeConfig.mode,
    ...(sandboxToken ? { sandboxToken } : {}),
    ...(redirectUrl ? { redirectUrl } : {}),
    session: {
      authority: session.authority,
      orderId: session.orderId,
      orderNo: session.orderNo,
      amount: session.amount,
      gateway: session.gateway,
      idempotencyKey: session.idempotencyKey,
      status: session.status,
      createdAt: session.createdAt,
    },
  });
}

export async function handlePaymentVerify(store: ServerStore, req: express.Request, res: express.Response) {
  const { authority, status = 'OK', sandboxToken } = req.body || {};
  const cleanAuthority = String(authority || '').trim();
  const session = store.data.paymentSessions[cleanAuthority];

  if (!session) {
    return res.status(404).json({ ok: false, message: 'نشست تراکنش پرداخت یافت نشد.' });
  }

  if (session.status === 'verified') {
    return res.json({
      ok: true,
      alreadyVerified: true,
      refId: session.refId,
      session: {
        authority: session.authority,
        orderId: session.orderId,
        orderNo: session.orderNo,
        amount: session.amount,
        gateway: session.gateway,
        idempotencyKey: session.idempotencyKey,
        status: session.status,
        refId: session.refId,
        createdAt: session.createdAt,
      },
      verifiedOrder: store.data.verifiedOrderStatuses[session.orderId],
    });
  }

  const modeConfig = getPaymentModeConfig(session.gateway);
  if (!modeConfig.ok) {
    return res.status(modeConfig.status).json({ ok: false, message: modeConfig.message });
  }

  if (String(status).toUpperCase() !== 'OK') {
    session.status = 'failed';
    store.data.paymentLedger.unshift({
      id: `pay_fail_${crypto.randomBytes(6).toString('hex')}`,
      orderId: session.orderId,
      orderNo: session.orderNo,
      gateway: session.gateway,
      amount: session.amount,
      idempotencyKey: session.idempotencyKey,
      refId: session.authority,
      status: 'failed',
      createdAt: new Date().toISOString(),
    });
    store.save();
    return res.status(400).json({ ok: false, message: 'پرداخت توسط کاربر لغو یا ناموفق شد.' });
  }

  let refId = '';
  if (session.mode === 'sandbox') {
    if (modeConfig.mode !== 'sandbox') {
      return res.status(403).json({ ok: false, message: 'امکان تایید تراکنش آزمایشی در حالت غیر sandbox وجود ندارد.' });
    }
    const providedToken = String(sandboxToken || '').trim();
    if (!providedToken || !session.sandboxTokenHash || !timingSafeHashEquals(hashToken(providedToken), session.sandboxTokenHash)) {
      return res.status(403).json({
        ok: false,
        message: 'توکن امنیتی تایید تراکنش نامعتبر است (تایید خودکار مسدود شد).',
      });
    }
    refId = String(crypto.randomInt(100000000, 1000000000));
  } else {
    const liveResult = await verifyLiveGateway(session);
    if (!liveResult.ok) {
      session.status = 'failed';
      store.save();
      return res.status(liveResult.status).json({ ok: false, message: liveResult.message });
    }
    refId = liveResult.refId;
  }

  const verifiedAt = new Date().toISOString();
  session.status = 'verified';
  session.refId = refId;
  session.verifiedAt = verifiedAt;
  delete session.sandboxTokenHash;

  const ledgerEntry: PaymentLedgerEntry = {
    id: `pay_${crypto.randomBytes(6).toString('hex')}`,
    orderId: session.orderId,
    orderNo: session.orderNo,
    gateway: session.gateway,
    amount: session.amount,
    idempotencyKey: session.idempotencyKey,
    refId,
    status: 'verified',
    createdAt: verifiedAt,
  };
  store.data.paymentLedger.unshift(ledgerEntry);

  const verifiedOrder = {
    orderId: session.orderId,
    orderNo: session.orderNo,
    status: 'paid' as const,
    paymentStatus: 'paid' as const,
    refId,
    gateway: session.gateway,
    amount: session.amount,
    verifiedAt,
  };
  store.data.verifiedOrderStatuses[session.orderId] = verifiedOrder;

  const guestOrd = findServerOrder(store, session.orderId, session.orderNo);
  if (guestOrd) {
    guestOrd.status = 'paid';
    guestOrd.paymentStatus = 'paid';
    guestOrd.trackingCode = `PAY-${refId}`;
    guestOrd.updatedAt = verifiedAt;
  }

  store.save();

  return res.json({
    ok: true,
    refId,
    verifiedOrder,
    ledgerEntry,
    session: {
      authority: session.authority,
      orderId: session.orderId,
      orderNo: session.orderNo,
      amount: session.amount,
      gateway: session.gateway,
      idempotencyKey: session.idempotencyKey,
      status: session.status,
      refId: session.refId,
      createdAt: session.createdAt,
    },
  });
}
