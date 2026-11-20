import crypto from 'node:crypto';
import express from 'express';
import {
  createMobileSession,
  generateOtpCode,
  getSmsModeConfig,
  hashToken,
  normalizeMobile,
  resolveMobileSession,
  timingSafeHashEquals,
} from '../auth';
import {
  MOBILE_SESSION_MAX_AGE_SECONDS,
  buildMobileSessionCookieHeader,
  shouldUseSecureCookie,
} from '../lib/http';
import type { ServerStore } from '../persistence';
import { otpSendBodySchema, otpVerifyBodySchema, parseRequestBody } from '../validation';

export function createAuthRouter(store: ServerStore): express.Router {
  const router = express.Router();

  router.post('/api/auth/otp/send', async (req, res) => {
    store.pruneExpired();
    const parsed = parseRequestBody(otpSendBodySchema, req, res);
    if (!parsed) return;

    const smsMode = getSmsModeConfig();
    if (!smsMode.ok) {
      return res.status(smsMode.status).json({ ok: false, message: smsMode.message });
    }

    const mobile = normalizeMobile(parsed.mobile);
    if (!/^09\d{9}$/.test(mobile)) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }

    const existing = store.data.otpChallenges[mobile];
    if (existing && Date.now() - existing.lastSentAt < 30000) {
      return res.status(429).json({ ok: false, message: 'لطفاً ۳۰ ثانیه قبل از ارسال مجدد کد صبر کنید.' });
    }

    const code = generateOtpCode();

    if (smsMode.mode === 'live') {
      const template = process.env.SMS_OTP_TEMPLATE?.trim() || 'verify';
      const smsRes = await fetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(process.env.SMS_API_KEY!.trim())}/verify/lookup.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ receptor: mobile, token: code, template }).toString(),
        }
      );
      if (!smsRes.ok) {
        return res.status(502).json({ ok: false, message: 'خطا در ارسال پیامک از طریق سرویس‌دهنده.' });
      }
    }

    store.data.otpChallenges[mobile] = {
      codeHash: hashToken(`${mobile}:${code}`),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now(),
    };
    store.save();

    return res.json({
      ok: true,
      mode: smsMode.mode,
      ...(smsMode.mode === 'sandbox' ? { sandboxCode: code } : {}),
      message:
        smsMode.mode === 'sandbox'
          ? `کد تایید آزمایشی تولید شد (کد: ${code}).`
          : 'کد تایید از طریق پیامک به شماره شما ارسال شد.',
      expiresInSec: 300,
    });
  });

  router.post('/api/auth/otp/verify', (req, res) => {
    store.pruneExpired();
    const parsed = parseRequestBody(otpVerifyBodySchema, req, res);
    if (!parsed) return;

    const smsMode = getSmsModeConfig();
    if (!smsMode.ok) {
      return res.status(smsMode.status).json({ ok: false, message: smsMode.message });
    }

    const mobile = normalizeMobile(parsed.mobile);
    if (!/^09\d{9}$/.test(mobile)) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }
    const code = normalizeMobile(parsed.code);
    const displayName = parsed.displayName;
    const record = store.data.otpChallenges[mobile];

    if (!record) {
      return res.status(400).json({ ok: false, message: 'ابتدا درخواست ارسال کد بدهید.' });
    }
    if (Date.now() > record.expiresAt) {
      delete store.data.otpChallenges[mobile];
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید منقضی شده است.' });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      delete store.data.otpChallenges[mobile];
      store.save();
      return res.status(429).json({ ok: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود.' });
    }

    const expectedHash = hashToken(`${mobile}:${code}`);
    if (!timingSafeHashEquals(expectedHash, record.codeHash)) {
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید نادرست است.' });
    }

    delete store.data.otpChallenges[mobile];

    const verifiedToken = `vtok_${crypto.randomBytes(18).toString('hex')}`;
    const verifiedHash = hashToken(verifiedToken);
    store.data.otpVerifiedTokens[verifiedHash] = {
      tokenHash: verifiedHash,
      mobile,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };

    const { token: sessionToken, session } = createMobileSession(store, mobile, displayName);

    res.setHeader(
      'Set-Cookie',
      buildMobileSessionCookieHeader(sessionToken, MOBILE_SESSION_MAX_AGE_SECONDS, shouldUseSecureCookie(req))
    );

    return res.json({
      ok: true,
      mobile,
      verifiedToken,
      sessionToken,
      session,
    });
  });

  router.get('/api/auth/session', (req, res) => {
    const mob = resolveMobileSession(store, req);
    if (!mob) {
      return res.json({ ok: true, authenticated: false, session: null });
    }
    return res.json({
      ok: true,
      authenticated: true,
      session: {
        mobile: mob.mobile,
        displayName: mob.displayName,
        expiresAt: mob.expiresAt,
      },
    });
  });

  router.post('/api/auth/logout', (req, res) => {
    const mob = resolveMobileSession(store, req);
    if (mob) {
      delete store.data.mobileSessions[mob.tokenHash];
      store.save();
    }
    res.setHeader('Set-Cookie', buildMobileSessionCookieHeader('', 0, shouldUseSecureCookie(req)));
    return res.json({ ok: true });
  });

  return router;
}
