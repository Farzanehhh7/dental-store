import React, { useState } from 'react';
import { Activity, Gauge, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { scoreSearchMatch } from '../../lib/persian-search';
import { resolveVariantPrice } from '../../lib/pricing';
import { AdminRoleCode, Product } from '../../types/domain';
import { ADMIN_ROLE_LABELS, getAdminRoleLabel } from '../../components/admin/rbac';

export function AdminSystemPage() {
  const {
    settings,
    auditLogs,
    adminsList,
    products,
    campaigns,
    updateSettings,
    assignAdminRole,
    removeAdminRole,
  } = useStore();
  const { t, formatDateTime, formatDigits } = useI18n();

  const [form, setForm] = useState(settings);
  const [adminDraft, setAdminDraft] = useState({ uid: '', email: '', role: 'sales_mgr' as AdminRoleCode, displayName: '' });
  const [benchResult, setBenchResult] = useState<{ count: number; indexMs: number; queryMs: number; matchedCount: number } | null>(null);

  const rumVitals = typeof window !== 'undefined' ? window.__dmVitals ?? [] : [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(form);
  };

  // Synthesize 50,000 dental catalog items & measure search + pricing speed
  const runScaleBenchmark = () => {
    const t0 = performance.now();
    const synthetic: { sku: string; titleFa: string; base: Product }[] = [];
    const baseProd = products[0];
    for (let i = 0; i < 50000; i++) {
      const p = products[i % products.length] ?? baseProd;
      synthetic.push({
        sku: `BM-${100000 + i}`,
        titleFa: `${p.titleFa} #${i}`,
        base: p,
      });
    }
    const t1 = performance.now();
    let hits = 0;
    for (let i = 0; i < synthetic.length; i++) {
      const sc = scoreSearchMatch('کامپوزیت 3M', {
        exactCodes: [synthetic[i].sku],
        textFields: [synthetic[i].titleFa],
      });
      if (sc > 0) hits++;
    }
    if (baseProd && baseProd.variants[0]) {
      resolveVariantPrice(baseProd, baseProd.variants[0], { customerGroup: 'dentist', quantity: 5, campaigns, settings });
    }
    const t2 = performance.now();
    setBenchResult({
      count: synthetic.length,
      indexMs: Number((t1 - t0).toFixed(1)),
      queryMs: Number((t2 - t1).toFixed(1)),
      matchedCount: hits,
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg sm:text-xl font-extrabold">{t('adminSystem.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3 text-xs"
        >
          <h2 className="text-base font-extrabold">{t('adminSystem.settingsTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.storeNameLabel')}</span>
              <input
                value={form.storeNameFa}
                onChange={(e) => setForm({ ...form, storeNameFa: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.taxRateLabel')}</span>
              <input
                type="number"
                value={form.taxRatePercent}
                onChange={(e) => setForm({ ...form, taxRatePercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.freeShippingLabel')}</span>
              <input
                type="number"
                value={form.freeShippingThreshold}
                onChange={(e) => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.nearExpiryDaysLabel')}</span>
              <input
                type="number"
                value={form.nearExpiryThresholdDays}
                onChange={(e) => setForm({ ...form, nearExpiryThresholdDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.facetThresholdLabel')}</span>
              <input
                type="number"
                value={form.indexableFacetThreshold}
                onChange={(e) => setForm({ ...form, indexableFacetThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">{t('adminSystem.discontinuedGraceDaysLabel')}</span>
              <input
                type="number"
                value={form.discontinuedGraceDays}
                onChange={(e) => setForm({ ...form, discontinuedGraceDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
          </div>
          <button type="submit" className="min-h-[40px] px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
            {t('adminSystem.saveSettings')}
          </button>
        </form>

        {/* Real RBAC Staff Assignment */}
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <span>{t('adminSystem.rbacTitle')}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={adminDraft.uid}
              onChange={(e) => setAdminDraft({ ...adminDraft, uid: e.target.value })}
              placeholder={t('adminSystem.uidPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={adminDraft.email}
              onChange={(e) => setAdminDraft({ ...adminDraft, email: e.target.value })}
              placeholder={t('adminSystem.emailPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={adminDraft.role}
              onChange={(e) => setAdminDraft({ ...adminDraft, role: e.target.value as AdminRoleCode })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              {(Object.keys(ADMIN_ROLE_LABELS) as AdminRoleCode[]).map((r) => (
                <option key={r} value={r}>
                  {getAdminRoleLabel(r, t)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!adminDraft.uid || !adminDraft.email) return;
                await assignAdminRole(adminDraft.uid, adminDraft.email, adminDraft.role, adminDraft.displayName);
                setAdminDraft({ uid: '', email: '', role: 'sales_mgr', displayName: '' });
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminSystem.assignRole')}
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2">
            {adminsList.map((a) => (
              <div
                key={a.uid}
                className="p-2.5 rounded-lg bg-surface/60 dark:bg-slate-800 flex flex-wrap justify-between items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold break-all">{a.email}</p>
                  <p className="text-ink/55 break-all">
                    {getAdminRoleLabel(a.role, t)} · UID: {a.uid}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAdminRole(a.uid)}
                  className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-rose-600 font-bold shrink-0"
                  title={t('adminSystem.revokeAccess')}
                  aria-label={t('adminSystem.revokeAccess')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 50,000-Product Benchmark & Web Vitals RUM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-brand shrink-0" />
              <span>{t('adminSystem.benchmarkTitle')}</span>
            </h2>
            <button
              type="button"
              onClick={runScaleBenchmark}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-brand text-white font-bold shrink-0"
            >
              {t('adminSystem.runBenchmark')}
            </button>
          </div>
          {benchResult && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-1 tabular-nums">
              <p className="font-bold">{t('adminSystem.benchRecords', { count: formatDigits(benchResult.count) })}</p>
              <p>{t('adminSystem.benchIndexMs', { ms: formatDigits(benchResult.indexMs) })}</p>
              <p>
                {t('adminSystem.benchQueryMs', {
                  ms: formatDigits(benchResult.queryMs),
                  hits: formatDigits(benchResult.matchedCount),
                })}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand shrink-0" />
            <span>{t('adminSystem.rumTitle')}</span>
          </h2>
          {rumVitals.length === 0 ? (
            <p className="text-ink/60">{t('adminSystem.rumEmpty')}</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {rumVitals.map((v, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-surface/60 dark:bg-slate-800 flex flex-wrap justify-between gap-2 tabular-nums"
                >
                  <span className="font-bold break-all">
                    {v.name} ({v.path})
                  </span>
                  <span className="shrink-0">
                    {formatDigits(v.value)} · {v.rating}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Immutable Audit Log */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
        <h2 className="text-base font-extrabold">{t('adminSystem.auditTitle')}</h2>
        <div className="divide-y divide-line dark:divide-slate-800 max-h-80 overflow-y-auto">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-2.5 flex flex-wrap justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{log.summaryFa}</p>
                <p className="text-ink/55 break-all">
                  {log.actorEmail} · {log.action}
                </p>
              </div>
              <span className="tabular-nums text-ink/55 shrink-0">{formatDateTime(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminSystemPage;
