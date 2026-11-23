# ADR 0001: Persistence Architecture — Keep Firestore vs. Migrate to PostgreSQL + Prisma

- **Status**: Proposed (Adapter Seams Implemented in Phase 8; Database Cutover Deferred)
- **Date**: 2026-11-21
- **Context**: DentalMarket (Persian/RTL B2B dental & medical equipment commerce platform)

---

## 1. Context & Problem Statement

DentalMarket currently persists runtime state via two adapters behind `server/repositories/interfaces.ts`:
1. **`fileRepositories.ts`**: Backed by an in-memory snapshot flushed asynchronously with debouncing and atomic temp-file rename (`.data/store.json`) for local development and Hermetic Vitest integration runs.
2. **`firestoreRepositories.ts`**: Backed by Google Cloud Firestore (via `firebase-admin`), using Firestore transactions (`db.runTransaction`) for order creation, stock reservation, payment verification, and audit logging.

While moving ephemeral OTP sessions, mobile sessions, RFQs, telemetry, and engagement records out of `store.json` into Firestore (Phase 8) eliminates local filesystem coupling in production, several domain workloads exhibit growing friction on a NoSQL document store:
- **Multi-item & Multi-warehouse Stock Accounting**: Order reservation/commit/release (`StockRepository`) touches multiple `stockLevels`, `stockBatches` (FEFO expiry sorting), and `products` documents inside a single transaction, requiring read-all-before-write discipline and manual aggregate denormalization onto `ProductVariant.stockOnHand`.
- **Relational Queries & Reporting**: Admin order filtering (Jalali date range + status + source + search), catalog faceted filtering (price range, multi-brand, origin, dynamic JSONB attributes), and financial/inventory aggregations (`reports.routes.ts`) require in-memory scanning or extra composite indexes in Firestore.
- **Data Integrity Constraints**: Foreign-key invariants (e.g., `StockBatch.warehouseId -> Warehouse.id`, unique `Order.idempotencyKey`, unique `Order.orderNo`, append-only `AuditLog`) rely on application-layer checks rather than database constraints.

---

## 2. Options Considered

### Option A: Keep Firestore (`STORAGE_DRIVER=firestore`)
**Strengths**:
- Already provisioned with `firestore.rules` security boundaries, `admins/{uid}` RBAC, and Firebase Auth UID alignment.
- Native TTL policies (`ttlExpireAt` Date field on `otpChallenges`, `otpLockouts`, `otpPhoneSendHistory`, `otpVerifiedTokens`, `mobileSessions`) automatically reap expired auth/OTP artifacts without cron jobs.
- Zero connection-pool management in serverless/Cloud Run environments; scales horizontally for document-keyed lookups (`orders/{id}`, `products/{id}`).
- Catalog reads scale cleanly when fronted by an in-memory LRU cache + HTTP `ETag` + `stale-while-revalidate` (`GET /api/catalog/products`), because the catalog size is bounded (~hundreds to low thousands of dental SKUs) relative to transactional order volume.

**Weaknesses / Risks**:
- No SQL `JOIN`, `GROUP BY`, `SUM()`, or partial/GIN attribute indexes; faceted catalog queries and admin reports must scan collections or load snapshots into server memory.
- Firestore transaction limit of 500 document writes per transaction and contention on hot variant/warehouse stock documents under flash-sale concurrency.
- No unique constraints outside document IDs (`idempotencyKey` requires a secondary query or sentinel doc inside a transaction).
- Dual-client model (browser SDK reading Firestore directly for user profile vs. Express backend using `firebase-admin`) requires maintaining `firestore.rules` alongside backend validation.

