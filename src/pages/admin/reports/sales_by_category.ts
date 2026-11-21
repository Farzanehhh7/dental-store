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

export const salesByCategoryReport: ReportDefinition = {
  id: 'sales_by_category',
  group: 'فروش و سفارش',
  title: '۲. فروش به تفکیک دسته‌بندی تخصصی',
  description: 'توزیع فروش تعدادی، مبلغ ناخالص و سهم درآمدی هر دسته‌بندی در بازه انتخابی.',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const categoryMap = new Map(data.categories.map((c) => [c.id, c]));
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const q = normalizeSearchText(params?.q);

    const agg = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        vertical: string;
        orderIds: Set<string>;
        unitsSold: number;
        discountTotal: number;
        lineRevenue: number;
      }
    >();

    for (const o of filteredOrders) {
      for (const it of o.items) {
        const prod = productMap.get(it.productId);
        if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
        const catId = prod?.primaryCategoryId ?? 'uncategorized';
        const cat = categoryMap.get(catId);
        const catName = cat?.nameFa ?? 'سایر دسته‌بندی‌ها';
        const vertical = prod?.vertical ?? cat?.vertical ?? 'dental';

        if (q && !normalizeSearchText(`${catName} ${it.titleFa} ${it.sku}`).includes(q)) continue;

        const cur = agg.get(catId) ?? {
          categoryId: catId,
          categoryName: catName,
          vertical,
          orderIds: new Set<string>(),
          unitsSold: 0,
          discountTotal: 0,
          lineRevenue: 0,
        };
        cur.orderIds.add(o.id);
        cur.unitsSold += it.quantity;
        cur.discountTotal += it.discountAmount * it.quantity;
        cur.lineRevenue += it.lineTotal;
        agg.set(catId, cur);
      }
    }

    const totalRevenue = Array.from(agg.values()).reduce((s, r) => s + r.lineRevenue, 0);
    const rows = Array.from(agg.values())
      .sort((a, b) => b.lineRevenue - a.lineRevenue)
      .map((r) => ({
        categoryName: r.categoryName,
        vertical: r.vertical,
        ordersCount: r.orderIds.size,
        unitsSold: r.unitsSold,
        discountTotal: roundMoney(r.discountTotal),
        lineRevenue: roundMoney(r.lineRevenue),
        sharePercent: roundPct(r.lineRevenue, totalRevenue),
      }));

    return createReportResult(this, {
      columns: [
        { key: 'categoryName', label: 'دسته‌بندی تخصصی', type: 'text' },
        { key: 'vertical', label: 'حوزه', type: 'text' },
        { key: 'ordersCount', label: 'سفارش‌ها', type: 'number' },
        { key: 'unitsSold', label: 'تعداد فروش', type: 'number' },
        { key: 'discountTotal', label: 'تخفیف اقلام', type: 'money' },
        { key: 'lineRevenue', label: 'درآمد فروش', type: 'money' },
        { key: 'sharePercent', label: 'سهم از فروش (%)', type: 'percent' },
      ],
      rows,
      totalsRow: {
        categoryName: 'جمع کل',
        vertical: '—',
        ordersCount: filteredOrders.length,
        unitsSold: rows.reduce((s, r) => s + Number(r.unitsSold), 0),
        discountTotal: rows.reduce((s, r) => s + Number(r.discountTotal), 0),
        lineRevenue: roundMoney(totalRevenue),
        sharePercent: rows.length > 0 ? 100 : 0,
      },
      summary: [
        { label: 'دسته‌بندی‌های دارای فروش', value: rows.length, type: 'number' },
        { label: 'کل اقلام فروخته‌شده', value: rows.reduce((s, r) => s + Number(r.unitsSold), 0), type: 'number' },
        { label: 'فروش خالص اقلام', value: roundMoney(totalRevenue), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'درآمد به تفکیک دسته‌بندی',
        xKey: 'categoryName',
        yKey: 'lineRevenue',
        valueType: 'money',
        data: rows.slice(0, 12).map((r) => ({ categoryName: r.categoryName, lineRevenue: r.lineRevenue })),
      },
      params,
    });
  },
};

export default salesByCategoryReport;
