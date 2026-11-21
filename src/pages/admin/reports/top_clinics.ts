import {
  CUSTOMER_GROUP_LABELS,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  normalizeMobileDigits,
  roundMoney,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

export const topClinicsReport: ReportDefinition = {
  id: 'top_clinics',
  group: 'مشتریان و B2B',
  title: '۲۳. مشتریان کلیدی و کلینیک‌های با LTV بالا',
  description: 'رتبه‌بندی مشتریان و کلینیک‌ها بر اساس ارزش طول عمر (LTV)، تعداد سفارش‌های موفق، میانگین سبد خرید و تاریخ آخرین سفارش.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const usersByUid = new Map(data.usersList.map((u) => [u.uid, u]));

    const buyers = new Map<
      string,
      {
        customerName: string;
        customerMobile: string;
        clinicName: string;
        groupLabel: string;
        ordersCount: number;
        paidOrdersCount: number;
        totalLtv: number;
        lastOrderAt: string;
      }
    >();

    for (const o of filtered) {
      const normMob = normalizeMobileDigits(o.customerMobile);
      const buyerKey =
        o.userId && !o.userId.startsWith('guest:') && !o.userId.startsWith('mobile:')
          ? o.userId
          : normMob || o.userId || o.customerName;
      const profile = usersByUid.get(o.userId);
      const cur = buyers.get(buyerKey) ?? {
        customerName: profile?.displayName || o.customerName,
        customerMobile: o.customerMobile,
        clinicName: profile?.clinicName || (o.customerGroup === 'clinic' || o.customerGroup === 'lab' ? o.customerName : '—'),
        groupLabel: CUSTOMER_GROUP_LABELS[o.customerGroup] ?? o.customerGroup,
        ordersCount: 0,
        paidOrdersCount: 0,
        totalLtv: 0,
        lastOrderAt: o.createdAt,
      };
      cur.ordersCount += 1;
      if (o.paymentStatus === 'paid') cur.paidOrdersCount += 1;
      cur.totalLtv += o.grandTotal;
      if (new Date(o.createdAt).getTime() > new Date(cur.lastOrderAt).getTime()) {
        cur.lastOrderAt = o.createdAt;
      }
      buyers.set(buyerKey, cur);
    }

    const rows = Array.from(buyers.values())
      .sort((a, b) => b.totalLtv - a.totalLtv)
      .map((b) => ({
        customerName: b.customerName,
        clinicName: b.clinicName,
        customerMobile: b.customerMobile,
        groupLabel: b.groupLabel,
        ordersCount: b.ordersCount,
        paidOrdersCount: b.paidOrdersCount,
        avgOrderValue: b.ordersCount > 0 ? roundMoney(b.totalLtv / b.ordersCount) : 0,
        totalLtv: roundMoney(b.totalLtv),
        lastOrderAt: toJalaliYmd(b.lastOrderAt),
      }));

    const sumLtv = rows.reduce((s, r) => s + Number(r.totalLtv), 0);
    const avgLtvPerCustomer = rows.length > 0 ? roundMoney(sumLtv / rows.length) : 0;

    return createReportResult(this, {
      columns: [
        { key: 'customerName', label: 'نام خریدار', type: 'text' },
        { key: 'clinicName', label: 'کلینیک / مرکز', type: 'text' },
        { key: 'customerMobile', label: 'موبایل', type: 'text' },
        { key: 'groupLabel', label: 'گروه', type: 'text' },
        { key: 'ordersCount', label: 'کل سفارش‌ها', type: 'number' },
        { key: 'paidOrdersCount', label: 'سفارش تسویه‌شده', type: 'number' },
        { key: 'avgOrderValue', label: 'میانگین سبد (AOV)', type: 'money' },
        { key: 'totalLtv', label: 'ارزش طول عمر (LTV)', type: 'money' },
        { key: 'lastOrderAt', label: 'آخرین سفارش', type: 'date' },
      ],
      rows,
      totalsRow: {
        customerName: 'جمع کل',
        clinicName: `${rows.length} مشتری یکتا`,
        customerMobile: '—',
        groupLabel: '—',
        ordersCount: rows.reduce((s, r) => s + Number(r.ordersCount), 0),
        paidOrdersCount: rows.reduce((s, r) => s + Number(r.paidOrdersCount), 0),
        avgOrderValue: avgLtvPerCustomer,
        totalLtv: sumLtv,
        lastOrderAt: '—',
      },
      summary: [
        { label: 'مشتریان یکتای فعال', value: rows.length, type: 'number' },
        { label: 'میانگین LTV هر مشتری', value: avgLtvPerCustomer, type: 'money' },
        { label: 'مجموع LTV دوره', value: sumLtv, type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: '۱۰ مشتری برتر بر اساس ارزش طول عمر (LTV)',
        xKey: 'customerName',
        yKey: 'totalLtv',
        valueType: 'money',
        data: rows.slice(0, 10).map((r) => ({
          customerName: r.customerName,
          totalLtv: r.totalLtv,
        })),
      },
      params,
    });
  },
};

export default topClinicsReport;
