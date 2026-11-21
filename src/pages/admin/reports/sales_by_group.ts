import {
  CUSTOMER_GROUP_LABELS,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  normalizeMobileDigits,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const salesByGroupReport: ReportDefinition = {
  id: 'sales_by_group',
  group: 'فروش و سفارش',
  title: '۵. فروش به تفکیک گروه مشتری (عادی/کلینیک/عمده)',
  description: 'تفکیک فروش خالص، تعداد خریداران یکتا، میانگین ارزش سفارش (AOV) و سهم درآمدی هر گروه کاربری B2C/B2B.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );

    const agg = new Map<
      string,
      {
        groupCode: string;
        groupLabel: string;
        buyers: Set<string>;
        ordersCount: number;
        unitsCount: number;
        discountTotal: number;
        grandTotal: number;
      }
    >();

    for (const o of filtered) {
      const groupCode = o.customerGroup;
      const buyerKey = o.userId && !o.userId.startsWith('guest:') ? o.userId : normalizeMobileDigits(o.customerMobile) || o.customerName;
      const cur = agg.get(groupCode) ?? {
        groupCode,
        groupLabel: CUSTOMER_GROUP_LABELS[groupCode] ?? groupCode,
        buyers: new Set<string>(),
        ordersCount: 0,
        unitsCount: 0,
        discountTotal: 0,
        grandTotal: 0,
      };
      cur.buyers.add(buyerKey);
      cur.ordersCount += 1;
      cur.unitsCount += o.items.reduce((s, it) => s + it.quantity, 0);
      cur.discountTotal += o.discountTotal;
      cur.grandTotal += o.grandTotal;
      agg.set(groupCode, cur);
    }

    const totalRevenue = Array.from(agg.values()).reduce((s, r) => s + r.grandTotal, 0);
    const rows = Array.from(agg.values())
      .sort((a, b) => b.grandTotal - a.grandTotal)
      .map((r) => ({
        groupLabel: r.groupLabel,
        buyersCount: r.buyers.size,
        ordersCount: r.ordersCount,
        unitsCount: r.unitsCount,
        discountTotal: roundMoney(r.discountTotal),
        grandTotal: roundMoney(r.grandTotal),
        avgOrderValue: r.ordersCount > 0 ? roundMoney(r.grandTotal / r.ordersCount) : 0,
        sharePercent: roundPct(r.grandTotal, totalRevenue),
      }));

    return createReportResult(this, {
      columns: [
        { key: 'groupLabel', label: 'گروه مشتری', type: 'text' },
        { key: 'buyersCount', label: 'خریداران یکتا', type: 'number' },
        { key: 'ordersCount', label: 'سفارش‌ها', type: 'number' },
        { key: 'unitsCount', label: 'تعداد اقلام', type: 'number' },
        { key: 'discountTotal', label: 'تخفیف اعطایی', type: 'money' },
        { key: 'grandTotal', label: 'فروش کل', type: 'money' },
        { key: 'avgOrderValue', label: 'میانگین سفارش (AOV)', type: 'money' },
        { key: 'sharePercent', label: 'سهم (%)', type: 'percent' },
      ],
      rows,
      totalsRow: {
        groupLabel: 'جمع کل',
        buyersCount: rows.reduce((s, r) => s + Number(r.buyersCount), 0),
        ordersCount: rows.reduce((s, r) => s + Number(r.ordersCount), 0),
        unitsCount: rows.reduce((s, r) => s + Number(r.unitsCount), 0),
        discountTotal: rows.reduce((s, r) => s + Number(r.discountTotal), 0),
        grandTotal: roundMoney(totalRevenue),
        avgOrderValue: filtered.length > 0 ? roundMoney(totalRevenue / filtered.length) : 0,
        sharePercent: totalRevenue > 0 ? 100 : 0,
      },
      summary: [
        { label: 'گروه‌های فعال خرید', value: rows.length, type: 'number' },
        { label: 'کل سفارش‌ها', value: filtered.length, type: 'number' },
        { label: 'جمع فروش گروه‌ها', value: roundMoney(totalRevenue), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'درآمد بر اساس گروه مشتری',
        xKey: 'groupLabel',
        yKey: 'grandTotal',
        valueType: 'money',
        data: rows.map((r) => ({ groupLabel: r.groupLabel, grandTotal: r.grandTotal })),
      },
      params,
    });
  },
};

export default salesByGroupReport;
