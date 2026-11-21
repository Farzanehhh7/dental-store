import {
  buildCostLookup,
  buildProductMap,
  createReportResult,
  matchesProductFilters,
  normalizeSearchText,
  normalizeStockLevels,
  roundMoney,
} from './helpers';
import type { ReportDefinition } from './types';

export const stockValuationReport: ReportDefinition = {
  id: 'stock_valuation',
  group: 'انبار و FEFO',
  title: '۱۷. ارزش‌گذاری ریالی موجودی انبار',
  description: 'ارزش‌گذاری موجودی فیزیکی (onHand) و موجودی قابل فروش (onHand - reserved) در هر انبار بر اساس بهای تمام‌شده و قیمت فروش پایه.',
  available: true,
  params: ['brandId', 'categoryId', 'warehouseId', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const warehouseMap = new Map(data.warehouses.map((w) => [w.id, w]));
    const costMap = buildCostLookup(data.productCosts);
    const q = normalizeSearchText(params?.q);
    const levels = normalizeStockLevels(data);

    const rows: Array<Record<string, string | number>> = [];
    const byWarehouse = new Map<string, number>();

    for (const lvl of levels) {
      if (params?.warehouseId && lvl.warehouseId !== params.warehouseId) continue;
      const prod = productMap.get(lvl.productId);
      if (!prod) continue;
      if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
      const variant = prod.variants.find((v) => v.id === lvl.variantId) ?? prod.variants[0];
      if (!variant) continue;

      const wh = warehouseMap.get(lvl.warehouseId);
      const warehouseName = wh?.nameFa ?? lvl.warehouseCode ?? lvl.warehouseId;
      const sku = lvl.sku || variant.sku;
      if (q && !normalizeSearchText(`${prod.titleFa} ${variant.labelFa} ${sku} ${warehouseName}`).includes(q)) continue;

      const onHand = Math.max(0, lvl.onHand);
      const reserved = Math.max(0, lvl.reserved);
      const available = Math.max(0, onHand - reserved);
      const unitCost = costMap.get(`${prod.id}::${variant.id}`) ?? variant.costPrice ?? 0;
      const unitRetail = variant.basePrice ?? 0;
      const costValue = roundMoney(onHand * unitCost);
      const retailValue = roundMoney(available * unitRetail);

      byWarehouse.set(warehouseName, (byWarehouse.get(warehouseName) ?? 0) + costValue);

      rows.push({
        warehouseName,
        sku,
        titleFa: prod.titleFa,
        variantLabelFa: variant.labelFa,
        onHand,
        reserved,
        available,
        unitCost: roundMoney(unitCost),
        costValue,
        retailValue,
      });
    }

    rows.sort((a, b) => Number(b.costValue) - Number(a.costValue) || Number(b.retailValue) - Number(a.retailValue));

    const totalCostValue = rows.reduce((s, r) => s + Number(r.costValue), 0);
    const totalRetailValue = rows.reduce((s, r) => s + Number(r.retailValue), 0);
    const totalOnHand = rows.reduce((s, r) => s + Number(r.onHand), 0);
    const totalAvailable = rows.reduce((s, r) => s + Number(r.available), 0);

    return createReportResult(this, {
      columns: [
        { key: 'warehouseName', label: 'انبار', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'titleFa', label: 'محصول', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'onHand', label: 'فیزیکی (onHand)', type: 'number' },
        { key: 'reserved', label: 'رزروشده', type: 'number' },
        { key: 'available', label: 'قابل فروش', type: 'number' },
        { key: 'unitCost', label: 'بهای واحد', type: 'money' },
        { key: 'costValue', label: 'ارزش بهای تمام‌شده', type: 'money' },
        { key: 'retailValue', label: 'ارزش فروش قابل عرضه', type: 'money' },
      ],
      rows,
      totalsRow: {
        warehouseName: 'جمع کل',
        sku: `${rows.length} ردیف`,
        titleFa: '—',
        variantLabelFa: '—',
        onHand: totalOnHand,
        reserved: rows.reduce((s, r) => s + Number(r.reserved), 0),
        available: totalAvailable,
        unitCost: 0,
        costValue: totalCostValue,
        retailValue: totalRetailValue,
      },
      summary: [
        { label: 'مجموع تعداد موجودی فیزیکی', value: totalOnHand, type: 'number' },
        { label: 'موجودی قابل فروش', value: totalAvailable, type: 'number' },
        { label: 'ارزش کل بهای تمام‌شده', value: totalCostValue, type: 'money', tone: 'good' },
        { label: 'ارزش فروش خالص موجودی', value: totalRetailValue, type: 'money' },
      ],
      chart: {
        type: 'bar',
        title: 'ارزش موجودی به تفکیک انبار',
        xKey: 'warehouse',
        yKey: 'costValue',
        valueType: 'money',
        data: Array.from(byWarehouse.entries()).map(([warehouse, costValue]) => ({ warehouse, costValue })),
      },
      params,
    });
  },
};

export default stockValuationReport;
