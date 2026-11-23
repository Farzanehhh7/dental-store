import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../server';
import { chunkSitemapItems } from '../server/routes/seo.routes';
import { buildResponsiveImageProps, normalizeAssetUrl } from '../src/lib/media';
import { normalizeCanonicalPath } from '../src/lib/seo';

describe('Phase 7 — Real SPA SEO, SSR Metadata, Sitemaps & Asset Delivery', () => {
  let tmpDir: string;
  let stopExpiryJob: () => void;
  let app: Awaited<ReturnType<typeof createServerApp>>['app'];
  let store: Awaited<ReturnType<typeof createServerApp>>['store'];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase7-seo-'));
    const server = await createServerApp({ dataDir: tmpDir, attachVite: false });
    app = server.app;
    store = server.store;
    stopExpiryJob = server.stopExpiryJob;
  });

  afterAll(() => {
    stopExpiryJob();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('1. Server-Side Head Injection & Crawlable HTML Body', () => {
    it('renders home page (/) with Organization + WebSite SearchAction JSON-LD, hreflang, OG/Twitter, and crawlable root HTML', async () => {
      const res = await request(app).get('/').set('Host', 'dentalmarket.example');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');

      const html = res.text;
      expect(html).toContain('<link rel="canonical" href="http://dentalmarket.example/" />');
      expect(html).toContain('<link rel="alternate" hreflang="fa-IR" href="http://dentalmarket.example/" />');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="http://dentalmarket.example/" />');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
      expect(html).toContain('<meta property="og:type" content="website" />');
      expect(html).toContain('"@type":"Organization"');
      expect(html).toContain('"@type":"WebSite"');
      expect(html).toContain('"@type":"SearchAction"');
      expect(html).toContain('<div id="root"><main data-ssr="true"');
      expect(html).toContain('<h1>');
      expect(html).toContain('/category/');
      expect(html).toContain('/product/');
    });

    it('renders product page with Product + BreadcrumbList JSON-LD, price, stock status, and breadcrumbs inside #root', async () => {
      const product = store.data.catalogState.products.find((p) => p.status === 'active')!;
      expect(product).toBeTruthy();

      const res = await request(app).get(`/product/${product.slug}`).set('Host', 'dentalmarket.example');
      expect(res.status).toBe(200);
      const html = res.text;

      expect(html).toContain(`<link rel="canonical" href="http://dentalmarket.example/product/${product.slug}" />`);
      expect(html).toContain('<meta property="og:type" content="product" />');
      expect(html).toContain('"@type":"Product"');
      expect(html).toContain('"offers":{');
      expect(html).toContain('"availability":"https://schema.org/');
      expect(html).toContain('"brand":{"@type":"Brand"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain(`"sku":"${product.sku}"`);
      expect(html).toContain('aria-label="breadcrumb"');
      expect(html).toContain(`<h1>${product.titleFa}</h1>`);
      expect(html).toContain(product.sku);
      expect(html).toContain('/assets/');

      const utmProductRes = await request(app)
        .get(`/product/${product.slug}?utm_source=instagram&fbclid=abc`)
        .set('Host', 'dentalmarket.example');
      expect(utmProductRes.status).toBe(200);
      expect(utmProductRes.text).toContain(
        `<link rel="canonical" href="http://dentalmarket.example/product/${product.slug}" />`
      );
      expect(utmProductRes.text).not.toContain('utm_source=instagram');
    });

    it('renders category page and enforces noindex, follow when filter query params are applied', async () => {
      const cat = store.data.catalogState.categories.find((c) => c.isActive)!;
      const canonicalRes = await request(app).get(`/category/${cat.slug}`);
      expect(canonicalRes.status).toBe(200);
      expect(canonicalRes.text).toContain('<meta name="robots" content="index, follow" />');
      expect(canonicalRes.text).toContain('"@type":"CollectionPage"');

      const filteredRes = await request(app).get(`/category/${cat.slug}?inStock=1&utm_source=google`);
      expect(filteredRes.status).toBe(200);
      expect(filteredRes.text).toContain('<meta name="robots" content="noindex, follow" />');
      expect(filteredRes.text).not.toContain('utm_source=google');
    });

    it('renders brand detail, blog post (Article JSON-LD), and CMS pages (/page/:slug)', async () => {
      const brand = store.data.catalogState.brands.find((b) => b.isActive)!;
      const brandRes = await request(app).get(`/brand/${brand.slug}`);
      expect(brandRes.status).toBe(200);
      expect(brandRes.text).toContain('"@type":"Brand"');

      const post = store.data.catalogState.blogPosts.find((p) => p.status === 'published')!;
      const blogRes = await request(app).get(`/blog/${post.slug}`);
      expect(blogRes.status).toBe(200);
      expect(blogRes.text).toContain('<meta property="og:type" content="article" />');
      expect(blogRes.text).toContain('"@type":"Article"');

      const pageRes = await request(app).get('/page/about');
      expect(pageRes.status).toBe(200);
      expect(pageRes.text).toContain('"@type":"AboutPage"');
      expect(pageRes.text).toContain('"@type":"BreadcrumbList"');
      expect(pageRes.text).toContain('<h1>درباره دنتال‌مارکت</h1>');
    });

    it('escapes XSS payloads in SSR titles, HTML body, and JSON-LD scripts', async () => {
      const target = store.data.catalogState.products[0];
      const origTitle = target.titleFa;
      target.titleFa = 'کامپوزیت <script>alert(1)</script> "تست"';
      try {
        const res = await request(app).get(`/product/${target.slug}`);
        expect(res.status).toBe(200);
        expect(res.text).not.toContain('<script>alert(1)</script>');
        expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(res.text).toContain('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e');
      } finally {
        target.titleFa = origTitle;
      }
    });
  });

  describe('2. HTTP Status Codes, Trailing Slashes, Canonical Normalization & Redirects', () => {
    it('returns HTTP 404 with noindex for unknown routes and nonexistent product slugs', async () => {
      const unknownRes = await request(app).get('/totally-nonexistent-seo-route');
      expect(unknownRes.status).toBe(404);
      expect(unknownRes.text).toContain('<meta name="robots" content="noindex, follow" />');
      expect(unknownRes.text).toContain('صفحه مورد نظر یافت نشد');

      const missingProd = await request(app).get('/product/missing-dental-sku-999');
      expect(missingProd.status).toBe(404);
      expect(missingProd.text).toContain('محصول مورد نظر یافت نشد');
    });

    it('normalizes trailing slashes via 301 preserving query strings and guards against open redirects', async () => {
      const trailRes = await request(app).get('/brands/?page=2');
      expect(trailRes.status).toBe(301);
      expect(trailRes.headers.location).toBe('/brands?page=2');

      const multiSlashRes = await request(app).get('//evil.com');
      expect(multiSlashRes.status).toBe(301);
      expect(multiSlashRes.headers.location).toBe('/evil.com');

      expect(normalizeCanonicalPath('/product/composite-a2/?utm_source=ig&fbclid=123&page=1')).toBe(
        '/product/composite-a2'
      );
    });

    it('serves 301 redirects without synchronous store.save() and renders 410 Gone HTML', async () => {
      store.data.catalogState.redirects.push(
        {
          id: 'red_p7_301',
          fromPath: '/legacy-phase7-301',
          toPath: '/brands',
          statusCode: 301,
          hitCount: 0,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'red_p7_410',
          fromPath: '/legacy-phase7-410',
          toPath: '',
          statusCode: 410,
          hitCount: 0,
          createdAt: new Date().toISOString(),
        }
      );

      const saveSpy = vi.spyOn(store, 'save');
      const r301 = await request(app).get('/legacy-phase7-301');
      expect(r301.status).toBe(301);
      expect(r301.headers.location).toBe('/brands');
      expect(saveSpy).not.toHaveBeenCalled();
      saveSpy.mockRestore();

      const r410 = await request(app).get('/legacy-phase7-410');
      expect(r410.status).toBe(410);
      expect(r410.text).toContain('410 Gone');
      expect(r410.text).toContain('<meta name="robots" content="noindex, nofollow" />');
    });
  });

  describe('3. Sitemaps (Pages, Image Sitemaps, 10k Splitting & ETag/304)', () => {
    it('serves sitemap.xml including sitemap-pages.xml and image entries in sitemap-products.xml with ETag 304 caching', async () => {
      const idxRes = await request(app).get('/sitemap.xml').set('Host', 'dentalmarket.example');
      expect(idxRes.status).toBe(200);
      expect(idxRes.headers['content-type']).toContain('xml');
      expect(idxRes.headers.etag).toBeTruthy();
      expect(idxRes.headers['cache-control']).toContain('max-age=300');
      expect(idxRes.text).toContain('http://dentalmarket.example/sitemap-pages.xml');
      expect(idxRes.text).toContain('http://dentalmarket.example/sitemap-products.xml');
      expect(idxRes.text).toContain('<lastmod>');

      // Conditional ETag -> 304 Not Modified
      const notModRes = await request(app)
        .get('/sitemap.xml')
        .set('Host', 'dentalmarket.example')
        .set('If-None-Match', idxRes.headers.etag);
      expect(notModRes.status).toBe(304);

      // Pages sitemap includes static landings and published CMS pages
      const pagesRes = await request(app).get('/sitemap-pages.xml').set('Host', 'dentalmarket.example');
      expect(pagesRes.status).toBe(200);
      expect(pagesRes.text).toContain('<loc>http://dentalmarket.example/</loc>');
      expect(pagesRes.text).toContain('<loc>http://dentalmarket.example/page/about</loc>');

      // Products sitemap contains image namespace and <image:loc> + <image:title>
      const prodRes = await request(app).get('/sitemap-products.xml').set('Host', 'dentalmarket.example');
      expect(prodRes.status).toBe(200);
      expect(prodRes.text).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
      expect(prodRes.text).toContain('<image:image><image:loc>');
      expect(prodRes.text).toContain('<image:title>');
    });

    it('splits > 10,000 URLs across paginated product sitemaps cleanly', async () => {
      const dummyChunks = chunkSitemapItems(Array.from({ length: 10005 }, (_, i) => i), 10000);
      expect(dummyChunks).toHaveLength(2);
      expect(dummyChunks[0]).toHaveLength(10000);
      expect(dummyChunks[1]).toHaveLength(5);

      const originalProducts = store.data.catalogState.products;
      const template = originalProducts[0];
      store.data.catalogState.products = Array.from({ length: 10002 }, (_, idx) => ({
        ...template,
        id: `bulk_${idx}`,
        slug: `bulk-product-${idx}`,
        status: 'active' as const,
      }));

      try {
        const idxRes = await request(app).get('/sitemap.xml');
        expect(idxRes.status).toBe(200);
        expect(idxRes.text).toContain('sitemap-products-1.xml');
        expect(idxRes.text).toContain('sitemap-products-2.xml');
        expect(idxRes.text).not.toContain('sitemap-products-3.xml');

        const page1Res = await request(app).get('/sitemap-products-1.xml');
        expect(page1Res.status).toBe(200);
        expect((page1Res.text.match(/<url>/g) || []).length).toBe(10000);

        const page2Res = await request(app).get('/sitemap-products-2.xml');
        expect(page2Res.status).toBe(200);
        expect((page2Res.text.match(/<url>/g) || []).length).toBe(2);

        const page3Res = await request(app).get('/sitemap-products-3.xml');
        expect(page3Res.status).toBe(404);
      } finally {
        store.data.catalogState.products = originalProducts;
      }
    });
  });

  describe('4. Portable Static Assets & Core Web Vitals Media Helpers', () => {
    it('serves all migrated /assets/images/* assets from public/ and normalizes legacy /src/assets/images/ URLs', async () => {
      const expectedFiles = [
        'hero_dental_clinic_1794921818923.jpg',
        'product_composite_kit_1794921818527.jpg',
        'product_dental_unit_equip_1794921819515.jpg',
        'product_nitrile_gloves_1794921818815.jpg',
        'product_rotary_endo_1794921819567.jpg',
      ];
      for (const fileName of expectedFiles) {
        expect(fs.existsSync(path.resolve(process.cwd(), 'public/assets/images', fileName))).toBe(true);
        const res = await request(app).get(`/assets/images/${fileName}`);
        expect(res.status).toBe(200);
      }

      expect(normalizeAssetUrl('/src/assets/images/hero_dental_clinic_1794921818923.jpg')).toBe(
        '/assets/images/hero_dental_clinic_1794921818923.jpg'
      );

      const lazyProps = buildResponsiveImageProps('/assets/images/product_composite_kit_1794921818527.jpg', {
        widths: [400, 800],
        sizes: '50vw',
      });
      expect(lazyProps.loading).toBe('lazy');
      expect(lazyProps.decoding).toBe('async');
      expect(lazyProps.srcSet).toContain('400w');
      expect(lazyProps.srcSet).toContain('800w');
      expect(lazyProps.sizes).toBe('50vw');

      const lcpProps = buildResponsiveImageProps('/assets/images/hero_dental_clinic_1794921818923.jpg', {
        eager: true,
      });
      expect(lcpProps.loading).toBe('eager');
      expect(lcpProps.fetchPriority).toBe('high');
    });
  });
});
