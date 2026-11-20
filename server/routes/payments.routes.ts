import express from 'express';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import { handlePaymentInitiate, handlePaymentVerify } from '../payments';
import type { ServerStore } from '../persistence';
import { parseRequestBody, paymentInitiateBodySchema, paymentVerifyBodySchema } from '../validation';

export function createPaymentsRouter(store: ServerStore): express.Router {
  const router = express.Router();

  // --- Idempotent Payment Gateway Initiate & Verify (§8.3) ---
  router.post('/api/payments/initiate', (req, res) => {
    const parsed = parseRequestBody(paymentInitiateBodySchema, req, res);
    if (!parsed) return;
    req.body = parsed;
    return handlePaymentInitiate(store, req, res);
  });

  router.post('/api/payments/verify', (req, res) => {
    const parsed = parseRequestBody(paymentVerifyBodySchema, req, res);
    if (!parsed) return;
    req.body = parsed;
    return handlePaymentVerify(store, req, res);
  });

  router.get('/api/payments/status/:orderId', (req, res) => {
    const orderId = String(req.params.orderId || '').trim();
    const verified = store.data.verifiedOrderStatuses[orderId];
    if (!verified) {
      return res.json({ ok: true, paid: false, verifiedOrder: null });
    }
    return res.json({ ok: true, paid: true, verifiedOrder: verified });
  });

  router.get('/api/payments/ledger', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    return res.json({
      ok: true,
      entries: store.data.paymentLedger,
      verifiedOrderStatuses: store.data.verifiedOrderStatuses,
    });
  });

  return router;
}
