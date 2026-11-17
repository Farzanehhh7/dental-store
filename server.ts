import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
} from './src/data/expandedCatalog';
import {
  SEED_AGENTS,
  SEED_BLOG_POSTS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_COUPONS,
  SEED_REDIRECTS,
  SEED_SETTINGS,
} from './src/data/seed';
import { resolveVariantPrice } from './src/lib/pricing';
import {
  AgentBranch,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  Category,
  CustomerGroupCode,
  Order,
  OrderItem,
  PaymentLedgerEntry,
  Product,
  RedirectRule,
} from './src/types/domain';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Server-side in-memory SEO, catalog, OTP & payment/guest-order store synced from Firestore clients
interface ServerCatalogSnapshot {
  categories: Category[];
  brands: Brand[];
  products: Product[];
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  redirects: RedirectRule[];
  updatedAt: string;
}

const catalogState: ServerCatalogSnapshot = {
  categories: EXPANDED_CATEGORIES,
  brands: EXPANDED_BRANDS,
  products: EXPANDED_PRODUCTS,
  campaigns: SEED_CAMPAIGNS,
  bundles: SEED_BUNDLES,
  agents: SEED_AGENTS,
  blogPosts: SEED_BLOG_POSTS,
  redirects: SEED_REDIRECTS,
  updatedAt: new Date().toISOString(),
};

const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number; lastSentAt: number }>();
const paymentSessions = new Map<
  string,
  {
    authority: string;
    orderId: string;
    orderNo: string;
    amount: number;
    gateway: string;
    idempotencyKey: string;
    status: 'initiated' | 'verified' | 'failed';
    refId?: string;
    createdAt: string;
  }
>();
const guestOrders = new Map<string, Order>();

