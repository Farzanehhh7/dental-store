import express from 'express';
import {
  SEED_INVOICES,
  SEED_PRODUCT_COSTS,
} from '../../src/data/expandedCatalog';
import {
  SEED_B2B_VERIFICATIONS,
  SEED_CONSULTATIONS,
  SEED_PAYMENT_PLANS,
  SEED_QUESTIONS,
  SEED_REVIEWS,
  SEED_TICKETS,
} from '../../src/data/seed';
import { buildCsvContent } from '../../src/lib/csv';
import {
  REPORT_CATALOG,
  getReportDefinition,
  runReportById,
  type ReportDataset,
} from '../../src/pages/admin/reports';
import type { UserProfile } from '../../src/types/domain';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import { hasAdminPermission } from '../lib/rbac';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import { adminReportQuerySchema, parseRequestQuery } from '../validation';

async function loadAllOrders(repos: RepositoryBundle) {
  const first = await repos.orders.list({ page: 1, limit: 100 });
  const all = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await repos.orders.list({ page, limit: 100 });
    all.push(...next.items);
  }
  return all;
}

async function buildServerReportDataset(store: ServerStore, repos: RepositoryBundle): Promise<ReportDataset> {
  const [
    orders,
    proformas,
    returns,
    paymentLedger,
    catalog,
    warehouses,
    stockLevels,
    stockBatches,
    stockMovements,
  ] = await Promise.all([
    loadAllOrders(repos),
    repos.proformas.listAll(),
    repos.returns.list(),
    repos.payments.listLedger(),
    repos.catalog.getSnapshot(),
    repos.stock.listWarehouses(),
    repos.stock.listStockLevels(),
    repos.stock.listBatches(),
    repos.stock.listMovements(5000),
  ]);

  const usersList: UserProfile[] = Object.values(store.data.userGroups).map((ug) => ({
    uid: ug.uid ?? ug.key,
    displayName: ug.displayName || ug.mobile || ug.key,
    mobile: ug.mobile,
    customerGroup: ug.customerGroup,
    accountType: ug.customerGroup === 'clinic' ? 'clinic' : ug.customerGroup === 'lab' ? 'lab' : 'individual',
    b2bStatus: ug.b2bStatus,
    createdAt: ug.updatedAt,
    updatedAt: ug.updatedAt,
  }));

  return {
    orders,
    invoices: SEED_INVOICES,
    proformas,
    returns,
    paymentPlans: SEED_PAYMENT_PLANS,
    paymentLedger,
    rfqs: Object.values(store.data.rfqs),
    products: catalog.products,
    productCosts: SEED_PRODUCT_COSTS,
    categories: catalog.categories,
    brands: catalog.brands,
    campaigns: catalog.campaigns,
    coupons: catalog.coupons,
    warehouses,
    stockLevels,
    stockBatches,
    stockMovements,
    b2bVerifications: SEED_B2B_VERIFICATIONS,
    tickets: SEED_TICKETS,
    consultationRequests: SEED_CONSULTATIONS,
    usersList,
    blogPosts: catalog.blogPosts,
    redirects: catalog.redirects,
    notFoundLogs: Object.values(store.data.notFoundLogs),
    reviews: SEED_REVIEWS,
    questions: SEED_QUESTIONS,
    settings: catalog.settings,
  };
}

export function createReportsRouter(store: ServerStore, repos: RepositoryBundle): express.Router {
  const router = express.Router();

  router.get('/api/admin/reports', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'reports:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const canFinancial = hasAdminPermission(adminCheck.role, 'reports:read_financial');
    return res.json({
      ok: true,
      reports: REPORT_CATALOG.map((rep) => ({
        ...rep,
        permitted: !rep.sensitiveFinancial || canFinancial,
      })),
    });
  });

  router.get('/api/admin/reports/:id', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'reports:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const reportId = String(req.params.id || '').trim();
    const def = getReportDefinition(reportId);
    if (!def) {
      return res.status(404).json({
        ok: false,
        message: `گزارش با شناسه «${reportId}» یافت نشد.`,
      });
    }

    if (def.sensitiveFinancial && !hasAdminPermission(adminCheck.role, 'reports:read_financial')) {
      return res.status(403).json({
        ok: false,
        message: 'مشاهده گزارش بهای تمام‌شده و حاشیه سود محرمانه فقط برای مدیر یا حسابدار مجاز است.',
      });
    }

    const query = parseRequestQuery(adminReportQuerySchema, req, res);
    if (!query) return;

    const dataset = await buildServerReportDataset(store, repos);
    const runParams =
      query.format === 'csv'
        ? { ...query, page: 1, limit: 5000 }
        : {
            from: query.from,
            to: query.to,
            status: query.status,
            brandId: query.brandId,
            categoryId: query.categoryId,
            warehouseId: query.warehouseId,
            q: query.q,
            page: query.page,
            limit: query.limit,
          };

    const outcome = runReportById(reportId, dataset, runParams);
    if (!outcome.ok) {
      return res.status(outcome.status).json({ ok: false, message: outcome.message });
    }

    if (query.format === 'csv') {
      const headers = outcome.report.columns.map((c) => c.label);
      const keys = outcome.report.columns.map((c) => c.key);
      const matrix = outcome.report.rows.map((r) => keys.map((k) => r[k] ?? ''));
      const csv = buildCsvContent(headers, matrix);
      const safeFileId = reportId.replace(/[^a-z0-9_-]/gi, '');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dentalmarket-${safeFileId}.csv"`);
      return res.status(200).send(csv);
    }

    return res.json({
      ok: true,
      report: outcome.report,
    });
  });

  return router;
}
