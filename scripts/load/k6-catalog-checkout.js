import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  scenarios: {
    catalog_browse_and_search: {
      executor: 'ramping-vus',
      exec: 'catalogScenario',
      startVUs: 2,
      stages: [
        { duration: '15s', target: 15 },
        { duration: '30s', target: 30 },
        { duration: '10s', target: 0 },
      ],
    },
    checkout_calculate_pricing: {
      executor: 'constant-vus',
      exec: 'checkoutScenario',
      vus: 10,
      duration: '45s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:catalog}': ['p(95)<250'],
    'http_req_duration{endpoint:checkout}': ['p(95)<350'],
  },
};

const SEARCH_TERMS = ['کامپوزیت', 'فایل', 'سمان', 'اتوکلاو', 'باندینگ'];

export function catalogScenario() {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const page1 = http.get(
    `${BASE_URL}/api/catalog/products?q=${encodeURIComponent(term)}&limit=12`,
    { tags: { endpoint: 'catalog' } }
  );

  check(page1, {
    'catalog status 200': (r) => r.status === 200,
    'catalog has items array': (r) => Array.isArray(r.json('items')),
    'catalog has facets': (r) => Boolean(r.json('facets')),
    'catalog has etag': (r) => Boolean(r.headers.ETag || r.headers.Etag),
  });

  const etag = page1.headers.ETag || page1.headers.Etag;
  if (etag) {
    const cachedRes = http.get(
      `${BASE_URL}/api/catalog/products?q=${encodeURIComponent(term)}&limit=12`,
      { headers: { 'If-None-Match': etag }, tags: { endpoint: 'catalog' } }
    );
    check(cachedRes, {
      'catalog conditional etag returns 304': (r) => r.status === 304,
    });
  }

  const nextCursor = page1.json('nextCursor');
  if (nextCursor) {
    const page2 = http.get(
      `${BASE_URL}/api/catalog/products?q=${encodeURIComponent(term)}&limit=12&cursor=${encodeURIComponent(nextCursor)}`,
      { tags: { endpoint: 'catalog' } }
    );
    check(page2, {
      'cursor page2 status 200': (r) => r.status === 200,
    });
  }

  sleep(0.2);
}

export function checkoutScenario() {
  const payload = JSON.stringify({
    items: [
      {
        productId: 'prod_composite_3m',
        variantId: 'var_comp_a2',
        quantity: 2,
      },
    ],
    shippingMethod: 'courier_tehran',
    customerGroup: 'retail',
  });

  const res = http.post(`${BASE_URL}/api/checkout/calculate`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'checkout' },
  });

  check(res, {
    'checkout calculate status 200': (r) => r.status === 200,
    'checkout calculate ok': (r) => r.json('ok') === true,
    'checkout has authoritative totals': (r) => typeof r.json('totals.grandTotal') === 'number',
  });

  sleep(0.25);
}
