import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
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
import { useI18n } from '../../context/i18n';
import { ChartSkeleton, EmptyState } from '../../components/ui/States';
import { daysUntil } from '../../lib/jalali';
import { getVariantAvailableStock } from '../../lib/pricing';
import { auditSeoHealth, findOrphanProducts } from '../../lib/seo';
import { canSeeCostPrice } from '../../components/admin/rbac';

const DashboardCharts = lazy(() => import('../../components/admin/DashboardCharts'));

type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';

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
  const { t, formatDate, formatDigits, formatMoney } = useI18n();

  const [range, setRange] = useState<RangePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const showCostMetrics = canSeeCostPrice(actualAdminRole ?? activeAdminRole);

  const formatDeltaBadge = (current: number, previous: number): { text: string; positive: boolean } => {
    if (previous <= 0) {
      return current > 0
        ? { text: t('adminDash.deltaPlus100'), positive: true }
        : { text: t('adminDash.deltaZero'), positive: true };
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    return {
      text: t('adminDash.deltaPct', { sign: pct >= 0 ? '+' : '−', pct: formatDigits(Math.abs(pct)) }),
      positive: pct >= 0,
    };
  };

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
        const tm = new Date(o.createdAt).getTime();
        return tm >= start && tm <= end;
      });
      const prev = orders.filter((o) => {
        const tm = new Date(o.createdAt).getTime();
        return tm >= start - span && tm < start;
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
        const tm = new Date(o.createdAt).getTime();
        return Number.isNaN(tm) ? true : tm >= startCutoff && tm <= endCutoff;
      }),
      previousOrders: orders.filter((o) => {
        const tm = new Date(o.createdAt).getTime();
        return !Number.isNaN(tm) && tm >= prevStart && tm < startCutoff;
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
    const openTickets = tickets.filter((tk) => ['open', 'pending_staff'].includes(tk.status)).length;
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
    t,
  ]);

  // Charts Data (§10.2)
  const salesTrendData = useMemo(() => {
    const byDay = new Map<string, { label: string; revenue: number; orders: number }>();
    filteredOrders.forEach((o) => {
      const label = formatDate(o.createdAt);
      const prev = byDay.get(label) ?? { label, revenue: 0, orders: 0 };
      prev.orders += 1;
      if (o.status !== 'cancelled') prev.revenue += o.grandTotal;
      byDay.set(label, prev);
    });
    return Array.from(byDay.values());
  }, [filteredOrders, formatDate]);

  const categoryRevenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const catName = categories.find((c) => c.id === prod?.primaryCategoryId)?.nameFa ?? t('common.other');
          map.set(catName, (map.get(catName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name: name.slice(0, 18), revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders, products, categories, t]);

  const brandRevenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const brName = brands.find((b) => b.id === prod?.brandId)?.nameFa ?? t('common.other');
          map.set(brName, (map.get(brName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name: name.slice(0, 18), revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders, products, brands, t]);

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
      { name: t('adminDash.charts.b2bSegment'), value: b2b },
      { name: t('adminDash.charts.b2cSegment'), value: b2c },
    ].filter((x) => x.value > 0);
  }, [filteredOrders, t]);

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
      const prov = o.shippingAddress?.province || t('common.tehran');
      map.set(prov, (map.get(prov) ?? 0) + o.grandTotal);
    });
    return Array.from(map.entries())
      .map(([province, revenue]) => ({ province, revenue }))
      .slice(0, 6);
  }, [filteredOrders, t]);

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
      { bucket: t('adminDash.charts.bucket0_30'), qty: 0 },
      { bucket: t('adminDash.charts.bucket31_60'), qty: 0 },
      { bucket: t('adminDash.charts.bucket61_90'), qty: 0 },
      { bucket: t('adminDash.charts.bucket91_180'), qty: 0 },
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
  }, [products, t]);

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
    { label: t('adminDash.kpi.netRevenue'), value: formatMoney(kpis.revenue, currency), sub: kpis.revenueDelta.text, to: '/admin/reports', icon: TrendingUp },
    { label: t('adminDash.kpi.grossSales'), value: formatMoney(kpis.grossSales, currency), sub: t('adminDash.kpi.totalDiscountsSub', { amount: formatMoney(kpis.totalDiscounts, currency) }), to: '/admin/reports', icon: TrendingUp },
    showCostMetrics
      ? { label: t('adminDash.kpi.netProfit'), value: formatMoney(kpis.netProfit, currency), sub: t('adminDash.kpi.netProfitSub'), to: '/admin/reports', icon: TrendingUp }
      : { label: t('adminDash.kpi.aov'), value: formatMoney(kpis.aov, currency), sub: kpis.ordersDelta.text, to: '/admin/reports', icon: ShoppingBag },
    { label: t('adminDash.kpi.activeOrders'), value: formatDigits(kpis.ordersCount), sub: kpis.ordersDelta.text, to: '/admin/orders', icon: ShoppingBag },
    { label: t('adminDash.kpi.conversionRate'), value: t('common.percentValue', { value: formatDigits(kpis.conversionRate) }), sub: t('adminDash.kpi.conversionSub'), to: '/admin/reports', icon: PackageCheck },
    { label: t('adminDash.kpi.pendingAction'), value: formatDigits(kpis.pendingAction), sub: t('adminDash.kpi.unpaidSub', { count: formatDigits(kpis.unpaid) }), to: '/admin/orders', icon: CreditCard },
    { label: t('adminDash.kpi.openProformas'), value: formatDigits(kpis.openProformas), sub: t('adminDash.kpi.convertedProformasSub', { count: formatDigits(kpis.convertedProformas) }), to: '/admin/orders', icon: FileSpreadsheet },
    { label: t('adminDash.kpi.pendingB2B'), value: formatDigits(kpis.pendingB2B), sub: t('adminDash.kpi.pendingB2BSub'), to: '/admin/customers', icon: UserPlus },
    { label: t('adminDash.kpi.customersCount'), value: formatDigits(kpis.newUsersCount), sub: t('adminDash.kpi.customersSub'), to: '/admin/customers', icon: UserPlus },
    { label: t('adminDash.kpi.lowStock'), value: formatDigits(kpis.lowStockCount), sub: t('adminDash.kpi.lowStockSub'), to: '/admin/inventory', icon: PackageX },
    { label: t('adminDash.kpi.nearExpiry'), value: formatDigits(kpis.nearExpiryCount), sub: t('adminDash.kpi.nearExpirySub', { days: formatDigits(settings.nearExpiryThresholdDays) }), to: '/admin/inventory', icon: AlertTriangle },
    showCostMetrics
      ? { label: t('adminDash.kpi.stockValuation'), value: formatMoney(kpis.stockValuation, currency), sub: t('adminDash.kpi.stockValuationSub'), to: '/admin/inventory', icon: TrendingUp }
      : { label: t('adminDash.kpi.activeCatalog'), value: formatDigits(products.filter((p) => p.status === 'active').length), sub: t('adminDash.kpi.activeCatalogSub', { count: formatDigits(products.length) }), to: '/admin/products', icon: PackageCheck },
    { label: t('adminDash.kpi.openTickets'), value: formatDigits(kpis.openTickets), sub: t('adminDash.kpi.openTicketsSub'), to: '/admin/support', icon: Clock },
    { label: t('adminDash.kpi.pendingReviewsAndQa'), value: formatDigits(pendingReviewsCount + unansweredQuestionsCount), sub: t('adminDash.kpi.pendingReviewsSub', { reviews: formatDigits(pendingReviewsCount), questions: formatDigits(unansweredQuestionsCount) }), to: '/admin/support', icon: Star },
    { label: t('adminDash.kpi.returnRate'), value: t('common.percentValue', { value: formatDigits(kpis.returnRate) }), sub: t('adminDash.kpi.returnRateSub', { count: formatDigits(kpis.returnCount) }), to: '/admin/orders', icon: RotateCcw },
    { label: t('adminDash.kpi.stockRequests'), value: formatDigits(kpis.openStockRequests), sub: t('adminDash.kpi.stockRequestsSub'), to: '/admin/inventory', icon: PackageX },
    { label: t('adminDash.kpi.seoAlerts'), value: formatDigits(kpis.seoAlerts), sub: t('adminDash.kpi.seoAlertsSub'), to: '/admin/seo', icon: Globe },
  ];

  const rangePresets: { id: RangePreset; label: string }[] = [
    { id: 'today', label: t('adminDash.ranges.today') },
    { id: 'yesterday', label: t('adminDash.ranges.yesterday') },
    { id: '7d', label: t('adminDash.ranges.d7') },
    { id: '30d', label: t('adminDash.ranges.d30') },
    { id: '90d', label: t('adminDash.ranges.d90') },
    { id: 'year', label: t('adminDash.ranges.year') },
    { id: 'all', label: t('adminDash.ranges.all') },
    { id: 'custom', label: t('adminDash.ranges.custom') },
  ];

  const pendingB2BList = b2bVerifications.filter((b) => b.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header & Date Range Presets */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">{t('adminDash.title')}</h1>
          <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{t('adminDash.subtitle')}</p>
        </div>

        <div className="flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-2 w-full md:w-auto max-w-full">
          <div className="w-full md:w-auto max-w-full overflow-x-auto no-scrollbar">
            <div className="inline-flex flex-nowrap md:flex-wrap items-center gap-1 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-1 text-xs">
              <Calendar className="w-4 h-4 text-brand mx-1.5 shrink-0" aria-hidden="true" />
              {rangePresets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`whitespace-nowrap shrink-0 min-h-[36px] px-2.5 py-1.5 rounded-lg font-bold transition-colors ${
                    range === item.id ? 'bg-brand text-white' : 'hover:bg-surface dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {range === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label={t('adminDash.fromDateAria')}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <span>{t('common.toLabel')}</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label={t('adminDash.toDateAria')}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          )}
        </div>
      </div>

      {/* 17 KPI Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              to={card.to}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 hover:border-brand transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between text-ink/70 dark:text-slate-300">
                <span className="text-[11px] font-bold line-clamp-1">{card.label}</span>
                <Icon className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
              </div>
              <p className="text-lg font-extrabold tabular-nums text-ink dark:text-slate-100 truncate">{card.value}</p>
              <p className="text-[10px] text-ink/65 dark:text-slate-400 tabular-nums line-clamp-1">{card.sub}</p>
            </Link>
          );
        })}
      </section>

      {/* Lazy-Loaded Recharts Bundle */}
      <Suspense fallback={<ChartSkeleton heightClass="h-96" />}>
        <DashboardCharts
          currency={currency}
          salesTrendData={salesTrendData}
          b2bVsB2cData={b2bVsB2cData}
          categoryRevenueData={categoryRevenueData}
          brandRevenueData={brandRevenueData}
          groupSplitData={groupSplitData}
          topProductsData={topProductsData}
          expiryRiskBuckets={expiryRiskBuckets}
          paymentMethodData={paymentMethodData}
          statusDonutData={statusDonutData}
          provinceSalesData={provinceSalesData}
        />
      </Suspense>

      {/* Action Queues (§10.3) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">{t('adminDash.queues.ordersTitle')}</h2>
            <Link to="/admin/orders" className="text-xs font-bold text-brand hover:underline">
              {t('adminDash.queues.ordersLink')}
            </Link>
          </div>
          {orders.length === 0 ? (
            <EmptyState title={t('adminDash.queues.ordersEmpty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line dark:border-slate-800 text-ink/70 dark:text-slate-400">
                    <th className="py-2 text-start">{t('adminDash.queues.colOrderNo')}</th>
                    <th className="py-2 text-start">{t('adminDash.queues.colCustomer')}</th>
                    <th className="py-2 text-start">{t('adminDash.queues.colAmount')}</th>
                    <th className="py-2 text-start">{t('adminDash.queues.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {orders.slice(0, 5).map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 font-bold tabular-nums">{o.orderNo}</td>
                      <td className="py-2.5">{o.customerName}</td>
                      <td className="py-2.5 tabular-nums font-bold">{formatMoney(o.grandTotal, currency)}</td>
                      <td className="py-2.5 text-brand font-bold">{t(`orderStatus.${o.status}`, undefined, o.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">{t('adminDash.queues.inventoryTitle')}</h2>
            <Link to="/admin/inventory" className="text-xs font-bold text-brand hover:underline">
              {t('adminDash.queues.inventoryLink')}
            </Link>
          </div>
          {nearExpiryRows.length === 0 && lowStockRows.length === 0 ? (
            <EmptyState title={t('adminDash.queues.inventoryEmpty')} />
          ) : (
            <div className="space-y-2 text-xs">
              {nearExpiryRows.map((row, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex justify-between items-center"
                >
                  <span className="font-bold truncate">
                    {row.titleFa} ({row.batchNo})
                  </span>
                  <span className="tabular-nums text-amber-800 dark:text-amber-300 shrink-0">
                    {t('adminDash.queues.nearExpiryMeta', {
                      days: formatDigits(row.daysLeft),
                      qty: formatDigits(row.qty),
                    })}
                  </span>
                </div>
              ))}
              {lowStockRows.map((row, idx) => (
                <div
                  key={`low_${idx}`}
                  className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex justify-between items-center"
                >
                  <span className="font-bold truncate">
                    {row.titleFa} ({row.sku})
                  </span>
                  <span className="tabular-nums text-rose-700 dark:text-rose-300 shrink-0">
                    {t('adminDash.queues.lowStockMeta', {
                      avail: formatDigits(row.avail),
                      threshold: formatDigits(row.threshold),
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">{t('adminDash.queues.b2bTitle')}</h2>
            <Link to="/admin/customers" className="text-xs font-bold text-brand hover:underline">
              {t('adminDash.queues.b2bLink')}
            </Link>
          </div>
          {pendingB2BList.length === 0 ? (
            <p className="text-xs text-ink/65 dark:text-slate-400">{t('adminDash.queues.b2bEmpty')}</p>
          ) : (
            <div className="space-y-2 text-xs">
              {pendingB2BList.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border border-line dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-bold">
                      {b.applicantName} — {b.clinicName}
                    </p>
                    <p className="text-ink/70 dark:text-slate-400 tabular-nums">
                      {t('adminDash.queues.b2bMeta', {
                        councilNo: formatDigits(b.medicalCouncilNo),
                        group: t(`customerGroup.${b.requestedGroup}`, undefined, b.requestedGroup),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => reviewB2BVerification(b.id, 'approved')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0 hover:bg-emerald-700"
                  >
                    {t('adminDash.queues.b2bApproveBtn')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-extrabold">{t('adminDash.queues.supportSeoTitle')}</h2>
            <Link to="/admin/seo" className="text-xs font-bold text-brand hover:underline">
              {t('adminDash.queues.supportSeoLink')}
            </Link>
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface/60 dark:bg-slate-800 flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-bold">
                <FileWarning className="w-4 h-4 text-amber-600" aria-hidden="true" />
                <span>{t('adminDash.queues.seoStatusLabel')}</span>
              </span>
              <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                {t('adminDash.queues.seoAlertsCount', { count: formatDigits(kpis.seoAlerts) })}
              </span>
            </div>
            {tickets.slice(0, 2).map((tk) => (
              <div key={tk.id} className="p-2.5 rounded-xl border border-line dark:border-slate-800 flex justify-between">
                <span className="font-bold truncate">{tk.subject}</span>
                <span className="text-brand font-bold tabular-nums">{tk.ticketNo}</span>
              </div>
            ))}
            {stockRequests.slice(0, 2).map((sr) => (
              <div key={sr.id} className="p-2.5 rounded-xl border border-line dark:border-slate-800 flex justify-between">
                <span className="truncate">{t('adminDash.queues.stockRequestPrefix', { title: sr.titleText })}</span>
                <span className="font-bold text-amber-700 dark:text-amber-300">{sr.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
