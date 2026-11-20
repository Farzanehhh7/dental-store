import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cors from 'cors';
import { assertSessionSecretConfigured } from './server/auth';
import {
  DEFAULT_PORT,
  envPositiveInt,
  parseAllowedOrigins,
  parseForwardedForIp,
  parseTrustProxySetting,
} from './server/lib/http';
import { createServerStore } from './server/persistence';
import { createRepositories } from './server/repositories';
import { createAdminRouter } from './server/routes/admin.routes';
import { createAuthRouter } from './server/routes/auth.routes';
import { createCatalogRouter } from './server/routes/catalog.routes';
import { createCheckoutRouter } from './server/routes/checkout.routes';
import { createFilesRouter } from './server/routes/files.routes';
import { createInventoryRouter } from './server/routes/inventory.routes';
import { createPaymentsRouter } from './server/routes/payments.routes';
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
  assertSessionSecretConfigured();

  const isProd = process.env.NODE_ENV === 'production';
  const attachVite = options.attachVite ?? true;
  const store = createServerStore(options.dataDir);
  const repos = createRepositories(store);
  const orderService = createOrderService(repos);
  const paymentService = createPaymentService(repos);
  const inventoryService = createInventoryService(repos);
  const app = express();

  const trustProxy = parseTrustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: isProd ? { action: 'sameorigin' } : false,
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

  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  const siteOrigin = process.env.SITE_URL?.trim().replace(/\/$/, '') || '';
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

  const rateLimitWindowMs = envPositiveInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  const otpRateLimitMax = envPositiveInt('RATE_LIMIT_OTP_MAX', 10);
  const orderPaymentRateLimitMax = envPositiveInt('RATE_LIMIT_ORDER_PAYMENT_MAX', 30);
  const globalApiRateLimitMax = envPositiveInt('RATE_LIMIT_GLOBAL_MAX', 300);

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
    '/api',
    makeRateLimiter(
      globalApiRateLimitMax,
      'تعداد درخواست‌ها به سرور بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
      (req) =>
        req.path === '/health' ||
        req.path.startsWith('/auth/otp') ||
        req.path.startsWith('/payments') ||
        req.path.startsWith('/orders')
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
    if (req.path === '/api/seo/sync') {
      return next();
    }
    return jsonParser1mb(req, res, next);
  });

  app.use(createRedirectsMiddleware(store));

  // Mount domain routers
  app.use(createSeoRouter(store));
  app.use(createCatalogRouter(store));
  app.use(createAdminRouter(store, orderService, paymentService));
  app.use(createFilesRouter(store));
  app.use(createAuthRouter(store));
  app.use(createCheckoutRouter(store, orderService));
  app.use(createInventoryRouter(store, inventoryService));
  app.use(createPaymentsRouter(store, paymentService));
  app.use(createRfqRouter(store));

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

  // Vite dev middleware or production static frontend assets
  if (attachVite) {
    if (!isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          ...(process.env.NODE_ENV === 'test' ? { hmr: false } : {}),
        },
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

  // Background payment expiry sweep (unref'd so tests/graceful exit are never blocked)
  const sweepIntervalMs = envPositiveInt('PAYMENT_EXPIRY_SWEEP_INTERVAL_MS', 60_000);
  const expiryTimer = setInterval(() => {
    paymentService.runExpirySweep().catch((err) => {
      console.warn('[payment-expiry] sweep failed:', err);
    });
  }, sweepIntervalMs);
  expiryTimer.unref();

  return {
    app,
    store,
    repos,
    orderService,
    paymentService,
    inventoryService,
    stopExpiryJob: () => clearInterval(expiryTimer),
  };
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
