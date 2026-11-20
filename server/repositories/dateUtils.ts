import { normalizeMobile } from '../auth';

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/**
 * Exact Jalali (Shamsi) -> Gregorian conversion (Kazem/Borkowski algorithm matching src/lib/jalali.ts).
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  let jyAdj = jy <= 979 ? jy : jy - 979;
  let days =
    365 * jyAdj +
    Math.floor(jyAdj / 33) * 8 +
    Math.floor(((jyAdj % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  gy += Math.floor((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28;
  const salA = [0, 31, leap, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    const v = salA[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return [gy, gm, gd];
}

export function normalizeDigits(input: string): string {
  return normalizeMobile(input);
}

/**
 * Accepts either Jalali date (`1404/01/15` or `۱۴۰۴-۰۱-۱۵`) or ISO/Gregorian (`2026-03-21`).
 * Returns UTC millisecond timestamp representing start or end of day in Asia/Tehran (+03:30) for Jalali/YYYY-MM-DD inputs.
 */
export function parseFilterDateBoundary(raw: string | undefined, bound: 'start' | 'end'): number | null {
  if (!raw || !raw.trim()) return null;
  const clean = normalizeDigits(raw.trim());
  const dateOnly = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const [gy, gm, gd] = y >= 1300 && y <= 1599 ? jalaliToGregorian(y, m, d) : [y, m, d];
    const utcDay = Date.UTC(gy, gm - 1, gd, bound === 'start' ? 0 : 23, bound === 'start' ? 0 : 59, bound === 'start' ? 0 : 59, bound === 'start' ? 0 : 999);
    return utcDay - TEHRAN_OFFSET_MS;
  }
  const ts = new Date(clean).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (val && typeof val === 'object' && !(val instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return val;
}
