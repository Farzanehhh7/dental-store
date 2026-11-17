import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { CustomerGroupCode, UserProfile } from '../../types/domain';

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

export default AdminCustomersSupportPage;
