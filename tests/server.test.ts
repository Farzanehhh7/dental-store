import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

beforeAll(async () => {
  captureEnv(['SMS_PROVIDER', 'PAYMENT_MODE', 'ALLOW_SANDBOX_IN_PROD', 'NODE_ENV', 'SMS_API_KEY', 'ZARINPAL_MERCHANT_ID']);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-test-'));
  const created = await createServerApp({ dataDir: tmpDir, attachVite: false });
  store = created.store;
  await new Promise<void>((resolve) => {
    server = created.app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  restoreEnv();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_PROVIDER = 'sandbox';
  process.env.PAYMENT_MODE = 'sandbox';
  delete process.env.ALLOW_SANDBOX_IN_PROD;
});

afterEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_PROVIDER = 'sandbox';
  process.env.PAYMENT_MODE = 'sandbox';
  delete process.env.ALLOW_SANDBOX_IN_PROD;
});

describe('Server Security, Payment Anti-Forgery, Persistence & API Integration', () => {
  it('fails closed when SMS_PROVIDER or PAYMENT_MODE is unset or sandbox is used in production', async () => {
    delete process.env.SMS_PROVIDER;
    const smsUnset = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '09120001101' }),
    });
    expect(smsUnset.status).toBe(503);

    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'sandbox';
    const smsProdSandbox = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '09120001101' }),
    });
    expect(smsProdSandbox.status).toBe(503);

    process.env.NODE_ENV = 'test';
    delete process.env.PAYMENT_MODE;
    const payUnset = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_missing' }),
    });
    expect(payUnset.status).toBe(503);

    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_MODE = 'sandbox';
    const payProdSandbox = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_missing' }),
    });
    expect(payProdSandbox.status).toBe(503);
  });

  it('completes random sandbox OTP lifecycle with rate-limiting, session cookie, and logout', async () => {
    const mobile = '09123334455';
    const sendRes = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile }),
    });
    expect(sendRes.status).toBe(200);
    const sendJson = (await sendRes.json()) as { ok: boolean; sandboxCode?: string };
    expect(sendJson.ok).toBe(true);
    expect(sendJson.sandboxCode).toMatch(/^\d{6}$/);

    // Rate limit within 30s
    const rateLimitedRes = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile }),
    });
    expect(rateLimitedRes.status).toBe(429);

    // Wrong code fails
    const badVerify = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code: '000000' }),
    });
    expect(badVerify.status).toBe(400);

    // Correct dynamic sandbox code succeeds
    const goodVerify = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code: sendJson.sandboxCode, displayName: 'دکتر تست' }),
    });
    expect(goodVerify.status).toBe(200);
    const setCookie = goodVerify.headers.get('set-cookie') || '';
    expect(setCookie).toContain('dm_mobile_session=');
    const verifyJson = (await goodVerify.json()) as { ok: boolean; sessionToken: string; verifiedToken: string };
    expect(verifyJson.sessionToken).toMatch(/^dm_mob_/);
    expect(verifyJson.verifiedToken).toMatch(/^vtok_/);

    // Cookie/Bearer session resolution
    const cookiePair = setCookie.split(';')[0];
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: cookiePair },
    });
    const sessionJson = (await sessionRes.json()) as { authenticated: boolean; session: { mobile: string } };
    expect(sessionJson.authenticated).toBe(true);
    expect(sessionJson.session.mobile).toBe(mobile);

    // Logout revokes session
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${verifyJson.sessionToken}` },
    });
    expect(logoutRes.status).toBe(200);

    const postLogoutRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${verifyJson.sessionToken}` },
    });
    const postLogoutJson = (await postLogoutRes.json()) as { authenticated: boolean };
    expect(postLogoutJson.authenticated).toBe(false);
  });

  it('rejects unauthenticated and forged /api/seo/sync and /api/payments/ledger calls', async () => {
    const noAuth = await fetch(`${baseUrl}/api/seo/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: [] }),
    });
    expect(noAuth.status).toBe(401);

    const forgedAuth = await fetch(`${baseUrl}/api/seo/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer forged.invalid.jwt',
      },
      body: JSON.stringify({ products: [] }),
    });
    expect([401, 403]).toContain(forgedAuth.status);

    const ledgerNoAuth = await fetch(`${baseUrl}/api/payments/ledger`);
    expect(ledgerNoAuth.status).toBe(401);
  });

  it('computes authoritative checkout prices server-side, blocks call_for_price & tampering, and persists payment verification across restarts', async () => {
    // 1. Reject call_for_price direct checkout
    const callRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'دکتر آزمایشی',
        customerMobile: '09127778899',
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', addressLine: 'خیابان ولیعصر پلاک ۱۰' },
        items: [{ productId: 'prod_endo_motor', variantId: 'var_radar_pro', quantity: 1 }],
      }),
    });
    expect(callRes.status).toBe(400);

    // 2. Reject over-stock quantity
    const overStockRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: 'prod_autoclave_24l', variantId: 'var_auto_24', quantity: 999 }],
      }),
    });
    expect(overStockRes.status).toBe(400);

    // 3. Place valid guest order while passing tampered totals in body (server must ignore client amounts)
    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'کلینیک دندانپزشکی مهر',
        customerMobile: '09127778899',
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        grandTotal: 1,
        subtotal: 1,
        shippingAddress: { province: 'تهران', city: 'تهران', addressLine: 'خیابان سهروردی پلاک ۲۴' },
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      }),
    });
    expect(orderRes.status).toBe(200);
    const { order } = (await orderRes.json()) as {
      order: { id: string; orderNo: string; grandTotal: number; subtotal: number; status: string };
    };
    expect(order.subtotal).toBe(3450000);
    expect(order.grandTotal).toBeGreaterThan(3450000);
    expect(order.status).toBe('pending_payment');

    // 4. Initiate payment with spoofed amount=100; server must enforce authoritative order.grandTotal
    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNo: order.orderNo,
        amount: 100,
        gateway: 'zarinpal',
      }),
    });
    expect(initRes.status).toBe(200);
    const initJson = (await initRes.json()) as {
      ok: boolean;
      sandboxToken: string;
      session: { authority: string; amount: number };
    };
    expect(initJson.session.amount).toBe(order.grandTotal);
    expect(initJson.sandboxToken).toMatch(/^SBX-/);

    // 5. Forged verify without valid sandboxToken must be rejected (403)
    const forgedVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: initJson.session.authority,
        status: 'OK',
        sandboxToken: 'SBX-forged',
      }),
    });
    expect(forgedVerify.status).toBe(403);

    // 6. Real verify with issued sandboxToken succeeds
    const validVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: initJson.session.authority,
        status: 'OK',
        sandboxToken: initJson.sandboxToken,
      }),
    });
    expect(validVerify.status).toBe(200);
    const verifyJson = (await validVerify.json()) as {
      ok: boolean;
      refId: string;
      verifiedOrder: { status: string; amount: number };
    };
    expect(verifyJson.verifiedOrder.status).toBe('paid');
    expect(verifyJson.verifiedOrder.amount).toBe(order.grandTotal);

    // 7. Re-create server pointing to the same dataDir to verify atomic disk persistence
    const restarted = await createServerApp({ dataDir: tmpDir, attachVite: false });
    expect(restarted.store.data.verifiedOrderStatuses[order.id]?.status).toBe('paid');
    expect(restarted.store.data.guestOrders[order.orderNo]?.status).toBe('paid');
  });

  it('returns honest unverified sheets or redirects when verified fileUrl exists on /api/files/certificate', async () => {
    const missingRes = await fetch(`${baseUrl}/api/files/certificate?sku=NON-EXISTENT`);
    expect(missingRes.status).toBe(404);

    const unverifiedRes = await fetch(`${baseUrl}/api/files/certificate?productId=prod_nitrile_gloves`);
    expect(unverifiedRes.status).toBe(200);
    const bodyText = await unverifiedRes.text();
    expect(bodyText).toContain('UNVERIFIED PRODUCT INFORMATION SHEET');

    // Add a product with verified certificate URL in server catalog store
    const baseProd = store.data.catalogState.products[0];
    store.data.catalogState.products.push({
      ...baseProd,
      id: 'prod_verified_cert_test',
      sku: 'DM-TEST-VERIFIED',
      vertical: 'lab',
      files: [
        {
          id: 'f_verified_1',
          type: 'certificate_ce',
          titleFa: 'گواهی رسمی CE آزمایشگاهی',
          code: 'CE-LAB-991',
          fileUrl: 'https://cdn.example.com/certs/verified-ce.pdf',
          isVerified: true,
          issuer: 'TUV Rheinland',
        },
      ],
    });
    store.save();

    const redirectRes = await fetch(`${baseUrl}/api/files/certificate?productId=prod_verified_cert_test`, {
      redirect: 'manual',
    });
    expect(redirectRes.status).toBe(302);
    expect(redirectRes.headers.get('location')).toBe('https://cdn.example.com/certs/verified-ce.pdf');
  });

  it('supports server-side pagination, Persian normalization search, and multi-vertical filtering on /api/catalog/products', async () => {
    const page1Res = await fetch(`${baseUrl}/api/catalog/products?page=1&limit=5`);
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      ok: boolean;
      items: Array<{ id: string }>;
      total: number;
      page: number;
      totalPages: number;
    };
    expect(page1.ok).toBe(true);
    expect(page1.items.length).toBe(5);
    expect(page1.total).toBeGreaterThan(20);
    expect(page1.totalPages).toBeGreaterThan(1);

    const labRes = await fetch(`${baseUrl}/api/catalog/products?vertical=lab`);
    const labJson = (await labRes.json()) as { items: Array<{ id: string; vertical: string }> };
    expect(labJson.items.some((p) => p.id === 'prod_verified_cert_test')).toBe(true);
    expect(labJson.items.every((p) => p.vertical === 'lab')).toBe(true);

    const persianRes = await fetch(`${baseUrl}/api/catalog/products?q=${encodeURIComponent('كامپوزيت')}`);
    const persianJson = (await persianRes.json()) as { items: Array<{ id: string }> };
    expect(persianJson.items.some((p) => p.id === 'prod_composite_3m')).toBe(true);
  });

  it('handles two-way RFQ creation, message thread, and blocks unauthenticated admin quoting', async () => {
    const otpSend = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '09129991122' }),
    });
    const { sandboxCode } = (await otpSend.json()) as { sandboxCode: string };
    const otpVerify = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '09129991122', code: sandboxCode }),
    });
    const { sessionToken } = (await otpVerify.json()) as { sessionToken: string };

    const rfqRes = await fetch(`${baseUrl}/api/rfq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        productId: 'prod_endo_motor',
        variantId: 'var_radar_pro',
        quantity: 2,
        customerName: 'دکتر پارسا',
        customerMobile: '09129991122',
        targetUnitPrice: 38000000,
        note: 'لطفاً قیمت اقساطی ۳ ماهه ارسال شود',
      }),
    });
    expect(rfqRes.status).toBe(200);
    const { rfq } = (await rfqRes.json()) as { rfq: { id: string; messages: unknown[] } };
    expect(rfq.messages.length).toBe(1);

    const msgRes = await fetch(`${baseUrl}/api/rfq/${rfq.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ body: 'نیاز به ارسال فوری در تهران داریم', proposedUnitPrice: 37500000 }),
    });
    expect(msgRes.status).toBe(200);
    const msgJson = (await msgRes.json()) as { rfq: { messages: unknown[] } };
    expect(msgJson.rfq.messages.length).toBe(2);

    const listRes = await fetch(`${baseUrl}/api/rfq`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { rfqs: Array<{ id: string }> };
    expect(listJson.rfqs.some((r) => r.id === rfq.id)).toBe(true);

    // Unauthenticated admin quote must fail
    const unauthQuote = await fetch(`${baseUrl}/api/rfq/${rfq.id}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotedUnitPrice: 39000000 }),
    });
    expect(unauthQuote.status).toBe(401);
  });
});
