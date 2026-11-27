import crypto from 'node:crypto';
import type { OutboxMessage } from '../../src/types/domain';
import { normalizeMobile } from '../auth';

export interface SmsSendRequest {
  to: string;
  body: string;
  outboxId?: string;
}

export interface SmsSendResult {
  ok: boolean;
  provider: 'sandbox' | 'kavenegar';
  mode: 'sandbox' | 'live';
  providerMessageId?: string;
  errorMessage?: string;
}

export interface ISmsProvider {
  readonly mode: 'sandbox' | 'live';
  readonly providerName: 'sandbox' | 'kavenegar';
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}

export interface SandboxSmsProviderOptions {
  failRecipients?: Set<string>;
}

export class SandboxSmsProvider implements ISmsProvider {
  public readonly mode = 'sandbox' as const;
  public readonly providerName = 'sandbox' as const;
  private readonly failRecipients: Set<string>;

  constructor(options?: SandboxSmsProviderOptions) {
    this.failRecipients = options?.failRecipients ?? new Set<string>();
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    const clean = normalizeMobile(request.to);
    if (!/^09\d{9}$/.test(clean)) {
      return {
        ok: false,
        provider: 'sandbox',
        mode: 'sandbox',
        errorMessage: 'شماره موبایل گیرنده برای ارسال پیامک معتبر نیست.',
      };
    }
    if (this.failRecipients.has(clean)) {
      return {
        ok: false,
        provider: 'sandbox',
        mode: 'sandbox',
        errorMessage: 'خطای شبیه‌سازی‌شده ارسال پیامک در محیط Sandbox.',
      };
    }
    return {
      ok: true,
      provider: 'sandbox',
      mode: 'sandbox',
      providerMessageId: `sbx_sms_${crypto.randomBytes(6).toString('hex')}`,
    };
  }
}

export class LiveKavenegarSmsProvider implements ISmsProvider {
  public readonly mode = 'live' as const;
  public readonly providerName = 'kavenegar' as const;
  private readonly apiKey: string;
  private readonly senderLine?: string;

  constructor(apiKey: string, senderLine?: string) {
    this.apiKey = apiKey.trim();
    this.senderLine = senderLine?.trim() || undefined;
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    const clean = normalizeMobile(request.to);
    if (!/^09\d{9}$/.test(clean)) {
      return {
        ok: false,
        provider: 'kavenegar',
        mode: 'live',
        errorMessage: 'شماره موبایل گیرنده برای ارسال پیامک معتبر نیست.',
      };
    }
    if (!this.apiKey) {
      return {
        ok: false,
        provider: 'kavenegar',
        mode: 'live',
        errorMessage: 'کلید API سرویس کاوه‌نگار (SMS_API_KEY) پیکربندی نشده است.',
      };
    }

    try {
      const form = new URLSearchParams();
      form.set('receptor', clean);
      form.set('message', request.body);
      if (this.senderLine) {
        form.set('sender', this.senderLine);
      }

      const resp = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
        body: form.toString(),
      });
      const json = (await resp.json().catch(() => null)) as {
        return?: { status?: number; message?: string };
        entries?: Array<{ messageid?: number | string }>;
      } | null;

      if (!resp.ok || !json || (json.return?.status && json.return.status !== 200)) {
        return {
          ok: false,
          provider: 'kavenegar',
          mode: 'live',
          errorMessage: json?.return?.message || `HTTP ${resp.status}`,
        };
      }

      const messageId = json.entries?.[0]?.messageid;
      return {
        ok: true,
        provider: 'kavenegar',
        mode: 'live',
        providerMessageId: messageId ? String(messageId) : `kvn_${Date.now()}`,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'kavenegar',
        mode: 'live',
        errorMessage: err instanceof Error ? err.message : 'خطای ارتباط با سرویس پیامک کاوه‌نگار.',
      };
    }
  }
}

export function createSmsProvider(env: NodeJS.ProcessEnv = process.env): ISmsProvider {
  const mode = (env.SMS_PROVIDER || '').trim().toLowerCase();
  const apiKey = (env.SMS_API_KEY || '').trim();
  const isProd = env.NODE_ENV === 'production';
  const allowSandboxInProd = env.ALLOW_SANDBOX_IN_PROD === 'true';

  if (mode === 'live' && apiKey) {
    return new LiveKavenegarSmsProvider(apiKey, env.SMS_SENDER_LINE);
  }
  if (isProd && !allowSandboxInProd && mode !== 'live') {
    // Still return sandbox only when explicitly permitted or default safe fallback if caller checks provider availability
    return new SandboxSmsProvider();
  }
  return new SandboxSmsProvider();
}

export function formatOutboxProvider(
  channel: OutboxMessage['channel'],
  provider: ISmsProvider
): OutboxMessage['provider'] {
  if (channel === 'email') return 'email_sandbox';
  return provider.providerName;
}
