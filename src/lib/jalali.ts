import { CurrencyMode } from '../types/domain';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const faFormatter = new Intl.NumberFormat('fa-IR');

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatNumber(n: number): string {
  return faFormatter.format(Math.round(n));
}

/**
 * Money is stored strictly in integer Toman.
 * Rial = Toman * 10 at display edge only.
 * Never outputs "0 Toman" for invalid/empty prices.
 */
export function formatMoney(toman: number | null | undefined, currency: CurrencyMode = 'IRT'): string {
  if (toman === null || toman === undefined || toman <= 0) {
    return 'تماس برای قیمت';
  }
  const value = currency === 'IRR' ? toman * 10 : toman;
  const unit = currency === 'IRR' ? 'ریال' : 'تومان';
  return `${formatNumber(value)} ${unit}`;
}

/**
 * Exact Gregorian -> Jalali (Shamsi) conversion algorithm.
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export function formatJalaliDate(isoDate?: string | Date | null, withMonthName = false): string {
  if (!isoDate) return '—';
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (Number.isNaN(date.getTime())) return '—';
  // Convert to Asia/Tehran (+03:30)
  const tehranMs = date.getTime() + 3.5 * 60 * 60 * 1000;
  const d = new Date(tehranMs);
  const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  if (withMonthName) {
    return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
  }
  const mm = String(jm).padStart(2, '0');
  const dd = String(jd).padStart(2, '0');
  return toPersianDigits(`${jy}/${mm}/${dd}`);
}

export function formatJalaliDateTime(isoDate?: string | Date | null): string {
  if (!isoDate) return '—';
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (Number.isNaN(date.getTime())) return '—';
  const tehranMs = date.getTime() + 3.5 * 60 * 60 * 1000;
  const d = new Date(tehranMs);
  const datePart = formatJalaliDate(isoDate);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${datePart} - ${toPersianDigits(`${hh}:${min}`)}`;
}

export function daysUntil(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}
