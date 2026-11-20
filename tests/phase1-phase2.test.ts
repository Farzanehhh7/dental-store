import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../server';
import { issueWebhookSignature } from '../server/auth';
import type { ServerStore } from '../server/persistence';
import type { PaymentService } from '../server/services/paymentService';
import { migrateGuestOrdersStore } from '../scripts/migrate-guest-orders';

let server: http.Server;
let baseUrl = '';
let tmpDir = '';
let store: ServerStore;
let paymentService: PaymentService;

const savedEnv: Record<string, string | undefined> = {};

function captureEnv(keys: string[]) {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

function installFirebaseMock() {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.idToken === 'valid-admin-id-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'admin_uid_1', email: 'admin@example.com', emailVerified: true, displayName: 'مدیر فروش' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.idToken === 'valid-user-a-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'user_uid_a', email: 'usera@example.com', emailVerified: true, displayName: 'دکتر الف' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.idToken === 'valid-user-b-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'user_uid_b', email: 'userb@example.com', emailVerified: true, displayName: 'دکتر ب' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
    }
    if (url.startsWith('https://firestore.googleapis.com/')) {
      if (url.includes('/documents/admins/admin_uid_1')) {
        return new Response(JSON.stringify({ fields: { role: { stringValue: 'super_admin' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    return realFetch(input, init);
  });
}

async function loginOtp(mobile: string): Promise<string> {
  const sendRes = await fetch(`${baseUrl}/api/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile }),
  });
  const sendJson = (await sendRes.json()) as { sandboxCode: string };
  const verifyRes = await fetch(`${baseUrl}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, code: sendJson.sandboxCode, displayName: 'کاربر آزمایشی' }),
  });
  const verifyJson = (await verifyRes.json()) as { sessionToken: string };
  return verifyJson.sessionToken;
}

function getRotaryVariant() {
  const prod = store.data.catalogState.products.find((p) => p.id === 'prod_rotary_files')!;
  return prod.variants.find((v) => v.id === 'var_rot_25')!;
}

beforeAll(async () => {
  captureEnv(['SMS_PROVIDER', 'PAYMENT_MODE', 'ALLOW_SANDBOX_IN_PROD', 'NODE_ENV', 'SESSION_SECRET', 'PAYMENT_WEBHOOK_SECRET']);
  process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_hmac_secret_32_chars_min';
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase12-'));
  const created = await createServerApp({ dataDir: tmpDir, attachVite: false });
  store = created.store;
  paymentService = created.paymentService;
  await new Promise<void>((resolve) => {
    server = created.app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  restoreEnv();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_PROVIDER = 'sandbox';
  process.env.PAYMENT_MODE = 'sandbox';
  process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_hmac_secret_32_chars_min';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 1 — Unified Orders Store, Server Pricing, State Machine, Auth & Migration', () => {
  it('rejects client-submitted price tampering on /api/orders, /api/orders/guest, /api/admin/orders/manual, and /api/proformas', async () => {
    installFirebaseMock();

    const googleTamper = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
      },
      body: JSON.stringify({
        customerName: 'دکتر الف',
        customerMobile: '09121110001',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1, unitPrice: 100 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست' },
        grandTotal: 100,
      }),
    });
    expect(googleTamper.status).toBe(400);

    const guestTamper = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مهمان',
        customerMobile: '09121110002',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست' },
        subtotal: 500,
      }),
    });
    expect(guestTamper.status).toBe(400);

    const manualTamper = await fetch(`${baseUrl}/api/admin/orders/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-id-token',
      },
      body: JSON.stringify({
        customerName: 'کلینیک تلفنی',
        customerMobile: '09121110003',
        customerGroup: 'clinic',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'bank_transfer',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست' },
        grandTotal: 999,
      }),
    });
    expect(manualTamper.status).toBe(400);

    const proformaFakeMobile = await fetch(`${baseUrl}/api/proformas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
      },
      body: JSON.stringify({
        contactName: 'کلینیک جعلی',
        contactMobile: '09120000000',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      }),
    });
    expect(proformaFakeMobile.status).toBe(400);

    const proformaTamper = await fetch(`${baseUrl}/api/proformas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
      },
      body: JSON.stringify({
        contactName: 'کلینیک واقعی',
        contactMobile: '09123456789',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        grandTotal: 10,
      }),
    });
    expect(proformaTamper.status).toBe(400);
  });

  it('resolves approved B2B group pricing for OTP-logged-in users instead of hardcoding retail', async () => {
    installFirebaseMock();
    const b2bMobile = '09127001122';

    // Admin registers approved clinic B2B status for OTP mobile user
    const grpRes = await fetch(`${baseUrl}/api/admin/users/group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-id-token',
      },
      body: JSON.stringify({
        mobile: b2bMobile,
        customerGroup: 'clinic',
        b2bStatus: 'approved',
        displayName: 'کلینیک نور',
      }),
    });
    expect(grpRes.status).toBe(200);

    const mobToken = await loginOtp(b2bMobile);
    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mobile-Session': mobToken,
      },
      body: JSON.stringify({
        customerName: 'کلینیک نور',
        customerMobile: b2bMobile,
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'جردن' },
      }),
    });
    expect(orderRes.status).toBe(200);
    const { order } = (await orderRes.json()) as {
      order: { customerGroup: string; subtotal: number; source: string; userId: string };
    };
    expect(order.source).toBe('otp');
    expect(order.customerGroup).toBe('clinic');
    expect(order.subtotal).toBe(3150000);
  });

  it('handles idempotent order creation (single stock reservation) and unifies Google, OTP, guest & manual orders in paginated/filtered /api/admin/orders', async () => {
    installFirebaseMock();
    const variant = getRotaryVariant();
    const reservedBefore = variant.reserved;

    const idempKey = `IDEMP-ORDER-${Date.now()}`;
    const payload = {
      customerName: 'دکتر الف',
      customerMobile: '09122223344',
      items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 2 }],
      shippingMethod: 'courier_tehran',
      paymentMethod: 'online',
      shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'ونک' },
    };

    const res1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);
    const j1 = (await res1.json()) as { order: { id: string; source: string }; reused?: boolean };
    expect(j1.order.source).toBe('google');
    expect(j1.reused).toBeUndefined();
    expect(variant.reserved).toBe(reservedBefore + 2);

    // Repeat with same Idempotency-Key -> same order, no extra reservation
    const res2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const j2 = (await res2.json()) as { order: { id: string }; reused?: boolean };
    expect(j2.order.id).toBe(j1.order.id);
    expect(j2.reused).toBe(true);
    expect(variant.reserved).toBe(reservedBefore + 2);

    // Admin list filters by source=google and Jalali date window covering today
    const adminGoogle = await fetch(`${baseUrl}/api/admin/orders?source=google&page=1&limit=5&q=${encodeURIComponent('دکتر الف')}`, {
      headers: { Authorization: 'Bearer valid-admin-id-token' },
    });
    expect(adminGoogle.status).toBe(200);
    const adminJson = (await adminGoogle.json()) as {
      orders: Array<{ id: string; source: string }>;
      total: number;
      page: number;
      totalPages: number;
    };
    expect(adminJson.orders.some((o) => o.id === j1.order.id)).toBe(true);
    expect(adminJson.orders.every((o) => o.source === 'google')).toBe(true);

    // Future Jalali year returns 0 results
    const futureJalali = await fetch(`${baseUrl}/api/admin/orders?fromDate=1499/01/01`, {
      headers: { Authorization: 'Bearer valid-admin-id-token' },
    });
    const futureJson = (await futureJalali.json()) as { total: number };
    expect(futureJson.total).toBe(0);
  });

  it('enforces order cancellation authorization (owner vs stranger) and rejects illegal state machine transitions', async () => {
    installFirebaseMock();
    const variant = getRotaryVariant();

    // User A creates a Google order
    const createRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
      },
      body: JSON.stringify({
        customerName: 'دکتر الف',
        customerMobile: '09123334400',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'سعادت آباد' },
      }),
    });
    const { order } = (await createRes.json()) as { order: { id: string; orderNo: string } };
    const reservedAfterCreate = variant.reserved;

    // Stranger (User B) cannot cancel User A's order
    const strangerCancel = await fetch(`${baseUrl}/api/orders/${order.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-b-token',
      },
      body: JSON.stringify({}),
    });
    expect(strangerCancel.status).toBe(403);

    // Unauthenticated guest cannot cancel with only raw mobile and no token
    const unauthCancel = await fetch(`${baseUrl}/api/orders/${order.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'لغو بدون مجوز' }),
    });
    expect([401, 403]).toContain(unauthCancel.status);

    // Owner cancels -> succeeds and releases reserved stock
    const ownerCancel = await fetch(`${baseUrl}/api/orders/${order.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-a-token',
      },
      body: JSON.stringify({ reason: 'تغییر برنامه خرید' }),
    });
    expect(ownerCancel.status).toBe(200);
    const cancelledJson = (await ownerCancel.json()) as {
      order: { status: string; statusHistory: Array<{ status: string }> };
    };
    expect(cancelledJson.order.status).toBe('cancelled');
    expect(cancelledJson.order.statusHistory.some((h) => h.status === 'cancelled')).toBe(true);
    expect(variant.reserved).toBe(reservedAfterCreate - 1);

    // Admin illegal state transition: cancelled -> paid must fail with 400
    const illegalTransition = await fetch(`${baseUrl}/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-id-token',
      },
      body: JSON.stringify({ status: 'paid' }),
    });
    expect(illegalTransition.status).toBe(400);
  });

  it('migrates legacy guestOrders into unified orders store idempotently and supports dry-run', async () => {
    const migTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-mig-'));
    try {
      const created = await createServerApp({ dataDir: migTmp, attachVite: false });
      const legacyOrder = {
        id: 'ord_legacy_mig_1',
        orderNo: 'DM-LEGACY-100',
        userId: 'guest',
        isGuest: true,
        customerName: 'مهمان قدیمی',
        customerMobile: '09128887766',
        customerGroup: 'retail' as const,
        status: 'pending_payment' as const,
        paymentStatus: 'unpaid' as const,
        paymentMethod: 'online' as const,
        subtotal: 3450000,
        discountTotal: 0,
        shippingTotal: 120000,
        taxTotal: 345000,
        grandTotal: 3915000,
        shippingMethod: 'courier_tehran',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تهران' },
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      delete created.store.data.orders[legacyOrder.id];
      created.store.data.guestOrders = {
        ...(created.store.data.guestOrders ?? {}),
        [legacyOrder.orderNo]: legacyOrder,
      };
      created.store.save();

      const dryStats = migrateGuestOrdersStore(created.store, { dryRun: true });
      expect(dryStats.migrated).toBe(1);
      expect(created.store.data.orders[legacyOrder.id]).toBeUndefined();

      const realStats = migrateGuestOrdersStore(created.store, { dryRun: false });
      expect(realStats.migrated).toBe(1);
      expect(created.store.data.orders[legacyOrder.id]?.source).toBe('guest');
      expect(created.store.data.guestOrders?.[legacyOrder.orderNo]).toBeUndefined();

      // Second run is a clean no-op
      const repeatStats = migrateGuestOrdersStore(created.store, { dryRun: false });
      expect(repeatStats.migrated).toBe(0);
    } finally {
      fs.rmSync(migTmp, { recursive: true, force: true });
    }
  });
});

