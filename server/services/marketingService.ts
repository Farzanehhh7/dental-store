import crypto from 'node:crypto';
import type {
  AbandonedCartItem,
  AbandonedCartRecord,
  CampaignRun,
  CampaignSegment,
  MarketingChannel,
  MarketingConsentRecord,
  OutboxMessage,
  OutboxStatus,
  SuppressionEntry,
} from '../../src/types/domain';
import { getSessionSecret, normalizeMobile } from '../auth';
import { validateServerEnv } from '../config/env';
import { calculateAuthoritativeCheckout } from '../pricing';
import type { RepositoryBundle } from '../repositories';
import type { ISmsProvider } from './smsProvider';
import { createSmsProvider, formatOutboxProvider } from './smsProvider';

const OUTBOX_TRANSITIONS: Record<OutboxStatus, OutboxStatus[]> = {
  queued: ['sent', 'delivered', 'failed'],
  scheduled_quiet_hours: ['sent', 'failed'],
  sent: ['delivered', 'failed'],
  delivered: [],
  failed: [],
  suppressed: [],
  rate_limited: [],
};

const UNSUBSCRIBE_KEYWORDS = new Set(['لغو', 'لغو۱۱', 'لغو11', '11', 'stop', 'unsubscribe', 'cancel']);

export function normalizeMarketingContact(raw: string): { contact: string; type: 'mobile' | 'email' } | null {
  const clean = (raw || '').trim();
  if (!clean) return null;
  if (clean.includes('@')) {
    const email = clean.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { contact: email, type: 'email' };
  }
  const mob = normalizeMobile(clean);
  if (/^09\d{9}$/.test(mob)) {
    return { contact: mob, type: 'mobile' };
  }
  return null;
}

export function isWithinQuietHours(
  date: Date,
  startHour: number,
  endHour: number,
  tzOffsetMinutes: number
): boolean {
  if (startHour === endHour) return false;
  const localMs = date.getTime() + tzOffsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const hour = localDate.getUTCHours();
  if (startHour > endHour) {
    // Overnight window, e.g. 22:00 .. 08:00
    return hour >= startHour || hour < endHour;
  }
  return hour >= startHour && hour < endHour;
}

export function computeNextWindowOpenIso(
  date: Date,
  startHour: number,
  endHour: number,
  tzOffsetMinutes: number
): string {
  const localMs = date.getTime() + tzOffsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const targetLocal = new Date(localMs);
  targetLocal.setUTCHours(endHour, 0, 0, 0);

  const hour = localDate.getUTCHours();
  if (startHour > endHour) {
    if (hour >= startHour) {
      targetLocal.setUTCDate(targetLocal.getUTCDate() + 1);
    }
  } else if (hour >= endHour) {
    targetLocal.setUTCDate(targetLocal.getUTCDate() + 1);
  }
  return new Date(targetLocal.getTime() - tzOffsetMinutes * 60_000).toISOString();
}

export interface UnsubscribeTokenPayload {
  contact: string;
  ownerKey?: string;
  channel?: MarketingChannel;
  iat: number;
}

