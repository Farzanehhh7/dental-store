import {
  createReportResult,
  filterOrdersByParams,
  isNonCancelledOrder,
  normalizeSearchText,
  roundMoney,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const couponEffectivenessReport: ReportDefinition = {
  id: 'coupon_effectiveness',
  group: 'فروش و سفارش',
  title: '۸. اثربخشی کدهای تخفیف و کمپین‌ها',
  description: 'بررسی میزان استفاده واقعی از کدهای تخفیف در سفارش‌ها، مبلغ تخفیف اعطایی و درآمد منتسب به هر کوپن و کمپین.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const filteredOrders = filterOrdersByParams(data.orders, data, params).filter((o) =>
      params?.status ? true : isNonCancelledOrder(o)
    );
    const q = normalizeSearchText(params?.q);

    const byCode = new Map<string, { ordersCount: number; discountGiven: number; revenue: number }>();
    let totalCampaignDiscount = 0;
    let campaignRevenue = 0;

    for (const o of filteredOrders) {
      if (o.couponCode) {
        const key = o.couponCode.trim().toUpperCase();
        const cur = byCode.get(key) ?? { ordersCount: 0, discountGiven: 0, revenue: 0 };
        cur.ordersCount += 1;
        cur.discountGiven += o.discountTotal;
        cur.revenue += o.grandTotal;
        byCode.set(key, cur);
      }
      for (const it of o.items) {
        if (it.priceSource === 'campaign') {
          totalCampaignDiscount += it.discountAmount * it.quantity;
          campaignRevenue += it.lineTotal;
        }
      }
    }

    const rows: Array<Record<string, string | number>> = [];

    for (const c of data.coupons) {
      const codeUpper = c.code.trim().toUpperCase();
      const matched = byCode.get(codeUpper) ?? { ordersCount: 0, discountGiven: 0, revenue: 0 };
      if (q && !normalizeSearchText(`${c.code} ${c.type}`).includes(q)) continue;
      rows.push({
        kind: 'کد تخفیف',
        codeOrName: codeUpper,
        typeLabel: c.type === 'percent' ? `${c.value}٪` : c.type === 'free_shipping' ? 'ارسال رایگان' : `${c.value} تومان`,
        statusLabel: c.isActive ? 'فعال' : 'غیرفعال',
        usageRatePercent: roundPct(c.usageCount, c.usageLimit || 0),
        ordersCount: matched.ordersCount,
        discountGiven: roundMoney(matched.discountGiven),
        attributedRevenue: roundMoney(matched.revenue),
      });
    }

    // Include any coupon codes used on historical orders that were later deleted from coupons catalog
    for (const [codeUpper, matched] of byCode.entries()) {
      if (!data.coupons.some((c) => c.code.trim().toUpperCase() === codeUpper)) {
        if (q && !normalizeSearchText(codeUpper).includes(q)) continue;
        rows.push({
          kind: 'کوپن آرشیوشده',
          codeOrName: codeUpper,
          typeLabel: '—',
          statusLabel: 'آرشیو',
          usageRatePercent: 0,
          ordersCount: matched.ordersCount,
          discountGiven: roundMoney(matched.discountGiven),
          attributedRevenue: roundMoney(matched.revenue),
        });
      }
    }

    for (const camp of data.campaigns) {
      if (q && !normalizeSearchText(`${camp.nameFa} ${camp.badgeTextFa}`).includes(q)) continue;
      const campSet = new Set(camp.productIds);
      let campOrders = 0;
      let campUnitsRevenue = 0;
      let campDiscount = 0;
      for (const o of filteredOrders) {
        const hitItems = o.items.filter((it) => campSet.has(it.productId) && it.priceSource === 'campaign');
        if (hitItems.length > 0) {
          campOrders += 1;
          for (const it of hitItems) {
            campUnitsRevenue += it.lineTotal;
            campDiscount += it.discountAmount * it.quantity;
          }
        }
      }
      rows.push({
        kind: 'کمپین دوره‌ای',
        codeOrName: camp.nameFa,
        typeLabel: `${camp.discountPercent}٪ (${camp.productIds.length} کالا)`,
        statusLabel: camp.status,
        usageRatePercent: 0,
        ordersCount: campOrders,
        discountGiven: roundMoney(campDiscount),
        attributedRevenue: roundMoney(campUnitsRevenue),
      });
    }

    const totalDiscount = rows.reduce((s, r) => s + Number(r.discountGiven), 0);
    const totalRevenue = rows.reduce((s, r) => s + Number(r.attributedRevenue), 0);

    return createReportResult(this, {
      columns: [
        { key: 'kind', label: 'نوع مشوق', type: 'text' },
        { key: 'codeOrName', label: 'کد / عنوان کمپین', type: 'text' },
        { key: 'typeLabel', label: 'مقدار تخفیف', type: 'text' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'usageRatePercent', label: 'نرخ مصرف سقف (%)', type: 'percent' },
        { key: 'ordersCount', label: 'سفارش منتسب', type: 'number' },
        { key: 'discountGiven', label: 'جمع تخفیف', type: 'money' },
        { key: 'attributedRevenue', label: 'درآمد منتسب', type: 'money' },
      ],
      rows,
      totalsRow: {
        kind: 'جمع کل',
        codeOrName: `${rows.length} برنامه`,
        typeLabel: '—',
        statusLabel: '—',
        usageRatePercent: 0,
        ordersCount: rows.reduce((s, r) => s + Number(r.ordersCount), 0),
        discountGiven: totalDiscount,
        attributedRevenue: totalRevenue,
      },
      summary: [
        { label: 'کوپن‌ها و کمپین‌ها', value: rows.length, type: 'number' },
        { label: 'کل تخفیف واقعی اعطاشده', value: totalDiscount, type: 'money' },
        { label: 'درآمد فروش کمپینی', value: roundMoney(campaignRevenue), type: 'money', tone: 'good' },
        { label: 'تخفیف مستقیم کمپین‌ها', value: roundMoney(totalCampaignDiscount), type: 'money' },
      ],
      chart: {
        type: 'bar',
        title: 'درآمد منتسب به کوپن‌ها و کمپین‌ها',
        xKey: 'codeOrName',
        yKey: 'attributedRevenue',
        valueType: 'money',
        data: rows.slice(0, 10).map((r) => ({
          codeOrName: r.codeOrName,
          attributedRevenue: r.attributedRevenue,
        })),
      },
      params,
    });
  },
};

export default couponEffectivenessReport;
