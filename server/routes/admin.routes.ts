import express from 'express';
import { z } from 'zod';
import type { Order, OrderStatus } from '../../src/types/domain';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerCatalogSnapshot, ServerStore } from '../persistence';
import type { OrderService } from '../services/orderService';
import type { PaymentService } from '../services/paymentService';
import {
  adminOrdersQuerySchema,
  adminOrderStatusBodySchema,
  manualOrderBodySchema,
  parseRequestBody,
  parseRequestQuery,
  seoSyncBodySchema,
} from '../validation';

const adminUserGroupBodySchema = z.object({
  uid: z.string().trim().min(1).max(128).optional(),
  mobile: z.string().trim().max(30).optional(),
  customerGroup: z.enum(['retail', 'dentist', 'clinic', 'lab', 'student', 'agent', 'wholesale']),
  b2bStatus: z.enum(['none', 'pending', 'approved', 'rejected', 'needs_info']).default('approved'),
  displayName: z.string().trim().max(120).optional(),
});

export function createAdminRouter(
  store: ServerStore,
  orderService: OrderService,
  paymentService: PaymentService
): express.Router {
  const router = express.Router();
  const jsonParser6mb = express.json({ limit: '6mb' });

  // --- Unified Admin Orders List (Pagination, Status, Source, Search, Jalali Date Range) ---
  router.get('/api/admin/orders', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const query = parseRequestQuery(adminOrdersQuerySchema, req, res);
    if (!query) return;

    const result = await orderService.listOrdersForAdmin({
      page: query.page,
      limit: query.limit,
      status: query.status,
      source: query.source,
      q: query.q,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });

    return res.json({
      ok: true,
      orders: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  });

  // --- Authoritative Admin Manual / Phone Order Creation ---
  router.post('/api/admin/orders/manual', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(manualOrderBodySchema, req, res);
    if (!parsed) return;

    const headerKey = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
    const idempotencyKey =
      (typeof headerKey === 'string' && headerKey.trim() ? headerKey.trim() : parsed.idempotencyKey) || undefined;

    const result = await orderService.createOrder({
      source: 'admin_manual',
      userId: adminCheck.user.uid,
      isGuest: false,
      customerName: parsed.customerName,
      customerMobile: parsed.customerMobile,
      requestedCustomerGroup: parsed.customerGroup,
      items: parsed.items,
      shippingMethod: parsed.shippingMethod,
      paymentMethod: parsed.paymentMethod as Order['paymentMethod'],
      couponCode: parsed.couponCode,
      shippingAddress: {
        province: parsed.shippingAddress.province,
        city: parsed.shippingAddress.city,
        postalCode: parsed.shippingAddress.postalCode,
        addressLine: parsed.shippingAddress.addressLine,
      },
      customerNote: parsed.customerNote,
      idempotencyKey,
      clientTotals: {
        subtotal: parsed.subtotal,
        discountTotal: parsed.discountTotal,
        shippingTotal: parsed.shippingTotal,
        taxTotal: parsed.taxTotal,
        grandTotal: parsed.grandTotal,
      },
      actorId: adminCheck.user.uid,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }

    return res.json({
      ok: true,
      ...(result.data.reused ? { reused: true } : {}),
      order: result.data.order,
    });
  });

  // --- Admin Validated State Transition for Orders ---
  router.patch('/api/admin/orders/:id/status', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminOrderStatusBodySchema, req, res);
    if (!parsed) return;

    const result = await orderService.updateOrderStatusAdmin({
      idOrNo: String(req.params.id || ''),
      nextStatus: parsed.status as OrderStatus,
      adminUid: adminCheck.user.uid,
      trackingCode: parsed.trackingCode,
      note: parsed.note,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, order: result.data });
  });

  // --- Trigger Payment Expiry Sweep On-Demand ---
  router.post('/api/admin/orders/expire', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const sweep = await paymentService.runExpirySweep();
    return res.json({ ok: true, ...sweep });
  });

  // --- Sync Approved B2B Customer Group onto Authoritative Server Store ---
  router.post('/api/admin/users/group', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(adminUserGroupBodySchema, req, res);
    if (!parsed) return;

    if (!parsed.uid && !parsed.mobile) {
      return res.status(400).json({ ok: false, message: 'شناسه کاربر (uid) یا شماره موبایل الزامی است.' });
    }

    const key = parsed.uid ? `uid:${parsed.uid}` : `mobile:${parsed.mobile}`;
    await orderService.catalogRepo.setUserGroup({
      key,
      uid: parsed.uid,
      mobile: parsed.mobile,
      customerGroup: parsed.customerGroup,
      b2bStatus: parsed.b2bStatus,
      displayName: parsed.displayName,
      updatedAt: new Date().toISOString(),
    });
    return res.json({ ok: true });
  });

  // --- Authenticated Admin Catalog / SEO / Pricing Sync Hook ---
  router.post('/api/seo/sync', jsonParser6mb, async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const body = parseRequestBody(seoSyncBodySchema, req, res);
    if (!body) return;

    const { categories, brands, products, campaigns, bundles, agents, blogPosts, redirects, coupons, contractPrices, settings } =
      body;

    if (Array.isArray(categories) && categories.length > 0) {
      store.data.catalogState.categories = categories as unknown as ServerCatalogSnapshot['categories'];
    }
    if (Array.isArray(brands) && brands.length > 0) {
      store.data.catalogState.brands = brands as unknown as ServerCatalogSnapshot['brands'];
    }
    if (Array.isArray(products) && products.length > 0) {
      store.data.catalogState.products = products as unknown as ServerCatalogSnapshot['products'];
    }
    if (Array.isArray(campaigns)) {
      store.data.catalogState.campaigns = campaigns as unknown as ServerCatalogSnapshot['campaigns'];
    }
    if (Array.isArray(bundles)) {
      store.data.catalogState.bundles = bundles as unknown as ServerCatalogSnapshot['bundles'];
    }
    if (Array.isArray(agents)) {
      store.data.catalogState.agents = agents as unknown as ServerCatalogSnapshot['agents'];
    }
    if (Array.isArray(blogPosts)) {
      store.data.catalogState.blogPosts = blogPosts as unknown as ServerCatalogSnapshot['blogPosts'];
    }
    if (Array.isArray(redirects)) {
      store.data.catalogState.redirects = redirects as unknown as ServerCatalogSnapshot['redirects'];
    }
    if (Array.isArray(coupons)) {
      store.data.catalogState.coupons = coupons as unknown as ServerCatalogSnapshot['coupons'];
    }
    if (Array.isArray(contractPrices)) {
      store.data.catalogState.contractPrices = contractPrices as unknown as ServerCatalogSnapshot['contractPrices'];
    }
    if (settings && typeof settings === 'object' && typeof settings.id === 'string' && settings.id) {
      store.data.catalogState.settings = settings as unknown as ServerCatalogSnapshot['settings'];
    }

    store.data.catalogState.updatedAt = new Date().toISOString();
    store.save();

    return res.json({
      ok: true,
      syncedBy: adminCheck.user.uid,
      role: adminCheck.role,
      products: store.data.catalogState.products.length,
      redirects: store.data.catalogState.redirects.length,
    });
  });

  return router;
}
