import {
  buildProductMap,
  calcDaysUntil,
  createReportResult,
  matchesProductFilters,
  normalizeSearchText,
  normalizeStockBatches,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

export const fefoExpiryReport: ReportDefinition = {
  id: 'fefo_expiry',
  group: 'انبار و FEFO',
  title: '۱۹. بچ‌های نزدیک به انقضای FEFO (زیر ۹۰ روز)',
  description: 'پایش بچ‌های دارای تاریخ انقضا به ترتیب اولویت خروج (FEFO) با تفکیک وضعیت منقضی، بحرانی زیر ۳۰ روز و نزدیک انقضا.',
  available: true,
  params: ['brandId', 'categoryId', 'warehouseId', 'status', 'search'],
  run(data, params) {
    const now = data.now ?? new Date();
    const thresholdDays = data.settings?.nearExpiryThresholdDays || 90;
    const productMap = buildProductMap(data.products);
    const warehouseMap = new Map(data.warehouses.map((w) => [w.id, w]));
    const q = normalizeSearchText(params?.q);
    const batches = normalizeStockBatches(data);

    const rows: Array<Record<string, string | number>> = [];
    const buckets = {
      منقضی: 0,
      'زیر ۳۰ روز': 0,
      '۳۱ تا ۹۰ روز': 0,
      'بیش از ۹۰ روز': 0,
    };

    for (const b of batches) {
      if (params?.warehouseId && b.warehouseId !== params.warehouseId) continue;
      const prod = productMap.get(b.productId);
      if (!prod) continue;
      if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) continue;
      const variant = prod.variants.find((v) => v.id === b.variantId) ?? prod.variants[0];
      const available = Math.max(0, b.qty - (b.reserved ?? 0));
      if (b.qty <= 0) continue;

      const days = calcDaysUntil(b.expiryDate, now);
      let urgency = 'سالم';
      if (days !== null) {
        if (days <= 0) {
          urgency = 'منقضی‌شده';
          buckets['منقضی'] += available;
        } else if (days <= 30) {
          urgency = 'بحرانی (<= ۳۰ روز)';
          buckets['زیر ۳۰ روز'] += available;
        } else if (days <= thresholdDays) {
          urgency = `نزدیک انقضا (<= ${thresholdDays} روز)`;
          buckets['۳۱ تا ۹۰ روز'] += available;
        } else {
          buckets['بیش از ۹۰ روز'] += available;
        }
      }

      if (params?.status === 'near_expiry' && (days === null || days > thresholdDays)) continue;
      if (params?.status === 'expired' && (days === null || days > 0)) continue;

      const whName = warehouseMap.get(b.warehouseId)?.nameFa ?? b.warehouseCode;
      if (
        q &&
        !normalizeSearchText(`${prod.titleFa} ${b.batchNo} ${whName} ${variant?.sku ?? prod.sku}`).includes(q)
      ) {
        continue;
      }

      rows.push({
        warehouseName: whName,
        titleFa: prod.titleFa,
        variantLabelFa: variant?.labelFa ?? 'پیش‌فرض',
        batchNo: b.batchNo,
        expiryDate: toJalaliYmd(b.expiryDate),
        daysRemaining: days ?? 0,
        qty: b.qty,
        available,
        specialPrice: b.specialPrice ?? 0,
        conditionLabel: b.condition === 'damaged' ? 'آسیب‌دیده' : 'قابل فروش',
        urgency,
      });
    }

    rows.sort((a, b) => Number(a.daysRemaining) - Number(b.daysRemaining));

    const nearExpiryRows = rows.filter((r) => Number(r.daysRemaining) <= thresholdDays && Number(r.daysRemaining) > 0);
    const expiredRows = rows.filter((r) => Number(r.daysRemaining) <= 0);

    return createReportResult(this, {
      columns: [
        { key: 'warehouseName', label: 'انبار', type: 'text' },
        { key: 'titleFa', label: 'محصول', type: 'text' },
        { key: 'variantLabelFa', label: 'تنوع', type: 'text' },
        { key: 'batchNo', label: 'کد بچ', type: 'text' },
        { key: 'expiryDate', label: 'تاریخ انقضا', type: 'date' },
        { key: 'daysRemaining', label: 'روز باقیمانده', type: 'number' },
        { key: 'qty', label: 'کل بچ', type: 'number' },
        { key: 'available', label: 'قابل فروش', type: 'number' },
        { key: 'specialPrice', label: 'قیمت حراج بچ', type: 'money' },
        { key: 'urgency', label: 'وضعیت انقضا', type: 'status' },
      ],
      rows,
      totalsRow: {
        warehouseName: 'جمع کل بچ‌ها',
        titleFa: `${rows.length} بچ`,
        variantLabelFa: '—',
        batchNo: '—',
        expiryDate: '—',
        daysRemaining: 0,
        qty: rows.reduce((s, r) => s + Number(r.qty), 0),
        available: rows.reduce((s, r) => s + Number(r.available), 0),
        specialPrice: 0,
        urgency: `${nearExpiryRows.length} نزدیک انقضا`,
      },
      summary: [
        { label: 'کل بچ‌های فعال', value: rows.length, type: 'number' },
        { label: `بچ‌های زیر ${thresholdDays} روز`, value: nearExpiryRows.length, type: 'number', tone: nearExpiryRows.length > 0 ? 'warn' : 'good' },
        { label: 'بچ‌های منقضی‌شده', value: expiredRows.length, type: 'number', tone: expiredRows.length > 0 ? 'bad' : 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'توزیع موجودی بچ‌ها بر اساس بازه انقضا',
        xKey: 'bucket',
        yKey: 'units',
        valueType: 'number',
        data: Object.entries(buckets).map(([bucket, units]) => ({ bucket, units })),
      },
      params,
    });
  },
};

export default fefoExpiryReport;
