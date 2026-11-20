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
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

beforeAll(async () => {
  captureEnv([
    'SMS_PROVIDER',
    'PAYMENT_MODE',
    'ALLOW_SANDBOX_IN_PROD',
    'NODE_ENV',
    'SMS_API_KEY',
    'ZARINPAL_MERCHANT_ID',
    'SESSION_SECRET',
    'TRUST_PROXY',
    'ALLOWED_ORIGINS',
    'RATE_LIMIT_OTP_MAX',
    'RATE_LIMIT_WINDOW_MS',
  ]);
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
          fileSizeLabel: '1.2 MB',
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

  it('refuses startup in production without a >=32 char SESSION_SECRET', async () => {
    const prodTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-prod-secret-'));
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      await expect(createServerApp({ dataDir: prodTmp, attachVite: false })).rejects.toThrow(/SESSION_SECRET/);

      process.env.SESSION_SECRET = 'too-short-secret';
      await expect(createServerApp({ dataDir: prodTmp, attachVite: false })).rejects.toThrow(/SESSION_SECRET/);

      process.env.SESSION_SECRET = 'a'.repeat(32);
      const valid = await createServerApp({ dataDir: prodTmp, attachVite: false });
      expect(valid.app).toBeDefined();
    } finally {
      process.env.NODE_ENV = 'test';
      delete process.env.SESSION_SECRET;
      fs.rmSync(prodTmp, { recursive: true, force: true });
    }
  });

  it('sets Secure on dm_mobile_session cookie in production and behind TRUST_PROXY HTTPS', async () => {
    const prodTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-cookie-prod-'));
    const proxyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-cookie-proxy-'));
    let prodServer: http.Server | null = null;
    let proxyServer: http.Server | null = null;

    try {
      // 1. Production mode forces Secure attribute on set and clear
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'prod-secret-key-with-more-than-32-characters';
      process.env.SMS_PROVIDER = 'sandbox';
      process.env.ALLOW_SANDBOX_IN_PROD = 'true';

      const prodApp = await createServerApp({ dataDir: prodTmp, attachVite: false });
      const prodUrl = await new Promise<string>((resolve) => {
        prodServer = prodApp.app.listen(0, '127.0.0.1', () => {
          const addr = prodServer!.address();
          resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
        });
      });

      const sendRes = await fetch(`${prodUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '09121112233' }),
      });
      const { sandboxCode } = (await sendRes.json()) as { sandboxCode: string };

      const verifyRes = await fetch(`${prodUrl}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '09121112233', code: sandboxCode }),
      });
      expect(verifyRes.status).toBe(200);
      const setCookieProd = verifyRes.headers.get('set-cookie') || '';
      expect(setCookieProd).toContain('dm_mobile_session=');
      expect(setCookieProd).toContain('HttpOnly');
      expect(setCookieProd).toContain('SameSite=Lax');
      expect(setCookieProd).toContain('Secure');

      const logoutRes = await fetch(`${prodUrl}/api/auth/logout`, { method: 'POST' });
      const clearCookieProd = logoutRes.headers.get('set-cookie') || '';
      expect(clearCookieProd).toContain('dm_mobile_session=');
      expect(clearCookieProd).toContain('Max-Age=0');
      expect(clearCookieProd).toContain('Secure');

      // 2. Non-production behind reverse proxy with TRUST_PROXY=true + X-Forwarded-Proto: https
      process.env.NODE_ENV = 'test';
      delete process.env.ALLOW_SANDBOX_IN_PROD;
      delete process.env.SESSION_SECRET;
      process.env.TRUST_PROXY = 'true';

      const proxyApp = await createServerApp({ dataDir: proxyTmp, attachVite: false });
      const proxyUrl = await new Promise<string>((resolve) => {
        proxyServer = proxyApp.app.listen(0, '127.0.0.1', () => {
          const addr = proxyServer!.address();
          resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
        });
      });

      const proxySend = await fetch(`${proxyUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '09121112244' }),
      });
      const { sandboxCode: proxyCode } = (await proxySend.json()) as { sandboxCode: string };
      const proxyVerify = await fetch(`${proxyUrl}/api/auth/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify({ mobile: '09121112244', code: proxyCode }),
      });
      expect(proxyVerify.headers.get('set-cookie') || '').toContain('Secure');
    } finally {
      if (prodServer) await new Promise<void>((r) => prodServer!.close(() => r()));
      if (proxyServer) await new Promise<void>((r) => proxyServer!.close(() => r()));
      process.env.NODE_ENV = 'test';
      delete process.env.SESSION_SECRET;
      delete process.env.TRUST_PROXY;
      delete process.env.ALLOW_SANDBOX_IN_PROD;
      fs.rmSync(prodTmp, { recursive: true, force: true });
      fs.rmSync(proxyTmp, { recursive: true, force: true });
    }
  });

  it('enforces per-IP rate limiting on /api/auth/otp/* with 429 and Persian JSON', async () => {
    const rlTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-rl-'));
    let rlServer: http.Server | null = null;

    try {
      process.env.RATE_LIMIT_OTP_MAX = '3';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      const rlApp = await createServerApp({ dataDir: rlTmp, attachVite: false });
      const rlUrl = await new Promise<string>((resolve) => {
        rlServer = rlApp.app.listen(0, '127.0.0.1', () => {
          const addr = rlServer!.address();
          resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
        });
      });

      for (let i = 0; i < 3; i += 1) {
        const res = await fetch(`${rlUrl}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile: `0912555000${i}` }),
        });
        expect(res.status).toBe(200);
      }

      const blocked = await fetch(`${rlUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: '09125550009' }),
      });
      expect(blocked.status).toBe(429);
      const blockedJson = (await blocked.json()) as { ok: boolean; message: string };
      expect(blockedJson.ok).toBe(false);
      expect(blockedJson.message).toContain('بیش از حد مجاز');
    } finally {
      if (rlServer) await new Promise<void>((r) => rlServer!.close(() => r()));
      delete process.env.RATE_LIMIT_OTP_MAX;
      delete process.env.RATE_LIMIT_WINDOW_MS;
      fs.rmSync(rlTmp, { recursive: true, force: true });
    }
  });

  it('applies helmet CSP, restrictive default CORS, and rejects invalid payloads with 400', async () => {
    const corsRes = await fetch(`${baseUrl}/api/catalog/products?page=1&limit=2`, {
      headers: { Origin: 'https://untrusted.example.com' },
    });
    expect(corsRes.status).toBe(200);
    expect(corsRes.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(corsRes.headers.get('access-control-allow-origin')).toBeNull();

    const badOtpSend = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: 9120001100 }),
    });
    expect(badOtpSend.status).toBe(400);

    const badOtpVerify = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '09120001100' }),
    });
    expect(badOtpVerify.status).toBe(400);

    const badCalc = await fetch(`${baseUrl}/api/checkout/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    expect(badCalc.status).toBe(400);

    const badGuestOrder = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری',
        customerMobile: '09120001100',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 0 }],
      }),
    });
    expect(badGuestOrder.status).toBe(400);

    const badPayInit = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_1', gateway: 'unknown_gateway' }),
    });
    expect(badPayInit.status).toBe(400);

    const badPayVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(badPayVerify.status).toBe(400);

    const badRfq = await fetch(`${baseUrl}/api/rfq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod_endo_motor', quantity: -3 }),
    });
    expect(badRfq.status).toBe(400);
  });

  it('handles X-Forwarded-For and Forwarded proxy headers cleanly without express-rate-limit ValidationError', async () => {
    const proxyHeaderRes = await fetch(`${baseUrl}/api/catalog/products?page=1&limit=2`, {
      headers: {
        'X-Forwarded-For': '203.0.113.10',
        Forwarded: 'for=203.0.113.10;proto=https',
      },
    });
    expect(proxyHeaderRes.status).toBe(200);

    const rlTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-forwarded-'));
    let rlServer: http.Server | null = null;
    try {
      process.env.TRUST_PROXY = 'true';
      process.env.RATE_LIMIT_OTP_MAX = '2';
      const rlApp = await createServerApp({ dataDir: rlTmp, attachVite: false });
      const rlUrl = await new Promise<string>((resolve) => {
        rlServer = rlApp.app.listen(0, '127.0.0.1', () => {
          const addr = rlServer!.address();
          resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
        });
      });

      // Same client IP via RFC 7239 Forwarded header hits limit on 3rd request, while different IP succeeds
      for (let i = 0; i < 2; i += 1) {
        const okRes = await fetch(`${rlUrl}/api/auth/otp/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Forwarded: 'for="198.51.100.77";proto=https',
          },
          body: JSON.stringify({ mobile: `0912888000${i}` }),
        });
        expect(okRes.status).toBe(200);
      }

      const limitedSameIp = await fetch(`${rlUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Forwarded: 'for="198.51.100.77";proto=https',
        },
        body: JSON.stringify({ mobile: '09128880008' }),
      });
      expect(limitedSameIp.status).toBe(429);

      const allowedOtherIp = await fetch(`${rlUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Forwarded: 'for="198.51.100.88";proto=https',
        },
        body: JSON.stringify({ mobile: '09128880009' }),
      });
      expect(allowedOtherIp.status).toBe(200);
    } finally {
      if (rlServer) await new Promise<void>((r) => rlServer!.close(() => r()));
      delete process.env.TRUST_PROXY;
      delete process.env.RATE_LIMIT_OTP_MAX;
      fs.rmSync(rlTmp, { recursive: true, force: true });
    }
  });

  it('returns { ok: true } with 200 on GET /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });
  });

  it('rejects payment replay, wrong authority/token, cancelled verify, and double-initiation of paid orders', async () => {
    const orderRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'کلینیک تست پرداخت',
        customerMobile: '09123339988',
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', addressLine: 'خیابان بهشتی پلاک ۵' },
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      }),
    });
    expect(orderRes.status).toBe(200);
    const { order } = (await orderRes.json()) as {
      order: { id: string; orderNo: string; grandTotal: number };
    };

    // Initiate with wildly tampered amount; server enforces authoritative order.grandTotal
    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNo: order.orderNo,
        amount: 50,
        gateway: 'zarinpal',
        idempotencyKey: `IDEMP-ANTIFORGE-${order.id}`,
      }),
    });
    expect(initRes.status).toBe(200);
    const initJson = (await initRes.json()) as {
      sandboxToken: string;
      session: { authority: string; amount: number };
    };
    expect(initJson.session.amount).toBe(order.grandTotal);

    // Wrong authority -> 404
    const wrongAuthVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: 'AUTH-DOES-NOT-EXIST',
        status: 'OK',
        sandboxToken: initJson.sandboxToken,
      }),
    });
    expect(wrongAuthVerify.status).toBe(404);

    // Wrong sandboxToken -> 403
    const wrongTokenVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: initJson.session.authority,
        status: 'OK',
        sandboxToken: 'SBX-wrong-token',
      }),
    });
    expect(wrongTokenVerify.status).toBe(403);

    // Real verification succeeds once
    const firstVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: initJson.session.authority,
        status: 'OK',
        sandboxToken: initJson.sandboxToken,
      }),
    });
    expect(firstVerify.status).toBe(200);
    const firstJson = (await firstVerify.json()) as { ok: boolean; refId: string };
    expect(firstJson.ok).toBe(true);

    // Replaying verify with same authority returns alreadyVerified without creating duplicate ledger entries
    const replayVerify = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authority: initJson.session.authority,
        status: 'OK',
        sandboxToken: initJson.sandboxToken,
      }),
    });
    expect(replayVerify.status).toBe(200);
    const replayJson = (await replayVerify.json()) as { alreadyVerified?: boolean; refId: string };
    expect(replayJson.alreadyVerified).toBe(true);
    expect(replayJson.refId).toBe(firstJson.refId);
    const verifiedLedgerEntries = store.data.paymentLedger.filter(
      (e) => e.orderId === order.id && e.status === 'verified'
    );
    expect(verifiedLedgerEntries.length).toBe(1);

    // Initiating a fresh payment session on an already-paid order is rejected (400)
    const reInitPaid = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNo: order.orderNo,
        gateway: 'zarinpal',
        idempotencyKey: `IDEMP-REINIT-${order.id}`,
      }),
    });
    expect(reInitPaid.status).toBe(400);

    // Cancelled verify (status != 'OK') on a separate order marks failed with 400
    const order2Res = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری لغو پرداخت',
        customerMobile: '09123339989',
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', addressLine: 'میدان ونک پلاک ۱' },
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      }),
    });
    const { order: order2 } = (await order2Res.json()) as { order: { id: string; orderNo: string } };
    const init2Res = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order2.id, orderNo: order2.orderNo, gateway: 'zarinpal' }),
    });
    const { session: session2 } = (await init2Res.json()) as { session: { authority: string } };
    const nokRes = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authority: session2.authority, status: 'NOK' }),
    });
    expect(nokRes.status).toBe(400);
  });

  it('enforces coupons, contract vs group pricing, call_for_price block, and stock limits in /api/checkout/calculate', async () => {
    const now = Date.now();
    const expiredCoupon = {
      id: 'cpn_expired_test',
      code: 'EXPIRED50',
      titleFa: 'منقضی',
      type: 'percent' as const,
      value: 50,
      minOrderAmount: 0,
      startsAt: new Date(now - 86400000 * 10).toISOString(),
      endsAt: new Date(now - 86400000).toISOString(),
      usageLimit: 10,
      usageCount: 0,
      isActive: true,
    };
    const highMinCoupon = {
      id: 'cpn_highmin_test',
      code: 'VIPONLY',
      titleFa: 'حداقل بالا',
      type: 'fixed' as const,
      value: 500000,
      minOrderAmount: 50000000,
      startsAt: new Date(now - 86400000).toISOString(),
      endsAt: new Date(now + 86400000).toISOString(),
      usageLimit: 10,
      usageCount: 0,
      isActive: true,
    };
    store.data.catalogState.coupons.push(expiredCoupon, highMinCoupon);
    store.data.catalogState.contractPrices.push({
      id: 'cp_test_rotary',
      userId: 'contract_clinic_uid',
      customerName: 'کلینیک تست قرارداد',
      productId: 'prod_rotary_files',
      productTitleFa: 'ست فایل روتاری نیکل‌تیتانیوم دنتسپلای ProTaper Gold',
      variantId: 'var_rot_25',
      unitPrice: 2700000,
      validUntil: new Date(now + 86400000 * 30).toISOString(),
      isActive: true,
    });

    try {
      // 1. Free shipping coupon waives shipping fee below threshold
      const freeShipRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
          couponCode: 'FREESHIP',
          shippingMethod: 'courier_tehran',
        }),
      });
      expect(freeShipRes.status).toBe(200);
      const freeShipJson = (await freeShipRes.json()) as { shippingTotal: number; couponDiscount: number };
      expect(freeShipJson.shippingTotal).toBe(0);
      expect(freeShipJson.couponDiscount).toBe(0);

      // 2. Expired coupon and unmet minOrderAmount coupon give 0 discount
      for (const code of ['EXPIRED50', 'VIPONLY']) {
        const res = await fetch(`${baseUrl}/api/checkout/calculate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
            couponCode: code,
            shippingMethod: 'courier_tehran',
          }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { couponDiscount: number };
        expect(j.couponDiscount).toBe(0);
      }

      // 3. Group pricing vs contract pricing
      const clinicRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
          customerGroup: 'clinic',
          shippingMethod: 'courier_tehran',
        }),
      });
      expect(clinicRes.status).toBe(200);
      const clinicJson = (await clinicRes.json()) as { subtotal: number; items: Array<{ priceSource: string }> };
      expect(clinicJson.subtotal).toBe(3150000);
      expect(clinicJson.items[0].priceSource).toBe('group');

      const contractRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
          customerGroup: 'clinic',
          userId: 'contract_clinic_uid',
          shippingMethod: 'courier_tehran',
        }),
      });
      expect(contractRes.status).toBe(200);
      const contractJson = (await contractRes.json()) as { subtotal: number; items: Array<{ priceSource: string }> };
      expect(contractJson.subtotal).toBe(2700000);
      expect(contractJson.items[0].priceSource).toBe('contract');

      // 4. call_for_price blocked & stock limit enforced
      const callRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'prod_endo_motor', variantId: 'var_radar_pro', quantity: 1 }],
          shippingMethod: 'courier_tehran',
        }),
      });
      expect(callRes.status).toBe(400);

      const stockRes = await fetch(`${baseUrl}/api/checkout/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 9999 }],
          shippingMethod: 'courier_tehran',
        }),
      });
      expect(stockRes.status).toBe(400);
    } finally {
      store.data.catalogState.coupons = store.data.catalogState.coupons.filter(
        (c) => c.id !== expiredCoupon.id && c.id !== highMinCoupon.id
      );
      store.data.catalogState.contractPrices = store.data.catalogState.contractPrices.filter(
        (c) => c.id !== 'cp_test_rotary'
      );
    }
  });

  it('supports full RFQ lifecycle (submitted -> in_review -> quoted -> accepted/rejected), isolation, and rejects non-admin /api/seo/sync', async () => {
    const rfqTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-rfq-'));
    let rfqServer: http.Server | null = null;
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
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
        if (body.idToken === 'valid-nonadmin-id-token') {
          return new Response(
            JSON.stringify({
              users: [{ localId: 'regular_uid_1', email: 'user@example.com', emailVerified: true, displayName: 'کاربر عادی' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
      }
      if (url.startsWith('https://firestore.googleapis.com/')) {
        if (url.includes('/documents/admins/admin_uid_1')) {
          return new Response(JSON.stringify({ fields: { role: { stringValue: 'admin' } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
      }
      return realFetch(input, init);
    });

    try {
      const rfqApp = await createServerApp({ dataDir: rfqTmp, attachVite: false });
      const rfqBaseUrl = await new Promise<string>((resolve) => {
        rfqServer = rfqApp.app.listen(0, '127.0.0.1', () => {
          const addr = rfqServer!.address();
          resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
        });
      });

      // Login User A and User B via sandbox OTP
      const loginMobile = async (mobile: string) => {
        const send = await fetch(`${rfqBaseUrl}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile }),
        });
        expect(send.status).toBe(200);
        const { sandboxCode } = (await send.json()) as { sandboxCode: string };
        const verify = await fetch(`${rfqBaseUrl}/api/auth/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile, code: sandboxCode }),
        });
        expect(verify.status).toBe(200);
        const json = (await verify.json()) as { sessionToken: string };
        return json.sessionToken;
      };

      const tokenA = await loginMobile('09121010101');
      const tokenB = await loginMobile('09122020202');

      // 1. User A creates two RFQs -> status 'submitted'
      const createRfq = async (note: string) => {
        const r = await fetch(`${rfqBaseUrl}/api/rfq`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
          body: JSON.stringify({
            productId: 'prod_endo_motor',
            variantId: 'var_radar_pro',
            quantity: 2,
            customerName: 'دکتر مریم حسینی',
            customerMobile: '09121010101',
            targetUnitPrice: 35000000,
            note,
          }),
        });
        expect(r.status).toBe(200);
        return ((await r.json()) as { rfq: { id: string; status: string } }).rfq;
      };

      const rfq1 = await createRfq('استعلام اول برای تایید');
      const rfq2 = await createRfq('استعلام دوم برای رد');
      expect(rfq1.status).toBe('submitted');

      // 2. User B cannot see User A's RFQs or post messages/respond on them
      const listBRes = await fetch(`${rfqBaseUrl}/api/rfq`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(listBRes.status).toBe(200);
      const listBJson = (await listBRes.json()) as { rfqs: Array<{ id: string }> };
      expect(listBJson.rfqs.some((r) => r.id === rfq1.id)).toBe(false);

      const msgB = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ body: 'دسترسی غیرمجاز' }),
      });
      expect(msgB.status).toBe(403);

      const respondB = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ decision: 'accepted' }),
      });
      expect(respondB.status).toBe(403);

      // 3. Non-admin Firebase user cannot quote RFQ or call /api/seo/sync (403)
      const nonAdminQuote = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-nonadmin-id-token' },
        body: JSON.stringify({ quotedUnitPrice: 37000000 }),
      });
      expect(nonAdminQuote.status).toBe(403);

      const nonAdminSeoSync = await fetch(`${rfqBaseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-nonadmin-id-token' },
        body: JSON.stringify({ products: [] }),
      });
      expect(nonAdminSeoSync.status).toBe(403);

      // Verified admin succeeds on /api/seo/sync
      const adminSeoSync = await fetch(`${rfqBaseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ products: [] }),
      });
      expect(adminSeoSync.status).toBe(200);

      // 4. Admin sends message on rfq1 -> status transitions submitted -> in_review
      const adminMsgRes = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ body: 'در حال استعلام موجودی انبار هستیم' }),
      });
      expect(adminMsgRes.status).toBe(200);
      const adminMsgJson = (await adminMsgRes.json()) as { rfq: { status: string } };
      expect(adminMsgJson.rfq.status).toBe('in_review');

      // 5. Admin quotes rfq1 and rfq2 -> status transitions to 'quoted'
      const quote1Res = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ quotedUnitPrice: 36500000, validDays: 7, note: 'قیمت قطعی' }),
      });
      expect(quote1Res.status).toBe(200);
      const quote1Json = (await quote1Res.json()) as {
        rfq: { status: string; quotedUnitPrice: number; quotedTotal: number };
      };
      expect(quote1Json.rfq.status).toBe('quoted');
      expect(quote1Json.rfq.quotedUnitPrice).toBe(36500000);
      expect(quote1Json.rfq.quotedTotal).toBe(73000000);

      const quote2Res = await fetch(`${rfqBaseUrl}/api/rfq/${rfq2.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ quotedUnitPrice: 39000000, validDays: 5 }),
      });
      expect(quote2Res.status).toBe(200);

      // 6. User A accepts rfq1 -> 'accepted', and rejects rfq2 -> 'rejected'
      const acceptRes = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ decision: 'accepted' }),
      });
      expect(acceptRes.status).toBe(200);
      expect(((await acceptRes.json()) as { rfq: { status: string } }).rfq.status).toBe('accepted');

      // Responding again when already accepted -> 400
      const doubleRespond = await fetch(`${rfqBaseUrl}/api/rfq/${rfq1.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ decision: 'rejected' }),
      });
      expect(doubleRespond.status).toBe(400);

      const rejectRes = await fetch(`${rfqBaseUrl}/api/rfq/${rfq2.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ decision: 'rejected' }),
      });
      expect(rejectRes.status).toBe(200);
      expect(((await rejectRes.json()) as { rfq: { status: string } }).rfq.status).toBe('rejected');
    } finally {
      vi.restoreAllMocks();
      if (rfqServer) await new Promise<void>((r) => rfqServer!.close(() => r()));
      fs.rmSync(rfqTmp, { recursive: true, force: true });
    }
  });
});
