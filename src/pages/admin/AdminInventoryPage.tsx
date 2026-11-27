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
import { useI18n } from '../../context/i18n';
import { EmptyState } from '../../components/ui/States';
import { daysUntil } from '../../lib/jalali';
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
  const { t, formatDate, formatDateTime, formatDigits } = useI18n();

  const [tab, setTab] = useState<'stock' | 'transfer' | 'fefo' | 'ledger' | 'reorder' | 'warehouses' | 'requests'>('stock');
  const [reason, setReason] = useState(() => t('adminInventory.defaultReason'));
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
    reason: t('adminInventory.defaultTransferReason'),
  });

  const [newWh, setNewWh] = useState({ code: '', nameFa: '', city: t('common.tehran'), address: '' });
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
      pushToast(t('adminInventory.toasts.reasonRequired'), 'error');
      return;
    }
    if (counted === currentQty) {
      pushToast(t('adminInventory.toasts.noVariance'), 'info');
      return;
    }
    await stocktakeVariantStock({
      productId,
      variantId,
      warehouseId: selectedWarehouseId,
      warehouseCode,
      onHand: counted,
      reason: t('adminInventory.stocktakeReasonPrefix', { reason: reason.trim() }),
    });
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.fromWarehouseId || !transferForm.toWarehouseId) {
      pushToast(t('adminInventory.toasts.selectWarehouses'), 'error');
      return;
    }
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      pushToast(t('adminInventory.toasts.sameWarehouse'), 'error');
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

  const tabs = [
    { id: 'stock' as const, label: t('adminInventory.tabs.stock', { code: selectedWarehouse?.code ?? '' }) },
    { id: 'transfer' as const, label: t('adminInventory.tabs.transfer') },
    { id: 'fefo' as const, label: t('adminInventory.tabs.fefo', { count: formatDigits(batchRows.length) }) },
    { id: 'reorder' as const, label: t('adminInventory.tabs.reorder', { count: formatDigits(effectiveAlerts.length) }) },
    { id: 'ledger' as const, label: t('adminInventory.tabs.ledger', { count: formatDigits(stockMovements.length) }) },
    { id: 'warehouses' as const, label: t('adminInventory.tabs.warehouses') },
    {
      id: 'requests' as const,
      label: t('adminInventory.tabs.requests', { count: formatDigits(stockRequests.length + stockNotifications.length) }),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">{t('adminInventory.title')}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={warehouseCode}
            aria-label={t('adminInventory.warehouseSelectAria')}
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
            aria-label={t('adminInventory.reasonPh')}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('adminInventory.reasonPh')}
            className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 w-full sm:w-56"
          />
          <button
            type="button"
            onClick={() => void refreshInventory()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 font-bold hover:border-brand"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('adminInventory.refreshBtn')}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap pb-1 gap-2 text-xs">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === tb.id ? 'bg-brand text-white' : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs">
            <span className="font-extrabold text-sm">
              {t('adminInventory.stock.header', {
                name: selectedWarehouse?.nameFa ?? t('adminInventory.defaultWarehouseName'),
                code: warehouseCode,
              })}
            </span>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {!stocktakeMode && (
                <>
                  <input
                    value={batchNoInput}
                    aria-label={t('adminInventory.stock.batchNoPh')}
                    onChange={(e) => setBatchNoInput(e.target.value)}
                    placeholder={t('adminInventory.stock.batchNoPh')}
                    className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 w-full sm:w-36"
                  />
                  <input
                    value={expiryDateInput}
                    aria-label={t('adminInventory.stock.expiryPh')}
                    onChange={(e) => setExpiryDateInput(e.target.value)}
                    placeholder={t('adminInventory.stock.expiryPh')}
                    className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 w-full sm:w-36 tabular-nums"
                  />
                </>
              )}
              <label className="inline-flex items-center gap-2 font-bold">
                <input type="checkbox" checked={stocktakeMode} onChange={(e) => setStocktakeMode(e.target.checked)} />
                <span>{t('adminInventory.stock.stocktakeToggle')}</span>
              </label>
            </div>
          </div>
          {variantRows.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('adminInventory.stock.empty')} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface/60 dark:bg-slate-800 text-ink/75 dark:text-slate-300">
                  <tr>
                    <th className="p-3 text-start">{t('adminInventory.stock.colProduct')}</th>
                    <th className="p-3 text-start">SKU</th>
                    <th className="p-3 text-start">{t('adminInventory.stock.colOnHand')}</th>
                    <th className="p-3 text-start">{t('adminInventory.stock.colReserved')}</th>
                    <th className="p-3 text-start">{t('adminInventory.stock.colAvailable')}</th>
                    <th className="p-3 text-start">
                      {stocktakeMode ? t('adminInventory.stock.colStocktake') : t('adminInventory.stock.colQuickAdjust')}
                    </th>
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
                        <td className="p-3 font-bold">
                          {product.titleFa} — {variant.labelFa}
                        </td>
                        <td className="p-3 tabular-nums">{variant.sku}</td>
                        <td className="p-3 tabular-nums">{formatDigits(onHand)}</td>
                        <td className="p-3 tabular-nums text-amber-700 dark:text-amber-300">{formatDigits(reserved)}</td>
                        <td className={`p-3 tabular-nums font-extrabold ${isLow ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {formatDigits(avail)}
                        </td>
                        <td className="p-3">
                          {stocktakeMode ? (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                aria-label={product.titleFa}
                                value={countedMap[variant.id] ?? onHand}
                                onChange={(e) => setCountedMap({ ...countedMap, [variant.id]: Number(e.target.value) })}
                                className="w-20 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyStocktake(product.id, variant.id, onHand)}
                                className="px-2.5 py-1 rounded bg-brand text-white font-bold"
                              >
                                {t('adminInventory.stock.applyVarianceBtn')}
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
                                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded border border-line dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                title={t('adminInventory.stock.plus5Title')}
                                aria-label={t('adminInventory.stock.plus5Title')}
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
                                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded border border-line dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title={t('adminInventory.stock.minus1Title')}
                                aria-label={t('adminInventory.stock.minus1Title')}
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
          )}
        </div>
      )}

      {tab === 'transfer' && (
        <form
          onSubmit={handleTransferSubmit}
          className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>{t('adminInventory.transfer.title')}</span>
            </h2>
            {transferSourceLevel && (
              <span className="px-3 py-1 rounded-lg bg-surface dark:bg-slate-800 font-bold tabular-nums">
                {t('adminInventory.transfer.availableSummary', {
                  avail: formatDigits(Math.max(0, transferSourceLevel.onHand - transferSourceLevel.reserved)),
                  onHand: formatDigits(transferSourceLevel.onHand),
                  reserved: formatDigits(transferSourceLevel.reserved),
                })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="font-bold">{t('adminInventory.transfer.productLabel')}</span>
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
              <span className="font-bold">{t('adminInventory.transfer.variantLabel')}</span>
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
              <span className="font-bold">{t('adminInventory.transfer.qtyLabel')}</span>
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
              <span className="font-bold">{t('adminInventory.transfer.fromLabel')}</span>
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
              <span className="font-bold">{t('adminInventory.transfer.toLabel')}</span>
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
              <span className="font-bold">{t('adminInventory.transfer.batchLabel')}</span>
              <input
                value={transferForm.batchNo}
                onChange={(e) => setTransferForm((f) => ({ ...f, batchNo: e.target.value }))}
                placeholder="LOT-2026-A"
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 md:col-span-3">
              <span className="font-bold">{t('adminInventory.transfer.reasonLabel')}</span>
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
            {t('adminInventory.transfer.submitBtn')}
          </button>
        </form>
      )}

      {tab === 'fefo' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminInventory.fefo.title')}</h2>
          {batchRows.length === 0 ? (
            <EmptyState title={t('adminInventory.fefo.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line dark:border-slate-800 text-ink/70 dark:text-slate-400">
                  <tr>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colProduct')}</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colWarehouse')}</th>
                    <th className="py-2 text-start">LOT</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colCondition')}</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colExpiry')}</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colDaysLeft')}</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colQty')}</th>
                    <th className="py-2 text-start">{t('adminInventory.fefo.colSpecialPrice')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {batchRows.map((row) => {
                    const near = row.daysLeft !== null && row.daysLeft <= settings.nearExpiryThresholdDays;
                    const draftPrice = expiryPrices[row.id] ?? row.specialPrice ?? Math.round(row.basePrice * 0.85);
                    return (
                      <tr key={row.id}>
                        <td className="py-2.5 font-bold">
                          {row.productTitleFa} ({row.variantLabelFa})
                        </td>
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
                            {row.condition === 'damaged'
                              ? t('adminInventory.fefo.conditionDamaged')
                              : t('adminInventory.fefo.conditionHealthy')}
                          </span>
                        </td>
                        <td className="py-2.5 tabular-nums">{formatDate(row.expiresAt)}</td>
                        <td className={`py-2.5 tabular-nums font-bold ${near ? 'text-amber-600' : ''}`}>
                          {row.daysLeft !== null ? t('counts.daysLeft', { count: row.daysLeft }) : '—'}
                        </td>
                        <td className="py-2.5 tabular-nums">
                          {t('adminInventory.fefo.qtyReserved', {
                            qty: formatDigits(row.qtyOnHand),
                            reserved: formatDigits(row.reserved),
                          })}
                        </td>
                        <td className="py-2.5">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              aria-label={row.batchNo}
                              value={draftPrice}
                              onChange={(e) => setExpiryPrices({ ...expiryPrices, [row.id]: Number(e.target.value) })}
                              className="w-28 px-2 py-1 rounded border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() => applyNearExpirySpecialPrice(row.productId, row.variantId, row.id, draftPrice)}
                              className="px-2.5 py-1 rounded bg-amber-600 text-white font-bold"
                            >
                              {t('adminInventory.fefo.applyPriceBtn')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'reorder' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminInventory.reorder.title')}</h2>
          {effectiveAlerts.length === 0 ? (
            <EmptyState title={t('adminInventory.reorder.empty')} />
          ) : (
            <div className="divide-y divide-line dark:divide-slate-800">
              {effectiveAlerts.map((alert) => {
                const suggestedQty = Math.max(10, alert.lowStockThreshold * 4 - alert.available);
                return (
                  <div key={alert.levelId} className="py-3 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <p className="font-bold">
                        {alert.productTitleFa} — {alert.variantLabelFa}{' '}
                        <span className="text-ink/70 dark:text-slate-400 font-normal">({alert.warehouseCode})</span>
                      </p>
                      <p className="text-ink/70 dark:text-slate-400 tabular-nums">
                        {t('adminInventory.reorder.meta', {
                          onHand: formatDigits(alert.onHand),
                          reserved: formatDigits(alert.reserved),
                          avail: formatDigits(alert.available),
                          threshold: formatDigits(alert.lowStockThreshold),
                          suggested: formatDigits(suggestedQty),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        adjustVariantStock(
                          alert.productId,
                          alert.variantId,
                          suggestedQty,
                          t('adminInventory.reorder.receiveReason'),
                          alert.warehouseCode,
                          'receive',
                          { warehouseId: alert.warehouseId }
                        )
                      }
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                    >
                      {t('adminInventory.reorder.receiveBtn', { qty: formatDigits(suggestedQty) })}
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
          <h2 className="text-base font-extrabold">{t('adminInventory.ledger.title')}</h2>
          {stockMovements.length === 0 ? (
            <EmptyState title={t('adminInventory.ledger.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line dark:border-slate-800 text-ink/70 dark:text-slate-400">
                  <tr>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colDate')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colProduct')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colWarehouse')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colType')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colContext')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colDelta')}</th>
                    <th className="py-2 text-start">{t('adminInventory.ledger.colActor')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {stockMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 tabular-nums">{formatDateTime(m.createdAt)}</td>
                      <td className="py-2 font-bold">{m.productTitleFa} ({m.sku})</td>
                      <td className="py-2">
                        {m.warehouseCode}
                        {m.toWarehouseCode ? ` ← ${m.toWarehouseCode}` : ''}
                      </td>
                      <td className="py-2 font-bold">{m.type}</td>
                      <td className="py-2 text-ink/75 dark:text-slate-300 tabular-nums">
                        {[
                          m.batchNo ? `LOT: ${m.batchNo}` : '',
                          m.orderNo ? t('adminInventory.ledger.orderContext', { orderNo: m.orderNo }) : '',
                          m.condition === 'damaged'
                            ? t('adminInventory.fefo.conditionDamaged')
                            : m.condition === 'resellable'
                            ? t('adminInventory.fefo.conditionHealthy')
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className={`py-2 tabular-nums font-extrabold ${m.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.delta > 0 ? `+${formatDigits(m.delta)}` : formatDigits(m.delta)}
                      </td>
                      <td className="py-2">{m.reason} ({m.actorEmail})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <WarehouseIcon className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>{t('adminInventory.warehouses.title')}</span>
            </h2>
            {warehouses.map((w) => (
              <div key={w.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">
                    {w.nameFa} ({w.code}){w.isDefault ? ` — ${t('adminInventory.warehouses.defaultTag')}` : ''}
                  </p>
                  <p className="text-ink/70 dark:text-slate-400">{w.city} — {w.address}</p>
                </div>
                <button type="button" onClick={() => deleteWarehouse(w.id)} className="text-rose-600 dark:text-rose-400 font-bold">
                  {t('actions.delete')}
                </button>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={newWh.code}
                onChange={(e) => setNewWh({ ...newWh, code: e.target.value })}
                placeholder={t('adminInventory.warehouses.codePh')}
                aria-label={t('adminInventory.warehouses.codePh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                value={newWh.nameFa}
                onChange={(e) => setNewWh({ ...newWh, nameFa: e.target.value })}
                placeholder={t('adminInventory.warehouses.namePh')}
                aria-label={t('adminInventory.warehouses.namePh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                value={newWh.city}
                onChange={(e) => setNewWh({ ...newWh, city: e.target.value })}
                placeholder={t('adminInventory.warehouses.cityPh')}
                aria-label={t('adminInventory.warehouses.cityPh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                value={newWh.address}
                onChange={(e) => setNewWh({ ...newWh, address: e.target.value })}
                placeholder={t('adminInventory.warehouses.addressPh')}
                aria-label={t('adminInventory.warehouses.addressPh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newWh.code || !newWh.nameFa) return;
                  await upsertWarehouse({ id: `wh_${Date.now()}`, ...newWh, isActive: true });
                  setNewWh({ code: '', nameFa: '', city: t('common.tehran'), address: '' });
                }}
                className="sm:col-span-2 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminInventory.warehouses.addBtn')}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>{t('adminInventory.suppliers.title')}</span>
            </h2>
            {suppliers.map((s) => (
              <div key={s.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{s.nameFa}</p>
                  <p className="text-ink/70 dark:text-slate-400">
                    {t('adminInventory.suppliers.meta', {
                      contact: s.contactName,
                      phone: s.phone,
                      days: formatDigits(s.leadTimeDays),
                    })}
                  </p>
                </div>
                <button type="button" onClick={() => deleteSupplier(s.id)} className="text-rose-600 dark:text-rose-400 font-bold">
                  {t('actions.delete')}
                </button>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={newSup.nameFa}
                onChange={(e) => setNewSup({ ...newSup, nameFa: e.target.value })}
                placeholder={t('adminInventory.suppliers.namePh')}
                aria-label={t('adminInventory.suppliers.namePh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                value={newSup.contactName}
                onChange={(e) => setNewSup({ ...newSup, contactName: e.target.value })}
                placeholder={t('adminInventory.suppliers.contactPh')}
                aria-label={t('adminInventory.suppliers.contactPh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                value={newSup.phone}
                onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })}
                placeholder={t('adminInventory.suppliers.phonePh')}
                aria-label={t('adminInventory.suppliers.phonePh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                value={newSup.leadTimeDays}
                onChange={(e) => setNewSup({ ...newSup, leadTimeDays: Number(e.target.value) })}
                placeholder={t('adminInventory.suppliers.leadTimePh')}
                aria-label={t('adminInventory.suppliers.leadTimePh')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newSup.nameFa) return;
                  await upsertSupplier({ id: `sup_${Date.now()}`, ...newSup, brandIds: [], isActive: true });
                  setNewSup({ nameFa: '', contactName: '', phone: '', leadTimeDays: 5 });
                }}
                className="sm:col-span-2 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminInventory.suppliers.addBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">{t('adminInventory.requests.sourcingTitle')}</h2>
            {stockRequests.length === 0 ? (
              <EmptyState title={t('adminInventory.requests.sourcingEmpty')} />
            ) : (
              stockRequests.map((sr) => (
                <div key={sr.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <p className="font-bold">
                      {sr.titleText} {sr.brandText ? `(${sr.brandText})` : ''}
                    </p>
                    <p className="text-ink/70 dark:text-slate-400">
                      {sr.contactName} · {sr.mobile}
                    </p>
                  </div>
                  <select
                    value={sr.status}
                    aria-label={sr.titleText}
                    onChange={(e) => updateStockRequestStatus(sr.id, e.target.value as typeof sr.status)}
                    className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="new">{t('adminInventory.requests.statusNew')}</option>
                    <option value="in_review">{t('adminInventory.requests.statusReview')}</option>
                    <option value="sourcing">{t('adminInventory.requests.statusSourcing')}</option>
                    <option value="available">{t('adminInventory.requests.statusAvailable')}</option>
                    <option value="closed">{t('adminInventory.requests.statusClosed')}</option>
                  </select>
                </div>
              ))
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <BellRing className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>{t('adminInventory.requests.alertsTitle')}</span>
            </h2>
            {stockNotifications.length === 0 ? (
              <EmptyState title={t('adminInventory.requests.alertsEmpty')} />
            ) : (
              stockNotifications.map((sn) => (
                <div key={sn.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center gap-2">
                  <div>
                    <p className="font-bold">{sn.productTitleFa}</p>
                    <p className="text-ink/70 dark:text-slate-400 tabular-nums">
                      {sn.mobile} · {formatDateTime(sn.createdAt)}
                    </p>
                  </div>
                  {sn.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => markStockNotificationSent(sn.id)}
                      className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                    >
                      {t('adminInventory.requests.sendSmsBtn')}
                    </button>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {t('adminInventory.requests.notifiedLabel')}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminInventoryPage;
