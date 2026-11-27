import faMessages from '../messages/fa.json';
import type { CurrencyMode } from '../types/domain';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from './jalali';

export type Locale = 'fa' | 'en';
export type Direction = 'rtl' | 'ltr';
export type I18nParams = Record<string, string | number>;

const LS_LANG_KEY = 'dm_lang_v1';

type MessageTree = Record<string, unknown>;

const DICTIONARIES: Record<Locale, MessageTree> = {
  fa: faMessages as MessageTree,
  en: {},
};

let activeLocale: Locale = readStoredLocale();
const listeners = new Set<(loc: Locale) => void>();
let enLoadPromise: Promise<void> | null = null;

export function ensureLocaleLoaded(locale: Locale): Promise<void> {
  if (locale !== 'en' || Object.keys(DICTIONARIES.en).length > 0) {
    return Promise.resolve();
  }
  if (!enLoadPromise) {
    enLoadPromise = import('../messages/en.json').then((mod) => {
      DICTIONARIES.en = ((mod as { default?: MessageTree }).default ?? mod) as MessageTree;
      listeners.forEach((cb) => cb(activeLocale));
    });
  }
  return enLoadPromise;
}

if (activeLocale === 'en') {
  void ensureLocaleLoaded('en');
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'fa';
  try {
    const raw = window.localStorage.getItem(LS_LANG_KEY);
    if (raw === 'en' || raw === 'fa') return raw;
  } catch {
    // Ignore storage read failures
  }
  return 'fa';
}

export function syncDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.lang = locale;
  html.dir = locale === 'fa' ? 'rtl' : 'ltr';
}

export function getLocale(): Locale {
  return activeLocale;
}

export function getDirection(locale: Locale = activeLocale): Direction {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

export function setLocale(next: Locale): void {
  if (next !== 'fa' && next !== 'en') return;
  activeLocale = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_LANG_KEY, next);
    } catch {
      // Ignore storage write failures
    }
  }
  syncDocumentLocale(next);
  if (next === 'en') {
    void ensureLocaleLoaded('en');
  }
  listeners.forEach((cb) => cb(next));
}

export function subscribeLocale(cb: (loc: Locale) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function lookupMessage(locale: Locale, key: string): string | null {
  const parts = key.split('.');
  let current: unknown = DICTIONARIES[locale];
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

const pluralRulesCache: Record<Locale, Intl.PluralRules> = {
  fa: new Intl.PluralRules('fa-IR'),
  en: new Intl.PluralRules('en-US'),
};

const numberFormatCache: Record<Locale, Intl.NumberFormat> = {
  fa: new Intl.NumberFormat('fa-IR'),
  en: new Intl.NumberFormat('en-US'),
};

export function formatLocaleNumber(n: number, locale: Locale = activeLocale): string {
  const rounded = Number.isFinite(n) ? n : 0;
  if (locale === 'fa') {
    return numberFormatCache.fa.format(rounded);
  }
  return numberFormatCache.en.format(rounded);
}

export function formatLocaleDigits(input: string | number, locale: Locale = activeLocale): string {
  if (locale === 'fa') return toPersianDigits(input);
  return String(input).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function formatLocaleMoney(
  toman: number | null | undefined,
  currency: CurrencyMode = 'IRT',
  locale: Locale = activeLocale
): string {
  if (toman === null || toman === undefined || toman <= 0) {
    return translateWithLocale(locale, 'price.callForPrice', undefined, 'تماس برای قیمت');
  }
  const value = currency === 'IRR' ? toman * 10 : toman;
  const unit =
    currency === 'IRR'
      ? translateWithLocale(locale, 'price.rial', undefined, 'ریال')
      : translateWithLocale(locale, 'price.toman', undefined, 'تومان');
  return `${formatLocaleNumber(Math.round(value), locale)} ${unit}`;
}

export function formatLocaleDate(
  isoDate?: string | Date | null,
  locale: Locale = activeLocale,
  withMonthName = false
): string {
  if (!isoDate) return '—';
  if (locale === 'fa') {
    return formatJalaliDate(isoDate, withMonthName);
  }
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: withMonthName ? 'short' : '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatLocaleDateTime(isoDate?: string | Date | null, locale: Locale = activeLocale): string {
  if (!isoDate) return '—';
  if (locale === 'fa') {
    return formatJalaliDateTime(isoDate);
  }
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function findMatchingBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseIcuBranches(body: string): Record<string, string> {
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    const keyStart = i;
    while (i < body.length && !/\s|\{/.test(body[i])) i++;
    const key = body.slice(keyStart, i).trim();
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '{') break;
    const endBrace = findMatchingBrace(body, i);
    if (endBrace < 0) break;
    branches[key] = body.slice(i + 1, endBrace);
    i = endBrace + 1;
  }
  return branches;
}

export function formatIcuMessage(template: string, params: I18nParams | undefined, locale: Locale): string {
  if (!params) return template;
  let result = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch !== '{') {
      result += ch;
      i++;
      continue;
    }
    const closeIdx = findMatchingBrace(template, i);
    if (closeIdx < 0) {
      result += template.slice(i);
      break;
    }
    const inner = template.slice(i + 1, closeIdx);
    const firstComma = inner.indexOf(',');
    if (firstComma < 0) {
      const key = inner.trim();
      const val = params[key];
      if (val === undefined) {
        result += `{${inner}}`;
      } else if (typeof val === 'number') {
        result += formatLocaleNumber(val, locale);
      } else {
        result += String(val);
      }
      i = closeIdx + 1;
      continue;
    }

    const varName = inner.slice(0, firstComma).trim();
    const rest = inner.slice(firstComma + 1);
    const secondComma = rest.indexOf(',');
    if (secondComma < 0) {
      result += `{${inner}}`;
      i = closeIdx + 1;
      continue;
    }

    const formatType = rest.slice(0, secondComma).trim();
    const branchesBody = rest.slice(secondComma + 1).trim();
    const branches = parseIcuBranches(branchesBody);
    const rawVal = params[varName];

    if (formatType === 'plural') {
      const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
      const exactKey = `=${numVal}`;
      const category = pluralRulesCache[locale].select(numVal);
      const picked = branches[exactKey] ?? branches[category] ?? branches.other ?? '';
      const formattedNum = formatLocaleNumber(numVal, locale);
      const subReplaced = picked.replace(/#/g, formattedNum);
      result += formatIcuMessage(subReplaced, params, locale);
    } else if (formatType === 'select') {
      const strVal = String(rawVal ?? 'other');
      const picked = branches[strVal] ?? branches.other ?? '';
      result += formatIcuMessage(picked, params, locale);
    } else {
      result += rawVal === undefined ? `{${inner}}` : String(rawVal);
    }

    i = closeIdx + 1;
  }
  return result;
}

export function translateWithLocale(
  locale: Locale,
  key: string,
  params?: I18nParams | string,
  fallback?: string
): string {
  const resolvedParams = typeof params === 'object' ? params : undefined;
  const resolvedFallback = typeof params === 'string' ? params : fallback;

  const raw =
    lookupMessage(locale, key) ??
    (locale !== 'fa' ? lookupMessage('fa', key) : null) ??
    resolvedFallback ??
    key;

  return formatIcuMessage(raw, resolvedParams, locale);
}

export function t(
  key: string,
  params?: I18nParams | string,
  fallback?: string
): string {
  return translateWithLocale(activeLocale, key, params, fallback);
}

syncDocumentLocale(activeLocale);