### Option B: Migrate Backend Persistence to PostgreSQL + Prisma (`STORAGE_DRIVER=postgres`)
**Strengths**:
- **ACID Transactions & Row-Level Locking**: `SELECT ... FOR UPDATE` or `UPDATE stock_levels SET reserved = reserved + $qty WHERE on_hand - reserved >= $qty` enforces atomic non-oversell stock checks at the database engine level without whole-document optimistic retries.
- **SQL Catalog Search, Faceting & Keyset/Cursor Pagination**: Indexed queries over price, brand, category hierarchy, and `JSONB` product attributes (`GIN` index), plus `pg_trgm` / normalized Persian text columns, eliminate loading the full catalog snapshot on every search/filter request once SKU count grows >10,000.
- **Native Constraints**: `UNIQUE(order_no)`, `UNIQUE(idempotency_key)`, `CHECK(on_hand >= reserved)`, and foreign-key integrity guaranteed regardless of caller.
- **Reporting & Ledger Integrity**: Direct SQL aggregations for GMV, VAT, margin, low-stock alerts, and payment reconciliation without downloading thousands of Firestore documents.

**Weaknesses / Risks**:
- **Infrastructure & Ops Overhead**: Requires provisioning and operating managed PostgreSQL (e.g., Cloud SQL Postgres), connection pooling (PgBouncer / Prisma Accelerate or `max` pool sizing for serverless instances), automated backups, and schema migrations (`prisma migrate deploy`) in CI/CD.
- **Firebase Auth Split**: User login remains on Firebase Authentication (or JWT verification via `firebase-admin`), while backend domain tables move to Postgres. Any frontend pages currently reading/writing Firestore directly (`src/context/*` profile/order listeners) must migrate to REST/JSON API endpoints (`/api/*`) first.
- **Migration Effort & Risk**: Requires dual-write/backfill verification across orders, payment ledger, warehouse stock, proformas, RFQs, and audit logs without downtime.

---

## 3. Comparison Matrix

| Dimension | Option A: Keep Firestore | Option B: PostgreSQL + Prisma |
|---|---|---|
| **Catalog Filtering & Facets (>10k SKUs)** | In-memory snapshot + LRU cache (memory-bound; fast while <10k SKUs) | SQL `WHERE` + `GROUP BY` / `JSONB` GIN + keyset cursor (scales to 100k+ SKUs) |
| **Inventory / FEFO Concurrency** | Optimistic concurrency (`runTransaction`); retry contention on hot SKUs | Pessimistic row locks (`FOR UPDATE`) & atomic conditional `UPDATE` |
| **Referential & Uniqueness Guarantees** | Application-enforced | DB-enforced (`FOREIGN KEY`, `UNIQUE`, `CHECK`) |
| **Ephemeral Auth / OTP TTL** | Built-in Firestore TTL (`ttlExpireAt` policy) | Scheduled `DELETE WHERE ttl_expire_at < NOW()` or Redis |
| **Operational Complexity** | Low (serverless, zero pool tuning) | Medium-High (Cloud SQL, migrations, pooling) |
| **Immediate Cost at Current Traffic** | Lower (free/pay-per-read tier with LRU caching) | Fixed baseline instance cost (unless scale-to-zero Cloud SQL Dev) |

---

## 4. Decision & Phased Recommendation

1. **Short/Medium Term (Implemented Now in Phase 8)**:
   Keep Firestore (`STORAGE_DRIVER=firestore`) as the production persistence engine while **eliminating `store.json` in production** (`persistenceMode: 'memory'`), moving OTP/sessions/RFQs/telemetry/engagement into `RepositoryBundle`, buffering high-frequency counters in memory, and caching `GET /api/catalog/products` behind a bounded LRU + `ETag` (`304`).
   At current catalog size (<5,000 SKUs), an in-memory LRU-cached query layer + Firestore TTL handles production read traffic with zero new infrastructure dependencies.

2. **Trigger Thresholds for Executing Option B (PostgreSQL + Prisma)**:
   Execute the migration when **any** of the following triggers is crossed:
   - Catalog exceeds **10,000 active SKUs** or **50,000 variants**, making full-catalog snapshot hydration and in-memory facet computation exceed target p95 memory/latency budgets.
   - Sustained concurrent checkout rate causes **>2% Firestore transaction contention retries** on hot `stockLevels` rows.
   - Complex B2B SQL reporting (multi-dimensional margin, aging batches, credit limit ledger) exceeds Firestore query capabilities.

---

## 5. Adapter Seam Architecture (Implemented in Phase 8)

All Express routes and domain services interact exclusively with `RepositoryBundle` (`server/repositories/interfaces.ts`), selected at startup by `createRepositories()` in `server/repositories/index.ts` based on `STORAGE_DRIVER`:

