import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  FileText,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Printer,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../lib/jalali';
import { applySeoHead } from '../lib/seo';
import { CustomerGroupCode, OrderStatus, ProformaInvoice } from '../types/domain';

type AccountTab = 'orders' | 'proformas' | 'b2b' | 'tickets';

const ORDER_STATUS_FA: Record<OrderStatus, string> = {
  pending_payment: 'در انتظار پرداخت',
  awaiting_review: 'در انتظار بررسی اعتبار',
  payment_failed: 'پرداخت ناموفق',
  paid: 'پرداخت‌شده',
  processing: 'در حال پردازش',
  packed: 'بسته‌بندی‌شده',
  shipped: 'ارسال‌شده',
  delivered: 'تحویل‌شده',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
  return_requested: 'درخواست مرجوعی',
  returned: 'مرجوع‌شده',
};

const GROUP_FA: Record<CustomerGroupCode, string> = {
  retail: 'مشتری عادی',
  dentist: 'دندانپزشک تاییدشده',
  clinic: 'کلینیک / درمانگاه',
  lab: 'لابراتوار دندانسازی',
  student: 'دانشجوی دندانپزشکی',
  agent: 'نماینده رسمی',
  wholesale: 'خریدار عمده',
};

const STEPPER: OrderStatus[] = ['paid', 'processing', 'packed', 'shipped', 'delivered'];

