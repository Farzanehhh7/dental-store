import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import firebaseConfig from '../firebase-applet-config.json';
import { createServerApp } from '../server';
import { validateServerEnv } from '../server/config/env';

type MockAdminSpec = {
  uid: string;
  email: string;
  role: string;
};

const ADMIN_TOKENS: Record<string, MockAdminSpec> = {
  'token-super-admin': { uid: 'adm_super', email: 'super@example.com', role: 'super_admin' },
  'token-warehouse': { uid: 'adm_wh', email: 'warehouse@example.com', role: 'warehouse' },
  'token-content': { uid: 'adm_content', email: 'content@example.com', role: 'content' },
  'token-support': { uid: 'adm_support', email: 'support@example.com', role: 'support' },
  'token-accountant': { uid: 'adm_acc', email: 'accountant@example.com', role: 'accountant' },
  'token-sales': { uid: 'adm_sales', email: 'sales@example.com', role: 'sales' }, // Alias -> sales_mgr
  'token-regular-user': { uid: 'usr_plain', email: 'buyer@example.com', role: '' },
};

describe('Phase 4 — Security Hardening Verification', () => {
  const realFetch = globalThis.fetch;
  let server: import('node:http').Server;
  let baseUrl = '';
  let dataDir = '';
  let stopExpiryJob: () => void = () => {};
  let serverStore: Awaited<ReturnType<typeof createServerApp>>['store'];
  let prevSessionSecret: string | undefined;
  let prevSmsProvider: string | undefined;
  let prevPaymentMode: string | undefined;

  function installFirebaseAuthFetchMock() {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
        const body = JSON.parse(String(init?.body || '{}')) as { idToken?: string };
        const matched = body.idToken ? ADMIN_TOKENS[body.idToken] : undefined;
        if (matched) {
          return new Response(
            JSON.stringify({
              users: [
                {
                  localId: matched.uid,
                  email: matched.email,
                  emailVerified: true,
                  displayName: matched.uid,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
      }

      if (
        url.includes(`projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/admins/`)
      ) {
        const authHeader =
          (init?.headers as Record<string, string> | undefined)?.Authorization ||
          (init?.headers as Record<string, string> | undefined)?.authorization ||
          '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const matched = ADMIN_TOKENS[token];
        if (matched && matched.role) {
          return new Response(JSON.stringify({ fields: { role: { stringValue: matched.role } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 });
      }

      return realFetch(input, init);
    }) as typeof fetch;
  }

  beforeAll(async () => {
    prevSessionSecret = process.env.SESSION_SECRET;
    prevSmsProvider = process.env.SMS_PROVIDER;
    prevPaymentMode = process.env.PAYMENT_MODE;

    process.env.SESSION_SECRET = 'phase4_test_session_secret_with_more_than_32_characters_01';
    process.env.SMS_PROVIDER = 'sandbox';
    process.env.PAYMENT_MODE = 'sandbox';
    process.env.OTP_RESEND_COOLDOWN_SEC = '5';
    process.env.OTP_MAX_ATTEMPTS = '5';
    process.env.OTP_LOCKOUT_SECONDS = '600';
    process.env.OTP_PHONE_WINDOW_MAX = '3';
    process.env.UPLOAD_MAX_BYTES = '2048';
    process.env.RATE_LIMIT_OTP_MAX = '100';
    process.env.RATE_LIMIT_TELEMETRY_MAX = '100';
    process.env.RATE_LIMIT_GLOBAL_MAX = '500';

    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase4-sec-'));
    const created = await createServerApp({ dataDir, attachVite: false });
    serverStore = created.store;
    stopExpiryJob = created.stopExpiryJob;

    await new Promise<void>((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(() => {
    installFirebaseAuthFetchMock();
    serverStore.data.otpChallenges = {};
    serverStore.data.otpLockouts = {};
    serverStore.data.otpPhoneSendHistory = {};
    serverStore.data.notFoundLogs = {};
    serverStore.data.newsletterSubscribers = {};
    serverStore.data.stockNotifications = {};
    serverStore.data.auditLogs = [];
    serverStore.save();
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    stopExpiryJob();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (dataDir) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }

    if (prevSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSessionSecret;
    if (prevSmsProvider === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = prevSmsProvider;
    if (prevPaymentMode === undefined) delete process.env.PAYMENT_MODE;
    else process.env.PAYMENT_MODE = prevPaymentMode;
    delete process.env.OTP_RESEND_COOLDOWN_SEC;
    delete process.env.OTP_MAX_ATTEMPTS;
    delete process.env.OTP_LOCKOUT_SECONDS;
    delete process.env.OTP_PHONE_WINDOW_MAX;
    delete process.env.UPLOAD_MAX_BYTES;
  });

  describe('1. Environment Fail-Fast Validation', () => {
    it('rejects missing or short SESSION_SECRET in production and missing live gateway keys', () => {
      expect(() =>
        validateServerEnv({ NODE_ENV: 'production', SESSION_SECRET: '' })
      ).toThrow(/SESSION_SECRET/);

      expect(() =>
        validateServerEnv({ NODE_ENV: 'production', SESSION_SECRET: 'short_secret' })
      ).toThrow(/SESSION_SECRET/);

      expect(() =>
        validateServerEnv({
          NODE_ENV: 'production',
          SESSION_SECRET: 'a'.repeat(32),
          SMS_PROVIDER: 'live',
        })
      ).toThrow(/SMS_API_KEY/);

      expect(() =>
        validateServerEnv({
          NODE_ENV: 'production',
          SESSION_SECRET: 'a'.repeat(32),
          PAYMENT_MODE: 'live',
        })
      ).toThrow(/ZARINPAL_MERCHANT_ID|IDPAY_API_KEY/);

      expect(() =>
        validateServerEnv({ NODE_ENV: 'development', PORT: '99999' })
      ).toThrow(/Invalid server environment configuration/);

      const devOk = validateServerEnv({ NODE_ENV: 'development' });
      expect(devOk.STORAGE_DRIVER).toBe('file');
      expect(devOk.OTP_EXPIRY_SECONDS).toBe(180);
    });
  });

  describe('2. HTTP Security Headers', () => {
    it('sets CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, and HSTS in production', async () => {
      const res = await realFetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toContain('camera=()');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');

      const prodDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase4-prod-'));
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const prodApp = await createServerApp({ dataDir: prodDir, attachVite: false });
      const prodSrv = await new Promise<import('node:http').Server>((resolve) => {
        const s = prodApp.app.listen(0, '127.0.0.1', () => resolve(s));
      });
      try {
        const pAddr = prodSrv.address() as AddressInfo;
        const pRes = await realFetch(`http://127.0.0.1:${pAddr.port}/api/health`);
        expect(pRes.headers.get('strict-transport-security')).toContain('max-age=31536000');
      } finally {
        prodApp.stopExpiryJob();
        await new Promise<void>((resolve) => prodSrv.close(() => resolve()));
        process.env.NODE_ENV = prevNodeEnv;
        fs.rmSync(prodDir, { recursive: true, force: true });
      }
    });
  });

  describe('3. Server RBAC Permission Matrix & Audit Logging', () => {
    it('enforces granular admin permissions across roles and denies privilege escalation', async () => {
      // content role allowed on /api/seo/sync, denied on /api/admin/orders & /api/admin/inventory & /api/payments/ledger
      const contentSync = await realFetch(`${baseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({ redirects: [] }),
      });
      expect(contentSync.status).toBe(200);

      const contentOrders = await realFetch(`${baseUrl}/api/admin/orders`, {
        headers: { Authorization: 'Bearer token-content' },
      });
      expect(contentOrders.status).toBe(403);

      const contentInventory = await realFetch(`${baseUrl}/api/admin/inventory`, {
        headers: { Authorization: 'Bearer token-content' },
      });
      expect(contentInventory.status).toBe(403);

      // warehouse role allowed on inventory, denied on seo/sync and payments ledger
      const whInventory = await realFetch(`${baseUrl}/api/admin/inventory`, {
        headers: { Authorization: 'Bearer token-warehouse' },
      });
      expect(whInventory.status).toBe(200);

      const whSeo = await realFetch(`${baseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-warehouse' },
        body: JSON.stringify({ redirects: [] }),
      });
      expect(whSeo.status).toBe(403);

      const whLedger = await realFetch(`${baseUrl}/api/payments/ledger`, {
        headers: { Authorization: 'Bearer token-warehouse' },
      });
      expect(whLedger.status).toBe(403);

      // accountant role allowed on payments ledger, denied on inventory write
      const accLedger = await realFetch(`${baseUrl}/api/payments/ledger`, {
        headers: { Authorization: 'Bearer token-accountant' },
      });
      expect(accLedger.status).toBe(200);

      const accAdj = await realFetch(`${baseUrl}/api/admin/inventory/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-accountant' },
        body: JSON.stringify({ productId: 'p1', variantId: 'v1', delta: 5, reason: 'test' }),
      });
      expect(accAdj.status).toBe(403);

      // sales alias normalizes to sales_mgr and can update customerGroup
      const salesGroup = await realFetch(`${baseUrl}/api/admin/users/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-sales' },
        body: JSON.stringify({
          uid: 'usr_clinic_1',
          customerGroup: 'clinic',
          b2bStatus: 'approved',
        }),
      });
      expect(salesGroup.status).toBe(200);

      // non-super_admin (support/sales/warehouse) cannot read /api/admin/audit-logs
      const supportAudit = await realFetch(`${baseUrl}/api/admin/audit-logs`, {
        headers: { Authorization: 'Bearer token-support' },
      });
      expect(supportAudit.status).toBe(403);

      // super_admin can inspect audit logs and see all mutations recorded
      const superAudit = await realFetch(`${baseUrl}/api/admin/audit-logs`, {
        headers: { Authorization: 'Bearer token-super-admin' },
      });
      expect(superAudit.status).toBe(200);
      const auditPayload = (await superAudit.json()) as {
        ok: boolean;
        auditLogs: Array<{ action: string; actorId?: string; actorEmail?: string }>;
      };
      expect(auditPayload.auditLogs.some((a) => a.action === 'catalog.seo_sync' && a.actorId === 'adm_content')).toBe(true);
      expect(auditPayload.auditLogs.some((a) => a.action === 'user.group_updated' && a.actorId === 'adm_sales')).toBe(true);
    });
  });

  describe('4. OTP Lockout, Cooldown & Rolling Window Hardening', () => {
    it('enforces resend cooldown, 5-attempt lockout across both verify and send, and short expiry', async () => {
      const mobile = '09129998877';
      const send1 = await realFetch(`${baseUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      expect(send1.status).toBe(200);
      const sendData = (await send1.json()) as { sandboxCode?: string; expiresInSec: number };
      expect(sendData.expiresInSec).toBe(180);

      // Immediate resend hits cooldown (429 + Retry-After)
      const resendEarly = await realFetch(`${baseUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      expect(resendEarly.status).toBe(429);
      expect(Number(resendEarly.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);

      // 4 failed attempts return 400, 5th failed attempt triggers persistent lockout (429)
      for (let i = 0; i < 4; i++) {
        const bad = await realFetch(`${baseUrl}/api/auth/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile, code: '000000' }),
        });
        expect(bad.status).toBe(400);
      }

      const fifthBad = await realFetch(`${baseUrl}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code: '000000' }),
      });
      expect(fifthBad.status).toBe(429);

      // Even re-sending OTP is now blocked during lockout
      const sendWhileLocked = await realFetch(`${baseUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      expect(sendWhileLocked.status).toBe(429);

      // Per-phone 15-min rolling window cap (OTP_PHONE_WINDOW_MAX=3)
      const mobile2 = '09121112233';
      for (let i = 0; i < 3; i++) {
        if (serverStore.data.otpChallenges[mobile2]) {
          serverStore.data.otpChallenges[mobile2].lastSentAt = Date.now() - 10_000;
        }
        const okSend = await realFetch(`${baseUrl}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile: mobile2 }),
        });
        expect(okSend.status).toBe(200);
      }
      if (serverStore.data.otpChallenges[mobile2]) {
        serverStore.data.otpChallenges[mobile2].lastSentAt = Date.now() - 10_000;
      }
      const fourthSend = await realFetch(`${baseUrl}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: mobile2 }),
      });
      expect(fourthSend.status).toBe(429);
    });
  });

  describe('5. Strict File Upload & Download Hardening', () => {
    it('blocks spoofed MIME bytes, disallowed extensions, oversized files, path traversal, and protects B2B docs', async () => {
      // Valid 1x1 PNG header + minimal chunk bytes
      const realPngBase64 = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]).toString('base64');

      // 1. Disallowed extension (.svg)
      const svgRes = await realFetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({
          filename: 'xss.svg',
          dataBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
          purpose: 'catalog_asset',
        }),
      });
      expect(svgRes.status).toBe(400);

      // 2. Spoofed extension (.png extension with HTML payload magic bytes)
      const spoofRes = await realFetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({
          filename: 'fake.png',
          dataBase64: Buffer.from('<html><script>alert(1)</script></html>').toString('base64'),
          purpose: 'catalog_asset',
        }),
      });
      expect(spoofRes.status).toBe(400);

      // 3. Path traversal filename blocked
      const travRes = await realFetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({
          filename: '../../evil.png',
          dataBase64: realPngBase64,
          purpose: 'catalog_asset',
        }),
      });
      expect(travRes.status).toBe(400);

      // 4. Oversized buffer (> UPLOAD_MAX_BYTES = 2048) rejected with 413
      const bigBuf = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(2500, 0x41),
      ]);
      const bigRes = await realFetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({
          filename: 'too-big.png',
          dataBase64: bigBuf.toString('base64'),
          purpose: 'catalog_asset',
        }),
      });
      expect(bigRes.status).toBe(413);

      // 5. Real signed-in customer uploads private b2b_doc PDF -> accessible by owner & support/sales admin, denied to anon
      const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
      const b2bRes = await realFetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-regular-user' },
        body: JSON.stringify({
          filename: 'license.pdf',
          dataBase64: pdfBytes.toString('base64'),
          purpose: 'b2b_doc',
        }),
      });
      expect(b2bRes.status).toBe(201);
      const b2bJson = (await b2bRes.json()) as { file: { id: string; url: string } };

      const anonDownload = await realFetch(`${baseUrl}${b2bJson.file.url}`);
      expect(anonDownload.status).toBe(401);

      const ownerDownload = await realFetch(`${baseUrl}${b2bJson.file.url}`, {
        headers: { Authorization: 'Bearer token-regular-user' },
      });
      expect(ownerDownload.status).toBe(200);
      expect(ownerDownload.headers.get('content-type')).toContain('application/pdf');
      expect(ownerDownload.headers.get('x-content-type-options')).toBe('nosniff');

      // Traversal in download param rejected cleanly
      const badIdDownload = await realFetch(`${baseUrl}/api/files/download/..%2F..%2Fpackage.json`);
      expect(badIdDownload.status).toBe(400);
    });
  });

  describe('6. Server 404 Telemetry & Strict /api/seo/sync Validation', () => {
    it('aggregates normalized 404 telemetry hits and rejects unknown / oversized /api/seo/sync payloads', async () => {
      const hit1 = await realFetch(`${baseUrl}/api/telemetry/404`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '//product//missing-bur?ref=test' }),
      });
      expect(hit1.status).toBe(200);

      const hit2 = await realFetch(`${baseUrl}/api/telemetry/404`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/product/missing-bur' }),
      });
      expect(hit2.status).toBe(200);
      const hit2Json = (await hit2.json()) as { log: { path: string; hitCount: number } };
      expect(hit2Json.log.path).toBe('/product/missing-bur');
      expect(hit2Json.log.hitCount).toBe(2);

      // Invalid traversal path blocked
      const badHit = await realFetch(`${baseUrl}/api/telemetry/404`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/product/../../etc/passwd' }),
      });
      expect(badHit.status).toBe(400);

      // Admin telemetry inspection enforces RBAC
      const whTelemetry = await realFetch(`${baseUrl}/api/admin/not-found-logs`, {
        headers: { Authorization: 'Bearer token-warehouse' },
      });
      expect(whTelemetry.status).toBe(403);

      const contentTelemetry = await realFetch(`${baseUrl}/api/admin/not-found-logs`, {
        headers: { Authorization: 'Bearer token-content' },
      });
      expect(contentTelemetry.status).toBe(200);

      // /api/seo/sync rejects unknown extra fields (.strict())
      const strictReject = await realFetch(`${baseUrl}/api/seo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-content' },
        body: JSON.stringify({ redirects: [], unknownInjectedField: true }),
      });
      expect(strictReject.status).toBe(400);
    });
  });
});
