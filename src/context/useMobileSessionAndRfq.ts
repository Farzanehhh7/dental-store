import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { MobileSessionUser, Order, ProformaInvoice, RfqRequest } from '../types/domain';
import { LS_MOBILE_TOKEN, readJsonLS, resolveAuthHeaders, upsertById } from './storeHelpers';
import type { ToastMessage } from './storeTypes';

interface UseMobileSessionAndRfqArgs {
  authUser: User | null;
  authReady: boolean;
  isAdmin: boolean;
  dbSynced: boolean;
  pushToast: (text: string, tone?: ToastMessage['tone']) => void;
  onProformaCreated?: (proforma: ProformaInvoice) => void;
}

export function useMobileSessionAndRfq({
  authUser,
  authReady,
  isAdmin,
  dbSynced,
  pushToast,
  onProformaCreated,
}: UseMobileSessionAndRfqArgs) {
  const [mobileSession, setMobileSession] = useState<MobileSessionUser | null>(null);
  const [mobileSessionToken, setMobileSessionToken] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_MOBILE_TOKEN) || '';
    } catch {
      return '';
    }
  });
  const [mobileOrders, setMobileOrders] = useState<Order[]>(() => readJsonLS<Order[]>('dm_mobile_orders_cache_v1', []));
  const [rfqs, setRfqs] = useState<RfqRequest[]>([]);

  const persistMobileToken = (token: string) => {
    setMobileSessionToken(token);
    try {
      if (token) localStorage.setItem(LS_MOBILE_TOKEN, token);
      else localStorage.removeItem(LS_MOBILE_TOKEN);
    } catch {
      // Ignore storage quota issues
    }
  };

  const refreshMobileOrders = useCallback(
    async (overrideToken?: string) => {
      const tok = overrideToken ?? mobileSessionToken;
      if (!tok && !mobileSession) {
        setMobileOrders([]);
        return;
      }
      try {
        const headers = await resolveAuthHeaders(null, tok);
        const res = await fetch('/api/orders/mobile', {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.orders)) {
          setMobileOrders(data.orders as Order[]);
          try {
            localStorage.setItem('dm_mobile_orders_cache_v1', JSON.stringify(data.orders));
          } catch {
            // Ignore
          }
        }
      } catch {
        // Offline tolerance
      }
    },
    [mobileSessionToken, mobileSession]
  );

  const refreshRfqs = useCallback(
    async (overrideToken?: string) => {
      const tok = overrideToken ?? mobileSessionToken;
      if (!authUser && !tok && !mobileSession) {
        setRfqs([]);
        return;
      }
      try {
        const headers = await resolveAuthHeaders(authUser, tok);
        const res = await fetch('/api/rfq', {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.rfqs)) {
          setRfqs(data.rfqs as RfqRequest[]);
        }
      } catch {
        // Ignore transient network errors
      }
    },
    [authUser, mobileSessionToken, mobileSession]
  );

  // Hydrate server mobile session on startup
  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const headers = await resolveAuthHeaders(null, mobileSessionToken);
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data?.authenticated && data.session) {
          setMobileSession(data.session as MobileSessionUser);
        } else {
          setMobileSession(null);
          if (mobileSessionToken) persistMobileToken('');
        }
      } catch {
        // Ignore startup probe failure
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, [mobileSessionToken]);

  // Keep mobileOrders & rfqs synchronized when auth or mobile session changes
  useEffect(() => {
    if (!authReady) return;
    if (mobileSession) {
      void refreshMobileOrders();
    } else {
      setMobileOrders([]);
    }
    if (authUser || mobileSession) {
      void refreshRfqs();
    } else {
      setRfqs([]);
    }
  }, [authReady, authUser, isAdmin, mobileSession, refreshMobileOrders, refreshRfqs]);

  const sendMobileOtp = async (mobile: string) => {
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'ارسال کد تایید ناموفق بود.';
        pushToast(msg, 'error');
        return { ok: false, message: msg };
      }
      pushToast(data.message || 'کد تایید ارسال شد.', 'success');
      return {
        ok: true,
        mode: data.mode as 'sandbox' | 'live',
        sandboxCode: data.sandboxCode as string | undefined,
        message: data.message as string | undefined,
      };
    } catch {
      const msg = 'خطا در ارتباط با سرویس ارسال پیامک.';
      pushToast(msg, 'error');
      return { ok: false, message: msg };
    }
  };

  const verifyMobileOtp = async (mobile: string, code: string, displayName?: string) => {
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mobile, code, displayName }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'کد تایید معتبر نیست.';
        pushToast(msg, 'error');
        return { ok: false, message: msg };
      }
      const nextToken = String(data.sessionToken || '');
      persistMobileToken(nextToken);
      setMobileSession((data.session as MobileSessionUser) ?? { mobile, displayName });
      await Promise.all([refreshMobileOrders(nextToken), refreshRfqs(nextToken)]);
      pushToast('ورود و تایید شماره موبایل با موفقیت انجام شد.', 'success');
      return {
        ok: true,
        verifiedToken: String(data.verifiedToken || ''),
      };
    } catch {
      const msg = 'خطا در بررسی کد تایید.';
      pushToast(msg, 'error');
      return { ok: false, message: msg };
    }
  };

  const logoutMobile = async () => {
    try {
      const headers = await resolveAuthHeaders(null, mobileSessionToken);
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch {
      // Ignore network error during logout
    }
    persistMobileToken('');
    setMobileSession(null);
    setMobileOrders([]);
    try {
      localStorage.removeItem('dm_mobile_orders_cache_v1');
    } catch {
      // Ignore
    }
    pushToast('نشست موبایلی شما بسته شد.', 'info');
  };

  const submitRfq = async (payload: {
    productId: string;
    variantId: string;
    quantity: number;
    customerName: string;
    customerMobile: string;
    clinicName?: string;
    targetUnitPrice?: number;
    note?: string;
  }): Promise<RfqRequest | null> => {
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch('/api/rfq', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ثبت استعلام قیمت ناموفق بود.', 'error');
        return null;
      }
      const created = data.rfq as RfqRequest;
      setRfqs((prev) => upsertById(prev, created));

      if (authUser && dbSynced) {
        await setDoc(doc(db, 'rfqRequests', created.id), {
          ...created,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      pushToast(`استعلام قیمت ${created.rfqNo} ثبت شد.`, 'success');
      return created;
    } catch {
      pushToast('خطا در ارسال درخواست استعلام قیمت.', 'error');
      return null;
    }
  };

  const sendRfqMessage = async (rfqId: string, body: string, proposedUnitPrice?: number): Promise<boolean> => {
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/rfq/${encodeURIComponent(rfqId)}/messages`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ body, proposedUnitPrice }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ارسال پیام در گفتگو ناموفق بود.', 'error');
        return false;
      }
      setRfqs((prev) => upsertById(prev, data.rfq as RfqRequest));
      pushToast('پیام در پرونده استعلام ثبت شد.', 'success');
      return true;
    } catch {
      pushToast('خطا در ارسال پیام استعلام قیمت.', 'error');
      return false;
    }
  };

  const quoteRfq = async (
    rfqId: string,
    quotedUnitPrice: number,
    validDays = 7,
    note?: string
  ): Promise<boolean> => {
    if (!isAdmin || !authUser) {
      pushToast('برای ارسال قیمت پیشنهادی رسمی، ورود با حساب مدیر الزامی است.', 'error');
      return false;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/rfq/${encodeURIComponent(rfqId)}/quote`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ quotedUnitPrice, validDays, note }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ثبت قیمت پیشنهادی ناموفق بود.', 'error');
        return false;
      }
      setRfqs((prev) => upsertById(prev, data.rfq as RfqRequest));
      pushToast('قیمت پیشنهادی با موفقیت برای مشتری ارسال شد.', 'success');
      return true;
    } catch {
      pushToast('خطا در ثبت قیمت پیشنهادی.', 'error');
      return false;
    }
  };

  const respondRfq = async (rfqId: string, decision: 'accepted' | 'rejected'): Promise<boolean> => {
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/rfq/${encodeURIComponent(rfqId)}/respond`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ثبت پاسخ مشتری ناموفق بود.', 'error');
        return false;
      }
      setRfqs((prev) => upsertById(prev, data.rfq as RfqRequest));
      pushToast(decision === 'accepted' ? 'پیشنهاد قیمت تأیید شد.' : 'پیشنهاد قیمت رد شد.', 'success');
      return true;
    } catch {
      pushToast('خطا در ارسال پاسخ.', 'error');
      return false;
    }
  };

  const convertRfqToProforma = async (rfqId: string): Promise<ProformaInvoice | null> => {
    if (!isAdmin || !authUser) {
      pushToast('تبدیل استعلام به پیش‌فاکتور فقط برای مدیران مجاز است.', 'error');
      return null;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, mobileSessionToken);
      const res = await fetch(`/api/rfq/${encodeURIComponent(rfqId)}/convert`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'تبدیل به پیش‌فاکتور ناموفق بود.', 'error');
        return null;
      }
      const updatedRfq = data.rfq as RfqRequest;
      const pf = data.proforma as ProformaInvoice;
      setRfqs((prev) => upsertById(prev, updatedRfq));
      onProformaCreated?.(pf);
      if (dbSynced) {
        await setDoc(doc(db, 'proformas', pf.id), {
          ...pf,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      pushToast(`پیش‌فاکتور ${pf.proformaNo} از استعلام قیمت صادر شد.`, 'success');
      return pf;
    } catch {
      pushToast('خطا در تبدیل استعلام به پیش‌فاکتور.', 'error');
      return null;
    }
  };

  return {
    mobileSession,
    mobileSessionToken,
    mobileOrders,
    rfqs,
    sendMobileOtp,
    verifyMobileOtp,
    logoutMobile,
    refreshMobileOrders,
    refreshRfqs,
    submitRfq,
    sendRfqMessage,
    quoteRfq,
    respondRfq,
    convertRfqToProforma,
  };
}