describe('Phase 2 — Payment Callback, Gateway Verification, Expiry & Signed Webhooks', () => {
  it('handles GET /api/payments/callback atomically, commits stock once, and is idempotent on double callback', async () => {
    const variant = getRotaryVariant();
    const initialOnHand = variant.stockOnHand;
    const initialReserved = variant.reserved;

    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری کالبک',
        customerMobile: '09124445566',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 2 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تهرانپارس' },
      }),
    });
    expect(orderRes.status).toBe(200);
    const { order, orderToken } = (await orderRes.json()) as {
      order: { id: string; orderNo: string; grandTotal: number };
      orderToken: string;
    };
    expect(variant.reserved).toBe(initialReserved + 2);
    expect(variant.stockOnHand).toBe(initialOnHand);

    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Order-Token': orderToken },
      body: JSON.stringify({ orderId: order.id, gateway: 'zarinpal' }),
    });
    expect(initRes.status).toBe(200);
    const initJson = (await initRes.json()) as {
      sandboxToken: string;
      session: { authority: string; amount: number };
    };

    // Tampered amount on callback -> 400
    const badAmountCb = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=${initJson.sandboxToken}&amount=500&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    expect(badAmountCb.status).toBe(400);

    // Tampered sandboxToken on callback -> 403
    const badTokenCb = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=SBX-evil&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    expect(badTokenCb.status).toBe(403);

    // Valid first callback -> 200 & commits stock
    const cb1 = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=${initJson.sandboxToken}&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    expect(cb1.status).toBe(200);
    const cb1Json = (await cb1.json()) as { ok: boolean; refId: string; order: { status: string } };
    expect(cb1Json.ok).toBe(true);
    expect(cb1Json.order.status).toBe('paid');
    expect(variant.stockOnHand).toBe(initialOnHand - 2);
    expect(variant.reserved).toBe(initialReserved);

    // Second callback -> idempotent no-op (stock & ledger not duplicated)
    const cb2 = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=${initJson.sandboxToken}&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    expect(cb2.status).toBe(200);
    const cb2Json = (await cb2.json()) as { alreadyVerified?: boolean; refId: string };
    expect(cb2Json.alreadyVerified).toBe(true);
    expect(cb2Json.refId).toBe(cb1Json.refId);
    expect(variant.stockOnHand).toBe(initialOnHand - 2);
    expect(store.data.paymentLedger.filter((l) => l.orderId === order.id && l.status === 'verified')).toHaveLength(1);

    // Authorized status lookup succeeds and reflects server truth
    const statusRes = await fetch(`${baseUrl}/api/payments/status/${order.id}?orderToken=${encodeURIComponent(orderToken)}`);
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as { paid: boolean; order: { status: string } };
    expect(statusJson.paid).toBe(true);
    expect(statusJson.order.status).toBe('paid');
  });

  it('handles failure callback (NOK) without marking paid or committing stock', async () => {
    const variant = getRotaryVariant();
    const initialOnHand = variant.stockOnHand;

    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری ناموفق',
        customerMobile: '09124445577',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'پاسداران' },
      }),
    });
    const { order, orderToken } = (await orderRes.json()) as { order: { id: string }; orderToken: string };

    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Order-Token': orderToken },
      body: JSON.stringify({ orderId: order.id, gateway: 'idpay' }),
    });
    const { session } = (await initRes.json()) as { session: { authority: string } };

    // Callback browser redirect with NOK -> redirects to /checkout?paymentCallback=1&...&status=failed
    const failRedirect = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${session.authority}&Status=NOK`,
      { redirect: 'manual' }
    );
    expect(failRedirect.status).toBe(302);
    const loc = failRedirect.headers.get('location') || '';
    expect(loc).toContain('paymentCallback=1');
    expect(loc).toContain('status=failed');

    expect(store.data.orders[order.id]?.status).toBe('payment_failed');
    expect(store.data.orders[order.id]?.paymentStatus).not.toBe('paid');
    expect(variant.stockOnHand).toBe(initialOnHand);
  });

  it('expires unpaid orders after deadline and releases reserved stock back', async () => {
    const variant = getRotaryVariant();
    const initialReserved = variant.reserved;

    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری منقضی',
        customerMobile: '09124445588',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 3 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'شهرک غرب' },
      }),
    });
    const { order } = (await orderRes.json()) as { order: { id: string } };
    expect(variant.reserved).toBe(initialReserved + 3);

    // Backdate order.expiresAt into the past and run expiry sweep
    store.data.orders[order.id].expiresAt = new Date(Date.now() - 60_000).toISOString();
    store.save();

    const sweep = await paymentService.runExpirySweep(new Date());
    expect(sweep.expiredOrderIds).toContain(order.id);
    expect(store.data.orders[order.id].status).toBe('expired');
    expect(variant.reserved).toBe(initialReserved);
  });

  it('verifies webhook HMAC signature and enforces replay protection', async () => {
    const variant = getRotaryVariant();
    const initialOnHand = variant.stockOnHand;

    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری وب‌هوک',
        customerMobile: '09124445599',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'فرمانیه' },
      }),
    });
    const { order, orderToken } = (await orderRes.json()) as {
      order: { id: string; grandTotal: number };
      orderToken: string;
    };

    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Order-Token': orderToken },
      body: JSON.stringify({ orderId: order.id, gateway: 'zarinpal' }),
    });
    const { sandboxToken, session } = (await initRes.json()) as {
      sandboxToken: string;
      session: { authority: string; amount: number };
    };

    const webhookPayload = JSON.stringify({
      eventId: `evt_${order.id}_1`,
      authority: session.authority,
      status: 'OK',
      amount: session.amount,
      sandboxToken,
    });

    // Unsigned or bad-signature webhook -> 401
    const badSigRes = await fetch(`${baseUrl}/api/payments/webhook/zarinpal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'deadbeef',
      },
      body: webhookPayload,
    });
    expect(badSigRes.status).toBe(401);

    // Valid HMAC-signed webhook -> 200 & commits stock
    const sig = issueWebhookSignature(webhookPayload, process.env.PAYMENT_WEBHOOK_SECRET!);
    const okSigRes = await fetch(`${baseUrl}/api/payments/webhook/zarinpal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': sig,
      },
      body: webhookPayload,
    });
    expect(okSigRes.status).toBe(200);
    expect(store.data.orders[order.id].status).toBe('paid');
    expect(variant.stockOnHand).toBe(initialOnHand - 1);

    // Replay same eventId -> replayed: true, stock untouched
    const replayRes = await fetch(`${baseUrl}/api/payments/webhook/zarinpal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': sig,
      },
      body: webhookPayload,
    });
    expect(replayRes.status).toBe(200);
    const replayJson = (await replayRes.json()) as { replayed?: boolean };
    expect(replayJson.replayed).toBe(true);
    expect(variant.stockOnHand).toBe(initialOnHand - 1);
  });
});
