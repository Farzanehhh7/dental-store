import type { StockMovementType } from '../../../types/domain';
import {
  buildProductMap,
  createReportResult,
  isIsoWithinRange,
  matchesProductFilters,
  normalizeSearchText,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  receive: 'ورود / رسید',
  reserve: 'رزرو سفارش',
  release: 'آزادسازی رزرو',
  commit: 'قطعی خروج سفارش',
  adjust: 'تعدیل دستی',
  transfer: 'انتقال بین انبار',
  return: 'برگشت به انبار (RMA)',
  sale: 'فروش',
  stocktake: 'انبارگردانی',
};

export const stockMovementsReport: ReportDefinition = {
  id: 'stock_movements',
  group: 'انبار و FEFO',
  title: '۲۰. گردش دفترکل ورود و خروج کالا',
  description: 'ثبت‌نامه کامل و تغییرناپذیر تمام تراکنش‌های موجودی انبار (رسید، رزرو، خروج، انتقال، تعدیل و بازگشت RMA).',
  available: true,
  params: ['dateRange', 'status', 'brandId', 'categoryId', 'warehouseId', 'search'],
  run(data, params) {
    const productMap = buildProductMap(data.products);
    const q = normalizeSearchText(params?.q);

    const filtered = data.stockMovements.filter((m) => {
      if (!isIsoWithinRange(m.createdAt, params)) return false;
      if (params?.status && m.type !== params.status) return false;
      if (params?.warehouseId && m.warehouseId !== params.warehouseId && m.toWarehouseId !== params.warehouseId) {
        return false;
      }
      const prod = productMap.get(m.productId);
      if ((params?.brandId || params?.categoryId) && !matchesProductFilters(prod, params)) return false;
      if (
        q &&
        !normalizeSearchText(
          `${m.sku} ${m.productTitleFa} ${m.warehouseCode} ${m.toWarehouseCode ?? ''} ${m.batchNo ?? ''} ${
            m.reason
          } ${m.actorEmail}`
        ).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const rows = sorted.map((m) => ({
      createdAt: toJalaliYmd(m.createdAt),
      typeLabel: MOVEMENT_TYPE_LABELS[m.type] ?? m.type,
      sku: m.sku,
      productTitleFa: m.productTitleFa,
      warehouseCode: m.toWarehouseCode ? `${m.warehouseCode} -> ${m.toWarehouseCode}` : m.warehouseCode,
      batchNo: m.batchNo || '—',
      delta: m.delta,
      reason: m.reason,
      actorEmail: m.actorEmail,
    }));

    const byType = new Map<string, number>();
    let totalIn = 0;
    let totalOut = 0;
    for (const m of filtered) {
      const lbl = MOVEMENT_TYPE_LABELS[m.type] ?? m.type;
      byType.set(lbl, (byType.get(lbl) ?? 0) + Math.abs(m.delta));
      if (m.delta > 0) totalIn += m.delta;
      if (m.delta < 0) totalOut += Math.abs(m.delta);
    }

    return createReportResult(this, {
      columns: [
        { key: 'createdAt', label: 'تاریخ', type: 'date' },
        { key: 'typeLabel', label: 'نوع گردش', type: 'status' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'productTitleFa', label: 'کالا', type: 'text' },
        { key: 'warehouseCode', label: 'انبار / مسیر انتقال', type: 'text' },
        { key: 'batchNo', label: 'بچ', type: 'text' },
        { key: 'delta', label: 'تغییر تعداد', type: 'number' },
        { key: 'reason', label: 'شرح / سند مرجع', type: 'text' },
        { key: 'actorEmail', label: 'کاربر ثبت‌کننده', type: 'text' },
      ],
      rows,
      totalsRow: {
        createdAt: 'جمع کل',
        typeLabel: `${rows.length} سند`,
        sku: '—',
        productTitleFa: '—',
        warehouseCode: '—',
        batchNo: '—',
        delta: totalIn - totalOut,
        reason: `ورود: ${totalIn} | خروج: ${totalOut}`,
        actorEmail: '—',
      },
      summary: [
        { label: 'کل اسناد گردش انبار', value: rows.length, type: 'number' },
        { label: 'مجموع ورودی (+)', value: totalIn, type: 'number', tone: 'good' },
        { label: 'مجموع خروجی (-)', value: totalOut, type: 'number', tone: 'warn' },
      ],
      chart: {
        type: 'bar',
        title: 'حجم تراکنش‌های انبار بر اساس نوع عملیات',
        xKey: 'type',
        yKey: 'volume',
        valueType: 'number',
        data: Array.from(byType.entries()).map(([type, volume]) => ({ type, volume })),
      },
      params,
    });
  },
};

export default stockMovementsReport;
