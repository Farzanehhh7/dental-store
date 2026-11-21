import {
  buildCostLookup,
  createReportResult,
  filterOrdersByParams,
  filterProductsByParams,
  isNonCancelledOrder,
  normalizeStockLevels,
  roundMoney,
} from './helpers';
import type { ReportDefinition } from './types';

export const deadStockReport: ReportDefinition = {
  id: 'dead_stock',
  group: 'انبار و FEFO',
  title: '۲۱. کالاهای راکد و بدون فروش اخیر',
  description: 'شناسایی کالاهای دارای موجودی قابل فروش که در بازه انتخابی هیچ فروش ثبت‌شده‌ای نداشته‌اند (سرمایه راکد در انبار).',
  available: true,
  params: ['dateRange', 'brandId', 'categoryId', 'warehouseId', 'search'],
  run(data, params) {
    const filteredProducts = filterProductsByParams(data.products, params);
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter(isNonCancelledOrder);
    const costMap = buildCostLookup(data.productCosts);
    const brandMap = new Map(data.brands.map((b) => [b.id, b.nameFa]));
    const categoryMap = new Map(data.categories.map((c) => [c.id, c.nameFa]));
    const levels = normalizeStockLevels(data);

    const periodSoldByVariant = new Map<string, number>();
    for (const o of filteredOrders) {
      for (const it of o.items) {
        const key = `${it.productId}::${it.variantId}`;
        periodSoldByVariant.set(key, (periodSoldByVariant.get(key) ?? 0) + it.quantity);
      }
    }

    const availableByVariant = new Map<string, number>();
    for (const lvl of levels) {
      if (params?.warehouseId && lvl.warehouseId !== params.warehouseId) continue;
      const key = `${lvl.productId}::${lvl.variantId}`;
      availableByVariant.set(key, (availableByVariant.get(key) ?? 0) + Math.max(0, lvl.onHand - lvl.reserved));
    }

    const rows: Array<Record<string, string | number>> = [];
    const byCategory = new Map<string, number>();

    for (const p of filteredProducts) {
      if (p.status === 'archived') continue;
      const brandName = brandMap.get(p.brandId) ?? '—';
      const categoryName = categoryMap.get(p.primaryCategoryId) ?? 'سایر';
      for (const v of p.variants) {
        const key = `${p.id}::${v.id}`;
        const available = availableByVariant.get(key) ?? 0;
        if (available <= 0) continue;
        const periodSold = periodSoldByVariant.get(key) ?? 0;
        if (periodSold > 0) continue;

        const unitCost = costMap.get(key) ?? v.costPrice ?? v.basePrice ?? 0;
        const tiedCapital = roundMoney(available * unitCost);
        byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + tiedCapital);

        rows.push({
          sku: v.sku,
          titleFa: p.titleFa,
          variantLabelFa: v.labelFa,
          brandName,
          categoryName,
          availableQty: available,
          unitValuation: roundMoney(unitCost),
          tiedCapital,
          historicalSoldCount: p.soldCount,
          status: p.soldCount === 0 ? 'بدون سابقه فروش' : 'بدون فروش در دوره',
        });
      }
    }

    rows.sort((a, b) => Number(b.tiedCapital) - Number(a.tiedCapital) || Number(b.availableQty) - Number(a.availableQty));
    const totalTiedCapital = rows.reduce((s, r) => s + Number(r.tiedCapital), 0);
    const totalDeadUnits = rows.reduce((s, r) => s + Number(r.availableQty), 0);

    return createReportResult(this, {
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'titleFa', label: 'محصول', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'brandName', label: 'برند', type: 'text' },
        { key: 'categoryName', label: 'دسته‌بندی', type: 'text' },
        { key: 'availableQty', label: 'موجودی راکد', type: 'number' },
        { key: 'unitValuation', label: 'ارزش واحد', type: 'money' },
        { key: 'tiedCapital', label: 'سرمایه قفل‌شده', type: 'money' },
        { key: 'historicalSoldCount', label: 'فروش تاریخی محصول', type: 'number' },
        { key: 'status', label: 'وضعیت', type: 'status' },
      ],
      rows,
      totalsRow: {
        sku: 'جمع کل',
        titleFa: `${rows.length} تنوع راکد`,
        variantLabelFa: '—',
        brandName: '—',
        categoryName: '—',
        availableQty: totalDeadUnits,
        unitValuation: 0,
        tiedCapital: totalTiedCapital,
        historicalSoldCount: 0,
        status: '—',
      },
      summary: [
        { label: 'SKUهای بدون فروش در بازه', value: rows.length, type: 'number', tone: rows.length > 0 ? 'warn' : 'good' },
        { label: 'تعداد کل اقلام راکد', value: totalDeadUnits, type: 'number' },
        { label: 'ارزش سرمایه قفل‌شده', value: totalTiedCapital, type: 'money', tone: totalTiedCapital > 0 ? 'warn' : 'neutral' },
      ],
      chart: {
        type: 'bar',
        title: 'سرمایه راکد بر اساس دسته‌بندی',
        xKey: 'category',
        yKey: 'tiedCapital',
        valueType: 'money',
        data: Array.from(byCategory.entries())
          .map(([category, tiedCapital]) => ({ category, tiedCapital }))
          .sort((a, b) => b.tiedCapital - a.tiedCapital)
          .slice(0, 10),
      },
      params,
    });
  },
};

export default deadStockReport;