export default function AccountPage() {
  const {
    authUser,
    signInWithGoogle,
    logout,
    userProfile,
    customerGroup,
    orders,
    proformas,
    paymentPlans,
    b2bVerifications,
    tickets,
    stockRequests,
    currency,
    settings,
    verifyOnlinePayment,
    cancelOwnOrder,
    respondProforma,
    submitB2BVerification,
    submitTicket,
    replyTicket,
    updateOwnProfile,
    addToCart,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<AccountTab>('orders');
  const [printProforma, setPrintProforma] = useState<ProformaInvoice | null>(null);

  // B2B Form
  const [b2bForm, setB2bForm] = useState({
    applicantName: userProfile?.displayName || '',
    mobile: userProfile?.mobile || '',
    requestedGroup: 'dentist' as Exclude<CustomerGroupCode, 'retail'>,
    clinicName: userProfile?.clinicName || '',
    medicalCouncilNo: userProfile?.medicalCouncilNo || '',
    documentSummary: '',
  });

  // Address Form
  const [addrForm, setAddrForm] = useState({
    label: 'مطب / کلینیک',
    province: 'تهران',
    city: 'تهران',
    postalCode: '',
    addressLine: '',
  });

  // Ticket Form
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    department: 'support' as 'sales' | 'support' | 'accounting' | 'technical',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
    orderNo: '',
    body: '',
  });
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    applySeoHead({
      title: `حساب کاربری و سوابق خرید | ${settings.storeNameFa}`,
      description: 'پنل مشتریان و کلینیک‌ها در دنتال‌مارکت',
      canonicalPath: '/account',
      robots: 'noindex, nofollow',
    });
  }, [settings.storeNameFa]);

  useEffect(() => {
    if (userProfile) {
      setB2bForm((prev) => ({
        ...prev,
        applicantName: prev.applicantName || userProfile.displayName || '',
        mobile: prev.mobile || userProfile.mobile || '',
        clinicName: prev.clinicName || userProfile.clinicName || '',
        medicalCouncilNo: prev.medicalCouncilNo || userProfile.medicalCouncilNo || '',
      }));
    }
  }, [userProfile]);

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-5">
          <ShieldCheck className="w-12 h-12 mx-auto text-brand" />
          <h1 className="text-2xl font-extrabold">ورود به پنل مشتریان و کلینیک‌ها</h1>
          <p className="text-sm text-ink/70 dark:text-slate-400 leading-relaxed">
            برای پیگیری سفارش‌ها، مشاهده پیش‌فاکتورها، ثبت درخواست اعتبار و فعال‌سازی تعرفه همکار (B2B) وارد حساب خود شوید.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="w-full py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors"
          >
            ورود با حساب گوگل
          </button>
        </div>
      </div>
    );
  }

  const myOrders = orders.filter((o) => o.userId === authUser.uid);
  const myProformas = proformas.filter((p) => p.userId === authUser.uid);
  const myTickets = tickets.filter((t) => t.userId === authUser.uid);
  const myVerifications = b2bVerifications.filter((b) => b.userId === authUser.uid);
  const myPlans = paymentPlans.filter((p) => p.userId === authUser.uid);
  const myStockRequests = stockRequests.filter((s) => s.userId === authUser.uid);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrForm.addressLine.trim()) return;
    const existing = userProfile?.addresses ?? [];
    await updateOwnProfile({
      addresses: [
        ...existing,
        {
          id: `addr_${Date.now()}`,
          ...addrForm,
          isDefault: existing.length === 0,
        },
      ],
    });
    setAddrForm({ label: 'مطب / کلینیک', province: 'تهران', city: 'تهران', postalCode: '', addressLine: '' });
  };

  const handleB2BSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitB2BVerification(b2bForm);
    setB2bForm((prev) => ({ ...prev, documentSummary: '' }));
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTicket(ticketForm);
    setTicketForm({ subject: '', department: 'support', priority: 'normal', orderNo: '', body: '' });
  };

  const handleReorder = (items: { productId: string; variantId: string; quantity: number }[]) => {
    items.forEach((it) => addToCart(it.productId, it.variantId, it.quantity));
    pushToast('اقلام سفارش مجدداً به سبد خرید اضافه شدند.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* Header Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center font-extrabold text-xl">
            {(userProfile?.displayName || authUser.displayName || 'ک')[0]}
          </div>
          <div>
            <h1 className="text-xl font-extrabold">{userProfile?.displayName || authUser.displayName}</h1>
            <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">
              {authUser.email} · گروه تعرفه: <strong className="text-brand dark:text-teal-300">{GROUP_FA[customerGroup]}</strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/wishlist" className="px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand">
            علاقه‌مندی‌ها
          </Link>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line dark:border-slate-800 pb-3">
        {[
          { id: 'orders', label: `سفارش‌ها (${toPersianDigits(myOrders.length)})`, icon: Package },
          { id: 'proformas', label: `پیش‌فاکتورها (${toPersianDigits(myProformas.length)})`, icon: FileText },
          { id: 'b2b', label: 'پروفایل، آدرس‌ها و احراز B2B', icon: Building2 },
          { id: 'tickets', label: `تیکت‌ها و درخواست‌ها (${toPersianDigits(myTickets.length)})`, icon: MessageSquare },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as AccountTab)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                tab === item.id
                  ? 'bg-brand text-white'
                  : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800 hover:border-brand'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Orders */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {myOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <p className="font-bold">هنوز سفارشی ثبت نکرده‌اید.</p>
              <Link to="/category/consumables" className="inline-block px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
                شروع خرید تجهیزات و مواد
              </Link>
            </div>
          ) : (
            myOrders.map((order) => {
              const stepIdx = STEPPER.indexOf(order.status);
              return (
                <article
                  key={order.id}
                  className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line dark:border-slate-800 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-base font-extrabold tabular-nums">{order.orderNo}</h2>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-brand/10 text-brand dark:text-teal-300">
                          {ORDER_STATUS_FA[order.status]}
                        </span>
                      </div>
                      <p className="text-xs text-ink/60 dark:text-slate-400">
                        تاریخ ثبت: {formatJalaliDateTime(order.createdAt)} · ارسال: {order.shippingMethod}
                        {order.trackingCode ? ` · کد رهگیری: ${order.trackingCode}` : ''}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-extrabold text-brand dark:text-teal-300 tabular-nums">
                        {formatMoney(order.grandTotal, currency)}
                      </p>
                    </div>
                  </div>

                  {order.status !== 'cancelled' && order.status !== 'returned' && (
                    <div className="grid grid-cols-5 gap-2 text-[11px]">
                      {STEPPER.map((st, idx) => {
                        const done = stepIdx >= idx || order.status === 'completed';
                        return (
                          <div key={st} className="space-y-1 text-center">
                            <div className={`h-1.5 rounded-full ${done ? 'bg-brand' : 'bg-surface dark:bg-slate-800'}`} />
                            <span className={done ? 'font-bold text-brand dark:text-teal-300' : 'text-ink/40'}>
                              {ORDER_STATUS_FA[st]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="divide-y divide-line dark:divide-slate-800 text-xs">
                    {order.items.map((it) => (
                      <div key={it.variantId} className="py-2 flex items-center justify-between gap-4">
                        <span>
                          {it.titleFa} ({it.variantLabelFa}) × <strong className="tabular-nums">{toPersianDigits(it.quantity)}</strong>
                        </span>
                        <span className="font-bold tabular-nums">{formatMoney(it.lineTotal, currency)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {order.status === 'pending_payment' && (
                      <>
                        <button
                          type="button"
                          onClick={() => verifyOnlinePayment(order.id)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                        >
                          پرداخت آنلاین فوری
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelOwnOrder(order.id)}
                          className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
                        >
                          لغو سفارش
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleReorder(order.items)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>سفارش مجدد</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Proformas */}
      {tab === 'proformas' && (
        <div className="space-y-4">
          {myProformas.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-ink/60">
              پیش‌فاکتوری برای حساب شما صادر نشده است.
            </div>
          ) : (
            myProformas.map((pf) => (
              <div
                key={pf.id}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold tabular-nums">{pf.proformaNo}</h2>
                    <p className="text-xs text-ink/60 dark:text-slate-400">
                      معتبر تا {formatJalaliDate(pf.validUntil)} · وضعیت: <strong>{pf.status}</strong>
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-brand tabular-nums">{formatMoney(pf.grandTotal, currency)}</p>
                </div>

                <p className="text-xs text-ink/70 dark:text-slate-400">{pf.termsFa}</p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintProforma(pf)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>پیش‌نمایش چاپ RTL</span>
                  </button>
                  {(pf.status === 'draft' || pf.status === 'sent' || pf.status === 'viewed') && (
                    <>
                      <button
                        type="button"
                        onClick={() => respondProforma(pf.id, 'accepted')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                      >
                        تایید پیش‌فاکتور
                      </button>
                      <button
                        type="button"
                        onClick={() => respondProforma(pf.id, 'rejected')}
                        className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
                      >
                        رد پیش‌فاکتور
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: B2B Verification & Addresses */}
      {tab === 'b2b' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleB2BSubmit}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand" />
              <h2 className="text-lg font-extrabold">درخواست احراز هویت حرفه‌ای (B2B)</h2>
            </div>
            <p className="text-xs text-ink/60 dark:text-slate-400 leading-relaxed">
              پس از تایید شماره نظام پزشکی یا مجوز کلینیک، قیمت‌های ویژه همکار، خرید چکی/اعتباری و فاکتور رسمی برای شما فعال می‌شود.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-bold">نام متقاضی *</span>
                <input
                  required
                  value={b2bForm.applicantName}
                  onChange={(e) => setB2bForm({ ...b2bForm, applicantName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">موبایل *</span>
                <input
                  required
                  value={b2bForm.mobile}
                  onChange={(e) => setB2bForm({ ...b2bForm, mobile: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">گروه درخواستی *</span>
                <select
                  value={b2bForm.requestedGroup}
                  onChange={(e) => setB2bForm({ ...b2bForm, requestedGroup: e.target.value as Exclude<CustomerGroupCode, 'retail'> })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                >
                  <option value="dentist">دندانپزشک</option>
                  <option value="clinic">کلینیک / درمانگاه</option>
                  <option value="lab">لابراتوار دندانسازی</option>
                  <option value="student">دانشجوی دندانپزشکی</option>
                  <option value="agent">نماینده استانی</option>
                  <option value="wholesale">همکار عمده‌فروش</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-bold">شماره نظام پزشکی / دانشجویی *</span>
                <input
                  required
                  value={b2bForm.medicalCouncilNo}
                  onChange={(e) => setB2bForm({ ...b2bForm, medicalCouncilNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="font-bold">نام مطب / کلینیک / مرکز *</span>
                <input
                  required
                  value={b2bForm.clinicName}
                  onChange={(e) => setB2bForm({ ...b2bForm, clinicName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="font-bold">خلاصه مدارک / شماره پروانه</span>
                <textarea
                  rows={2}
                  value={b2bForm.documentSummary}
                  onChange={(e) => setB2bForm({ ...b2bForm, documentSummary: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
            </div>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark">
              ارسال درخواست احراز هویت
            </button>

            {myVerifications.length > 0 && (
              <div className="pt-3 border-t border-line dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-bold">وضعیت درخواست‌های ارسال‌شده:</h3>
                {myVerifications.map((v) => (
                  <div key={v.id} className="p-3 rounded-xl bg-surface/60 dark:bg-slate-800 text-xs flex justify-between items-center">
                    <span>
                      {v.clinicName} ({GROUP_FA[v.requestedGroup]})
                    </span>
                    <span className="font-bold flex items-center gap-1">
                      <BadgeCheck className="w-3.5 h-3.5 text-brand" />
                      {v.status === 'approved' ? 'تاییدشده' : v.status === 'rejected' ? 'ردشده' : 'در حال بررسی'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </form>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-brand" />
              <h2 className="text-lg font-extrabold">نشانی‌های ثبت‌شده</h2>
            </div>

            <div className="space-y-2">
              {(userProfile?.addresses ?? []).length === 0 ? (
                <p className="text-xs text-ink/50">هنوز نشانی ثابتی ذخیره نکرده‌اید.</p>
              ) : (
                userProfile?.addresses?.map((a) => (
                  <div key={a.id} className="p-3 rounded-xl border border-line dark:border-slate-800 text-xs space-y-1">
                    <p className="font-bold">{a.label} — {a.province}، {a.city}</p>
                    <p className="text-ink/70 dark:text-slate-400">{a.addressLine}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3 pt-3 border-t border-line dark:border-slate-800 text-xs">
              <h3 className="font-bold">افزودن نشانی جدید</h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={addrForm.label}
                  onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}
                  placeholder="عنوان (مثلاً مطب ونک)"
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <input
                  value={addrForm.postalCode}
                  onChange={(e) => setAddrForm({ ...addrForm, postalCode: e.target.value })}
                  placeholder="کد پستی"
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <input
                  value={addrForm.province}
                  onChange={(e) => setAddrForm({ ...addrForm, province: e.target.value })}
                  placeholder="استان"
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <input
                  value={addrForm.city}
                  onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                  placeholder="شهر"
                  className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <textarea
                  rows={2}
                  required
                  value={addrForm.addressLine}
                  onChange={(e) => setAddrForm({ ...addrForm, addressLine: e.target.value })}
                  placeholder="نشانی کامل..."
                  className="col-span-2 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </div>
              <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">
                ذخیره نشانی
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Tickets & Credit/Stock Requests */}
      {tab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleTicketSubmit}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs"
          >
            <h2 className="text-base font-extrabold">ارسال تیکت پشتیبانی جدید</h2>
            <input
              required
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              placeholder="موضوع تیکت..."
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={ticketForm.department}
                onChange={(e) => setTicketForm({ ...ticketForm, department: e.target.value as typeof ticketForm.department })}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                <option value="support">پشتیبانی و پیگیری</option>
                <option value="sales">فروش و پیش‌فاکتور</option>
                <option value="technical">خدمات فنی تجهیزات</option>
                <option value="accounting">امور مالی و فاکتور</option>
              </select>
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as typeof ticketForm.priority })}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                <option value="normal">اولویت عادی</option>
                <option value="high">اولویت بالا</option>
                <option value="urgent">فوری (اختلال دستگاه)</option>
              </select>
            </div>
            <input
              value={ticketForm.orderNo}
              onChange={(e) => setTicketForm({ ...ticketForm, orderNo: e.target.value })}
              placeholder="شماره سفارش مرتبط (اختیاری)"
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              required
              rows={3}
              value={ticketForm.body}
              onChange={(e) => setTicketForm({ ...ticketForm, body: e.target.value })}
              placeholder="شرح پیام..."
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
              ثبت تیکت
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {myTickets.map((tk) => (
              <div key={tk.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <strong className="text-sm">{tk.subject}</strong>
                  <span className="tabular-nums text-brand font-bold">{tk.ticketNo} · {tk.status}</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {tk.messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-xs ${
                        m.isStaff ? 'bg-brand/10 border border-brand/20' : 'bg-surface/70 dark:bg-slate-800'
                      }`}
                    >
                      <p className="font-bold text-[11px] text-ink/70 dark:text-slate-300">
                        {m.authorName} · {formatJalaliDateTime(m.createdAt)}
                      </p>
                      <p className="mt-1 leading-relaxed">{m.body}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={replyTexts[tk.id] ?? ''}
                    onChange={(e) => setReplyTexts({ ...replyTexts, [tk.id]: e.target.value })}
                    placeholder="ارسال پاسخ جدید..."
                    className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const txt = (replyTexts[tk.id] ?? '').trim();
                      if (!txt) return;
                      await replyTicket(tk.id, txt, false);
                      setReplyTexts({ ...replyTexts, [tk.id]: '' });
                    }}
                    className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold"
                  >
                    ارسال
                  </button>
                </div>
              </div>
            ))}

            {myPlans.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-extrabold">پرونده‌های خرید اعتباری / چکی</h3>
                {myPlans.map((pl) => (
                  <div key={pl.id} className="text-xs flex justify-between py-2 border-b border-line dark:border-slate-800 last:border-0">
                    <span>{pl.proposedTermsFa}</span>
                    <span className="font-bold tabular-nums">{formatMoney(pl.requestedAmount, currency)} · {pl.status}</span>
                  </div>
                ))}
              </div>
            )}

            {myStockRequests.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-extrabold">درخواست‌های تامین کالای ناموجود</h3>
                {myStockRequests.map((sr) => (
                  <div key={sr.id} className="text-xs flex justify-between py-2 border-b border-line dark:border-slate-800 last:border-0">
                    <span>{sr.titleText}</span>
                    <span className="font-bold text-brand">{sr.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Proforma Modal */}
      {printProforma && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white text-ink rounded-2xl max-w-2xl w-full p-8 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start border-b border-line pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-brand">{settings.storeNameFa} — پیش‌فاکتور رسمی</h2>
                <p className="text-xs text-ink/60 mt-1">کد IMED: {settings.imedRegistryCode} · تلفن: {settings.phone}</p>
              </div>
              <div className="text-left text-xs space-y-1">
                <p className="font-extrabold tabular-nums">شماره: {printProforma.proformaNo}</p>
                <p>اعتبار تا: {formatJalaliDate(printProforma.validUntil)}</p>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <p>خریدار: <strong>{printProforma.contactName}</strong> {printProforma.clinicName ? `(${printProforma.clinicName})` : ''}</p>
              <p>تلفن: <span className="tabular-nums">{printProforma.contactMobile}</span></p>
            </div>
            <table className="w-full text-xs border-collapse border border-line">
              <thead>
                <tr className="bg-surface">
                  <th className="border border-line p-2 text-right">شرح کالا</th>
                  <th className="border border-line p-2">تعداد</th>
                  <th className="border border-line p-2">فی</th>
                  <th className="border border-line p-2">جمع</th>
                </tr>
              </thead>
              <tbody>
                {printProforma.items.map((it) => (
                  <tr key={it.variantId}>
                    <td className="border border-line p-2">{it.titleFa} ({it.variantLabelFa})</td>
                    <td className="border border-line p-2 text-center tabular-nums">{toPersianDigits(it.quantity)}</td>
                    <td className="border border-line p-2 text-center tabular-nums">{formatMoney(it.unitPrice, currency)}</td>
                    <td className="border border-line p-2 text-center tabular-nums">{formatMoney(it.lineTotal, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center text-sm font-extrabold pt-2">
              <span>جمع کل قابل پرداخت با مالیات:</span>
              <span className="tabular-nums text-brand">{formatMoney(printProforma.grandTotal, currency)}</span>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold"
              >
                چاپ / ذخیره PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintProforma(null)}
                className="px-4 py-2 rounded-lg border border-line text-xs font-bold"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
