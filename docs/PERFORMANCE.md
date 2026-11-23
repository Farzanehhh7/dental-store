# Performance Baseline & Load Testing — DentalMarket

This document records the reproducible HTTP performance baseline measured against the Express backend (`server.ts`), alongside instructions for running external `k6` and `autocannon` benchmarks.

> **Policy**: Only directly measured metrics are recorded below. Unmeasured environments (external `k6` runs, production/staging Firestore) are marked `TODO: measure` with the exact reproduction command.

---

## 1. Phase 8 Scalability Changes Benchmarked

1. **Async Debounced Atomic Store Persistence (`server/persistence.ts`)**:
   - Eliminated blocking `fs.writeFileSync` full-file rewrites on every mutation.
   - File-mode writes coalesce behind `STORE_WRITE_DEBOUNCE_MS` (default `100ms`) and flush via serialized `fs.promises.writeFile(tmp)` + `fs.promises.rename(tmp, filePath)`.
   - When `STORAGE_DRIVER=firestore`, `persistenceMode` defaults to `'memory'` (no `store.json` created or rewritten in production).
2. **Periodic Counter Aggregation (`server/routes/seo.routes.ts`, `server/repositories/*`)**:
   - Redirect `hitCount` and `404` telemetry `hitCount` accumulate in memory and flush periodically (`COUNTER_FLUSH_INTERVAL_MS`, default `5000ms`), preventing write amplification on read/redirect traffic.
3. **Catalog Query LRU Cache & HTTP Caching (`server/routes/catalog.routes.ts`, `server/lib/lruCache.ts`)**:
   - Bounded in-memory LRU (`CATALOG_CACHE_MAX_ENTRIES=200`, `CATALOG_CACHE_TTL_MS=30000`) caches serialized `GET /api/catalog/products` responses (`items`, cursor metadata, disjunctive `facets`) keyed by query + catalog version token.
   - Emits strong `ETag` + `Cache-Control: public, max-age=30, stale-while-revalidate=120` with `304 Not Modified` on `If-None-Match` hit, and clears automatically on `repos.notifyCatalogChanged()` (catalog sync, stock reserve/commit/release/adjust/transfer/stocktake).

---

## 2. Measured Local Baseline (`npm run load:baseline`)

- **Command**: `npm run load:baseline` (`tsx scripts/load/autocannon-baseline.mjs`)
- **Environment**: Node `v22.23.2`, `linux/x64`, `STORAGE_DRIVER=file` (in-memory hot snapshot + LRU cache), `attachVite: false`, HTTP/1.1 keep-alive pool (`connections = 20`, `durationMs = 5000` per scenario after a `250ms` warmup).
- **Measured At**: `2026-11-22T00:00:37.821Z`

| Scenario | Method & Path | Conns | Duration | Total Req | RPS | Errors | Status | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Mean (ms) | Throughput (B/s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `catalog_filtered_warm_lru` | `GET /api/catalog/products?inStock=1&limit=12&sort=best_selling` | 20 | 5.02s | 3,194 | 636.8 | 0 | 200 (3,194) | 31.04 | 34.94 | 37.59 | 215.64 | 31.31 | 51,115,650 |
| `catalog_persian_search_warm_lru` | `GET /api/catalog/products?q=کامپوزیت&limit=12` | 20 | 5.02s | 3,719 | 741.5 | 0 | 200 (3,719) | 26.50 | 29.28 | 30.95 | 168.50 | 26.90 | 50,459,568 |
| `checkout_calculate_authoritative` | `POST /api/checkout/calculate` | 20 | 5.01s | 3,839 | 766.1 | 0 | 200 (3,839) | 25.63 | 30.14 | 32.31 | 179.82 | 26.06 | 444,360 |

### Observations from Local Baseline
- Both warm-LRU catalog scenarios returned `200 OK` across all 6,913 combined requests with zero errors and sub-38ms `p99` latency despite returning full product objects + disjunctive `facets` (~70–80 KB JSON payload per response, ~50 MB/s single-process Node throughput).
- `POST /api/checkout/calculate` evaluated authoritative pricing/tax/shipping cleanly at **766.1 req/s** (`p95 = 30.14 ms`, `p99 = 32.31 ms`, 0 errors).

---

## 3. External Benchmark Scripts (`k6` & Targeted Runs)

### A. `k6` Multi-Scenario Load Script (Catalog Search/Cursor/304 + Checkout Calculate)
`k6` is not pre-installed in this container runtime. Run on a host or CI runner with `k6` installed against a running server:

- **Status**: `TODO: measure` (requires `k6` binary)
- **Command**:
  ```bash
  # Terminal 1: start built server (ensure RATE_LIMIT_* vars match load profile in staging)
  npm run build && npm start

  # Terminal 2: execute k6 ramping-VUs catalog + constant-VUs checkout suite
  BASE_URL=http://127.0.0.1:3000 k6 run scripts/load/k6-catalog-checkout.js
  ```
- **Configured Thresholds in `scripts/load/k6-catalog-checkout.js`**:
  - `http_req_failed`: `rate < 0.01`
  - `http_req_duration{endpoint:catalog}`: `p(95) < 250ms`
  - `http_req_duration{endpoint:checkout}`: `p(95) < 350ms`

### B. Custom `autocannon-baseline` Target Runs (e.g., Staging / Built Server / `STORAGE_DRIVER=firestore`)
- **Status**: `TODO: measure` (when benchmarking against an external/Firestore-backed staging instance)
- **Command**:
  ```bash
  BASE_URL=https://staging.example.com LOAD_CONNECTIONS=40 LOAD_DURATION_MS=15000 npm run load:baseline
  ```

### C. Cold-Cache / Cache-Invalidated Catalog & Firestore Order Write Contention
- **Status**: `TODO: measure` (requires Firebase Emulator or staging Firestore project)
- **Command**:
  ```bash
  STORAGE_DRIVER=firestore NODE_ENV=production SESSION_SECRET=<32+chars> npm start
  # Then run:
  BASE_URL=http://127.0.0.1:3000 LOAD_CONNECTIONS=20 LOAD_DURATION_MS=10000 npm run load:baseline
  ```
