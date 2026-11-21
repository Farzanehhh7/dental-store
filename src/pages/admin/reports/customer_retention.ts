import {
  CUSTOMER_GROUP_LABELS,
  buildProductMap,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  normalizeMobileDigits,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const customerRetentionReport: ReportDefinition = {
  id: 'customer_retention',
  group: 'مشتریان و B2B',
  title: '۲۴. خرید تکراری مصرفی کلینیک‌ها (Retention)',
  description: 'سنجش نرخ بازگشت مشتریان، میانگین فاصله بین سفارش‌ها، سهم درآمد خریدهای تکراری و تکرار خرید اقلام مصرفی.',
  available: true,
  params: ['dateRange', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params).filter(isNonCancelledOrder);
    const productMap = buildProductMap(data.products);

    const byBuyer = new Map<
      string,
      {
        customerName: string;
        groupLabel: string;
        datesMs: number[];
        revenue: number;
        consumableOrders: number;
      }
    >();

    for (const o of filtered) {
      const mob = normalizeMobileDigits(o.customerMobile);
      const key = o.userId && !o.userId.startsWith('guest:') ? o.userId : mob || o.customerName;
      const hasConsumable = o.items.some((it) => productMap.get(it.productId)?.kind === 'consumable');
      const cur = byBuyer.get(key) ?? {
        customerName: o.customerName,
        groupLabel: CUSTOMER_GROUP_LABELS[o.customerGroup] ?? o.customerGroup,
        datesMs: [],
        revenue: 0,
        consumableOrders: 0,
      };
      const ts = new Date(o.createdAt).getTime();
      if (Number.isFinite(ts)) cur.datesMs.push(ts);
      cur.revenue += o.grandTotal;
      if (hasConsumable) cur.consumableOrders += 1;
      byBuyer.set(key, cur);
    }

    let repeatBuyersCount = 0;
    let repeatRevenue = 0;
    let oneTimeBuyersCount = 0;
    let oneTimeRevenue = 0;
    const avgGapDaysList: number[] = [];

    const rows = Array.from(byBuyer.values())
      .map((b) => {
        const sortedTs = [...b.datesMs].sort((a, c) => a - c);
        const orderCount = sortedTs.length;
        const isRepeat = orderCount >= 2;
        let avgDaysBetween = 0;
        if (sortedTs.length >= 2) {
          const spanDays = (sortedTs[sortedTs.length - 1] - sortedTs[0]) / (1000 * 60 * 60 * 24);
          avgDaysBetween = Math.round((spanDays / (sortedTs.length - 1)) * 10) / 10;
          avgGapDaysList.push(avgDaysBetween);
        }
        if (isRepeat) {
          repeatBuyersCount += 1;
          repeatRevenue += b.revenue;
        } else {
          oneTimeBuyersCount += 1;
          oneTimeRevenue += b.revenue;
        }
        return {
          customerName: b.customerName,
          groupLabel: b.groupLabel,
          ordersCount: orderCount,
          consumableOrders: b.consumableOrders,
          segment: isRepeat ? 'مشتری تکراری (۲+ سفارش)' : 'تک‌خرید',
          avgDaysBetween,
          totalRevenue: roundMoney(b.revenue),
        };
      })
      .sort((a, b) => b.ordersCount - a.ordersCount || Number(b.totalRevenue) - Number(a.totalRevenue));

    const totalBuyers = rows.length;
    const totalRevenue = repeatRevenue + oneTimeRevenue;
    const overallAvgGap =
      avgGapDaysList.length > 0
        ? Math.round((avgGapDaysList.reduce((s, d) => s + d, 0) / avgGapDaysList.length) * 10) / 10
        : 0;

    return createReportResult(this, {
      columns: [
        { key: 'customerName', label: 'مشتری / کلینیک', type: 'text' },
        { key: 'groupLabel', label: 'گروه', type: 'text' },
        { key: 'ordersCount', label: 'تعداد سفارش', type: 'number' },
        { key: 'consumableOrders', label: 'سفارش دارای مصرفی', type: 'number' },
        { key: 'segment', label: 'وضعیت بازگشت', type: 'status' },
        { key: 'avgDaysBetween', label: 'میانگین فاصله سفارش (روز)', type: 'number' },
        { key: 'totalRevenue', label: 'درآمد کل', type: 'money' },
      ],
      rows,
      totalsRow: {
        customerName: 'جمع کل',
        groupLabel: `${totalBuyers} خریدار`,
        ordersCount: filtered.length,
        consumableOrders: rows.reduce((s, r) => s + Number(r.consumableOrders), 0),
        segment: `${repeatBuyersCount} تکراری`,
        avgDaysBetween: overallAvgGap,
        totalRevenue: roundMoney(totalRevenue),
      },
      summary: [
        { label: 'نرخ خرید تکراری (%)', value: roundPct(repeatBuyersCount, totalBuyers), type: 'percent', tone: 'good' },
        { label: 'سهم درآمد مشتریان تکراری (%)', value: roundPct(repeatRevenue, totalRevenue), type: 'percent' },
        { label: 'میانگین دوره تکرار خرید (روز)', value: overallAvgGap, type: 'number' },
      ],
      chart: {
        type: 'bar',
        title: 'مقایسه درآمد مشتریان تک‌خرید و تکراری',
        xKey: 'segment',
        yKey: 'revenue',
        valueType: 'money',
        data: [
          { segment: `تک‌خرید (${oneTimeBuyersCount})`, revenue: roundMoney(oneTimeRevenue) },
          { segment: `خرید تکراری (${repeatBuyersCount})`, revenue: roundMoney(repeatRevenue) },
        ],
      },
      params,
    });
  },
};

export default customerRetentionReport;
