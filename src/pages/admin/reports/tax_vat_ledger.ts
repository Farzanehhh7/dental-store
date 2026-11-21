import {
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  roundMoney,
  roundPct,
  toJalaliYearQuarter,
} from './helpers';
import type { ReportDefinition } from './types';

export const taxVatLedgerReport: ReportDefinition = {
  id: 'tax_vat_ledger',
  group: 'مالی و پرداخت',
  title: '۱۱. گزارش فصلی مالیات بر ارزش افزوده (VAT)',
  description: 'خلاصه فصلی پایه مشمول مالیات، تخفیف‌ها، مبلغ مالیات بر ارزش افزوده (VAT) و تعداد فاکتورهای رسمی صادرشده.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o) && o.status !== 'refunded'
    );
    const officialByOrderId = new Set(
      data.invoices.filter((i) => i.isOfficial && i.status === 'issued').map((i) => i.orderId)
    );

    const byQuarter = new Map<
      string,
      {
        quarter: string;
        ordersCount: number;
        officialInvoicesCount: number;
        subtotal: number;
        discountTotal: number;
        taxableBase: number;
        taxTotal: number;
        grandTotal: number;
      }
    >();

    for (const o of filteredOrders) {
      const quarter = toJalaliYearQuarter(o.createdAt);
      const cur = byQuarter.get(quarter) ?? {
        quarter,
        ordersCount: 0,
        officialInvoicesCount: 0,
        subtotal: 0,
        discountTotal: 0,
        taxableBase: 0,
        taxTotal: 0,
        grandTotal: 0,
      };
      const taxableBase = Math.max(0, o.subtotal - o.discountTotal);
      cur.ordersCount += 1;
      if (officialByOrderId.has(o.id)) cur.officialInvoicesCount += 1;
      cur.subtotal += o.subtotal;
      cur.discountTotal += o.discountTotal;
      cur.taxableBase += taxableBase;
      cur.taxTotal += o.taxTotal;
      cur.grandTotal += o.grandTotal;
      byQuarter.set(quarter, cur);
    }

    const rows = Array.from(byQuarter.values())
      .sort((a, b) => a.quarter.localeCompare(b.quarter, 'fa'))
      .map((r) => ({
        quarter: r.quarter,
        ordersCount: r.ordersCount,
        officialInvoicesCount: r.officialInvoicesCount,
        subtotal: roundMoney(r.subtotal),
        discountTotal: roundMoney(r.discountTotal),
        taxableBase: roundMoney(r.taxableBase),
        taxTotal: roundMoney(r.taxTotal),
        effectiveVatPercent: roundPct(r.taxTotal, r.taxableBase),
        grandTotal: roundMoney(r.grandTotal),
      }));

    const totalTaxable = rows.reduce((s, r) => s + Number(r.taxableBase), 0);
    const totalVat = rows.reduce((s, r) => s + Number(r.taxTotal), 0);
    const totalGrand = rows.reduce((s, r) => s + Number(r.grandTotal), 0);

    return createReportResult(this, {
      columns: [
        { key: 'quarter', label: 'دوره فصلی شمسی', type: 'text' },
        { key: 'ordersCount', label: 'تعداد سفارش', type: 'number' },
        { key: 'officialInvoicesCount', label: 'فاکتور رسمی صادرشده', type: 'number' },
        { key: 'subtotal', label: 'جمع ناخالص', type: 'money' },
        { key: 'discountTotal', label: 'کسورات تخفیف', type: 'money' },
        { key: 'taxableBase', label: 'مأخذ مشمول VAT', type: 'money' },
        { key: 'taxTotal', label: 'مالیات ارزش افزوده', type: 'money' },
        { key: 'effectiveVatPercent', label: 'نرخ مؤثر (%)', type: 'percent' },
        { key: 'grandTotal', label: 'جمع با مالیات و حمل', type: 'money' },
      ],
      rows,
      totalsRow: {
        quarter: 'جمع کل',
        ordersCount: filteredOrders.length,
        officialInvoicesCount: rows.reduce((s, r) => s + Number(r.officialInvoicesCount), 0),
        subtotal: rows.reduce((s, r) => s + Number(r.subtotal), 0),
        discountTotal: rows.reduce((s, r) => s + Number(r.discountTotal), 0),
        taxableBase: totalTaxable,
        taxTotal: totalVat,
        effectiveVatPercent: roundPct(totalVat, totalTaxable),
        grandTotal: totalGrand,
      },
      summary: [
        { label: 'نرخ مصوب تنظیمات (%)', value: data.settings.taxRatePercent, type: 'percent' },
        { label: 'مأخذ کل مشمول', value: totalTaxable, type: 'money' },
        { label: 'مجموع VAT ثبت‌شده', value: totalVat, type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'مالیات ارزش افزوده فصلی',
        xKey: 'quarter',
        yKey: 'taxTotal',
        valueType: 'money',
        data: rows.map((r) => ({ quarter: r.quarter, taxTotal: r.taxTotal })),
      },
      params,
    });
  },
};

export default taxVatLedgerReport;
