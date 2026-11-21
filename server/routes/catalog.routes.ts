import express from 'express';
import { buildPriceComparisonFeed, queryCatalogProducts, type CatalogQueryParams } from '../lib/catalogQuery';
import { getOrigin } from '../lib/http';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';

export function createCatalogRouter(store: ServerStore, repos?: RepositoryBundle): express.Router {
  const router = express.Router();
  const getCatalog = () => (repos ? repos.catalog.getSnapshot() : Promise.resolve(store.data.catalogState));

  // --- Torob / Emalls Price Comparison Feed (§17.12) ---
  router.get('/feeds/price-comparison.json', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    return res.json(buildPriceComparisonFeed(catalog, origin));
  });

  // --- Server-Side Paginated Search & Filtered Catalog Query ---
  router.get('/api/catalog/products', async (req, res) => {
    const catalog = await getCatalog();
    const result = queryCatalogProducts(catalog, req.query as CatalogQueryParams);
    return res.json(result);
  });

  return router;
}
