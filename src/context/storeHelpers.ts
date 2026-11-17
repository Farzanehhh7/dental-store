import type { User } from 'firebase/auth';
import { writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Order, Product } from '../types/domain';

export const LS_CART = 'dm_cart_v1';
export const LS_WISHLIST = 'dm_wishlist_v1';
export const LS_COMPARE = 'dm_compare_v1';
export const LS_RECENT = 'dm_recent_v1';
export const LS_CURRENCY = 'dm_currency_v1';
export const LS_DARK = 'dm_dark_v1';
export const LS_GUEST_ORDERS = 'dm_guest_orders_v1';
export const LS_DELETED_IDS = 'dm_deleted_catalog_v1';
export const LS_MOBILE_TOKEN = 'dm_mobile_session_token_v1';
export const LS_VERIFIED_PAYMENTS = 'dm_verified_payments_v1';

export const ADMIN_REQUIRED_MSG =
  'دسترسی غیرمجاز: برای ذخیره یا تغییر این بخش باید با حساب مدیر تاییدشده وارد شوید.';

export function readJsonLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function stripCostFromProduct(p: Product): Product {
  return {
    ...p,
    variants: p.variants.map((v) => {
      const { costPrice: _c, ...rest } = v;
      void _c;
      return rest;
    }),
  };
}

export function mergeById<T extends { id: string }>(
  baseline: T[],
  liveDocs: T[],
  deletedSet?: Set<string>
): T[] {
  const map = new Map<string, T>();
  for (const item of baseline) {
    if (!deletedSet?.has(item.id)) map.set(item.id, item);
  }
  for (const item of liveDocs) {
    if (!deletedSet?.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const exists = list.some((x) => x.id === item.id);
  return exists ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

export async function commitInChunks(
  operations: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  chunkSize = 300
) {
  for (let i = 0; i < operations.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = operations.slice(i, i + chunkSize);
    slice.forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function resolveAuthHeaders(
  authUser: User | null,
  mobileSessionToken?: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authUser) {
    try {
      const idToken = await authUser.getIdToken();
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
    } catch {
      // Ignore if token refresh fails temporarily
    }
  }
  if (mobileSessionToken) {
    headers['X-Mobile-Session'] = mobileSessionToken;
  }
  return headers;
}

export interface VerifiedPaymentMark {
  refId?: string;
  paidAt: string;
}

export function applyVerifiedPaymentOverlay(
  ordersList: Order[],
  verifiedMap: Record<string, VerifiedPaymentMark>
): Order[] {
  return ordersList.map((o) =>
    verifiedMap[o.id]
      ? {
          ...o,
          status: o.status === 'pending_payment' || o.status === 'awaiting_review' ? 'paid' : o.status,
          paymentStatus: 'paid',
        }
      : o
  );
}
