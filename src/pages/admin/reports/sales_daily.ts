import {
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  roundMoney,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

export const salesDailyReport: ReportDefinition = {
  id: 'sales_daily',
  group: 'فروش و سفارش',
  title: '۱. گزارش فروش روزانه و روند درآمد',
  description: 'تجمیع روزانه سفارش‌های غیرلغوشده به تفکیک تاریخ شمسی، تعداد سفارش، تخفیف، مالیات، هزینه ارسال و جمع کل.',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );

    const byDay = new Map<
      string,
      {
        dayKey: string;
        jalaliDate: string;
        ordersCount: number;
        paidCount: number;
        subtotal: number;
        discountTotal: number;
        taxTotal: number;
        shippingTotal: number;
        grandTotal: number;
      }
    >();

    for (const o of filtered) {
      const jalali = toJalaliYmd(o.createdAt);
      const dayKey = o.createdAt.slice(0, 10);
      const bucket = byDay.get(jalali) ?? {
        dayKey,
        jalaliDate: jalali,
        ordersCount: 0,
        paidCount: 0,
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        shippingTotal: 0,
        grandTotal: 0,
      };
      bucket.ordersCount += 1;
      if (o.paymentStatus === 'paid') bucket.paidCount += 1;
      bucket.subtotal += o.subtotal;
      bucket.discountTotal += o.discountTotal;
      bucket.taxTotal += o.taxTotal;
      bucket.shippingTotal += o.shippingTotal;
      bucket.grandTotal += o.grandTotal;
      byDay.set(jalali, bucket);
    }

    const sorted = Array.from(byDay.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    const rows = sorted.map((d) => ({
      date: d.jalaliDate,
      ordersCount: d.ordersCount,
      paidCount: d.paidCount,
      subtotal: roundMoney(d.subtotal),
      discountTotal: roundMoney(d.discountTotal),
      taxTotal: roundMoney(d.taxTotal),
      shippingTotal: roundMoney(d.shippingTotal),
      grandTotal: roundMoney(d.grandTotal),
    }));

    const totalOrders = rows.reduce((s, r) => s + Number(r.ordersCount), 0);
    const totalRevenue = rows.reduce((s, r) => s + Number(r.grandTotal), 0);
    const totalTax = rows.reduce((s, r) => s + Number(r.taxTotal), 0);
    const totalDiscount = rows.reduce((s, r) => s + Number(r.discountTotal), 0);
    const avgOrderValue = totalOrders > 0 ? roundMoney(totalRevenue / totalOrders) : 0;

    return createReportResult(this, {
      columns: [
        { key: 'date', label: 'تاریخ شمسی', type: 'date' },
        { key: 'ordersCount', label: 'تعداد سفارش', type: 'number' },
        { key: 'paidCount', label: 'پرداخت‌شده', type: 'number' },
        { key: 'subtotal', label: 'جمع ناخالص', type: 'money' },
        { key: 'discountTotal', label: 'تخفیف', type: 'money' },
        { key: 'taxTotal', label: 'مالیات VAT', type: 'money' },
        { key: 'shippingTotal', label: 'حمل و نقل', type: 'money' },
        { key: 'grandTotal', label: 'درآمد کل', type: 'money' },
      ],
      rows,
      totalsRow: {
        date: 'جمع کل',
        ordersCount: totalOrders,
        paidCount: rows.reduce((s, r) => s + Number(r.paidCount), 0),
        subtotal: rows.reduce((s, r) => s + Number(r.subtotal), 0),
        discountTotal: totalDiscount,
        taxTotal: totalTax,
        shippingTotal: rows.reduce((s, r) => s + Number(r.shippingTotal), 0),
        grandTotal: totalRevenue,
      },
      summary: [
        { label: 'روزهای فعال فروش', value: rows.length, type: 'number' },
        { label: 'تعداد سفارش', value: totalOrders, type: 'number' },
        { label: 'درآمد کل دوره', value: totalRevenue, type: 'money', tone: 'good' },
        { label: 'میانگین ارزش سفارش (AOV)', value: avgOrderValue, type: 'money' },
      ],
      chart: {
        type: 'line',
        title: 'روند فروش روزانه',
        xKey: 'date',
        yKey: 'grandTotal',
        valueType: 'money',
        data: rows.map((r) => ({ date: r.date, grandTotal: r.grandTotal })),
      },
      params,
    });
  },
};

export default salesDailyReport;
