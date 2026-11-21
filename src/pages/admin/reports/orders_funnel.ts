import type { OrderStatus } from '../../../types/domain';
import {
  ORDER_STATUS_LABELS,
  createReportResult,
  filterOrdersByParams,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_SEQUENCE: OrderStatus[] = [
  'pending_payment',
  'awaiting_review',
  'payment_failed',
  'paid',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'completed',
  'return_requested',
  'returned',
  'refunded',
  'cancelled',
  'expired',
];

export const ordersFunnelReport: ReportDefinition = {
  id: 'orders_funnel',
  group: 'فروش و سفارش',
  title: '۷. قیف وضعیت سفارش‌ها و لغوشده‌ها',
  description: 'تحلیل توزیع سفارش‌ها در هر مرحله از چرخه حیات (در انتظار پرداخت تا تحویل یا لغو/انقضا).',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params);
    const totalCount = filtered.length;

    const bucketMap = new Map<OrderStatus, { count: number; amount: number }>();
    for (const o of filtered) {
      const cur = bucketMap.get(o.status) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += o.grandTotal;
      bucketMap.set(o.status, cur);
    }

    const activeStatuses = STATUS_SEQUENCE.filter((s) => bucketMap.has(s) || params?.status === s);
    const rows = activeStatuses.map((st) => {
      const b = bucketMap.get(st) ?? { count: 0, amount: 0 };
      return {
        statusCode: st,
        statusLabel: ORDER_STATUS_LABELS[st] ?? st,
        ordersCount: b.count,
        sharePercent: roundPct(b.count, totalCount),
        totalAmount: roundMoney(b.amount),
      };
    });

    const cancelledOrExpired = filtered.filter(
      (o) => o.status === 'cancelled' || o.status === 'expired' || o.status === 'payment_failed'
    ).length;
    const fulfillmentSuccess = filtered.filter((o) =>
      ['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed'].includes(o.status)
    ).length;

    return createReportResult(this, {
      columns: [
        { key: 'statusLabel', label: 'وضعیت سفارش', type: 'status' },
        { key: 'statusCode', label: 'کد وضعیت', type: 'text' },
        { key: 'ordersCount', label: 'تعداد', type: 'number' },
        { key: 'sharePercent', label: 'سهم از کل (%)', type: 'percent' },
        { key: 'totalAmount', label: 'ارزش کل', type: 'money' },
      ],
      rows,
      totalsRow: {
        statusLabel: 'جمع کل قیف',
        statusCode: 'all',
        ordersCount: totalCount,
        sharePercent: totalCount > 0 ? 100 : 0,
        totalAmount: rows.reduce((s, r) => s + Number(r.totalAmount), 0),
      },
      summary: [
        { label: 'کل سفارش‌های بررسی‌شده', value: totalCount, type: 'number' },
        { label: 'سفارش‌های موفق / در جریان', value: fulfillmentSuccess, type: 'number', tone: 'good' },
        { label: 'لغو / منقضی / ناموفق', value: cancelledOrExpired, type: 'number', tone: cancelledOrExpired > 0 ? 'warn' : 'neutral' },
        { label: 'نرخ ریزش (%)', value: roundPct(cancelledOrExpired, totalCount), type: 'percent' },
      ],
      chart: {
        type: 'bar',
        title: 'توزیع سفارش‌ها در قیف وضعیت',
        xKey: 'statusLabel',
        yKey: 'ordersCount',
        valueType: 'number',
        data: rows.map((r) => ({ statusLabel: r.statusLabel, ordersCount: r.ordersCount })),
      },
      params,
    });
  },
};

export default ordersFunnelReport;
