import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

async function runHttpKeepAliveBenchmark(baseUrl, spec) {
  const url = new URL(spec.path, baseUrl);
  const agent = new http.Agent({ keepAlive: true, maxSockets: spec.connections });
  const latenciesMs = [];
  const statusCodes = {};
  let totalBytes = 0;
  let errors = 0;

  const endAt = performance.now() + spec.durationMs;

  const singleRequest = () =>
    new Promise((resolve) => {
      const started = performance.now();
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: spec.method,
          agent,
          headers: {
            ...(spec.body ? { 'Content-Length': Buffer.byteLength(spec.body) } : {}),
            ...(spec.headers ?? {}),
          },
        },
        (res) => {
          const codeKey = String(res.statusCode ?? 0);
          statusCodes[codeKey] = (statusCodes[codeKey] ?? 0) + 1;
          res.on('data', (chunk) => {
            totalBytes += chunk.byteLength;
          });
          res.on('end', () => {
            latenciesMs.push(performance.now() - started);
            resolve();
          });
        }
      );
      req.on('error', () => {
        errors += 1;
        resolve();
      });
      if (spec.body) {
        req.write(spec.body);
      }
      req.end();
    });

  const startedAt = performance.now();
  const workers = Array.from({ length: spec.connections }, async () => {
    while (performance.now() < endAt) {
      await singleRequest();
    }
  });
  await Promise.all(workers);
  const elapsedSec = Math.max(0.001, (performance.now() - startedAt) / 1000);
  agent.destroy();

  latenciesMs.sort((a, b) => a - b);
  const totalRequests = latenciesMs.length;
  const mean =
    totalRequests > 0 ? latenciesMs.reduce((sum, v) => sum + v, 0) / totalRequests : 0;

  return {
    name: spec.name,
    connections: spec.connections,
    durationSec: Number(elapsedSec.toFixed(2)),
    totalRequests,
    rps: Number((totalRequests / elapsedSec).toFixed(1)),
    errors,
    statusCodes,
    latencyMs: {
      min: totalRequests > 0 ? Number(latenciesMs[0].toFixed(2)) : 0,
      p50: percentile(latenciesMs, 50),
      p95: percentile(latenciesMs, 95),
      p99: percentile(latenciesMs, 99),
      max: totalRequests > 0 ? Number(latenciesMs[totalRequests - 1].toFixed(2)) : 0,
      mean: Number(mean.toFixed(2)),
    },
    throughputBytesPerSec: Math.round(totalBytes / elapsedSec),
  };
}

async function main() {
  const externalBaseUrl = process.env.BASE_URL?.trim();
  const durationMs = Math.max(1000, Number(process.env.LOAD_DURATION_MS || 5000));
  const connections = Math.max(1, Number(process.env.LOAD_CONNECTIONS || 20));

  let tmpDir = null;
  let server = null;
  let stopExpiryJob = null;
  let targetUrl = externalBaseUrl || '';

  if (!externalBaseUrl) {
    process.env.NODE_ENV = 'test';
    process.env.SMS_PROVIDER = 'sandbox';
    process.env.PAYMENT_MODE = 'sandbox';
    process.env.RATE_LIMIT_GLOBAL_MAX = '50000';
    process.env.RATE_LIMIT_ORDER_PAYMENT_MAX = '5000';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-load-baseline-'));
    const { createServerApp } = await import('../../server.ts');
    const created = await createServerApp({ dataDir: tmpDir, attachVite: false });
    stopExpiryJob = created.stopExpiryJob;

    await new Promise((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          targetUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  }

  try {
    // Warm up catalog endpoint & inspect an in-stock fixed-price variant for checkout payload
    const catalogWarmRes = await fetch(`${targetUrl}/api/catalog/products?inStock=1&limit=24`);
    const catalogJson = await catalogWarmRes.json();
    let pickedProduct = null;
    let pickedVariant = null;
    for (const prod of catalogJson.items ?? []) {
      if (prod.pricingMode === 'call_for_price') continue;
      const candidate = (prod.variants ?? []).find(
        (v) =>
          v.isActive !== false &&
          v.basePrice !== null &&
          Number(v.basePrice) > 0 &&
          Number(v.stockOnHand || 0) - Number(v.reserved || 0) >= 2
      );
      if (candidate) {
        pickedProduct = prod;
        pickedVariant = candidate;
        break;
      }
    }
    if (!pickedProduct || !pickedVariant) {
      throw new Error('No in-stock fixed-price variant found for checkout baseline payload');
    }
    const checkoutPayload = JSON.stringify({
      items: [
        {
          productId: pickedProduct.id,
          variantId: pickedVariant.id,
          quantity: 1,
        },
      ],
      shippingMethod: 'courier_tehran',
      customerGroup: 'retail',
    });

    const checkoutProbe = await fetch(`${targetUrl}/api/checkout/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: checkoutPayload,
    });
    if (checkoutProbe.status !== 200) {
      const errBody = await checkoutProbe.text();
      throw new Error(`Checkout baseline probe failed (${checkoutProbe.status}): ${errBody}`);
    }

    const specs = [
      {
        name: 'catalog_filtered_warm_lru',
        method: 'GET',
        path: '/api/catalog/products?inStock=1&limit=12&sort=best_selling',
        connections,
        durationMs,
      },
      {
        name: 'catalog_persian_search_warm_lru',
        method: 'GET',
        path: `/api/catalog/products?q=${encodeURIComponent('کامپوزیت')}&limit=12`,
        connections,
        durationMs,
      },
      {
        name: 'checkout_calculate_authoritative',
        method: 'POST',
        path: '/api/checkout/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: checkoutPayload,
        connections,
        durationMs,
      },
    ];

    const results = [];
    for (const spec of specs) {
      // Single warmup request before timed run
      await runHttpKeepAliveBenchmark(targetUrl, {
        ...spec,
        connections: 1,
        durationMs: 250,
      });
      const summary = await runHttpKeepAliveBenchmark(targetUrl, spec);
      results.push(summary);
    }

    console.log(
      JSON.stringify(
        {
          targetUrl,
          nodeVersion: process.version,
          platform: `${process.platform}/${process.arch}`,
          connections,
          durationMs,
          measuredAt: new Date().toISOString(),
          results,
        },
        null,
        2
      )
    );
  } finally {
    stopExpiryJob?.();
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error('Load baseline failed:', err);
  process.exit(1);
});
