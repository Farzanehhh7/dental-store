import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cors from 'cors';
import { validateServerEnv } from './server/config/env';
import {
  DEFAULT_PORT,
  getOrigin,
  parseAllowedOrigins,
  parseForwardedForIp,
  parseTrustProxySetting,
} from './server/lib/http';
import { renderSeoHtmlResponse } from './server/lib/ssrHtml';
import { createServerStore, flushPendingStoresForDir } from './server/persistence';
import { createRepositories } from './server/repositories';
import { createAdminRouter } from './server/routes/admin.routes';
import { createAuthRouter } from './server/routes/auth.routes';
import { createCatalogRouter } from './server/routes/catalog.routes';
import { createCheckoutRouter } from './server/routes/checkout.routes';
import { createFilesRouter } from './server/routes/files.routes';
import { createImportExportRouter } from './server/routes/importExport.routes';
import { createInventoryRouter } from './server/routes/inventory.routes';
import { createPaymentsRouter } from './server/routes/payments.routes';
import { createReportsRouter } from './server/routes/reports.routes';
import { createRfqRouter } from './server/routes/rfq.routes';
import { createRedirectsMiddleware, createSeoRouter } from './server/routes/seo.routes';
import { createInventoryService } from './server/services/inventoryService';
import { createOrderService } from './server/services/orderService';
import { createPaymentService } from './server/services/paymentService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CreateServerAppOptions {
  dataDir?: string;
  attachVite?: boolean;
}

