import crypto from 'node:crypto';
import type express from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { AdminRoleCode } from '../src/types/domain';
import { ServerStore } from './persistence';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

const VALID_ADMIN_ROLES: AdminRoleCode[] = [
  'super_admin',
  'admin',
  'sales_mgr',
  'warehouse',
  'content',
  'support',
  'accountant',
];

export function normalizeMobile(raw: string): string {
  const persianMap: Record<string, string> = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };
  return raw.replace(/[۰-۹٠-٩]/g, (d) => persianMap[d] || d).replace(/[\s\-()]/g, '');
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SECRET;
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

export function extractFirebaseBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token.startsWith('dm_mob_')) return null;
  return token;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  idToken: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || !firebaseConfig.apiKey) return null;
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };
    const user = payload.users?.[0];
    if (!user?.localId || !user.emailVerified) return null;
    return {
      uid: user.localId,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName,
      idToken,
    };
  } catch {
    return null;
  }
}

export async function verifyFirebaseUser(req: express.Request): Promise<VerifiedFirebaseUser | null> {
  const token = extractFirebaseBearerToken(req);
  if (!token) return null;
  return verifyFirebaseIdToken(token);
}

export async function verifyFirebaseAdmin(
  req: express.Request
): Promise<{ user: VerifiedFirebaseUser; role: AdminRoleCode } | { errorStatus: number; message: string }> {
  const token = extractFirebaseBearerToken(req);
  if (!token) {
    return { errorStatus: 401, message: 'احراز هویت ادمین (Bearer Token) الزامی است.' };
  }
  const user = await verifyFirebaseIdToken(token);
  if (!user) {
    return { errorStatus: 401, message: 'توکن احراز هویت نامعتبر یا ایمیل تاییدنشده است.' };
  }

  const adminUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(
    user.uid
  )}`;
  try {
    const adminRes = await fetch(adminUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!adminRes.ok) {
      return { errorStatus: 403, message: 'دسترسی غیرمجاز: حساب کاربری فاقد نقش مدیریتی تاییدشده است.' };
    }
    const docJson = (await adminRes.json()) as {
      fields?: { role?: { stringValue?: string } };
    };
    const role = docJson.fields?.role?.stringValue as AdminRoleCode | undefined;
    if (!role || !VALID_ADMIN_ROLES.includes(role)) {
      return { errorStatus: 403, message: 'نقش مدیریتی معتبر در admins یافت نشد.' };
    }
    return { user, role };
  } catch {
    return { errorStatus: 403, message: 'امکان استعلام نقش مدیریتی تاییدشده وجود ندارد.' };
  }
}

export interface FirestoreOrderSummary {
  id: string;
  orderNo: string;
  userId: string;
  customerMobile: string;
  status: string;
  paymentStatus: string;
  grandTotal: number;
}

export async function fetchFirebaseOrderForUser(
  orderId: string,
  idToken: string
): Promise<FirestoreOrderSummary | null> {
  if (!orderId || !idToken) return null;
  const orderUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/orders/${encodeURIComponent(
    orderId
  )}`;
  try {
    const res = await fetch(orderUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const docJson = (await res.json()) as {
      fields?: Record<string, { stringValue?: string; integerValue?: string; doubleValue?: number }>;
    };
    const f = docJson.fields;
    if (!f) return null;
    const rawTotal = f.grandTotal?.doubleValue ?? Number(f.grandTotal?.integerValue ?? 0);
    return {
      id: f.id?.stringValue || orderId,
      orderNo: f.orderNo?.stringValue || '',
      userId: f.userId?.stringValue || '',
      customerMobile: f.customerMobile?.stringValue || '',
      status: f.status?.stringValue || '',
      paymentStatus: f.paymentStatus?.stringValue || '',
      grandTotal: Number.isFinite(rawTotal) ? rawTotal : 0,
    };
  } catch {
    return null;
  }
}
