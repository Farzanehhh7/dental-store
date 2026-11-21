# DentalMarket Threat Model & Security Architecture (STRIDE)

## 1. System Overview & Trust Boundaries

DentalMarket ("dental-store") is a Persian/RTL B2C + B2B dental, medical, and laboratory equipment e-commerce platform consisting of:

1. **Untrusted Browser Client (SPA)**: React 18 + Vite application running in user/admin browsers. Holds only Firebase ID tokens (`Authorization: Bearer ...`), `HttpOnly` mobile session cookies (`dm_mobile_session`), or guest signed order tokens (`ordtok_...`).
2. **Authoritative Express 5 Backend (`server.ts`)**: Single trust boundary for pricing calculation, order state transitions, inventory reservations/FEFO batches, payments/webhooks, OTP verification, B2B group enforcement, hardened uploads, and telemetry.
3. **Persistence Layer (`server/repositories/*`)**: Pluggable `STORAGE_DRIVER` (`file` or `firestore` via `firebase-admin`).
4. **Firebase Auth & Cloud Firestore**: Direct client access strictly scoped via `firestore.rules` (read-only on orders, returns, stockLevels, stockBatches, stockMovements, warehouses; owner/admin scoped elsewhere; private `productCosts` locked to `super_admin`/`admin`/`accountant`; `notFoundLogs`, `newsletterSubscribers`, and `stockNotifications` client writes disabled).
5. **External Gateways**: Payment providers (ZarinPal / IDPay behind `IPaymentGateway`) and SMS provider (Kavenegar OTP lookup).

---

## 2. Critical Assets

| Asset | Confidentiality / Integrity Requirement | Authoritative Control |
| --- | --- | --- |
| Order totals, discounts, VAT, & state | High Integrity (no client tampering) | Express `OrderService` + `calculateAuthoritativeCheckout` |
| Payment ledger & verified statuses | High Integrity & Auditability | Express `PaymentService` + HMAC callback/webhook checks |
| Stock levels & FEFO batches | High Integrity (no oversell) | Express `StockRepository` atomic transactions |
| Supplier cost prices (`productCosts`) | Confidential (finance + admin only) | `firestore.rules` (`super_admin`, `admin`, `accountant`) |
| `SESSION_SECRET` & Webhook HMAC secret | Critical Secret | Server env only; Zod fail-fast in production (>= 32 chars) |
| Customer PII & B2B license documents | Confidential | Scoped reads + ownership checks on `/api/files/download/:id` |
| Audit log trail (`auditLogs`) | Append-only Integrity | Server `AuditRepository.append` + immutable `firestore.rules` |

---

## 3. STRIDE Threat Matrix & Mitigations

| Category | Attack Vector / Threat | Mitigation Implemented | Verification |
| --- | --- | --- | --- |
| **Spoofing** | Forged Firebase admin identity via email match or forged Bearer token | `verifyFirebaseAdmin` validates `email_verified` ID token via Firebase Identity Toolkit and checks `admins/{uid}` role document; zero email fallback | `tests/server.test.ts`, `tests/phase4-security.test.ts` |
| **Spoofing** | OTP brute-force or SMS bombing on `/api/auth/otp/*` | IP rate limiting + per-phone resend cooldown (`OTP_RESEND_COOLDOWN_SEC`), per-phone 15-min rolling window (`OTP_PHONE_WINDOW_MAX`), constant-time HMAC hash compare (`crypto.timingSafeEqual`), 5-attempt persistent lockout blocking both `/verify` and `/send` (`429` + `Retry-After`), short 180s expiry, no OTPs logged | `tests/phase4-security.test.ts` |
| **Spoofing** | Weak/missing `SESSION_SECRET` allowing forged mobile sessions or `ordtok_` tokens | Zod startup validation (`server/config/env.ts`) fails fast if `NODE_ENV=production` and `SESSION_SECRET` < 32 chars; ephemeral CSPRNG secret restricted strictly to non-prod | `tests/phase4-security.test.ts` |
| **Tampering** | Client sends manipulated `grandTotal`, discounts, or direct Firestore order write | `firestore.rules` sets `allow create, update, delete: if false` on `orders`; `OrderService` recomputes totals server-side and rejects any client mismatch (`400`) | `tests/phase0-regressions.test.ts`, `tests/rules/firestore.rules.test.ts` |
| **Tampering** | Tampered payment callback amount, orderId, status, or replayed webhook | `PaymentService.verifyOrCallback` validates `orderId`, `amount`, and `sandboxTokenHash` atomically; webhook verifies HMAC signature (`X-Webhook-Signature`) and event replay map | `tests/phase2-payments.test.ts` |
| **Tampering** | Arbitrary JSON schema pollution on `/api/seo/sync` or oversized body DoS | Strict `.strict()` Zod schemas per catalog entity (`seoSyncBodySchema`), array caps, global `1mb` JSON body cap, `2mb` cap on `/api/seo/sync` | `tests/phase4-security.test.ts`, `tests/phase0-regressions.test.ts` |
| **Tampering** | Public log poisoning / spam via `notFoundLogs`, `newsletterSubscribers`, or `stockNotifications` | Client Firestore `create`/`update` disabled (`if false;`); routed through rate-limited Zod-validated `/api/telemetry/404` (path-normalized, aggregated), `/api/newsletter/subscribe`, and `/api/stock-notifications` | `tests/phase4-security.test.ts`, `tests/rules/firestore.rules.test.ts` |
| **Tampering** | Polyglot / malicious SVG/HTML/EXE upload or path traversal on `/api/files/*` | Extension allowlist (`.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`), magic-byte MIME sniffing matching declared extension, `UPLOAD_MAX_BYTES` limit, CSPRNG UUID filenames, `path.resolve` + `path.sep` confinement, `X-Content-Type-Options: nosniff`, `https:`/relative redirect check on `/api/files/certificate` | `tests/phase4-security.test.ts` |
| **Repudiation** | Unattributed admin price, order, inventory, warehouse, B2B group, or RFQ edits | Every server admin mutation appends an audit record (`actorId`, `actorEmail`, `action`, `entityType`, `entityId`, `before`/`after`) accessible only to authorized roles via `GET /api/admin/audit-logs`; Firestore `auditLogs` forbids update/delete | `tests/phase4-security.test.ts`, `tests/rules/firestore.rules.test.ts` |
| **Information Disclosure** | Unauthorized read of wholesale margins (`productCosts`), audit logs, drafts, or B2B docs | `firestore.rules` locks `productCosts` to `['super_admin', 'admin', 'accountant']`, tightens `allow get` on inactive/draft docs, and enforces owner/admin authorization on `/api/files/download/:fileId` for `b2b_doc` | `tests/rules/firestore.rules.test.ts`, `tests/phase4-security.test.ts` |
| **Denial of Service** | Oversized JSON / upload payloads or endpoint flooding | Tiered `express-rate-limit` limiters (OTP, orders/payments, telemetry, global API), tight JSON caps (`1mb`/`2mb`/`8mb`), clean JSON `413` responses | `server.ts`, `tests/phase4-security.test.ts` |
| **Elevation of Privilege** | Admin with limited role (`content`, `warehouse`, `support`, `accountant`) calling privileged endpoints, or client B2B self-upgrade | Centralized capability permission matrix in `server/lib/rbac.ts` enforced on every `/api/admin/*` route (`verifyFirebaseAdmin(req, permission)`); `firestore.rules` blocks client changes to `customerGroup`, `b2bStatus`, `isBlocked`, and `/admins/{uid}` | `tests/phase4-security.test.ts`, `tests/rules/firestore.rules.test.ts` |

