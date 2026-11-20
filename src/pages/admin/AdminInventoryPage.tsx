import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BellRing,
  Minus,
  Plus,
  RefreshCw,
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
    stockLevels,
    stockBatches,
    lowStockAlerts,
    suppliers,
    stockMovements,
    stockRequests,
    stockNotifications,
    settings,
    refreshInventory,
    adjustVariantStock,
    stocktakeVariantStock,
    transferStock,
    applyNearExpirySpecialPrice,
    markStockNotificationSent,
    upsertWarehouse,
    deleteWarehouse,
    upsertSupplier,
    deleteSupplier,
    updateStockRequestStatus,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<'stock' | 'transfer' | 'fefo' | 'ledger' | 'reorder' | 'warehouses' | 'requests'>('stock');
  const [reason, setReason] = useState('شمارش و تعدیل انبار مرکزی');
  const [warehouseCode, setWarehouseCode] = useState(warehouses[0]?.code ?? 'TEH-CENTRAL');
  const [stocktakeMode, setStocktakeMode] = useState(false);
  const [countedMap, setCountedMap] = useState<Record<string, number>>({});
  const [expiryPrices, setExpiryPrices] = useState<Record<string, number>>({});
  const [batchNoInput, setBatchNoInput] = useState('');
  const [expiryDateInput, setExpiryDateInput] = useState('');

  const [transferForm, setTransferForm] = useState({
    productId: products[0]?.id ?? '',
    variantId: products[0]?.variants[0]?.id ?? '',
    fromWarehouseId: warehouses[0]?.id ?? 'wh_teh',
    toWarehouseId: warehouses[1]?.id ?? warehouses[0]?.id ?? '',
    quantity: 2,
    batchNo: '',
    reason: 'توزیع موجودی بین انبارها',
  });

  const [newWh, setNewWh] = useState({ code: '', nameFa: '', city: 'تهران', address: '' });
  const [newSup, setNewSup] = useState({ nameFa: '', contactName: '', phone: '', leadTimeDays: 5 });

  useEffect(() => {
    if (warehouses.length > 0 && !warehouses.some((w) => w.code === warehouseCode)) {
      setWarehouseCode(warehouses[0].code);
    }
  }, [warehouses, warehouseCode]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.code === warehouseCode) ?? warehouses[0],
    [warehouses, warehouseCode]
  );
  const selectedWarehouseId = selectedWarehouse?.id ?? 'wh_teh';

  const variantRows = useMemo(
    () => products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v }))),
    [products]
  );

  const stockLevelByVariant = useMemo(() => {
    const map = new Map<string, typeof stockLevels[number]>();
    for (const lvl of stockLevels) {
      if (lvl.warehouseId === selectedWarehouseId) {
        map.set(lvl.variantId, lvl);
      }
    }
    return map;
  }, [stockLevels, selectedWarehouseId]);

  const effectiveAlerts = useMemo(() => {
    if (lowStockAlerts.length > 0) return lowStockAlerts;
    return variantRows
      .filter(({ variant }) => getVariantAvailableStock(variant) <= variant.lowStockThreshold)
      .map(({ product, variant }) => {
        const avail = getVariantAvailableStock(variant);
        return {
          levelId: `${selectedWarehouseId}__${variant.id}`,
          productId: product.id,
          productTitleFa: product.titleFa,
          variantId: variant.id,
          variantLabelFa: variant.labelFa,
          sku: variant.sku,
          warehouseId: selectedWarehouseId,
          warehouseCode: selectedWarehouse?.code ?? 'TEH-CENTRAL',
          onHand: variant.stockOnHand,
          reserved: variant.reserved,
          available: avail,
          lowStockThreshold: variant.lowStockThreshold,
        };
      });
  }, [lowStockAlerts, variantRows, selectedWarehouseId, selectedWarehouse]);

  const batchRows = useMemo(() => {
    if (stockBatches.length > 0) {
      const productMap = new Map(products.map((p) => [p.id, p]));
      return stockBatches
        .map((b) => {
          const prod = productMap.get(b.productId);
          const variant = prod?.variants.find((v) => v.id === b.variantId);
          return {
            id: b.id,
            productId: b.productId,
            productTitleFa: prod?.titleFa ?? b.productId,
            variantId: b.variantId,
            variantLabelFa: variant?.labelFa ?? b.variantId,
            basePrice: variant?.basePrice ?? 1000000,
            warehouseCode: b.warehouseCode,
            batchNo: b.batchNo,
            expiresAt: b.expiryDate,
            qtyOnHand: b.qty,
            reserved: b.reserved,
            condition: b.condition,
            specialPrice: b.specialPrice ?? null,
            daysLeft: daysUntil(b.expiryDate),
          };
        })
        .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    }

    return products
      .flatMap((p) =>
        p.variants.flatMap((v) =>
          (v.batches ?? []).map((b) => ({
            id: b.id,
            productId: p.id,
            productTitleFa: p.titleFa,
            variantId: v.id,
            variantLabelFa: v.labelFa,
            basePrice: v.basePrice ?? 1000000,
            warehouseCode: b.warehouseCode,
            batchNo: b.batchNo,
            expiresAt: b.expiresAt,
            qtyOnHand: b.qtyOnHand,
            reserved: b.reserved ?? 0,
            condition: b.condition ?? ('resellable' as const),
            specialPrice: b.specialPrice ?? null,
            daysLeft: daysUntil(b.expiresAt),
          }))
        )
      )
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }, [products, stockBatches]);

  const transferProduct = useMemo(
    () => products.find((p) => p.id === transferForm.productId) ?? products[0],
    [products, transferForm.productId]
  );

  const transferSourceLevel = useMemo(
    () =>
      stockLevels.find(
        (l) => l.warehouseId === transferForm.fromWarehouseId && l.variantId === transferForm.variantId
      ),
    [stockLevels, transferForm.fromWarehouseId, transferForm.variantId]
  );

  const handleApplyStocktake = async (productId: string, variantId: string, currentQty: number) => {
    const counted = countedMap[variantId];
    if (counted === undefined || Number.isNaN(counted) || counted < 0) return;
    if (!reason.trim()) {
      pushToast('برای ثبت مغایرت انبارگردانی درج علت الزامی است.', 'error');
      return;
    }
    if (counted === currentQty) {
      pushToast('مغایرتی در شمارش ثبت نشد.', 'info');
      return;
    }
    await stocktakeVariantStock({
      productId,
      variantId,
      warehouseId: selectedWarehouseId,
      warehouseCode,
      onHand: counted,
      reason: `انبارگردانی (${reason.trim()})`,
    });
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.fromWarehouseId || !transferForm.toWarehouseId) {
      pushToast('انبار مبدا و مقصد را انتخاب کنید.', 'error');
      return;
    }
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      pushToast('انبار مبدا و مقصد نمی‌توانند یکسان باشند.', 'error');
      return;
    }
    const ok = await transferStock({
      productId: transferForm.productId,
      variantId: transferForm.variantId,
      fromWarehouseId: transferForm.fromWarehouseId,
      toWarehouseId: transferForm.toWarehouseId,
      quantity: Math.max(1, Math.floor(transferForm.quantity)),
      reason: transferForm.reason,
      ...(transferForm.batchNo.trim() ? { batchNo: transferForm.batchNo.trim() } : {}),
    });
    if (ok) {
      setTransferForm((f) => ({ ...f, batchNo: '' }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">انبارداری چندانباره، بچ‌های FEFO، انتقال و دفترکل موجودی</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={warehouseCode}
            onChange={(e) => setWarehouseCode(e.target.value)}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.code}>
                {w.nameFa} ({w.code})
              </option>
            ))}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="علت تعدیل / انبارگردانی (الزامی)..."
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 w-56"
          />
          <button
            type="button"
            onClick={() => void refreshInventory()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'stock', label: `موجودی انبار ${selectedWarehouse?.code ?? ''}` },
          { id: 'transfer', label: 'انتقال بین انبارها' },
          { id: 'fefo', label: `سری ساخت و FEFO (${toPersianDigits(batchRows.length)})` },
          { id: 'reorder', label: `هشدار کمبود موجودی (${toPersianDigits(effectiveAlerts.length)})` },
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
          <div className="px-5 py-3 border-b border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs">
            <span className="font-extrabold text-sm">
              موجودی تنوع‌ها در {selectedWarehouse?.nameFa ?? 'انبار مرکزی'} ({warehouseCode})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {!stocktakeMode && (
                <>
                  <input
                    value={batchNoInput}
                    onChange={(e) => setBatchNoInput(e.target.value)}
                    placeholder="شماره بچ ورود (اختیاری)"
                    className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 w-36"
                  />
                  <input
                    value={expiryDateInput}
                    onChange={(e) => setExpiryDateInput(e.target.value)}
                    placeholder="انقضا YYYY-MM-DD"
                    className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 w-36 tabular-nums"
                  />
                </>
              )}
              <label className="inline-flex items-center gap-2 font-bold">
                <input type="checkbox" checked={stocktakeMode} onChange={(e) => setStocktakeMode(e.target.checked)} />
                <span>حالت انبارگردانی (Stocktake)</span>
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 dark:bg-slate-800 text-ink/70">
                <tr>
                  <th className="p-3 text-right">کالا و تنوع</th>
                  <th className="p-3 text-right">SKU</th>
                  <th className="p-3 text-right">کل در انبار</th>
                  <th className="p-3 text-right">رزروشده</th>
                  <th className="p-3 text-right">قابل فروش</th>
                  <th className="p-3 text-right">{stocktakeMode ? 'شمارش واقعی (Stocktake)' : 'تعدیل فوری'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {variantRows.slice(0, 30).map(({ product, variant }) => {
                  const lvl = stockLevelByVariant.get(variant.id);
                  const onHand = lvl ? lvl.onHand : variant.stockOnHand;
                  const reserved = lvl ? lvl.reserved : variant.reserved;
                  const avail = Math.max(0, onHand - reserved);
                  const threshold = lvl?.lowStockThreshold ?? variant.lowStockThreshold;
                  const isLow = avail <= threshold;
                  return (
                    <tr key={variant.id}>
                      <td className="p-3 font-bold">{product.titleFa} — {variant.labelFa}</td>
                      <td className="p-3 tabular-nums">{variant.sku}</td>
                      <td className="p-3 tabular-nums">{toPersianDigits(onHand)}</td>
                      <td className="p-3 tabular-nums text-amber-700 dark:text-amber-300">{toPersianDigits(reserved)}</td>
                      <td className={`p-3 tabular-nums font-extrabold ${isLow ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {toPersianDigits(avail)}
                      </td>
                      <td className="p-3">
                        {stocktakeMode ? (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={countedMap[variant.id] ?? onHand}
                              onChange={(e) => setCountedMap({ ...countedMap, [variant.id]: Number(e.target.value) })}
                              className="w-20 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyStocktake(product.id, variant.id, onHand)}
                              className="px-2.5 py-1 rounded bg-brand text-white font-bold"
                            >
                              ثبت مغایرت
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                adjustVariantStock(product.id, variant.id, 5, reason, warehouseCode, 'receive', {
                                  warehouseId: selectedWarehouseId,
                                  ...(batchNoInput.trim() ? { batchNo: batchNoInput.trim() } : {}),
                                  ...(expiryDateInput.trim() ? { expiryDate: expiryDateInput.trim() } : {}),
                                })
                              }
                              className="p-1 rounded border border-line dark:border-slate-700 hover:bg-emerald-50"
                              title="+۵ عدد ورود کالا"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                adjustVariantStock(product.id, variant.id, -1, reason, warehouseCode, 'adjust', {
                                  warehouseId: selectedWarehouseId,
                                })
                              }
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

      {tab === 'transfer' && (
        <form
          onSubmit={handleTransferSubmit}
          className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-brand" />
              <span>انتقال بین انبارها (با محافظت از موجودی رزروشده سفارش‌ها)</span>
            </h2>
            {transferSourceLevel && (
              <span className="px-3 py-1 rounded-lg bg-surface dark:bg-slate-800 font-bold tabular-nums">
                قابل انتقال در انبار مبدا: {toPersianDigits(Math.max(0, transferSourceLevel.onHand - transferSourceLevel.reserved))} عدد
                (کل {toPersianDigits(transferSourceLevel.onHand)} · رزرو {toPersianDigits(transferSourceLevel.reserved)})
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="font-bold">محصول</span>
              <select
                value={transferForm.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setTransferForm((f) => ({
                    ...f,
                    productId: e.target.value,
                    variantId: p?.variants[0]?.id ?? '',
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titleFa}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">تنوع (Variant)</span>
              <select
                value={transferForm.variantId}
                onChange={(e) => setTransferForm((f) => ({ ...f, variantId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                {(transferProduct?.variants ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.labelFa} ({v.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">تعداد انتقال</span>
              <input
                type="number"
                min={1}
                required
                value={transferForm.quantity}
                onChange={(e) => setTransferForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">انبار مبدا</span>
              <select
                value={transferForm.fromWarehouseId}
                onChange={(e) => setTransferForm((f) => ({ ...f, fromWarehouseId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nameFa} ({w.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">انبار مقصد</span>
              <select
                value={transferForm.toWarehouseId}
                onChange={(e) => setTransferForm((f) => ({ ...f, toWarehouseId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nameFa} ({w.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">شماره بچ (اختیاری)</span>
              <input
                value={transferForm.batchNo}
                onChange={(e) => setTransferForm((f) => ({ ...f, batchNo: e.target.value }))}
                placeholder="مثلاً LOT-2026-A"
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 md:col-span-3">
              <span className="font-bold">علت انتقال (ثبت در دفترکل و Audit)</span>
              <input
                required
                value={transferForm.reason}
                onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={warehouses.length < 2}
            className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold disabled:opacity-40"
          >
            انجام انتقال اتمیک بین انبارها
          </button>
        </form>
      )}

      {tab === 'fefo' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">مدیریت بچ‌ها و قیمت ویژه نزدیک انقضا (FEFO)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">محصول</th>
                  <th className="py-2 text-right">انبار</th>
                  <th className="py-2 text-right">LOT</th>
                  <th className="py-2 text-right">وضعیت</th>
                  <th className="py-2 text-right">انقضا</th>
                  <th className="py-2 text-right">روز مانده</th>
                  <th className="py-2 text-right">موجودی / رزرو</th>
                  <th className="py-2 text-right">قیمت ویژه حراج FEFO (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {batchRows.map((row) => {
                  const near = row.daysLeft !== null && row.daysLeft <= settings.nearExpiryThresholdDays;
                  const draftPrice = expiryPrices[row.id] ?? row.specialPrice ?? Math.round(row.basePrice * 0.85);
                  return (
                    <tr key={row.id}>
                      <td className="py-2.5 font-bold">{row.productTitleFa} ({row.variantLabelFa})</td>
                      <td className="py-2.5">{row.warehouseCode}</td>
                      <td className="py-2.5 tabular-nums">{row.batchNo}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            row.condition === 'damaged'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}
                        >
                          {row.condition === 'damaged' ? 'آسیب‌دیده (قرنطینه)' : 'سالم'}
                        </span>
                      </td>
                      <td className="py-2.5 tabular-nums">{formatJalaliDate(row.expiresAt)}</td>
                      <td className={`py-2.5 tabular-nums font-bold ${near ? 'text-amber-600' : ''}`}>
                        {row.daysLeft !== null ? `${toPersianDigits(row.daysLeft)} روز` : '—'}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {toPersianDigits(row.qtyOnHand)} (رزرو {toPersianDigits(row.reserved)})
                      </td>
                      <td className="py-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            value={draftPrice}
                            onChange={(e) => setExpiryPrices({ ...expiryPrices, [row.id]: Number(e.target.value) })}
                            className="w-28 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => applyNearExpirySpecialPrice(row.productId, row.variantId, row.id, draftPrice)}
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
          <h2 className="text-base font-extrabold">هشدار کمبود موجودی و پیشنهاد خرید مجدد (Available = OnHand − Reserved)</h2>
          {effectiveAlerts.length === 0 ? (
            <p className="text-ink/60">همه کالاها در انبارها دارای موجودی قابل فروش بالای آستانه هستند.</p>
          ) : (
            <div className="divide-y divide-line dark:divide-slate-800">
              {effectiveAlerts.map((alert) => {
                const suggestedQty = Math.max(10, alert.lowStockThreshold * 4 - alert.available);
                return (
                  <div key={alert.levelId} className="py-3 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <p className="font-bold">
                        {alert.productTitleFa} — {alert.variantLabelFa}{' '}
                        <span className="text-ink/60 font-normal">({alert.warehouseCode})</span>
                      </p>
                      <p className="text-ink/55 tabular-nums">
                        کل: {toPersianDigits(alert.onHand)} · رزرو: {toPersianDigits(alert.reserved)} · قابل فروش:{' '}
                        <strong className="text-rose-600">{toPersianDigits(alert.available)}</strong> · آستانه هشدار:{' '}
                        {toPersianDigits(alert.lowStockThreshold)} · پیشنهاد خرید: {toPersianDigits(suggestedQty)} عدد
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        adjustVariantStock(
                          alert.productId,
                          alert.variantId,
                          suggestedQty,
                          'سفارش مجدد تاییدشده انبار',
                          alert.warehouseCode,
                          'receive',
                          { warehouseId: alert.warehouseId }
                        )
                      }
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
                  <th className="py-2 text-right">بچ / سفارش / وضعیت</th>
                  <th className="py-2 text-right">تغییر</th>
                  <th className="py-2 text-right">شرح / اپراتور</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {stockMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 tabular-nums">{formatJalaliDateTime(m.createdAt)}</td>
                    <td className="py-2 font-bold">{m.productTitleFa} ({m.sku})</td>
                    <td className="py-2">
                      {m.warehouseCode}
                      {m.toWarehouseCode ? ` ← ${m.toWarehouseCode}` : ''}
                    </td>
                    <td className="py-2 font-bold">{m.type}</td>
                    <td className="py-2 text-ink/70 tabular-nums">
                      {[
                        m.batchNo ? `LOT: ${m.batchNo}` : '',
                        m.orderNo ? `سفارش: ${m.orderNo}` : '',
                        m.condition === 'damaged' ? 'آسیب‌دیده' : m.condition === 'resellable' ? 'سالم' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className={`py-2 tabular-nums font-extrabold ${m.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
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
                  <p className="font-bold">
                    {w.nameFa} ({w.code}){w.isDefault ? ' — پیش‌فرض' : ''}
                  </p>
                  <p className="text-ink/55">{w.city} — {w.address}</p>
                </div>
                <button type="button" onClick={() => deleteWarehouse(w.id)} className="text-rose-600 font-bold">
                  حذف
                </button>
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
                <button type="button" onClick={() => deleteSupplier(s.id)} className="text-rose-600 font-bold">
                  حذف
                </button>
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

