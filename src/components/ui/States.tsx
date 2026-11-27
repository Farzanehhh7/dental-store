import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { useI18n } from '../../context/i18n';

export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label={t('common.loadingPage')}
    >
      <div className="h-64 md:h-80 rounded-2xl bg-surface dark:bg-slate-800/80 border border-line/60 dark:border-slate-800" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-surface dark:bg-slate-800/80" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-72 rounded-xl bg-surface dark:bg-slate-800/80" />
        ))}
      </div>
      <span className="sr-only">{t('common.loadingPage')}</span>
    </div>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl overflow-hidden p-4 space-y-3"
        >
          <div className="aspect-[4/3] rounded-lg bg-surface dark:bg-slate-800" />
          <div className="h-3 w-1/2 rounded bg-surface dark:bg-slate-800" />
          <div className="h-4 w-5/6 rounded bg-surface dark:bg-slate-800" />
          <div className="h-8 w-full rounded-lg bg-surface dark:bg-slate-800 mt-4" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  const { t } = useI18n();
  return (
    <div
      className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-3 animate-pulse overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      <div className="h-9 rounded-lg bg-surface dark:bg-slate-800" />
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, cIdx) => (
            <div key={cIdx} className="h-7 rounded bg-surface/80 dark:bg-slate-800/70" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ heightClass = 'h-64' }: { heightClass?: string }) {
  const { t } = useI18n();
  return (
    <div
      className={`${heightClass} w-full rounded-xl bg-surface/70 dark:bg-slate-800/60 border border-line/60 dark:border-slate-800 animate-pulse flex items-center justify-center`}
      role="status"
      aria-busy="true"
      aria-label={t('common.loadingChart')}
    >
      <span className="text-xs font-medium text-ink/60 dark:text-slate-400">{t('common.loadingChart')}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionTo,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 sm:p-10 text-center space-y-3">
      <div className="mx-auto w-11 h-11 rounded-xl bg-surface dark:bg-slate-800 flex items-center justify-center text-ink/50 dark:text-slate-400">
        {icon ?? <Inbox className="w-6 h-6" aria-hidden="true" />}
      </div>
      <p className="text-sm font-extrabold text-ink dark:text-slate-100">{title}</p>
      {description && <p className="text-xs text-ink/70 dark:text-slate-400 max-w-md mx-auto leading-relaxed">{description}</p>}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-block px-5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button
          type="button"
          onClick={onAction}
          className="inline-block px-5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-6 text-center space-y-3"
    >
      <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" aria-hidden="true" />
      <p className="text-sm font-extrabold text-rose-800 dark:text-rose-200">{title ?? t('common.errorOccurred')}</p>
      <p className="text-xs text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('common.retry')}</span>
        </button>
      )}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-[11px] font-bold text-rose-700 dark:text-rose-400 mt-1">
      {message}
    </p>
  );
}
