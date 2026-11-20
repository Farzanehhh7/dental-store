import crypto from 'node:crypto';
import { hashToken, timingSafeHashEquals } from '../auth';
import type { ServerPaymentSession } from '../persistence';

export interface GatewayInitiateParams {
  amountToman: number;
  orderId: string;
  orderNo: string;
  callbackUrl: string;
  mobile?: string;
}

export type GatewayInitiateResult =
  | {
      ok: true;
      authority: string;
      redirectUrl?: string;
      sandboxToken?: string;
      sandboxTokenHash?: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export interface GatewayVerifyParams {
  session: ServerPaymentSession;
  sandboxToken?: string;
  authority?: string;
}

export type GatewayVerifyResult =
  | {
      ok: true;
      refId: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      isSecurityRejection?: boolean;
    };

export interface IPaymentGateway {
  readonly name: 'zarinpal' | 'idpay';
  readonly mode: 'sandbox' | 'live';
  initiate(params: GatewayInitiateParams): Promise<GatewayInitiateResult>;
  verify(params: GatewayVerifyParams): Promise<GatewayVerifyResult>;
}

export class SandboxPaymentGateway implements IPaymentGateway {
  readonly mode = 'sandbox' as const;
  constructor(readonly name: 'zarinpal' | 'idpay') {}

  async initiate(params: GatewayInitiateParams): Promise<GatewayInitiateResult> {
    const authority = `AUTH-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const sandboxToken = `SBX-${crypto.randomBytes(16).toString('hex')}`;
    const sandboxTokenHash = hashToken(sandboxToken);
    const sep = params.callbackUrl.includes('?') ? '&' : '?';
    const redirectUrl = `${params.callbackUrl}${sep}Authority=${encodeURIComponent(
      authority
    )}&Status=OK&sandboxToken=${encodeURIComponent(sandboxToken)}`;
    return {
      ok: true,
      authority,
      redirectUrl,
      sandboxToken,
      sandboxTokenHash,
    };
  }

  async verify(params: GatewayVerifyParams): Promise<GatewayVerifyResult> {
    const providedToken = String(params.sandboxToken || '').trim();
    if (
      !providedToken ||
      !params.session.sandboxTokenHash ||
      !timingSafeHashEquals(hashToken(providedToken), params.session.sandboxTokenHash)
    ) {
      return {
        ok: false,
        status: 403,
        isSecurityRejection: true,
        message: 'توکن امنیتی تایید تراکنش نامعتبر است (تایید خودکار مسدود شد).',
      };
    }
    return {
      ok: true,
      refId: String(crypto.randomInt(100000000, 1000000000)),
    };
  }
}

export class ZarinPalPaymentGateway implements IPaymentGateway {
  readonly name = 'zarinpal' as const;
  readonly mode = 'live' as const;

  async initiate(params: GatewayInitiateParams): Promise<GatewayInitiateResult> {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchantId) {
      return { ok: false, status: 503, message: 'کد پذیرنده زرین‌پال (ZARINPAL_MERCHANT_ID) در سرور تنظیم نشده است.' };
    }
    const amountRial = Math.round(params.amountToman * 10);
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        callback_url: params.callbackUrl,
        description: `پرداخت سفارش ${params.orderNo}`,
        metadata: { order_id: params.orderNo, mobile: params.mobile },
      }),
    });
    const json = (await res.json()) as { data?: { code?: number; authority?: string } };
    if (!res.ok || json.data?.code !== 100 || !json.data.authority) {
      return { ok: false, status: 502, message: 'خطا در برقراری ارتباط با درگاه زرین‌پال.' };
    }
    return {
      ok: true,
      authority: json.data.authority,
      redirectUrl: `https://www.zarinpal.com/pg/StartPay/${json.data.authority}`,
    };
  }

  async verify(params: GatewayVerifyParams): Promise<GatewayVerifyResult> {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchantId) {
      return { ok: false, status: 503, message: 'کد پذیرنده زرین‌پال در سرور تنظیم نشده است.' };
    }
    const amountRial = Math.round(params.session.amount * 10);
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        authority: params.session.authority,
      }),
    });
    const json = (await res.json()) as { data?: { code?: number; ref_id?: number | string } };
    if (!res.ok || (json.data?.code !== 100 && json.data?.code !== 101) || !json.data?.ref_id) {
      return { ok: false, status: 400, message: 'تراکنش توسط زرین‌پال تایید نشد.' };
    }
    return { ok: true, refId: String(json.data.ref_id) };
  }
}

export class IdPayPaymentGateway implements IPaymentGateway {
  readonly name = 'idpay' as const;
  readonly mode = 'live' as const;

  async initiate(params: GatewayInitiateParams): Promise<GatewayInitiateResult> {
    const apiKey = process.env.IDPAY_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, status: 503, message: 'کلید API درگاه آیدی‌پی (IDPAY_API_KEY) در سرور تنظیم نشده است.' };
    }
    const amountRial = Math.round(params.amountToman * 10);
    const res = await fetch('https://api.idpay.ir/v1.1/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        order_id: params.orderNo || params.orderId,
        amount: amountRial,
        phone: params.mobile,
        desc: `پرداخت سفارش ${params.orderNo}`,
        callback: params.callbackUrl,
      }),
    });
    const json = (await res.json()) as { id?: string; link?: string };
    if (!res.ok || !json.id) {
      return { ok: false, status: 502, message: 'خطا در برقراری ارتباط با درگاه آیدی‌پی.' };
    }
    return { ok: true, authority: json.id, redirectUrl: json.link };
  }

  async verify(params: GatewayVerifyParams): Promise<GatewayVerifyResult> {
    const apiKey = process.env.IDPAY_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, status: 503, message: 'کلید API درگاه آیدی‌پی در سرور تنظیم نشده است.' };
    }
    const res = await fetch('https://api.idpay.ir/v1.1/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        id: params.session.authority,
        order_id: params.session.orderNo || params.session.orderId,
      }),
    });
    const json = (await res.json()) as { status?: number; track_id?: string | number };
    if (!res.ok || (json.status !== 100 && json.status !== 101) || !json.track_id) {
      return { ok: false, status: 400, message: 'تراکنش توسط آیدی‌پی تایید نشد.' };
    }
    return { ok: true, refId: String(json.track_id) };
  }
}

export function resolvePaymentGateway(
  gateway: 'zarinpal' | 'idpay',
  mode: 'sandbox' | 'live'
): IPaymentGateway {
  if (mode === 'sandbox') {
    return new SandboxPaymentGateway(gateway);
  }
  return gateway === 'idpay' ? new IdPayPaymentGateway() : new ZarinPalPaymentGateway();
}
