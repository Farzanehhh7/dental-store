import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  PackagePlus,
  RotateCcw,
  Tag,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { EmptyState } from '../../components/ui/States';
import { Campaign, ContractPrice, Coupon } from '../../types/domain';

export function AdminPricingCampaignsPage() {
  const {
    campaigns,
    coupons,
    products,
    categories,
    brands,
    contractPrices,
    usersList,
    currency,
    canUndoBulkPrice,
    applyBulkPriceAdjustment,
    undoBulkPriceAdjustment,
    upsertCampaign,
    deleteCampaign,
    upsertCoupon,
    deleteCoupon,
    upsertContractPrice,
    deleteContractPrice,
  } = useStore();
  const { t, formatDate, formatDigits, formatMoney } = useI18n();

  const [newCamp, setNewCamp] = useState({
    nameFa: '',
    discountPercent: 10,
    days: 7,
    badgeTextFa: '',
    productIds: products.slice(0, 3).map((p) => p.id),
  });
  const [newCoupon, setNewCoupon] = useState({ code: '', type: 'percent' as Coupon['type'], value: 5, minOrderAmount: 2000000 });
  const [bulkForm, setBulkForm] = useState({ scopeType: 'all' as 'all' | 'category' | 'brand', scopeId: '', percent: 5, roundingStep: 10000 });
  const [contractForm, setContractForm] = useState({
    userId: usersList[0]?.uid ?? 'usr_demo_clinic',
    productId: products[0]?.id ?? '',
    unitPrice: 1250000,
    days: 60,
  });

  // Detect active campaign overlaps for selected productIds
  const overlappingCampaigns = useMemo(() => {
    const now = Date.now();
    return campaigns.filter(
      (c) =>
        c.status === 'active' &&
        new Date(c.endsAt).getTime() > now &&
        c.productIds.some((pid) => newCamp.productIds.includes(pid))
    );
  }, [campaigns, newCamp.productIds]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const c: Campaign = {
      id: `cmp_${now}`,
      nameFa: newCamp.nameFa,
      slug: `camp-${now}`,
      type: 'percent',
      discountPercent: newCamp.discountPercent,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + newCamp.days * 86400000).toISOString(),
      showTimer: true,
      badgeTextFa: newCamp.badgeTextFa || t('adminPricing.defaultCampaignBadge'),
      status: 'active',
      productIds: newCamp.productIds,
      updatedAt: new Date().toISOString(),
    };
    await upsertCampaign(c);
    setNewCamp({ ...newCamp, nameFa: '' });
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    await upsertCoupon({
      id: `cpn_${now}`,
      code: newCoupon.code.trim().toUpperCase(),
      type: newCoupon.type,
      value: newCoupon.value,
      minOrderAmount: newCoupon.minOrderAmount,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 30 * 86400000).toISOString(),
      usageCount: 0,
      usageLimit: 100,
      isActive: true,
    });
    setNewCoupon({ code: '', type: 'percent', value: 5, minOrderAmount: 2000000 });
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = usersList.find((u) => u.uid === contractForm.userId);
    const prod = products.find((p) => p.id === contractForm.productId);
    const varId = prod?.variants[0]?.id;
    if (!prod || !varId) return;
    const rec: ContractPrice = {
      id: `ctr_${Date.now()}`,
      userId: contractForm.userId,
      customerName: user?.clinicName || user?.displayName || contractForm.userId,
      productId: prod.id,
      productTitleFa: prod.titleFa,
      variantId: varId,
      unitPrice: contractForm.unitPrice,
      validUntil: new Date(Date.now() + contractForm.days * 86400000).toISOString(),
      isActive: true,
    };
    await upsertContractPrice(rec);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">{t('adminPricing.title')}</h1>

      {/* Bulk Price Adjustment + Undo */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>{t('adminPricing.bulk.title')}</span>
          </h2>
          {canUndoBulkPrice && (
            <button
              type="button"
              onClick={undoBulkPriceAdjustment}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('adminPricing.bulk.undoBtn')}</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <select
            value={bulkForm.scopeType}
            aria-label={t('adminPricing.bulk.scopeAria')}
            onChange={(e) => setBulkForm({ ...bulkForm, scopeType: e.target.value as 'all' | 'category' | 'brand', scopeId: '' })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value="all">{t('adminPricing.bulk.scopeAll')}</option>
            <option value="category">{t('adminPricing.bulk.scopeCategory')}</option>
            <option value="brand">{t('adminPricing.bulk.scopeBrand')}</option>
          </select>
          {bulkForm.scopeType === 'category' && (
            <select
              value={bulkForm.scopeId}
              aria-label={t('adminPricing.bulk.selectCategory')}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">{t('adminPricing.bulk.selectCategory')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
            </select>
          )}
          {bulkForm.scopeType === 'brand' && (
            <select
              value={bulkForm.scopeId}
              aria-label={t('adminPricing.bulk.selectBrand')}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">{t('adminPricing.bulk.selectBrand')}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.nameFa}</option>)}
            </select>
          )}
          <input
            type="number"
            value={bulkForm.percent}
            aria-label={t('adminPricing.bulk.percentPh')}
            onChange={(e) => setBulkForm({ ...bulkForm, percent: Number(e.target.value) })}
            placeholder={t('adminPricing.bulk.percentPh')}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <select
            value={bulkForm.roundingStep}
            aria-label={t('adminPricing.bulk.roundAria')}
            onChange={(e) => setBulkForm({ ...bulkForm, roundingStep: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value={1000}>{t('adminPricing.bulk.round1k')}</option>
            <option value={10000}>{t('adminPricing.bulk.round10k')}</option>
            <option value={50000}>{t('adminPricing.bulk.round50k')}</option>
          </select>
          <button
            type="button"
            onClick={() => applyBulkPriceAdjustment(bulkForm)}
            className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
          >
            {t('adminPricing.bulk.applyBtn')}
          </button>
        </div>
      </div>

      {/* Contract Prices */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <h2 className="text-base font-extrabold flex items-center gap-2">
          <PackagePlus className="w-4 h-4 text-brand" aria-hidden="true" />
          <span>{t('adminPricing.contracts.title')}</span>
        </h2>
        <form onSubmit={handleCreateContract} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <select
            value={contractForm.userId}
            aria-label={t('adminPricing.contracts.userAria')}
            onChange={(e) => setContractForm({ ...contractForm, userId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            {usersList.map((u) => (
              <option key={u.uid} value={u.uid}>{u.clinicName || u.displayName || u.email}</option>
            ))}
          </select>
          <select
            value={contractForm.productId}
            aria-label={t('adminPricing.contracts.productAria')}
            onChange={(e) => setContractForm({ ...contractForm, productId: e.target.value })}
            className="sm:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.titleFa}</option>
            ))}
          </select>
          <input
            type="number"
            value={contractForm.unitPrice}
            aria-label={t('adminPricing.contracts.unitPricePh')}
            onChange={(e) => setContractForm({ ...contractForm, unitPrice: Number(e.target.value) })}
            placeholder={t('adminPricing.contracts.unitPricePh')}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">
            {t('adminPricing.contracts.submitBtn')}
          </button>
        </form>
        {contractPrices.length === 0 ? (
          <EmptyState title={t('adminPricing.contracts.empty')} />
        ) : (
          <div className="divide-y divide-line dark:divide-slate-800">
            {contractPrices.map((cp) => (
              <div key={cp.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
                <div>
                  <p className="font-bold">{cp.customerName} — {cp.productTitleFa}</p>
                  <p className="text-ink/70 dark:text-slate-400 tabular-nums">
                    {t('adminPricing.contracts.rowMeta', {
                      price: formatMoney(cp.unitPrice, currency),
                      date: formatDate(cp.validUntil),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteContractPrice(cp.id)}
                  className="px-2.5 py-1 rounded border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 font-bold"
                >
                  {t('adminPricing.contracts.cancelBtn')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Campaigns & Coupons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold">{t('adminPricing.campaigns.title')}</h2>
          <div className="space-y-2 text-xs">
            {campaigns.length === 0 ? (
              <EmptyState title={t('adminPricing.campaigns.empty')} />
            ) : (
              campaigns.map((c) => (
                <div key={c.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <p className="font-bold">
                      {c.nameFa} ({t('common.percentValue', { value: formatDigits(c.discountPercent) })})
                    </p>
                    <p className="text-ink/70 dark:text-slate-400">
                      {t('adminPricing.campaigns.rowMeta', {
                        date: formatDate(c.endsAt),
                        count: formatDigits(c.productIds.length),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand">{c.status}</span>
                    <button type="button" onClick={() => deleteCampaign(c.id)} className="text-rose-600 dark:text-rose-400 font-bold">
                      {t('actions.delete')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleCreateCampaign} className="pt-3 border-t border-line dark:border-slate-800 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                required
                value={newCamp.nameFa}
                onChange={(e) => setNewCamp({ ...newCamp, nameFa: e.target.value })}
                placeholder={t('adminPricing.campaigns.namePh')}
                aria-label={t('adminPricing.campaigns.namePh')}
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={newCamp.discountPercent}
                onChange={(e) => setNewCamp({ ...newCamp, discountPercent: Number(e.target.value) })}
                placeholder={t('adminPricing.campaigns.percentPh')}
                aria-label={t('adminPricing.campaigns.percentPh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={newCamp.days}
                onChange={(e) => setNewCamp({ ...newCamp, days: Number(e.target.value) })}
                placeholder={t('adminPricing.campaigns.daysPh')}
                aria-label={t('adminPricing.campaigns.daysPh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </div>
            <div className="max-h-32 overflow-y-auto border border-line dark:border-slate-700 rounded-lg p-2 space-y-1">
              <span className="font-bold block">{t('adminPricing.campaigns.selectProductsLabel')}</span>
              {products.slice(0, 12).map((p) => {
                const checked = newCamp.productIds.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setNewCamp({
                          ...newCamp,
                          productIds: checked
                            ? newCamp.productIds.filter((id) => id !== p.id)
                            : [...newCamp.productIds, p.id],
                        })
                      }
                    />
                    <span>{p.titleFa}</span>
                  </label>
                );
              })}
            </div>
            {overlappingCampaigns.length > 0 && (
              <p className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('adminPricing.campaigns.overlapWarning', { name: overlappingCampaigns[0].nameFa })}</span>
              </p>
            )}
            <button type="submit" className="w-full py-2 rounded-xl bg-brand text-white font-bold">
              {t('adminPricing.campaigns.submitBtn')}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>{t('adminPricing.coupons.title')}</span>
          </h2>
          <div className="space-y-2 text-xs">
            {coupons.length === 0 ? (
              <EmptyState title={t('adminPricing.coupons.empty')} />
            ) : (
              coupons.map((cp) => (
                <div key={cp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <p className="font-extrabold tabular-nums">{cp.code}</p>
                    <p className="text-ink/70 dark:text-slate-400 tabular-nums">
                      {t('adminPricing.coupons.minOrderLabel', { amount: formatMoney(cp.minOrderAmount, currency) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {cp.type === 'free_shipping'
                        ? t('adminPricing.coupons.freeShippingLabel')
                        : cp.type === 'percent'
                        ? t('common.percentValue', { value: formatDigits(cp.value) })
                        : `${formatDigits(cp.value)} ${t('price.toman')}`}
                    </span>
                    <button type="button" onClick={() => deleteCoupon(cp.id)} className="text-rose-600 dark:text-rose-400 font-bold">
                      {t('actions.delete')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleCreateCoupon} className="pt-3 border-t border-line dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input
              required
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
              placeholder={t('adminPricing.coupons.codePh')}
              aria-label={t('adminPricing.coupons.codePh')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={newCoupon.type}
              aria-label={t('adminPricing.coupons.typeAria')}
              onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value as Coupon['type'] })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="percent">{t('adminPricing.coupons.typePercent')}</option>
              <option value="fixed">{t('adminPricing.coupons.typeFixed')}</option>
              <option value="free_shipping">{t('adminPricing.coupons.typeFreeShipping')}</option>
            </select>
            <input
              type="number"
              value={newCoupon.value}
              onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
              placeholder={t('adminPricing.coupons.valuePh')}
              aria-label={t('adminPricing.coupons.valuePh')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              type="number"
              value={newCoupon.minOrderAmount}
              onChange={(e) => setNewCoupon({ ...newCoupon, minOrderAmount: Number(e.target.value) })}
              placeholder={t('adminPricing.coupons.minAmountPh')}
              aria-label={t('adminPricing.coupons.minAmountPh')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="sm:col-span-2 py-2 rounded-xl bg-brand text-white font-bold">
              {t('adminPricing.coupons.submitBtn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminPricingCampaignsPage;
