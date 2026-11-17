import React, { useMemo, useState } from 'react';
import {
  BellRing,
  Minus,
  Plus,
  Truck,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { daysUntil, formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { getVariantAvailableStock } from '../../lib/pricing';

export function AdminInventoryPage() {
  const {
    products,
    warehouses,
    suppliers,
    stockMovements,
    stockRequests,
    stockNotifications,
    settings,
    adjustVariantStock,
    applyNearExpirySpecialPrice,
    markStockNotificationSent,
    upsertWarehouse,
    deleteWarehouse,
    upsertSupplier,
    deleteSupplier,
    updateStockRequestStatus,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<'stock' | 'fefo' | 'ledger' | 'reorder' | 'warehouses' | 'requests'>('stock');
  const [reason, setReason] = useState('شمارش و تعدیل انبار مرکزی');
  const [warehouseCode, setWarehouseCode] = useState(warehouses[0]?.code ?? 'TEH-CENTRAL');
  const [stocktakeMode, setStocktakeMode] = useState(false);
  const [countedMap, setCountedMap] = useState<Record<string, number>>({});
  const [expiryPrices, setExpiryPrices] = useState<Record<string, number>>({});

  const [newWh, setNewWh] = useState({ code: '', nameFa: '', city: 'تهران', address: '' });
  const [newSup, setNewSup] = useState({ nameFa: '', contactName: '', phone: '', leadTimeDays: 5 });

  const variantRows = useMemo(
    () => products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v }))),
    [products]
  );

  const lowStockRows = useMemo(
    () =>
      variantRows.filter(({ variant }) => getVariantAvailableStock(variant) <= variant.lowStockThreshold),
    [variantRows]
  );

  const batchRows = useMemo(
    () =>
      products
        .flatMap((p) =>
          p.variants.flatMap((v) =>
            (v.batches ?? []).map((b) => ({
              product: p,
              variant: v,
              batch: b,
              daysLeft: daysUntil(b.expiresAt),
            }))
          )
        )
        .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)),
    [products]
  );

  const handleApplyStocktake = async (productId: string, variantId: string, currentQty: number) => {
    const counted = countedMap[variantId];
    if (counted === undefined || Number.isNaN(counted)) return;
    const delta = counted - currentQty;
    if (delta === 0) {
      pushToast('مغایرتی در شمارش ثبت نشد.', 'info');
      return;
    }
    await adjustVariantStock(productId, variantId, delta, `انبارگردانی (${reason})`, warehouseCode, 'stocktake');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">انبارداری، بچ‌های FEFO، تامین‌کنندگان و دفترکل موجودی</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={warehouseCode}
            onChange={(e) => setWarehouseCode(e.target.value)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {warehouses.map((w) => <option key={w.id} value={w.code}>{w.nameFa} ({w.code})</option>)}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="علت تعدیل برای ثبت Audit..."
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 w-56"
          />
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'stock', label: 'موجودی و انبارگردانی' },
          { id: 'fefo', label: `سری ساخت و FEFO (${toPersianDigits(batchRows.length)})` },
          { id: 'reorder', label: `پیشنهاد خرید مجدد (${toPersianDigits(lowStockRows.length)})` },
          { id: 'ledger', label: `دفترکل حرکات انبار (${toPersianDigits(stockMovements.length)})` },
          { id: 'warehouses', label: 'انبارها و تامین‌کنندگان' },
          { id: 'requests', label: `اطلاع‌رسانی و تامین کالا (${toPersianDigits(stockRequests.length + stockNotifications.length)})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === t.id ? 'bg-brand text-white' : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-line dark:border-slate-800 flex justify-between items-center text-xs">
            <span className="font-extrabold text-sm">موجودی تنوع‌ها در انبار</span>
            <label className="inline-flex items-center gap-2 font-bold">
              <input type="checkbox" checked={stocktakeMode} onChange={(e) => setStocktakeMode(e.target.checked)} />
              <span>فعال‌سازی حالت انبارگردانی (Stocktake Count)</span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 dark:bg-slate-800 text-ink/70">
                <tr>
                  <th className="p-3 text-right">کالا و تنوع</th>
                  <th className="p-3 text-right">SKU</th>
                  <th className="p-3 text-right">کل</th>
                  <th className="p-3 text-right">رزرو</th>
                  <th className="p-3 text-right">قابل فروش</th>
                  <th className="p-3 text-right">{stocktakeMode ? 'شمارش واقعی (Stocktake)' : 'تعدیل فوری'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {variantRows.slice(0, 25).map(({ product, variant }) => {
                  const avail = getVariantAvailableStock(variant);
                  const isLow = avail <= variant.lowStockThreshold;
                  return (
                    <tr key={variant.id}>
                      <td className="p-3 font-bold">{product.titleFa} — {variant.labelFa}</td>
                      <td className="p-3 tabular-nums">{variant.sku}</td>
                      <td className="p-3 tabular-nums">{toPersianDigits(variant.stockOnHand)}</td>
                      <td className="p-3 tabular-nums">{toPersianDigits(variant.reserved)}</td>
                      <td className={`p-3 tabular-nums font-extrabold ${isLow ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {toPersianDigits(avail)}
                      </td>
                      <td className="p-3">
                        {stocktakeMode ? (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              value={countedMap[variant.id] ?? variant.stockOnHand}
                              onChange={(e) => setCountedMap({ ...countedMap, [variant.id]: Number(e.target.value) })}
                              className="w-20 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyStocktake(product.id, variant.id, variant.stockOnHand)}
                              className="px-2.5 py-1 rounded bg-brand text-white font-bold"
                            >
                              ثبت مغایرت
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustVariantStock(product.id, variant.id, 5, reason, warehouseCode, 'receive')}
                              className="p-1 rounded border border-line dark:border-slate-700 hover:bg-emerald-50"
                              title="+۵ عدد ورود کالا"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => adjustVariantStock(product.id, variant.id, -1, reason, warehouseCode, 'adjust')}
                              className="p-1 rounded border border-line dark:border-slate-700 hover:bg-rose-50"
                              title="-۱ عدد کسر"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'fefo' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">مدیریت بچ‌ها و قیمت ویژه نزدیک انقضا (FEFO)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">محصول</th>
                  <th className="py-2 text-right">LOT</th>
                  <th className="py-2 text-right">انقضا</th>
                  <th className="py-2 text-right">روز مانده</th>
                  <th className="py-2 text-right">موجودی بچ</th>
                  <th className="py-2 text-right">قیمت ویژه حراج FEFO (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {batchRows.map((row) => {
                  const near = row.daysLeft !== null && row.daysLeft <= settings.nearExpiryThresholdDays;
                  const draftPrice = expiryPrices[row.batch.id] ?? row.batch.specialPrice ?? Math.round((row.variant.basePrice ?? 1000000) * 0.85);
                  return (
                    <tr key={row.batch.id}>
                      <td className="py-2.5 font-bold">{row.product.titleFa} ({row.variant.labelFa})</td>
                      <td className="py-2.5 tabular-nums">{row.batch.batchNo}</td>
                      <td className="py-2.5 tabular-nums">{formatJalaliDate(row.batch.expiresAt)}</td>
                      <td className={`py-2.5 tabular-nums font-bold ${near ? 'text-amber-600' : ''}`}>
                        {row.daysLeft !== null ? `${toPersianDigits(row.daysLeft)} روز` : '—'}
                      </td>
                      <td className="py-2.5 tabular-nums">{toPersianDigits(row.batch.qtyOnHand)}</td>
                      <td className="py-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            value={draftPrice}
                            onChange={(e) => setExpiryPrices({ ...expiryPrices, [row.batch.id]: Number(e.target.value) })}
                            className="w-28 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => applyNearExpirySpecialPrice(row.product.id, row.variant.id, row.batch.id, draftPrice)}
                            className="px-2.5 py-1 rounded bg-amber-600 text-white font-bold"
                          >
                            ثبت حراج
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reorder' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">کالاهای نیازمند سفارش مجدد (Reorder Suggestions)</h2>
          {lowStockRows.length === 0 ? (
            <p className="text-ink/60">همه کالاها دارای موجودی بالای آستانه هستند.</p>
          ) : (
            <div className="divide-y divide-line dark:divide-slate-800">
              {lowStockRows.map(({ product, variant }) => {
                const avail = getVariantAvailableStock(variant);
                const suggestedQty = Math.max(10, variant.lowStockThreshold * 4 - avail);
                return (
                  <div key={variant.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <p className="font-bold">{product.titleFa} — {variant.labelFa}</p>
                      <p className="text-ink/55 tabular-nums">
                        موجودی فعلی: {toPersianDigits(avail)} · آستانه هشدار: {toPersianDigits(variant.lowStockThreshold)} · پیشنهاد خرید: {toPersianDigits(suggestedQty)} عدد
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustVariantStock(product.id, variant.id, suggestedQty, 'سفارش مجدد تاییدشده انبار', warehouseCode, 'receive')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                    >
                      ثبت رسید +{toPersianDigits(suggestedQty)} عدد
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">دفترکل تغییرناپذیر حرکات انبار (Stock Movements)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">تاریخ</th>
                  <th className="py-2 text-right">محصول</th>
                  <th className="py-2 text-right">انبار</th>
                  <th className="py-2 text-right">نوع</th>
                  <th className="py-2 text-right">تغییر</th>
                  <th className="py-2 text-right">شرح / اپراتور</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {stockMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 tabular-nums">{formatJalaliDateTime(m.createdAt)}</td>
                    <td className="py-2 font-bold">{m.productTitleFa} ({m.sku})</td>
                    <td className="py-2">{m.warehouseCode}</td>
                    <td className="py-2">{m.type}</td>
                    <td className={`py-2 tabular-nums font-extrabold ${m.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.delta > 0 ? `+${toPersianDigits(m.delta)}` : toPersianDigits(m.delta)}
                    </td>
                    <td className="py-2">{m.reason} ({m.actorEmail})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <WarehouseIcon className="w-4 h-4 text-brand" />
              <span>مدیریت انبارها</span>
            </h2>
            {warehouses.map((w) => (
              <div key={w.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{w.nameFa} ({w.code})</p>
                  <p className="text-ink/55">{w.city} — {w.address}</p>
                </div>
                <button type="button" onClick={() => deleteWarehouse(w.id)} className="text-rose-600 font-bold">حذف</button>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <input value={newWh.code} onChange={(e) => setNewWh({ ...newWh, code: e.target.value })} placeholder="کد انبار (مثلاً MSH-01)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={newWh.nameFa} onChange={(e) => setNewWh({ ...newWh, nameFa: e.target.value })} placeholder="نام انبار" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={newWh.city} onChange={(e) => setNewWh({ ...newWh, city: e.target.value })} placeholder="شهر" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={newWh.address} onChange={(e) => setNewWh({ ...newWh, address: e.target.value })} placeholder="نشانی" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <button
                type="button"
                onClick={async () => {
                  if (!newWh.code || !newWh.nameFa) return;
                  await upsertWarehouse({ id: `wh_${Date.now()}`, ...newWh, isActive: true });
                  setNewWh({ code: '', nameFa: '', city: 'تهران', address: '' });
                }}
                className="col-span-2 py-2 rounded-xl bg-brand text-white font-bold"
              >
                افزودن انبار
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand" />
              <span>مدیریت تامین‌کنندگان رسمی</span>
            </h2>
            {suppliers.map((s) => (
              <div key={s.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{s.nameFa}</p>
                  <p className="text-ink/55">{s.contactName} · {s.phone} · زمان تامین {toPersianDigits(s.leadTimeDays)} روز</p>
                </div>
                <button type="button" onClick={() => deleteSupplier(s.id)} className="text-rose-600 font-bold">حذف</button>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <input value={newSup.nameFa} onChange={(e) => setNewSup({ ...newSup, nameFa: e.target.value })} placeholder="نام شرکت تامین‌کننده" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={newSup.contactName} onChange={(e) => setNewSup({ ...newSup, contactName: e.target.value })} placeholder="مسئول فروش" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={newSup.phone} onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })} placeholder="تلفن تماس" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input type="number" value={newSup.leadTimeDays} onChange={(e) => setNewSup({ ...newSup, leadTimeDays: Number(e.target.value) })} placeholder="زمان تحویل (روز)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <button
                type="button"
                onClick={async () => {
                  if (!newSup.nameFa) return;
                  await upsertSupplier({ id: `sup_${Date.now()}`, ...newSup, brandIds: [], isActive: true });
                  setNewSup({ nameFa: '', contactName: '', phone: '', leadTimeDays: 5 });
                }}
                className="col-span-2 py-2 rounded-xl bg-brand text-white font-bold"
              >
                افزودن تامین‌کننده
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">درخواست‌های تامین کالای ناموجود</h2>
            {stockRequests.map((sr) => (
              <div key={sr.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-bold">{sr.titleText} {sr.brandText ? `(${sr.brandText})` : ''}</p>
                  <p className="text-ink/60">{sr.contactName} · {sr.mobile}</p>
                </div>
                <select
                  value={sr.status}
                  onChange={(e) => updateStockRequestStatus(sr.id, e.target.value as typeof sr.status)}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                >
                  <option value="new">جدید</option>
                  <option value="in_review">در حال بررسی</option>
                  <option value="sourcing">در حال تامین</option>
                  <option value="available">موجود شد</option>
                  <option value="closed">بسته</option>
                </select>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <BellRing className="w-4 h-4 text-brand" />
              <span>صف اطلاع‌رسانی موجودی (Back-in-Stock Alerts)</span>
            </h2>
            {stockNotifications.map((sn) => (
              <div key={sn.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center gap-2">
                <div>
                  <p className="font-bold">{sn.productTitleFa}</p>
                  <p className="text-ink/60 tabular-nums">{sn.mobile} · {formatJalaliDateTime(sn.createdAt)}</p>
                </div>
                {sn.status === 'pending' ? (
                  <button type="button" onClick={() => markStockNotificationSent(sn.id)} className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold">
                    ارسال پیامک موجودی
                  </button>
                ) : (
                  <span className="text-emerald-700 font-bold">اطلاع‌رسانی شد</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminInventoryPage;