```
Express Routes & Services (auth, catalog, checkout, payments, inventory, rfq, seo, admin, importExport)
        │
        ▼
  RepositoryBundle (server/repositories/interfaces.ts)
    ├── orders: OrderRepository
    ├── payments: PaymentRepository
    ├── stock: StockRepository
    ├── returns: ReturnRepository
    ├── catalog: CatalogRepository
    ├── proformas: ProformaRepository
    ├── audit: AuditRepository
    ├── authSessions: AuthSessionRepository   <-- Phase 8 seam
    ├── rfqs: RfqRepository                   <-- Phase 8 seam
    ├── engagement: EngagementRepository      <-- Phase 8 seam
    └── runTransaction<T>(fn) / onCatalogChange(...)
        │
        ├── STORAGE_DRIVER=file       ──▶ createFileRepositories(store)       [dev / tests]
        ├── STORAGE_DRIVER=firestore  ──▶ createFirestoreRepositories(store)  [current prod]
        └── STORAGE_DRIVER=postgres   ──▶ createPrismaRepositories(prisma)    [future ADR target]
```

Adding PostgreSQL + Prisma requires **zero changes** to Express route handlers or business services (`orderService`, `paymentService`, `inventoryService`, `importExportService`), because transaction boundaries (`repos.runTransaction`) and catalog cache invalidation (`repos.onCatalogChange`) are encapsulated behind `RepositoryBundle`.

---

## 6. Concrete PostgreSQL + Prisma Schema Sketch

```prisma
// prisma/schema.prisma (Target Future Schema — Sketch Only)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Category {
  id          String    @id
  parentId    String?
  path        String
  depth       Int
  vertical    String
  slug        String    @unique
  nameFa      String
  nameEn      String
  isActive    Boolean   @default(true)
  sortOrder   Int       @default(0)
  data        Json
  updatedAt   DateTime  @updatedAt

  @@index([parentId])
  @@index([vertical, isActive])
}

model Brand {
  id                  String   @id
  slug                String   @unique
  nameFa              String
  nameEn              String
  countryCode         String
  countryFa           String
  isAuthorizedDealer  Boolean  @default(false)
  isActive            Boolean  @default(true)
  data                Json
  updatedAt           DateTime @updatedAt
}

model Product {
  id                 String           @id
  sku                String           @unique
  slug               String           @unique
  vertical           String
  kind               String
  status             String
  pricingMode        String
  brandId            String
  primaryCategoryId  String
  categoryIds        String[]
  titleFa            String
  titleEn            String
  searchNormalized   String           // Pre-normalized Persian/Arabic text for pg_trgm
  originCountryCode  String
  originCountryFa    String
  soldCount          Int              @default(0)
  minPriceCached     BigInt?
  attributes         Json             // GIN-indexed JSONB for dynamic attribute facets
  data               Json
  publishedAt        DateTime
  updatedAt          DateTime         @updatedAt
  variants           ProductVariant[]

  @@index([status, vertical, soldCount(sort: Desc)])
  @@index([brandId])
  @@index([primaryCategoryId])
}

model ProductVariant {
  id                String       @id
  productId         String
  product           Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  sku               String       @unique
  basePrice         BigInt?
  stockOnHand       Int          @default(0)
  reserved          Int          @default(0)
  lowStockThreshold Int          @default(5)
  isActive          Boolean      @default(true)
  data              Json
  stockLevels       StockLevel[]
  stockBatches      StockBatch[]

  @@index([productId])
}

model Warehouse {
  id          String       @id
  code        String       @unique
  nameFa      String
  isDefault   Boolean      @default(false)
  isActive    Boolean      @default(true)
  data        Json
  stockLevels StockLevel[]
  batches     StockBatch[]
}

model StockLevel {
  id                String         @id // "${warehouseId}__${variantId}"
  productId         String
  variantId         String
  variant           ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  warehouseId       String
  warehouse         Warehouse      @relation(fields: [warehouseId], references: [id])
  onHand            Int            @default(0)
  reserved          Int            @default(0)
  lowStockThreshold Int            @default(5)
  updatedAt         DateTime       @updatedAt

  @@unique([warehouseId, variantId])
  @@index([productId])
}

model StockBatch {
  id          String         @id
  productId   String
  variantId   String
  variant     ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  warehouseId String
  warehouse   Warehouse      @relation(fields: [warehouseId], references: [id])
  batchNo     String
  expiryDate  DateTime
  qty         Int            @default(0)
  reserved    Int            @default(0)
  condition   String         @default("resellable")
  specialPrice BigInt?
  updatedAt   DateTime       @updatedAt

  @@index([variantId, warehouseId, expiryDate])
}

model StockMovement {
  id          String   @id
  productId   String
  variantId   String
  warehouseId String
  orderId     String?
  returnId    String?
  delta       Int
  type        String
  reason      String
  actorEmail  String
  createdAt   DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([variantId, warehouseId])
}

model Order {
  id             String   @id
  orderNo        String   @unique
  idempotencyKey String?  @unique
  userId         String
  source         String
  customerMobile String
  status         String
  paymentStatus  String
  grandTotal     BigInt
  riskScore      Int?
  riskLevel      String?
  expiresAt      DateTime?
  data           Json
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, createdAt(sort: Desc)])
  @@index([customerMobile, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
  @@index([status, paymentStatus, expiresAt])
}

model PaymentSession {
  authority      String    @id
  orderId        String
  orderNo        String
  amount         BigInt
  gateway        String
  idempotencyKey String    @unique
  status         String
  verifiedAt     DateTime?
  expiresAt      DateTime
  createdAt      DateTime  @default(now())
  data           Json

  @@index([orderId])
}

model PaymentLedgerEntry {
  id        String   @id
  orderId   String
  amount    BigInt
  gateway   String
  status    String
  createdAt DateTime @default(now())
  data      Json

  @@index([orderId])
}

model OtpChallenge {
  mobile      String   @id
  codeHash    String
  attempts    Int      @default(0)
  lastSentAt  BigInt
  expiresAt   BigInt
  ttlExpireAt DateTime

  @@index([ttlExpireAt])
}

model MobileSession {
  tokenHash   String   @id
  mobile      String
  displayName String?
  expiresAt   BigInt
  ttlExpireAt DateTime
  createdAt   DateTime @default(now())

  @@index([ttlExpireAt])
}

model AuditLog {
  id         String   @id
  actorId    String?
  action     String
  entityType String
  entityId   String
  summary    String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([entityType, entityId])
}
```

