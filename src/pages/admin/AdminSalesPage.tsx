import React, { useState } from 'react';
import {
  Copy,
  FileText,
  Handshake,
  Printer,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { resolveVariantPrice } from '../../lib/pricing';
import {
  CustomerGroupCode,
  InvoiceRecord,
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  ProformaInvoice,
} from '../../types/domain';

const SOURCE_LABELS: Record<OrderSource, string> = {
  google: 'کاربر گوگل',
  otp: 'کاربر موبایلی (OTP)',
  guest: 'مهمان',
  admin_manual: 'ثبت دستی/تلفنی',
  proforma: 'تبدیل از پیش‌فاکتور',
};

export function AdminSalesPage() {
  const {
    orders,
    adminOrdersMeta,
    adminOrdersLoading,
    fetchAdminOrders,
    invoices,
    paymentLedger,
    returns,
    warehouses,
    proformas,
    rfqs,
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
    processReturnAdmin,
    upsertProformaAdmin,
    convertProformaToOrder,
    sendRfqMessage,
    quoteRfq,
    convertRfqToProforma,
    updatePaymentPlanStatus,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<'orders' | 'rfqs' | 'invoices' | 'proformas' | 'payments' | 'returns' | 'credit' | 'carts'>('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<InvoiceRecord | null>(null);

  const [orderFilters, setOrderFilters] = useState<{
    q: string;
    status: OrderStatus | '';
    source: OrderSource | '';
    fromDate: string;
    toDate: string;
  }>({
    q: '',
    status: '',
    source: '',
    fromDate: '',
    toDate: '',
  });

  const [rfqQuoteDraft, setRfqQuoteDraft] = useState<Record<string, { price: string; days: string; note: string }>>({});
  const [rfqReplyDraft, setRfqReplyDraft] = useState<Record<string, string>>({});
  const [returnDrafts, setReturnDrafts] = useState<
    Record<string, { condition: 'resellable' | 'damaged'; warehouseId: string; batchNo: string; adminNote: string }>
  >({});

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
        <h1 className="text-xl font-extrabold">مرکز فروش، استعلام قیمت (RFQ)، فاکتورها و اعتبار B2B</h1>
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
          { id: 'rfqs', label: `استعلام قیمت (RFQ) (${toPersianDigits(rfqs.length)})` },
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
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void fetchAdminOrders({ ...orderFilters, page: 1 });
            }}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs"
          >
            <input
              value={orderFilters.q}
              onChange={(e) => setOrderFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="جستجو شماره سفارش، نام یا موبایل..."
              className="lg:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={orderFilters.status}
              onChange={(e) => setOrderFilters((f) => ({ ...f, status: e.target.value as OrderStatus | '' }))}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="pending_payment">در انتظار پرداخت</option>
              <option value="awaiting_review">در انتظار بررسی اعتبار</option>
              <option value="payment_failed">پرداخت ناموفق</option>
              <option value="paid">پرداخت‌شده</option>
              <option value="processing">در حال پردازش</option>
              <option value="packed">بسته‌بندی‌شده</option>
              <option value="shipped">ارسال‌شده</option>
              <option value="delivered">تحویل‌شده</option>
              <option value="completed">تکمیل‌شده</option>
              <option value="cancelled">لغوشده</option>
              <option value="expired">منقضی‌شده</option>
              <option value="refunded">مستردشده</option>
            </select>
            <select
              value={orderFilters.source}
              onChange={(e) => setOrderFilters((f) => ({ ...f, source: e.target.value as OrderSource | '' }))}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">همه مبادی ثبت</option>
              <option value="google">کاربر گوگل</option>
              <option value="otp">کاربر موبایلی (OTP)</option>
              <option value="guest">مهمان</option>
              <option value="admin_manual">ثبت دستی/تلفنی</option>
            </select>
            <input
              value={orderFilters.fromDate}
              onChange={(e) => setOrderFilters((f) => ({ ...f, fromDate: e.target.value }))}
              placeholder="از تاریخ جلالی (مثلاً 1405/01/01)"
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
            />
            <div className="flex gap-2">
              <input
                value={orderFilters.toDate}
                onChange={(e) => setOrderFilters((f) => ({ ...f, toDate: e.target.value }))}
                placeholder="تا تاریخ جلالی"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
              />
              <button
                type="submit"
                disabled={adminOrdersLoading}
                className="px-4 py-2 rounded-lg bg-brand text-white font-bold shrink-0 disabled:opacity-50"
              >
                اعمال
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface/60 dark:bg-slate-800 text-ink/70">
                  <tr>
                    <th className="p-3 text-right">شماره سفارش</th>
                    <th className="p-3 text-right">مشتری / گروه</th>
                    <th className="p-3 text-right">مبدا ثبت</th>
                    <th className="p-3 text-right">روش پرداخت</th>
                    <th className="p-3 text-right">جمع کل</th>
                    <th className="p-3 text-right">وضعیت</th>
                    <th className="p-3 text-right">اقدام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-ink/55">
                        {adminOrdersLoading ? 'در حال بارگذاری سفارش‌ها...' : 'سفارشی با فیلتر فعلی یافت نشد.'}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td className="p-3 font-extrabold tabular-nums">
                          <div>{o.orderNo}</div>
                          <div className="text-[10px] font-normal text-ink/50">{formatJalaliDateTime(o.createdAt)}</div>
                        </td>
                        <td className="p-3">
                          <div>{o.customerName} ({o.customerGroup})</div>
                          <div className="text-[10px] text-ink/50 tabular-nums">{o.customerMobile}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-surface dark:bg-slate-800 font-medium">
                            {o.source ? SOURCE_LABELS[o.source] ?? o.source : o.isGuest ? 'مهمان' : 'کاربر'}
                          </span>
                        </td>
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
                            مدیریت وضعیت
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
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-ink/60 tabular-nums">
                مجموع: {toPersianDigits(adminOrdersMeta.total)} سفارش · صفحه {toPersianDigits(adminOrdersMeta.page)} از {toPersianDigits(adminOrdersMeta.totalPages)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={adminOrdersMeta.page <= 1 || adminOrdersLoading}
                  onClick={() => void fetchAdminOrders({ page: adminOrdersMeta.page - 1 })}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  صفحه قبل
                </button>
                <button
                  type="button"
                  disabled={adminOrdersMeta.page >= adminOrdersMeta.totalPages || adminOrdersLoading}
                  onClick={() => void fetchAdminOrders({ page: adminOrdersMeta.page + 1 })}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  صفحه بعد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'rfqs' && (
        <div className="space-y-4 text-xs">
          {rfqs.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center text-ink/60">
              درخواست استعلام قیمتی (RFQ) هنوز ثبت نشده است.
            </div>
          ) : (
            rfqs.map((rfq) => {
              const draft = rfqQuoteDraft[rfq.id] ?? {
                price: String(rfq.quotedUnitPrice ?? rfq.targetUnitPrice ?? ''),
                days: '7',
                note: '',
              };
              return (
                <div key={rfq.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap justify-between items-start gap-3 border-b border-line dark:border-slate-800 pb-3">
                    <div>
                      <h2 className="text-sm font-extrabold flex items-center gap-2 tabular-nums">
                        <Handshake className="w-4 h-4 text-brand" />
                        <span>{rfq.rfqNo} — {rfq.productTitleFa}</span>
                      </h2>
                      <p className="text-ink/60 mt-1 tabular-nums">
                        خریدار: <strong>{rfq.customerName}</strong> {rfq.clinicName ? `(${rfq.clinicName})` : ''} · موبایل: {rfq.customerMobile} · تعداد: {toPersianDigits(rfq.quantity)}
                        {rfq.targetUnitPrice ? ` · قیمت هدف مشتری: ${formatMoney(rfq.targetUnitPrice, currency)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand font-bold">{rfq.status}</span>
                      {rfq.status !== 'converted' && rfq.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => convertRfqToProforma(rfq.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          تبدیل به پیش‌فاکتور
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Conversation History */}
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {rfq.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded-xl ${m.isStaff ? 'bg-brand/10 border border-brand/20' : 'bg-surface/60 dark:bg-slate-800'}`}
                      >
                        <div className="flex justify-between text-[10px] text-ink/55">
                          <span className="font-bold">{m.authorName}</span>
                          <span className="tabular-nums">{formatJalaliDateTime(m.createdAt)}</span>
                        </div>
                        <p className="mt-0.5">{m.body}</p>
                        {m.proposedUnitPrice ? (
                          <p className="font-bold text-brand tabular-nums mt-0.5">
                            قیمت مطرح‌شده: {formatMoney(m.proposedUnitPrice, currency)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {/* Admin Quick Reply */}
                  {rfq.status !== 'converted' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-line dark:border-slate-800">
                      <div className="flex gap-2">
                        <input
                          value={rfqReplyDraft[rfq.id] ?? ''}
                          onChange={(e) => setRfqReplyDraft({ ...rfqReplyDraft, [rfq.id]: e.target.value })}
                          placeholder="پاسخ متنی کارشناس به مشتری..."
                          className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const txt = (rfqReplyDraft[rfq.id] ?? '').trim();
                            if (!txt) return;
                            const ok = await sendRfqMessage(rfq.id, txt);
                            if (ok) setRfqReplyDraft({ ...rfqReplyDraft, [rfq.id]: '' });
                          }}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-brand text-brand font-bold"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>پاسخ</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="number"
                          value={draft.price}
                          onChange={(e) => setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, price: e.target.value } })}
                          placeholder="قیمت پیشنهادی واحد (تومان)"
                          className="w-40 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <input
                          type="number"
                          value={draft.days}
                          onChange={(e) => setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, days: e.target.value } })}
                          placeholder="اعتبار (روز)"
                          className="w-24 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <input
                          value={draft.note}
                          onChange={(e) => setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, note: e.target.value } })}
                          placeholder="شرایط اعلام قیمت"
                          className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const priceNum = Number(draft.price);
                            if (!Number.isFinite(priceNum) || priceNum <= 0) return;
                            await quoteRfq(rfq.id, priceNum, Number(draft.days) || 7, draft.note || undefined);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-brand text-white font-bold"
                        >
                          ثبت قیمت رسمی
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
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
                    refId: `SH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                    status: 'verified',
                    createdAt: new Date().toISOString(),
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
              >
                + ثبت سند واریز بانکی
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
            <span>پرونده‌های مرجوعی، بازگشت به انبار و استرداد وجه (RMA)</span>
          </h2>
          {returns.length === 0 ? (
            <p className="text-ink/60 py-4 text-center">درخواست مرجوعی ثبت‌شده‌ای وجود ندارد.</p>
          ) : (
            returns.map((r) => {
              const draft = returnDrafts[r.id] ?? {
                condition: r.condition ?? ('resellable' as const),
                warehouseId: r.warehouseId ?? warehouses[0]?.id ?? 'wh_teh',
                batchNo: r.items[0]?.batchNo ?? '',
                adminNote: r.adminNote ?? '',
              };
              const setDraft = (patch: Partial<typeof draft>) =>
                setReturnDrafts((prev) => ({ ...prev, [r.id]: { ...draft, ...patch } }));

              return (
                <div key={r.id} className="p-4 rounded-xl border border-line dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <p className="font-extrabold tabular-nums">
                        {r.returnNo} (سفارش {r.orderNo}) — {r.customerName}
                      </p>
                      <p className="text-ink/60">
                        {r.reasonFa} · مبلغ: {formatMoney(r.refundAmount, currency)}
                      </p>
                      <p className="text-ink/55 mt-1">
                        اقلام: {r.items.map((it) => `${it.titleFa} × ${toPersianDigits(it.quantity)}`).join('، ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand font-bold">{r.status}</span>
                      {r.condition && (
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold ${
                            r.condition === 'damaged'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}
                        >
                          {r.condition === 'damaged' ? 'آسیب‌دیده (قرنطینه)' : 'سالم (قابل فروش)'}
                        </span>
                      )}
                      {r.restockedAt && (
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold tabular-nums">
                          ثبت انبار: {formatJalaliDateTime(r.restockedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {!r.restockedAt && r.status !== 'refunded' && r.status !== 'rejected' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 border-t border-line dark:border-slate-800">
                      <select
                        value={draft.condition}
                        onChange={(e) => setDraft({ condition: e.target.value as 'resellable' | 'damaged' })}
                        className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                      >
                        <option value="resellable">سالم و قابل فروش مجدد (resellable)</option>
                        <option value="damaged">آسیب‌دیده / قرنطینه ضایعات (damaged)</option>
                      </select>
                      <select
                        value={draft.warehouseId}
                        onChange={(e) => setDraft({ warehouseId: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.nameFa} ({w.code})
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.batchNo}
                        onChange={(e) => setDraft({ batchNo: e.target.value })}
                        placeholder="شماره بچ بازگشتی (اختیاری)"
                        className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                      <input
                        value={draft.adminNote}
                        onChange={(e) => setDraft({ adminNote: e.target.value })}
                        placeholder="یادداشت کارشناس انبار/مالی..."
                        className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.status === 'requested' && (
                      <>
                        <button
                          type="button"
                          onClick={() => processReturnAdmin(r.id, { status: 'approved', adminNote: draft.adminNote || undefined })}
                          className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                        >
                          تایید اولیه مرجوعی
                        </button>
                        <button
                          type="button"
                          onClick={() => processReturnAdmin(r.id, { status: 'rejected', adminNote: draft.adminNote || undefined })}
                          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                        >
                          رد درخواست
                        </button>
                      </>
                    )}
                    {r.status === 'approved' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            processReturnAdmin(r.id, {
                              status: 'received',
                              condition: draft.condition,
                              warehouseId: draft.warehouseId,
                              ...(draft.batchNo.trim() ? { batchNo: draft.batchNo.trim() } : {}),
                              ...(draft.adminNote.trim() ? { adminNote: draft.adminNote.trim() } : {}),
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          ثبت تحویل به انبار (Restock)
                        </button>
                        <button
                          type="button"
                          onClick={() => processReturnAdmin(r.id, { status: 'rejected', adminNote: draft.adminNote || undefined })}
                          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                        >
                          رد درخواست
                        </button>
                      </>
                    )}
                    {r.status === 'received' && (
                      <button
                        type="button"
                        onClick={() => processReturnAdmin(r.id, { status: 'refunded', adminNote: draft.adminNote || undefined })}
                        className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                      >
                        تکمیل عودت وجه (Refunded)
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
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
                    <button type="button" onClick={() => pushToast('پیامک یادآوری سبد خرید ثبت شد.', 'info')} className="px-3 py-1 rounded bg-brand text-white font-bold">
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
              {(['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'] as OrderStatus[]).map((st) => (
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
            {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
              <div className="pt-2 border-t border-line dark:border-slate-800 space-y-1.5 max-h-36 overflow-y-auto">
                <p className="font-bold text-ink/70">تاریخچه تغییر وضعیت (Append-only)</p>
                {selectedOrder.statusHistory.map((h, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] bg-surface/50 dark:bg-slate-800 px-2.5 py-1.5 rounded">
                    <span>{h.status} ({h.actorType}){h.note ? ` — ${h.note}` : ''}</span>
                    <span className="tabular-nums text-ink/50">{formatJalaliDateTime(h.changedAt)}</span>
                  </div>
                ))}
              </div>
            )}
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

export default AdminSalesPage;
