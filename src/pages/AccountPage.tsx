import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  FileText,
  Handshake,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../lib/jalali';
import { applySeoHead } from '../lib/seo';
import { CustomerGroupCode, InvoiceRecord, Order, OrderStatus, ProformaInvoice, RfqStatus } from '../types/domain';

type AccountTab = 'orders' | 'rfqs' | 'proformas' | 'invoices' | 'returns' | 'b2b' | 'tickets';

const RFQ_STATUS_FA: Record<RfqStatus, string> = {
  submitted: 'ثبت‌شده (در انتظار بررسی)',
  in_review: 'در حال بررسی کارشناس',
  quoted: 'قیمت اعلام‌شده (در انتظار تصمیم شما)',
  accepted: 'تاییدشده توسط خریدار',
  rejected: 'ردشده',
  converted: 'تبدیل‌شده به پیش‌فاکتور',
};

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
  expired: 'منقضی‌شده (عدم پرداخت)',
  refunded: 'مستردشده',
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
    mobileSession,
    signInWithGoogle,
    logout,
    sendMobileOtp,
    verifyMobileOtp,
    logoutMobile,
    userProfile,
    customerGroup,
    orders,
    mobileOrders,
    rfqs,
    guestOrders,
    invoices,
    returns,
    proformas,
    paymentPlans,
    b2bVerifications,
    tickets,
    stockRequests,
    currency,
    settings,
    verifyOnlinePayment,
    lookupGuestOrder,
    cancelOwnOrder,
    respondProforma,
    sendRfqMessage,
    respondRfq,
    submitB2BVerification,
    submitReturnRequest,
    submitTicket,
    replyTicket,
    updateOwnProfile,
    addToCart,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<AccountTab>('orders');
  const [printProforma, setPrintProforma] = useState<ProformaInvoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<InvoiceRecord | null>(null);

  // Guest / Mobile OTP session state
  const [trackOrderNo, setTrackOrderNo] = useState('');
  const [trackMobile, setTrackMobile] = useState('');
  const [trackedGuestOrder, setTrackedGuestOrder] = useState<Order | null>(null);
  const [otpMobile, setOtpMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [rfqReplyTexts, setRfqReplyTexts] = useState<Record<string, string>>({});
  const [rfqCounterPrices, setRfqCounterPrices] = useState<Record<string, string>>({});

  // Profile & Legal Info Form
  const [profileForm, setProfileForm] = useState({
    displayName: userProfile?.displayName || '',
    mobile: userProfile?.mobile || '',
    accountType: userProfile?.accountType || ('clinic' as 'individual' | 'clinic' | 'lab' | 'student' | 'agent' | 'company'),
    clinicName: userProfile?.clinicName || '',
    medicalCouncilNo: userProfile?.medicalCouncilNo || '',
    specialty: userProfile?.specialty || '',
    legalCompanyName: userProfile?.legalCompanyName || '',
    economicCode: userProfile?.economicCode || '',
    nationalId: userProfile?.nationalId || '',
    registrationNo: userProfile?.registrationNo || '',
  });

  // B2B Form
  const [b2bForm, setB2bForm] = useState({
    applicantName: userProfile?.displayName || '',
    mobile: userProfile?.mobile || '',
    requestedGroup: 'dentist' as Exclude<CustomerGroupCode, 'retail'>,
    clinicName: userProfile?.clinicName || '',
    medicalCouncilNo: userProfile?.medicalCouncilNo || '',
    documentSummary: '',
    attachmentName: '',
    attachmentPreview: '',
  });

  // Return modal state
  const [returnTargetOrder, setReturnTargetOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState('عدم تطابق با سایز/مشخصات یا آسیب بسته‌بندی');
  const [returnResolution, setReturnResolution] = useState<'refund' | 'replacement' | 'credit'>('refund');

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
      setProfileForm({
        displayName: userProfile.displayName || '',
        mobile: userProfile.mobile || '',
        accountType: userProfile.accountType || 'clinic',
        clinicName: userProfile.clinicName || '',
        medicalCouncilNo: userProfile.medicalCouncilNo || '',
        specialty: userProfile.specialty || '',
        legalCompanyName: userProfile.legalCompanyName || '',
        economicCode: userProfile.economicCode || '',
        nationalId: userProfile.nationalId || '',
        registrationNo: userProfile.registrationNo || '',
      });
    }
  }, [userProfile]);

  const handleGuestLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = await lookupGuestOrder(trackOrderNo, trackMobile);
    if (!found) {
      pushToast('سفارشی با این شماره و موبایل یافت نشد.', 'error');
    } else {
      setTrackedGuestOrder(found);
      pushToast('وضعیت سفارش مهمان بازیابی شد.', 'success');
    }
  };

  const handleGuestOtpSend = async () => {
    if (!otpMobile.trim()) return;
    setOtpBusy(true);
    try {
      const res = await sendMobileOtp(otpMobile.trim());
      if (res.ok) {
        setOtpSent(true);
        setOtpHint(res.sandboxCode ? `کد تایید آزمایشی (Sandbox): ${toPersianDigits(res.sandboxCode)}` : '');
      }
    } finally {
      setOtpBusy(false);
    }
  };

  const handleGuestOtpVerify = async () => {
    if (!otpMobile.trim() || !otpCode.trim()) return;
    setOtpBusy(true);
    try {
      const res = await verifyMobileOtp(otpMobile.trim(), otpCode.trim());
      if (res.ok) {
        setOtpCode('');
        setOtpHint('');
      }
    } finally {
      setOtpBusy(false);
    }
  };

  if (!authUser && !mobileSession) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 space-y-5">
          <ShieldCheck className="w-10 h-10 text-brand" />
          <h1 className="text-xl font-extrabold">ورود به پنل مشتریان و کلینیک‌ها</h1>
          <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed">
            با شماره موبایل و کد یک‌بارمصرف پیامکی (OTP) یا حساب گوگل وارد پنل سفارش‌ها، استعلام قیمت (RFQ) و پرونده B2B شوید.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="w-full py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors"
          >
            ورود با حساب گوگل
          </button>

          <div className="pt-4 border-t border-line dark:border-slate-800 space-y-2.5 text-xs">
            <p className="font-bold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-brand" />
              <span>ورود سریع با شماره موبایل (OTP)</span>
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                data-testid="otp-mobile-input"
                value={otpMobile}
                onChange={(e) => setOtpMobile(e.target.value)}
                placeholder="0912..."
                className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={otpBusy}
                data-testid="otp-send-button"
                onClick={handleGuestOtpSend}
                className="px-3.5 py-2 rounded-lg border border-brand text-brand font-bold disabled:opacity-50"
              >
                ارسال کد
              </button>
            </div>
            {otpSent && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    data-testid="otp-code-input"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="کد پیامکی ۶ رقمی"
                    className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
                  />
                  <button
                    type="button"
                    disabled={otpBusy}
                    data-testid="otp-verify-button"
                    onClick={handleGuestOtpVerify}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-50"
                  >
                    ورود به حساب
                  </button>
                </div>
                {otpHint && (
                  <p data-testid="otp-sandbox-hint" className="text-[11px] text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 rounded-lg">
                    {otpHint}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-6 h-6 text-brand" />
            <h2 className="text-xl font-extrabold">پیگیری سفارش مهمان</h2>
          </div>
          <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed">
            اگر بدون ورود به حساب کاربری سفارش ثبت کرده‌اید، شماره سفارش و شماره موبایل خود را وارد کنید.
          </p>
          <form onSubmit={handleGuestLookup} className="space-y-3 text-xs">
            <input
              required
              value={trackOrderNo}
              onChange={(e) => setTrackOrderNo(e.target.value)}
              placeholder="شماره سفارش (مثلاً DM-1404-...)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              required
              type="tel"
              value={trackMobile}
              onChange={(e) => setTrackMobile(e.target.value)}
              placeholder="شماره همراه ثبت‌شده در سفارش"
              className="w-full px-3.5 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brandDark">
              استعلام وضعیت سفارش
            </button>
          </form>

          {trackedGuestOrder && (
            <div className="p-4 rounded-xl bg-surface/60 dark:bg-slate-800 text-xs space-y-1.5">
              <p className="font-extrabold tabular-nums">
                {trackedGuestOrder.orderNo} — {ORDER_STATUS_FA[trackedGuestOrder.status]}
              </p>
              <p>مبلغ: {formatMoney(trackedGuestOrder.grandTotal, currency)}</p>
              <p>تاریخ: {formatJalaliDateTime(trackedGuestOrder.createdAt)}</p>
              {trackedGuestOrder.trackingCode && <p>کد رهگیری: {trackedGuestOrder.trackingCode}</p>}
            </div>
          )}

          {guestOrders.length > 0 && (
            <div className="pt-3 border-t border-line dark:border-slate-800 space-y-2 text-xs">
              <p className="font-bold">آخرین سفارش‌های ثبت‌شده در این مرورگر:</p>
              {guestOrders.slice(0, 3).map((go) => (
                <div key={go.id} className="flex justify-between p-2 rounded-lg bg-surface/50 dark:bg-slate-800/50">
                  <span className="font-bold tabular-nums">{go.orderNo}</span>
                  <span className="tabular-nums">{formatMoney(go.grandTotal, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const myOrders = (() => {
    const cloudOrders = authUser ? orders.filter((o) => o.userId === authUser.uid) : [];
    const map = new Map<string, Order>();
    cloudOrders.forEach((o) => map.set(o.id, o));
    mobileOrders.forEach((o) => {
      if (!map.has(o.id)) map.set(o.id, o);
    });
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  })();
  const myRfqs = rfqs;
  const proformaUid = authUser ? authUser.uid : mobileSession ? `mobile:${mobileSession.mobile}` : '';
  const myProformas = proformaUid ? proformas.filter((p) => p.userId === proformaUid) : [];
  const myInvoices = invoices.filter((inv) => myOrders.some((o) => o.id === inv.orderId));
  const myReturns = returns.filter((r) => (authUser && r.userId === authUser.uid) || myOrders.some((o) => o.id === r.orderId));
  const myTickets = authUser ? tickets.filter((t) => t.userId === authUser.uid) : [];
  const myVerifications = authUser ? b2bVerifications.filter((b) => b.userId === authUser.uid) : [];
  const myPlans = authUser ? paymentPlans.filter((p) => p.userId === authUser.uid) : [];
  const myStockRequests = authUser ? stockRequests.filter((s) => s.userId === authUser.uid) : [];

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateOwnProfile(profileForm);
  };

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

  const handleB2BFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 480;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6).slice(0, 45000);
          setB2bForm((prev) => ({ ...prev, attachmentName: file.name, attachmentPreview: dataUrl }));
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    } else {
      setB2bForm((prev) => ({
        ...prev,
        attachmentName: file.name,
        attachmentPreview: `فایل انتخاب‌شده: ${file.name} (${Math.ceil(file.size / 1024)} KB)`,
      }));
    }
  };

  const handleB2BSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitB2BVerification(b2bForm);
    setB2bForm((prev) => ({ ...prev, documentSummary: '', attachmentName: '', attachmentPreview: '' }));
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetOrder) return;
    await submitReturnRequest({
      orderId: returnTargetOrder.id,
      items: returnTargetOrder.items.slice(0, 2).map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        titleFa: it.titleFa,
        quantity: it.quantity,
      })),
      reasonFa: returnReason,
      resolution: returnResolution,
      refundAmount: returnTargetOrder.grandTotal,
    });
    setReturnTargetOrder(null);
    setTab('returns');
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

  const displayTitle =
    userProfile?.displayName || authUser?.displayName || mobileSession?.displayName || `مشتری ${toPersianDigits(mobileSession?.mobile || '')}`;
  const displayIdentity = authUser?.email || (mobileSession ? `شماره تاییدشده: ${toPersianDigits(mobileSession.mobile)}` : '');

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* Header Summary Card */}
      <div data-testid="account-authenticated-header" className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center font-extrabold text-xl">
            {(displayTitle || 'ک')[0]}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold">{displayTitle}</h1>
              {mobileSession && !authUser && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  نشست موبایلی فعال
                </span>
              )}
            </div>
            <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">
              {displayIdentity} · گروه تعرفه: <strong className="text-brand dark:text-teal-300">{GROUP_FA[customerGroup]}</strong>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/wishlist" className="px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand">
            علاقه‌مندی‌ها
          </Link>
          {!authUser && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
            >
              اتصال اختیاری با گوگل برای پرونده B2B و پیش‌فاکتور
            </button>
          )}
          {mobileSession && (
            <button
              type="button"
              onClick={logoutMobile}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج از نشست موبایل</span>
            </button>
          )}
          {authUser && (
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line dark:border-slate-800 pb-3">
        {[
          { id: 'orders', label: `سفارش‌ها (${toPersianDigits(myOrders.length)})`, icon: Package },
          { id: 'rfqs', label: `استعلام قیمت و چانه‌زنی (${toPersianDigits(myRfqs.length)})`, icon: Handshake },
          { id: 'proformas', label: `پیش‌فاکتورها (${toPersianDigits(myProformas.length)})`, icon: FileText },
          { id: 'invoices', label: `فاکتورهای رسمی (${toPersianDigits(myInvoices.length)})`, icon: Printer },
          { id: 'returns', label: `مرجوعی‌ها (${toPersianDigits(myReturns.length)})`, icon: RotateCcw },
          { id: 'b2b', label: 'پروفایل حقوقی، آدرس و احراز B2B', icon: Building2 },
          { id: 'tickets', label: `تیکت‌ها و درخواست‌ها (${toPersianDigits(myTickets.length)})`, icon: MessageSquare },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`account-tab-${item.id}`}
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
              const canReturn = ['paid', 'delivered', 'completed', 'shipped'].includes(order.status);
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
                    {canReturn && (
                      <button
                        type="button"
                        onClick={() => setReturnTargetOrder(order)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-300 text-xs font-bold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>درخواست مرجوعی کالا</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Tab 1.5: RFQs (استعلام قیمت و مذاکره دوطرفه) */}
      {tab === 'rfqs' && (
        <div className="space-y-4">
          {myRfqs.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <p className="font-bold">هنوز درخواست استعلام قیمتی ثبت نکرده‌اید.</p>
              <p className="text-xs text-ink/60 dark:text-slate-400">
                در صفحه هر محصول (به‌خصوص تجهیزات سرمایه‌ای و خریدهای عمده) می‌توانید دکمه «استعلام قیمت همکار / خرید عمده» را بزنید.
              </p>
            </div>
          ) : (
            myRfqs.map((rfq) => (
              <article
                key={rfq.id}
                data-testid={`rfq-card-${rfq.id}`}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-extrabold tabular-nums">{rfq.rfqNo} — {rfq.productTitleFa}</h2>
                      <span className="px-2.5 py-0.5 rounded-md bg-brand/10 text-brand dark:text-teal-300 font-bold">
                        {RFQ_STATUS_FA[rfq.status]}
                      </span>
                    </div>
                    <p className="text-ink/60 dark:text-slate-400 mt-1 tabular-nums">
                      تعداد درخواستی: {toPersianDigits(rfq.quantity)} عدد
                      {rfq.targetUnitPrice ? ` · قیمت پیشنهادی اولیه شما: ${formatMoney(rfq.targetUnitPrice, currency)}` : ''}
                      {rfq.validUntil ? ` · اعتبار پیشنهاد: ${formatJalaliDate(rfq.validUntil)}` : ''}
                    </p>
                  </div>
                  {rfq.quotedUnitPrice && (
                    <div className="text-left">
                      <p className="text-[11px] text-ink/60">پیشنهاد رسمی فروشنده (واحد)</p>
                      <p className="text-base font-extrabold text-brand dark:text-teal-300 tabular-nums">
                        {formatMoney(rfq.quotedUnitPrice, currency)}
                      </p>
                      {rfq.quotedTotal && (
                        <p className="text-[11px] font-bold text-ink/70 tabular-nums">
                          جمع کل: {formatMoney(rfq.quotedTotal, currency)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Thread */}
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {rfq.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl ${
                        m.isStaff
                          ? 'bg-brand/10 border border-brand/20'
                          : 'bg-surface/70 dark:bg-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] text-ink/65 dark:text-slate-400">
                        <span className="font-bold">{m.authorName}</span>
                        <span className="tabular-nums">{formatJalaliDateTime(m.createdAt)}</span>
                      </div>
                      <p className="mt-1 leading-relaxed">{m.body}</p>
                      {m.proposedUnitPrice ? (
                        <p className="mt-1 font-bold text-brand tabular-nums">
                          قیمت پیشنهادی مطرح‌شده: {formatMoney(m.proposedUnitPrice, currency)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {rfq.status === 'quoted' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => respondRfq(rfq.id, 'accepted')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                    >
                      تایید قیمت اعلام‌شده
                    </button>
                    <button
                      type="button"
                      onClick={() => respondRfq(rfq.id, 'rejected')}
                      className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 font-bold"
                    >
                      رد پیشنهاد قیمت
                    </button>
                  </div>
                )}

                {rfq.status !== 'converted' && rfq.status !== 'rejected' && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-line dark:border-slate-800">
                    <input
                      value={rfqReplyTexts[rfq.id] ?? ''}
                      onChange={(e) => setRfqReplyTexts({ ...rfqReplyTexts, [rfq.id]: e.target.value })}
                      placeholder="پیام یا توضیح چانه‌زنی جدید برای واحد فروش..."
                      className="sm:col-span-7 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                    <input
                      type="number"
                      value={rfqCounterPrices[rfq.id] ?? ''}
                      onChange={(e) => setRfqCounterPrices({ ...rfqCounterPrices, [rfq.id]: e.target.value })}
                      placeholder="قیمت پیشنهادی واحد (اختیاری)"
                      className="sm:col-span-3 px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const msg = (rfqReplyTexts[rfq.id] ?? '').trim();
                        if (!msg) return;
                        const cpRaw = Number(rfqCounterPrices[rfq.id]);
                        const ok = await sendRfqMessage(
                          rfq.id,
                          msg,
                          Number.isFinite(cpRaw) && cpRaw > 0 ? cpRaw : undefined
                        );
                        if (ok) {
                          setRfqReplyTexts({ ...rfqReplyTexts, [rfq.id]: '' });
                          setRfqCounterPrices({ ...rfqCounterPrices, [rfq.id]: '' });
                        }
                      }}
                      className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>ارسال</span>
                    </button>
                  </div>
                )}
              </article>
            ))
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
                  {pf.shareToken && (
                    <Link
                      to={`/proforma/${pf.shareToken}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand"
                    >
                      لینک اشتراک‌گذاری کلینیک
                    </Link>
                  )}
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

      {/* Tab 3: Invoices */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          {myInvoices.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-ink/60">
              هنوز فاکتور رسمی برای سفارش‌های شما صادر نشده است.
            </div>
          ) : (
            myInvoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <h2 className="text-base font-extrabold tabular-nums">
                    {inv.invoiceNo} ({inv.isOfficial ? 'فاکتور رسمی مالیاتی' : 'فاکتور فروش'})
                  </h2>
                  <p className="text-ink/60 dark:text-slate-400">
                    سفارش: {inv.orderNo} · تاریخ صدور: {formatJalaliDate(inv.issuedAt)} · وضعیت: {inv.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-extrabold text-brand tabular-nums">
                    {formatMoney(inv.grandTotal, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrintInvoice(inv)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
                  >
                    <Printer className="w-4 h-4" />
                    <span>مشاهده و چاپ</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Returns */}
      {tab === 'returns' && (
        <div className="space-y-4">
          {myReturns.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-ink/60">
              درخواست مرجوعی ثبت‌شده‌ای ندارید.
            </div>
          ) : (
            myReturns.map((ret) => (
              <div
                key={ret.id}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <strong className="text-sm tabular-nums">{ret.returnNo} — سفارش {ret.orderNo}</strong>
                  <span className="font-bold text-brand">{ret.status}</span>
                </div>
                <p>علت: {ret.reasonFa}</p>
                <p className="text-ink/60">
                  درخواست: {ret.resolution === 'refund' ? 'استرداد وجه' : ret.resolution === 'replacement' ? 'تعویض کالا' : 'اعتبار حساب'} · مبلغ: {formatMoney(ret.refundAmount, currency)}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 5: B2B Verification, Legal Profile & Addresses */}
      {tab === 'b2b' && !authUser && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-3 text-xs">
          <p className="font-extrabold text-base">پرونده حقوقی و احراز هویت B2B نیازمند اتصال به حساب کاربری است</p>
          <p className="text-ink/70 dark:text-slate-400">
            شما با نشست موبایلی وارد شده‌اید؛ برای ثبت مدارک نظام پزشکی و دریافت فاکتور رسمی حقوقی، حساب گوگل خود را متصل کنید.
          </p>
          <button type="button" onClick={signInWithGoogle} className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
            اتصال با حساب گوگل
          </button>
        </div>
      )}
      {tab === 'b2b' && authUser && (
        <div className="space-y-6">
          <form
            onSubmit={handleProfileSave}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4 text-xs"
          >
            <h2 className="text-lg font-extrabold">مشخصات پروفایل و اطلاعات فاکتور رسمی حقوقی</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="font-bold">نام و نام خانوادگی</span>
                <input
                  value={profileForm.displayName}
                  onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">موبایل</span>
                <input
                  value={profileForm.mobile}
                  onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">نوع حساب</span>
                <select
                  value={profileForm.accountType}
                  onChange={(e) => setProfileForm({ ...profileForm, accountType: e.target.value as 'individual' | 'clinic' | 'lab' | 'student' | 'agent' | 'company' })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                >
                  <option value="individual">حقیقی (پزشک / فردی)</option>
                  <option value="clinic">کلینیک / درمانگاه</option>
                  <option value="company">حقوقی (شرکت)</option>
                  <option value="lab">لابراتوار دندانسازی</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-bold">نام کلینیک / شرکت حقوقی</span>
                <input
                  value={profileForm.legalCompanyName}
                  onChange={(e) => setProfileForm({ ...profileForm, legalCompanyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">کد اقتصادی</span>
                <input
                  value={profileForm.economicCode}
                  onChange={(e) => setProfileForm({ ...profileForm, economicCode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">شناسه ملی</span>
                <input
                  value={profileForm.nationalId}
                  onChange={(e) => setProfileForm({ ...profileForm, nationalId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">شماره ثبت</span>
                <input
                  value={profileForm.registrationNo}
                  onChange={(e) => setProfileForm({ ...profileForm, registrationNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">شماره نظام پزشکی</span>
                <input
                  value={profileForm.medicalCouncilNo}
                  onChange={(e) => setProfileForm({ ...profileForm, medicalCouncilNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">تخصص</span>
                <input
                  value={profileForm.specialty}
                  onChange={(e) => setProfileForm({ ...profileForm, specialty: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
            </div>
            <button type="submit" className="px-5 py-2 rounded-xl bg-brand text-white font-bold">
              ذخیره اطلاعات پروفایل و حقوقی
            </button>
          </form>

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
                  <span className="font-bold">آپلود تصویر کارت نظام پزشکی یا پروانه کسب</span>
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-line dark:border-slate-700 cursor-pointer hover:border-brand">
                    <Upload className="w-4 h-4 text-brand" />
                    <span>{b2bForm.attachmentName || 'انتخاب فایل (تصویر یا PDF)'}</span>
                    <input type="file" accept="image/*,.pdf" onChange={handleB2BFileUpload} className="hidden" />
                  </label>
                  {b2bForm.attachmentPreview.startsWith('data:image') && (
                    <img src={b2bForm.attachmentPreview} alt="پیش‌نمایش مدرک" className="h-20 rounded-lg border border-line mt-2" />
                  )}
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
        </div>
      )}

      {/* Tab 6: Tickets & Credit/Stock Requests */}
      {tab === 'tickets' && !authUser && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-3 text-xs">
          <p className="font-extrabold text-base">تیکت پشتیبانی ابری نیازمند اتصال با حساب گوگل است</p>
          <p className="text-ink/70 dark:text-slate-400">
            برای گفتگو با پشتیبانی در مورد استعلام قیمت‌ها می‌توانید از تب «استعلام قیمت و چانه‌زنی» استفاده کنید یا برای تیکت پشتیبانی با گوگل متصل شوید.
          </p>
          <button type="button" onClick={signInWithGoogle} className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold">
            اتصال با حساب گوگل
          </button>
        </div>
      )}
      {tab === 'tickets' && authUser && (
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

      {/* Return Request Modal */}
      {returnTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleReturnSubmit}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <h2 className="text-base font-extrabold">ثبت درخواست مرجوعی سفارش {returnTargetOrder.orderNo}</h2>
            <label className="block space-y-1">
              <span className="font-bold">علت مرجوعی</span>
              <textarea
                required
                rows={3}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-bold">نحوه تسویه مورد نظر</span>
              <select
                value={returnResolution}
                onChange={(e) => setReturnResolution(e.target.value as typeof returnResolution)}
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                <option value="refund">استرداد وجه به حساب بانکی</option>
                <option value="replacement">تعویض کالا</option>
                <option value="credit">شارژ اعتبار کیف پول مطب</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReturnTargetOrder(null)} className="px-4 py-2 rounded-lg border border-line font-bold">
                انصراف
              </button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-brand text-white font-bold">
                ثبت درخواست مرجوعی
              </button>
            </div>
          </form>
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
              <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold">
                چاپ / ذخیره PDF
              </button>
              <button type="button" onClick={() => setPrintProforma(null)} className="px-4 py-2 rounded-lg border border-line text-xs font-bold">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Official Invoice Modal */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white text-ink rounded-2xl max-w-2xl w-full p-8 space-y-5 shadow-2xl text-xs">
            <div className="flex justify-between items-start border-b border-line pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-brand">
                  {settings.storeNameFa} — {printInvoice.isOfficial ? 'صورتحساب فروش رسمی کالا و خدمات' : 'فاکتور فروش'}
                </h2>
                <p className="text-ink/60 mt-1">نشانی فروشنده: {settings.addressFa}</p>
              </div>
              <div className="text-left space-y-1">
                <p className="font-extrabold tabular-nums">شماره فاکتور: {printInvoice.invoiceNo}</p>
                <p>تاریخ صدور: {formatJalaliDate(printInvoice.issuedAt)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface/60">
              <p>نام خریدار: <strong>{printInvoice.customerName}</strong></p>
              <p>شناسه ملی / کدملی: <strong className="tabular-nums">{printInvoice.nationalId || '—'}</strong></p>
              <p>کد اقتصادی: <strong className="tabular-nums">{printInvoice.economicCode || '—'}</strong></p>
              <p>وضعیت فاکتور: <strong>{printInvoice.status === 'issued' ? 'صادرشده' : 'باطل‌شده'}</strong></p>
            </div>
            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex justify-between">
                <span>جمع خالص اقلام:</span>
                <strong className="tabular-nums">{formatMoney(printInvoice.subtotal, currency)}</strong>
              </div>
              <div className="flex justify-between">
                <span>مالیات بر ارزش افزوده:</span>
                <strong className="tabular-nums">{formatMoney(printInvoice.taxTotal, currency)}</strong>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-brand border-t border-line pt-2">
                <span>مبلغ قابل پرداخت نهایی:</span>
                <span className="tabular-nums">{formatMoney(printInvoice.grandTotal, currency)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-brand text-white font-bold">
                چاپ فاکتور
              </button>
              <button type="button" onClick={() => setPrintInvoice(null)} className="px-4 py-2 rounded-lg border border-line font-bold">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
