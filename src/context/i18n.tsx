import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CurrencyMode } from '../types/domain';
import {
  ensureLocaleLoaded,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleDigits,
  formatLocaleMoney,
  formatLocaleNumber,
  getDirection,
  getLocale,
  setLocale as setGlobalLocale,
  subscribeLocale,
  syncDocumentLocale,
  translateWithLocale,
  type Direction,
  type I18nParams,
  type Locale,
} from '../lib/i18n';

export interface I18nContextValue {
  locale: Locale;
  dir: Direction;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, params?: I18nParams | string, fallback?: string) => string;
  formatNumber: (n: number) => string;
  formatDigits: (input: string | number) => string;
  formatMoney: (toman: number | null | undefined, currency?: CurrencyMode) => string;
  formatDate: (isoDate?: string | Date | null, withMonthName?: boolean) => string;
  formatDateTime: (isoDate?: string | Date | null) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());
  const [dictVersion, setDictVersion] = useState(0);

  useEffect(() => {
    syncDocumentLocale(locale);
    if (locale === 'en') {
      void ensureLocaleLoaded('en');
    }
    return subscribeLocale((next) => {
      setLocaleState(next);
      setDictVersion((v) => v + 1);
    });
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setGlobalLocale(next);
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'fa' ? 'en' : 'fa');
  }, [locale, setLocale]);

  const t = useCallback(
    (key: string, params?: I18nParams | string, fallback?: string) =>
      translateWithLocale(locale, key, params, fallback),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, dictVersion]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: getDirection(locale),
      setLocale,
      toggleLocale,
      t,
      formatNumber: (n: number) => formatLocaleNumber(n, locale),
      formatDigits: (input: string | number) => formatLocaleDigits(input, locale),
      formatMoney: (toman: number | null | undefined, currency: CurrencyMode = 'IRT') =>
        formatLocaleMoney(toman, currency, locale),
      formatDate: (isoDate?: string | Date | null, withMonthName = false) =>
        formatLocaleDate(isoDate, locale, withMonthName),
      formatDateTime: (isoDate?: string | Date | null) => formatLocaleDateTime(isoDate, locale),
    }),
    [locale, setLocale, toggleLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const loc = getLocale();
    return {
      locale: loc,
      dir: getDirection(loc),
      setLocale: setGlobalLocale,
      toggleLocale: () => setGlobalLocale(loc === 'fa' ? 'en' : 'fa'),
      t: (key, params, fallback) => translateWithLocale(loc, key, params, fallback),
      formatNumber: (n) => formatLocaleNumber(n, loc),
      formatDigits: (input) => formatLocaleDigits(input, loc),
      formatMoney: (toman, currency = 'IRT') => formatLocaleMoney(toman, currency, loc),
      formatDate: (isoDate, withMonthName = false) => formatLocaleDate(isoDate, loc, withMonthName),
      formatDateTime: (isoDate) => formatLocaleDateTime(isoDate, loc),
    };
  }
  return ctx;
}