export function signUnsubscribeToken(payload: Omit<UnsubscribeTokenPayload, 'iat'>): string {
  const full: UnsubscribeTokenPayload = { ...payload, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`unsub:${body}`)
    .digest('hex')
    .slice(0, 32);
  return `unsub_${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const clean = (token || '').trim();
  if (!clean.startsWith('unsub_')) return null;
  const dotIdx = clean.indexOf('.');
  if (dotIdx <= 6) return null;
  const body = clean.slice(6, dotIdx);
  const sig = clean.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`unsub:${body}`)
    .digest('hex')
    .slice(0, 32);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UnsubscribeTokenPayload;
    if (!parsed || typeof parsed.contact !== 'string' || !parsed.contact.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(
  origin: string,
  contact: string,
  ownerKey?: string,
  channel?: MarketingChannel
): string {
  const token = signUnsubscribeToken({ contact, ...(ownerKey ? { ownerKey } : {}), ...(channel ? { channel } : {}) });
  const cleanOrigin = (origin || 'https://dentalmarket.ir').replace(/\/+$/, '');
  return `${cleanOrigin}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function getLocalDayKey(date: Date, tzOffsetMinutes: number): string {
  const local = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
}

export interface CustomerIdentity {
  ownerKey: string;
  userId?: string;
  mobile?: string;
  email?: string;
  displayName?: string;
}

export interface CreateMarketingServiceOptions {
  smsProvider?: ISmsProvider;
}

export function createMarketingService(repos: RepositoryBundle, options?: CreateMarketingServiceOptions) {
  const env = validateServerEnv(process.env);
  const smsProvider = options?.smsProvider ?? createSmsProvider(process.env);

  function getConfig() {
    const runtimeEnv = validateServerEnv(process.env);
    return {
      quietStartHour: runtimeEnv.MARKETING_QUIET_HOURS_START,
      quietEndHour: runtimeEnv.MARKETING_QUIET_HOURS_END,
      tzOffsetMinutes: runtimeEnv.MARKETING_TIMEZONE_OFFSET_MINUTES,
      abandonedCartMinutes: runtimeEnv.ABANDONED_CART_MINUTES,
      reminderThrottleHours: runtimeEnv.MARKETING_REMINDER_THROTTLE_HOURS,
      dailyRecipientMax: runtimeEnv.MARKETING_PER_RECIPIENT_DAILY_MAX,
      siteOrigin: (runtimeEnv.SITE_URL || 'https://dentalmarket.ir').replace(/\/+$/, ''),
    };
  }

  async function isSuppressedContact(contact: string): Promise<boolean> {
    const sup = await repos.marketing.getSuppressionByContact(contact);
    return Boolean(sup);
  }

  async function addToSuppression(params: {
    contact: string;
    reason: SuppressionEntry['reason'];
    note?: string;
  }): Promise<SuppressionEntry | null> {
    const norm = normalizeMarketingContact(params.contact);
    if (!norm) return null;

    const existing = await repos.marketing.getSuppressionByContact(norm.contact);
    const nowIso = new Date().toISOString();
    const entry: SuppressionEntry = existing
      ? { ...existing, reason: params.reason, ...(params.note ? { note: params.note } : {}) }
      : {
          id: `sup_${crypto.createHash('sha256').update(norm.contact).digest('hex').slice(0, 12)}`,
          contact: norm.contact,
          type: norm.type,
          reason: params.reason,
          ...(params.note ? { note: params.note } : {}),
          createdAt: nowIso,
        };
    await repos.marketing.saveSuppression(entry);

    // Sync newsletter subscriber status -> unsubscribed
    const sub = await repos.engagement.findNewsletterByContact(norm.contact);
    if (sub && sub.status !== 'unsubscribed') {
      await repos.engagement.saveNewsletterSubscriber({ ...sub, status: 'unsubscribed' });
    }

    // Sync marketing consent record -> opted out
    const consent = await repos.marketing.findConsentByContact(norm.contact);
    if (consent) {
      await repos.marketing.saveConsent({
        ...consent,
        marketingOptIn: false,
        smsOptIn: norm.type === 'mobile' ? false : consent.smsOptIn,
        emailOptIn: norm.type === 'email' ? false : consent.emailOptIn,
        abandonedCartConsent: false,
        source:
          params.reason === 'sms_keyword'
            ? 'inbound_sms'
            : params.reason === 'unsubscribe_link'
            ? 'unsubscribe_link'
            : 'admin',
        updatedAt: nowIso,
      });
    }

    // Also update any open abandoned cart for this contact/owner
    if (consent?.ownerKey) {
      const cart = await repos.marketing.findAbandonedCartByOwner(consent.ownerKey);
      if (cart && cart.status !== 'recovered') {
        await repos.marketing.saveAbandonedCart({
          ...cart,
          consentGranted: false,
          status: 'opted_out',
          updatedAt: nowIso,
        });
      }
    }

    return entry;
  }

  async function removeSuppression(id: string): Promise<boolean> {
    return repos.marketing.deleteSuppression(id);
  }

  async function getConsentForIdentity(identity: CustomerIdentity): Promise<MarketingConsentRecord> {
    const existing =
      (await repos.marketing.getConsentByKey(identity.ownerKey)) ??
      (identity.mobile ? await repos.marketing.findConsentByContact(identity.mobile) : null) ??
      (identity.email ? await repos.marketing.findConsentByContact(identity.email) : null);

    if (existing) return existing;

    const nowIso = new Date().toISOString();
    return {
      id: `mc_${crypto.createHash('sha256').update(identity.ownerKey).digest('hex').slice(0, 12)}`,
      ownerKey: identity.ownerKey,
      ...(identity.userId ? { userId: identity.userId } : {}),
      ...(identity.mobile ? { mobile: normalizeMobile(identity.mobile) } : {}),
      ...(identity.email ? { email: identity.email.trim().toLowerCase() } : {}),
      ...(identity.displayName ? { displayName: identity.displayName } : {}),
      marketingOptIn: false,
      smsOptIn: false,
      emailOptIn: false,
      abandonedCartConsent: false,
      source: 'account',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  async function updateConsentForIdentity(
    identity: CustomerIdentity,
    patch: {
      marketingOptIn?: boolean;
      smsOptIn?: boolean;
      emailOptIn?: boolean;
      abandonedCartConsent?: boolean;
      mobile?: string;
      email?: string;
      displayName?: string;
      source?: MarketingConsentRecord['source'];
    }
  ): Promise<{ consent: MarketingConsentRecord; suppressedRemoved: boolean }> {
    const prev = await getConsentForIdentity(identity);
    const nowIso = new Date().toISOString();

    const cleanMobile = patch.mobile
      ? normalizeMobile(patch.mobile)
      : identity.mobile
      ? normalizeMobile(identity.mobile)
      : prev.mobile;
    const cleanEmail = patch.email
      ? patch.email.trim().toLowerCase()
      : identity.email
      ? identity.email.trim().toLowerCase()
      : prev.email;

    const marketingOptIn = patch.marketingOptIn ?? prev.marketingOptIn;
    const smsOptIn = patch.smsOptIn ?? (patch.marketingOptIn !== undefined ? patch.marketingOptIn : prev.smsOptIn);
    const emailOptIn = patch.emailOptIn ?? (patch.marketingOptIn !== undefined ? patch.marketingOptIn : prev.emailOptIn);
    const abandonedCartConsent = patch.abandonedCartConsent ?? prev.abandonedCartConsent;

    const next: MarketingConsentRecord = {
      ...prev,
      ownerKey: identity.ownerKey,
      ...(identity.userId ? { userId: identity.userId } : {}),
      ...(cleanMobile ? { mobile: cleanMobile } : {}),
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(patch.displayName || identity.displayName
        ? { displayName: (patch.displayName || identity.displayName || '').trim() }
        : {}),
      marketingOptIn,
      smsOptIn,
      emailOptIn,
      abandonedCartConsent,
      source: patch.source ?? 'account',
      updatedAt: nowIso,
    };

    await repos.marketing.saveConsent(next);

    // If user explicitly re-enabled marketing opt-in from their account, clear suppression for their contacts
    let suppressedRemoved = false;
    if (marketingOptIn && (smsOptIn || emailOptIn)) {
      for (const c of [cleanMobile, cleanEmail]) {
        if (!c) continue;
        const sup = await repos.marketing.getSuppressionByContact(c);
        if (sup) {
          await repos.marketing.deleteSuppression(sup.id);
          suppressedRemoved = true;
        }
        const sub = await repos.engagement.findNewsletterByContact(c);
        if (sub && sub.status === 'unsubscribed') {
          await repos.engagement.saveNewsletterSubscriber({ ...sub, status: 'active' });
        }
      }
    }

    // Update any open abandoned cart consent flag
    const openCart = await repos.marketing.findAbandonedCartByOwner(identity.ownerKey);
    if (openCart && openCart.status !== 'recovered') {
      await repos.marketing.saveAbandonedCart({
        ...openCart,
        consentGranted: abandonedCartConsent,
        status: !abandonedCartConsent ? 'opted_out' : openCart.status === 'opted_out' ? 'active' : openCart.status,
        updatedAt: nowIso,
      });
    }

    return { consent: next, suppressedRemoved };
  }

  async function countRecipientMessagesToday(contact: string, now: Date, tzOffsetMinutes: number): Promise<number> {
    const todayKey = getLocalDayKey(now, tzOffsetMinutes);
    const all = await repos.marketing.listOutboxMessages({ limit: 500 });
    return all.filter(
      (m) =>
        m.recipient === contact &&
        getLocalDayKey(new Date(m.sentAt || m.scheduledFor || m.createdAt), tzOffsetMinutes) === todayKey &&
        m.status !== 'suppressed' &&
        m.status !== 'rate_limited' &&
        m.status !== 'failed'
    ).length;
  }

  async function dispatchSingleMessage(params: {
    channel: MarketingChannel;
    recipient: string;
    recipientName?: string;
    userId?: string;
    ownerKey?: string;
    body: string;
    subject?: string;
    campaignRunId?: string;
    abandonedCartId?: string;
    respectQuietHours: boolean;
    now: Date;
    origin?: string;
  }): Promise<{ outcome: 'sent' | 'scheduled_quiet_hours' | 'failed' | 'suppressed' | 'rate_limited'; message: OutboxMessage }> {
    const cfg = getConfig();
    const nowIso = params.now.toISOString();
    const id = `out_${crypto.randomBytes(6).toString('hex')}`;
    const unsubscribeUrl = buildUnsubscribeUrl(
      params.origin || cfg.siteOrigin,
      params.recipient,
      params.ownerKey,
      params.channel
    );
    const bodyWithUnsub =
      params.channel === 'sms' && !params.body.includes('لغو')
        ? `${params.body}\nلغو: ارسال 11`
        : params.body;

    const baseMsg: OutboxMessage = {
      id,
      ...(params.campaignRunId ? { campaignRunId: params.campaignRunId } : {}),
      ...(params.abandonedCartId ? { abandonedCartId: params.abandonedCartId } : {}),
      channel: params.channel,
      provider: formatOutboxProvider(params.channel, smsProvider),
      recipient: params.recipient,
      ...(params.recipientName ? { recipientName: params.recipientName } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.subject ? { subject: params.subject } : {}),
      body: bodyWithUnsub,
      unsubscribeUrl,
      status: 'queued',
      statusHistory: [{ status: 'queued', at: nowIso, note: 'ایجاد پیام در صف ارسال' }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Suppression guard
    if (await isSuppressedContact(params.recipient)) {
      baseMsg.status = 'suppressed';
      baseMsg.statusHistory.push({ status: 'suppressed', at: nowIso, note: 'گیرنده در لیست عدم ارسال (Suppression) است.' });
      await repos.marketing.saveOutboxMessage(baseMsg);
      return { outcome: 'suppressed', message: baseMsg };
    }

    // Per-recipient daily rate limit
    const sentToday = await countRecipientMessagesToday(params.recipient, params.now, cfg.tzOffsetMinutes);
    if (sentToday >= cfg.dailyRecipientMax) {
      baseMsg.status = 'rate_limited';
      baseMsg.statusHistory.push({
        status: 'rate_limited',
        at: nowIso,
        note: `سقف ارسال روزانه برای گیرنده (${cfg.dailyRecipientMax}) تکمیل شده است.`,
      });
      await repos.marketing.saveOutboxMessage(baseMsg);
      return { outcome: 'rate_limited', message: baseMsg };
    }

    // Quiet hours guard
    if (
      params.respectQuietHours &&
      isWithinQuietHours(params.now, cfg.quietStartHour, cfg.quietEndHour, cfg.tzOffsetMinutes)
    ) {
      const scheduledFor = computeNextWindowOpenIso(
        params.now,
        cfg.quietStartHour,
        cfg.quietEndHour,
        cfg.tzOffsetMinutes
      );
      baseMsg.status = 'scheduled_quiet_hours';
      baseMsg.scheduledFor = scheduledFor;
      baseMsg.statusHistory.push({
        status: 'scheduled_quiet_hours',
        at: nowIso,
        note: `به دلیل ساعت سکوت (${cfg.quietStartHour}:00 تا ${cfg.quietEndHour}:00) زمان‌بندی شد.`,
      });
      await repos.marketing.saveOutboxMessage(baseMsg);
      return { outcome: 'scheduled_quiet_hours', message: baseMsg };
    }

    if (params.channel === 'email') {
      baseMsg.status = 'sent';
      baseMsg.sentAt = nowIso;
      baseMsg.providerMessageId = `sbx_mail_${crypto.randomBytes(6).toString('hex')}`;
      baseMsg.statusHistory.push({ status: 'sent', at: nowIso, note: 'ارسال ایمیل در Outbox ثبت شد.' });
      await repos.marketing.saveOutboxMessage(baseMsg);
      return { outcome: 'sent', message: baseMsg };
    }

    const sendRes = await smsProvider.send({
      to: params.recipient,
      body: bodyWithUnsub,
      outboxId: id,
    });
    if (!sendRes.ok) {
      baseMsg.status = 'failed';
      baseMsg.errorMessage = sendRes.errorMessage || 'خطا در ارسال پیامک';
      baseMsg.statusHistory.push({ status: 'failed', at: nowIso, note: baseMsg.errorMessage });
      await repos.marketing.saveOutboxMessage(baseMsg);
      return { outcome: 'failed', message: baseMsg };
    }

    baseMsg.status = 'sent';
    baseMsg.sentAt = nowIso;
    baseMsg.providerMessageId = sendRes.providerMessageId;
    baseMsg.statusHistory.push({ status: 'sent', at: nowIso, note: `ارسال توسط ${sendRes.provider}` });
    await repos.marketing.saveOutboxMessage(baseMsg);
    return { outcome: 'sent', message: baseMsg };
  }

  interface CandidateRecipient {
    contact: string;
    type: 'mobile' | 'email';
    name?: string;
    userId?: string;
    ownerKey?: string;
    optedIn: boolean;
  }

  async function resolveSegmentCandidates(
    segment: CampaignSegment,
    channel: MarketingChannel,
    customContacts?: string[]
  ): Promise<CandidateRecipient[]> {
    const desiredType: 'mobile' | 'email' = channel === 'sms' ? 'mobile' : 'email';
    const byContact = new Map<string, CandidateRecipient>();

    const consents = await repos.marketing.listConsents();
    const consentByContact = new Map<string, MarketingConsentRecord>();
    for (const c of consents) {
      if (c.mobile) consentByContact.set(normalizeMobile(c.mobile), c);
      if (c.email) consentByContact.set(c.email.trim().toLowerCase(), c);
    }

    const subscribers = await repos.engagement.listNewsletterSubscribers();
    const subStatusByContact = new Map<string, 'active' | 'unsubscribed'>();
    for (const s of subscribers) {
      const norm = normalizeMarketingContact(s.contact);
      if (norm) subStatusByContact.set(norm.contact, s.status);
    }

    const pushCandidate = (
      rawContact: string | undefined,
      meta: { name?: string; userId?: string; ownerKey?: string; defaultOptIn: boolean }
    ) => {
      if (!rawContact) return;
      const norm = normalizeMarketingContact(rawContact);
      if (!norm || norm.type !== desiredType) return;

      const consentRec = consentByContact.get(norm.contact);
      const subStatus = subStatusByContact.get(norm.contact);
      let optedIn = meta.defaultOptIn;

      if (subStatus === 'unsubscribed') {
        optedIn = false;
      } else if (consentRec) {
        const channelOptIn = channel === 'sms' ? consentRec.smsOptIn : consentRec.emailOptIn;
        optedIn = consentRec.marketingOptIn && channelOptIn;
      } else if (subStatus === 'active') {
        optedIn = true;
      }

      const existing = byContact.get(norm.contact);
      if (!existing) {
        byContact.set(norm.contact, {
          contact: norm.contact,
          type: norm.type,
          name: meta.name || consentRec?.displayName,
          userId: meta.userId || consentRec?.userId,
          ownerKey: meta.ownerKey || consentRec?.ownerKey,
          optedIn,
        });
      }
    };

    if (segment === 'newsletter_subscribers') {
      for (const s of subscribers) {
        pushCandidate(s.contact, { defaultOptIn: s.status === 'active' });
      }
    } else if (segment === 'abandoned_cart_users') {
      const carts = await repos.marketing.listAbandonedCarts();
      for (const cart of carts) {
        if (cart.status === 'recovered') continue;
        const contact = channel === 'sms' ? cart.mobile : cart.email;
        pushCandidate(contact, {
          name: cart.customerName,
          userId: cart.userId,
          ownerKey: cart.ownerKey,
          defaultOptIn: cart.consentGranted,
        });
      }
    } else if (segment === 'approved_b2b') {
      const ordersRes = await repos.orders.list({ page: 1, limit: 500 });
      for (const ord of ordersRes.items) {
        if (ord.customerGroup !== 'retail') {
          pushCandidate(ord.customerMobile, {
            name: ord.customerName,
            userId: ord.userId,
            ownerKey: ord.userId,
            defaultOptIn: false,
          });
        }
      }
      for (const c of consents) {
        const grp = await repos.catalog.getUserGroupAndProfile({ uid: c.userId, mobile: c.mobile });
        if (grp.b2bStatus === 'approved') {
          pushCandidate(channel === 'sms' ? c.mobile : c.email, {
            name: c.displayName,
            userId: c.userId,
            ownerKey: c.ownerKey,
            defaultOptIn: c.marketingOptIn && (channel === 'sms' ? c.smsOptIn : c.emailOptIn),
          });
        }
      }
    } else if (segment === 'all_customers') {
      for (const s of subscribers) {
        pushCandidate(s.contact, { defaultOptIn: s.status === 'active' });
      }
      for (const c of consents) {
        pushCandidate(channel === 'sms' ? c.mobile : c.email, {
          name: c.displayName,
          userId: c.userId,
          ownerKey: c.ownerKey,
          defaultOptIn: c.marketingOptIn && (channel === 'sms' ? c.smsOptIn : c.emailOptIn),
        });
      }
      const ordersRes = await repos.orders.list({ page: 1, limit: 500 });
      for (const ord of ordersRes.items) {
        pushCandidate(ord.customerMobile, {
          name: ord.customerName,
          userId: ord.userId,
          ownerKey: ord.userId,
          defaultOptIn: false,
        });
      }
    } else if (segment === 'custom_contacts') {
      for (const raw of customContacts ?? []) {
        pushCandidate(raw, { defaultOptIn: true });
      }
    }

    return Array.from(byContact.values());
  }

  async function sendCampaign(params: {
    title: string;
    channel: MarketingChannel;
    segment: CampaignSegment;
    message: string;
    subject?: string;
    customContacts?: string[];
    respectQuietHours?: boolean;
    actorUid?: string;
    actorEmail?: string;
    origin?: string;
    now?: Date;
  }): Promise<{ run: CampaignRun; messages: OutboxMessage[] }> {
    const now = params.now ?? new Date();
    const nowIso = now.toISOString();
    const runId = `cmp_run_${crypto.randomBytes(6).toString('hex')}`;
    const respectQuietHours = params.respectQuietHours ?? true;

    const candidates = await resolveSegmentCandidates(params.segment, params.channel, params.customContacts);
    let sentCount = 0;
    let scheduledQuietHoursCount = 0;
    let skippedOptOutCount = 0;
    let skippedSuppressedCount = 0;
    let skippedRateLimitCount = 0;
    let failedCount = 0;
    const messages: OutboxMessage[] = [];

    for (const c of candidates) {
      if (!c.optedIn) {
        skippedOptOutCount += 1;
        continue;
      }

      const dispatch = await dispatchSingleMessage({
        channel: params.channel,
        recipient: c.contact,
        recipientName: c.name,
        userId: c.userId,
        ownerKey: c.ownerKey,
        body: params.message,
        subject: params.subject,
        campaignRunId: runId,
        respectQuietHours,
        now,
        origin: params.origin,
      });
      messages.push(dispatch.message);

      if (dispatch.outcome === 'sent') sentCount += 1;
      else if (dispatch.outcome === 'scheduled_quiet_hours') scheduledQuietHoursCount += 1;
      else if (dispatch.outcome === 'suppressed') skippedSuppressedCount += 1;
      else if (dispatch.outcome === 'rate_limited') skippedRateLimitCount += 1;
      else failedCount += 1;
    }

    const run: CampaignRun = {
      id: runId,
      title: params.title.trim(),
      channel: params.channel,
      segment: params.segment,
      providerMode: smsProvider.mode,
      messageTemplate: params.message.trim(),
      respectQuietHours,
      totalMatched: candidates.length,
      sentCount,
      deliveredCount: 0,
      scheduledQuietHoursCount,
      skippedOptOutCount,
      skippedSuppressedCount,
      skippedRateLimitCount,
      failedCount,
      ...(params.actorUid ? { actorUid: params.actorUid } : {}),
      ...(params.actorEmail ? { actorEmail: params.actorEmail } : {}),
      createdAt: nowIso,
    };

    await repos.marketing.saveCampaignRun(run);
    await repos.audit.append({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      actorType: 'admin',
      actorId: params.actorUid,
      actorEmail: params.actorEmail,
      action: 'marketing.campaign_sent',
      entityType: 'campaign_run',
      entityId: run.id,
      summary: `Campaign "${run.title}" dispatched (${run.sentCount} sent, ${run.scheduledQuietHoursCount} quiet-hours, ${run.skippedOptOutCount} opt-out, ${run.skippedSuppressedCount} suppressed)`,
      createdAt: nowIso,
    });

    return { run, messages };
  }

  async function transitionOutboxStatus(
    id: string,
    nextStatus: 'sent' | 'delivered' | 'failed',
    note?: string
  ): Promise<{ ok: true; message: OutboxMessage } | { ok: false; status: number; message: string }> {
    const msg = await repos.marketing.getOutboxMessage(id);
    if (!msg) {
      return { ok: false, status: 404, message: 'پیام Outbox یافت نشد.' };
    }
    const allowed = OUTBOX_TRANSITIONS[msg.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      return {
        ok: false,
        status: 400,
        message: `انتقال وضعیت پیام از «${msg.status}» به «${nextStatus}» مجاز نیست.`,
      };
    }

    const nowIso = new Date().toISOString();
    const updated: OutboxMessage = {
      ...msg,
      status: nextStatus,
      ...(nextStatus === 'sent' && !msg.sentAt ? { sentAt: nowIso } : {}),
      ...(nextStatus === 'delivered' ? { deliveredAt: nowIso } : {}),
      ...(nextStatus === 'failed' && note ? { errorMessage: note } : {}),
      statusHistory: [
        ...(msg.statusHistory || []),
        { status: nextStatus, at: nowIso, ...(note ? { note } : {}) },
      ],
      updatedAt: nowIso,
    };
    await repos.marketing.saveOutboxMessage(updated);

    // Update parent campaign delivered/failed counter if applicable
    if (msg.campaignRunId) {
      const runs = await repos.marketing.listCampaignRuns(200);
      const parent = runs.find((r) => r.id === msg.campaignRunId);
      if (parent) {
        await repos.marketing.saveCampaignRun({
          ...parent,
          deliveredCount: nextStatus === 'delivered' ? parent.deliveredCount + 1 : parent.deliveredCount,
          failedCount: nextStatus === 'failed' ? parent.failedCount + 1 : parent.failedCount,
        });
      }
    }

    return { ok: true, message: updated };
  }

  async function flushScheduledOutbox(now: Date = new Date()): Promise<{
    processed: number;
    sent: number;
    failed: number;
    suppressed: number;
  }> {
    const cfg = getConfig();
    if (isWithinQuietHours(now, cfg.quietStartHour, cfg.quietEndHour, cfg.tzOffsetMinutes)) {
      return { processed: 0, sent: 0, failed: 0, suppressed: 0 };
    }

    const scheduled = await repos.marketing.listOutboxMessages({ status: 'scheduled_quiet_hours', limit: 500 });
    const nowIso = now.toISOString();
    let processed = 0;
    let sent = 0;
    let failed = 0;
    let suppressed = 0;

    for (const msg of scheduled) {
      if (msg.scheduledFor && new Date(msg.scheduledFor).getTime() > now.getTime()) {
        continue;
      }
      processed += 1;

      if (await isSuppressedContact(msg.recipient)) {
        const next: OutboxMessage = {
          ...msg,
          status: 'suppressed',
          statusHistory: [
            ...msg.statusHistory,
            { status: 'suppressed', at: nowIso, note: 'پیش از ارسال زمان‌بندی‌شده، لغو اشتراک ثبت شده است.' },
          ],
          updatedAt: nowIso,
        };
        await repos.marketing.saveOutboxMessage(next);
        suppressed += 1;
        continue;
      }

      if (msg.channel === 'email') {
        const next: OutboxMessage = {
          ...msg,
          status: 'sent',
          sentAt: nowIso,
          providerMessageId: `sbx_mail_${crypto.randomBytes(6).toString('hex')}`,
          statusHistory: [...msg.statusHistory, { status: 'sent', at: nowIso, note: 'ارسال پس از پایان ساعت سکوت' }],
          updatedAt: nowIso,
        };
        await repos.marketing.saveOutboxMessage(next);
        sent += 1;
        continue;
      }

      const sendRes = await smsProvider.send({ to: msg.recipient, body: msg.body, outboxId: msg.id });
      const next: OutboxMessage = {
        ...msg,
        status: sendRes.ok ? 'sent' : 'failed',
        ...(sendRes.ok ? { sentAt: nowIso, providerMessageId: sendRes.providerMessageId } : { errorMessage: sendRes.errorMessage }),
        statusHistory: [
          ...msg.statusHistory,
          {
            status: sendRes.ok ? 'sent' : 'failed',
            at: nowIso,
            note: sendRes.ok ? 'ارسال پس از پایان ساعت سکوت' : sendRes.errorMessage,
          },
        ],
        updatedAt: nowIso,
      };
      await repos.marketing.saveOutboxMessage(next);
      if (sendRes.ok) sent += 1;
      else failed += 1;
    }

    return { processed, sent, failed, suppressed };
  }

  async function handleUnsubscribeToken(token: string): Promise<
    { ok: true; contact: string; entry: SuppressionEntry | null } | { ok: false; status: number; message: string }
  > {
    const payload = verifyUnsubscribeToken(token);
    if (!payload) {
      return { ok: false, status: 400, message: 'لینک لغو اشتراک نامعتبر یا دست‌کاری شده است.' };
    }
    const entry = await addToSuppression({
      contact: payload.contact,
      reason: 'unsubscribe_link',
      note: 'لغو اشتراک از طریق لینک اختصاصی',
    });
    return { ok: true, contact: payload.contact, entry };
  }

  async function handleInboundSms(params: {
    from: string;
    text: string;
    providerMessageId?: string;
  }): Promise<{ ok: boolean; unsubscribed: boolean; contact?: string; entry?: SuppressionEntry | null }> {
    const norm = normalizeMarketingContact(params.from);
    if (!norm || norm.type !== 'mobile') {
      return { ok: false, unsubscribed: false };
    }
    const normalizedText = normalizeMobile(params.text).trim().toLowerCase().replace(/\s+/g, '');
    const isKeyword =
      UNSUBSCRIBE_KEYWORDS.has(normalizedText) ||
      normalizedText.includes('لغو') ||
      normalizedText === 'stop' ||
      normalizedText === 'unsubscribe';

    if (!isKeyword) {
      return { ok: true, unsubscribed: false, contact: norm.contact };
    }

    const entry = await addToSuppression({
      contact: norm.contact,
      reason: 'sms_keyword',
      note: `دریافت کلیدواژه پیامکی: ${params.text.trim().slice(0, 60)}`,
    });
    return { ok: true, unsubscribed: true, contact: norm.contact, entry };
  }

  async function syncCart(params: {
    identity: CustomerIdentity;
    items: Array<{ productId: string; variantId: string; quantity: number }>;
    consentGranted: boolean;
    customerName?: string;
    mobile?: string;
    email?: string;
    now?: Date;
  }): Promise<AbandonedCartRecord | null> {
    const now = params.now ?? new Date();
    const nowIso = now.toISOString();
    const existing = await repos.marketing.findAbandonedCartByOwner(params.identity.ownerKey);

    if (params.items.length === 0) {
      if (existing && existing.status !== 'recovered') {
        await repos.marketing.saveAbandonedCart({
          ...existing,
          items: [],
          subtotal: 0,
          status: 'recovered',
          updatedAt: nowIso,
        });
      }
      return null;
    }

    const consentRec = await repos.marketing.getConsentByKey(params.identity.ownerKey);
    const cleanMobile = params.mobile
      ? normalizeMobile(params.mobile)
      : params.identity.mobile
      ? normalizeMobile(params.identity.mobile)
      : consentRec?.mobile;
    const cleanEmail = (params.email || params.identity.email || consentRec?.email)?.trim().toLowerCase();

    const effectiveConsent = params.consentGranted || Boolean(consentRec?.abandonedCartConsent);
    if (!effectiveConsent) {
      if (existing && existing.status !== 'recovered') {
        await repos.marketing.saveAbandonedCart({
          ...existing,
          consentGranted: false,
          status: 'opted_out',
          updatedAt: nowIso,
        });
      }
      return null;
    }

    const snapshot = await repos.catalog.getSnapshot();
    const userGroup = await repos.catalog.getUserGroupAndProfile({
      uid: params.identity.userId,
      mobile: cleanMobile,
    });
    const calc = calculateAuthoritativeCheckout(snapshot, {
      items: params.items,
      customerGroup: userGroup.customerGroup,
      userId: params.identity.userId ?? params.identity.ownerKey,
      shippingMethod: 'courier_tehran',
    });

    const authoritativeItems: AbandonedCartItem[] = calc.ok
      ? calc.items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          sku: it.sku,
          titleFa: it.titleFa,
          variantLabelFa: it.variantLabelFa,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        }))
      : [];

    if (authoritativeItems.length === 0) {
      return null;
    }

    const subtotal = authoritativeItems.reduce((sum, it) => sum + it.lineTotal, 0);
    const canReuseExisting = existing && existing.status !== 'recovered';
    const record: AbandonedCartRecord = {
      id: canReuseExisting ? existing.id : `cart_${crypto.randomBytes(6).toString('hex')}`,
      ownerKey: params.identity.ownerKey,
      ...(params.identity.userId ? { userId: params.identity.userId } : {}),
      ...(cleanMobile ? { mobile: cleanMobile } : {}),
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(params.customerName || params.identity.displayName || userGroup.displayName
        ? { customerName: (params.customerName || params.identity.displayName || userGroup.displayName || '').trim() }
        : {}),
      items: authoritativeItems,
      subtotal,
      status: 'active',
      consentGranted: true,
      reminderCount: canReuseExisting ? existing.reminderCount : 0,
      ...(canReuseExisting && existing.lastReminderAt ? { lastReminderAt: existing.lastReminderAt } : {}),
      lastActivityAt: nowIso,
      createdAt: canReuseExisting ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    };

    await repos.marketing.saveAbandonedCart(record);
    return record;
  }

  async function detectAbandonedCarts(options?: { now?: Date; thresholdMinutes?: number }): Promise<AbandonedCartRecord[]> {
    const cfg = getConfig();
    const now = options?.now ?? new Date();
    const nowIso = now.toISOString();
    const thresholdMinutes = options?.thresholdMinutes ?? cfg.abandonedCartMinutes;
    const cutoffMs = now.getTime() - thresholdMinutes * 60_000;

    const all = await repos.marketing.listAbandonedCarts();
    const result: AbandonedCartRecord[] = [];
    for (const cart of all) {
      if (
        cart.status === 'active' &&
        cart.consentGranted &&
        cart.items.length > 0 &&
        new Date(cart.lastActivityAt).getTime() <= cutoffMs
      ) {
        const updated: AbandonedCartRecord = {
          ...cart,
          status: 'abandoned',
          abandonedAt: cart.abandonedAt ?? nowIso,
          updatedAt: nowIso,
        };
        await repos.marketing.saveAbandonedCart(updated);
        result.push(updated);
      } else {
        result.push(cart);
      }
    }
    return result;
  }

  async function markRecoveredByOrder(params: {
    userId: string;
    mobile?: string;
    orderId: string;
    now?: Date;
  }): Promise<void> {
    const nowIso = (params.now ?? new Date()).toISOString();
    const cleanMob = params.mobile ? normalizeMobile(params.mobile) : '';
    const carts = await repos.marketing.listAbandonedCarts();
    for (const cart of carts) {
      if (cart.status === 'recovered') continue;
      const matchesOwner =
        cart.ownerKey === params.userId ||
        (cart.userId && cart.userId === params.userId) ||
        (cleanMob && cart.mobile && normalizeMobile(cart.mobile) === cleanMob);
      if (matchesOwner) {
        await repos.marketing.saveAbandonedCart({
          ...cart,
          status: 'recovered',
          recoveredOrderId: params.orderId,
          updatedAt: nowIso,
        });
      }
    }
  }

  async function sendAbandonedCartReminder(params: {
    cartId: string;
    channel?: MarketingChannel;
    customMessage?: string;
    respectQuietHours?: boolean;
    actorUid?: string;
    actorEmail?: string;
    origin?: string;
    now?: Date;
  }): Promise<
    | { ok: true; cart: AbandonedCartRecord; message: OutboxMessage }
    | { ok: false; status: number; message: string }
  > {
    const cfg = getConfig();
    const now = params.now ?? new Date();
    const nowIso = now.toISOString();
    const cart = await repos.marketing.getAbandonedCart(params.cartId);
    if (!cart) {
      return { ok: false, status: 404, message: 'سبد خرید رهاشده یافت نشد.' };
    }
    if (!cart.consentGranted || cart.status === 'opted_out') {
      return { ok: false, status: 403, message: 'مشتری رضایت دریافت یادآور سبد خرید را غیرفعال کرده است.' };
    }
    if (cart.status === 'recovered' || cart.items.length === 0) {
      return { ok: false, status: 400, message: 'این سبد قبلاً تکمیل یا خالی شده است.' };
    }

    // Strict 24h throttle per cart
    if (cart.lastReminderAt) {
      const elapsedMs = now.getTime() - new Date(cart.lastReminderAt).getTime();
      const throttleMs = cfg.reminderThrottleHours * 3_600_000;
      if (elapsedMs < throttleMs) {
        return {
          ok: false,
          status: 429,
          message: `محدودیت ارسال یادآور: حداکثر ۱ بار در هر ${cfg.reminderThrottleHours} ساعت برای هر سبد مجاز است.`,
        };
      }
    }

    const channel: MarketingChannel = params.channel ?? (cart.mobile ? 'sms' : 'email');
    const recipient = channel === 'sms' ? cart.mobile : cart.email;
    if (!recipient) {
      return {
        ok: false,
        status: 400,
        message: `اطلاعات تماس برای کانال ${channel === 'sms' ? 'پیامک' : 'ایمیل'} در این سبد ثبت نشده است.`,
      };
    }

    const firstTitle = cart.items[0]?.titleFa || 'اقلام دندانپزشکی';
    const messageBody =
      params.customMessage?.trim() ||
      `سبد خرید شما در دنتال‌مارکت (${firstTitle}${cart.items.length > 1 ? ` و ${cart.items.length - 1} کالای دیگر` : ''}) به ارزش ${cart.subtotal.toLocaleString('en-US')} تومان در انتظار تکمیل است.`;

    const dispatch = await dispatchSingleMessage({
      channel,
      recipient,
      recipientName: cart.customerName,
      userId: cart.userId,
      ownerKey: cart.ownerKey,
      body: messageBody,
      subject: 'تکمیل سبد خرید ناتمام در دنتال‌مارکت',
      abandonedCartId: cart.id,
      respectQuietHours: params.respectQuietHours ?? true,
      now,
      origin: params.origin,
    });

    if (dispatch.outcome === 'suppressed') {
      return { ok: false, status: 403, message: 'مخاطب در لیست عدم ارسال (لغو اشتراک) قرار دارد.' };
    }
    if (dispatch.outcome === 'rate_limited') {
      return { ok: false, status: 429, message: 'سقف ارسال روزانه به این مخاطب پر شده است.' };
    }

    const updatedCart: AbandonedCartRecord = {
      ...cart,
      status: 'reminded',
      abandonedAt: cart.abandonedAt ?? nowIso,
      reminderCount: (cart.reminderCount || 0) + 1,
      lastReminderAt: nowIso,
      updatedAt: nowIso,
    };
    await repos.marketing.saveAbandonedCart(updatedCart);

    await repos.audit.append({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      actorType: 'admin',
      actorId: params.actorUid,
      actorEmail: params.actorEmail,
      action: 'marketing.abandoned_reminder_sent',
      entityType: 'abandoned_cart',
      entityId: cart.id,
      summary: `Abandoned cart reminder (${dispatch.message.status}) sent to ${recipient}`,
      createdAt: nowIso,
    });

    return { ok: true, cart: updatedCart, message: dispatch.message };
  }

  return {
    smsProvider,
    getConfig,
    getConsentForIdentity,
    updateConsentForIdentity,
    addToSuppression,
    removeSuppression,
    listSuppressions: () => repos.marketing.listSuppressions(),
    listConsents: () => repos.marketing.listConsents(),
    sendCampaign,
    listCampaignRuns: (limit?: number) => repos.marketing.listCampaignRuns(limit),
    listOutboxMessages: (filter?: { status?: OutboxStatus; channel?: MarketingChannel; limit?: number }) =>
      repos.marketing.listOutboxMessages(filter),
    transitionOutboxStatus,
    flushScheduledOutbox,
    handleUnsubscribeToken,
    handleInboundSms,
    syncCart,
    detectAbandonedCarts,
    listAbandonedCarts: async (options?: {
      status?: AbandonedCartRecord['status'];
      thresholdMinutes?: number;
      now?: Date;
    }) => {
      await detectAbandonedCarts({ now: options?.now, thresholdMinutes: options?.thresholdMinutes });
      return repos.marketing.listAbandonedCarts(options?.status);
    },
    markRecoveredByOrder,
    sendAbandonedCartReminder,
    repo: repos.marketing,
    defaultQuietHours: {
      start: env.MARKETING_QUIET_HOURS_START,
      end: env.MARKETING_QUIET_HOURS_END,
    },
  };
}

export type MarketingService = ReturnType<typeof createMarketingService>;
