import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../server';
import type { ServerStore } from '../server/persistence';

let server: http.Server;
let baseUrl = '';
let tmpDir = '';
let store: ServerStore;

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
            users: [{ localId: 'admin_uid_1', email: 'admin@example.com', emailVerified: true, displayName: 'مدیر' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.idToken === 'valid-user-id-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'user_uid_1', email: 'user@example.com', emailVerified: true, displayName: 'دکتر الف' }],
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
      if (url.includes('/documents/orders/ord_tampered_1')) {
        return new Response(
          JSON.stringify({
            fields: {
              id: { stringValue: 'ord_tampered_1' },
              orderNo: { stringValue: 'DM-1405-99999' },
              userId: { stringValue: 'user_uid_1' },
              customerMobile: { stringValue: '09121112233' },
              status: { stringValue: 'pending_payment' },
              paymentStatus: { stringValue: 'unpaid' },
              grandTotal: { integerValue: '1' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    return realFetch(input, init);
  });
}

beforeAll(async () => {
  captureEnv(['SMS_PROVIDER', 'PAYMENT_MODE', 'ALLOW_SANDBOX_IN_PROD', 'NODE_ENV', 'SESSION_SECRET']);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase0-'));
  const created = await createServerApp({ dataDir: tmpDir, attachVite: false });
  store = created.store;
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 0 Failing Regression Tests (Audit Verification — Expected RED)', () => {
  it('[Claim 1] guest/OTP orders created via POST /api/orders/guest are visible via GET /api/admin/orders', async () => {
    installFirebaseMock();
    const createRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مهمان تست',
        customerMobile: '09125551122',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'خیابان ولیعصر' },
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { order: { id: string; orderNo: string } };

    const adminRes = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { Authorization: 'Bearer valid-admin-id-token' },
    });
    expect(adminRes.status).toBe(200);
    const adminJson = (await adminRes.json()) as { orders: Array<{ id: string }> };
    expect(adminJson.orders.some((o) => o.id === created.order.id)).toBe(true);
  });

  it('[Claim 2] frontend handles gateway return (?paymentCallback=1) and avoids localStorage payment overlay', () => {
    const checkoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/CartCheckoutPages.tsx'), 'utf8');
    const ordersSource = fs.readFileSync(path.resolve(process.cwd(), 'src/context/orders.tsx'), 'utf8');

    expect(checkoutSource).toContain('paymentCallback');
    expect(ordersSource).not.toContain('applyVerifiedPaymentOverlay');
  });

  it('[Claim 3] guest/mobile user can cancel a pending order on the server (POST /api/orders/:orderNo/cancel)', async () => {
    const createRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مهمان لغو',
        customerMobile: '09125553344',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'میدان ونک' },
      }),
    });
    const { order, orderToken } = (await createRes.json()) as { order: { orderNo: string }; orderToken: string };

    const cancelRes = await fetch(`${baseUrl}/api/orders/${order.orderNo}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderToken }),
    });
    expect(cancelRes.status).toBe(200);
    const trackRes = await fetch(`${baseUrl}/api/orders/track?orderNo=${order.orderNo}&mobile=09125553344`);
    const trackJson = (await trackRes.json()) as { order: { status: string } };
    expect(trackJson.order.status).toBe('cancelled');
  });

  it('[Claim 4] order creation atomically reserves/decrements stock and prevents concurrent oversell', async () => {
    const prod = store.data.catalogState.products.find((p) => p.id === 'prod_rotary_files')!;
    const variant = prod.variants.find((v) => v.id === 'var_rot_25')!;
    const initialAvail = variant.stockOnHand - variant.reserved;
    const takeEach = Math.floor(initialAvail * 0.75);
    expect(takeEach * 2).toBeGreaterThan(initialAvail);

    const makeBody = (mobile: string) =>
      JSON.stringify({
        customerName: 'تست موجودی',
        customerMobile: mobile,
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: takeEach }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست انبار' },
      });

    const first = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: makeBody('09126660001'),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: makeBody('09126660002'),
    });
    expect(second.status).toBe(400);
  });

  it('[Claim 5] server rejects tampered Firestore order grandTotal=1 on payment initiate & rules forbid direct client order creation', async () => {
    installFirebaseMock();
    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const ordersBlock = rulesText.match(/match \/orders\/\{orderId\}\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '';
    // Clients must not directly create /orders documents
    expect(ordersBlock).not.toMatch(/allow create:\s*if\s*isVerified\(\)/);
    expect(ordersBlock).toContain('allow create, update, delete: if false;');

    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-id-token',
      },
      body: JSON.stringify({ orderId: 'ord_tampered_1', gateway: 'zarinpal' }),
    });
    const initJson = (await initRes.json()) as { ok: boolean; session?: { amount: number } };
    expect(initRes.status >= 400 || (initJson.session?.amount ?? 0) > 1).toBe(true);
  });

  it('[Claim 6] server exposes authoritative proforma endpoint and UI does not fallback to fake 09120000000 mobile', async () => {
    const cartCheckoutSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/CartCheckoutPages.tsx'), 'utf8');
    const productPageSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/ProductPage.tsx'), 'utf8');
    expect(cartCheckoutSrc).not.toContain('09120000000');
    expect(productPageSrc).not.toContain('۰۹۱۲۰۰۰۰۰۰۰');

    const res = await fetch(`${baseUrl}/api/proformas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }] }),
    });
    expect(res.status).not.toBe(404);
  });

  it('[Claim 7] AdminReportsPage implements dedicated handlers for all 29 REPORT_CATALOG reports and passes blogPosts to auditSeoHealth', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/admin/AdminReportsPage.tsx'), 'utf8');
    const catalogIds = Array.from(src.matchAll(/\{\s*id:\s*'([a-z0-9_]+)',\s*group:/g)).map((m) => m[1]);
    const switchCases = Array.from(src.matchAll(/case\s+'([a-z0-9_]+)':/g)).map((m) => m[1]);

    expect(catalogIds).toHaveLength(29);
    const missing = catalogIds.filter((id) => !switchCases.includes(id));
    expect(missing).toEqual([]);
    expect(src).not.toContain('auditSeoHealth(products, categories, [])');
  });

  it('[Claim 8] AdminImportExportPage branches validation and commit logic by templateKey', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/admin/AdminImportExportPage.tsx'), 'utf8');
    const validateFn = src.slice(src.indexOf('const runValidationFromMatrix'), src.indexOf('const handleFileUpload'));
    const commitFn = src.slice(src.indexOf('const handleCommitImport'), src.indexOf('return ('));
    expect(validateFn).toContain('templateKey');
    expect(commitFn).toContain('templateKey');
  });

  it('[Claim 9] firestore.rules forbids unauthenticated public create/update on notFoundLogs', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const block = rules.match(/match \/notFoundLogs\/\{logId\}[\s\S]*?\n    \}/)?.[0] || '';
    expect(block).toMatch(/allow create,\s*update:\s*if\s*.*isAdmin\(\)/);
  });

  it('[Claim 11] /api/seo/sync rejects malformed catalog payloads instead of accepting arbitrary z.record objects', async () => {
    installFirebaseMock();
    const prevProducts = store.data.catalogState.products;
    try {
      const res = await fetch(`${baseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-admin-id-token',
        },
        body: JSON.stringify({
          products: [{ malformedOnly: true }],
        }),
      });
      expect(res.status).toBe(400);
    } finally {
      store.data.catalogState.products = prevProducts;
      store.save();
    }
  });

  it('[Claim 12] /api/orders/guest resolves authenticated B2B/clinic group pricing rather than hardcoding retail', () => {
    const checkoutRoutesSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/checkout.routes.ts'), 'utf8');
    expect(checkoutRoutesSrc).not.toMatch(/customerGroup:\s*'retail'\s*,?\s*\n\s*couponCode/);
  });

  it('[Claim 13] sitemap.xml includes sitemap-pages.xml and sitemap-products.xml includes image entries', async () => {
    const indexRes = await fetch(`${baseUrl}/sitemap.xml`);
    const indexXml = await indexRes.text();
    expect(indexXml).toContain('sitemap-pages.xml');

    const pagesRes = await fetch(`${baseUrl}/sitemap-pages.xml`);
    expect(pagesRes.status).toBe(200);
    expect(pagesRes.headers.get('content-type')).toContain('xml');

    const prodRes = await fetch(`${baseUrl}/sitemap-products.xml`);
    const prodXml = await prodRes.text();
    expect(prodXml).toContain('xmlns:image=');
  });

  it('[Claim 14] GET redirect hit does not call synchronous store.save() on every read request', async () => {
    store.data.catalogState.redirects.push({
      id: 'red_test_sync',
      fromPath: '/old-phase0-path',
      toPath: '/category/consumables',
      statusCode: 301,
      hitCount: 0,
      createdAt: new Date().toISOString(),
    });
    const saveSpy = vi.spyOn(store, 'save');
    const res = await fetch(`${baseUrl}/old-phase0-path`, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('[Missed Security A] POST /api/payments/initiate idempotency reuse requires ownership/auth and allows retry after failed session', async () => {
    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری پرداخت',
        customerMobile: '09127778899',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'سعادت آباد' },
      }),
    });
    expect(orderRes.status).toBe(200);
    const { order } = (await orderRes.json()) as { order: { id: string; orderNo: string } };

    // Attacker calls initiate first or guesses predictable IDEMP-${orderId} without credentials
    const firstInit = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, orderNo: order.orderNo, idempotencyKey: `IDEMP-${order.id}` }),
    });
    // Must not issue a payment session to an unauthenticated caller who has neither OTP session nor Firebase user
    expect([401, 403]).toContain(firstInit.status);
  });

  it('[Missed Security B] GET /api/payments/status/:orderId does not leak payment refId/amount unauthenticated', async () => {
    store.data.verifiedOrderStatuses['ord_secret_1'] = {
      orderId: 'ord_secret_1',
      orderNo: 'DM-1405-88888',
      status: 'paid',
      paymentStatus: 'paid',
      refId: '998877665',
      gateway: 'zarinpal',
      amount: 5000000,
      verifiedAt: new Date().toISOString(),
    };
    const res = await fetch(`${baseUrl}/api/payments/status/ord_secret_1`);
    expect([401, 403]).toContain(res.status);
  });

  it('[Missed Functional C] POST /api/orders/guest increments coupon.usageCount so single-use coupon cannot be reused', async () => {
    store.data.catalogState.coupons.push({
      id: 'cpn_single_use',
      code: 'ONCEONLY',
      type: 'fixed',
      value: 100000,
      minOrderAmount: 100000,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      usageLimit: 1,
      usageCount: 0,
      isActive: true,
    });

    const place = (mobile: string) =>
      fetch(`${baseUrl}/api/orders/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'مشتری کوپن',
          customerMobile: mobile,
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
          couponCode: 'ONCEONLY',
          shippingMethod: 'courier_tehran',
          paymentMethod: 'online',
          shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'جردن' },
        }),
      });

    const firstRes = await place('09128880001');
    expect(firstRes.status).toBe(200);
    const first = (await firstRes.json()) as { order: { discountTotal: number } };
    expect(first.order.discountTotal).toBe(100000);

    const secondRes = await place('09128880002');
    expect(secondRes.status).toBe(200);
    const second = (await secondRes.json()) as { order: { discountTotal: number } };
    expect(second.order.discountTotal).toBe(0);
  });
});
