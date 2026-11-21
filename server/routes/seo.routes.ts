import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { SEED_PAGES } from '../../src/data/expandedCatalog';
import { normalizeAssetUrl } from '../../src/lib/media';
import { normalizeCanonicalPath } from '../../src/lib/seo';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import { escapeXml, getOrigin } from '../lib/http';
import { render410HtmlResponse } from '../lib/ssrHtml';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import {
  newsletterSubscribeBodySchema,
  parseRequestBody,
  stockNotificationBodySchema,
  telemetry404BodySchema,
} from '../validation';

export const MAX_URLS_PER_SITEMAP = 10000;

const STATIC_EXT_REGEX = /\.(?:js|mjs|cjs|css|map|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot|json|xml|txt|pdf)$/i;

export function chunkSitemapItems<T>(items: T[], maxPerFile = MAX_URLS_PER_SITEMAP): T[][] {
  const limit = Math.max(1, Math.floor(maxPerFile));
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit));
  }
  return chunks;
}

function resolveAbsMediaUrl(origin: string, urlOrPath?: string): string | null {
  const norm = normalizeAssetUrl(urlOrPath, '');
  if (!norm) return null;
  if (/^https?:\/\//i.test(norm)) return norm;
  return `${origin.replace(/\/+$/, '')}${norm.startsWith('/') ? norm : `/${norm}`}`;
}

function sendXmlWithEtag(req: express.Request, res: express.Response, xml: string) {
  const hash = crypto.createHash('sha256').update(xml, 'utf8').digest('hex').slice(0, 24);
  const etag = `"${hash}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  const ifNoneMatch = req.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string') {
    const candidates = ifNoneMatch
      .split(',')
      .map((s) => s.trim().replace(/^W\//, ''));
    if (candidates.includes(etag) || candidates.includes('*')) {
      return res.status(304).end();
    }
  }
  return res.type('application/xml; charset=utf-8').send(xml);
}

function loadDefaultTemplateHtml(): string {
  const distPath = path.resolve(process.cwd(), 'dist/index.html');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    return fs.readFileSync(distPath, 'utf8');
  }
  const rootPath = path.resolve(process.cwd(), 'index.html');
  if (fs.existsSync(rootPath)) {
    return fs.readFileSync(rootPath, 'utf8');
  }
  return '<!doctype html><html lang="fa" dir="rtl"><head><title>دنتال‌مارکت</title></head><body><div id="root"></div></body></html>';
}

function normalizeTelemetryPath(rawPath: string): string | null {
  const withoutOrigin = rawPath.replace(/^https?:\/\/[^/]+/i, '').trim();
  const pathOnly = (withoutOrigin.split('?')[0] || '').split('#')[0] || '';
  if (!pathOnly || !pathOnly.startsWith('/')) return null;
  if (/[\0-\x1F\x7F]/.test(pathOnly) || pathOnly.includes('..')) return null;
  const collapsed = pathOnly.replace(/\/{2,}/g, '/');
  if (collapsed.startsWith('/api/') || collapsed.startsWith('/src/') || collapsed.startsWith('/@')) {
    return null;
  }
  return collapsed.slice(0, 240);
}

export function createRedirectsMiddleware(
  store: ServerStore,
  repos?: RepositoryBundle,
  getTemplateHtml: () => string = loadDefaultTemplateHtml
): express.RequestHandler {
  // Non-blocking debounced persistence for redirect hit counters (Claim 14)
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleHitFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      try {
        store.save();
      } catch (err) {
        console.warn('[redirects] deferred hitCount flush failed:', err);
      }
    }, 1000);
    flushTimer.unref();
  };

  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/feeds/') ||
      req.path.startsWith('/sitemap') ||
      req.path === '/robots.txt' ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@') ||
      req.path.startsWith('/node_modules/') ||
      STATIC_EXT_REGEX.test(req.path)
    ) {
      return next();
    }

    // Enforce safe local path & trailing slash normalization (301) before lookup
    const rawPath = req.path || '/';
    const safeNormalizedPath = normalizeCanonicalPath(rawPath).replace(/^\/{2,}/, '/');
    const isDuplicateSlashes = /\/{2,}/.test(rawPath);
    const hasTrailingSlash = rawPath.length > 1 && rawPath.endsWith('/');

    const snapshot = repos ? await repos.catalog.getSnapshot() : store.data.catalogState;
    const match =
      snapshot.redirects.find((r) => r.fromPath === rawPath) ??
      snapshot.redirects.find((r) => r.fromPath === safeNormalizedPath);

    if (match) {
      match.hitCount = (match.hitCount || 0) + 1;
      scheduleHitFlush();
      if (match.statusCode === 410) {
        const html = render410HtmlResponse({
          templateHtml: getTemplateHtml(),
          pathname: safeNormalizedPath,
          origin: getOrigin(req),
          catalog: snapshot,
        });
        return res.status(410).type('text/html; charset=utf-8').send(html);
      }
      const target = match.toPath && match.toPath.startsWith('/') && !match.toPath.startsWith('//') ? match.toPath : '/';
      return res.redirect(match.statusCode === 302 ? 302 : 301, target);
    }

    if (hasTrailingSlash || isDuplicateSlashes) {
      const qIdx = req.originalUrl.indexOf('?');
      const rawSearch = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
      return res.redirect(301, `${safeNormalizedPath}${rawSearch}`);
    }

    return next();
  };
}

function buildProductsSitemapXml(
  origin: string,
  products: ServerStore['data']['catalogState']['products']
): string {
  const urls = products.map((p) => {
    const imageUrls = Array.from(
      new Set([p.imageUrl, ...(p.galleryUrls || [])].map((img) => resolveAbsMediaUrl(origin, img)).filter(Boolean))
    ) as string[];

    const imageTags = imageUrls
      .map(
        (imgLoc) =>
          `\n    <image:image><image:loc>${escapeXml(imgLoc)}</image:loc><image:title>${escapeXml(
            p.titleFa
          )}</image:title></image:image>`
      )
      .join('');

    return `  <url>\n    <loc>${escapeXml(`${origin}/product/${p.slug}`)}</loc>\n    <lastmod>${escapeXml(
      p.updatedAt
    )}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.90</priority>${imageTags}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

export function createSeoRouter(store: ServerStore, repos?: RepositoryBundle): express.Router {
  const router = express.Router();
  const getCatalog = () => (repos ? repos.catalog.getSnapshot() : Promise.resolve(store.data.catalogState));

  // --- Dynamic robots.txt (§17.11) ---
  router.get('/robots.txt', (req, res) => {
    const origin = getOrigin(req);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Disallow: /account',
      'Disallow: /wishlist',
      'Disallow: /compare',
      'Disallow: /search',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
    ].join('\n');
    res.type('text/plain; charset=utf-8').send(body);
  });

  // --- Dynamic Sitemap Index & Sub-sitemaps (§17.10) ---
  router.get('/sitemap.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const activeProducts = catalog.products.filter((p) => p.status !== 'draft' && p.status !== 'archived');
    const productChunks = chunkSitemapItems(activeProducts, MAX_URLS_PER_SITEMAP);

    const subs: string[] = [
      'sitemap-pages.xml',
      'sitemap-categories.xml',
      ...(productChunks.length <= 1
        ? ['sitemap-products.xml']
        : productChunks.map((_, idx) => `sitemap-products-${idx + 1}.xml`)),
      'sitemap-brands.xml',
      'sitemap-blog.xml',
      'sitemap-agents.xml',
      'sitemap-packs.xml',
    ];

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...subs.map(
        (s) =>
          `  <sitemap><loc>${escapeXml(`${origin}/${s}`)}</loc><lastmod>${escapeXml(
            catalog.updatedAt
          )}</lastmod></sitemap>`
      ),
      '</sitemapindex>',
    ].join('\n');

    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-pages.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const pagesList = catalog.pages && catalog.pages.length > 0 ? catalog.pages : SEED_PAGES;
    const publishedPages = pagesList.filter((p) => p.status === 'published');

    const staticCore = [
      { path: '/', lastmod: catalog.updatedAt, changefreq: 'daily', priority: '1.00' },
      { path: '/brands', lastmod: catalog.updatedAt, changefreq: 'weekly', priority: '0.80' },
      { path: '/agents', lastmod: catalog.updatedAt, changefreq: 'monthly', priority: '0.75' },
      { path: '/blog', lastmod: catalog.updatedAt, changefreq: 'weekly', priority: '0.80' },
    ];

    const urls = [
      ...staticCore.map(
        (c) =>
          `  <url><loc>${escapeXml(`${origin}${c.path}`)}</loc><lastmod>${escapeXml(
            c.lastmod
          )}</lastmod><changefreq>${c.changefreq}</changefreq><priority>${c.priority}</priority></url>`
      ),
      ...publishedPages.map(
        (p) =>
          `  <url><loc>${escapeXml(`${origin}/page/${p.slug}`)}</loc><lastmod>${escapeXml(
            p.updatedAt
          )}</lastmod><changefreq>monthly</changefreq><priority>0.70</priority></url>`
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-categories.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const urls = catalog.categories
      .filter((c) => c.isActive)
      .map(
        (c) =>
          `  <url><loc>${escapeXml(`${origin}/category/${c.slug}`)}</loc><lastmod>${escapeXml(
            c.updatedAt
          )}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`
      );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-products.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const activeProducts = catalog.products.filter((p) => p.status !== 'draft' && p.status !== 'archived');
    const firstChunk = chunkSitemapItems(activeProducts, MAX_URLS_PER_SITEMAP)[0] ?? [];
    const xml = buildProductsSitemapXml(origin, firstChunk);
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-products-:page.xml', async (req, res) => {
    const pageNum = Number(req.params.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const activeProducts = catalog.products.filter((p) => p.status !== 'draft' && p.status !== 'archived');
    const chunks = chunkSitemapItems(activeProducts, MAX_URLS_PER_SITEMAP);
    const chunk = chunks[pageNum - 1];
    if (!chunk) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    const xml = buildProductsSitemapXml(origin, chunk);
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-brands.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const urls = catalog.brands
      .filter((b) => b.isActive)
      .map(
        (b) =>
          `  <url><loc>${escapeXml(`${origin}/brand/${b.slug}`)}</loc><lastmod>${escapeXml(
            b.updatedAt
          )}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`
      );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-blog.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const urls = catalog.blogPosts
      .filter((p) => p.status === 'published')
      .map((p) => {
        const imgLoc = resolveAbsMediaUrl(origin, p.imageUrl);
        const imageTag = imgLoc
          ? `\n    <image:image><image:loc>${escapeXml(imgLoc)}</image:loc><image:title>${escapeXml(
              p.titleFa
            )}</image:title></image:image>`
          : '';
        return `  <url>\n    <loc>${escapeXml(`${origin}/blog/${p.slug}`)}</loc>\n    <lastmod>${escapeXml(
          p.updatedAt
        )}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.75</priority>${imageTag}\n  </url>`;
      });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-agents.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const urls = catalog.agents
      .filter((a) => a.isActive)
      .map(
        (a) =>
          `  <url><loc>${escapeXml(`${origin}/agents/${a.provinceSlug}`)}</loc><lastmod>${escapeXml(
            a.updatedAt
          )}</lastmod><changefreq>monthly</changefreq><priority>0.70</priority></url>`
      );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  router.get('/sitemap-packs.xml', async (req, res) => {
    const origin = getOrigin(req);
    const catalog = await getCatalog();
    const urls = catalog.bundles
      .filter((b) => b.status === 'active')
      .map((b) => {
        const imgLoc = resolveAbsMediaUrl(origin, b.imageUrl);
        const imageTag = imgLoc
          ? `\n    <image:image><image:loc>${escapeXml(imgLoc)}</image:loc><image:title>${escapeXml(
              b.nameFa
            )}</image:title></image:image>`
          : '';
        return `  <url>\n    <loc>${escapeXml(`${origin}/pack/${b.slug}`)}</loc>\n    <lastmod>${escapeXml(
          b.updatedAt
        )}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.75</priority>${imageTag}\n  </url>`;
      });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return sendXmlWithEtag(req, res, xml);
  });

  // --- Server-Side 404 Telemetry Aggregation (Replaces Public Firestore Write) ---
  router.post('/api/telemetry/404', (req, res) => {
    const parsed = parseRequestBody(telemetry404BodySchema, req, res);
    if (!parsed) return;

    const normalizedPath = normalizeTelemetryPath(parsed.path);
    if (!normalizedPath) {
      return res.status(400).json({ ok: false, message: 'مسیر ثبت‌شده معتبر نیست.' });
    }

    const key = crypto.createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);
    const id = `nf_${key}`;
    const existing = store.data.notFoundLogs[id];
    const nowIso = new Date().toISOString();

    const nextLog = {
      id,
      path: normalizedPath,
      hitCount: (existing?.hitCount ?? 0) + 1,
      lastSeenAt: nowIso,
    };
    store.data.notFoundLogs[id] = nextLog;
    store.save();

    return res.json({ ok: true, log: nextLog });
  });

  router.get('/api/admin/not-found-logs', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'telemetry:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const logs = Object.values(store.data.notFoundLogs).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );
    return res.json({ ok: true, logs });
  });

  // --- Server-Side Newsletter Subscription ---
  router.post('/api/newsletter/subscribe', (req, res) => {
    const parsed = parseRequestBody(newsletterSubscribeBodySchema, req, res);
    if (!parsed) return;

    const clean = parsed.contact.trim().toLowerCase();
    const isEmail = clean.includes('@');
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return res.status(400).json({ ok: false, message: 'ایمیل نامعتبر است.' });
    }
    if (!isEmail && !/^09\d{9}$/.test(clean.replace(/[\s\-()]/g, ''))) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل یا ایمیل معتبر وارد کنید.' });
    }

    const existing = Object.values(store.data.newsletterSubscribers).find(
      (s) => s.contact.toLowerCase() === clean
    );
    if (existing) {
      return res.json({ ok: true, subscriber: existing, existing: true });
    }

    const id = `sub_${crypto.randomBytes(6).toString('hex')}`;
    const item = {
      id,
      contact: clean,
      type: (isEmail ? 'email' : 'mobile') as 'email' | 'mobile',
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    };
    store.data.newsletterSubscribers[id] = item;
    store.save();
    return res.status(201).json({ ok: true, subscriber: item });
  });

  // --- Server-Side Stock Back-In-Stock Notification ---
  router.post('/api/stock-notifications', (req, res) => {
    const parsed = parseRequestBody(stockNotificationBodySchema, req, res);
    if (!parsed) return;

    const cleanMobile = parsed.mobile.replace(/[\s\-()]/g, '');
    if (!/^09\d{9}$/.test(cleanMobile)) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }

    const id = `sn_${crypto.randomBytes(6).toString('hex')}`;
    const item = {
      id,
      productId: parsed.productId,
      ...(parsed.variantId ? { variantId: parsed.variantId } : {}),
      productTitleFa: parsed.productTitleFa,
      mobile: cleanMobile,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    store.data.stockNotifications[id] = item;
    store.save();
    return res.status(201).json({ ok: true, notification: item });
  });

  return router;
}
