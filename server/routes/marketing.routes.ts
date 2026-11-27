import crypto from 'node:crypto';
import express from 'express';
import {
  normalizeMobile,
  resolveMobileSession,
  verifyFirebaseUser,
  verifyWebhookSignature,
} from '../auth';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import { escapeHtml, getOrigin } from '../lib/http';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import type { CustomerIdentity, MarketingService } from '../services/marketingService';
import { normalizeMarketingContact } from '../services/marketingService';
import {
  adminAbandonedCartsQuerySchema,
  adminAbandonedReminderBodySchema,
  adminCampaignSendBodySchema,
  adminOutboxFlushBodySchema,
  adminOutboxQuerySchema,
  adminOutboxStatusBodySchema,
  adminSuppressionAddBodySchema,
  cartSyncBodySchema,
  inboundSmsWebhookBodySchema,
  marketingConsentPutBodySchema,
  marketingUnsubscribeBodySchema,
  parseRequestBody,
  parseRequestQuery,
} from '../validation';

function parseOptionalDate(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function createMarketingRouter(
  store: ServerStore,
  marketingService: MarketingService,
  repos?: RepositoryBundle
): express.Router {
  const router = express.Router();
  const authTarget = repos ?? store;

  async function resolveCustomerIdentity(req: express.Request): Promise<CustomerIdentity | null> {
    const fbUser = await verifyFirebaseUser(req);
    if (fbUser) {
      return {
        ownerKey: fbUser.uid,
        userId: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
      };
    }
    const mobSession = await resolveMobileSession(authTarget, req);
    if (mobSession) {
      return {
        ownerKey: `mobile:${mobSession.mobile}`,
        userId: `mobile:${mobSession.mobile}`,
        mobile: mobSession.mobile,
        displayName: mobSession.displayName,
      };
    }
    return null;
  }

  // --- Server-Side Abandoned Cart Sync (Signed-in Google or OTP Users) ---
  router.get('/api/cart/sync', async (req, res) => {
    const identity = await resolveCustomerIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, message: 'برای همگام‌سازی سبد خرید ابتدا وارد حساب کاربری شوید.' });
    }
    const cart = await marketingService.repo.findAbandonedCartByOwner(identity.ownerKey);
    const consent = await marketingService.getConsentForIdentity(identity);
    return res.json({ ok: true, cart, consent });
  });

  router.post('/api/cart/sync', async (req, res) => {
    const identity = await resolveCustomerIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, message: 'برای همگام‌سازی سبد خرید ابتدا وارد حساب کاربری شوید.' });
    }
    const parsed = parseRequestBody(cartSyncBodySchema, req, res);
    if (!parsed) return;

    const cleanMobile = parsed.mobile ? normalizeMobile(parsed.mobile) : undefined;
    if (parsed.mobile && (!cleanMobile || !/^09\d{9}$/.test(cleanMobile))) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل واردشده نامعتبر است.' });
    }

    const cart = await marketingService.syncCart({
      identity,
      items: parsed.items,
      consentGranted: parsed.consentGranted,
      customerName: parsed.customerName,
      mobile: cleanMobile,
      email: parsed.email,
    });

    return res.json({ ok: true, cart });
  });

  // --- Customer Consent & Preferences Management ---
  router.get('/api/marketing/consent', async (req, res) => {
    const identity = await resolveCustomerIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, message: 'برای مدیریت تنظیمات اطلاع‌رسانی ابتدا وارد حساب شوید.' });
    }
    const consent = await marketingService.getConsentForIdentity(identity);
    const suppressions = await marketingService.listSuppressions();
    const isSuppressed = suppressions.some(
      (s) =>
        (consent.mobile && s.contact === normalizeMobile(consent.mobile)) ||
        (consent.email && s.contact === consent.email.toLowerCase())
    );
    return res.json({ ok: true, consent, isSuppressed });
  });

  router.put('/api/marketing/consent', async (req, res) => {
    const identity = await resolveCustomerIdentity(req);
    if (!identity) {
      return res.status(401).json({ ok: false, message: 'برای ویرایش رضایت تبلیغاتی ابتدا وارد حساب شوید.' });
    }
    const parsed = parseRequestBody(marketingConsentPutBodySchema, req, res);
    if (!parsed) return;

    if (parsed.mobile) {
      const cleanMob = normalizeMobile(parsed.mobile);
      if (!/^09\d{9}$/.test(cleanMob)) {
        return res.status(400).json({ ok: false, message: 'شماره موبایل واردشده معتبر نیست.' });
      }
    }
    if (parsed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email.trim().toLowerCase())) {
      return res.status(400).json({ ok: false, message: 'ایمیل واردشده معتبر نیست.' });
    }

    const result = await marketingService.updateConsentForIdentity(identity, {
      ...parsed,
      source: 'account',
    });
    return res.json({
      ok: true,
      consent: result.consent,
      suppressedRemoved: result.suppressedRemoved,
    });
  });

  // --- Signed HMAC Unsubscribe Endpoint (One-Click HTML & SPA JSON) ---
  router.get('/api/marketing/unsubscribe', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const outcome = await marketingService.handleUnsubscribeToken(token);
    if (!outcome.ok) {
      return res
        .status(outcome.status)
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="fa" dir="rtl"><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>خطا در لغو اشتراک</h1><p>${escapeHtml(
            outcome.message
          )}</p></body></html>`
        );
    }
    return res
      .status(200)
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="fa" dir="rtl"><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>لغو اشتراک با موفقیت انجام شد</h1><p>مخاطب <strong>${escapeHtml(
          outcome.contact
        )}</strong> در فهرست عدم ارسال (Suppression List) ثبت گردید و دیگر پیام تبلیغاتی دریافت نخواهید کرد.</p></body></html>`
      );
  });

  router.post('/api/marketing/unsubscribe', async (req, res) => {
    const parsed = parseRequestBody(marketingUnsubscribeBodySchema, req, res);
    if (!parsed) return;

    const outcome = await marketingService.handleUnsubscribeToken(parsed.token);
    if (!outcome.ok) {
      return res.status(outcome.status).json({ ok: false, message: outcome.message });
    }
    return res.json({
      ok: true,
      contact: outcome.contact,
      suppression: outcome.entry,
    });
  });

  // --- Inbound SMS Keyword Webhook (e.g. لغو / 11 / STOP) ---
  router.post('/api/marketing/inbound-sms', async (req, res) => {
    const webhookSecret = process.env.SMS_WEBHOOK_SECRET?.trim() || '';
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd || webhookSecret) {
      const sig = req.headers['x-webhook-signature'];
      const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
      if (!webhookSecret || typeof sig !== 'string' || !verifyWebhookSignature(rawBody, sig, webhookSecret)) {
        return res.status(401).json({ ok: false, message: 'امضای وب‌هوک پیامکی نامعتبر است.' });
      }
    }

    const parsed = parseRequestBody(inboundSmsWebhookBodySchema, req, res);
    if (!parsed) return;

    const outcome = await marketingService.handleInboundSms(parsed);
    if (!outcome.ok) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل فرستنده نامعتبر است.' });
    }
    return res.json({
      ok: true,
      unsubscribed: outcome.unsubscribed,
      contact: outcome.contact,
      suppression: outcome.entry ?? null,
    });
  });

  // --- Admin Marketing Automation Dashboard & Actions ---
  router.get('/api/admin/marketing/overview', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const [campaigns, outbox, abandonedCarts, suppressions, consents, subscribers] = await Promise.all([
      marketingService.listCampaignRuns(50),
      marketingService.listOutboxMessages({ limit: 100 }),
      marketingService.listAbandonedCarts(),
      marketingService.listSuppressions(),
      marketingService.listConsents(),
      authTarget && 'engagement' in authTarget
        ? authTarget.engagement.listNewsletterSubscribers()
        : Promise.resolve(Object.values(store.data.newsletterSubscribers)),
    ]);

    return res.json({
      ok: true,
      providerMode: marketingService.smsProvider.mode,
      providerName: marketingService.smsProvider.providerName,
      config: marketingService.getConfig(),
      campaigns,
      outbox,
      abandonedCarts,
      suppressions,
      consentsCount: consents.length,
      subscribers,
    });
  });

  router.get('/api/admin/marketing/campaigns', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const campaigns = await marketingService.listCampaignRuns(100);
    return res.json({ ok: true, campaigns });
  });

  router.post('/api/admin/marketing/campaigns/send', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminCampaignSendBodySchema, req, res);
    if (!parsed) return;

    const now = parseOptionalDate(parsed.nowIso);
    if (parsed.nowIso && !now) {
      return res.status(400).json({ ok: false, message: 'فرمت زمان nowIso معتبر نیست.' });
    }

    const outcome = await marketingService.sendCampaign({
      title: parsed.title,
      channel: parsed.channel,
      segment: parsed.segment,
      message: parsed.message,
      subject: parsed.subject,
      customContacts: parsed.customContacts,
      respectQuietHours: parsed.respectQuietHours,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email,
      origin: getOrigin(req),
      now,
    });

    return res.status(201).json({
      ok: true,
      providerMode: marketingService.smsProvider.mode,
      run: outcome.run,
      messages: outcome.messages,
    });
  });

  router.get('/api/admin/marketing/outbox', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const query = parseRequestQuery(adminOutboxQuerySchema, req, res);
    if (!query) return;

    const messages = await marketingService.listOutboxMessages({
      status: query.status,
      channel: query.channel,
      limit: query.limit,
    });
    return res.json({
      ok: true,
      providerMode: marketingService.smsProvider.mode,
      messages,
    });
  });

  router.post('/api/admin/marketing/outbox/:id/status', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminOutboxStatusBodySchema, req, res);
    if (!parsed) return;

    const outcome = await marketingService.transitionOutboxStatus(
      String(req.params.id || ''),
      parsed.status,
      parsed.note
    );
    if (!outcome.ok) {
      return res.status(outcome.status).json({ ok: false, message: outcome.message });
    }
    return res.json({ ok: true, message: outcome.message });
  });

  router.post('/api/admin/marketing/outbox/flush', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminOutboxFlushBodySchema, req, res);
    if (!parsed) return;

    const now = parseOptionalDate(parsed.nowIso);
    if (parsed.nowIso && !now) {
      return res.status(400).json({ ok: false, message: 'فرمت زمان nowIso معتبر نیست.' });
    }

    const summary = await marketingService.flushScheduledOutbox(now);
    return res.json({ ok: true, summary });
  });

  router.get('/api/admin/marketing/abandoned-carts', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const query = parseRequestQuery(adminAbandonedCartsQuerySchema, req, res);
    if (!query) return;

    const now = parseOptionalDate(query.nowIso);
    const carts = await marketingService.listAbandonedCarts({
      status: query.status,
      thresholdMinutes: query.thresholdMinutes,
      now,
    });
    return res.json({ ok: true, carts });
  });

  router.post('/api/admin/marketing/abandoned-carts/:id/remind', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminAbandonedReminderBodySchema, req, res);
    if (!parsed) return;

    const now = parseOptionalDate(parsed.nowIso);
    if (parsed.nowIso && !now) {
      return res.status(400).json({ ok: false, message: 'فرمت زمان nowIso معتبر نیست.' });
    }

    const outcome = await marketingService.sendAbandonedCartReminder({
      cartId: String(req.params.id || ''),
      channel: parsed.channel,
      customMessage: parsed.customMessage,
      respectQuietHours: parsed.respectQuietHours,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email,
      origin: getOrigin(req),
      now,
    });

    if (!outcome.ok) {
      return res.status(outcome.status).json({ ok: false, message: outcome.message });
    }
    return res.json({
      ok: true,
      cart: outcome.cart,
      outboxMessage: outcome.message,
    });
  });

  router.get('/api/admin/marketing/suppression', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const suppressions = await marketingService.listSuppressions();
    return res.json({ ok: true, suppressions });
  });

  router.post('/api/admin/marketing/suppression', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminSuppressionAddBodySchema, req, res);
    if (!parsed) return;

    const norm = normalizeMarketingContact(parsed.contact);
    if (!norm) {
      return res.status(400).json({ ok: false, message: 'ایمیل یا شماره موبایل معتبر وارد کنید.' });
    }

    const entry = await marketingService.addToSuppression({
      contact: norm.contact,
      reason: 'admin_manual',
      note: parsed.note,
    });

    await authTarget &&
      'audit' in authTarget &&
      authTarget.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: adminCheck.user.uid,
        actorEmail: adminCheck.user.email,
        action: 'marketing.suppression_added',
        entityType: 'suppression',
        entityId: entry?.id || norm.contact,
        summary: `Added ${norm.contact} to marketing suppression list`,
        createdAt: new Date().toISOString(),
      });

    return res.status(201).json({ ok: true, entry });
  });

  router.delete('/api/admin/marketing/suppression/:id', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const removed = await marketingService.removeSuppression(String(req.params.id || ''));
    if (!removed) {
      return res.status(404).json({ ok: false, message: 'رکورد در لیست عدم ارسال یافت نشد.' });
    }
    return res.json({ ok: true });
  });

  router.get('/api/admin/marketing/consents', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'marketing:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const consents = await marketingService.listConsents();
    return res.json({ ok: true, consents });
  });

  return router;
}
