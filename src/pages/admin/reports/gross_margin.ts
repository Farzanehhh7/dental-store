import {
  buildCostLookup,
  createReportResult,
  filterOrdersByParams,
  filterProductsByParams,
  isNonCancelledOrder,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const grossMarginReport: ReportDefinition = {
  id: 'gross_margin',
  group: 'مالی و پرداخت',
  title: '۱۶. حاشیه سود ناخالص بر پایه قیمت خرید محرمانه',
  description: 'محاسبه سود واحد، حاشیه سود درصدی و سود ناخالص تحقق‌یافته از سفارش‌ها بر پایه بهای تمام‌شده ثبت‌شده.',
  available: true,
  sensitiveFinancial: true,
  params: ['dateRange', 'brandId', 'categoryId', 'search'],
  run(data, params) {
    const costMap = buildCostLookup(data.productCosts);
    const filteredProducts = filterProductsByParams(data.products, params);
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter(isNonCancelledOrder);

    const soldStats = new Map<string, { qty: number; revenue: number }>();
    for (const o of filteredOrders) {
      for (const it of o.items) {
        const key = `${it.productId}::${it.variantId}`;
        const cur = soldStats.get(key) ?? { qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.lineTotal;
        soldStats.set(key, cur);
      }
    }

    const rows: Array<Record<string, string | number>> = [];
    for (const p of filteredProducts) {
      for (const v of p.variants) {
        const key = `${p.id}::${v.id}`;
        const cost = costMap.get(key) ?? (typeof v.costPrice === 'number' ? v.costPrice : 0);
        const sell = v.basePrice ?? 0;
        const unitProfit = cost > 0 && sell > 0 ? sell - cost : 0;
        const marginPct = sell > 0 && cost > 0 ? roundPct(unitProfit, sell) : 0;
        const sold = soldStats.get(key) ?? { qty: 0, revenue: 0 };
        const realizedCost = cost > 0 ? cost * sold.qty : 0;
        const realizedProfit = cost > 0 && sold.qty > 0 ? sold.revenue - realizedCost : 0;

        rows.push({
          titleFa: p.titleFa,
          variantLabelFa: v.labelFa,
          sku: v.sku,
          sellPrice: roundMoney(sell),
          costPrice: roundMoney(cost),
          unitProfit: roundMoney(unitProfit),
          marginPercent: marginPct,
          soldQty: sold.qty,
          realizedRevenue: roundMoney(sold.revenue),
          realizedProfit: roundMoney(realizedProfit),
          costStatus: cost > 0 ? 'ثبت‌شده' : 'بهای خرید ثبت‌نشده',
        });
      }
    }

    rows.sort((a, b) => Number(b.realizedProfit) - Number(a.realizedProfit) || Number(b.unitProfit) - Number(a.unitProfit));

    const totalRealizedRevenue = rows.reduce((s, r) => s + Number(r.realizedRevenue), 0);
    const totalRealizedProfit = rows.reduce((s, r) => s + Number(r.realizedProfit), 0);
    const costedCount = rows.filter((r) => Number(r.costPrice) > 0).length;

    return createReportResult(this, {
      columns: [
        { key: 'titleFa', label: 'نام کالا', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'sellPrice', label: 'قیمت فروش پایه', type: 'money' },
        { key: 'costPrice', label: 'بهای تمام‌شده', type: 'money' },
        { key: 'unitProfit', label: 'سود هر واحد', type: 'money' },
        { key: 'marginPercent', label: 'حاشیه سود (%)', type: 'percent' },
        { key: 'soldQty', label: 'تعداد فروش دوره', type: 'number' },
        { key: 'realizedProfit', label: 'سود ناخالص دوره', type: 'money' },
        { key: 'costStatus', label: 'وضعیت بهای خرید', type: 'status' },
      ],
      rows,
      totalsRow: {
        titleFa: 'جمع کل',
        variantLabelFa: `${rows.length} تنوع`,
        sku: '—',
        sellPrice: 0,
        costPrice: 0,
        unitProfit: 0,
        marginPercent: roundPct(totalRealizedProfit, totalRealizedRevenue),
        soldQty: rows.reduce((s, r) => s + Number(r.soldQty), 0),
        realizedProfit: totalRealizedProfit,
        costStatus: `${costedCount}/${rows.length} دارای بها`,
      },
      summary: [
        { label: 'تنوع‌های دارای بهای خرید', value: costedCount, type: 'number' },
        { label: 'درآمد فروش دوره', value: totalRealizedRevenue, type: 'money' },
        { label: 'سود ناخالص تحقق‌یافته', value: totalRealizedProfit, type: 'money', tone: 'good' },
        { label: 'حاشیه سود کل (%)', value: roundPct(totalRealizedProfit, totalRealizedRevenue), type: 'percent' },
      ],
      chart: {
        type: 'bar',
        title: 'بیشترین سود واحد (SKU)',
        xKey: 'sku',
        yKey: 'unitProfit',
        valueType: 'money',
        data: rows.filter((r) => Number(r.costPrice) > 0).slice(0, 10).map((r) => ({
          sku: r.sku,
          unitProfit: r.unitProfit,
        })),
      },
      params,
    });
  },
};

export default grossMarginReport;
