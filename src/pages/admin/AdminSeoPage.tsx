import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { auditSeoHealth, findOrphanProducts } from '../../lib/seo';
import { RedirectRule } from '../../types/domain';

export function AdminSeoPage() {
  const { products, categories, blogPosts, brands, redirects, notFoundLogs, upsertRedirect, deleteRedirect } = useStore();
  const { t, formatDateTime, formatDigits } = useI18n();
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [code, setCode] = useState<301 | 302 | 410>(301);

  const findings = useMemo(() => auditSeoHealth(products, categories, blogPosts), [products, categories, blogPosts]);
  const orphans = useMemo(() => findOrphanProducts(products, categories), [products, categories]);

  const handleAddRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPath.startsWith('/')) return;
    const rule: RedirectRule = {
      id: `red_${Date.now()}`,
      fromPath: fromPath.trim(),
      toPath: toPath.trim() || '/',
      statusCode: code,
      hitCount: 0,
      createdAt: new Date().toISOString(),
    };
    await upsertRedirect(rule);
    setFromPath('');
    setToPath('');
  };

  const indexableCount =
    1 +
    categories.filter((c) => c.isActive).length +
    products.filter((p) => p.status === 'active').length +
    brands.filter((b) => b.isActive).length +
    blogPosts.filter((p) => p.status === 'published').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-lg sm:text-xl font-extrabold">{t('adminSeo.title')}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold hover:border-brand"
          >
            <Globe className="w-3.5 h-3.5 text-brand" /> sitemap.xml
          </a>
          <a
            href="/robots.txt"
            target="_blank"
            rel="noreferrer"
            className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold hover:border-brand"
          >
            robots.txt
          </a>
          <a
            href="/feeds/price-comparison.json"
            target="_blank"
            rel="noreferrer"
            className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold hover:border-brand"
          >
            {t('adminSeo.priceComparisonFeed')}
          </a>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold">{t('adminSeo.checklistTitle')}</h2>
          <span className="text-xs font-bold text-brand tabular-nums">
            {t('adminSeo.indexablePagesCount', { count: formatDigits(indexableCount) })}
          </span>
        </div>
        <div className="divide-y divide-line dark:divide-slate-800 text-xs">
          {findings.map((f) => (
            <div key={f.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="font-bold flex items-center gap-2">
                  {f.severity === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${f.severity === 'error' ? 'text-rose-600' : 'text-amber-600'}`}
                    />
                  )}
                  <span>{f.rule}</span>
                </p>
                <p className="text-ink/60">{f.descriptionFa}</p>
              </div>
              <span className="font-extrabold tabular-nums shrink-0">
                {f.affectedCount === 0
                  ? t('adminSeo.healthyZeroErrors')
                  : t('adminSeo.issuesCount', { count: formatDigits(f.affectedCount) })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Orphan Pages Detector + 404 Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 min-w-0">
          <h2 className="text-base font-extrabold">{t('adminSeo.orphansTitle')}</h2>
          {orphans.length === 0 ? (
            <p className="text-emerald-700 dark:text-emerald-400 font-bold">{t('adminSeo.noOrphans')}</p>
          ) : (
            orphans.map((p) => (
              <p key={p.id} className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 break-all">
                {p.titleFa} (/product/{p.slug})
              </p>
            ))
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 min-w-0">
          <h2 className="text-base font-extrabold">{t('adminSeo.notFoundTitle')}</h2>
          {notFoundLogs.map((nf) => (
            <div
              key={nf.id}
              className="p-2.5 rounded-lg border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p dir="ltr" className="font-mono font-bold break-all">
                  {nf.path}
                </p>
                <p className="text-ink/55 tabular-nums">
                  {t('adminSeo.hitsCount', { count: formatDigits(nf.hitCount) })} · {formatDateTime(nf.lastSeenAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  upsertRedirect({
                    id: `red_${Date.now()}`,
                    fromPath: nf.path,
                    toPath: '/',
                    statusCode: 301,
                    hitCount: 0,
                    createdAt: new Date().toISOString(),
                  })
                }
                className="min-h-[36px] px-3 py-1 rounded-lg bg-brand text-white font-bold shrink-0"
              >
                {t('adminSeo.quickRedirect301')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Redirects CRUD */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 text-xs">
        <h2 className="text-base font-extrabold">{t('adminSeo.redirectsTitle')}</h2>
        <form onSubmit={handleAddRedirect} className="flex flex-col sm:flex-row flex-wrap gap-2">
          <input
            required
            dir="ltr"
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            placeholder="/old-path"
            className="flex-1 min-w-0 sm:min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <input
            dir="ltr"
            value={toPath}
            onChange={(e) => setToPath(e.target.value)}
            placeholder="/new-path"
            className="flex-1 min-w-0 sm:min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <select
            value={code}
            onChange={(e) => setCode(Number(e.target.value) as 301 | 302 | 410)}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value={301}>{t('adminSeo.code301')}</option>
            <option value={302}>{t('adminSeo.code302')}</option>
            <option value={410}>{t('adminSeo.code410')}</option>
          </select>
          <button type="submit" className="min-h-[40px] px-4 py-2 rounded-lg bg-brand text-white font-bold shrink-0">
            {t('adminSeo.addRedirect')}
          </button>
        </form>
        <div className="divide-y divide-line dark:divide-slate-800">
          {redirects.map((r) => (
            <div key={r.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
              <span dir="ltr" className="font-mono break-all min-w-0">
                {r.fromPath} → {r.toPath}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold tabular-nums">
                  {formatDigits(r.statusCode)} · {t('adminSeo.hitsCount', { count: formatDigits(r.hitCount) })}
                </span>
                <button
                  type="button"
                  onClick={() => deleteRedirect(r.id)}
                  className="min-h-[32px] px-2 text-rose-600 font-bold"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminSeoPage;
