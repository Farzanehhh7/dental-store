import express from 'express';
import { escapeXml, getOrigin } from '../lib/http';
import type { ServerStore } from '../persistence';

export function createRedirectsMiddleware(store: ServerStore): express.RequestHandler {
  return (req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/feeds/') ||
      req.path.startsWith('/sitemap') ||
      req.path === '/robots.txt' ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@')
    ) {
      return next();
    }
    const match = store.data.catalogState.redirects.find((r) => r.fromPath === req.path);
    if (match) {
      match.hitCount = (match.hitCount || 0) + 1;
      store.save();
      if (match.statusCode === 410) {
        return res.status(410).send('410 Gone - این صفحه برای همیشه حذف شده است.');
      }
      return res.redirect(match.statusCode === 302 ? 302 : 301, match.toPath || '/');
    }
    return next();
  };
}

export function createSeoRouter(store: ServerStore): express.Router {
  const router = express.Router();

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
  router.get('/sitemap.xml', (req, res) => {
    const origin = getOrigin(req);
    const subs = [
      'sitemap-categories.xml',
      'sitemap-products.xml',
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
            store.data.catalogState.updatedAt
          )}</lastmod></sitemap>`
      ),
      '</sitemapindex>',
    ].join('\n');
    res.type('application/xml; charset=utf-8').send(xml);
  });

  router.get('/sitemap-categories.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.categories
      .filter((c) => c.isActive)
      .map(
        (c) =>
          `  <url><loc>${escapeXml(`${origin}/category/${c.slug}`)}</loc><lastmod>${escapeXml(
            c.updatedAt
          )}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  router.get('/sitemap-products.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.products
      .filter((p) => p.status !== 'draft' && p.status !== 'archived')
      .map(
        (p) =>
          `  <url><loc>${escapeXml(`${origin}/product/${p.slug}`)}</loc><lastmod>${escapeXml(
            p.updatedAt
          )}</lastmod><changefreq>daily</changefreq><priority>0.90</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  router.get('/sitemap-brands.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.brands
      .filter((b) => b.isActive)
      .map(
        (b) =>
          `  <url><loc>${escapeXml(`${origin}/brand/${b.slug}`)}</loc><lastmod>${escapeXml(
            b.updatedAt
          )}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  router.get('/sitemap-blog.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.blogPosts
      .filter((p) => p.status === 'published')
      .map(
        (p) =>
          `  <url><loc>${escapeXml(`${origin}/blog/${p.slug}`)}</loc><lastmod>${escapeXml(
            p.updatedAt
          )}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  router.get('/sitemap-agents.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.agents
      .filter((a) => a.isActive)
      .map(
        (a) =>
          `  <url><loc>${escapeXml(`${origin}/agents/${a.provinceSlug}`)}</loc><lastmod>${escapeXml(
            a.updatedAt
          )}</lastmod><changefreq>monthly</changefreq><priority>0.70</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  router.get('/sitemap-packs.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = store.data.catalogState.bundles
      .filter((b) => b.status === 'active')
      .map(
        (b) =>
          `  <url><loc>${escapeXml(`${origin}/pack/${b.slug}`)}</loc><lastmod>${escapeXml(
            b.updatedAt
          )}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`
      );
    res
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  return router;
}
