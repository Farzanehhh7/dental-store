import type express from 'express';
import net from 'node:net';

export const DEFAULT_PORT = Number(process.env.PORT || 3000);
export const MOBILE_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getOrigin(req: express.Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || `localhost:${DEFAULT_PORT}`;
  return `${proto}://${host}`;
}

export function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseTrustProxySetting(raw?: string): boolean | number {
  const normalized = (raw || '').trim().toLowerCase();
  if (!normalized || normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true') return 1;
  const num = Number(normalized);
  if (Number.isInteger(num) && num > 0) return num;
  return false;
}

export function parseForwardedForIp(headerValue: string | string[] | undefined): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return null;
  const firstHop = raw.split(',')[0] || '';
  const match = firstHop.match(/\bfor=(?:"?\[?([a-fA-F0-9:.]+)\]?(?::\d+)?"?)/i);
  const candidate = match?.[1]?.trim();
  return candidate && net.isIP(candidate) > 0 ? candidate : null;
}

export function parseAllowedOrigins(raw?: string): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );
}

export function shouldUseSecureCookie(req: express.Request): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(req.secure);
}

export function buildMobileSessionCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return `dm_mobile_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${
    secure ? '; Secure' : ''
  }`;
}
