import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePersian, scoreSearchMatch } from './src/lib/persian-search';
import { getProductPriceSummary, resolveVariantPrice } from './src/lib/pricing';
import {
  CustomerGroupCode,
  Order,
  ProformaInvoice,
  RfqRequest,
} from './src/types/domain';
import {
  createMobileSession,
  generateOtpCode,
  getSmsModeConfig,
  hashToken,
  normalizeMobile,
  resolveMobileSession,
  timingSafeHashEquals,
  verifyFirebaseAdmin,
  verifyFirebaseUser,
} from './server/auth';
import { handlePaymentInitiate, handlePaymentVerify } from './server/payments';
import { createServerStore } from './server/persistence';
import { calculateAuthoritativeCheckout } from './server/pricing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 3000);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getOrigin(req: express.Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || `localhost:${DEFAULT_PORT}`;
  return `${proto}://${host}`;
}

export interface CreateServerAppOptions {
  dataDir?: string;
  attachVite?: boolean;
}

export async function createServerApp(options: CreateServerAppOptions = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const attachVite = options.attachVite ?? true;
  const store = createServerStore(options.dataDir);
  const app = express();

  app.use(express.json({ limit: '4mb' }));

  // --- Redirect Rules Middleware (§17.7) ---
  app.use((req, res, next) => {
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
  });

  // --- Dynamic robots.txt (§17.11) ---
  app.get('/robots.txt', (req, res) => {
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
  app.get('/sitemap.xml', (req, res) => {
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

  app.get('/sitemap-categories.xml', (req, res) => {
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

  app.get('/sitemap-products.xml', (req, res) => {
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

  app.get('/sitemap-brands.xml', (req, res) => {
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

  app.get('/sitemap-blog.xml', (req, res) => {
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

  app.get('/sitemap-agents.xml', (req, res) => {
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

  app.get('/sitemap-packs.xml', (req, res) => {
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

  // --- Torob / Emalls Price Comparison Feed (§17.12) ---
  app.get('/feeds/price-comparison.json', (req, res) => {
    const origin = getOrigin(req);
    const catalog = store.data.catalogState;
    const items = catalog.products
      .filter((p) => p.status === 'active' && p.pricingMode !== 'call_for_price')
      .flatMap((p) =>
        p.variants
          .filter((v) => v.isActive && v.basePrice !== null && v.basePrice > 0)
          .map((v) => {
            const resolved = resolveVariantPrice(p, v, {
              campaigns: catalog.campaigns,
              settings: catalog.settings,
            });
            if (resolved.state !== 'fixed' || !resolved.unitPrice) return null;
            return {
              product_id: p.id,
              variant_id: v.id,
              title: `${p.titleFa} - ${v.labelFa}`,
              subtitle: p.titleEn,
              page_url: `${origin}/product/${p.slug}`,
              image_url: p.imageUrl.startsWith('http') ? p.imageUrl : `${origin}${p.imageUrl}`,
              price_toman: resolved.unitPrice,
              old_price_toman: resolved.originalPrice ?? resolved.unitPrice,
              availability: resolved.availableStock > 0 ? 'instock' : 'outofstock',
              sku: v.sku,
              imed_code: p.imedCode || '',
              guarantee: p.warrantyMonths ? `${p.warrantyMonths} ماه گارانتی` : 'ضمانت اصالت کالا',
            };
          })
      )
      .filter(Boolean);

    res.json({
      generated_at: new Date().toISOString(),
      currency: 'IRT',
      count: items.length,
      products: items,
    });
  });

  // --- Server-Side Paginated Search & Filtered Catalog Query ---
  app.get('/api/catalog/products', (req, res) => {
    const catalog = store.data.catalogState;
    const q = String(req.query.q || '').trim();
    const categorySlug = String(req.query.category || '').trim();
    const brandIdOrSlug = String(req.query.brand || '').trim();
    const vertical = String(req.query.vertical || '').trim();
    const kind = String(req.query.kind || '').trim();
    const onlyInStock = req.query.inStock === '1' || req.query.inStock === 'true';
    const onlyDiscount = req.query.discount === '1' || req.query.discount === 'true';
    const sort = String(req.query.sort || (q ? 'relevance' : 'best_selling')).trim();
    const customerGroup = (String(req.query.group || 'retail') as CustomerGroupCode) || 'retail';
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit || 24) || 24));

    let allowedCategoryIds: Set<string> | null = null;
    if (categorySlug) {
      const cat = catalog.categories.find((c) => c.slug === categorySlug || c.id === categorySlug);
      if (!cat) {
        return res.json({ ok: true, items: [], total: 0, page, totalPages: 1 });
      }
      const descendants = catalog.categories
        .filter((c) => c.parentId === cat.id || c.path.includes(cat.slug))
        .map((c) => c.id);
      allowedCategoryIds = new Set([cat.id, ...descendants]);
    }

    let resolvedBrandId = '';
    if (brandIdOrSlug) {
      const br = catalog.brands.find((b) => b.id === brandIdOrSlug || b.slug === brandIdOrSlug);
      resolvedBrandId = br?.id || brandIdOrSlug;
    }

    const scored = catalog.products
      .filter((p) => p.status !== 'draft' && p.status !== 'archived')
      .map((p) => {
        if (vertical && p.vertical !== vertical) return null;
        if (kind && p.kind !== kind) return null;
        if (allowedCategoryIds && !allowedCategoryIds.has(p.primaryCategoryId) && !p.categoryIds.some((cid) => allowedCategoryIds!.has(cid))) {
          return null;
        }
        if (resolvedBrandId && p.brandId !== resolvedBrandId) return null;

        const summary = getProductPriceSummary(p, {
          customerGroup,
          campaigns: catalog.campaigns,
          settings: catalog.settings,
          contractPrices: catalog.contractPrices,
        });
        if (onlyInStock && !summary.inStock) return null;
        if (onlyDiscount && summary.discountPercent <= 0) return null;

        let score = 1;
        if (q) {
          const brandName = catalog.brands.find((b) => b.id === p.brandId)?.nameFa ?? '';
          score = scoreSearchMatch(q, {
            exactCodes: [p.sku, p.imedCode ?? '', p.gtin ?? '', ...p.variants.map((v) => v.sku)],
            textFields: [p.titleFa, p.titleEn, brandName, ...p.tags, normalizePersian(p.shortDescriptionFa)],
          });
          if (score <= 0) return null;
        }

        return { product: p, score, summary };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    scored.sort((a, b) => {
      if (sort === 'relevance' && q && b.score !== a.score) return b.score - a.score;
      if (sort === 'newest') return new Date(b.product.publishedAt).getTime() - new Date(a.product.publishedAt).getTime();
      if (sort === 'price_asc') return (a.summary.minPrice ?? Number.MAX_SAFE_INTEGER) - (b.summary.minPrice ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'price_desc') return (b.summary.minPrice ?? 0) - (a.summary.minPrice ?? 0);
      if (sort === 'discount') return b.summary.discountPercent - a.summary.discountPercent;
      return b.product.soldCount - a.product.soldCount;
    });

    const total = scored.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paged = scored.slice(offset, offset + limit).map((x) => x.product);

    return res.json({
      ok: true,
      items: paged,
      total,
      page,
      limit,
      totalPages,
    });
  });

  // --- Authenticated Admin Catalog / SEO / Pricing Sync Hook ---
  app.post('/api/seo/sync', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const { categories, brands, products, campaigns, bundles, agents, blogPosts, redirects, coupons, contractPrices, settings } =
      req.body || {};

    if (Array.isArray(categories) && categories.length > 0) store.data.catalogState.categories = categories;
    if (Array.isArray(brands) && brands.length > 0) store.data.catalogState.brands = brands;
    if (Array.isArray(products) && products.length > 0) store.data.catalogState.products = products;
    if (Array.isArray(campaigns)) store.data.catalogState.campaigns = campaigns;
    if (Array.isArray(bundles)) store.data.catalogState.bundles = bundles;
    if (Array.isArray(agents)) store.data.catalogState.agents = agents;
    if (Array.isArray(blogPosts)) store.data.catalogState.blogPosts = blogPosts;
    if (Array.isArray(redirects)) store.data.catalogState.redirects = redirects;
    if (Array.isArray(coupons)) store.data.catalogState.coupons = coupons;
    if (Array.isArray(contractPrices)) store.data.catalogState.contractPrices = contractPrices;
    if (settings && typeof settings === 'object' && settings.id) store.data.catalogState.settings = settings;

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

  // --- Honest Regulatory / Technical Certificate Lookup & Download ---
  app.get('/api/files/certificate', (req, res) => {
    const productIdParam = String(req.query.productId || '').trim();
    const skuParam = String(req.query.sku || '').trim();
    const fileIdParam = String(req.query.fileId || '').trim();
    const catalog = store.data.catalogState;

    const product = catalog.products.find(
      (p) =>
        (productIdParam && p.id === productIdParam) ||
        (skuParam && (p.sku === skuParam || p.variants.some((v) => v.sku === skuParam)))
    );

    if (!product) {
      return res.status(404).json({ ok: false, message: 'محصول یا مدرک فنی درخواستی یافت نشد.' });
    }

    const fileRecord =
      product.files?.find((f) => (fileIdParam ? f.id === fileIdParam : true)) || product.files?.[0];

    if (fileRecord?.isVerified && fileRecord.fileUrl) {
      return res.redirect(302, fileRecord.fileUrl);
    }

    const safeSku = product.sku.replace(/[^a-zA-Z0-9_\-]/g, '');
    const verificationStatus = fileRecord?.isVerified
      ? `VERIFIED REGISTRY RECORD (${fileRecord.issuer || 'Official Manufacturer / Regulator'})`
      : 'UNVERIFIED PRODUCT INFORMATION SHEET — NOT AN OFFICIAL CE / ISO / IMED CERTIFICATE';

    const docBody = [
      'DENTALMARKET PRODUCT DOCUMENTATION & REGULATORY NOTICE',
      '======================================================',
      `Status         : ${verificationStatus}`,
      `Product Title  : ${product.titleEn} (${product.titleFa})`,
      `SKU            : ${product.sku}`,
      `IMED Code      : ${product.imedCode || 'Not registered'}`,
      `Document Title : ${fileRecord?.titleFa || 'مشخصات فنی محصول'}`,
      `Document Code  : ${fileRecord?.code || 'N/A'}`,
      `Verification   : ${fileRecord?.isVerified ? 'Verified file metadata on record' : 'No verified certificate URL uploaded yet'}`,
      `Issuer         : ${fileRecord?.issuer || 'Catalog Technical Metadata'}`,
      `Generated At   : ${new Date().toISOString()}`,
      '',
      'Clinical Storage & Handling Guidance:',
      '- Follow manufacturer IFU inside packaging.',
      '- Inspect FEFO batch expiry before clinical use.',
      `- Customer & Technical Support: ${catalog.settings.phone}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSku}-documentation.txt"`);
    return res.send(docBody);
  });

  // --- Mobile OTP Verification & Session Auth (§8.1 Fail-Closed) ---
  app.post('/api/auth/otp/send', async (req, res) => {
    store.pruneExpired();
    const smsMode = getSmsModeConfig();
    if (!smsMode.ok) {
      return res.status(smsMode.status).json({ ok: false, message: smsMode.message });
    }

    const mobile = normalizeMobile(String(req.body?.mobile || ''));
    if (!/^09\d{9}$/.test(mobile)) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }

    const existing = store.data.otpChallenges[mobile];
    if (existing && Date.now() - existing.lastSentAt < 30000) {
      return res.status(429).json({ ok: false, message: 'لطفاً ۳۰ ثانیه قبل از ارسال مجدد کد صبر کنید.' });
    }

    const code = generateOtpCode();

    if (smsMode.mode === 'live') {
      const template = process.env.SMS_OTP_TEMPLATE?.trim() || 'verify';
      const smsRes = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.SMS_API_KEY!.trim())}/verify/lookup.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ receptor: mobile, token: code, template }).toString(),
      });
      if (!smsRes.ok) {
        return res.status(502).json({ ok: false, message: 'خطا در ارسال پیامک از طریق سرویس‌دهنده.' });
      }
    }

    store.data.otpChallenges[mobile] = {
      codeHash: hashToken(`${mobile}:${code}`),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now(),
    };
    store.save();

    return res.json({
      ok: true,
      mode: smsMode.mode,
      ...(smsMode.mode === 'sandbox' ? { sandboxCode: code } : {}),
      message:
        smsMode.mode === 'sandbox'
          ? `کد تایید آزمایشی تولید شد (کد: ${code}).`
          : 'کد تایید از طریق پیامک به شماره شما ارسال شد.',
      expiresInSec: 300,
    });
  });

  app.post('/api/auth/otp/verify', (req, res) => {
    store.pruneExpired();
    const smsMode = getSmsModeConfig();
    if (!smsMode.ok) {
      return res.status(smsMode.status).json({ ok: false, message: smsMode.message });
    }

    const mobile = normalizeMobile(String(req.body?.mobile || ''));
    const code = normalizeMobile(String(req.body?.code || ''));
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 80) : undefined;
    const record = store.data.otpChallenges[mobile];

    if (!record) {
      return res.status(400).json({ ok: false, message: 'ابتدا درخواست ارسال کد بدهید.' });
    }
    if (Date.now() > record.expiresAt) {
      delete store.data.otpChallenges[mobile];
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید منقضی شده است.' });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      delete store.data.otpChallenges[mobile];
      store.save();
      return res.status(429).json({ ok: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود.' });
    }

    const expectedHash = hashToken(`${mobile}:${code}`);
    if (!timingSafeHashEquals(expectedHash, record.codeHash)) {
      store.save();
      return res.status(400).json({ ok: false, message: 'کد تایید نادرست است.' });
    }

    delete store.data.otpChallenges[mobile];

    // 1. Short-lived verified token for guest/mobile checkout binding
    const verifiedToken = `vtok_${crypto.randomBytes(18).toString('hex')}`;
    const verifiedHash = hashToken(verifiedToken);
    store.data.otpVerifiedTokens[verifiedHash] = {
      tokenHash: verifiedHash,
      mobile,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };

    // 2. Durable 7-day mobile session (Bearer + HTTP-only cookie)
    const { token: sessionToken, session } = createMobileSession(store, mobile, displayName);

    res.setHeader(
      'Set-Cookie',
      `dm_mobile_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return res.json({
      ok: true,
      mobile,
      verifiedToken,
      sessionToken,
      session,
    });
  });

  app.get('/api/auth/session', (req, res) => {
    const mob = resolveMobileSession(store, req);
    if (!mob) {
      return res.json({ ok: true, authenticated: false, session: null });
    }
    return res.json({
      ok: true,
      authenticated: true,
      session: {
        mobile: mob.mobile,
        displayName: mob.displayName,
        expiresAt: mob.expiresAt,
      },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const mob = resolveMobileSession(store, req);
    if (mob) {
      delete store.data.mobileSessions[mob.tokenHash];
      store.save();
    }
    res.setHeader('Set-Cookie', 'dm_mobile_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.json({ ok: true });
  });

  // --- Authoritative Cart / Checkout Pricing Verification (§8.2 / §16) ---
  app.post('/api/checkout/calculate', (req, res) => {
    const { items = [], customerGroup = 'retail', couponCode = '', shippingMethod = 'courier_tehran', userId } = req.body || {};
    const calc = calculateAuthoritativeCheckout(store.data.catalogState, {
      items,
      customerGroup: customerGroup as CustomerGroupCode,
      couponCode,
      shippingMethod,
      userId: typeof userId === 'string' ? userId : undefined,
    });
    if (!calc.ok) {
      return res.status(calc.status).json({ ok: false, message: calc.message });
    }
    return res.json(calc);
  });

  // --- Idempotent Payment Gateway Initiate & Verify (§8.3) ---
  app.post('/api/payments/initiate', (req, res) => handlePaymentInitiate(store, req, res));
  app.post('/api/payments/verify', (req, res) => handlePaymentVerify(store, req, res));

  app.get('/api/payments/status/:orderId', async (req, res) => {
    const orderId = String(req.params.orderId || '').trim();
    const verified = store.data.verifiedOrderStatuses[orderId];
    if (!verified) {
      return res.json({ ok: true, paid: false, verifiedOrder: null });
    }
    return res.json({ ok: true, paid: true, verifiedOrder: verified });
  });

  app.get('/api/payments/ledger', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    return res.json({ ok: true, entries: store.data.paymentLedger, verifiedOrderStatuses: store.data.verifiedOrderStatuses });
  });

  // --- Authoritative Guest & Mobile-Authenticated Order Placement ---
  app.post('/api/orders/guest', (req, res) => {
    const body = req.body || {};
    const customerName = String(body.customerName || '').trim().slice(0, 120);
    const customerMobile = normalizeMobile(String(body.customerMobile || ''));
    const items = body.items;
    const shippingMethod = String(body.shippingMethod || 'courier_tehran');
    const paymentMethod = String(body.paymentMethod || 'online') as Order['paymentMethod'];
    const couponCode = String(body.couponCode || '');
    const shippingAddress = body.shippingAddress || {};
    const verifiedToken = typeof body.verifiedToken === 'string' ? body.verifiedToken.trim() : '';

    if (!customerName || !/^09\d{9}$/.test(customerMobile)) {
      return res.status(400).json({ ok: false, message: 'نام و شماره موبایل معتبر برای ثبت سفارش الزامی است.' });
    }

    if (!shippingAddress.city || !shippingAddress.addressLine) {
      return res.status(400).json({ ok: false, message: 'شهر و نشانی کامل تحویل الزامی است.' });
    }

    // Optional binding check when caller presents OTP verification proof or mobile session
    const mobSession = resolveMobileSession(store, req);
    let authenticatedMobile: string | null = mobSession ? mobSession.mobile : null;
    if (verifiedToken) {
      const vHash = hashToken(verifiedToken);
      const vRecord = store.data.otpVerifiedTokens[vHash];
      if (!vRecord || Date.now() > vRecord.expiresAt || vRecord.mobile !== customerMobile) {
        return res.status(403).json({ ok: false, message: 'توکن تایید شماره موبایل نامعتبر یا منقضی شده است.' });
      }
      authenticatedMobile = vRecord.mobile;
      vRecord.consumedAt = new Date().toISOString();
    }

    const calc = calculateAuthoritativeCheckout(store.data.catalogState, {
      items,
      customerGroup: 'retail',
      couponCode,
      shippingMethod,
    });
    if (!calc.ok) {
      return res.status(calc.status).json({ ok: false, message: calc.message });
    }

    const ALLOWED_PAYMENT_METHODS: Order['paymentMethod'][] = [
      'online',
      'cash_on_delivery',
      'bank_transfer',
      'credit_request',
      'cheque_request',
      'installment_request',
    ];
    const safePaymentMethod = ALLOWED_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'online';
    const initialStatus: Order['status'] =
      safePaymentMethod === 'online' ? 'pending_payment' : 'awaiting_review';
    const initialPaymentStatus: Order['paymentStatus'] =
      safePaymentMethod === 'credit_request' ||
      safePaymentMethod === 'cheque_request' ||
      safePaymentMethod === 'installment_request'
        ? 'pending_credit'
        : 'unpaid';

    const now = new Date().toISOString();
    const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const orderNo = `DM-${new Date().getFullYear()}-${crypto.randomInt(10000, 100000)}`;

    const order: Order = {
      id: orderId,
      orderNo,
      userId: authenticatedMobile ? `mobile:${authenticatedMobile}` : 'guest',
      isGuest: !authenticatedMobile,
      customerName,
      customerMobile,
      customerGroup: 'retail',
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      paymentMethod: safePaymentMethod,
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      shippingTotal: calc.shippingTotal,
      taxTotal: calc.taxTotal,
      grandTotal: calc.grandTotal,
      ...(couponCode ? { couponCode } : {}),
      shippingMethod: calc.shippingMethod,
      shippingAddress: {
        province: String(shippingAddress.province || 'تهران').slice(0, 60),
        city: String(shippingAddress.city || 'تهران').slice(0, 60),
        postalCode: String(shippingAddress.postalCode || '').slice(0, 20),
        addressLine: String(shippingAddress.addressLine || '').slice(0, 400),
      },
      customerNote: typeof body.customerNote === 'string' ? body.customerNote.slice(0, 400) : undefined,
      items: calc.items,
      createdAt: now,
      updatedAt: now,
    };

    store.data.guestOrders[order.orderNo] = order;
    store.save();

    return res.json({ ok: true, order });
  });

  app.get('/api/orders/mobile', (req, res) => {
    const mobSession = resolveMobileSession(store, req);
    if (!mobSession) {
      return res.status(401).json({ ok: false, message: 'برای مشاهده سفارش‌های موبایلی ابتدا با کد تایید وارد شوید.' });
    }
    const orders = Object.values(store.data.guestOrders)
      .filter((o) => normalizeMobile(o.customerMobile) === mobSession.mobile)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ ok: true, mobile: mobSession.mobile, orders });
  });

  app.get('/api/orders/track', (req, res) => {
    const orderNo = String(req.query.orderNo || '').trim();
    const mobile = normalizeMobile(String(req.query.mobile || ''));
    const order = store.data.guestOrders[orderNo];
    if (!order || normalizeMobile(order.customerMobile) !== mobile) {
      return res.status(404).json({ ok: false, message: 'سفارشی با این شماره پیگیری و موبایل یافت نشد.' });
    }
    return res.json({ ok: true, order });
  });

  // --- Two-Way RFQ (استعلام قیمت و چانه‌زنی) API ---
  app.get('/api/rfq', async (req, res) => {
    const mob = resolveMobileSession(store, req);
    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req) : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));

    const all = Object.values(store.data.rfqs).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (isAdmin) {
      return res.json({ ok: true, rfqs: all });
    }
    if (fbUser) {
      return res.json({ ok: true, rfqs: all.filter((r) => r.userId === fbUser.uid) });
    }
    if (mob) {
      return res.json({ ok: true, rfqs: all.filter((r) => normalizeMobile(r.customerMobile) === mob.mobile) });
    }
    return res.status(401).json({ ok: false, message: 'برای مشاهده درخواست‌های استعلام قیمت احراز هویت الزامی است.' });
  });

  app.post('/api/rfq', async (req, res) => {
    const mob = resolveMobileSession(store, req);
    const fbUser = await verifyFirebaseUser(req);
    const body = req.body || {};

    const productId = String(body.productId || '').trim();
    const variantId = String(body.variantId || '').trim();
    const quantity = Number(body.quantity || 0);
    const customerName = String(body.customerName || fbUser?.displayName || mob?.displayName || '').trim().slice(0, 120);
    const customerMobile = normalizeMobile(String(body.customerMobile || mob?.mobile || ''));
    const clinicName = typeof body.clinicName === 'string' ? body.clinicName.trim().slice(0, 160) : undefined;
    const note = String(body.note || '').trim().slice(0, 1000);
    const targetUnitPrice = body.targetUnitPrice !== undefined && body.targetUnitPrice !== '' ? Number(body.targetUnitPrice) : undefined;

    const product = store.data.catalogState.products.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId) ?? product?.variants[0];
    if (!product || !variant) {
      return res.status(400).json({ ok: false, message: 'محصول انتخاب‌شده یافت نشد.' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ ok: false, message: 'تعداد درخواستی معتبر نیست.' });
    }
    if (!customerName || !/^09\d{9}$/.test(customerMobile)) {
      return res.status(400).json({ ok: false, message: 'نام و شماره موبایل معتبر الزامی است.' });
    }

    const now = new Date().toISOString();
    const rfq: RfqRequest = {
      id: `rfq_${crypto.randomBytes(6).toString('hex')}`,
      rfqNo: `RFQ-${crypto.randomInt(10000, 100000)}`,
      userId: fbUser?.uid || (mob ? `mobile:${mob.mobile}` : `mobile:${customerMobile}`),
      customerMobile,
      customerName,
      clinicName,
      productId: product.id,
      productTitleFa: product.titleFa,
      variantId: variant.id,
      variantLabelFa: variant.labelFa,
      quantity,
      targetUnitPrice: targetUnitPrice && targetUnitPrice > 0 ? targetUnitPrice : undefined,
      status: 'submitted',
      messages: [
        {
          id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
          authorName: customerName,
          isStaff: false,
          body: note || `درخواست استعلام قیمت برای ${quantity} عدد ${product.titleFa}`,
          proposedUnitPrice: targetUnitPrice && targetUnitPrice > 0 ? targetUnitPrice : undefined,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    store.data.rfqs[rfq.id] = rfq;
    store.save();

    return res.json({ ok: true, rfq });
  });

  app.post('/api/rfq/:id/messages', async (req, res) => {
    const rfq = store.data.rfqs[String(req.params.id || '')];
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const mob = resolveMobileSession(store, req);
    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req) : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
    const isOwner = Boolean(
      (fbUser && rfq.userId === fbUser.uid) || (mob && normalizeMobile(rfq.customerMobile) === mob.mobile)
    );

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ ok: false, message: 'دسترسی به این درخواست استعلام قیمت ندارید.' });
    }

    const messageBody = String(req.body?.body || '').trim().slice(0, 1000);
    if (!messageBody) {
      return res.status(400).json({ ok: false, message: 'متن پیام نمی‌تواند خالی باشد.' });
    }

    const now = new Date().toISOString();
    const proposed =
      req.body?.proposedUnitPrice !== undefined && Number(req.body.proposedUnitPrice) > 0
        ? Number(req.body.proposedUnitPrice)
        : undefined;

    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: isAdmin ? 'کارشناس فروش کلینیکی' : rfq.customerName,
      isStaff: isAdmin,
      body: messageBody,
      proposedUnitPrice: proposed,
      createdAt: now,
    });
    if (isAdmin && rfq.status === 'submitted') rfq.status = 'in_review';
    rfq.updatedAt = now;
    store.save();

    return res.json({ ok: true, rfq });
  });

  app.post('/api/rfq/:id/quote', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const rfq = store.data.rfqs[String(req.params.id || '')];
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const quotedUnitPrice = Number(req.body?.quotedUnitPrice || 0);
    const validDays = Math.max(1, Math.min(90, Number(req.body?.validDays || 7)));
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!Number.isFinite(quotedUnitPrice) || quotedUnitPrice <= 0) {
      return res.status(400).json({ ok: false, message: 'قیمت پیشنهادی واحد باید بزرگ‌تر از صفر باشد.' });
    }

    const now = new Date().toISOString();
    rfq.quotedUnitPrice = quotedUnitPrice;
    rfq.quotedTotal = quotedUnitPrice * rfq.quantity;
    rfq.validUntil = new Date(Date.now() + validDays * 86400000).toISOString();
    rfq.status = 'quoted';
    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: adminCheck.user.displayName || adminCheck.user.email,
      isStaff: true,
      body: note || `قیمت پیشنهادی واحد ${quotedUnitPrice.toLocaleString()} تومان (جمع ${rfq.quotedTotal.toLocaleString()} تومان) ثبت شد.`,
      proposedUnitPrice: quotedUnitPrice,
      createdAt: now,
    });
    rfq.updatedAt = now;
    store.save();

    return res.json({ ok: true, rfq });
  });

  app.post('/api/rfq/:id/respond', async (req, res) => {
    const rfq = store.data.rfqs[String(req.params.id || '')];
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const mob = resolveMobileSession(store, req);
    const fbUser = await verifyFirebaseUser(req);
    const isOwner = Boolean(
      (fbUser && rfq.userId === fbUser.uid) || (mob && normalizeMobile(rfq.customerMobile) === mob.mobile)
    );
    if (!isOwner) {
      return res.status(403).json({ ok: false, message: 'فقط ثبت‌کننده درخواست مجاز به تایید یا رد پیشنهاد است.' });
    }
    if (rfq.status !== 'quoted') {
      return res.status(400).json({ ok: false, message: 'پیشنهاد قیمتی فعالی برای پاسخ وجود ندارد.' });
    }

    const decision = req.body?.decision === 'accepted' ? 'accepted' : req.body?.decision === 'rejected' ? 'rejected' : null;
    if (!decision) {
      return res.status(400).json({ ok: false, message: 'وضعیت پاسخ نامعتبر است.' });
    }

    const now = new Date().toISOString();
    rfq.status = decision;
    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: rfq.customerName,
      isStaff: false,
      body: decision === 'accepted' ? 'قیمت پیشنهادی توسط مشتری تایید شد.' : 'پیشنهاد قیمت توسط مشتری رد شد.',
      createdAt: now,
    });
    rfq.updatedAt = now;
    store.save();

    return res.json({ ok: true, rfq });
  });

  app.post('/api/rfq/:id/convert', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req);
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const rfq = store.data.rfqs[String(req.params.id || '')];
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const unitPrice = rfq.quotedUnitPrice || rfq.targetUnitPrice || 0;
    if (unitPrice <= 0) {
      return res.status(400).json({ ok: false, message: 'ابتدا باید قیمت واحد پیشنهادی ثبت شود.' });
    }

    const now = new Date().toISOString();
    const subtotal = unitPrice * rfq.quantity;
    const taxTotal = Math.round((subtotal * store.data.catalogState.settings.taxRatePercent) / 100);
    const proforma: ProformaInvoice = {
      id: `pf_rfq_${crypto.randomBytes(5).toString('hex')}`,
      proformaNo: `PF-${crypto.randomInt(10000, 100000)}`,
      shareToken: crypto.randomBytes(16).toString('hex'),
      userId: rfq.userId,
      contactName: rfq.customerName,
      contactMobile: rfq.customerMobile,
      clinicName: rfq.clinicName,
      status: 'sent',
      subtotal,
      discountTotal: 0,
      taxTotal,
      grandTotal: subtotal + taxTotal,
      items: [
        {
          productId: rfq.productId,
          variantId: rfq.variantId,
          sku: store.data.catalogState.products.find((p) => p.id === rfq.productId)?.sku || 'RFQ-SKU',
          titleFa: rfq.productTitleFa,
          variantLabelFa: rfq.variantLabelFa,
          quantity: rfq.quantity,
          unitPrice,
          discountAmount: 0,
          lineTotal: subtotal,
          priceSource: 'contract',
        },
      ],
      termsFa: `تبدیل‌شده از استعلام قیمت ${rfq.rfqNo}.`,
      validUntil: rfq.validUntil || new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    rfq.status = 'converted';
    rfq.proformaId = proforma.id;
    rfq.updatedAt = now;
    store.save();

    return res.json({ ok: true, rfq, proforma });
  });

  // --- Vite Dev Middleware / Production Static Assets ---
  if (attachVite) {
    if (!isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(__dirname, 'dist');
      const srcImagesDir = path.resolve(__dirname, 'src/assets/images');
      if (fs.existsSync(srcImagesDir)) {
        app.use('/src/assets/images', express.static(srcImagesDir));
      }
      app.use(express.static(distDir));
      app.use((_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return { app, store };
}

const isMainEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry && !process.env.VITEST) {
  createServerApp()
    .then(({ app }) => {
      app.listen(DEFAULT_PORT, '0.0.0.0', () => {
        console.log(
          `DentalMarket server listening on http://0.0.0.0:${DEFAULT_PORT} (${
            process.env.NODE_ENV === 'production' ? 'production' : 'development'
          })`
        );
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
