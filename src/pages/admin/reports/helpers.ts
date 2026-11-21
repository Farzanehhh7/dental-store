import { gregorianToJalali } from '../../../lib/jalali';
import type {
  CustomerGroupCode,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCostRecord,
  StockBatchRecord,
  StockLevel,
} from '../../../types/domain';
import type {
  ReportChartConfig,
  ReportColumn,
  ReportDataset,
  ReportDefinition,
  ReportParams,
  ReportResult,
  ReportSummaryItem,
} from './types';

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeDigits(input: string): string {
  return String(input || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizeSearchText(input: string | undefined | null): string {
  return normalizeDigits(input ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase();
}

export function normalizeMobileDigits(raw: string | undefined): string {
  const digits = normalizeDigits(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('98') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
  return digits;
}

export function jalaliToGregorianDate(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  const jyAdj = jy <= 979 ? jy : jy - 979;
  let days =
    365 * jyAdj +
    Math.floor(jyAdj / 33) * 8 +
    Math.floor(((jyAdj % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  gy += Math.floor((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28;
  const salA = [0, 31, leap, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    const v = salA[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return [gy, gm, gd];
}

export function parseReportDateBoundary(raw: string | undefined, bound: 'start' | 'end'): number | null {
  if (!raw || !raw.trim()) return null;
  const clean = normalizeDigits(raw.trim());
  const dateOnly = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const [gy, gm, gd] = y >= 1300 && y <= 1599 ? jalaliToGregorianDate(y, m, d) : [y, m, d];
    const utcDay = Date.UTC(
      gy,
      gm - 1,
      gd,
      bound === 'start' ? 0 : 23,
      bound === 'start' ? 0 : 59,
      bound === 'start' ? 0 : 59,
      bound === 'start' ? 0 : 999
    );
    return utcDay - TEHRAN_OFFSET_MS;
  }
  const ts = new Date(clean).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function isIsoWithinRange(iso: string | undefined | null, params?: ReportParams): boolean {
  if (!iso) return true;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  const fromMs = parseReportDateBoundary(params?.from, 'start');
  const toMs = parseReportDateBoundary(params?.to, 'end');
  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;
  return true;
}

export function toJalaliYmd(iso?: string | Date | null): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  const tehran = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = gregorianToJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function toJalaliYearQuarter(iso?: string | Date | null): string {
  if (!iso) return 'نامشخص';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return 'نامشخص';
  const tehran = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm] = gregorianToJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  const q = Math.ceil(jm / 3);
  return `${jy} - فصل ${q}`;
}

export function roundMoney(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

export function roundPct(part: number, total: number): number {
  if (!total || !Number.isFinite(part) || !Number.isFinite(total)) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function isNonCancelledOrder(o: Order): boolean {
  return o.status !== 'cancelled' && o.status !== 'expired';
}

export function buildProductMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.id, p]));
}

export function buildCostLookup(costs: ProductCostRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const rec of costs) {
    for (const [variantId, cost] of Object.entries(rec.variantCosts ?? {})) {
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        map.set(`${rec.productId}::${variantId}`, cost);
      }
    }
  }
  return map;
}

export function matchesProductFilters(product: Product | undefined, params?: ReportParams): boolean {
  if (!product) {
    return !params?.brandId && !params?.categoryId;
  }
  if (params?.brandId && product.brandId !== params.brandId) return false;
  if (
    params?.categoryId &&
    product.primaryCategoryId !== params.categoryId &&
    !product.categoryIds.includes(params.categoryId)
  ) {
    return false;
  }
  return true;
}

export function filterOrdersByParams(orders: Order[], data: ReportDataset, params?: ReportParams): Order[] {
  const productMap = buildProductMap(data.products);
  const q = normalizeSearchText(params?.q);
  return orders.filter((o) => {
    if (!isIsoWithinRange(o.createdAt, params)) return false;
    if (params?.status && o.status !== params.status) return false;
    if (params?.brandId || params?.categoryId) {
      const hasMatchingItem = o.items.some((it) => matchesProductFilters(productMap.get(it.productId), params));
      if (!hasMatchingItem) return false;
    }
    if (q) {
      const hay = normalizeSearchText(
        `${o.orderNo} ${o.customerName} ${o.customerMobile} ${o.shippingAddress?.province ?? ''} ${
          o.shippingAddress?.city ?? ''
        } ${o.couponCode ?? ''}`
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterProductsByParams(products: Product[], params?: ReportParams): Product[] {
  const q = normalizeSearchText(params?.q);
  return products.filter((p) => {
    if (!matchesProductFilters(p, params)) return false;
    if (params?.status && p.status !== params.status) return false;
    if (q) {
      const hay = normalizeSearchText(`${p.titleFa} ${p.titleEn} ${p.sku} ${p.imedCode ?? ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function normalizeStockLevels(data: ReportDataset): StockLevel[] {
  if (data.stockLevels.length > 0) return data.stockLevels;
  const defaultWh = data.warehouses.find((w) => w.isDefault) ?? data.warehouses[0];
  const whId = defaultWh?.id ?? 'wh_teh';
  const whCode = defaultWh?.code ?? 'TEH-CENTRAL';
  const rows: StockLevel[] = [];
  for (const p of data.products) {
    for (const v of p.variants) {
      if (v.stockLevels && v.stockLevels.length > 0) {
        rows.push(...v.stockLevels);
      } else {
        rows.push({
          id: `${whId}__${v.id}`,
          productId: p.id,
          variantId: v.id,
          sku: v.sku,
          warehouseId: whId,
          warehouseCode: whCode,
          onHand: v.stockOnHand ?? 0,
          reserved: v.reserved ?? 0,
          lowStockThreshold: v.lowStockThreshold ?? 5,
          updatedAt: p.updatedAt,
        });
      }
    }
  }
  return rows;
}

export function normalizeStockBatches(data: ReportDataset): StockBatchRecord[] {
  if (data.stockBatches.length > 0) return data.stockBatches;
  const defaultWh = data.warehouses.find((w) => w.isDefault) ?? data.warehouses[0];
  const out: StockBatchRecord[] = [];
  for (const p of data.products) {
    for (const v of p.variants) {
      for (const b of v.batches ?? []) {
        const warehouseId =
          b.warehouseId ??
          data.warehouses.find((w) => w.code === b.warehouseCode)?.id ??
          defaultWh?.id ??
          'wh_teh';
        out.push({
          id: b.id,
          productId: p.id,
          variantId: v.id,
          warehouseId,
          warehouseCode: b.warehouseCode || defaultWh?.code || 'TEH-CENTRAL',
          batchNo: b.batchNo,
          expiryDate: b.expiryDate ?? b.expiresAt,
          qty: b.qty ?? b.qtyOnHand ?? 0,
          reserved: b.reserved ?? 0,
          unitCost: b.unitCost,
          specialPrice: b.specialPrice ?? null,
          condition: b.condition ?? 'resellable',
          updatedAt: p.updatedAt,
        });
      }
    }
  }
  return out;
}

export function calcDaysUntil(isoDate: string, now: Date): number | null {
  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - now.getTime()) / DAY_MS);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'در انتظار پرداخت',
  awaiting_review: 'در انتظار بررسی مالی',
  payment_failed: 'پرداخت ناموفق',
  paid: 'پرداخت‌شده',
  processing: 'در حال پردازش',
  packed: 'بسته‌بندی‌شده',
  shipped: 'ارسال‌شده',
  delivered: 'تحویل‌داده‌شده',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
  expired: 'منقضی‌شده',
  refunded: 'مستردشده',
  return_requested: 'درخواست مرجوعی',
  returned: 'مرجوع‌شده',
};

export const CUSTOMER_GROUP_LABELS: Record<CustomerGroupCode, string> = {
  retail: 'خریدار عادی',
  dentist: 'دندانپزشک',
  clinic: 'کلینیک / درمانگاه',
  lab: 'لابراتوار',
  student: 'دانشجو',
  agent: 'نماینده فروش',
  wholesale: 'عمده‌فروش',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'پرداخت آنلاین',
  cash_on_delivery: 'پرداخت در محل',
  bank_transfer: 'کارت‌به‌کارت / حواله',
  credit_request: 'اعتبار B2B',
  cheque_request: 'چک صیادی',
  installment_request: 'اقساطی',
};

export function createReportResult(
  def: Pick<ReportDefinition, 'id' | 'group' | 'title' | 'description' | 'available' | 'unavailableReason'>,
  options: {
    columns: ReportColumn[];
    rows: Array<Record<string, string | number>>;
    totalsRow?: Record<string, string | number>;
    summary: ReportSummaryItem[];
    chart?: ReportChartConfig;
    params?: ReportParams;
  }
): ReportResult {
  const allRowsCount = options.rows.length;
  const rawLimit = options.params?.limit ?? 25;
  const limit = Math.max(1, Math.min(5000, Math.floor(rawLimit)));
  const totalPages = Math.max(1, Math.ceil(allRowsCount / limit));
  const rawPage = options.params?.page ?? 1;
  const page = Math.max(1, Math.min(totalPages, Math.floor(rawPage)));
  const offset = (page - 1) * limit;

  return {
    id: def.id,
    group: def.group,
    title: def.title,
    description: def.description,
    available: def.available,
    ...(def.unavailableReason ? { unavailableReason: def.unavailableReason } : {}),
    columns: options.columns,
    rows: options.rows.slice(offset, offset + limit),
    allRowsCount,
    page,
    limit,
    totalPages,
    ...(options.totalsRow ? { totalsRow: options.totalsRow } : {}),
    summary: options.summary,
    ...(options.chart ? { chart: options.chart } : {}),
  };
}

export function filterRowsBySearch(
  rows: Array<Record<string, string | number>>,
  q: string | undefined
): Array<Record<string, string | number>> {
  const needle = normalizeSearchText(q);
  if (!needle) return rows;
  return rows.filter((r) =>
    Object.values(r).some((v) => normalizeSearchText(String(v)).includes(needle))
  );
}
