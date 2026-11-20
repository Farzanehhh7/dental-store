import express from 'express';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerCatalogSnapshot, ServerStore } from '../persistence';
import { parseRequestBody, seoSyncBodySchema } from '../validation';

export function createAdminRouter(store: ServerStore): express.Router {
  const router = express.Router();
  const jsonParser6mb = express.json({ limit: '6mb' });

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
