import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpLeft,
  Calendar,
  Clock,
  CreditCard,
  PackageX,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { daysUntil, formatJalaliDate, formatMoney, formatNumber, toPersianDigits } from '../../lib/jalali';
import { getVariantAvailableStock } from '../../lib/pricing';
import { canSeeCostPrice } from '../../components/admin/rbac';

type RangePreset = 'today' | '7d' | '30d' | 'year' | 'all';

const CHART_COLORS = ['#17788C', '#0F5667', '#2A9D8F', '#E9C46A', '#E76F51', '#64748B'];

export default function AdminDashboardHome() {
  const {
    activeAdminRole,
    orders,
    products,
    proformas,
    b2bVerifications,
    tickets,
    stockRequests,
    currency,
    settings,
    reviewB2BVerification,
  } = useStore();

  const [range, setRange] = useState<RangePreset>('all');

  const filteredOrders = useMemo(() => {
    if (range === 'all') return orders;
    const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 365;
    const cutoff = Date.now() - days * 86400000;
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return Number.isNaN(t) ? true : t >= cutoff;
    });
  }, [orders, range]);

  const kpis = useMemo(() => {
    const validOrders = filteredOrders.filter((o) => o.status !== 'cancelled');
    const paidOrders = validOrders.filter((o) => o.paymentStatus === 'paid');
    const revenue = paidOrders.reduce((s, o) => s + o.grandTotal, 0);
    const aov = paidOrders.length > 0 ? Math.round(revenue / paidOrders.length) : 0;
    const pendingAction = orders.filter((o) => ['paid', 'processing', 'awaiting_review'].includes(o.status)).length;
    const unpaid = orders.filter((o) => o.status === 'pending_payment').length;
    const openProformas = proformas.filter((p) => ['draft', 'sent', 'viewed'].includes(p.status)).length;
    const pendingB2B = b2bVerifications.filter((b) => b.status === 'pending').length;
    const openTickets = tickets.filter((t) => ['open', 'pending_staff'].includes(t.status)).length;

    let lowStockCount = 0;
    let nearExpiryCount = 0;
    let stockValuation = 0;

    products.forEach((p) => {
      p.variants.forEach((v) => {
        const avail = getVariantAvailableStock(v);
        if (avail <= v.lowStockThreshold) lowStockCount++;
        stockValuation += v.stockOnHand * (v.costPrice ?? (v.basePrice ? Math.round(v.basePrice * 0.72) : 0));
        v.batches?.forEach((b) => {
          const d = daysUntil(b.expiresAt);
          if (b.qtyOnHand > 0 && d !== null && d <= settings.nearExpiryThresholdDays && d >= 0) {
            nearExpiryCount++;
          }
        });
      });
    });

    const openStockRequests = stockRequests.filter((r) => r.status === 'new').length;

    return {
      revenue,
      ordersCount: validOrders.length,
      aov,
      pendingAction,
      unpaid,
      openProformas,
      pendingB2B,
      openTickets,
      lowStockCount,
      nearExpiryCount,
      stockValuation,
      openStockRequests,
    };
  }, [filteredOrders, orders, products, proformas, b2bVerifications, tickets, stockRequests, settings]);

  // Charts Data
  const salesTrendData = useMemo(() => {
    const byDay = new Map<string, { label: string; revenue: number; orders: number }>();
    filteredOrders.forEach((o) => {
      const label = formatJalaliDate(o.createdAt);
      const prev = byDay.get(label) ?? { label, revenue: 0, orders: 0 };
      prev.orders += 1;
      if (o.status !== 'cancelled') prev.revenue += o.grandTotal;
      byDay.set(label, prev);
    });
    return Array.from(byDay.values());
  }, [filteredOrders]);

  const statusDonutData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      map.set(o.status, (map.get(o.status) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const topProductsData = useMemo(() => {
    return [...products]
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 6)
      .map((p) => ({
        name: p.titleFa.slice(0, 26),
        sold: p.soldCount,
      }));
  }, [products]);

  const expiryRiskBuckets = useMemo(() => {
    const buckets = [
      { bucket: '۰ تا ۳۰ روز', qty: 0 },
      { bucket: '۳۱ تا ۶۰ روز', qty: 0 },
      { bucket: '۶۱ تا ۹۰ روز', qty: 0 },
      { bucket: '۹۱ تا ۱۸۰ روز', qty: 0 },
    ];
    products.forEach((p) =>
      p.variants.forEach((v) =>
        v.batches?.forEach((b) => {
          const d = daysUntil(b.expiresAt);
          if (d === null || b.qtyOnHand <= 0 || d < 0) return;
          if (d <= 30) buckets[0].qty += b.qtyOnHand;
          else if (d <= 60) buckets[1].qty += b.qtyOnHand;
          else if (d <= 90) buckets[2].qty += b.qtyOnHand;
          else if (d <= 180) buckets[3].qty += b.qtyOnHand;
        })
      )
    );
    return buckets;
  }, [products]);

  // Action Tables
  const lowStockRows = useMemo(() => {
    const rows: { productId: string; titleFa: string; sku: string; avail: number; threshold: number }[] = [];
    products.forEach((p) => {
      p.variants.forEach((v) => {
        const avail = getVariantAvailableStock(v);
        if (avail <= v.lowStockThreshold) {
          rows.push({ productId: p.id, titleFa: p.titleFa, sku: v.sku, avail, threshold: v.lowStockThreshold });
        }
      });
    });
    return rows.slice(0, 6);
  }, [products]);

  const nearExpiryRows = useMemo(() => {
    const rows: { titleFa: string; batchNo: string; expiresAt: string; qty: number; daysLeft: number }[] = [];
    products.forEach((p) => {
      p.variants.forEach((v) => {
        v.batches?.forEach((b) => {
          const d = daysUntil(b.expiresAt);
          if (b.qtyOnHand > 0 && d !== null && d <= settings.nearExpiryThresholdDays && d >= 0) {
            rows.push({ titleFa: p.titleFa, batchNo: b.batchNo, expiresAt: b.expiresAt, qty: b.qtyOnHand, daysLeft: d });
          }
        });
      });
    });
    return rows.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6);
  }, [products, settings.nearExpiryThresholdDays]);

  return (
    <div className="space-y-6">
      {/* Header & Jalali Date Range Presets */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">داشبورد عملیاتی و فروش دنتال‌مارکت</h1>
          <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">
            پایش لحظه‌ای سفارش‌ها، موجودی FEFO، اعتبار B2B و سلامت سئو
          </p>
        </div>

        <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-1 text-xs">
          <Calendar className="w-4 h-4 text-brand mx-1.5" />
          {[
            { id: 'today', label: 'امروز' },
            { id: '7d', label: '۷ روز' },
            { id: '30d', label: '۳۰ روز' },
            { id: 'year', label: 'امسال' },
            { id: 'all', label: 'کل دوره' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id as RangePreset)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                range === item.id ? 'bg-brand text-white' : 'hover:bg-surface dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid (§10.1) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'فروش خالص تاییدشده', value: formatMoney(kpis.revenue, currency), sub: 'سفارش‌های پرداخت‌شده', to: '/admin/reports', icon: TrendingUp },
          { label: 'تعداد سفارش‌های فعال', value: toPersianDigits(kpis.ordersCount), sub: `میانگین سبد: ${formatMoney(kpis.aov, currency)}`, to: '/admin/orders', icon: ShoppingBag },
          { label: 'نیازمند اقدام سفارش / اعتبار', value: toPersianDigits(kpis.pendingAction), sub: `${toPersianDigits(kpis.unpaid)} در انتظار پرداخت`, to: '/admin/orders', icon: CreditCard },
          { label: 'پیش‌فاکتورهای باز', value: toPersianDigits(kpis.openProformas), sub: `${toPersianDigits(kpis.pendingB2B)} حساب منتظر تایید B2B`, to: '/admin/customers', icon: Clock },
          { label: 'کالاهای کم‌موجودی', value: toPersianDigits(kpis.lowStockCount), sub: 'زیر آستانه هشدار انبار', to: '/admin/inventory', icon: PackageX },
          { label: 'بچ‌های نزدیک انقضا (FEFO)', value: toPersianDigits(kpis.nearExpiryCount), sub: `کمتر از ${toPersianDigits(settings.nearExpiryThresholdDays)} روز`, to: '/admin/inventory', icon: AlertTriangle },
          canSeeCostPrice(activeAdminRole)
            ? { label: 'ارزش بهای تمام‌شده موجودی', value: formatMoney(kpis.stockValuation, currency), sub: 'محاسبه بر مبنای موجودی فعلی', to: '/admin/reports', icon: TrendingUp }
            : { label: 'درخواست کالای ناموجود', value: toPersianDigits(kpis.openStockRequests), sub: 'ثبت‌شده توسط مشتریان', to: '/admin/inventory', icon: PackageX },
          { label: 'تیکت‌های باز پشتیبانی', value: toPersianDigits(kpis.openTickets), sub: `${toPersianDigits(kpis.openStockRequests)} درخواست کالا`, to: '/admin/support', icon: Clock },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              to={card.to}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 hover:border-brand transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-ink/60 dark:text-slate-400">
                <span className="text-xs font-bold">{card.label}</span>
                <Icon className="w-4 h-4 text-brand" />
              </div>
              <p className="text-2xl font-extrabold tabular-nums text-ink dark:text-slate-100">{card.value}</p>
              <p className="text-[11px] text-ink/55 dark:text-slate-400 tabular-nums">{card.sub}</p>
            </Link>
          );
        })}
      </section>

      {/* Charts (§10.2) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">روند فروش و تعداد سفارش‌ها</h2>
            <Link to="/admin/reports" className="text-xs font-bold text-brand inline-flex items-center gap-1">
              <span>گزارش کامل</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="h-64 w-full" dir="ltr">
            {salesTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-ink/50">داده‌ای برای این بازه وجود ندارد</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={salesTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(val) => formatMoney(Number(val), currency)} />
                  <Area type="monotone" dataKey="revenue" fill="#17788C22" stroke="#17788C" strokeWidth={2} name="فروش" />
                  <Bar dataKey="orders" fill="#0F5667" barSize={18} name="سفارش" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">سفارش‌ها بر اساس وضعیت</h2>
          <div className="h-64 w-full" dir="ltr">
            {statusDonutData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-ink/50">داده‌ای وجود ندارد</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDonutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusDonutData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => toPersianDigits(String(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">پرفروش‌ترین محصولات کاتالوگ</h2>
          <div className="h-60 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProductsData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="sold" fill="#17788C" radius={[0, 4, 4, 0]} name="تعداد فروش" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">ریسک انقضای بچ‌ها (FEFO)</h2>
          <div className="h-60 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expiryRiskBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#E76F51" radius={[4, 4, 0, 0]} name="تعداد در ریسک" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Action Tables (§10.3) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">آخرین سفارش‌ها</h2>
            <Link to="/admin/orders" className="text-xs font-bold text-brand">مشاهده همه</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line dark:border-slate-800 text-ink/60">
                  <th className="py-2 text-right">شماره</th>
                  <th className="py-2 text-right">مشتری</th>
                  <th className="py-2 text-right">مبلغ</th>
                  <th className="py-2 text-right">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-slate-800">
                {orders.slice(0, 5).map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-bold tabular-nums">{o.orderNo}</td>
                    <td className="py-2.5">{o.customerName}</td>
                    <td className="py-2.5 tabular-nums font-bold">{formatMoney(o.grandTotal, currency)}</td>
                    <td className="py-2.5 text-brand font-bold">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">بچ‌های نزدیک انقضا و کم‌موجودی</h2>
            <Link to="/admin/inventory" className="text-xs font-bold text-brand">مدیریت انبار</Link>
          </div>
          <div className="space-y-2 text-xs">
            {nearExpiryRows.map((row, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex justify-between items-center">
                <span className="font-bold truncate">{row.titleFa} ({row.batchNo})</span>
                <span className="tabular-nums text-amber-800 dark:text-amber-300 shrink-0">
                  {toPersianDigits(row.daysLeft)} روز مانده · {toPersianDigits(row.qty)} عدد
                </span>
              </div>
            ))}
            {lowStockRows.map((row, idx) => (
              <div key={`low_${idx}`} className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex justify-between items-center">
                <span className="font-bold truncate">{row.titleFa} ({row.sku})</span>
                <span className="tabular-nums text-rose-700 dark:text-rose-300 shrink-0">
                  موجود: {toPersianDigits(row.avail)} (آستانه {toPersianDigits(row.threshold)})
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">حساب‌های B2B در انتظار تایید</h2>
            <Link to="/admin/customers" className="text-xs font-bold text-brand">صف احراز هویت</Link>
          </div>
          {b2bVerifications.filter((b) => b.status === 'pending').length === 0 ? (
            <p className="text-xs text-ink/50">موردی در صف انتظار نیست.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {b2bVerifications
                .filter((b) => b.status === 'pending')
                .map((b) => (
                  <div key={b.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{b.applicantName} — {b.clinicName}</p>
                      <p className="text-ink/60 tabular-nums">نظام پزشکی: {b.medicalCouncilNo} · گروه: {b.requestedGroup}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => reviewB2BVerification(b.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0"
                    >
                      تایید فوری
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">تیکت‌ها و درخواست کالای ناموجود</h2>
            <Link to="/admin/support" className="text-xs font-bold text-brand">صندوق پشتیبانی</Link>
          </div>
          <div className="space-y-2 text-xs">
            {tickets.slice(0, 3).map((t) => (
              <div key={t.id} className="p-2.5 rounded-xl bg-surface/60 dark:bg-slate-800 flex justify-between">
                <span className="font-bold truncate">{t.subject}</span>
                <span className="text-brand font-bold tabular-nums">{t.ticketNo}</span>
              </div>
            ))}
            {stockRequests.slice(0, 3).map((sr) => (
              <div key={sr.id} className="p-2.5 rounded-xl border border-line dark:border-slate-800 flex justify-between">
                <span className="truncate">درخواست تامین: {sr.titleText}</span>
                <span className="font-bold text-amber-600">{sr.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
