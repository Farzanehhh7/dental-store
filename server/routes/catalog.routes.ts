import express from 'express';
import { buildPriceComparisonFeed, queryCatalogProducts, type CatalogQueryParams } from '../lib/catalogQuery';
import { getOrigin } from '../lib/http';
import type { ServerStore } from '../persistence';

export function createCatalogRouter(store: ServerStore): express.Router {
  const router = express.Router();

  // --- Torob / Emalls Price Comparison Feed (§17.12) ---
  router.get('/feeds/price-comparison.json', (req, res) => {
    const origin = getOrigin(req);
    return res.json(buildPriceComparisonFeed(store.data.catalogState, origin));
  });

  // --- Server-Side Paginated Search & Filtered Catalog Query ---
  router.get('/api/catalog/products', (req, res) => {
    const result = queryCatalogProducts(store.data.catalogState, req.query as CatalogQueryParams);
    return res.json(result);
  });

  return router;
}
