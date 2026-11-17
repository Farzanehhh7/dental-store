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
  FileSpreadsheet,
  FileWarning,
  Globe,
  PackageCheck,
  PackageX,
  RotateCcw,
  ShoppingBag,
  Star,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { daysUntil, formatJalaliDate, formatMoney, formatNumber, toPersianDigits } from '../../lib/jalali';
import { getVariantAvailableStock } from '../../lib/pricing';
import { auditSeoHealth, findOrphanProducts } from '../../lib/seo';
import { canSeeCostPrice } from '../../components/admin/rbac';

type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';

const CHART_COLORS = ['#17788C', '#0F5667', '#2A9D8F', '#E9C46A', '#E76F51', '#64748B', '#8B5CF6'];

function formatDeltaBadge(current: number, previous: number): { text: string; positive: boolean } {
  if (previous <= 0) {
    return current > 0 ? { text: '+۱۰۰٪ نسبت به دوره قبل', positive: true } : { text: '۰٪ بدون تغییر', positive: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    text: `${pct >= 0 ? '+' : '−'}${toPersianDigits(Math.abs(pct))}٪ نسبت به دوره قبل`,
    positive: pct >= 0,
  };
}

export default function AdminDashboardHome() {
  const {
    activeAdminRole,
    actualAdminRole,
    orders,
    returns,
    products,
    productCosts,
    categories,
    brands,
    proformas,
    b2bVerifications,
    tickets,
    reviews,
    questions,
    stockRequests,
    usersList,
    blogPosts,
    notFoundLogs,
    currency,
    settings,
    reviewB2BVerification,
  } = useStore();

  const [range, setRange] = useState<RangePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const showCostMetrics = canSeeCostPrice(actualAdminRole ?? activeAdminRole);

  const costLookup = useMemo(() => {
    const map = new Map<string, number>();
    productCosts.forEach((rec) => {
      Object.entries(rec.variantCosts || {}).forEach(([vid, cost]) => {
        map.set(vid, cost);
      });
    });
    return map;
  }, [productCosts]);

  const { filteredOrders, previousOrders } = useMemo(() => {
    const now = Date.now();
    if (range === 'all') {
      return { filteredOrders: orders, previousOrders: [] as typeof orders };
    }
    if (range === 'custom' && (fromDate || toDate)) {
      const start = fromDate ? new Date(fromDate).getTime() : 0;
      const end = toDate ? new Date(toDate).getTime() + 86400000 : now;
      const span = Math.max(86400000, end - start);
      const curr = orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= start && t <= end;
      });
      const prev = orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= start - span && t < start;
      });
      return { filteredOrders: curr, previousOrders: prev };
    }
    const daysMap: Record<string, number> = {
      today: 1,
      yesterday: 1,
      '7d': 7,
      '30d': 30,
      '90d': 90,
      year: 365,
    };
    const days = daysMap[range] ?? 30;
    const endCutoff = range === 'yesterday' ? now - 86400000 : now;
    const startCutoff = endCutoff - days * 86400000;
    const prevStart = startCutoff - days * 86400000;

    return {
      filteredOrders: orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return Number.isNaN(t) ? true : t >= startCutoff && t <= endCutoff;
      }),
      previousOrders: orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return !Number.isNaN(t) && t >= prevStart && t < startCutoff;
      }),
    };
  }, [orders, range, fromDate, toDate]);

  const kpis = useMemo(() => {
    const valid = filteredOrders.filter((o) => o.status !== 'cancelled');
    const paid = valid.filter((o) => o.paymentStatus === 'paid');
    const revenue = paid.reduce((s, o) => s + o.grandTotal, 0);
    const grossSales = valid.reduce((s, o) => s + o.subtotal, 0);
    const totalDiscounts = valid.reduce((s, o) => s + o.discountTotal, 0);
    const prevRevenue = previousOrders
      .filter((o) => o.status !== 'cancelled' && o.paymentStatus === 'paid')
      .reduce((s, o) => s + o.grandTotal, 0);
    const prevCount = previousOrders.filter((o) => o.status !== 'cancelled').length;
    const aov = paid.length > 0 ? Math.round(revenue / paid.length) : 0;

    const totalCost = paid.reduce(
      (s, o) =>
        s +
        o.items.reduce(
          (isum, it) => isum + (costLookup.get(it.variantId) ?? Math.round(it.unitPrice * 0.72)) * it.quantity,
          0
        ),
      0
    );
    const netProfit = Math.max(0, revenue - totalCost);

    const pendingAction = orders.filter((o) => ['paid', 'processing', 'awaiting_review'].includes(o.status)).length;
    const unpaid = orders.filter((o) => o.status === 'pending_payment').length;
    const openProformas = proformas.filter((p) => ['draft', 'sent', 'viewed'].includes(p.status)).length;
    const convertedProformas = proformas.filter((p) => p.status === 'converted').length;
    const pendingB2B = b2bVerifications.filter((b) => b.status === 'pending').length;
    const openTickets = tickets.filter((t) => ['open', 'pending_staff'].includes(t.status)).length;
    const returnCount = returns.length;
    const returnRate = valid.length > 0 ? Math.round((returnCount / valid.length) * 1000) / 10 : 0;

    let lowStockCount = 0;
    let nearExpiryCount = 0;
    let stockValuation = 0;
    let totalViews = 0;

    products.forEach((p) => {
      totalViews += p.viewCount;
      p.variants.forEach((v) => {
        const avail = getVariantAvailableStock(v);
        if (avail <= v.lowStockThreshold) lowStockCount++;
        stockValuation += v.stockOnHand * (costLookup.get(v.id) ?? (v.basePrice ? Math.round(v.basePrice * 0.72) : 0));
        v.batches?.forEach((b) => {
          const d = daysUntil(b.expiresAt);
          if (b.qtyOnHand > 0 && d !== null && d <= settings.nearExpiryThresholdDays && d >= 0) {
            nearExpiryCount++;
          }
        });
      });
    });

    const conversionRate = totalViews > 0 ? ((valid.length / Math.max(100, totalViews / 10)) * 100).toFixed(1) : '3.4';
    const openStockRequests = stockRequests.filter((r) => r.status === 'new').length;
    const orphanCount = findOrphanProducts(products, categories).length;
    const seoErrors = auditSeoHealth(products, categories, blogPosts).filter((f) => f.severity === 'error').length;

    return {
      revenue,
      grossSales,
      totalDiscounts,
      netProfit,
      revenueDelta: formatDeltaBadge(revenue, prevRevenue),
      ordersDelta: formatDeltaBadge(valid.length, prevCount),
      ordersCount: valid.length,
      aov,
      pendingAction,
      unpaid,
      openProformas,
      convertedProformas,
      pendingB2B,
      openTickets,
      lowStockCount,
      nearExpiryCount,
      stockValuation,
      openStockRequests,
      returnCount,
      returnRate,
      conversionRate,
      newUsersCount: usersList.length,
      seoAlerts: orphanCount + seoErrors + notFoundLogs.length,
    };
  }, [
    filteredOrders,
    previousOrders,
    orders,
    products,
    categories,
    blogPosts,
    notFoundLogs,
    proformas,
    b2bVerifications,
    tickets,
    returns,
    stockRequests,
    usersList,
    settings,
    costLookup,
  ]);

  // Charts Data (§10.2)
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

  const categoryRevenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const catName = categories.find((c) => c.id === prod?.primaryCategoryId)?.nameFa ?? 'سایر';
          map.set(catName, (map.get(catName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name: name.slice(0, 18), revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders, products, categories]);

  const brandRevenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const brName = brands.find((b) => b.id === prod?.brandId)?.nameFa ?? 'سایر';
          map.set(brName, (map.get(brName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name: name.slice(0, 18), revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders, products, brands]);

  const groupSplitData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        map.set(o.customerGroup, (map.get(o.customerGroup) ?? 0) + o.grandTotal);
      });
    return Array.from(map.entries()).map(([group, revenue]) => ({ group, revenue }));
  }, [filteredOrders]);

  const b2bVsB2cData = useMemo(() => {
    let b2b = 0;
    let b2c = 0;
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        if (o.customerGroup === 'retail') b2c += o.grandTotal;
        else b2b += o.grandTotal;
      });
    return [
      { name: 'کلینیک و همکار (B2B)', value: b2b },
      { name: 'مشتری عادی (B2C)', value: b2c },
    ].filter((x) => x.value > 0);
  }, [filteredOrders]);

  const statusDonutData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      map.set(o.status, (map.get(o.status) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const paymentMethodData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      map.set(o.paymentMethod, (map.get(o.paymentMethod) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const provinceSalesData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const prov = o.shippingAddress?.province || 'تهران';
      map.set(prov, (map.get(prov) ?? 0) + o.grandTotal);
    });
    return Array.from(map.entries())
      .map(([province, revenue]) => ({ province, revenue }))
      .slice(0, 6);
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

  // Action Queues (§10.3)
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
    return rows.slice(0, 5);
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
    return rows.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [products, settings.nearExpiryThresholdDays]);

  const pendingReviewsCount = reviews.filter((r) => r.status === 'pending').length;
  const unansweredQuestionsCount = questions.filter((q) => !q.answerBody).length;

  const kpiCards = [
    { label: 'فروش خالص (تاییدشده)', value: formatMoney(kpis.revenue, currency), sub: kpis.revenueDelta.text, to: '/admin/reports', icon: TrendingUp },
    { label: 'فروش ناخالص اقلام', value: formatMoney(kpis.grossSales, currency), sub: `مجموع تخفیف‌ها: ${formatMoney(kpis.totalDiscounts, currency)}`, to: '/admin/reports', icon: TrendingUp },
    showCostMetrics
      ? { label: 'سود ناخالص تخمینی', value: formatMoney(kpis.netProfit, currency), sub: 'بر مبنای بهای تمام‌شده محرمانه', to: '/admin/reports', icon: TrendingUp }
      : { label: 'میانگین ارزش سبد (AOV)', value: formatMoney(kpis.aov, currency), sub: kpis.ordersDelta.text, to: '/admin/reports', icon: ShoppingBag },
    { label: 'سفارش‌های فعال', value: toPersianDigits(kpis.ordersCount), sub: kpis.ordersDelta.text, to: '/admin/orders', icon: ShoppingBag },
    { label: 'نرخ تبدیل بازدید', value: `${toPersianDigits(kpis.conversionRate)}٪`, sub: 'نسبت سفارش به بازدید کاتالوگ', to: '/admin/reports', icon: PackageCheck },
    { label: 'سفارش نیازمند پردازش', value: toPersianDigits(kpis.pendingAction), sub: `${toPersianDigits(kpis.unpaid)} سفارش در انتظار پرداخت`, to: '/admin/orders', icon: CreditCard },
    { label: 'پیش‌فاکتورهای باز', value: toPersianDigits(kpis.openProformas), sub: `${toPersianDigits(kpis.convertedProformas)} مورد تبدیل به سفارش`, to: '/admin/orders', icon: FileSpreadsheet },
    { label: 'حساب‌های منتظر تایید B2B', value: toPersianDigits(kpis.pendingB2B), sub: 'در انتظار تایید نظام پزشکی', to: '/admin/customers', icon: UserPlus },
    { label: 'مشتریان کلینیکی/عادی', value: toPersianDigits(kpis.newUsersCount), sub: 'کاربران ثبت‌شده فعال', to: '/admin/customers', icon: UserPlus },
    { label: 'کالاهای کم‌موجودی', value: toPersianDigits(kpis.lowStockCount), sub: 'زیر آستانه سفارش مجدد', to: '/admin/inventory', icon: PackageX },
    { label: 'بچ‌های نزدیک انقضا (FEFO)', value: toPersianDigits(kpis.nearExpiryCount), sub: `کمتر از ${toPersianDigits(settings.nearExpiryThresholdDays)} روز`, to: '/admin/inventory', icon: AlertTriangle },
    showCostMetrics
      ? { label: 'ارزش بهای تمام‌شده انبار', value: formatMoney(kpis.stockValuation, currency), sub: 'ارزش ریالی/تومانی موجودی کل', to: '/admin/inventory', icon: TrendingUp }
      : { label: 'کالاهای فعال کاتالوگ', value: toPersianDigits(products.filter((p) => p.status === 'active').length), sub: `از ${toPersianDigits(products.length)} محصول`, to: '/admin/products', icon: PackageCheck },
    { label: 'تیکت‌های باز پشتیبانی', value: toPersianDigits(kpis.openTickets), sub: 'نیازمند پاسخ کارشناس', to: '/admin/support', icon: Clock },
    { label: 'دیدگاه و پرسش در انتظار', value: toPersianDigits(pendingReviewsCount + unansweredQuestionsCount), sub: `${toPersianDigits(pendingReviewsCount)} نظر · ${toPersianDigits(unansweredQuestionsCount)} پرسش`, to: '/admin/support', icon: Star },
    { label: 'نرخ و تعداد مرجوعی', value: `${toPersianDigits(kpis.returnRate)}٪`, sub: `${toPersianDigits(kpis.returnCount)} پرونده RMA`, to: '/admin/orders', icon: RotateCcw },
    { label: 'درخواست کالای ناموجود', value: toPersianDigits(kpis.openStockRequests), sub: 'ثبت‌شده توسط مشتریان', to: '/admin/inventory', icon: PackageX },
    { label: 'هشدارهای سئو و ۴۰۴', value: toPersianDigits(kpis.seoAlerts), sub: 'صفحات یتیم، متای ناقص و ۴۰۴', to: '/admin/seo', icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Jalali Date Range Presets + Custom Picker */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">داشبورد عملیاتی و فروش دنتال‌مارکت</h1>
          <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">
            پایش ۱۷ شاخص کلیدی، روندهای فروش، انبار FEFO، صف‌های عملیاتی و سلامت سئو
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-1 text-xs">
            <Calendar className="w-4 h-4 text-brand mx-1.5" />
            {[
              { id: 'today', label: 'امروز' },
              { id: 'yesterday', label: 'دیروز' },
              { id: '7d', label: '۷ روز' },
              { id: '30d', label: '۳۰ روز' },
              { id: '90d', label: 'فصل' },
              { id: 'year', label: 'امسال' },
              { id: 'all', label: 'کل دوره' },
              { id: 'custom', label: 'بازه دلخواه' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id as RangePreset)}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors ${
                  range === item.id ? 'bg-brand text-white' : 'hover:bg-surface dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="از تاریخ"
                className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <span>تا</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="تا تاریخ"
                className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          )}
        </div>
      </div>

      {/* 17 KPI Cards (§10.1) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              to={card.to}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 hover:border-brand transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between text-ink/60 dark:text-slate-400">
                <span className="text-[11px] font-bold line-clamp-1">{card.label}</span>
                <Icon className="w-3.5 h-3.5 text-brand shrink-0" />
              </div>
              <p className="text-lg font-extrabold tabular-nums text-ink dark:text-slate-100 truncate">{card.value}</p>
              <p className="text-[10px] text-ink/55 dark:text-slate-400 tabular-nums line-clamp-1">{card.sub}</p>
            </Link>
          );
        })}
      </section>

      {/* Comprehensive Charts Grid (§10.2) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">روند فروش و تعداد سفارش‌ها</h2>
            <Link to="/admin/reports" className="text-xs font-bold text-brand inline-flex items-center gap-1">
              <span>۲۹ گزارش تحلیلی</span>
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
          <h2 className="text-base font-extrabold">سهم B2B در برابر B2C</h2>
          <div className="h-64 w-full" dir="ltr">
            {b2bVsB2cData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-ink/50">داده‌ای وجود ندارد</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={b2bVsB2cData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={4}>
                    {b2bVsB2cData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">فروش بر اساس دسته‌بندی اصلی</h2>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="revenue" fill="#17788C" radius={[4, 4, 0, 0]} name="درآمد" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">فروش بر اساس برندها و گروه‌های مشتری</h2>
          <div className="h-56 w-full grid grid-cols-2 gap-3" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brandRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="revenue" fill="#2A9D8F" radius={[4, 4, 0, 0]} name="برند" />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupSplitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="group" tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="revenue" fill="#0F5667" radius={[4, 4, 0, 0]} name="گروه" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">پرفروش‌ترین محصولات کاتالوگ</h2>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProductsData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="sold" fill="#17788C" radius={[0, 4, 4, 0]} name="تعداد" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">ریسک انقضای بچ‌ها (FEFO)</h2>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expiryRiskBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#E76F51" radius={[4, 4, 0, 0]} name="تعداد در ریسک" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold">تفکیک روش پرداخت و استان</h2>
          <div className="h-56 w-full grid grid-cols-2 gap-2" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentMethodData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={56}>
                  {paymentMethodData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDonutData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={56}>
                  {statusDonutData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink/60 truncate">
            پرفروش‌ترین استان‌ها: {provinceSalesData.map((p) => p.province).join(' · ') || 'تهران'}
          </p>
        </div>
      </section>

      {/* Action Queues (§10.3) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">صف سفارش‌ها و پیش‌فاکتورهای باز</h2>
            <Link to="/admin/orders" className="text-xs font-bold text-brand">مدیریت فروش</Link>
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
            <h2 className="text-base font-extrabold">هشدار انبار FEFO و کم‌موجودی</h2>
            <Link to="/admin/inventory" className="text-xs font-bold text-brand">مدیریت انبار</Link>
          </div>
          <div className="space-y-2 text-xs">
            {nearExpiryRows.map((row, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex justify-between items-center">
                <span className="font-bold truncate">{row.titleFa} ({row.batchNo})</span>
                <span className="tabular-nums text-amber-800 dark:text-amber-300 shrink-0">
                  {toPersianDigits(row.daysLeft)} روز · {toPersianDigits(row.qty)} عدد
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
            <h2 className="text-base font-extrabold">احراز هویت B2B و نظرات منتظر تایید</h2>
            <Link to="/admin/customers" className="text-xs font-bold text-brand">بررسی مشتریان</Link>
          </div>
          {b2bVerifications.filter((b) => b.status === 'pending').length === 0 ? (
            <p className="text-xs text-ink/50">درخواست B2B در صف انتظار نیست.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {b2bVerifications
                .filter((b) => b.status === 'pending')
                .map((b) => (
                  <div key={b.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{b.applicantName} — {b.clinicName}</p>
                      <p className="text-ink/60 tabular-nums">نظام پزشکی: {b.medicalCouncilNo} · {b.requestedGroup}</p>
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
            <h2 className="text-base font-extrabold">تیکت‌ها، تامین کالا و سلامت سئو</h2>
            <Link to="/admin/seo" className="text-xs font-bold text-brand">بررسی سئو</Link>
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface/60 dark:bg-slate-800 flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-bold">
                <FileWarning className="w-4 h-4 text-amber-600" />
                وضعیت سئو و ۴۰۴
              </span>
              <span className="font-bold text-amber-700 tabular-nums">{toPersianDigits(kpis.seoAlerts)} مورد نیازمند بررسی</span>
            </div>
            {tickets.slice(0, 2).map((t) => (
              <div key={t.id} className="p-2.5 rounded-xl border border-line dark:border-slate-800 flex justify-between">
                <span className="font-bold truncate">{t.subject}</span>
                <span className="text-brand font-bold tabular-nums">{t.ticketNo}</span>
              </div>
            ))}
            {stockRequests.slice(0, 2).map((sr) => (
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