---

## 7. Zero-Downtime Migration Sketch (When Triggered)

1. **Step 1 — Prisma Adapter (`server/repositories/prismaRepositories.ts`)**:
   Implement `RepositoryBundle` using `prisma.$transaction(async (tx) => ...)` stored via `AsyncLocalStorage` (matching `firestoreRepositories.ts`). Replace in-memory `queryCatalogProducts` behind an optional `CatalogRepository.searchProducts(...)` method so SQL handles filtering/faceting directly.
2. **Step 2 — Backfill & Idempotency Script (`scripts/migrate-firestore-to-postgres.ts`)**:
   Stream Firestore collections (`categories`, `brands`, `products`, `warehouses`, `stockLevels`, `stockBatches`, `orders`, `paymentSessions`, `paymentLedger`, `proformas`, `returns`, `rfqRequests`, `auditLogs`) in batches of 500 and `upsert` into Postgres inside transactions; verify row counts and aggregate totals (`SUM(grandTotal)`, `SUM(stockLevels.onHand)`).
3. **Step 3 — Dual-Write Verification Window**:
   Wrap `RepositoryBundle` in a temporary `DualWriteRepository` (primary: Firestore, shadow async/checked write: Postgres) for 48 hours in staging/production, comparing read parity and latency metrics (`docs/PERFORMANCE.md`) before flipping `STORAGE_DRIVER=postgres`.
4. **Step 4 — Cutover & Cleanup**:
   Switch `STORAGE_DRIVER=postgres`, keep Firestore in read-only backup for 14 days, and schedule a Postgres `DELETE FROM otp_challenges WHERE ttl_expire_at < NOW()` (plus `mobile_sessions`) cleanup job on `setInterval(...).unref()`.
