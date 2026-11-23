import { z } from 'zod';

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((v) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  });

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined),
    z.enum(values).optional()
  );

const optionalBoundedInt = (min: number, max: number, fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }, z.number().int().min(min).max(max));

export const serverEnvSchema = z.object({
  NODE_ENV: optionalEnum(['development', 'production', 'test'] as const).default('development'),
  PORT: optionalBoundedInt(1, 65535, 3000),
  SITE_URL: optionalNonEmptyString,
  DATA_DIR: optionalNonEmptyString,
  SESSION_SECRET: optionalNonEmptyString,
  TRUST_PROXY: optionalNonEmptyString,
  ALLOWED_ORIGINS: optionalNonEmptyString,
  STORAGE_DRIVER: optionalEnum(['file', 'firestore'] as const).default('file'),
  SMS_PROVIDER: optionalEnum(['sandbox', 'live'] as const),
  SMS_API_KEY: optionalNonEmptyString,
  SMS_OTP_TEMPLATE: optionalNonEmptyString,
  PAYMENT_MODE: optionalEnum(['sandbox', 'live'] as const),
  ALLOW_SANDBOX_IN_PROD: optionalEnum(['true', 'false'] as const).default('false'),
  ORDER_PAYMENT_EXPIRY_MINUTES: optionalBoundedInt(1, 1440, 30),
  PAYMENT_EXPIRY_SWEEP_INTERVAL_MS: optionalBoundedInt(1000, 86_400_000, 60_000),
  ZARINPAL_MERCHANT_ID: optionalNonEmptyString,
  IDPAY_API_KEY: optionalNonEmptyString,
  PAYMENT_WEBHOOK_SECRET: optionalNonEmptyString,
  RATE_LIMIT_WINDOW_MS: optionalBoundedInt(1000, 86_400_000, 15 * 60 * 1000),
  RATE_LIMIT_OTP_MAX: optionalBoundedInt(1, 1000, 10),
  RATE_LIMIT_ORDER_PAYMENT_MAX: optionalBoundedInt(1, 5000, 30),
  RATE_LIMIT_GLOBAL_MAX: optionalBoundedInt(10, 50_000, 300),
  RATE_LIMIT_TELEMETRY_MAX: optionalBoundedInt(5, 5000, 60),
  OTP_EXPIRY_SECONDS: optionalBoundedInt(60, 900, 180),
  OTP_RESEND_COOLDOWN_SEC: optionalBoundedInt(5, 300, 30),
  OTP_MAX_ATTEMPTS: optionalBoundedInt(3, 10, 5),
  OTP_LOCKOUT_SECONDS: optionalBoundedInt(60, 86_400, 900),
  OTP_PHONE_WINDOW_MAX: optionalBoundedInt(1, 50, 5),
  UPLOAD_MAX_BYTES: optionalBoundedInt(1024, 20 * 1024 * 1024, 5 * 1024 * 1024),
  STORE_WRITE_DEBOUNCE_MS: optionalBoundedInt(0, 60_000, 80),
  COUNTER_FLUSH_INTERVAL_MS: optionalBoundedInt(100, 300_000, 2_000),
  CATALOG_CACHE_MAX_ENTRIES: optionalBoundedInt(10, 5_000, 250),
  CATALOG_CACHE_TTL_MS: optionalBoundedInt(0, 3_600_000, 60_000),
});

export type ValidatedServerEnv = z.infer<typeof serverEnvSchema>;

export function validateServerEnv(rawEnv: Record<string, string | undefined> = process.env): ValidatedServerEnv {
  const parsed = serverEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues.map((iss) => `${iss.path.join('.') || 'env'}: ${iss.message}`).join('; ');
    throw new Error(`Invalid server environment configuration: ${details}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new Error(
        'SESSION_SECRET is required and must be at least 32 characters long when NODE_ENV=production.'
      );
    }
    if (env.SMS_PROVIDER === 'live' && !env.SMS_API_KEY) {
      throw new Error('SMS_API_KEY is required when NODE_ENV=production and SMS_PROVIDER=live.');
    }
    if (env.PAYMENT_MODE === 'live' && !env.ZARINPAL_MERCHANT_ID && !env.IDPAY_API_KEY) {
      throw new Error(
        'At least one payment gateway credential (ZARINPAL_MERCHANT_ID or IDPAY_API_KEY) is required when PAYMENT_MODE=live.'
      );
    }
  }

  return env;
}