function normalizeMobile(raw: string): string {
  const map: Record<string, string> = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return raw.replace(/[۰-۹]/g, (d) => map[d] || d).replace(/[\s\-()]/g, '');
}

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
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function startServer() {
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
    const match = catalogState.redirects.find((r) => r.fromPath === req.path);
    if (match) {
      match.hitCount = (match.hitCount || 0) + 1;
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
          `  <sitemap><loc>${escapeXml(`${origin}/${s}`)}</loc><lastmod>${escapeXml(catalogState.updatedAt)}</lastmod></sitemap>`
      ),
      '</sitemapindex>',
    ].join('\n');
    res.type('application/xml; charset=utf-8').send(xml);
  });

  app.get('/sitemap-categories.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.categories
      .filter((c) => c.isActive)
      .map((c) => `  <url><loc>${escapeXml(`${origin}/category/${c.slug}`)}</loc><lastmod>${escapeXml(c.updatedAt)}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/sitemap-products.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.products
      .filter((p) => p.status !== 'draft' && p.status !== 'archived')
      .map((p) => `  <url><loc>${escapeXml(`${origin}/product/${p.slug}`)}</loc><lastmod>${escapeXml(p.updatedAt)}</lastmod><changefreq>daily</changefreq><priority>0.90</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/sitemap-brands.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.brands
      .filter((b) => b.isActive)
      .map((b) => `  <url><loc>${escapeXml(`${origin}/brand/${b.slug}`)}</loc><lastmod>${escapeXml(b.updatedAt)}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/sitemap-blog.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.blogPosts
      .filter((p) => p.status === 'published')
      .map((p) => `  <url><loc>${escapeXml(`${origin}/blog/${p.slug}`)}</loc><lastmod>${escapeXml(p.updatedAt)}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/sitemap-agents.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.agents
      .filter((a) => a.isActive)
      .map((a) => `  <url><loc>${escapeXml(`${origin}/agents/${a.provinceSlug}`)}</loc><lastmod>${escapeXml(a.updatedAt)}</lastmod><changefreq>monthly</changefreq><priority>0.70</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/sitemap-packs.xml', (req, res) => {
    const origin = getOrigin(req);
    const urls = catalogState.bundles
      .filter((b) => b.status === 'active')
      .map((b) => `  <url><loc>${escapeXml(`${origin}/pack/${b.slug}`)}</loc><lastmod>${escapeXml(b.updatedAt)}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`);
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });

  // --- Torob / Emalls Price Comparison Feed (§17.12) ---
  app.get('/feeds/price-comparison.json', (req, res) => {
    const origin = getOrigin(req);
    const items = catalogState.products
      .filter((p) => p.status === 'active' && p.pricingMode !== 'call_for_price')
      .flatMap((p) =>
        p.variants
          .filter((v) => v.isActive && v.basePrice !== null && v.basePrice > 0)
          .map((v) => {
            const resolved = resolveVariantPrice(p, v, {
              campaigns: catalogState.campaigns,
              settings: SEED_SETTINGS,
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

  // --- Catalog Sync Hook (updates server SEO/redirect/feed snapshot from live StoreContext) ---
  app.post('/api/seo/sync', (req, res) => {
    const { categories, brands, products, campaigns, bundles, agents, blogPosts, redirects } = req.body || {};
    if (Array.isArray(categories) && categories.length > 0) catalogState.categories = categories;
    if (Array.isArray(brands) && brands.length > 0) catalogState.brands = brands;
    if (Array.isArray(products) && products.length > 0) catalogState.products = products;
    if (Array.isArray(campaigns)) catalogState.campaigns = campaigns;
    if (Array.isArray(bundles)) catalogState.bundles = bundles;
    if (Array.isArray(agents)) catalogState.agents = agents;
    if (Array.isArray(blogPosts)) catalogState.blogPosts = blogPosts;
    if (Array.isArray(redirects)) catalogState.redirects = redirects;
    catalogState.updatedAt = new Date().toISOString();
    res.json({ ok: true, products: catalogState.products.length, redirects: catalogState.redirects.length });
  });

  // --- Real Certificate / Datasheet File Download (§11.11 / §6.2) ---
  app.get('/api/files/certificate', (req, res) => {
    const sku = String(req.query.sku || 'DM-ITEM').replace(/[^a-zA-Z0-9_\-]/g, '');
    const title = String(req.query.title || 'گواهینامه اصالت و کاتالوگ فنی').slice(0, 120);
    const code = String(req.query.code || 'CE-ISO13485').replace(/[^a-zA-Z0-9_\-]/g, '');
    const docBody = [
      'DENTALMARKET TECHNICAL DATASHEET & CONFORMITY CERTIFICATE',
      '==========================================================',
      `Document Title : ${title}`,
      `SKU / Product  : ${sku}`,
      `Registry Code  : ${code}`,
      `Standard       : CE Class IIa / ISO 13485 / IMED Verified`,
      `Issued By      : DentalMarket Regulatory & QA Desk`,
      `Generated At   : ${new Date().toISOString()}`,
      '',
      'Storage & Handling:',
      '- Store at 15-25°C away from direct sunlight.',
      '- Check FEFO batch expiry before clinical administration.',
      '- Official warranty & technical support: 021-88451200',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${sku}-${code}-datasheet.txt"`);
    res.send(docBody);
  });

  // --- Mobile OTP Verification API (§8.1 Sandbox with Rate Limit & 5-min TTL) ---
  app.post('/api/auth/otp/send', (req, res) => {
    const mobile = normalizeMobile(String(req.body?.mobile || ''));
    if (!/^09\d{9}$/.test(mobile)) {
      return res.status(400).json({ ok: false, message: 'شماره موبایل معتبر وارد کنید (مثال: 09123456789).' });
    }
    const existing = otpStore.get(mobile);
    if (existing && Date.now() - existing.lastSentAt < 30000) {
      return res.status(429).json({ ok: false, message: 'لطفاً ۳۰ ثانیه قبل از ارسال مجدد کد صبر کنید.' });
    }
    const code = process.env.SMS_PROVIDER === 'live'
      ? String(Math.floor(100000 + Math.random() * 900000))
      : '123456';
    otpStore.set(mobile, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now(),
    });
    return res.json({
      ok: true,
      mode: process.env.SMS_PROVIDER || 'sandbox',
      message: 'کد تایید ارسال شد (در حالت آزمایشی کد ۱۲۳۴۵۶ معتبر است).',
      expiresInSec: 300,
    });
  });

  app.post('/api/auth/otp/verify', (req, res) => {
    const mobile = normalizeMobile(String(req.body?.mobile || ''));
    const code = normalizeMobile(String(req.body?.code || ''));
    const record = otpStore.get(mobile);
    if (!record) {
      return res.status(400).json({ ok: false, message: 'ابتدا درخواست ارسال کد بدهید.' });
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(mobile);
      return res.status(400).json({ ok: false, message: 'کد تایید منقضی شده است.' });
    }
    record.attempts += 1;
    if (record.attempts > 5) {
      otpStore.delete(mobile);
      return res.status(429).json({ ok: false, message: 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود.' });
    }
    if (record.code !== code) {
      return res.status(400).json({ ok: false, message: 'کد تایید نادرست است.' });
    }
    otpStore.delete(mobile);
    return res.json({
      ok: true,
      mobile,
      verifiedToken: crypto.randomBytes(16).toString('hex'),
    });
  });

  // --- Authoritative Cart / Checkout Pricing Verification (§8.2 / §16) ---
  app.post('/api/checkout/calculate', (req, res) => {
    const {
      items = [],
      customerGroup = 'retail',
      couponCode = '',
      shippingMethod = 'tehran_courier',
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: 'سبد خرید خالی است.' });
    }

    const pricedItems: OrderItem[] = [];
    for (const raw of items) {
      const product = catalogState.products.find((p) => p.id === raw.productId);
      const variant = product?.variants.find((v) => v.id === raw.variantId);
      if (!product || !variant) continue;
      const qty = Math.max(1, Number(raw.quantity || 1));
      const resolved = resolveVariantPrice(product, variant, {
        customerGroup: customerGroup as CustomerGroupCode,
        quantity: qty,
        campaigns: catalogState.campaigns,
        settings: SEED_SETTINGS,
      });
      if (resolved.state !== 'fixed' || !resolved.unitPrice) continue;
      const base = variant.basePrice ?? resolved.unitPrice;
      const discountAmount = Math.max(0, (base - resolved.unitPrice) * qty);
      pricedItems.push({
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        titleFa: product.titleFa,
        variantLabelFa: variant.labelFa,
        quantity: qty,
        unitPrice: resolved.unitPrice,
        discountAmount,
        lineTotal: resolved.unitPrice * qty,
        priceSource: resolved.priceSource,
        batchNo: resolved.nearestBatchNo ?? undefined,
      });
    }

    const subtotal = pricedItems.reduce((s, i) => s + i.lineTotal, 0);
    const coupon = SEED_COUPONS.find(
      (c) => c.isActive && c.code.toUpperCase() === String(couponCode).trim().toUpperCase() && subtotal >= c.minOrderAmount
    );
    let couponDiscount = 0;
    if (coupon) {
      if (coupon.type === 'percent') {
        couponDiscount = Math.round((subtotal * coupon.value) / 100);
        if (coupon.maxDiscountAmount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
      } else if (coupon.type === 'fixed') {
        couponDiscount = coupon.value;
      }
    }
    const SHIPPING_FEES: Record<string, number> = {
      courier_tehran: 120000,
      tipax: 185000,
      post_pishtaz: 145000,
      heavy_freight: 0,
      express_post: 250000,
    };
    const baseShipping = SHIPPING_FEES[String(shippingMethod)] ?? 180000;
    const afterDiscount = Math.max(0, subtotal - couponDiscount);
    const shippingTotal =
      afterDiscount >= SEED_SETTINGS.freeShippingThreshold || coupon?.type === 'free_shipping'
        ? 0
        : baseShipping;
    const taxTotal = Math.round((afterDiscount * SEED_SETTINGS.taxRatePercent) / 100);
    const grandTotal = afterDiscount + shippingTotal + taxTotal;

    return res.json({
      ok: true,
      items: pricedItems,
      subtotal,
      couponDiscount,
      shippingTotal,
      taxTotal,
      grandTotal,
    });
  });

  // --- Idempotent Payment Gateway Initiate & Verify (§8.3) ---
  app.post('/api/payments/initiate', (req, res) => {
    const { orderId, orderNo, amount, gateway = 'zarinpal', idempotencyKey } = req.body || {};
    const key = String(idempotencyKey || `IDEMP-${orderId}`);
    for (const session of paymentSessions.values()) {
      if (session.idempotencyKey === key) {
        return res.json({ ok: true, reused: true, session });
      }
    }
    const authority = `AUTH-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const session = {
      authority,
      orderId: String(orderId || ''),
      orderNo: String(orderNo || ''),
      amount: Number(amount || 0),
      gateway: String(gateway),
      idempotencyKey: key,
      status: 'initiated' as const,
      createdAt: new Date().toISOString(),
    };
    paymentSessions.set(authority, session);
    return res.json({
      ok: true,
      mode: process.env.PAYMENT_MODE || 'sandbox',
      session,
    });
  });

  app.post('/api/payments/verify', (req, res) => {
    const { authority, status = 'OK' } = req.body || {};
    const session = paymentSessions.get(String(authority || ''));
    if (!session) {
      return res.status(404).json({ ok: false, message: 'تراکنش پرداخت یافت نشد.' });
    }
    if (session.status === 'verified') {
      return res.json({ ok: true, alreadyVerified: true, refId: session.refId, session });
    }
    if (status !== 'OK') {
      session.status = 'failed';
      return res.status(400).json({ ok: false, message: 'پرداخت توسط کاربر لغو یا ناموفق شد.', session });
    }
    session.status = 'verified';
    session.refId = String(Math.floor(100000000 + Math.random() * 899999999));
    const ledgerEntry: PaymentLedgerEntry = {
      id: `pay_${Date.now()}`,
      orderId: session.orderId,
      orderNo: session.orderNo,
      gateway: session.gateway,
      amount: session.amount,
      idempotencyKey: session.idempotencyKey,
      refId: session.refId,
      status: 'verified',
      createdAt: new Date().toISOString(),
    };
    return res.json({ ok: true, refId: session.refId, session, ledgerEntry });
  });

  // --- Guest Order Placement & Tracking (§8.1 Guest Checkout) ---
  app.post('/api/orders/guest', (req, res) => {
    const order = req.body?.order as Order | undefined;
    if (!order || !order.orderNo || !order.customerMobile) {
      return res.status(400).json({ ok: false, message: 'اطلاعات سفارش مهمان کامل نیست.' });
    }
    guestOrders.set(order.orderNo, { ...order, isGuest: true });
    return res.json({ ok: true, order });
  });

  app.get('/api/orders/track', (req, res) => {
    const orderNo = String(req.query.orderNo || '').trim();
    const mobile = normalizeMobile(String(req.query.mobile || ''));
    const order = guestOrders.get(orderNo);
    if (!order || normalizeMobile(order.customerMobile) !== mobile) {
      return res.status(404).json({ ok: false, message: 'سفارشی با این شماره پیگیری و موبایل یافت نشد.' });
    }
    return res.json({ ok: true, order });
  });

  // --- Vite Dev Middleware / Production Static Assets ---
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DentalMarket server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
