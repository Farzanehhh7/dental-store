import {
  buildProductMap,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  matchesProductFilters,
  normalizeSearchText,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const salesByBrandReport: ReportDefinition = {
  id: 'sales_by_brand',
  group: 'فروش و سفارش',
  title: '۳. عملکرد و سهم فروش برندها',
  description: 'مقایسه درآمد واقعی سفارش‌ها، تعداد اقلام فروخته‌شده و تعداد SKU فعال هر برند.',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const q = normalizeSearchText(params?.q);

    const salesMap = new Map<string, { units: number; revenue: number; orderIds: Set<string> }>();
    for (const o of filteredOrders) {
      for (const it of o.items) {
        const prod = productMap.get(it.productId);
        if (!prod) continue;
        if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
        const entry = salesMap.get(prod.brandId) ?? { units: 0, revenue: 0, orderIds: new Set<string>() };
        entry.units += it.quantity;
        entry.revenue += it.lineTotal;
        entry.orderIds.add(o.id);
        salesMap.set(prod.brandId, entry);
      }
    }

    const activeBrands = data.brands.filter((b) => {
      if (params?.brandId && b.id !== params.brandId) return false;
      if (q && !normalizeSearchText(`${b.nameFa} ${b.nameEn} ${b.countryFa}`).includes(q)) return false;
      return true;
    });

    const totalRevenue = Array.from(salesMap.values()).reduce((s, x) => s + x.revenue, 0);

    const rows = activeBrands
      .map((b) => {
        const brandProducts = data.products.filter(
          (p) => p.brandId === b.id && (!params?.categoryId || matchesProductFilters(p, params))
        );
        const s = salesMap.get(b.id) ?? { units: 0, revenue: 0, orderIds: new Set<string>() };
        return {
          brandName: b.nameFa,
          countryFa: b.countryFa,
          productCount: brandProducts.length,
          ordersCount: s.orderIds.size,
          unitsSold: s.units,
          revenue: roundMoney(s.revenue),
          sharePercent: roundPct(s.revenue, totalRevenue),
        };
      })
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    return createReportResult(this, {
      columns: [
        { key: 'brandName', label: 'برند', type: 'text' },
        { key: 'countryFa', label: 'کشور مبدا', type: 'text' },
        { key: 'productCount', label: 'تعداد کالا', type: 'number' },
        { key: 'ordersCount', label: 'سفارش‌ها', type: 'number' },
        { key: 'unitsSold', label: 'تعداد فروش', type: 'number' },
        { key: 'revenue', label: 'فروش (تومان)', type: 'money' },
        { key: 'sharePercent', label: 'سهم درآمد (%)', type: 'percent' },
      ],
      rows,
      totalsRow: {
        brandName: 'جمع کل',
        countryFa: '—',
        productCount: rows.reduce((s, r) => s + Number(r.productCount), 0),
        ordersCount: filteredOrders.length,
        unitsSold: rows.reduce((s, r) => s + Number(r.unitsSold), 0),
        revenue: roundMoney(totalRevenue),
        sharePercent: totalRevenue > 0 ? 100 : 0,
      },
      summary: [
        { label: 'تعداد برند', value: rows.length, type: 'number' },
        { label: 'جمع واحدهای فروخته‌شده', value: rows.reduce((s, r) => s + Number(r.unitsSold), 0), type: 'number' },
        { label: 'درآمد کل برندها', value: roundMoney(totalRevenue), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'درآمد به تفکیک برند',
        xKey: 'brandName',
        yKey: 'revenue',
        valueType: 'money',
        data: rows.slice(0, 12).map((r) => ({ brandName: r.brandName, revenue: r.revenue })),
      },
      params,
    });
  },
};

export default salesByBrandReport;
