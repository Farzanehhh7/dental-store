import type express from 'express';
import firebaseConfig from '../../firebase-applet-config.json';
import { AdminRoleCode } from '../../src/types/domain';

const VALID_ADMIN_ROLES: AdminRoleCode[] = [
  'super_admin',
  'admin',
  'sales_mgr',
  'warehouse',
  'content',
  'support',
  'accountant',
];

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
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.E2E_ADMIN_TEST_TOKEN &&
    process.env.E2E_ADMIN_TEST_TOKEN.trim().length >= 24 &&
    token === process.env.E2E_ADMIN_TEST_TOKEN.trim()
  ) {
    return {
      user: {
        uid: 'e2e_test_admin',
        email: 'e2e-admin@example.com',
        emailVerified: true,
        displayName: 'مدیر تست E2E',
        idToken: token,
      },
      role: 'super_admin',
    };
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
