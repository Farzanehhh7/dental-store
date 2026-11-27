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
import { useI18n } from '../../context/i18n';
import { AccessibleModal } from '../../components/ui/Modal';
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
  const { t, formatDateTime, formatDigits, formatMoney } = useI18n();

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

  const getSourceLabel = (source?: OrderSource, isGuest?: boolean) => {
    if (source) {
      return t(`adminSales.source.${source}`, source);
    }
    return isGuest ? t('adminSales.source.guest') : t('adminSales.source.registeredUser');
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = products.find((x) => x.id === manualForm.productId);
    const v = p?.variants[0];
    if (!p || !v) return;
    const res = resolveVariantPrice(p, v, {
      customerGroup: manualForm.customerGroup,
      quantity: manualForm.qty,
      campaigns,
      settings,
    });
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
      shippingMethod: t('adminSales.manualShippingMethod'),
      shippingTotal: 0,
      address: {
        province: t('adminSales.defaultProvince'),
        city: manualForm.city,
        postalCode: '1417933111',
        addressLine: manualForm.addressLine,
      },
      items: [item],
      customerNote: t('adminSales.manualCustomerNote'),
    });
    setManualOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-lg sm:text-xl font-extrabold">{t('adminSales.title')}</h1>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold shrink-0"
        >
          {t('adminSales.newManualOrderBtn')}
        </button>
      </div>

      <div className="w-full max-w-full flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 text-xs pb-1">
        {[
          { id: 'orders', label: t('adminSales.tabs.orders', { count: formatDigits(orders.length) }) },
          { id: 'rfqs', label: t('adminSales.tabs.rfqs', { count: formatDigits(rfqs.length) }) },
          { id: 'invoices', label: t('adminSales.tabs.invoices', { count: formatDigits(invoices.length) }) },
          { id: 'proformas', label: t('adminSales.tabs.proformas', { count: formatDigits(proformas.length) }) },
          { id: 'payments', label: t('adminSales.tabs.payments', { count: formatDigits(paymentLedger.length) }) },
          { id: 'returns', label: t('adminSales.tabs.returns', { count: formatDigits(returns.length) }) },
          { id: 'credit', label: t('adminSales.tabs.credit', { count: formatDigits(paymentPlans.length) }) },
          { id: 'carts', label: t('adminSales.tabs.carts') },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id as typeof tab)}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === tabItem.id
                ? 'bg-brand text-white'
                : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'
            }`}
          >
            {tabItem.label}
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
              placeholder={t('adminSales.filterSearchPlaceholder')}
              className="sm:col-span-2 lg:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={orderFilters.status}
              onChange={(e) => setOrderFilters((f) => ({ ...f, status: e.target.value as OrderStatus | '' }))}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">{t('adminSales.allStatuses')}</option>
              <option value="pending_payment">{t('orderStatus.pending_payment')}</option>
              <option value="awaiting_review">{t('orderStatus.awaiting_review')}</option>
              <option value="payment_failed">{t('orderStatus.payment_failed')}</option>
              <option value="paid">{t('orderStatus.paid')}</option>
              <option value="processing">{t('orderStatus.processing')}</option>
              <option value="packed">{t('orderStatus.packed')}</option>
              <option value="shipped">{t('orderStatus.shipped')}</option>
              <option value="delivered">{t('orderStatus.delivered')}</option>
              <option value="completed">{t('orderStatus.completed')}</option>
              <option value="cancelled">{t('orderStatus.cancelled')}</option>
              <option value="expired">{t('orderStatus.expired')}</option>
              <option value="refunded">{t('orderStatus.refunded')}</option>
            </select>
            <select
              value={orderFilters.source}
              onChange={(e) => setOrderFilters((f) => ({ ...f, source: e.target.value as OrderSource | '' }))}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="">{t('adminSales.allSources')}</option>
              <option value="google">{t('adminSales.source.google')}</option>
              <option value="otp">{t('adminSales.source.otp')}</option>
              <option value="guest">{t('adminSales.source.guest')}</option>
              <option value="admin_manual">{t('adminSales.source.admin_manual')}</option>
            </select>
            <input
              value={orderFilters.fromDate}
              onChange={(e) => setOrderFilters((f) => ({ ...f, fromDate: e.target.value }))}
              placeholder={t('adminSales.fromDatePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
            />
            <div className="flex gap-2">
              <input
                value={orderFilters.toDate}
                onChange={(e) => setOrderFilters((f) => ({ ...f, toDate: e.target.value }))}
                placeholder={t('adminSales.toDatePlaceholder')}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
              />
              <button
                type="submit"
                disabled={adminOrdersLoading}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-brand text-white font-bold shrink-0 disabled:opacity-50"
              >
                {t('adminSales.applyFilter')}
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-xs">
                <thead className="bg-surface/60 dark:bg-slate-800 text-ink/70">
                  <tr>
                    <th className="p-3 text-start">{t('adminSales.colOrderNo')}</th>
                    <th className="p-3 text-start">{t('adminSales.colCustomer')}</th>
                    <th className="p-3 text-start">{t('adminSales.colSource')}</th>
                    <th className="p-3 text-start">{t('adminSales.colPaymentMethod')}</th>
                    <th className="p-3 text-start">{t('adminSales.colGrandTotal')}</th>
                    <th className="p-3 text-start">{t('adminSales.colStatus')}</th>
                    <th className="p-3 text-start">{t('adminSales.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-ink/55">
                        {adminOrdersLoading ? t('adminSales.loadingOrders') : t('adminSales.noOrdersFound')}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td className="p-3 font-extrabold tabular-nums">
                          <div>{o.orderNo}</div>
                          <div className="text-[10px] font-normal text-ink/50">{formatDateTime(o.createdAt)}</div>
                        </td>
                        <td className="p-3">
                          <div>
                            {o.customerName} ({t(`customerGroup.${o.customerGroup}`, o.customerGroup)})
                          </div>
                          <div className="text-[10px] text-ink/50 tabular-nums">{o.customerMobile}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-surface dark:bg-slate-800 font-medium whitespace-nowrap">
                            {getSourceLabel(o.source, o.isGuest)}
                          </span>
                        </td>
                        <td className="p-3">{o.paymentMethod}</td>
                        <td className="p-3 tabular-nums font-bold text-brand">{formatMoney(o.grandTotal, currency)}</td>
                        <td className="p-3 font-bold">{t(`orderStatus.${o.status}`, o.status)}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(o);
                                setTrackingInput(o.trackingCode ?? '');
                              }}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-brand text-brand font-bold whitespace-nowrap"
                            >
                              {t('adminSales.manageStatusBtn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => issueInvoice(o.id, true)}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-line dark:border-slate-700 font-bold whitespace-nowrap"
                            >
                              {t('adminSales.issueInvoiceBtn')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-ink/60 tabular-nums">
                {t('adminSales.ordersMetaSummary', {
                  total: formatDigits(adminOrdersMeta.total),
                  page: formatDigits(adminOrdersMeta.page),
                  totalPages: formatDigits(adminOrdersMeta.totalPages),
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={adminOrdersMeta.page <= 1 || adminOrdersLoading}
                  onClick={() => void fetchAdminOrders({ page: adminOrdersMeta.page - 1 })}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  {t('common.prevPage')}
                </button>
                <button
                  type="button"
                  disabled={adminOrdersMeta.page >= adminOrdersMeta.totalPages || adminOrdersLoading}
                  onClick={() => void fetchAdminOrders({ page: adminOrdersMeta.page + 1 })}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold disabled:opacity-40"
                >
                  {t('common.nextPage')}
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
              {t('adminSales.noRfqs')}
            </div>
          ) : (
            rfqs.map((rfq) => {
              const draft = rfqQuoteDraft[rfq.id] ?? {
                price: String(rfq.quotedUnitPrice ?? rfq.targetUnitPrice ?? ''),
                days: '7',
                note: '',
              };
              return (
                <div
                  key={rfq.id}
                  className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-wrap justify-between items-start gap-3 border-b border-line dark:border-slate-800 pb-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-extrabold flex items-center gap-2 tabular-nums">
                        <Handshake className="w-4 h-4 text-brand shrink-0" />
                        <span>
                          {rfq.rfqNo} — {rfq.productTitleFa}
                        </span>
                      </h2>
                      <p className="text-ink/60 mt-1 tabular-nums">
                        {t('adminSales.rfqBuyerLabel', {
                          name: rfq.customerName,
                          clinic: rfq.clinicName ? `(${rfq.clinicName})` : '',
                          mobile: rfq.customerMobile,
                          qty: formatDigits(rfq.quantity),
                        })}
                        {rfq.targetUnitPrice
                          ? ` · ${t('adminSales.rfqTargetPrice', { price: formatMoney(rfq.targetUnitPrice, currency) })}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand font-bold">{rfq.status}</span>
                      {rfq.status !== 'converted' && rfq.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => convertRfqToProforma(rfq.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          {t('adminSales.convertToProformaBtn')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {rfq.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded-xl ${
                          m.isStaff ? 'bg-brand/10 border border-brand/20' : 'bg-surface/60 dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex justify-between gap-2 text-[10px] text-ink/55">
                          <span className="font-bold">{m.authorName}</span>
                          <span className="tabular-nums">{formatDateTime(m.createdAt)}</span>
                        </div>
                        <p className="mt-0.5">{m.body}</p>
                        {m.proposedUnitPrice ? (
                          <p className="font-bold text-brand tabular-nums mt-0.5">
                            {t('adminSales.proposedUnitPrice', {
                              price: formatMoney(m.proposedUnitPrice, currency),
                            })}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {rfq.status !== 'converted' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-line dark:border-slate-800">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={rfqReplyDraft[rfq.id] ?? ''}
                          onChange={(e) => setRfqReplyDraft({ ...rfqReplyDraft, [rfq.id]: e.target.value })}
                          placeholder={t('adminSales.rfqReplyPlaceholder')}
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
                          className="min-h-[38px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-brand text-brand font-bold shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{t('adminSales.replyBtn')}</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="number"
                          value={draft.price}
                          onChange={(e) =>
                            setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, price: e.target.value } })
                          }
                          placeholder={t('adminSales.rfqUnitPricePlaceholder')}
                          className="w-full sm:w-40 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <input
                          type="number"
                          value={draft.days}
                          onChange={(e) =>
                            setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, days: e.target.value } })
                          }
                          placeholder={t('adminSales.rfqDaysPlaceholder')}
                          className="w-full sm:w-24 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <input
                          value={draft.note}
                          onChange={(e) =>
                            setRfqQuoteDraft({ ...rfqQuoteDraft, [rfq.id]: { ...draft, note: e.target.value } })
                          }
                          placeholder={t('adminSales.rfqTermsPlaceholder')}
                          className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const priceNum = Number(draft.price);
                            if (!Number.isFinite(priceNum) || priceNum <= 0) return;
                            await quoteRfq(rfq.id, priceNum, Number(draft.days) || 7, draft.note || undefined);
                          }}
                          className="min-h-[38px] px-3.5 py-2 rounded-lg bg-brand text-white font-bold shrink-0"
                        >
                          {t('adminSales.submitOfficialQuoteBtn')}
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
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand shrink-0" />
            <span>{t('adminSales.invoicesTitle')}</span>
          </h2>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-extrabold tabular-nums">
                  {t('adminSales.invoiceRowHeader', {
                    invoiceNo: inv.invoiceNo,
                    orderNo: inv.orderNo,
                    customer: inv.customerName,
                  })}
                </p>
                <p className="text-ink/55 tabular-nums">
                  {t('adminSales.invoiceRowMeta', {
                    total: formatMoney(inv.grandTotal, currency),
                    tax: formatMoney(inv.taxTotal, currency),
                    status: inv.status === 'issued' ? t('adminSales.invoiceIssued') : t('adminSales.invoiceVoided'),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPrintInvoice(inv)}
                  className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" /> {t('adminSales.printBtn')}
                </button>
                {inv.status === 'issued' && (
                  <button
                    type="button"
                    onClick={() => voidInvoice(inv.id)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 font-bold"
                  >
                    {t('adminSales.voidInvoiceBtn')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'proformas' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminSales.proformasTitle')}</h2>
          {proformas.map((pf) => (
            <div
              key={pf.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-extrabold tabular-nums">
                  {pf.proformaNo} — {pf.contactName} {pf.clinicName ? `(${pf.clinicName})` : ''}
                </p>
                <p className="text-ink/55 tabular-nums">
                  {t('adminSales.proformaMeta', {
                    total: formatMoney(pf.grandTotal, currency),
                    status: t(`proformaStatus.${pf.status}`, pf.status),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/proforma/${pf.shareToken || pf.id}`;
                    navigator.clipboard?.writeText(url);
                    pushToast(t('adminSales.proformaLinkCopied'), 'success');
                  }}
                  className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                >
                  <Copy className="w-3.5 h-3.5" /> {t('adminSales.copyPublicLinkBtn')}
                </button>
                {pf.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => upsertProformaAdmin({ ...pf, status: 'sent' } as ProformaInvoice)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-brand text-brand font-bold"
                  >
                    {t('adminSales.sendToCustomerBtn')}
                  </button>
                )}
                {pf.status !== 'converted' && (
                  <button
                    type="button"
                    onClick={() => convertProformaToOrder(pf.id)}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-brand text-white font-bold"
                  >
                    {t('adminSales.convertProformaToOrderBtn')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-base font-extrabold">{t('adminSales.paymentsTitle')}</h2>
            {orders[0] && (
              <button
                type="button"
                onClick={() =>
                  recordPaymentEntry({
                    id: `pay_${Date.now()}`,
                    orderId: orders[0].id,
                    orderNo: orders[0].orderNo,
                    gateway: t('adminSales.bankReceiptGateway'),
                    amount: orders[0].grandTotal,
                    idempotencyKey: `ADMIN-${Date.now()}`,
                    refId: `SH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                    status: 'verified',
                    createdAt: new Date().toISOString(),
                  })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0"
              >
                {t('adminSales.addBankReceiptBtn')}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColOrder')}</th>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColGateway')}</th>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColRefId')}</th>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColAmount')}</th>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColStatus')}</th>
                  <th className="py-2 px-2 text-start">{t('adminSales.payColDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {paymentLedger.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-2 font-bold tabular-nums">{p.orderNo}</td>
                    <td className="py-2 px-2">{p.gateway}</td>
                    <td className="py-2 px-2 font-mono">{p.refId}</td>
                    <td className="py-2 px-2 tabular-nums font-bold">{formatMoney(p.amount, currency)}</td>
                    <td className="py-2 px-2">{p.status}</td>
                    <td className="py-2 px-2 tabular-nums">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'returns' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-brand shrink-0" />
            <span>{t('adminSales.returnsTitle')}</span>
          </h2>
          {returns.length === 0 ? (
            <p className="text-ink/60 py-4 text-center">{t('adminSales.noReturns')}</p>
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
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold tabular-nums">
                        {t('adminSales.returnHeader', {
                          returnNo: r.returnNo,
                          orderNo: r.orderNo,
                          customer: r.customerName,
                        })}
                      </p>
                      <p className="text-ink/60">
                        {r.reasonFa} · {t('adminSales.returnAmountLabel', { amount: formatMoney(r.refundAmount, currency) })}
                      </p>
                      <p className="text-ink/55 mt-1">
                        {t('adminSales.returnItemsLabel', {
                          items: r.items.map((it) => `${it.titleFa} × ${formatDigits(it.quantity)}`).join('، '),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand font-bold">{r.status}</span>
                      {r.condition && (
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold ${
                            r.condition === 'damaged'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}
                        >
                          {r.condition === 'damaged'
                            ? t('adminSales.returnConditionDamagedBadge')
                            : t('adminSales.returnConditionResellableBadge')}
                        </span>
                      )}
                      {r.restockedAt && (
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold tabular-nums">
                          {t('adminSales.restockedAtLabel', { date: formatDateTime(r.restockedAt) })}
                        </span>
                      )}
                    </div>
                  </div>

                  {!r.restockedAt && r.status !== 'refunded' && r.status !== 'rejected' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-line dark:border-slate-800">
                      <select
                        value={draft.condition}
                        onChange={(e) => setDraft({ condition: e.target.value as 'resellable' | 'damaged' })}
                        className="px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                      >
                        <option value="resellable">{t('adminSales.conditionResellableOption')}</option>
                        <option value="damaged">{t('adminSales.conditionDamagedOption')}</option>
                      </select>
                      <select
                        value={draft.warehouseId}
                        onChange={(e) => setDraft({ warehouseId: e.target.value })}
                        className="px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
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
                        placeholder={t('adminSales.returnBatchPlaceholder')}
                        className="px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                      <input
                        value={draft.adminNote}
                        onChange={(e) => setDraft({ adminNote: e.target.value })}
                        placeholder={t('adminSales.returnNotePlaceholder')}
                        className="px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.status === 'requested' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            processReturnAdmin(r.id, { status: 'approved', adminNote: draft.adminNote || undefined })
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                        >
                          {t('adminSales.approveReturnInitialBtn')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            processReturnAdmin(r.id, { status: 'rejected', adminNote: draft.adminNote || undefined })
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                        >
                          {t('adminSales.rejectReturnBtn')}
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
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          {t('adminSales.restockReceivedBtn')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            processReturnAdmin(r.id, { status: 'rejected', adminNote: draft.adminNote || undefined })
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                        >
                          {t('adminSales.rejectReturnBtn')}
                        </button>
                      </>
                    )}
                    {r.status === 'received' && (
                      <button
                        type="button"
                        onClick={() =>
                          processReturnAdmin(r.id, { status: 'refunded', adminNote: draft.adminNote || undefined })
                        }
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-brand text-white font-bold"
                      >
                        {t('adminSales.completeRefundBtn')}
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
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminSales.creditTitle')}</h2>
          {paymentPlans.map((pl) => (
            <div
              key={pl.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {t('adminSales.creditHeader', {
                    name: pl.customerName,
                    type: pl.type,
                    count: formatDigits(pl.installmentsCount),
                  })}
                </p>
                <p className="text-ink/60">
                  {pl.proposedTermsFa} ·{' '}
                  {t('adminSales.creditAmount', { amount: formatMoney(pl.requestedAmount, currency) })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="font-bold text-brand">{pl.status}</span>
                {pl.status !== 'approved' && pl.status !== 'rejected' && (
                  <>
                    <button
                      type="button"
                      onClick={() => updatePaymentPlanStatus(pl.id, 'approved', t('adminSales.creditApprovedNote'))}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                    >
                      {t('common.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePaymentPlanStatus(pl.id, 'rejected', t('adminSales.creditRejectedNote'))}
                      className="min-h-[36px] px-3 py-1 rounded-lg border border-rose-300 text-rose-700 font-bold"
                    >
                      {t('common.reject')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'carts' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminSales.cartsTitle')}</h2>
          {cart.length === 0 ? (
            <p className="text-ink/60">{t('adminSales.noActiveCarts')}</p>
          ) : (
            <div className="space-y-2">
              {cart.map((ci) => {
                const p = products.find((x) => x.id === ci.productId);
                return (
                  <div
                    key={ci.variantId}
                    className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
                  >
                    <span>
                      {p?.titleFa ?? ci.productId} — {t('adminSales.cartItemQty', { count: formatDigits(ci.quantity) })}
                    </span>
                    <button
                      type="button"
                      onClick={() => pushToast(t('adminSales.cartReminderToast'), 'info')}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-brand text-white font-bold shrink-0"
                    >
                      {t('adminSales.sendReminderBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      <AccessibleModal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        ariaLabel={t('adminSales.orderDetailAria')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {selectedOrder && (
          <>
            <h2 className="text-base font-extrabold tabular-nums">
              {t('adminSales.orderDetailTitle', { orderNo: selectedOrder.orderNo })}
            </h2>
            <p>
              {t('adminSales.orderDetailCustomer', {
                name: selectedOrder.customerName,
                mobile: selectedOrder.customerMobile,
              })}
            </p>
            <p>
              {t('adminSales.orderDetailAddress', {
                province: selectedOrder.shippingAddress.province,
                city: selectedOrder.shippingAddress.city,
                line: selectedOrder.shippingAddress.addressLine,
              })}
            </p>
            <label className="block space-y-1">
              <span className="font-bold">{t('adminSales.trackingCodeLabel')}</span>
              <input
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder={t('adminSales.trackingCodePlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'] as OrderStatus[]).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={async () => {
                      await updateOrderStatus(selectedOrder.id, st, trackingInput || undefined);
                      setSelectedOrder(null);
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg font-bold border ${
                      selectedOrder.status === st
                        ? 'bg-brand text-white border-brand'
                        : 'border-line dark:border-slate-700'
                    }`}
                  >
                    {t(`orderStatus.${st}`, st)}
                  </button>
                )
              )}
            </div>
            {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
              <div className="pt-2 border-t border-line dark:border-slate-800 space-y-1.5 max-h-36 overflow-y-auto">
                <p className="font-bold text-ink/70">{t('adminSales.statusHistoryTitle')}</p>
                {selectedOrder.statusHistory.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap justify-between gap-2 text-[11px] bg-surface/50 dark:bg-slate-800 px-2.5 py-1.5 rounded"
                  >
                    <span>
                      {t(`orderStatus.${h.status}`, h.status)} ({h.actorType})
                      {h.note ? ` — ${h.note}` : ''}
                    </span>
                    <span className="tabular-nums text-ink/50">{formatDateTime(h.changedAt)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-line dark:border-slate-700 font-bold"
              >
                {t('common.close')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>

      {/* Manual Order Modal */}
      <AccessibleModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        ariaLabel={t('adminSales.manualOrderTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-3 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={handleManualCreate} className="space-y-3">
          <h2 className="text-base font-extrabold">{t('adminSales.manualOrderTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              required
              value={manualForm.customerName}
              onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
              placeholder={t('adminSales.manualCustomerNamePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              required
              dir="ltr"
              value={manualForm.customerMobile}
              onChange={(e) => setManualForm({ ...manualForm, customerMobile: e.target.value })}
              placeholder={t('adminSales.manualMobilePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={manualForm.customerGroup}
              onChange={(e) => setManualForm({ ...manualForm, customerGroup: e.target.value as CustomerGroupCode })}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              <option value="clinic">{t('customerGroup.clinic')}</option>
              <option value="dentist">{t('customerGroup.dentist')}</option>
              <option value="retail">{t('customerGroup.retail')}</option>
              <option value="wholesale">{t('customerGroup.wholesale')}</option>
            </select>
            <input
              type="number"
              min={1}
              value={manualForm.qty}
              onChange={(e) => setManualForm({ ...manualForm, qty: Number(e.target.value) })}
              placeholder={t('adminSales.manualQtyPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <select
              value={manualForm.productId}
              onChange={(e) => setManualForm({ ...manualForm, productId: e.target.value })}
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titleFa}
                </option>
              ))}
            </select>
            <input
              value={manualForm.addressLine}
              onChange={(e) => setManualForm({ ...manualForm, addressLine: e.target.value })}
              placeholder={t('adminSales.manualAddressPlaceholder')}
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
            >
              {t('actions.cancel')}
            </button>
            <button type="submit" className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-white font-bold">
              {t('adminSales.submitManualOrderBtn')}
            </button>
          </div>
        </form>
      </AccessibleModal>

      {/* Printable Invoice Modal */}
      <AccessibleModal
        open={Boolean(printInvoice)}
        onClose={() => setPrintInvoice(null)}
        ariaLabel={t('adminSales.printInvoiceTitle')}
        panelClassName="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-3 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {printInvoice && (
          <>
            <div className="flex justify-between items-start gap-2 border-b pb-3">
              <div>
                <h2 className="font-extrabold text-base">{t('adminSales.printInvoiceTitle')}</h2>
                <p className="tabular-nums">
                  {t('adminSales.printInvoiceNo', { invoiceNo: printInvoice.invoiceNo })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintInvoice(null)}
                aria-label={t('common.close')}
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p>{t('adminSales.printBuyer', { name: printInvoice.customerName })}</p>
            <p className="tabular-nums">
              {t('adminSales.printTaxIds', {
                nationalId: printInvoice.nationalId || '—',
                economicCode: printInvoice.economicCode || '—',
              })}
            </p>
            <div className="p-3 bg-slate-50 rounded-xl space-y-1 tabular-nums">
              <p>{t('adminSales.printSubtotal', { amount: formatMoney(printInvoice.subtotal, currency) })}</p>
              <p>{t('adminSales.printTaxTotal', { amount: formatMoney(printInvoice.taxTotal, currency) })}</p>
              <p className="font-extrabold text-brand">
                {t('adminSales.printGrandTotal', { amount: formatMoney(printInvoice.grandTotal, currency) })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] w-full py-2.5 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminSales.printOfficialInvoiceBtn')}
            </button>
          </>
        )}
      </AccessibleModal>
    </div>
  );
}

export default AdminSalesPage;
