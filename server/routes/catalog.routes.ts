import crypto from 'node:crypto';
import express from 'express';
import { validateServerEnv } from '../config/env';
import { buildPriceComparisonFeed, queryCatalogProducts, type CatalogQueryParams } from '../lib/catalogQuery';
import { getOrigin } from '../lib/http';
import { LruCache } from '../lib/lruCache';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';

interface CachedCatalogResponse {
  body: string;
  etag: string;
}

function normalizeQueryKey(query: Record<string, unknown>, versionToken: string): string {
  const sortedEntries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`);
  return `${versionToken}::${sortedEntries.join('&')}`;
}

export function createCatalogRouter(store: ServerStore, repos?: RepositoryBundle): express.Router {
  const router = express.Router();
  const env = validateServerEnv(process.env);
  const getCatalog = () => (repos ? repos.catalog.getSnapshot() : Promise.resolve(store.data.catalogState));

  const catalogCache = new LruCache<CachedCatalogResponse>({
    maxEntries: env.CATALOG_CACHE_MAX_ENTRIES,
    ttlMs: env.CATALOG_CACHE_TTL_MS,
  });
  repos?.onCatalogChange(() => {
    catalogCache.clear();
  });

  // --- Torob / Emalls Price Comparison Feed (§17.12) ---
  router.get('/feeds/price-comparison.json', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    return res.json(buildPriceComparisonFeed(catalog, origin));
  });

  // --- Server-Side Paginated Search & Filtered Catalog Query (LRU + ETag/304) ---
  router.get('/api/catalog/products', async (req, res) => {
    const catalog = await getCatalog();
    const versionToken = `${repos?.getCatalogVersion() ?? 0}:${catalog.updatedAt}:${catalog.products.length}`;
    const cacheKey = normalizeQueryKey(req.query as Record<string, unknown>, versionToken);

    let cached = catalogCache.get(cacheKey);
    if (!cached) {
      const result = queryCatalogProducts(catalog, req.query as CatalogQueryParams);
      const body = JSON.stringify(result);
      const hash = crypto.createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 24);
      cached = { body, etag: `"${hash}"` };
      catalogCache.set(cacheKey, cached);
    }

    res.setHeader('ETag', cached.etag);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string') {
      const candidates = ifNoneMatch
        .split(',')
        .map((s) => s.trim().replace(/^W\//, ''));
      if (candidates.includes(cached.etag) || candidates.includes('*')) {
        return res.status(304).end();
      }
    }

    return res.type('application/json; charset=utf-8').send(cached.body);
  });

  return router;
}
