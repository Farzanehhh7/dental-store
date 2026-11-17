import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  PackagePlus,
  RotateCcw,
  Tag,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../../lib/jalali';
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

  const [newCamp, setNewCamp] = useState({
    nameFa: '',
    discountPercent: 10,
    days: 7,
    badgeTextFa: 'پیشنهاد ویژه',
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
      badgeTextFa: newCamp.badgeTextFa,
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
      <h1 className="text-xl font-extrabold">مدیریت قیمت‌گذاری گروهی، قراردادهای B2B، کمپین‌ها و کوپن‌ها</h1>

      {/* Bulk Price Adjustment + Undo */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <span>اصلاح گروهی قیمت‌ها + گرد کردن + دکمه بازگشت (Undo)</span>
          </h2>
          {canUndoBulkPrice && (
            <button
              type="button"
              onClick={undoBulkPriceAdjustment}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازگردانی آخرین تغییر گروهی</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <select
            value={bulkForm.scopeType}
            onChange={(e) => setBulkForm({ ...bulkForm, scopeType: e.target.value as 'all' | 'category' | 'brand', scopeId: '' })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value="all">کل کاتالوگ محصولات</option>
            <option value="category">بر اساس دسته‌بندی</option>
            <option value="brand">بر اساس برند</option>
          </select>
          {bulkForm.scopeType === 'category' && (
            <select
              value={bulkForm.scopeId}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">انتخاب دسته...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
            </select>
          )}
          {bulkForm.scopeType === 'brand' && (
            <select
              value={bulkForm.scopeId}
              onChange={(e) => setBulkForm({ ...bulkForm, scopeId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">انتخاب برند...</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.nameFa}</option>)}
            </select>
          )}
          <input
            type="number"
            value={bulkForm.percent}
            onChange={(e) => setBulkForm({ ...bulkForm, percent: Number(e.target.value) })}
            placeholder="درصد تغییر (مثلاً 5 یا -10)"
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <select
            value={bulkForm.roundingStep}
            onChange={(e) => setBulkForm({ ...bulkForm, roundingStep: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            <option value={1000}>گرد به ۱,۰۰۰ تومان</option>
            <option value={10000}>گرد به ۱۰,۰۰۰ تومان</option>
            <option value={50000}>گرد به ۵۰,۰۰۰ تومان</option>
          </select>
          <button
            type="button"
            onClick={() => applyBulkPriceAdjustment(bulkForm)}
            className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
          >
            اعمال گروهی
          </button>
        </div>
      </div>

      {/* Contract Prices */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <h2 className="text-base font-extrabold flex items-center gap-2">
          <PackagePlus className="w-4 h-4 text-brand" />
          <span>قراردادهای قیمت اختصاصی کلینیک‌ها (Contract Prices)</span>
        </h2>
        <form onSubmit={handleCreateContract} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <select
            value={contractForm.userId}
            onChange={(e) => setContractForm({ ...contractForm, userId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          >
            {usersList.map((u) => (
              <option key={u.uid} value={u.uid}>{u.clinicName || u.displayName || u.email}</option>
            ))}
          </select>
          <select
            value={contractForm.productId}
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
            onChange={(e) => setContractForm({ ...contractForm, unitPrice: Number(e.target.value) })}
            placeholder="قیمت قراردادی (تومان)"
            className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">
            ثبت قرارداد قیمت
          </button>
        </form>
        <div className="divide-y divide-line dark:divide-slate-800">
          {contractPrices.map((cp) => (
            <div key={cp.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
              <div>
                <p className="font-bold">{cp.customerName} — {cp.productTitleFa}</p>
                <p className="text-ink/55 tabular-nums">
                  قیمت توافقی: {formatMoney(cp.unitPrice, currency)} · اعتبار تا {formatJalaliDate(cp.validUntil)}
                </p>
              </div>
              <button type="button" onClick={() => deleteContractPrice(cp.id)} className="px-2.5 py-1 rounded border border-rose-200 text-rose-600 font-bold">
                لغو قرارداد
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Campaigns & Coupons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold">کمپین‌های زمان‌دار و بررسی تداخل تخفیف</h2>
          <div className="space-y-2 text-xs">
            {campaigns.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{c.nameFa} ({toPersianDigits(c.discountPercent)}٪)</p>
                  <p className="text-ink/55">پایان: {formatJalaliDate(c.endsAt)} · {toPersianDigits(c.productIds.length)} محصول</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand">{c.status}</span>
                  <button type="button" onClick={() => deleteCampaign(c.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateCampaign} className="pt-3 border-t border-line dark:border-slate-800 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={newCamp.nameFa}
                onChange={(e) => setNewCamp({ ...newCamp, nameFa: e.target.value })}
                placeholder="عنوان کمپین..."
                className="col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={newCamp.discountPercent}
                onChange={(e) => setNewCamp({ ...newCamp, discountPercent: Number(e.target.value) })}
                placeholder="درصد تخفیف"
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={newCamp.days}
                onChange={(e) => setNewCamp({ ...newCamp, days: Number(e.target.value) })}
                placeholder="مدت (روز)"
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </div>
            <div className="max-h-32 overflow-y-auto border border-line dark:border-slate-700 rounded-lg p-2 space-y-1">
              <span className="font-bold block">انتخاب محصولات کمپین:</span>
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
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  هشدار تداخل: برخی کالاهای انتخابی هم‌اکنون در کمپین «{overlappingCampaigns[0].nameFa}» قرار دارند (در ویترین بیشترین تخفیف اعمال می‌شود).
                </span>
              </p>
            )}
            <button type="submit" className="w-full py-2 rounded-xl bg-brand text-white font-bold">
              ثبت کمپین جدید
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand" />
            <span>کدهای تخفیف (کوپن‌ها)</span>
          </h2>
          <div className="space-y-2 text-xs">
            {coupons.map((cp) => (
              <div key={cp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-extrabold tabular-nums">{cp.code}</p>
                  <p className="text-ink/55 tabular-nums">حداقل سبد: {formatMoney(cp.minOrderAmount, currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-700">
                    {cp.type === 'free_shipping' ? 'ارسال رایگان' : `${toPersianDigits(cp.value)} ${cp.type === 'percent' ? '٪' : 'تومان'}`}
                  </span>
                  <button type="button" onClick={() => deleteCoupon(cp.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateCoupon} className="pt-3 border-t border-line dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
            <input
              required
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
              placeholder="کد تخفیف (مثلاً ENDO10)"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={newCoupon.type}
              onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value as Coupon['type'] })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="percent">درصدی</option>
              <option value="fixed">مبلغ ثابت</option>
              <option value="free_shipping">ارسال رایگان</option>
            </select>
            <input
              type="number"
              value={newCoupon.value}
              onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
              placeholder="مقدار"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              type="number"
              value={newCoupon.minOrderAmount}
              onChange={(e) => setNewCoupon({ ...newCoupon, minOrderAmount: Number(e.target.value) })}
              placeholder="حداقل خرید"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="col-span-2 py-2 rounded-xl bg-brand text-white font-bold">
              ثبت کد تخفیف
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminPricingCampaignsPage;
