import express from 'express';
import { extractOrderToken, resolveMobileSession, verifyFirebaseUser } from '../auth';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerStore } from '../persistence';
import type { CallerCredentials, PaymentService } from '../services/paymentService';
import { parseRequestBody, paymentInitiateBodySchema, paymentVerifyBodySchema } from '../validation';

function buildCallbackUrl(req: express.Request, orderId: string): string {
  const configured = process.env.SITE_URL?.trim().replace(/\/$/, '');
  const origin =
    configured ||
    `http://${req.headers.host || '127.0.0.1:3000'}`;
  return `${origin}/api/payments/callback?orderId=${encodeURIComponent(orderId)}`;
}

async function resolveCallerCredentials(store: ServerStore, req: express.Request, bodyToken?: string): Promise<CallerCredentials> {
  const fbUser = await verifyFirebaseUser(req);
  const adminCheck = fbUser ? await verifyFirebaseAdmin(req) : null;
  const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
  const mobSession = resolveMobileSession(store, req);
  const orderToken = bodyToken || extractOrderToken(req);

  return {
    isAdmin,
    firebaseUid: fbUser?.uid,
    mobileSessionPhone: mobSession?.mobile,
    orderToken,
  };
}

export function createPaymentsRouter(store: ServerStore, paymentService: PaymentService): express.Router {
  const router = express.Router();

  // --- Idempotent Payment Gateway Initiate ---
  router.post('/api/payments/initiate', async (req, res) => {
    const parsed = parseRequestBody(paymentInitiateBodySchema, req, res);
    if (!parsed) return;

    const headerKey = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
    const idempotencyKey =
      (typeof headerKey === 'string' && headerKey.trim() ? headerKey.trim() : parsed.idempotencyKey) || undefined;

    const caller = await resolveCallerCredentials(store, req, parsed.orderToken);
    const result = await paymentService.initiate({
      orderId: parsed.orderId,
      orderNo: parsed.orderNo,
      gateway: parsed.gateway,
      idempotencyKey,
      callbackUrl: buildCallbackUrl(req, parsed.orderId),
      caller,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json(result);
  });

  // --- Idempotent Payment Verify ---
  router.post('/api/payments/verify', async (req, res) => {
    const parsed = parseRequestBody(paymentVerifyBodySchema, req, res);
    if (!parsed) return;

    const result = await paymentService.verifyOrCallback({
      authority: parsed.authority,
      status: parsed.status,
      sandboxToken: parsed.sandboxToken,
      expectedAmount: parsed.amount,
      via: 'verify_api',
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json(result);
  });

  // --- Gateway Return Callback Endpoint ---
  router.get('/api/payments/callback', async (req, res) => {
    const orderId = String(req.query.orderId || req.query.order_id || '').trim();
    const authority = String(req.query.Authority || req.query.authority || req.query.id || '').trim();
    const status = String(req.query.Status || req.query.status || 'NOK').trim();
    const sandboxToken = typeof req.query.sandboxToken === 'string' ? req.query.sandboxToken : undefined;
    const rawAmount = req.query.amount !== undefined ? Number(req.query.amount) : undefined;
    const expectedAmount = rawAmount !== undefined && Number.isFinite(rawAmount) ? rawAmount : undefined;
    const wantsJson =
      req.query.format === 'json' ||
      (typeof req.headers.accept === 'string' &&
        req.headers.accept.includes('application/json') &&
        !req.headers.accept.includes('text/html'));

    const result = await paymentService.verifyOrCallback({
      authority,
      status,
      sandboxToken,
      expectedAmount,
      expectedOrderId: orderId || undefined,
      via: 'callback',
    });

    if (wantsJson) {
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, message: result.message });
      }
      return res.json(result);
    }

    const targetOrderId = orderId || (result.ok ? result.session?.orderId || '' : '');
    const qs = new URLSearchParams({
      paymentCallback: '1',
      ...(targetOrderId ? { orderId: targetOrderId } : {}),
      ...(authority ? { authority } : {}),
      status: result.ok ? 'success' : 'failed',
      ...(result.ok && result.refId ? { refId: result.refId } : {}),
      ...(!result.ok ? { message: result.message } : {}),
    });
    return res.redirect(302, `/checkout?${qs.toString()}`);
  });

  // --- Signed Webhook Endpoint (HMAC + Replay Protection) ---
  router.post('/api/payments/webhook/:gateway', async (req, res) => {
    const rawGw = String(req.params.gateway || '').toLowerCase();
    if (rawGw !== 'zarinpal' && rawGw !== 'idpay') {
      return res.status(400).json({ ok: false, message: 'درگاه پرداخت نامعتبر است.' });
    }

    const sigHeader =
      (req.headers['x-webhook-signature'] as string | undefined) ??
      (req.headers['x-signature'] as string | undefined);
    const rawBody =
      typeof (req as express.Request & { rawBody?: string }).rawBody === 'string'
        ? (req as express.Request & { rawBody?: string }).rawBody!
        : JSON.stringify(req.body ?? {});

    const body = (req.body ?? {}) as {
      eventId?: string;
      authority?: string;
      status?: string;
      amount?: number;
      sandboxToken?: string;
      timestamp?: number;
    };

    const result = await paymentService.handleWebhook({
      gateway: rawGw,
      rawBody,
      signatureHeader: sigHeader,
      payload: body,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json(result);
  });

  // --- Authenticated Payment Status Lookup ---
  router.get('/api/payments/status/:orderId', async (req, res) => {
    const caller = await resolveCallerCredentials(store, req);
    const result = await paymentService.getStatusForOrder(String(req.params.orderId || ''), caller);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json(result);
  });

  // --- Admin Payment Ledger ---
  router.get('/api/payments/ledger', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'payments:ledger');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const [entries, verifiedOrderStatuses] = await Promise.all([
      paymentService.listLedger(),
      paymentService.listVerifiedOrders(),
    ]);
    return res.json({
      ok: true,
      entries,
      verifiedOrderStatuses,
    });
  });

  return router;
}
