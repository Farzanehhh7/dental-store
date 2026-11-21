import {
  buildProductMap,
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  matchesProductFilters,
  normalizeSearchText,
  normalizeStockLevels,
  roundMoney,
} from './helpers';
import type { ReportDefinition } from './types';

export const salesBySkuReport: ReportDefinition = {
  id: 'sales_by_sku',
  group: 'فروش و سفارش',
  title: '۴. پرفروش‌ترین SKUها و تنوع‌ها',
  description: 'رتبه‌بندی پرفروش‌ترین تنوع‌های کالا (SKU) بر اساس درآمد، تعداد فروش، میانگین قیمت و موجودی قابل فروش فعلی.',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const brandMap = new Map(data.brands.map((b) => [b.id, b.nameFa]));
    const levels = normalizeStockLevels(data);
    const availableByVariant = new Map<string, number>();
    for (const lvl of levels) {
      availableByVariant.set(lvl.variantId, (availableByVariant.get(lvl.variantId) ?? 0) + Math.max(0, lvl.onHand - lvl.reserved));
    }

    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const q = normalizeSearchText(params?.q);

    const skuMap = new Map<
      string,
      {
        sku: string;
        titleFa: string;
        variantLabelFa: string;
        brandName: string;
        unitsSold: number;
        revenue: number;
        ordersCount: Set<string>;
        availableStock: number;
      }
    >();

    for (const o of filteredOrders) {
      for (const it of o.items) {
        const prod = productMap.get(it.productId);
        if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
        const brandName = prod ? brandMap.get(prod.brandId) ?? '—' : '—';
        if (q && !normalizeSearchText(`${it.sku} ${it.titleFa} ${it.variantLabelFa} ${brandName}`).includes(q)) continue;

        const key = `${it.productId}::${it.variantId}`;
        const cur = skuMap.get(key) ?? {
          sku: it.sku,
          titleFa: it.titleFa,
          variantLabelFa: it.variantLabelFa,
          brandName,
          unitsSold: 0,
          revenue: 0,
          ordersCount: new Set<string>(),
          availableStock: availableByVariant.get(it.variantId) ?? 0,
        };
        cur.unitsSold += it.quantity;
        cur.revenue += it.lineTotal;
        cur.ordersCount.add(o.id);
        skuMap.set(key, cur);
      }
    }

    const rows = Array.from(skuMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((r) => ({
        sku: r.sku,
        titleFa: r.titleFa,
        variantLabelFa: r.variantLabelFa,
        brandName: r.brandName,
        ordersCount: r.ordersCount.size,
        unitsSold: r.unitsSold,
        avgUnitPrice: r.unitsSold > 0 ? roundMoney(r.revenue / r.unitsSold) : 0,
        revenue: roundMoney(r.revenue),
        availableStock: r.availableStock,
      }));

    return createReportResult(this, {
      columns: [
        { key: 'sku', label: 'کد SKU', type: 'text' },
        { key: 'titleFa', label: 'نام محصول', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'brandName', label: 'برند', type: 'text' },
        { key: 'ordersCount', label: 'سفارش', type: 'number' },
        { key: 'unitsSold', label: 'تعداد فروش', type: 'number' },
        { key: 'avgUnitPrice', label: 'میانگین قیمت واحد', type: 'money' },
        { key: 'revenue', label: 'فروش کل', type: 'money' },
        { key: 'availableStock', label: 'موجودی فعلی', type: 'number' },
      ],
      rows,
      totalsRow: {
        sku: 'جمع کل',
        titleFa: `${rows.length} تنوع`,
        variantLabelFa: '—',
        brandName: '—',
        ordersCount: filteredOrders.length,
        unitsSold: rows.reduce((s, r) => s + Number(r.unitsSold), 0),
        avgUnitPrice: 0,
        revenue: rows.reduce((s, r) => s + Number(r.revenue), 0),
        availableStock: rows.reduce((s, r) => s + Number(r.availableStock), 0),
      },
      summary: [
        { label: 'SKUهای فروش‌رفته', value: rows.length, type: 'number' },
        { label: 'تعداد واحد فروخته‌شده', value: rows.reduce((s, r) => s + Number(r.unitsSold), 0), type: 'number' },
        { label: 'فروش کل SKUها', value: rows.reduce((s, r) => s + Number(r.revenue), 0), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: '۱۰ SKU پرفروش بر اساس درآمد',
        xKey: 'sku',
        yKey: 'revenue',
        valueType: 'money',
        data: rows.slice(0, 10).map((r) => ({ sku: r.sku, revenue: r.revenue })),
      },
      params,
    });
  },
};

export default salesBySkuReport;
