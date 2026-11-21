import abandonedRecoveryReport from './abandoned_recovery';
import b2bPipelineReport from './b2b_pipeline';
import catalogQaImedReport from './catalog_qa_imed';
import consultationsWinrateReport from './consultations_winrate';
import couponEffectivenessReport from './coupon_effectiveness';
import creditExposureReport from './credit_exposure';
import customerRetentionReport from './customer_retention';
import deadStockReport from './dead_stock';
import fefoExpiryReport from './fefo_expiry';
import grossMarginReport from './gross_margin';
import lowStockAlertReport from './low_stock_alert';
import notFoundRedirectsReport from './not_found_redirects';
import officialInvoicesReport from './official_invoices';
import ordersFunnelReport from './orders_funnel';
import paymentMethodsReport from './payment_methods';
import proformaConversionReport from './proforma_conversion';
import refundsRmaReport from './refunds_rma';
import salesByBrandReport from './sales_by_brand';
import salesByCategoryReport from './sales_by_category';
import salesByGroupReport from './sales_by_group';
import salesByProvinceReport from './sales_by_province';
import salesBySkuReport from './sales_by_sku';
import salesDailyReport from './sales_daily';
import seoHealthAuditReport from './seo_health_audit';
import stockMovementsReport from './stock_movements';
import stockValuationReport from './stock_valuation';
import supportSlaReport from './support_sla';
import taxVatLedgerReport from './tax_vat_ledger';
import topClinicsReport from './top_clinics';
import type {
  ReportCatalogMeta,
  ReportDataset,
  ReportDefinition,
  ReportParams,
  ReportResult,
} from './types';

export * from './types';

export const REPORT_REGISTRY: ReportDefinition[] = [
  salesDailyReport,
  salesByCategoryReport,
  salesByBrandReport,
  salesBySkuReport,
  salesByGroupReport,
  salesByProvinceReport,
  ordersFunnelReport,
  couponEffectivenessReport,
  abandonedRecoveryReport,
  paymentMethodsReport,
  taxVatLedgerReport,
  officialInvoicesReport,
  creditExposureReport,
  refundsRmaReport,
  proformaConversionReport,
  grossMarginReport,
  stockValuationReport,
  lowStockAlertReport,
  fefoExpiryReport,
  stockMovementsReport,
  deadStockReport,
  b2bPipelineReport,
  topClinicsReport,
  customerRetentionReport,
  supportSlaReport,
  consultationsWinrateReport,
  seoHealthAuditReport,
  notFoundRedirectsReport,
  catalogQaImedReport,
];

export const REPORT_MAP: Record<string, ReportDefinition> = Object.fromEntries(
  REPORT_REGISTRY.map((rep) => [rep.id, rep])
);

export const REPORT_CATALOG: ReportCatalogMeta[] = REPORT_REGISTRY.map((rep) => ({
  id: rep.id,
  group: rep.group,
  title: rep.title,
  description: rep.description,
  available: rep.available,
  ...(rep.unavailableReason ? { unavailableReason: rep.unavailableReason } : {}),
  ...(rep.sensitiveFinancial ? { sensitiveFinancial: rep.sensitiveFinancial } : {}),
  params: rep.params,
  ...(rep.statusOptions ? { statusOptions: rep.statusOptions } : {}),
}));

export function getReportDefinition(id: string): ReportDefinition | null {
  return Object.prototype.hasOwnProperty.call(REPORT_MAP, id) ? REPORT_MAP[id] : null;
}

export type RunReportOutcome =
  | { ok: true; report: ReportResult }
  | { ok: false; status: 404; message: string };

export function runReportById(
  id: string,
  data: ReportDataset,
  params?: ReportParams
): RunReportOutcome {
  const def = getReportDefinition(id);
  if (!def) {
    return {
      ok: false,
      status: 404,
      message: `گزارش با شناسه «${id}» در فهرست استاندارد گزارش‌ها یافت نشد.`,
    };
  }
  return {
    ok: true,
    report: def.run(data, params),
  };
}
