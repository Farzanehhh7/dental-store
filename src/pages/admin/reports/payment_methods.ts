import type { PaymentMethod } from '../../../types/domain';
import {
  PAYMENT_METHOD_LABELS,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const paymentMethodsReport: ReportDefinition = {
  id: 'payment_methods',
  group: 'مالی و پرداخت',
  title: '۱۰. سهم روش‌های پرداخت (آنلاین / اعتبار / چک)',
  description: 'توزیع سفارش‌ها و ارزش مالی بر اساس روش پرداخت و تطبیق مبالغ تاییدشده در دفترکل درگاه‌ها.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const verifiedLedgerByOrder = new Map<string, number>();
    for (const entry of data.paymentLedger) {
      if (entry.status === 'verified') {
        verifiedLedgerByOrder.set(
          entry.orderId,
          (verifiedLedgerByOrder.get(entry.orderId) ?? 0) + entry.amount
        );
      }
    }

    const byMethod = new Map<
      PaymentMethod,
      {
        ordersCount: number;
        paidOrdersCount: number;
        grandTotal: number;
        verifiedLedgerAmount: number;
      }
    >();

    for (const o of filteredOrders) {
      const cur = byMethod.get(o.paymentMethod) ?? {
        ordersCount: 0,
        paidOrdersCount: 0,
        grandTotal: 0,
        verifiedLedgerAmount: 0,
      };
      cur.ordersCount += 1;
      if (o.paymentStatus === 'paid') cur.paidOrdersCount += 1;
      cur.grandTotal += o.grandTotal;
      cur.verifiedLedgerAmount += verifiedLedgerByOrder.get(o.id) ?? 0;
      byMethod.set(o.paymentMethod, cur);
    }

    const totalAmount = Array.from(byMethod.values()).reduce((s, r) => s + r.grandTotal, 0);
    const rows = Array.from(byMethod.entries())
      .map(([method, stats]) => ({
        methodCode: method,
        methodLabel: PAYMENT_METHOD_LABELS[method] ?? method,
        ordersCount: stats.ordersCount,
        paidOrdersCount: stats.paidOrdersCount,
        grandTotal: roundMoney(stats.grandTotal),
        verifiedLedgerAmount: roundMoney(stats.verifiedLedgerAmount),
        sharePercent: roundPct(stats.grandTotal, totalAmount),
      }))
      .sort((a, b) => Number(b.grandTotal) - Number(a.grandTotal));

    const totalVerifiedLedger = rows.reduce((s, r) => s + Number(r.verifiedLedgerAmount), 0);

    return createReportResult(this, {
      columns: [
        { key: 'methodLabel', label: 'روش پرداخت', type: 'text' },
        { key: 'ordersCount', label: 'تعداد سفارش', type: 'number' },
        { key: 'paidOrdersCount', label: 'تسویه‌شده', type: 'number' },
        { key: 'grandTotal', label: 'مبلغ کل سفارش‌ها', type: 'money' },
        { key: 'verifiedLedgerAmount', label: 'تاییدشده در دفترکل درگاه', type: 'money' },
        { key: 'sharePercent', label: 'سهم ارزش (%)', type: 'percent' },
      ],
      rows,
      totalsRow: {
        methodLabel: 'جمع کل',
        ordersCount: filteredOrders.length,
        paidOrdersCount: rows.reduce((s, r) => s + Number(r.paidOrdersCount), 0),
        grandTotal: roundMoney(totalAmount),
        verifiedLedgerAmount: totalVerifiedLedger,
        sharePercent: totalAmount > 0 ? 100 : 0,
      },
      summary: [
        { label: 'روش‌های فعال پرداخت', value: rows.length, type: 'number' },
        { label: 'ارزش کل سفارش‌ها', value: roundMoney(totalAmount), type: 'money' },
        { label: 'واریزی تاییدشده درگاه', value: totalVerifiedLedger, type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'سهم مبالغ به تفکیک روش پرداخت',
        xKey: 'methodLabel',
        yKey: 'grandTotal',
        valueType: 'money',
        data: rows.map((r) => ({ methodLabel: r.methodLabel, grandTotal: r.grandTotal })),
      },
      params,
    });
  },
};

export default paymentMethodsReport;
