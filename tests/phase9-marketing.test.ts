import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import firebaseConfig from '../firebase-applet-config.json';
import { createServerApp } from '../server';
import { createServerStore } from '../server/persistence';
import { createFileRepositories } from '../server/repositories/fileRepositories';
import {
  computeNextWindowOpenIso,
  createMarketingService,
  isWithinQuietHours,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../server/services/marketingService';
import { SandboxSmsProvider } from '../server/services/smsProvider';
import type { Product } from '../src/types/domain';

function makeFixtureProduct(overrides?: Partial<Product>): Product {
  return {
    id: 'prod_endo_1',
    vertical: 'dental',
    sku: 'ENDO-001',
    slug: 'k-file-endo-pack',
    titleFa: 'فایل اندو استیل',
    titleEn: 'K-File Endo Steel',
    primaryCategoryId: 'cat_endo',
    categoryIds: ['cat_endo'],
    brandId: 'brand_mani',
    originCountryCode: 'JP',
    originCountryFa: 'ژاپن',
    kind: 'consumable',
    status: 'active',
    pricingMode: 'fixed',
    shortDescriptionFa: 'بسته ۶ عددی فایل اندو استاندارد',
    descriptionFa: 'توضیحات فنی فایل اندو استاندارد دندانپزشکی',
    imageUrl: '/assets/products/dentsply-protaper-gold.jpg',
    galleryUrls: ['/assets/products/dentsply-protaper-gold.jpg'],
    installationAvailable: false,
    trainingAvailable: false,
    minOrderQty: 1,
    ratingAvg: 4.8,
    ratingCount: 4,
    viewCount: 10,
    soldCount: 0,
    tags: [],
    attributes: {},
    updatedAt: '2026-04-01T10:00:00.000Z',
    variants: [
      {
        id: 'var_endo_1',
        sku: 'ENDO-001-25',
        labelFa: 'سایز ۲۵ - طول ۲۵ میلی‌متر',
        optionType: 'size',
        optionValueFa: '25',
        basePrice: 450_000,
        stockOnHand: 30,
        reserved: 0,
        lowStockThreshold: 5,
        weightG: 50,
        isActive: true,
      },
    ],
    ...overrides,
  };
}

describe('Phase 9 — Marketing Automation Unit & Service Tests', () => {
  it('detects Asia/Tehran quiet hours (22:00..08:00 UTC+03:30) and computes next open window', () => {
    // 20:00Z + 03:30 = 23:30 local -> inside quiet hours
    const night = new Date('2026-06-01T20:00:00.000Z');
    expect(isWithinQuietHours(night, 22, 8, 210)).toBe(true);

    // Next open = 2026-06-02 08:00 +03:30 => 2026-06-02T04:30:00.000Z
    const nextOpen = computeNextWindowOpenIso(night, 22, 8, 210);
    expect(nextOpen).toBe('2026-06-02T04:30:00.000Z');

    // 10:00Z + 03:30 = 13:30 local -> outside quiet hours
    const day = new Date('2026-06-02T10:00:00.000Z');
    expect(isWithinQuietHours(day, 22, 8, 210)).toBe(false);
  });

  it('signs and verifies HMAC unsubscribe tokens and rejects tampered tokens', () => {
    const token = signUnsubscribeToken({ contact: '09123456789', channel: 'sms' });
    const parsed = verifyUnsubscribeToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.contact).toBe('09123456789');

    const tampered = `${token.slice(0, -4)}ffff`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('enforces quiet hours deferral, flush when window opens, rate limits, opt-out & suppression', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-mkt-unit-'));
    try {
      const store = createServerStore(tmpDir);
      const repos = createFileRepositories(store);
      const smsProvider = new SandboxSmsProvider({ failRecipients: new Set(['09129998888']) });
      const marketing = createMarketingService(repos, { smsProvider });

      // Seed subscribers: 1 active, 1 opted-out (unsubscribed), 1 suppressed active subscriber, 1 simulated failure
      await repos.engagement.saveNewsletterSubscriber({
        id: 'sub_1',
        contact: '09121112233',
        type: 'mobile',
        status: 'active',
        createdAt: '2026-05-01T08:00:00.000Z',
      });
      await repos.engagement.saveNewsletterSubscriber({
        id: 'sub_2',
        contact: '09124445566',
        type: 'mobile',
        status: 'unsubscribed',
        createdAt: '2026-05-01T08:00:00.000Z',
      });
      await repos.engagement.saveNewsletterSubscriber({
        id: 'sub_3',
        contact: '09127778899',
        type: 'mobile',
        status: 'active',
        createdAt: '2026-05-01T08:00:00.000Z',
      });
      await marketing.addToSuppression({ contact: '09127778899', reason: 'admin_manual', note: 'test' });

      await repos.engagement.saveNewsletterSubscriber({
        id: 'sub_fail',
        contact: '09129998888',
        type: 'mobile',
        status: 'active',
        createdAt: '2026-05-01T08:00:00.000Z',
      });

      // 1) Send during quiet hours (23:30 Tehran)
      const quietTime = new Date('2026-06-01T20:00:00.000Z');
      const quietCampaign = await marketing.sendCampaign({
        title: 'کمپین شبانه',
        channel: 'sms',
        segment: 'newsletter_subscribers',
        message: 'تخفیف شبانه',
        respectQuietHours: true,
        now: quietTime,
      });

      expect(quietCampaign.run.totalMatched).toBe(4);
      // Both unsubscribed (sub_2) and unsubscribe-synced (sub_3) are excluded at opt-out filter
      expect(quietCampaign.run.skippedOptOutCount).toBe(2);
      expect(quietCampaign.run.scheduledQuietHoursCount).toBe(2);
      expect(quietCampaign.run.sentCount).toBe(0);

      // Sending directly to a suppressed custom contact (not in newsletterSubscribers) records status='suppressed' & skippedSuppressedCount
      await repos.marketing.saveSuppression({
        id: 'sup_custom_1',
        contact: '09126667788',
        type: 'mobile',
        reason: 'admin_manual',
        createdAt: '2026-05-01T08:00:00.000Z',
      });
      const suppressedRun = await marketing.sendCampaign({
        title: 'تست لیست عدم ارسال',
        channel: 'sms',
        segment: 'custom_contacts',
        customContacts: ['09126667788'],
        message: 'تست مسدودی',
        respectQuietHours: false,
        now: new Date('2026-06-01T10:00:00.000Z'),
      });
      expect(suppressedRun.run.skippedSuppressedCount).toBe(1);
      expect(suppressedRun.messages[0]?.status).toBe('suppressed');

      // Flush while still in quiet hours -> 0 dispatched
      const stillQuietFlush = await marketing.flushScheduledOutbox(new Date('2026-06-02T01:00:00.000Z'));
      expect(stillQuietFlush.processed).toBe(0);

      // Flush after window opens (08:30 Tehran = 05:00Z) -> 1 sent, 1 failed (failRecipients)
      const morningFlush = await marketing.flushScheduledOutbox(new Date('2026-06-02T05:00:00.000Z'));
      expect(morningFlush.processed).toBe(2);
      expect(morningFlush.sent).toBe(1);
      expect(morningFlush.failed).toBe(1);

      // Outbox status transitions: sent -> delivered succeeds, delivered -> failed rejected
      const allOutbox = await marketing.listOutboxMessages({ limit: 50 });
      const sentMsg = allOutbox.find((m) => m.recipient === '09121112233' && m.status === 'sent');
      expect(sentMsg).toBeDefined();

      const deliverRes = await marketing.transitionOutboxStatus(sentMsg!.id, 'delivered', 'رسید اپراتور');
      expect(deliverRes.ok).toBe(true);
      const invalidTrans = await marketing.transitionOutboxStatus(sentMsg!.id, 'failed');
      expect(invalidTrans.ok).toBe(false);

      // 2) Per-recipient daily rate limit (default 3/day): sub_1 already received 1 today (2026-06-02)
      const dayTime = new Date('2026-06-02T09:00:00.000Z');
      await marketing.sendCampaign({
        title: 'پیام دوم',
        channel: 'sms',
        segment: 'custom_contacts',
        customContacts: ['09121112233'],
        message: 'پیام دوم روز',
        now: dayTime,
      });
      await marketing.sendCampaign({
        title: 'پیام سوم',
        channel: 'sms',
        segment: 'custom_contacts',
        customContacts: ['09121112233'],
        message: 'پیام سوم روز',
        now: new Date('2026-06-02T10:00:00.000Z'),
      });
      const fourthRun = await marketing.sendCampaign({
        title: 'پیام چهارم (مسدودیت سقف)',
        channel: 'sms',
        segment: 'custom_contacts',
        customContacts: ['09121112233'],
        message: 'پیام چهارم روز',
        now: new Date('2026-06-02T11:00:00.000Z'),
      });
      expect(fourthRun.run.sentCount).toBe(0);
      expect(fourthRun.run.skippedRateLimitCount).toBe(1);
      expect(fourthRun.messages[0]?.status).toBe('rate_limited');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 9 — Express Routes, Consent, Unsubscribe, Abandoned Carts & Throttle', () => {
  const realFetch = globalThis.fetch;
  let server: import('node:http').Server;
  let baseUrl = '';
  let dataDir = '';
  let stopExpiryJob: () => void = () => {};
  const prevWebhookSecret = process.env.SMS_WEBHOOK_SECRET;
  const prevSmsProvider = process.env.SMS_PROVIDER;

  const TOKEN_MAP: Record<string, { uid: string; email: string; role: string }> = {
    'tok-mkt-admin': { uid: 'adm_mkt_1', email: 'mkt-admin@test.ir', role: 'admin' },
    'tok-mkt-user': { uid: 'usr_mkt_1', email: 'dentist@test.ir', role: '' },
  };

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase9-http-'));
    process.env.SMS_WEBHOOK_SECRET = 'phase9_test_webhook_secret_123456';
    process.env.SMS_PROVIDER = 'sandbox';

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
        const body = JSON.parse(String(init?.body || '{}')) as { idToken?: string };
        const user = body.idToken ? TOKEN_MAP[body.idToken] : undefined;
        if (user) {
          return new Response(
            JSON.stringify({ users: [{ localId: user.uid, email: user.email, emailVerified: true }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: { message: 'INVALID' } }), { status: 400 });
      }
      if (url.includes(`projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/admins/`)) {
        const auth = ((init?.headers as Record<string, string>)?.Authorization || '').replace(/^Bearer\s+/i, '');
        const user = TOKEN_MAP[auth];
        if (user?.role) {
          return new Response(JSON.stringify({ fields: { role: { stringValue: user.role } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const created = await createServerApp({ dataDir, attachVite: false });
    stopExpiryJob = created.stopExpiryJob;

    // Seed product + default warehouse stock in repositories so cart sync & checkout work end-to-end
    const product = makeFixtureProduct();
    await created.repos.catalog.saveCatalogCollections({ products: [product] });
    await created.repos.stock.saveWarehouse({
      id: 'wh_main',
      code: 'MAIN',
      nameFa: 'انبار مرکزی تهران',
      city: 'تهران',
      isDefault: true,
      isActive: true,
    });
    const adj = await created.repos.stock.adjustStock({
      productId: product.id,
      variantId: 'var_endo_1',
      warehouseId: 'wh_main',
      delta: 30,
      type: 'receive',
      reason: 'موجودی اولیه تست فاز ۹',
      actorEmail: 'mkt-admin@test.ir',
    });
    expect(adj.ok).toBe(true);

    await new Promise<void>((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    stopExpiryJob();
    globalThis.fetch = realFetch;
    if (prevWebhookSecret === undefined) delete process.env.SMS_WEBHOOK_SECRET;
    else process.env.SMS_WEBHOOK_SECRET = prevWebhookSecret;
    if (prevSmsProvider === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = prevSmsProvider;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('enforces RBAC on /api/admin/marketing/* endpoints', async () => {
    const noAuth = await realFetch(`${baseUrl}/api/admin/marketing/overview`);
    expect(noAuth.status).toBe(401);

    const userRes = await realFetch(`${baseUrl}/api/admin/marketing/overview`, {
      headers: { Authorization: 'Bearer tok-mkt-user' },
    });
    expect(userRes.status).toBe(403);

    const adminRes = await realFetch(`${baseUrl}/api/admin/marketing/overview`, {
      headers: { Authorization: 'Bearer tok-mkt-admin' },
    });
    expect(adminRes.status).toBe(200);
    const json = (await adminRes.json()) as { ok: boolean; providerMode: string };
    expect(json.ok).toBe(true);
    expect(json.providerMode).toBe('sandbox');
  });

  it('handles unsubscribe links (HTML + JSON + tampered rejection) & HMAC inbound SMS keywords', async () => {
    // 1) Signed unsubscribe link
    const subMobile = '09123334455';
    const subRes = await realFetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: subMobile }),
    });
    expect(subRes.status).toBe(201);

    const token = signUnsubscribeToken({ contact: subMobile, channel: 'sms' });
    const badRes = await realFetch(`${baseUrl}/api/marketing/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: `${token}tampered` }),
    });
    expect(badRes.status).toBe(400);

    const htmlRes = await realFetch(`${baseUrl}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('لغو اشتراک با موفقیت انجام شد');
    expect(html).toContain(subMobile);

    // Sending campaign to newsletter_subscribers skips unsubscribed subMobile
    const cmpRes = await realFetch(`${baseUrl}/api/admin/marketing/campaigns/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-mkt-admin',
      },
      body: JSON.stringify({
        title: 'تست عدم ارسال پس از لغو',
        channel: 'sms',
        segment: 'newsletter_subscribers',
        message: 'پیام تبلیغاتی تست',
        respectQuietHours: false,
      }),
    });
    expect(cmpRes.status).toBe(201);
    const cmpJson = (await cmpRes.json()) as { run: { sentCount: number; skippedOptOutCount: number } };
    expect(cmpJson.run.sentCount).toBe(0);
    expect(cmpJson.run.skippedOptOutCount).toBe(1);

    // 2) Inbound SMS keyword webhook verifies HMAC signature when SMS_WEBHOOK_SECRET is configured
    const smsPayload = JSON.stringify({ from: '09125556677', text: 'لغو' });
    const missingSig = await realFetch(`${baseUrl}/api/marketing/inbound-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: smsPayload,
    });
    expect(missingSig.status).toBe(401);

    const validSig = crypto
      .createHmac('sha256', process.env.SMS_WEBHOOK_SECRET!)
      .update(smsPayload, 'utf8')
      .digest('hex');

    const validWebhook = await realFetch(`${baseUrl}/api/marketing/inbound-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': validSig,
      },
      body: smsPayload,
    });
    expect(validWebhook.status).toBe(200);
    const whJson = (await validWebhook.json()) as { ok: boolean; unsubscribed: boolean; contact: string };
    expect(whJson.ok).toBe(true);
    expect(whJson.unsubscribed).toBe(true);
    expect(whJson.contact).toBe('09125556677');
  });

  it('syncs consented OTP user cart, detects abandonment, enforces 24h reminder throttle, recovers on order & feeds Report #9', async () => {
    // Sign in OTP mobile session
    const otpMobile = '09128889900';
    const sendOtpRes = await realFetch(`${baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: otpMobile }),
    });
    expect(sendOtpRes.status).toBe(200);
    const otpSendData = (await sendOtpRes.json()) as { sandboxCode: string };

    const verifyRes = await realFetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: otpMobile, code: otpSendData.sandboxCode }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = (await verifyRes.json()) as { sessionToken: string; verifiedToken: string };
    const mobHeaders = {
      'Content-Type': 'application/json',
      'X-Mobile-Session': verifyData.sessionToken,
    };

    // Unauthenticated consent returns 401
    const unauthConsent = await realFetch(`${baseUrl}/api/marketing/consent`);
    expect(unauthConsent.status).toBe(401);

    // Without consent, cart sync does not store abandoned cart
    const noConsentSync = await realFetch(`${baseUrl}/api/cart/sync`, {
      method: 'POST',
      headers: mobHeaders,
      body: JSON.stringify({
        items: [{ productId: 'prod_endo_1', variantId: 'var_endo_1', quantity: 2 }],
        consentGranted: false,
      }),
    });
    expect(noConsentSync.status).toBe(200);
    const noConsentJson = (await noConsentSync.json()) as { cart: unknown };
    expect(noConsentJson.cart).toBeNull();

    // Update customer marketing consent via PUT /api/marketing/consent
    const putConsent = await realFetch(`${baseUrl}/api/marketing/consent`, {
      method: 'PUT',
      headers: mobHeaders,
      body: JSON.stringify({
        marketingOptIn: true,
        smsOptIn: true,
        emailOptIn: false,
        abandonedCartConsent: true,
        mobile: otpMobile,
      }),
    });
    expect(putConsent.status).toBe(200);

    // Sync cart with consent -> authoritative server subtotal (2 * 450,000 = 900,000)
    const syncRes = await realFetch(`${baseUrl}/api/cart/sync`, {
      method: 'POST',
      headers: mobHeaders,
      body: JSON.stringify({
        items: [{ productId: 'prod_endo_1', variantId: 'var_endo_1', quantity: 2 }],
        consentGranted: true,
        customerName: 'دکتر احمدی',
      }),
    });
    expect(syncRes.status).toBe(200);
    const syncJson = (await syncRes.json()) as { cart: { id: string; subtotal: number; status: string } };
    expect(syncJson.cart.subtotal).toBe(900_000);
    expect(syncJson.cart.status).toBe('active');
    const cartId = syncJson.cart.id;

    // Detect abandonment 60 minutes later (threshold 30m)
    const futureDetectIso = new Date(Date.now() + 60 * 60_000).toISOString();
    const listAbandoned = await realFetch(
      `${baseUrl}/api/admin/marketing/abandoned-carts?nowIso=${encodeURIComponent(futureDetectIso)}`,
      { headers: { Authorization: 'Bearer tok-mkt-admin' } }
    );
    expect(listAbandoned.status).toBe(200);
    const abJson = (await listAbandoned.json()) as { carts: Array<{ id: string; status: string }> };
    expect(abJson.carts.find((c) => c.id === cartId)?.status).toBe('abandoned');

    // First reminder at a daytime Tehran timestamp (2026-06-05T10:00:00.000Z = 13:30 Tehran)
    const reminderTime1 = '2026-06-05T10:00:00.000Z';
    const rem1 = await realFetch(`${baseUrl}/api/admin/marketing/abandoned-carts/${cartId}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-mkt-admin',
      },
      body: JSON.stringify({ channel: 'sms', nowIso: reminderTime1 }),
    });
    expect(rem1.status).toBe(200);
    const rem1Json = (await rem1.json()) as {
      cart: { status: string; reminderCount: number };
      outboxMessage: { status: string; unsubscribeUrl: string };
    };
    expect(rem1Json.cart.status).toBe('reminded');
    expect(rem1Json.cart.reminderCount).toBe(1);
    expect(rem1Json.outboxMessage.status).toBe('sent');
    expect(rem1Json.outboxMessage.unsubscribeUrl).toContain('/unsubscribe?token=unsub_');

    // Second reminder within 24 hours (+2 hours) must be rejected with 429 throttle!
    const remTooSoon = await realFetch(`${baseUrl}/api/admin/marketing/abandoned-carts/${cartId}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-mkt-admin',
      },
      body: JSON.stringify({ channel: 'sms', nowIso: '2026-06-05T12:00:00.000Z' }),
    });
    expect(remTooSoon.status).toBe(429);

    // Second reminder after 25 hours succeeds
    const remAfter25h = await realFetch(`${baseUrl}/api/admin/marketing/abandoned-carts/${cartId}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-mkt-admin',
      },
      body: JSON.stringify({ channel: 'sms', nowIso: '2026-06-06T11:00:00.000Z' }),
    });
    expect(remAfter25h.status).toBe(200);

    // Placing an order marks the abandoned cart recovered
    const orderRes = await realFetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: mobHeaders,
      body: JSON.stringify({
        customerName: 'دکتر احمدی',
        customerMobile: otpMobile,
        shippingAddress: {
          province: 'تهران',
          city: 'تهران',
          addressLine: 'خیابان ولیعصر پلاک ۱۰',
        },
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        verifiedToken: verifyData.verifiedToken,
        items: [{ productId: 'prod_endo_1', variantId: 'var_endo_1', quantity: 2 }],
      }),
    });
    expect(orderRes.status).toBe(200);

    const afterOrderList = await realFetch(`${baseUrl}/api/admin/marketing/abandoned-carts`, {
      headers: { Authorization: 'Bearer tok-mkt-admin' },
    });
    const afterJson = (await afterOrderList.json()) as {
      carts: Array<{ id: string; status: string; recoveredOrderId?: string }>;
    };
    const recoveredCart = afterJson.carts.find((c) => c.id === cartId);
    expect(recoveredCart?.status).toBe('recovered');
    expect(recoveredCart?.recoveredOrderId).toBeTruthy();

    // Report #9 (abandoned_recovery) exposes live available: true metrics
    const reportRes = await realFetch(`${baseUrl}/api/admin/reports/abandoned_recovery`, {
      headers: { Authorization: 'Bearer tok-mkt-admin' },
    });
    expect(reportRes.status).toBe(200);
    const reportJson = (await reportRes.json()) as {
      ok: boolean;
      report: { available: boolean; rows: unknown[]; summary: Array<{ label: string; value: number }> };
    };
    expect(reportJson.ok).toBe(true);
    expect(reportJson.report.available).toBe(true);
    expect(reportJson.report.rows.length).toBeGreaterThanOrEqual(1);
    expect(reportJson.report.summary.find((s) => s.label.includes('بازیابی'))?.value).toBeGreaterThanOrEqual(1);
  });
});