---

## 4. Security Headers & Cookie Policy

- **CSP (`helmet`)**: Restrictive `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'` in production.
- **HSTS**: Enabled in production (`max-age=31536000; includeSubDomains`).
- **Referrer-Policy**: `strict-origin-when-cross-origin`.
- **Permissions-Policy**: `camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()`.
- **Session Cookies**: `dm_mobile_session` issued with `HttpOnly; SameSite=Lax; Path=/` and `Secure` automatically when `NODE_ENV=production` or HTTPS proxy (`req.secure`).

---

## 5. Dependency Audit Summary (`bun audit`)

Audited against `bun.lock` (`bun audit`):

| Advisory Package | Severity | Path | Risk Assessment & Mitigation |
| --- | --- | --- | --- |
| `@grpc/grpc-js` (`< 1.13.6`) | High | Transitive via `firebase`, `firebase-admin`, `firebase-tools` | Primarily affects gRPC HTTP/2 allocation under untrusted server/client gRPC streams. Not exposed directly to public internet; Express HTTP/REST terminates public traffic. Upgrade with upstream `firebase-admin` / `firebase` minor releases. |
| `react-router` (`6.30.6`) | Moderate | `react-router-dom@^6.26.2` | Advisories cover SSR/framework hydration, external `<Link>` open redirects, and X-Forwarded-Host handling in framework mode. App uses static SPA CSR (`<BrowserRouter>`), relative internal route paths only, and server redirects use validated internal rules. |
| `@opentelemetry/core` / `@tootallnate/once` | Moderate | Transitive via `firebase-admin` / `firebase-tools` (`jsdom` dev) | Dev/tooling or SDK internal dependency with no user-controlled HTTP agent input. |
| `glob` / `minimatch` / `uuid` | Moderate | Transitive CLI & dev tooling (`eslint`, `playwright`, `tsx`, `firebase-tools`) | No CLI glob patterns or insecure PRNG calls from app code (`server/` uses `node:crypto` CSPRNG). |

---

## 6. Residual Risks & Operational Checklist

1. Ensure `SESSION_SECRET` (minimum 32 high-entropy bytes) and `PAYMENT_WEBHOOK_SECRET` are injected via secret manager in production.
2. When `TRUST_PROXY` is enabled behind a load balancer / CDN, configure exact hop count (e.g. `1`) so rate limiting keys off the true edge IP.
3. Run `npm run test:rules` in CI environments with Java JDK installed to execute Firebase Emulator rules verification alongside `npm run security:check`.
4. Rotate `SMS_API_KEY`, `ZARINPAL_MERCHANT_ID`, and `IDPAY_API_KEY` periodically and keep `PAYMENT_MODE=live` & `SMS_PROVIDER=live` in production (`ALLOW_SANDBOX_IN_PROD=false`).
