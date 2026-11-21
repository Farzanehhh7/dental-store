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
import { validateServerEnv } from '../config/env';
import {
  MOBILE_SESSION_MAX_AGE_SECONDS,
  buildMobileSessionCookieHeader,
  shouldUseSecureCookie,
} from '../lib/http';
import type { ServerStore } from '../persistence';
import { otpSendBodySchema, otpVerifyBodySchema, parseRequestBody } from '../validation';

const PHONE_SEND_WINDOW_MS = 15 * 60 * 1000;

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

    const env = validateServerEnv(process.env);
    const now = Date.now();

    const lockout = store.data.otpLockouts[mobile];
    if (lockout && lockout.lockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((lockout.lockedUntil - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        message: 'حساب ارسال کد تایید به علت تلاش‌های ناموفق موقتاً مسدود است. لطفاً دقایقی دیگر تلاش کنید.',
      });
    }

    const cooldownMs = env.OTP_RESEND_COOLDOWN_SEC * 1000;
    const existing = store.data.otpChallenges[mobile];
    if (existing && now - existing.lastSentAt < cooldownMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - (now - existing.lastSentAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        message: `لطفاً ${env.OTP_RESEND_COOLDOWN_SEC} ثانیه قبل از ارسال مجدد کد صبر کنید.`,
      });
    }

    const recentPhoneSends = (store.data.otpPhoneSendHistory[mobile] || []).filter(
      (ts) => now - ts < PHONE_SEND_WINDOW_MS
    );
    if (recentPhoneSends.length >= env.OTP_PHONE_WINDOW_MAX) {
      res.setHeader('Retry-After', String(Math.ceil(PHONE_SEND_WINDOW_MS / 1000)));
      return res.status(429).json({
        ok: false,
        message: 'تعداد درخواست‌های ارسال کد برای این شماره موبایل بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.',
      });
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

    const expiryMs = env.OTP_EXPIRY_SECONDS * 1000;
    store.data.otpChallenges[mobile] = {
      codeHash: hashToken(`${mobile}:${code}`),
      expiresAt: now + expiryMs,
      attempts: 0,
      lastSentAt: now,
    };
    recentPhoneSends.push(now);
    store.data.otpPhoneSendHistory[mobile] = recentPhoneSends;
    store.save();

    return res.json({
      ok: true,
      mode: smsMode.mode,
      ...(smsMode.mode === 'sandbox' ? { sandboxCode: code } : {}),
      message:
        smsMode.mode === 'sandbox'
          ? `کد تایید آزمایشی تولید شد (کد: ${code}).`
          : 'کد تایید از طریق پیامک به شماره شما ارسال شد.',
      expiresInSec: env.OTP_EXPIRY_SECONDS,
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

    const env = validateServerEnv(process.env);
    const now = Date.now();
    const lockout = store.data.otpLockouts[mobile];
    if (lockout && lockout.lockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((lockout.lockedUntil - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        message: 'حساب تایید شماره به دلیل تلاش‌های ناموفق موقتاً مسدود است.',
      });
    }

    const code = normalizeMobile(parsed.code);
    const displayName = parsed.displayName;
    const record = store.data.otpChallenges[mobile];

    if (!record) {
      return res.status(400).json({ ok: false, message: 'ابتدا درخواست ارسال کد بدهید.' });
    }
    if (now > record.expiresAt) {
      delete store.data.otpChallenges[mobile];
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید منقضی شده است.' });
    }

    const expectedHash = hashToken(`${mobile}:${code}`);
    if (!timingSafeHashEquals(expectedHash, record.codeHash)) {
      record.attempts += 1;
      if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
        delete store.data.otpChallenges[mobile];
        store.data.otpLockouts[mobile] = {
          lockedUntil: now + env.OTP_LOCKOUT_SECONDS * 1000,
          failedAttempts: record.attempts,
          reason: 'max_otp_attempts',
        };
        store.save();
        res.setHeader('Retry-After', String(env.OTP_LOCKOUT_SECONDS));
        return res.status(429).json({
          ok: false,
          message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً دقایقی دیگر تلاش کنید.',
        });
      }
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید نادرست است.' });
    }

    delete store.data.otpChallenges[mobile];
    delete store.data.otpLockouts[mobile];

    const verifiedToken = `vtok_${crypto.randomBytes(18).toString('hex')}`;
    const verifiedHash = hashToken(verifiedToken);
    store.data.otpVerifiedTokens[verifiedHash] = {
      tokenHash: verifiedHash,
      mobile,
      expiresAt: now + 30 * 60 * 1000,
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
