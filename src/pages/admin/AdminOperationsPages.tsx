import { useState } from 'react';
import { CheckCircle2, Minus, Plus, XCircle } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { daysUntil, formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { getVariantAvailableStock } from '../../lib/pricing';
import { Order, OrderStatus } from '../../types/domain';

export function AdminInventoryPage() {
  const {
    products,
    stockRequests,
    settings,
    adjustVariantStock,
    updateStockRequestStatus,
  } = useStore();

  const [reason, setReason] = useState('شمارش و تعدیل انبار مرکزی');

  const variantRows = products.flatMap((p) =>
    p.variants.map((v) => ({ product: p, variant: v }))
  );

  const batchRows = products.flatMap((p) =>
    p.variants.flatMap((v) =>
      (v.batches ?? []).map((b) => ({
        product: p,
        variant: v,
        batch: b,
        daysLeft: daysUntil(b.expiresAt),
      }))
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">مدیریت انبار، بچ‌های FEFO و درخواست کالای ناموجود</h1>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="علت تعدیل انبار برای ثبت در Audit Log..."
          className="px-3 py-2 rounded-xl border border-line dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-64"
        />
      </div>

      {/* Stock Levels */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line dark:border-slate-800 font-extrabold text-sm">
          موجودی تنوع‌ها در انبار
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
                <th className="p-3 text-right">تعدیل فوری</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-slate-800">
              {variantRows.slice(0, 15).map(({ product, variant }) => {
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
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => adjustVariantStock(product.id, variant.id, 5, reason)}
                          className="p-1 rounded border border-line dark:border-slate-700 hover:bg-emerald-50"
                          title="+۵ عدد"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustVariantStock(product.id, variant.id, -1, reason)}
                          className="p-1 rounded border border-line dark:border-slate-700 hover:bg-rose-50"
                          title="-۱ عدد"
                        >
                          <Minus className="w-3.5 h-3.5" />
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

      {/* Batches & Expiry */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-extrabold">رهگیری بچ‌ها و تاریخ انقضا (FEFO)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-line dark:border-slate-800 text-ink/60">
              <tr>
                <th className="py-2 text-right">محصول</th>
                <th className="py-2 text-right">کد بچ (LOT)</th>
                <th className="py-2 text-right">انقضا (شمسی)</th>
                <th className="py-2 text-right">روز مانده</th>
                <th className="py-2 text-right">موجودی بچ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-slate-800">
              {batchRows.map((row, idx) => {
                const near = row.daysLeft !== null && row.daysLeft <= settings.nearExpiryThresholdDays;
                return (
                  <tr key={idx}>
                    <td className="py-2.5 font-bold">{row.product.titleFa}</td>
                    <td className="py-2.5 tabular-nums">{row.batch.batchNo}</td>
                    <td className="py-2.5 tabular-nums">{formatJalaliDate(row.batch.expiresAt)}</td>
                    <td className={`py-2.5 tabular-nums font-bold ${near ? 'text-amber-600' : ''}`}>
                      {row.daysLeft !== null ? `${toPersianDigits(row.daysLeft)} روز` : '—'}
                    </td>
                    <td className="py-2.5 tabular-nums">{toPersianDigits(row.batch.qtyOnHand)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Requests */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-extrabold">درخواست‌های تامین کالای ناموجود</h2>
        <div className="space-y-2 text-xs">
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
      </div>
    </div>
  );
}

export function AdminSalesPage() {
  const {
    orders,
    proformas,
    paymentPlans,
    currency,
    updateOrderStatus,
    convertProformaToOrder,
    updatePaymentPlanStatus,
  } = useStore();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingInput, setTrackingInput] = useState('');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">مدیریت سفارش‌ها، پیش‌فاکتورها و پرونده‌های اعتباری</h1>

      {/* Orders List */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line dark:border-slate-800 font-extrabold text-sm">
          سفارش‌های فروشگاه ({toPersianDigits(orders.length)})
        </div>
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
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrder(o);
                        setTrackingInput(o.trackingCode ?? '');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-brand text-brand font-bold"
                    >
                      بررسی و تغییر وضعیت
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proformas */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-extrabold">پیش‌فاکتورهای رسمی کلینیک‌ها</h2>
        <div className="space-y-2 text-xs">
          {proformas.map((pf) => (
            <div key={pf.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-extrabold tabular-nums">{pf.proformaNo} — {pf.contactName} {pf.clinicName ? `(${pf.clinicName})` : ''}</p>
                <p className="text-ink/55 tabular-nums">مبلغ: {formatMoney(pf.grandTotal, currency)} · وضعیت: {pf.status}</p>
              </div>
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
          ))}
        </div>
      </div>

      {/* Payment Plans */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-extrabold">پرونده‌های درخواست اعتبار، چک و اقساط (§8.5)</h2>
        <div className="space-y-2 text-xs">
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
                    <button
                      type="button"
                      onClick={() => updatePaymentPlanStatus(pl.id, 'approved', 'تایید شد')}
                      className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                    >
                      تایید
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePaymentPlanStatus(pl.id, 'rejected', 'نیازمند تضمین بیشتر')}
                      className="px-3 py-1 rounded-lg border border-rose-300 text-rose-700 font-bold"
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
    </div>
  );
}

export function AdminCustomersSupportPage({ mode }: { mode: 'customers' | 'support' }) {
  const {
    usersList,
    b2bVerifications,
    tickets,
    consultationRequests,
    reviews,
    questions,
    products,
    reviewB2BVerification,
    replyTicket,
    updateConsultationStatus,
    moderateReview,
    answerQuestion,
  } = useStore();

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});

  if (mode === 'customers') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-extrabold">مدیریت مشتریان و صف احراز هویت B2B</h1>

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
                        تایید و تغییر گروه
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
          <h2 className="text-base font-extrabold">کاربران ثبت‌نام‌شده ({toPersianDigits(usersList.length)})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 text-right">نام</th>
                  <th className="py-2 text-right">ایمیل / موبایل</th>
                  <th className="py-2 text-right">گروه تعرفه</th>
                  <th className="py-2 text-right">وضعیت B2B</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {usersList.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-2.5 font-bold">{u.displayName || 'کاربر'}</td>
                    <td className="py-2.5">{u.email} {u.mobile ? `· ${u.mobile}` : ''}</td>
                    <td className="py-2.5 font-bold text-brand">{u.customerGroup}</td>
                    <td className="py-2.5">{u.b2bStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
