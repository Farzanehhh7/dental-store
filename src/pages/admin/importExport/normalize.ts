const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const INVALID_NUMBER = Symbol('INVALID_NUMBER');
export const INVALID_BOOLEAN = Symbol('INVALID_BOOLEAN');

export function normalizeDigitsAndArabic(input: unknown): string {
  if (input === null || input === undefined) return '';
  let str = String(input)
    .replace(/^\uFEFF/, '')
    .replace(/\u200B/g, '')
    .replace(/[\u00A0]/g, ' ');

  for (let i = 0; i < 10; i += 1) {
    str = str.split(PERSIAN_DIGITS[i]).join(String(i)).split(ARABIC_DIGITS[i]).join(String(i));
  }

  str = str
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/أ|إ/g, 'ا')
    .replace(/ؤ/g, 'و');

  return str.replace(/^[\s\u200C]+|[\s\u200C]+$/g, '');
}

export function normalizeHeaderName(header: string): string {
  return normalizeDigitsAndArabic(header)
    .toLowerCase()
    .replace(/[_\-\s()（）]+/g, ' ')
    .trim();
}

export function normalizeSlugValue(input: string): string {
  const normalized = normalizeDigitsAndArabic(input)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized;
}

export function normalizePathValue(input: string): string {
  const clean = normalizeDigitsAndArabic(input).trim();
  if (!clean) return '';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

/**
 * Rejects spreadsheet formula-injection payloads such as `=SUM(A1)`, `@SUM(...)`,
 * `+cmd|...`, `-1+1`, `\t=1+1`, `\r=...`, while allowing plain negative/positive
 * numeric literals like `-10` to reach Zod numeric range validation.
 */
export function isFormulaInjectionAttempt(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.replace(/^ +/, '');
  if (!trimmed) return false;
  if (/^[=@\t\r]/.test(value)) return true;
  if (/^[+-]/.test(trimmed) && !/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return true;
  }
  return false;
}

export function parseOptionalNumber(raw: string): number | undefined | typeof INVALID_NUMBER {
  const clean = normalizeDigitsAndArabic(raw)
    .replace(/[,،\s]/g, '')
    .trim();
  if (!clean) return undefined;
  const num = Number(clean);
  if (!Number.isFinite(num)) return INVALID_NUMBER;
  return num;
}

export function parseOptionalBoolean(raw: string): boolean | undefined | typeof INVALID_BOOLEAN {
  const clean = normalizeDigitsAndArabic(raw).toLowerCase();
  if (!clean) return undefined;
  if (['true', '1', 'yes', 'y', 'بله', 'فعال', 'دارد'].includes(clean)) return true;
  if (['false', '0', 'no', 'n', 'خیر', 'غیرفعال', 'ندارد'].includes(clean)) return false;
  return INVALID_BOOLEAN;
}

export function hasAnyFormulaPayload(raw: Record<string, string>): boolean {
  return Object.values(raw).some((val) => isFormulaInjectionAttempt(val));
}

export function formatValidationErrorPrefix(fieldLabel: string, msg: string): string {
  return `${fieldLabel}: ${msg}`;
}
