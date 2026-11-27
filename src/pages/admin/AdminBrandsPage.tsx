import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { AccessibleModal } from '../../components/ui/Modal';
import { Brand } from '../../types/domain';

export function AdminBrandsPage() {
  const { brands, products, upsertBrand, deleteBrand } = useStore();
  const { t, formatDigits } = useI18n();
  const [editing, setEditing] = useState<Brand | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-lg sm:text-xl font-extrabold">{t('adminBrands.title')}</h1>
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: `br_${Date.now()}`,
              nameFa: '',
              nameEn: '',
              slug: `brand-${Date.now()}`,
              countryCode: 'DE',
              countryFa: t('adminBrands.defaultCountry'),
              descriptionFa: '',
              isAuthorizedDealer: true,
              warrantyProvider: t('adminBrands.defaultWarrantyProvider'),
              isActive: true,
              updatedAt: new Date().toISOString(),
            })
          }
          className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold shrink-0"
        >
          {t('adminBrands.newBrand')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((b) => (
          <div
            key={b.id}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2 text-xs min-w-0"
          >
            <div className="flex flex-wrap justify-between items-start gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold truncate">{b.nameFa}</h2>
                <p className="text-ink/55 truncate">
                  {b.nameEn} · {b.countryFa}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(structuredClone(b))}
                  className="min-h-[36px] px-3 py-1 rounded-lg border border-line dark:border-slate-700 font-bold hover:border-brand"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrand(b.id)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 font-bold"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
            <p className="text-ink/70 dark:text-slate-400 line-clamp-2">{b.descriptionFa}</p>
            <p className="font-bold text-brand tabular-nums">
              {t('counts.products', { count: formatDigits(products.filter((p) => p.brandId === b.id).length) })} ·{' '}
              {b.isAuthorizedDealer ? t('adminBrands.authorizedDealer') : t('adminBrands.distributor')}
            </p>
          </div>
        ))}
      </div>

      <AccessibleModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        ariaLabel={t('adminBrands.modalTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-3 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {editing && (
          <>
            <h2 className="text-base font-extrabold">{t('adminBrands.modalTitle')}</h2>
            <input
              value={editing.nameFa}
              onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })}
              placeholder={t('adminBrands.nameFaPlaceholder')}
              className="w-full px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={editing.nameEn}
              onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
              placeholder={t('adminBrands.nameEnPlaceholder')}
              className="w-full px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={editing.countryFa}
              onChange={(e) => setEditing({ ...editing, countryFa: e.target.value })}
              placeholder={t('adminBrands.countryPlaceholder')}
              className="w-full px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <label className="inline-flex items-center gap-2 font-bold min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isAuthorizedDealer}
                onChange={(e) => setEditing({ ...editing, isAuthorizedDealer: e.target.checked })}
                className="accent-brand"
              />
              <span>{t('adminBrands.authorizedDealerCheckbox')}</span>
            </label>
            <textarea
              rows={3}
              value={editing.descriptionFa}
              onChange={(e) => setEditing({ ...editing, descriptionFa: e.target.value })}
              placeholder={t('adminBrands.descriptionPlaceholder')}
              className="w-full px-3 py-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertBrand(editing);
                  setEditing(null);
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminBrands.saveBrand')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>
    </div>
  );
}

export default AdminBrandsPage;
