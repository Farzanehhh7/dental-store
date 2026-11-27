import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useI18n } from '../context/i18n';
import { applySeoHead } from '../lib/seo';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(token ? 'loading' : 'idle');
  const [contact, setContact] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    applySeoHead({
      title: t('unsubscribePage.seoTitle'),
      description: t('unsubscribePage.seoDescription'),
      canonicalPath: '/unsubscribe',
      robots: 'noindex, nofollow',
    });
  }, [t]);

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }
    let active = true;
    const run = async () => {
      setStatus('loading');
      setErrorMessage('');
      try {
        const res = await fetch('/api/marketing/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || !data?.ok) {
          setStatus('error');
          setErrorMessage(data?.message || t('unsubscribePage.errorInvalidToken'));
          return;
        }
        setContact(String(data.contact || ''));
        setStatus('success');
      } catch {
        if (!active) return;
        setStatus('error');
        setErrorMessage(t('unsubscribePage.errorNetwork'));
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [token, t]);

  return (
    <div className="max-w-xl mx-auto px-4 py-14">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-5">
        {status === 'loading' && (
          <>
            <BellOff className="w-10 h-10 text-brand mx-auto animate-pulse" aria-hidden="true" />
            <h1 className="text-xl font-extrabold">{t('unsubscribePage.loadingTitle')}</h1>
            <p className="text-xs text-ink/70 dark:text-slate-400">{t('unsubscribePage.loadingDesc')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-11 h-11 text-emerald-600 mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-extrabold">{t('unsubscribePage.successTitle')}</h1>
            <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed">
              {t('unsubscribePage.successDescPrefix')}{' '}
              <strong dir="ltr" className="tabular-nums">{contact}</strong>{' '}
              {t('unsubscribePage.successDescSuffix')}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2 text-xs">
              <Link to="/" className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brandDark">
                {t('comparePage.backToStore')}
              </Link>
              <Link to="/account" className="px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 font-bold hover:border-brand">
                {t('unsubscribePage.accountSettingsBtn')}
              </Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle className="w-11 h-11 text-rose-600 mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-extrabold">{t('unsubscribePage.errorTitle')}</h1>
            <p className="text-sm text-rose-700 dark:text-rose-400">{errorMessage}</p>
            <p className="text-xs text-ink/70 dark:text-slate-400">{t('unsubscribePage.errorHint')}</p>
            <div className="flex justify-center gap-3 pt-2 text-xs">
              <Link to="/account" className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
                {t('unsubscribePage.loginAccountBtn')}
              </Link>
            </div>
          </>
        )}

        {status === 'idle' && (
          <>
            <BellOff className="w-11 h-11 text-brand mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-extrabold">{t('unsubscribePage.idleTitle')}</h1>
            <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed">
              {t('unsubscribePage.idleDesc')}
            </p>
            <div className="flex justify-center gap-3 pt-2 text-xs">
              <Link to="/account" className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
                {t('unsubscribePage.manageAccountBtn')}
              </Link>
              <Link to="/" className="px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 font-bold">
                {t('common.home')}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
