import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { AccessibleModal } from '../../components/ui/Modal';
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
  const { t, formatDateTime, formatDigits, formatMoney } = useI18n();

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  if (mode === 'customers') {
    return (
      <div className="space-y-6">
        <h1 className="text-lg sm:text-xl font-extrabold">{t('adminCustomers.title')}</h1>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-base font-extrabold">{t('adminCustomers.b2bQueueTitle')}</h2>
          <div className="space-y-2 text-xs">
            {b2bVerifications.map((v) => (
              <div
                key={v.id}
                className="p-4 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-bold text-sm">
                    {v.applicantName} — {v.clinicName}
                  </p>
                  <p className="text-ink/60 tabular-nums break-words">
                    {t('adminCustomers.requestedGroupLabel', {
                      group: t(`customerGroup.${v.requestedGroup}`, v.requestedGroup),
                      councilNo: v.medicalCouncilNo,
                      mobile: v.mobile,
                    })}
                  </p>
                  {v.attachmentPreview && (
                    <img
                      src={v.attachmentPreview}
                      alt={v.attachmentName || t('adminCustomers.attachmentAlt')}
                      className="h-16 rounded border border-line mt-1"
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="font-bold text-brand">{t(`b2bStatus.${v.status}`, v.status)}</span>
                  {v.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => reviewB2BVerification(v.id, 'approved')}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                      >
                        {t('adminCustomers.approveAndUpgrade')}
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewB2BVerification(v.id, 'rejected', t('adminCustomers.rejectDefaultReason'))}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                      >
                        {t('adminCustomers.reject')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-base font-extrabold">
            {t('adminCustomers.usersListTitle', { count: formatDigits(usersList.length) })}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead className="border-b border-line dark:border-slate-800 text-ink/60">
                <tr>
                  <th className="py-2 px-2 text-start">{t('adminCustomers.colName')}</th>
                  <th className="py-2 px-2 text-start">{t('adminCustomers.colContact')}</th>
                  <th className="py-2 px-2 text-start">{t('adminCustomers.colGroup')}</th>
                  <th className="py-2 px-2 text-start">{t('adminCustomers.colStatus')}</th>
                  <th className="py-2 px-2 text-start">{t('adminCustomers.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {usersList.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-2.5 px-2 font-bold">{u.displayName || t('adminCustomers.defaultUser')}</td>
                    <td className="py-2.5 px-2">
                      {u.email} {u.mobile ? `· ${u.mobile}` : ''}
                    </td>
                    <td className="py-2.5 px-2 font-bold text-brand">
                      {t(`customerGroup.${u.customerGroup}`, u.customerGroup)}
                    </td>
                    <td className="py-2.5 px-2">
                      {u.isBlocked ? t('adminCustomers.blocked') : t(`b2bStatus.${u.b2bStatus}`, u.b2bStatus)}
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className="min-h-[36px] px-3 py-1 rounded-lg border border-brand text-brand font-bold whitespace-nowrap"
                      >
                        {t('adminCustomers.manageProfileBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AccessibleModal
          open={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          ariaLabel={t('adminCustomers.profileModalAria')}
          panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {selectedUser && (
            <>
              <div className="flex justify-between items-center gap-2">
                <h2 className="text-base font-extrabold flex items-center gap-2 min-w-0">
                  <UserCheck className="w-4 h-4 text-brand shrink-0" />
                  <span className="truncate">
                    {t('adminCustomers.userProfileTitle', { name: selectedUser.displayName || selectedUser.email || t('adminCustomers.defaultUser') })}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  aria-label={t('common.close')}
                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-surface dark:hover:bg-slate-800 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p>
                {t('adminCustomers.mobileAndClinic', {
                  mobile: selectedUser.mobile || '—',
                  clinic: selectedUser.clinicName || '—',
                })}
              </p>
              <p className="tabular-nums">
                {t('adminCustomers.ordersSummary', {
                  count: formatDigits(orders.filter((o) => o.userId === selectedUser.uid).length),
                  total: formatMoney(
                    orders.filter((o) => o.userId === selectedUser.uid).reduce((s, o) => s + o.grandTotal, 0),
                    currency
                  ),
                })}
              </p>
              <label className="block space-y-1">
                <span className="font-bold">{t('adminCustomers.changePricingGroup')}</span>
                <select
                  value={selectedUser.customerGroup}
                  onChange={async (e) => {
                    const g = e.target.value as CustomerGroupCode;
                    await updateUserAdmin(selectedUser.uid, { customerGroup: g });
                    setSelectedUser({ ...selectedUser, customerGroup: g });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                >
                  <option value="retail">{t('customerGroup.retail')}</option>
                  <option value="dentist">{t('customerGroup.dentist')}</option>
                  <option value="clinic">{t('customerGroup.clinic')}</option>
                  <option value="lab">{t('customerGroup.lab')}</option>
                  <option value="student">{t('customerGroup.student')}</option>
                  <option value="agent">{t('customerGroup.agent')}</option>
                  <option value="wholesale">{t('customerGroup.wholesale')}</option>
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
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 font-bold"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{selectedUser.isBlocked ? t('adminCustomers.unblockUser') : t('adminCustomers.blockUser')}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateUserAdmin(selectedUser.uid, {
                      displayName: t('adminCustomers.gdprAnonymizedName'),
                      mobile: '00000000000',
                      email: `anonymized-${selectedUser.uid.slice(0, 6)}@deleted.local`,
                      isBlocked: true,
                    });
                    setSelectedUser(null);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold"
                >
                  {t('adminCustomers.gdprAnonymizeBtn')}
                </button>
              </div>
            </>
          )}
        </AccessibleModal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg sm:text-xl font-extrabold">{t('adminSupport.title')}</h1>

      {/* Tickets */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminSupport.ticketsTitle')}</h2>
        <div className="space-y-3">
          {tickets.map((tk) => (
            <div key={tk.id} className="p-4 rounded-xl border border-line dark:border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2 font-bold">
                <span>
                  {tk.subject} ({tk.department})
                </span>
                <span className="tabular-nums text-brand">
                  {tk.ticketNo} · {tk.status}
                </span>
              </div>
              {tk.messages.map((m, idx) => (
                <p key={idx} className="p-2 rounded bg-surface/60 dark:bg-slate-800">
                  <strong>{m.authorName}:</strong> {m.body}{' '}
                  <span className="text-[10px] text-ink/45">({formatDateTime(m.createdAt)})</span>
                </p>
              ))}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={replyTexts[tk.id] ?? ''}
                  onChange={(e) => setReplyTexts({ ...replyTexts, [tk.id]: e.target.value })}
                  placeholder={t('adminSupport.ticketReplyPlaceholder')}
                  className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const txt = (replyTexts[tk.id] ?? '').trim();
                    if (!txt) return;
                    await replyTicket(tk.id, txt, true);
                    setReplyTexts({ ...replyTexts, [tk.id]: '' });
                  }}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg bg-brand text-white font-bold shrink-0"
                >
                  {t('adminSupport.sendReply')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consultations */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-extrabold">{t('adminSupport.consultationsTitle')}</h2>
        <div className="space-y-2 text-xs">
          {consultationRequests.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {c.name} ({c.clinicName ?? t('adminSupport.defaultClinic')}) · {c.mobile}
                </p>
                <p className="text-ink/60">
                  {c.productName ?? t('adminSupport.defaultEquipment')} — {c.message}
                </p>
              </div>
              <select
                value={c.status}
                onChange={(e) => updateConsultationStatus(c.id, e.target.value as typeof c.status)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold w-full sm:w-auto"
              >
                <option value="new">{t('adminSupport.consultStatus.new')}</option>
                <option value="contacted">{t('adminSupport.consultStatus.contacted')}</option>
                <option value="quoted">{t('adminSupport.consultStatus.quoted')}</option>
                <option value="won">{t('adminSupport.consultStatus.won')}</option>
                <option value="lost">{t('adminSupport.consultStatus.lost')}</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews & Q&A */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminSupport.reviewsTitle')}</h2>
          {reviews.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-line dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap justify-between gap-2 font-bold">
                <span>
                  {r.authorName} · {t('adminSupport.ratingValue', { rating: formatDigits(r.rating) })}
                </span>
                <span className="text-brand">{r.status}</span>
              </div>
              <p className="text-ink/75 dark:text-slate-300">{r.body}</p>
              {r.status !== 'approved' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moderateReview(r.id, 'approved')}
                    className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t('adminSupport.approvePublish')}
                  </button>
                  <button
                    type="button"
                    onClick={() => moderateReview(r.id, 'rejected')}
                    className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-rose-300 text-rose-700 font-bold"
                  >
                    <XCircle className="w-3.5 h-3.5" /> {t('adminCustomers.reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <h2 className="text-base font-extrabold">{t('adminSupport.qaTitle')}</h2>
          {questions.map((q) => {
            const p = products.find((x) => x.id === q.productId);
            return (
              <div key={q.id} className="p-3 rounded-xl border border-line dark:border-slate-800 space-y-2">
                <p className="font-bold text-brand">{p?.titleFa}</p>
                <p>
                  {q.authorName}: {q.body}
                </p>
                {q.answerBody ? (
                  <p className="p-2 rounded bg-surface/60 dark:bg-slate-800">
                    {t('adminSupport.answerPrefix', { body: q.answerBody })}
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={answerTexts[q.id] ?? ''}
                      onChange={(e) => setAnswerTexts({ ...answerTexts, [q.id]: e.target.value })}
                      placeholder={t('adminSupport.qaPlaceholder')}
                      className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const ans = (answerTexts[q.id] ?? '').trim();
                        if (!ans) return;
                        await answerQuestion(q.id, ans);
                        setAnswerTexts({ ...answerTexts, [q.id]: '' });
                      }}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-brand text-white font-bold shrink-0"
                    >
                      {t('adminSupport.submitAndPublish')}
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