export async function createServerApp(options: CreateServerAppOptions = {}) {
  const env = validateServerEnv(process.env);

  const isProd = env.NODE_ENV === 'production';
  const attachVite = options.attachVite ?? true;
  const distDir = path.resolve(__dirname, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const rootIndexPath = path.resolve(__dirname, 'index.html');
  let cachedProdTemplate: string | null = null;
  const getTemplateHtml = (): string => {
    if (isProd && fs.existsSync(distIndexPath)) {
      if (!cachedProdTemplate) {
        cachedProdTemplate = fs.readFileSync(distIndexPath, 'utf8');
      }
      return cachedProdTemplate;
    }
    if (fs.existsSync(rootIndexPath)) {
      return fs.readFileSync(rootIndexPath, 'utf8');
    }
    return '<!doctype html><html lang="fa" dir="rtl"><head><title>دنتال‌مارکت</title></head><body><div id="root"></div></body></html>';
  };
  const targetDataDir = options.dataDir ?? env.DATA_DIR;
  await flushPendingStoresForDir(targetDataDir);
  const store = createServerStore(targetDataDir);
  const repos = createRepositories(store);
  const orderService = createOrderService(repos);
  const paymentService = createPaymentService(repos);
  const inventoryService = createInventoryService(repos);
  const app = express();

  const trustProxy = parseTrustProxySetting(env.TRUST_PROXY);
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: isProd ? { action: 'sameorigin' } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isProd
            ? ["'self'", 'https://apis.google.com', 'https://www.gstatic.com']
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://apis.google.com', 'https://www.gstatic.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: [
            "'self'",
            'https://*.googleapis.com',
            'https://*.firebaseio.com',
            'wss://*.firebaseio.com',
            'https://*.firebaseapp.com',
            'https://www.google-analytics.com',
            ...(isProd ? [] : ['ws:', 'wss:']),
          ],
          frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
          frameAncestors: isProd ? ["'self'"] : null,
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    })
  );

  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()'
    );
    next();
  });

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const siteOrigin = env.SITE_URL?.trim().replace(/\/$/, '') || '';
  app.use(
    cors((req, callback) => {
      const originHeader = req.headers.origin;
      if (!originHeader) {
        return callback(null, { origin: false });
      }
      const cleanOrigin = originHeader.trim().replace(/\/$/, '');
      const host = req.headers.host;
      const sameOrigin = host ? `${req.protocol}://${host}` : '';
      const isAllowed =
        (sameOrigin && cleanOrigin === sameOrigin) ||
        (siteOrigin && cleanOrigin === siteOrigin) ||
        allowedOrigins.has(cleanOrigin);
      return callback(null, {
        origin: isAllowed,
        credentials: isAllowed,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Mobile-Session',
          'Idempotency-Key',
          'X-Idempotency-Key',
          'X-Order-Token',
          'X-Webhook-Signature',
        ],
      });
    })
  );

  const rateLimitWindowMs = env.RATE_LIMIT_WINDOW_MS;
  const otpRateLimitMax = env.RATE_LIMIT_OTP_MAX;
  const orderPaymentRateLimitMax = env.RATE_LIMIT_ORDER_PAYMENT_MAX;
  const telemetryRateLimitMax = env.RATE_LIMIT_TELEMETRY_MAX;
  const globalApiRateLimitMax = env.RATE_LIMIT_GLOBAL_MAX;

  const makeRateLimiter = (max: number, message: string, skip?: (req: express.Request) => boolean) =>
    rateLimit({
      windowMs: rateLimitWindowMs,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => {
        const remoteIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
        if (trustProxy !== false && req.headers.forwarded && req.ip === req.socket?.remoteAddress) {
          const forwardedIp = parseForwardedForIp(req.headers.forwarded);
          if (forwardedIp) {
            return ipKeyGenerator(forwardedIp);
          }
        }
        return ipKeyGenerator(remoteIp);
      },
      validate: {
        xForwardedForHeader: false,
        forwardedHeader: false,
      },
      ...(skip ? { skip } : {}),
      handler: (_req, res) => {
        res.status(429).json({ ok: false, message });
      },
    });

  app.use(
    '/api/auth/otp',
    makeRateLimiter(
      otpRateLimitMax,
      'تعداد درخواست‌های کد تایید از این نشانی بیش از حد مجاز است. لطفاً دقایقی دیگر تلاش کنید.'
    )
  );
  app.use(
    ['/api/payments', '/api/orders'],
    makeRateLimiter(
      orderPaymentRateLimitMax,
      'تعداد درخواست‌های ثبت سفارش یا پرداخت بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.'
    )
  );
  app.use(
    ['/api/telemetry', '/api/newsletter/subscribe', '/api/stock-notifications'],
    makeRateLimiter(
      telemetryRateLimitMax,
      'تعداد درخواست‌های ارسالی در این بازه زمانی بیش از حد مجاز است.'
    )
  );
  app.use(
    '/api',
    makeRateLimiter(
      globalApiRateLimitMax,
      'تعداد درخواست‌ها به سرور بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
      (req) =>
        req.path === '/health' ||
        req.path.startsWith('/auth/otp') ||
        req.path.startsWith('/payments') ||
        req.path.startsWith('/orders') ||
        req.path.startsWith('/telemetry') ||
        req.path.startsWith('/newsletter') ||
        req.path.startsWith('/stock-notifications')
    )
  );

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const jsonParser1mb = express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  });
  app.use((req, res, next) => {
    if (
      req.path === '/api/seo/sync' ||
      req.path === '/api/files/upload' ||
      req.path.startsWith('/api/admin/import/')
    ) {
      return next();
    }
    return jsonParser1mb(req, res, next);
  });

  const redirectsMiddleware = createRedirectsMiddleware(store, repos, getTemplateHtml);
  const seoRouter = createSeoRouter(store, repos);
  app.use(redirectsMiddleware);

  // Mount domain routers
  app.use(seoRouter);
  app.use(createCatalogRouter(store, repos));
  app.use(createAdminRouter(store, orderService, paymentService, repos));
  app.use(createReportsRouter(store, repos));
  app.use(createImportExportRouter(store, repos));
  app.use(createFilesRouter(store, { dataDir: targetDataDir, repos }));
  app.use(createAuthRouter(store, repos));
  app.use(createCheckoutRouter(store, orderService, repos));
  app.use(createInventoryRouter(store, inventoryService, repos));
  app.use(createPaymentsRouter(store, paymentService, repos));
  app.use(createRfqRouter(store, repos));

  // Clean JSON error handler for malformed / oversized API bodies
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const bodyErr = err as { type?: string; status?: number };
    if (bodyErr?.type === 'entity.too.large' || bodyErr?.status === 413) {
      return res.status(413).json({ ok: false, message: 'حجم داده‌های ارسالی بیش از حد مجاز است.' });
    }
    if (bodyErr?.type === 'entity.parse.failed' || (err instanceof SyntaxError && bodyErr?.status === 400)) {
      return res.status(400).json({ ok: false, message: 'ساختار JSON درخواست نامعتبر است.' });
    }
    return next(err);
  });

  const renderSsrPage: express.RequestHandler = async (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
      return next();
    }
    const qIdx = req.originalUrl.indexOf('?');
    const search = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
    const catalog = await repos.catalog.getSnapshot();
    const { statusCode, html } = renderSeoHtmlResponse({
      templateHtml: getTemplateHtml(),
      pathname: req.path,
      search,
      origin: getOrigin(req),
      catalog,
    });
    return res.status(statusCode).type('text/html; charset=utf-8').send(html);
  };

  // Vite dev middleware or production static frontend assets + SSR head/body injection
  if (attachVite) {
    if (!isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          ...(process.env.NODE_ENV === 'test' ? { hmr: false } : {}),
        },
        appType: 'custom',
      });
      app.use(vite.middlewares);
      app.use(async (req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
          return next();
        }
        try {
          const qIdx = req.originalUrl.indexOf('?');
          const search = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
          const catalog = await repos.catalog.getSnapshot();
          const ssr = renderSeoHtmlResponse({
            templateHtml: getTemplateHtml(),
            pathname: req.path,
            search,
            origin: getOrigin(req),
            catalog,
          });
          const transformed = await vite.transformIndexHtml(req.originalUrl, ssr.html);
          return res.status(ssr.statusCode).type('text/html; charset=utf-8').send(transformed);
        } catch (err) {
          vite.ssrFixStacktrace(err as Error);
          return next(err);
        }
      });
    } else {
      const publicImagesDir = path.resolve(__dirname, 'public/assets/images');
      const srcImagesDir = path.resolve(__dirname, 'src/assets/images');
      if (fs.existsSync(publicImagesDir)) {
        app.use('/assets/images', express.static(publicImagesDir));
      }
      if (fs.existsSync(srcImagesDir)) {
        app.use('/src/assets/images', express.static(srcImagesDir));
      }
      app.use(express.static(distDir, { index: false }));
      app.use(renderSsrPage);
    }
  } else {
    // Headless mode (e.g., Supertest integration tests): still serve SSR HTML + SEO tags + status codes
    const publicDir = path.resolve(__dirname, 'public');
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir, { index: false }));
    }
    app.use(renderSsrPage);
  }

  // Background payment expiry sweep (unref'd so tests/graceful exit are never blocked)
  const sweepIntervalMs = env.PAYMENT_EXPIRY_SWEEP_INTERVAL_MS;
  const expiryTimer = setInterval(() => {
    paymentService.runExpirySweep().catch((err) => {
      console.warn('[payment-expiry] sweep failed:', err);
    });
  }, sweepIntervalMs);
  expiryTimer.unref();

  const stopExpiryJob = () => {
    clearInterval(expiryTimer);
    redirectsMiddleware.stopFlushTimer();
    seoRouter.stopTimers();
    store.dispose().catch(() => {});
  };

  return {
    app,
    store,
    repos,
    orderService,
    paymentService,
    inventoryService,
    stopExpiryJob,
  };
}

const isMainEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry && !process.env.VITEST) {
  createServerApp()
    .then(({ app, stopExpiryJob, store }) => {
      const server = app.listen(DEFAULT_PORT, '0.0.0.0', () => {
        console.log(
          `DentalMarket server listening on http://0.0.0.0:${DEFAULT_PORT} (${
            process.env.NODE_ENV === 'production' ? 'production' : 'development'
          })`
        );
      });
      const shutdown = async () => {
        stopExpiryJob();
        await store.flush().catch(() => {});
        server.close(() => process.exit(0));
      };
      process.once('SIGTERM', () => {
        shutdown().catch(() => process.exit(1));
      });
      process.once('SIGINT', () => {
        shutdown().catch(() => process.exit(1));
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
