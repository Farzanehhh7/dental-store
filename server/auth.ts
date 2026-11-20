import crypto from 'node:crypto';
import type express from 'express';
import { ServerStore } from './persistence';

const NON_PROD_EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
let warnedEphemeralSecret = false;

export function normalizeMobile(raw: string): string {
  const persianMap: Record<string, string> = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };
  return raw.replace(/[۰-۹٠-٩]/g, (d) => persianMap[d] || d).replace(/[\s\-()]/g, '');
}

export function assertSessionSecretConfigured(): void {
  if (process.env.NODE_ENV === 'production') {
    const configured = process.env.SESSION_SECRET?.trim() || '';
    if (configured.length < 32) {
      throw new Error(
        'SESSION_SECRET is required and must be at least 32 characters long when NODE_ENV=production.'
      );
    }
  }
}

export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim() || '';
  if (process.env.NODE_ENV === 'production') {
    if (configured.length < 32) {
      throw new Error(
        'SESSION_SECRET is required and must be at least 32 characters long when NODE_ENV=production.'
      );
    }
    return configured;
  }
  if (configured.length > 0) {
    return configured;
  }
  if (!warnedEphemeralSecret) {
    warnedEphemeralSecret = true;
    console.warn(
      '[security] SESSION_SECRET is not set; using an ephemeral per-process secret for non-production.'
    );
  }
  return NON_PROD_EPHEMERAL_SECRET;
}

export function hashToken(raw: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(raw).digest('hex');
}

export function timingSafeHashEquals(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export type ModeCheckResult =
  | { ok: true; mode: 'sandbox' | 'live' }
  | { ok: false; status: number; message: string };

export function getSmsModeConfig(): ModeCheckResult {
  const rawMode = (process.env.SMS_PROVIDER || '').trim().toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const allowSandboxInProd = process.env.ALLOW_SANDBOX_IN_PROD === 'true';

  if (rawMode === 'sandbox') {
    if (isProd && !allowSandboxInProd) {
      return {
        ok: false,
        status: 503,
        message: 'حالت آزمایشی پیامک در محیط Production غیرفعال است. لطفاً SMS_PROVIDER=live را پیکربندی کنید.',
      };
    }
    return { ok: true, mode: 'sandbox' };
  }

  if (rawMode === 'live') {
    if (!process.env.SMS_API_KEY?.trim()) {
      return {
        ok: false,
        status: 503,
        message: 'کلید سرویس پیامک (SMS_API_KEY) روی سرور تنظیم نشده است.',
      };
    }
    return { ok: true, mode: 'live' };
  }

  return {
    ok: false,
    status: 503,
    message: 'ارسال پیامک پیکربندی نشده است (مقدار SMS_PROVIDER را روی sandbox یا live تنظیم کنید).',
  };
}

export function getPaymentModeConfig(gateway: 'zarinpal' | 'idpay'): ModeCheckResult {
  const rawMode = (process.env.PAYMENT_MODE || '').trim().toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const allowSandboxInProd = process.env.ALLOW_SANDBOX_IN_PROD === 'true';

  if (rawMode === 'sandbox') {
    if (isProd && !allowSandboxInProd) {
      return {
        ok: false,
        status: 503,
        message: 'حالت آزمایشی درگاه پرداخت در محیط Production مجاز نیست. لطفاً PAYMENT_MODE=live را تنظیم کنید.',
      };
    }
    return { ok: true, mode: 'sandbox' };
  }

  if (rawMode === 'live') {
    if (gateway === 'zarinpal' && !process.env.ZARINPAL_MERCHANT_ID?.trim()) {
      return {
        ok: false,
        status: 503,
        message: 'کد پذیرنده زرین‌پال (ZARINPAL_MERCHANT_ID) در سرور تنظیم نشده است.',
      };
    }
    if (gateway === 'idpay' && !process.env.IDPAY_API_KEY?.trim()) {
      return {
        ok: false,
        status: 503,
        message: 'کلید API درگاه آیدی‌پی (IDPAY_API_KEY) در سرور تنظیم نشده است.',
      };
    }
    return { ok: true, mode: 'live' };
  }

  return {
    ok: false,
    status: 503,
    message: 'حالت درگاه پرداخت پیکربندی نشده است (مقدار PAYMENT_MODE را روی sandbox یا live تنظیم کنید).',
  };
}

export function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function createMobileSession(store: ServerStore, mobile: string, displayName?: string) {
  const token = `dm_mob_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  store.data.mobileSessions[tokenHash] = {
    tokenHash,
    mobile,
    displayName,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  };
  store.save();
  return {
    token,
    session: {
      mobile,
      displayName,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

export function extractMobileTokenFromRequest(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer dm_mob_')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const headerToken = req.headers['x-mobile-session'];
  if (typeof headerToken === 'string' && headerToken.trim().startsWith('dm_mob_')) {
    return headerToken.trim();
  }
  const cookies = parseCookies(req);
  if (cookies.dm_mobile_session && cookies.dm_mobile_session.startsWith('dm_mob_')) {
    return cookies.dm_mobile_session;
  }
  return null;
}

export function resolveMobileSession(store: ServerStore, req: express.Request) {
  const rawToken = extractMobileTokenFromRequest(req);
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const record = store.data.mobileSessions[tokenHash];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    delete store.data.mobileSessions[tokenHash];
    store.save();
    return null;
  }
  return {
    token: rawToken,
    tokenHash,
    mobile: record.mobile,
    displayName: record.displayName,
    expiresAt: new Date(record.expiresAt).toISOString(),
  };
}

export function issueGuestOrderToken(orderId: string, orderNo: string, customerMobile: string): string {
  const cleanMobile = normalizeMobile(customerMobile);
  const payload = Buffer.from(JSON.stringify({ orderId, orderNo, mobile: cleanMobile }), 'utf8').toString('base64url');
  const sig = hashToken(`order_tok:${orderId}:${orderNo}:${cleanMobile}`).slice(0, 32);
  return `ordtok_${payload}.${sig}`;
}

export function verifyGuestOrderToken(
  token: string | null | undefined,
  order: { id: string; orderNo: string; customerMobile: string }
): boolean {
  if (!token || typeof token !== 'string' || !token.startsWith('ordtok_')) return false;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 7) return false;
  const sig = token.slice(dotIdx + 1).trim();
  const expectedSig = hashToken(
    `order_tok:${order.id}:${order.orderNo}:${normalizeMobile(order.customerMobile)}`
  ).slice(0, 32);
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
}

export function extractOrderToken(req: express.Request): string | null {
  const header = req.headers['x-order-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (typeof req.body?.orderToken === 'string' && req.body.orderToken.trim()) return req.body.orderToken.trim();
  if (typeof req.query?.orderToken === 'string' && req.query.orderToken.trim()) return req.query.orderToken.trim();
  if (typeof req.query?.token === 'string' && req.query.token.trim()) return req.query.token.trim();
  return null;
}

export function issueWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const clean = signature.replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = issueWebhookSignature(rawBody, secret);
  return timingSafeHashEquals(clean, expected);
}

export {
  extractFirebaseBearerToken,
  fetchFirebaseOrderForUser,
  verifyFirebaseAdmin,
  verifyFirebaseIdToken,
  verifyFirebaseUser,
  type FirestoreOrderSummary,
  type VerifiedFirebaseUser,
} from './lib/adminAuth';
