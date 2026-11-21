import {
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const salesByProvinceReport: ReportDefinition = {
  id: 'sales_by_province',
  group: 'فروش و سفارش',
  title: '۶. پراکندگی جغرافیایی سفارش‌ها بر اساس استان',
  description: 'توزیع منطقه‌ای سفارش‌ها، شهرهای فعال هر استان، درآمد و هزینه حمل‌ونقل.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filtered = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );

    const byProvince = new Map<
      string,
      {
        province: string;
        cities: Set<string>;
        ordersCount: number;
        shippingTotal: number;
        grandTotal: number;
      }
    >();

    for (const o of filtered) {
      const province = (o.shippingAddress?.province || 'نامشخص').trim() || 'نامشخص';
      const city = (o.shippingAddress?.city || '').trim();
      const cur = byProvince.get(province) ?? {
        province,
        cities: new Set<string>(),
        ordersCount: 0,
        shippingTotal: 0,
        grandTotal: 0,
      };
      if (city) cur.cities.add(city);
      cur.ordersCount += 1;
      cur.shippingTotal += o.shippingTotal;
      cur.grandTotal += o.grandTotal;
      byProvince.set(province, cur);
    }

    const totalRevenue = Array.from(byProvince.values()).reduce((s, x) => s + x.grandTotal, 0);
    const rows = Array.from(byProvince.values())
      .sort((a, b) => b.grandTotal - a.grandTotal)
      .map((r) => ({
        province: r.province,
        citiesCount: r.cities.size,
        ordersCount: r.ordersCount,
        shippingTotal: roundMoney(r.shippingTotal),
        grandTotal: roundMoney(r.grandTotal),
        sharePercent: roundPct(r.grandTotal, totalRevenue),
      }));

    return createReportResult(this, {
      columns: [
        { key: 'province', label: 'استان', type: 'text' },
        { key: 'citiesCount', label: 'شهرهای فعال', type: 'number' },
        { key: 'ordersCount', label: 'تعداد سفارش', type: 'number' },
        { key: 'shippingTotal', label: 'هزینه ارسال', type: 'money' },
        { key: 'grandTotal', label: 'فروش کل', type: 'money' },
        { key: 'sharePercent', label: 'سهم استان (%)', type: 'percent' },
      ],
      rows,
      totalsRow: {
        province: 'جمع کل کشور',
        citiesCount: rows.reduce((s, r) => s + Number(r.citiesCount), 0),
        ordersCount: rows.reduce((s, r) => s + Number(r.ordersCount), 0),
        shippingTotal: rows.reduce((s, r) => s + Number(r.shippingTotal), 0),
        grandTotal: roundMoney(totalRevenue),
        sharePercent: totalRevenue > 0 ? 100 : 0,
      },
      summary: [
        { label: 'استان‌های دارای سفارش', value: rows.length, type: 'number' },
        { label: 'تعداد سفارش کل', value: filtered.length, type: 'number' },
        { label: 'فروش کل استانی', value: roundMoney(totalRevenue), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'پراکندگی درآمد به تفکیک استان',
        xKey: 'province',
        yKey: 'grandTotal',
        valueType: 'money',
        data: rows.slice(0, 12).map((r) => ({ province: r.province, grandTotal: r.grandTotal })),
      },
      params,
    });
  },
};

export default salesByProvinceReport;
