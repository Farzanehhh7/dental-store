import {
  buildProductMap,
  createReportResult,
  matchesProductFilters,
  normalizeSearchText,
  normalizeStockLevels,
} from './helpers';
import type { ReportDefinition } from './types';

export const lowStockAlertReport: ReportDefinition = {
  id: 'low_stock_alert',
  group: 'انبار و FEFO',
  title: '۱۸. کالاهای زیر نقطه سفارش (Low Stock)',
  description: 'شناسایی SKUهایی که موجودی قابل فروش آن‌ها (onHand - reserved) به نقطه هشدار سفارش مجدد یا اتمام موجودی رسیده است.',
  available: true,
  params: ['brandId', 'categoryId', 'warehouseId', 'status', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const warehouseMap = new Map(data.warehouses.map((w) => [w.id, w]));
    const q = normalizeSearchText(params?.q);
    const levels = normalizeStockLevels(data);

    const rows: Array<Record<string, string | number>> = [];
    for (const lvl of levels) {
      if (params?.warehouseId && lvl.warehouseId !== params.warehouseId) continue;
      const prod = productMap.get(lvl.productId);
      if (!prod) continue;
      if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
      const variant = prod.variants.find((v) => v.id === lvl.variantId) ?? prod.variants[0];
      if (!variant) continue;

      const available = Math.max(0, lvl.onHand - lvl.reserved);
      const threshold = lvl.lowStockThreshold ?? variant.lowStockThreshold ?? 5;
      if (available > threshold) continue;

      const alertStatus = available === 0 ? 'ناموجود' : 'کمبود موجودی';
      if (params?.status && params.status !== alertStatus) continue;

      const whName = warehouseMap.get(lvl.warehouseId)?.nameFa ?? lvl.warehouseCode ?? lvl.warehouseId;
      const sku = lvl.sku || variant.sku;
      if (q && !normalizeSearchText(`${prod.titleFa} ${variant.labelFa} ${sku} ${whName}`).includes(q)) continue;

      rows.push({
        warehouseName: whName,
        sku,
        titleFa: prod.titleFa,
        variantLabelFa: variant.labelFa,
        onHand: lvl.onHand,
        reserved: lvl.reserved,
        available,
        threshold,
        shortfallQty: Math.max(1, threshold - available + 1),
        alertStatus,
      });
    }

    rows.sort((a, b) => Number(a.available) - Number(b.available) || Number(b.shortfallQty) - Number(a.shortfallQty));

    const outOfStockCount = rows.filter((r) => Number(r.available) === 0).length;

    return createReportResult(this, {
      columns: [
        { key: 'warehouseName', label: 'انبار', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'titleFa', label: 'محصول', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'onHand', label: 'موجودی فیزیکی', type: 'number' },
        { key: 'reserved', label: 'رزروشده', type: 'number' },
        { key: 'available', label: 'قابل فروش', type: 'number' },
        { key: 'threshold', label: 'آستانه سفارش', type: 'number' },
        { key: 'shortfallQty', label: 'پیشنهاد تامین', type: 'number' },
        { key: 'alertStatus', label: 'وضعیت', type: 'status' },
      ],
      rows,
      totalsRow: {
        warehouseName: 'جمع کل هشدارها',
        sku: `${rows.length} ردیف`,
        titleFa: '—',
        variantLabelFa: '—',
        onHand: rows.reduce((s, r) => s + Number(r.onHand), 0),
        reserved: rows.reduce((s, r) => s + Number(r.reserved), 0),
        available: rows.reduce((s, r) => s + Number(r.available), 0),
        threshold: rows.reduce((s, r) => s + Number(r.threshold), 0),
        shortfallQty: rows.reduce((s, r) => s + Number(r.shortfallQty), 0),
        alertStatus: `${outOfStockCount} ناموجود`,
      },
      summary: [
        { label: 'SKUهای زیر نقطه سفارش', value: rows.length, type: 'number', tone: rows.length > 0 ? 'warn' : 'good' },
        { label: 'اقلام کاملاً ناموجود', value: outOfStockCount, type: 'number', tone: outOfStockCount > 0 ? 'bad' : 'good' },
        { label: 'حداقل تعداد برای جبران', value: rows.reduce((s, r) => s + Number(r.shortfallQty), 0), type: 'number' },
      ],
      chart: {
        type: 'bar',
        title: 'بیشترین کسری موجودی به تفکیک SKU',
        xKey: 'sku',
        yKey: 'shortfallQty',
        valueType: 'number',
        data: rows.slice(0, 10).map((r) => ({ sku: r.sku, shortfallQty: r.shortfallQty })),
      },
      params,
    });
  },
};

export default lowStockAlertReport;
