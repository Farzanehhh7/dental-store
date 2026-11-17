import React, { useMemo, useState } from 'react';
import {
  Ban,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileText,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  UserCheck,
  Warehouse as WarehouseIcon,
  X,
  XCircle,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { daysUntil, formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { getVariantAvailableStock, resolveVariantPrice } from '../../lib/pricing';
import {
  CustomerGroupCode,
  InvoiceRecord,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  ProformaInvoice,
  UserProfile,
} from '../../types/domain';

export function AdminInventoryPage() {
  const {
    products,
    warehouses,
    suppliers,
    stockMovements,
    stockRequests,
    stockNotifications,
    settings,
    currency,
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

export function AdminSalesPage() {
  const {
    orders,
    invoices,
    paymentLedger,
    returns,
    proformas,
    paymentPlans,
    products,
    campaigns,
    cart,
    settings,
    currency,
    updateOrderStatus,
    createManualOrder,
    issueInvoice,
    voidInvoice,
    recordPaymentEntry,
    updateReturnStatus,
    upsertProformaAdmin,
    convertProformaToOrder,
    updatePaymentPlanStatus,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<'orders' | 'invoices' | 'proformas' | 'payments' | 'returns' | 'credit' | 'carts'>('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<InvoiceRecord | null>(null);

  const [manualForm, setManualForm] = useState({
    customerName: '',
    customerMobile: '',
    customerGroup: 'clinic' as CustomerGroupCode,
    paymentMethod: 'bank_transfer' as PaymentMethod,
    productId: products[0]?.id ?? '',
    qty: 2,
    city: 'تهران',
    addressLine: 'خیابان مطهری، کلینیک تخصصی',
  });

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = products.find((x) => x.id === manualForm.productId);
    const v = p?.variants[0];
    if (!p || !v) return;
    const res = resolveVariantPrice(p, v, { customerGroup: manualForm.customerGroup, quantity: manualForm.qty, campaigns, settings });
    const unitPrice = res.unitPrice ?? v.basePrice ?? 1000000;
    const item: OrderItem = {
      productId: p.id,
      variantId: v.id,
      sku: v.sku,
      titleFa: p.titleFa,
      variantLabelFa: v.labelFa,
      quantity: manualForm.qty,
      unitPrice,
      discountAmount: 0,
      lineTotal: unitPrice * manualForm.qty,
      priceSource: res.priceSource,
    };
    await createManualOrder({
      customerName: manualForm.customerName,
      customerMobile: manualForm.customerMobile,
      customerGroup: manualForm.customerGroup,
      paymentMethod: manualForm.paymentMethod,
      shippingMethod: 'پیک ویژه تلفنی',
      shippingTotal: 0,
      address: { province: 'تهران', city: manualForm.city, postalCode: '۱۴۱۷۹۳۳۱۱۱', addressLine: manualForm.addressLine },
      items: [item],
      customerNote: 'ثبت‌شده توسط واحد فروش تلفنی',
    });
    setManualOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">مرکز فروش، فاکتورها، مرجوعی و اعتبار B2B</h1>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          + ثبت سفارش دستی / تلفنی
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'orders', label: `سفارش‌ها (${toPersianDigits(orders.length)})` },
          { id: 'invoices', label: `فاکتورهای رسمی (${toPersianDigits(invoices.length)})` },
          { id: 'proformas', label: `پیش‌فاکتورها (${toPersianDigits(proformas.length)})` },
          { id: 'payments', label: `دفترکل پرداخت‌ها (${toPersianDigits(paymentLedger.length)})` },
          { id: 'returns', label: `مرجوعی RMA (${toPersianDigits(returns.length)})` },
          { id: 'credit', label: `اعتبار و اقساط (${toPersianDigits(paymentPlans.length)})` },
          { id: 'carts', label: 'سبدهای رهاشده' },
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

      {tab === 'orders' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 dark:bg-slate-800 text-ink/70">
                <tr>
                  <th className="p-3 text-right">شماره سفارش</th>
                  <th className="p-3 text-right">مشتری / گروه</th>
                  <th className="p-3 text-right">روش پرداخت</th>
                  <th className="p-3 text-right">جمع کل</th>
                  <th className="p-3 text-right">وضعیت</th>
                  <th className="p-3 text-right">اقدام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3 font-extrabold tabular-nums">{o.orderNo}</td>
                    <td className="p-3">{o.customerName} ({o.customerGroup})</td>
                    <td className="p-3">{o.paymentMethod}</td>
                    <td className="p-3 tabular-nums font-bold text-brand">{formatMoney(o.grandTotal, currency)}</td>
                    <td className="p-3 font-bold">{o.status}</td>
                    <td className="p-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrder(o);
                          setTrackingInput(o.trackingCode ?? '');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-brand text-brand font-bold"
                      >
                        تغییر وضعیت
                      </button>
                      <button
                        type="button"
                        onClick={() => issueInvoice(o.id, true)}
                        className="px-2.5 py-1 rounded-lg border border-line dark:border-slate-700 font-bold"
                      >
                        صدور فاکتور
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand" />
            <span>فاکتورهای رسمی مالیاتی و فروش</span>
          </h2>
          {invoices.map((inv) => (
            <div key={inv.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-extrabold tabular-nums">{inv.invoiceNo} (سفارش {inv.orderNo}) — {inv.customerName}</p>
                <p className="text-ink/55 tabular-nums">
                  جمع کل: {formatMoney(inv.grandTotal, currency)} · مالیات: {formatMoney(inv.taxTotal, currency)} · وضعیت: {inv.status === 'issued' ? 'صادرشده' : 'باطل‌شده'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPrintInvoice(inv)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line font-bold">
                  <Printer className="w-3.5 h-3.5" /> چاپ
                </button>
                {inv.status === 'issued' && (
                  <button type="button" onClick={() => voidInvoice(inv.id)} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold">
                    ابطال فاکتور
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'proformas' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">پیش‌فاکتورهای رسمی کلینیک‌ها</h2>
          {proformas.map((pf) => (
            <div key={pf.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-extrabold tabular-nums">{pf.proformaNo} — {pf.contactName} {pf.clinicName ? `(${pf.clinicName})` : ''}</p>
                <p className="text-ink/55 tabular-nums">مبلغ: {formatMoney(pf.grandTotal, currency)} · وضعیت: {pf.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/proforma/${pf.shareToken || pf.id}`;
                    navigator.clipboard?.writeText(url);
                    pushToast('لینک اشتراک‌گذاری پیش‌فاکتور کپی شد.', 'success');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line font-bold"
                >
                  <Copy className="w-3.5 h-3.5" /> کپی لینک عمومی
                </button>
                {pf.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => upsertProformaAdmin({ ...pf, status: 'sent' } as ProformaInvoice)}
                    className="px-3 py-1.5 rounded-lg border border-brand text-brand font-bold"
                  >
                    ارسال برای مشتری
                  </button>
                )}
                {pf.status !== 'converted' && (
                  <button
                    type="button"
                    onClick={() => convertProformaToOrder(pf.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-brand text-white font-bold"
                  >
                    تبدیل به سفارش قطعی
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">دفترکل تراکنش‌ها و واریزی‌های بانکی</h2>
            {orders[0] && (
              <button
                type="button"
                onClick={() =>
                  recordPaymentEntry({
                    id: `pay_${Date.now()}`,
                    orderId: orders[0].id,
                    orderNo: orders[0].orderNo,
                    gateway: 'فیش واریز شبا',
                    amount: orders[0].grandTotal,
                    idempotencyKey: `ADMIN-${Date.now()}`,
                    refId: String(Math.floor(10000000 + Math.random() * 89999999)),
                    status: 'verified',
                    createdAt: new Date().toISOString(),
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
              >
                + ثبت سند واریز بانکی (نمونه)
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">سفارش</th>
                  <th className="py-2 text-right">درگاه / روش</th>
                  <th className="py-2 text-right">کد پیگیری</th>
                  <th className="py-2 text-right">مبلغ</th>
                  <th className="py-2 text-right">وضعیت</th>
                  <th className="py-2 text-right">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {paymentLedger.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-bold tabular-nums">{p.orderNo}</td>
                    <td className="py-2">{p.gateway}</td>
                    <td className="py-2 font-mono">{p.refId}</td>
                    <td className="py-2 tabular-nums font-bold">{formatMoney(p.amount, currency)}</td>
                    <td className="py-2">{p.status}</td>
                    <td className="py-2 tabular-nums">{formatJalaliDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'returns' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-brand" />
            <span>پرونده‌های مرجوعی و استرداد وجه (RMA)</span>
          </h2>
          {returns.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-extrabold tabular-nums">{r.returnNo} (سفارش {r.orderNo}) — {r.customerName}</p>
                <p className="text-ink/60">{r.reasonFa} · مبلغ: {formatMoney(r.refundAmount, currency)}</p>
              </div>
              <select
                value={r.status}
                onChange={(e) => updateReturnStatus(r.id, e.target.value as typeof r.status)}
                className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="requested">درخواست‌شده</option>
                <option value="approved">تاییدشده برای عودت</option>
                <option value="received">تحویل به انبار</option>
                <option value="refunded">عودت وجه انجام شد</option>
                <option value="rejected">رد شده</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {tab === 'credit' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">پرونده‌های درخواست اعتبار، چک صیادی و اقساط</h2>
          {paymentPlans.map((pl) => (
            <div key={pl.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-bold">{pl.customerName} · نوع: {pl.type} · {toPersianDigits(pl.installmentsCount)} قسط</p>
                <p className="text-ink/60">{pl.proposedTermsFa} · مبلغ: {formatMoney(pl.requestedAmount, currency)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-brand">{pl.status}</span>
                {pl.status !== 'approved' && pl.status !== 'rejected' && (
                  <>
                    <button type="button" onClick={() => updatePaymentPlanStatus(pl.id, 'approved', 'تایید شد')} className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold">
                      تایید
                    </button>
                    <button type="button" onClick={() => updatePaymentPlanStatus(pl.id, 'rejected', 'نیازمند تضمین بیشتر')} className="px-3 py-1 rounded-lg border border-rose-300 text-rose-700 font-bold">
                      رد
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'carts' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">سبدهای خرید فعال / رهاشده</h2>
          {cart.length === 0 ? (
            <p className="text-ink/60">در نشست فعلی سبد خرید رهاشده‌ای ثبت نشده است.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((ci) => {
                const p = products.find((x) => x.id === ci.productId);
                return (
                  <div key={ci.variantId} className="p-3 rounded-xl border border-line flex justify-between items-center">
                    <span>{p?.titleFa ?? ci.productId} — {toPersianDigits(ci.quantity)} عدد</span>
                    <button type="button" onClick={() => pushToast('پیامک یادآوری سبد خرید ارسال شد (Sandbox).', 'info')} className="px-3 py-1 rounded bg-brand text-white font-bold">
                      ارسال یادآور
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Order Detail Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs">
            <h2 className="text-base font-extrabold tabular-nums">سفارش {selectedOrder.orderNo}</h2>
            <p>مشتری: {selectedOrder.customerName} ({selectedOrder.customerMobile})</p>
            <p>نشانی: {selectedOrder.shippingAddress.province}، {selectedOrder.shippingAddress.city} — {selectedOrder.shippingAddress.addressLine}</p>
            <label className="block space-y-1">
              <span className="font-bold">کد رهگیری مرسوله</span>
              <input
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="کد رهگیری پست یا تیپاکس..."
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed', 'cancelled'] as OrderStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={async () => {
                    await updateOrderStatus(selectedOrder.id, st, trackingInput || undefined);
                    setSelectedOrder(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold border ${
                    selectedOrder.status === st ? 'bg-brand text-white border-brand' : 'border-line dark:border-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setSelectedOrder(null)} className="px-4 py-2 rounded-lg border border-line font-bold">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order Modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleManualCreate} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">ثبت سفارش تلفنی / دستی</h2>
            <div className="grid grid-cols-2 gap-2">
              <input required value={manualForm.customerName} onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })} placeholder="نام مشتری / کلینیک" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input required value={manualForm.customerMobile} onChange={(e) => setManualForm({ ...manualForm, customerMobile: e.target.value })} placeholder="موبایل (0912...)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <select value={manualForm.customerGroup} onChange={(e) => setManualForm({ ...manualForm, customerGroup: e.target.value as CustomerGroupCode })} className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800">
                <option value="clinic">کلینیک</option>
                <option value="dentist">دندانپزشک</option>
                <option value="retail">عادی</option>
                <option value="wholesale">عمده</option>
              </select>
              <input type="number" min={1} value={manualForm.qty} onChange={(e) => setManualForm({ ...manualForm, qty: Number(e.target.value) })} placeholder="تعداد" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <select value={manualForm.productId} onChange={(e) => setManualForm({ ...manualForm, productId: e.target.value })} className="col-span-2 px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800">
                {products.map((p) => <option key={p.id} value={p.id}>{p.titleFa}</option>)}
              </select>
              <input value={manualForm.addressLine} onChange={(e) => setManualForm({ ...manualForm, addressLine: e.target.value })} placeholder="نشانی ارسال" className="col-span-2 px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setManualOpen(false)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ثبت سفارش</button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Invoice Preview */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <div className="flex justify-between border-b pb-3">
              <div>
                <h2 className="font-extrabold text-base">فاکتور رسمی فروش کالا و خدمات</h2>
                <p>شماره فاکتور: {printInvoice.invoiceNo}</p>
              </div>
              <button type="button" onClick={() => setPrintInvoice(null)}><X className="w-5 h-5" /></button>
            </div>
            <p>خریدار: {printInvoice.customerName}</p>
            <p>شناسه ملی: {printInvoice.nationalId || '—'} · کد اقتصادی: {printInvoice.economicCode || '—'}</p>
            <div className="p-3 bg-slate-50 rounded-xl space-y-1 tabular-nums">
              <p>جمع اقلام: {formatMoney(printInvoice.subtotal, currency)}</p>
              <p>مالیات ارزش افزوده: {formatMoney(printInvoice.taxTotal, currency)}</p>
              <p className="font-extrabold text-brand">جمع نهایی قابل پرداخت: {formatMoney(printInvoice.grandTotal, currency)}</p>
            </div>
            <button type="button" onClick={() => window.print()} className="w-full py-2 rounded-xl bg-brand text-white font-bold">
              چاپ فاکتور رسمی
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminCustomersSupportPage({ mode }: { mode: 'customers' | 'support' }) {
  const {
    usersList,
    orders,
    b2bVerifications,
    tickets,
    consultationRequests,
    reviews,
    questions,
    products,
    currency,
    reviewB2BVerification,
    updateUserAdmin,
    replyTicket,
    updateConsultationStatus,
    moderateReview,
    answerQuestion,
  } = useStore();

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  if (mode === 'customers') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-extrabold">مدیریت مشتریان، تعرفه‌های B2B و تایید صلاحیت پزشکی</h1>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">صف درخواست‌های احراز هویت حرفه‌ای B2B</h2>
          <div className="space-y-2 text-xs">
            {b2bVerifications.map((v) => (
              <div key={v.id} className="p-4 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                <div className="space-y-1">
                  <p className="font-bold text-sm">{v.applicantName} — {v.clinicName}</p>
                  <p className="text-ink/60 tabular-nums">
                    گروه درخواستی: {v.requestedGroup} · نظام پزشکی: {v.medicalCouncilNo} · موبایل: {v.mobile}
                  </p>
                  {v.attachmentPreview && (
                    <img src={v.attachmentPreview} alt={v.attachmentName || 'مدرک'} className="h-16 rounded border border-line mt-1" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand">{v.status}</span>
                  {v.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => reviewB2BVerification(v.id, 'approved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                      >
                        تایید و ارتقای گروه
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewB2BVerification(v.id, 'rejected', 'مدارک ناخوانا است')}
                        className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                      >
                        رد
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-extrabold">فهرست مشتریان و پرونده کاربری ({toPersianDigits(usersList.length)})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">نام</th>
                  <th className="py-2 text-right">ایمیل / موبایل</th>
                  <th className="py-2 text-right">گروه تعرفه</th>
                  <th className="py-2 text-right">وضعیت</th>
                  <th className="py-2 text-right">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {usersList.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-2.5 font-bold">{u.displayName || 'کاربر'}</td>
                    <td className="py-2.5">{u.email} {u.mobile ? `· ${u.mobile}` : ''}</td>
                    <td className="py-2.5 font-bold text-brand">{u.customerGroup}</td>
                    <td className="py-2.5">{u.isBlocked ? 'مسدود' : u.b2bStatus}</td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className="px-2.5 py-1 rounded border border-brand text-brand font-bold"
                      >
                        پرونده / تغییر گروه
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedUser && (
          <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-brand" />
                  <span>پرونده مشتری: {selectedUser.displayName || selectedUser.email}</span>
                </h2>
                <button type="button" onClick={() => setSelectedUser(null)}><X className="w-5 h-5" /></button>
              </div>
              <p>موبایل: {selectedUser.mobile || '—'} · کلینیک: {selectedUser.clinicName || '—'}</p>
              <p>تعداد سفارش‌ها: {toPersianDigits(orders.filter((o) => o.userId === selectedUser.uid).length)} · مجموع خرید: {formatMoney(orders.filter((o) => o.userId === selectedUser.uid).reduce((s, o) => s + o.grandTotal, 0), currency)}</p>
              <label className="block space-y-1">
                <span className="font-bold">تغییر گروه قیمتی:</span>
                <select
                  value={selectedUser.customerGroup}
                  onChange={async (e) => {
                    const g = e.target.value as CustomerGroupCode;
                    await updateUserAdmin(selectedUser.uid, { customerGroup: g });
                    setSelectedUser({ ...selectedUser, customerGroup: g });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800 font-bold"
                >
                  <option value="retail">retail (عادی)</option>
                  <option value="dentist">dentist (دندانپزشک)</option>
                  <option value="clinic">clinic (کلینیک)</option>
                  <option value="lab">lab (لابراتوار)</option>
                  <option value="student">student (دانشجو)</option>
                  <option value="agent">agent (نماینده)</option>
                  <option value="wholesale">wholesale (عمده)</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const nextBlocked = !selectedUser.isBlocked;
                    await updateUserAdmin(selectedUser.uid, { isBlocked: nextBlocked });
                    setSelectedUser({ ...selectedUser, isBlocked: nextBlocked });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 font-bold"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{selectedUser.isBlocked ? 'رفع مسدودیت' : 'مسدود کردن کاربر'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateUserAdmin(selectedUser.uid, {
                      displayName: 'کاربر ناشناس (GDPR)',
                      mobile: '00000000000',
                      email: `anonymized-${selectedUser.uid.slice(0, 6)}@deleted.local`,
                      isBlocked: true,
                    });
                    setSelectedUser(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                >
                  ناشناس‌سازی GDPR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">پشتیبانی، مشاوره تجهیزات، نظرات و پرسش‌ها</h1>

      {/* Tickets */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">تیکت‌های مشتریان</h2>
        <div className="space-y-3">
          {tickets.map((tk) => (
            <div key={tk.id} className="p-4 rounded-xl border border-line dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between font-bold">
                <span>{tk.subject} ({tk.department})</span>
                <span className="tabular-nums text-brand">{tk.ticketNo} · {tk.status}</span>
              </div>
              {tk.messages.map((m, idx) => (
                <p key={idx} className="p-2 rounded bg-surface/60 dark:bg-slate-800">
                  <strong>{m.authorName}:</strong> {m.body} <span className="text-[10px] text-ink/45">({formatJalaliDateTime(m.createdAt)})</span>
                </p>
              ))}
              <div className="flex gap-2">
                <input
                  value={replyTexts[tk.id] ?? ''}
                  onChange={(e) => setReplyTexts({ ...replyTexts, [tk.id]: e.target.value })}
                  placeholder="پاسخ کارشناس پشتیبانی..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const txt = (replyTexts[tk.id] ?? '').trim();
                    if (!txt) return;
                    await replyTicket(tk.id, txt, true);
                    setReplyTexts({ ...replyTexts, [tk.id]: '' });
                  }}
                  className="px-4 py-1.5 rounded-lg bg-brand text-white font-bold"
                >
                  ارسال پاسخ
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consultations */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-extrabold">درخواست‌های مشاوره تجهیزات کلینیک</h2>
        <div className="space-y-2 text-xs">
          {consultationRequests.map((c) => (
            <div key={c.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-bold">{c.name} ({c.clinicName ?? 'کلینیک'}) · {c.mobile}</p>
                <p className="text-ink/60">{c.productName ?? 'تجهیزات مطب'} — {c.message}</p>
              </div>
              <select
                value={c.status}
                onChange={(e) => updateConsultationStatus(c.id, e.target.value as typeof c.status)}
                className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="new">جدید</option>
                <option value="contacted">تماس گرفته شد</option>
                <option value="quoted">پیش‌فاکتور ارسال شد</option>
                <option value="won">تبدیل به فروش</option>
                <option value="lost">بایگانی</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews & Q&A */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">مدیریت دیدگاه‌های محصولات</h2>
          {reviews.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-line dark:border-slate-800 space-y-2">
              <div className="flex justify-between font-bold">
                <span>{r.authorName} · امتیاز {toPersianDigits(r.rating)}</span>
                <span className="text-brand">{r.status}</span>
              </div>
              <p className="text-ink/75 dark:text-slate-300">{r.body}</p>
              {r.status !== 'approved' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => moderateReview(r.id, 'approved')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> تایید انتشار
                  </button>
                  <button type="button" onClick={() => moderateReview(r.id, 'rejected')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-300 text-rose-700 font-bold">
                    <XCircle className="w-3.5 h-3.5" /> رد
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">پرسش و پاسخ تخصصی محصولات</h2>
          {questions.map((q) => {
            const p = products.find((x) => x.id === q.productId);
            return (
              <div key={q.id} className="p-3 rounded-xl border border-line dark:border-slate-800 space-y-2">
                <p className="font-bold text-brand">{p?.titleFa}</p>
                <p>{q.authorName}: {q.body}</p>
                {q.answerBody ? (
                  <p className="p-2 rounded bg-surface/60 dark:bg-slate-800">پاسخ: {q.answerBody}</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={answerTexts[q.id] ?? ''}
                      onChange={(e) => setAnswerTexts({ ...answerTexts, [q.id]: e.target.value })}
                      placeholder="پاسخ کارشناس..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const ans = (answerTexts[q.id] ?? '').trim();
                        if (!ans) return;
                        await answerQuestion(q.id, ans);
                        setAnswerTexts({ ...answerTexts, [q.id]: '' });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                    >
                      ثبت و انتشار
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
