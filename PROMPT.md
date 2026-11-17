# Master Prompt: Specialized Dental Equipment & Supplies E-Commerce Store

> English version. The **storefront and admin dashboard UI must be in Persian (Farsi, RTL)**. All code, identifiers, database names, comments, commits and documentation are in English.
> Copy everything between `BEGIN PROMPT` and `END PROMPT`. Put the companion file `DATA_AND_ADMIN_SPEC.md` in the repo at `docs/DATA_AND_ADMIN_SPEC.md` before starting.
> Informed by an analysis of the home pages of three competitors (avadental, dandal, dandanet).

---

## ▼▼▼ BEGIN PROMPT ▼▼▼

You are a senior software architect and full-stack engineer. Build a **specialized online store for dental equipment and supplies** at production quality, not a demo. Design for large data (50,000+ products, 300+ categories, 500+ brands) even if day one has ~1,000 products.

## 0. Language and source of truth

- **User-facing language: Persian (fa-IR), fully RTL**, for both the storefront and the admin dashboard. Dates shown in the Jalali (Shamsi) calendar, numbers shown with Persian digits, currency shown in Toman (switchable to Rial).
- **Everything technical is English:** code, identifiers, table/column names, API routes, comments, commit messages, README, docs.
- Put all UI strings in i18n message files (`messages/fa.json`, with `en.json` stubbed). No hardcoded UI strings in components. Use ICU plural/number formatting.
- **Read `docs/DATA_AND_ADMIN_SPEC.md` first.** It is the source of truth for the category tree, attribute dictionary, database schema (tables, columns, relations, indexes), search index, state machines, and the full admin dashboard (modules, tables, charts, reports, permissions). If this prompt and the spec disagree, the spec wins. Log every deviation and assumption in `ASSUMPTIONS.md`.

## 1. Governing principles (they override everything else)

1. **No hardcoded data in the UI.** Stock status, ratings, review counts, discount percentages, timers and badges all come from the database.
2. **No fake urgency or fake trust.** A countdown exists only for a real, stored campaign end date. A struck-through price appears only for a real, time-bound, recorded discount. Ratings and reviews are real only.
3. **Price always has an explicit state:** fixed, range (variants), "call for price", out of stock, or coming soon. **Never show "0 Toman"** or meaningless ranges like "0 – X".
4. **Variants are variants, not separate products.** Pack sizes ("single / pack of 5 / 10 boxes"), unit counts, shades and sizes all belong to one product with variants.
5. **Everything that changes with the business is editable from the admin dashboard, not code:** categories, attributes, customer groups, campaigns, menus, banners, home sections.
6. **One system per job:** one cart, one slider library, one menu system, one timer implementation. No duplicate dependencies.
7. Server-authoritative pricing and stock: totals are always computed on the server, never trusted from the client.
8. **SEO-first, not SEO-later.** Every page type is built on shared SEO primitives (metadata, canonical, robots rules, JSON-LD builders, breadcrumbs, URL registry) that are delivered in Stage 1, **before any page is built**. The complete rules are in §7 and in `docs/DATA_AND_ADMIN_SPEC.md` §17. No page ships without passing the automated SEO gates.
9. If something is truly ambiguous, ask at most **5 key questions** before starting. Otherwise proceed and record assumptions.

## 2. Context

- Market: Iran. Language: Persian (RTL). Currency: Toman (stored as integers, no floats). Calendar: Jalali in UI, UTC in the database.
- Customers: dentists, clinics, dental labs, students, sales agents, bulk buyers.
- Business model: B2C + B2B at the same time: group pricing, proforma invoices, wholesale, cash / installment / cheque requests (request and tracking only, not a full financial system).
- Two product behaviors:
  - **Consumables:** repeat purchases, bulk, price-sensitive, with batch and expiry dates.
  - **Capital equipment:** expensive, consultative, with warranty, installation and training, often quoted via proforma.
- Extensibility: model a `vertical` field (dental / medical / lab) so other verticals can be added later, but **version 1 ships dental only**, and the home page shows no non-dental goods.
- Hosting assumption: servers inside Iran (payment gateways, eNamad trust seal, SMS). Every external service sits behind an abstraction and must not be required for the system to boot.

## 3. Tech stack

- Next.js (latest stable, App Router) + TypeScript (strict) + Tailwind CSS (logical properties / RTL-first, no Bootstrap/Foundation) + shadcn/ui
- PostgreSQL + Prisma (or Drizzle, with a stated reason)
- Redis (cache, sessions, rate limiting) + BullMQ (queues)
- Meilisearch (or Typesense, with justification) for search and faceted filtering, kept in sync idempotently from the database
- S3-compatible storage (MinIO); automatic image variants in WebP/AVIF
- Auth: SMS OTP + email/password; SMS provider abstraction (swappable among Iranian providers)
- Payments: gateway abstraction with adapters for Zarinpal and IDPay (extensible); server-side Verify, idempotency, safe callback handling
- Jalali date library (e.g. date-fns-jalali or dayjs jalali); server-side conversion is mandatory
- Admin UI: TanStack Table for data tables, ECharts or Recharts for charts (both must work correctly in RTL)
- Docker + docker-compose; CI (lint, typecheck, tests, build)
- Observability: structured logs, error tracking, health checks
- Clean, typed, testable code; complete `.env.example`; complete README

## 4. Data model (design first, then code)

Before writing application code, deliver: the complete Prisma schema, a Mermaid ERD, the index rationale, and the API list. **Implement exactly the schema in `docs/DATA_AND_ADMIN_SPEC.md`**, which covers:

- **Categories:** unlimited-depth tree (parent_id + materialized path), unique slug, `vertical`, SEO fields, attribute sets with inheritance. Seed taxonomy: **specialty × (materials / instruments / equipment)** plus standalone groups. The seed is only a starting point; admins can restructure freely.
- **Brands:** Persian/English names, country, logo, authorized-dealer status, dedicated page.
- **Products:** Persian + English titles, SKU, **IMED code**, GTIN, brand, country of origin, multiple categories with one primary, rich description, media, files (catalog, manual, CE/ISO/FDA, ministry-of-health licence), status (active/draft/out of stock/coming soon/archived), kind (consumable / capital equipment), pricing mode (fixed / range / call-for-price), warranty, installation and training, tags, related / alternative / complementary products.
- **Dynamic attribute system:** per-category attribute sets (text, number with unit, select, multi-select, boolean), each flagged for spec table, filter, and comparison.
- **Variants:** option combinations with own SKU, barcode, price, stock, weight, image.
- **Batches and expiry** (consumables): batch, production/expiry dates, FEFO allocation, an automatic "near expiry" badge with a configurable threshold, optional special price per batch.
- **Pricing:** base price, time-bound discount, tiered quantity pricing, per-customer-group prices, contract price per customer, and **price history** (so a discount can always be proven real).
- **Campaigns:** the single source for timers and discount badges.
- **Inventory:** multi-warehouse, reservations, thresholds, pre-orders, back-in-stock notifications, **unavailable-item requests**.
- **Customers:** roles, professional profile (medical council number, clinic, specialty, documents), multiple addresses, **B2B verification** and customer group.
- **Agents / branches** (province, city, address, map, hours, brands), **bundles / starter packs** (e.g. "new clinic setup").
- **Orders, payments, shipments, invoices, proforma invoices, returns, coupons, payment plans (installment/cheque requests), reviews, Q&A, tickets, wishlists, compare lists, blog, pages, banners, menus, redirects, consultation requests, audit log, import/export jobs.**
- Use integers for money. Index every searchable/filterable/join column and explain each index.

## 5. Storefront (all UI in Persian, RTL)

1. **Home page:** banners, popular categories, most viewed, newest, best sellers, special offers (real timer), brands, clinic starter packs, provincial agents, blog, trust section (eNamad, licences, IMED code, address, phone, working hours). Dental content only.
2. **Mega menu:** multi-level, fast, keyboard-accessible, mobile-friendly, generated from the category tree (not hand-written HTML).
3. **Category page:** list, sorting (newest, price, best selling, discount), **dynamic multi-select filters** (brand, country, price range, availability, category-specific attributes), faceted counts, filter state in the URL, breadcrumbs, short useful SEO text (not a dozen long text blocks).
4. **Search:** instant autocomplete; typo tolerance; Persian/Arabic normalization (ی/ي, ک/ك, digits, tatweel, ZWNJ); search by SKU / IMED / brand / Persian and English names; admin-managed synonyms; "can't find it? request this item".
5. **Product card:** fixed-size image, Persian name, English name, brand, country of origin, price (or range / "call for price"), discount percent only for real discounts, real stock status, badges (new, near expiry), quick view, wishlist, compare, and the right CTA ("Add to cart" without variants, "Choose options" with variants).
6. **Product page:** zoomable gallery and video, variant selector (updates price/stock/image), group price for logged-in users, tiered price table, stock and expiry (consumables), warranty and installation info, spec table, **downloads for catalog and certificates (CE/ISO/FDA/IMED)**, "Request proforma / consultation" button (especially for capital equipment), back-in-stock notification, related/complementary/alternative products, reviews and Q&A, FAQ, Schema.org.
7. **Compare (up to 4), wishlist, recently viewed.**
8. **Cart and checkout:** persistent cart (guest too), coupons, shipping calculation, guest and member checkout, online payment, **B2B credit / installment / cheque request**, "pay a pending order" from the account area.
9. **Customer account:** orders and tracking, invoices, proformas, addresses, tickets, wishlist, **reorder**, professional documents and B2B verification status.
10. **Other pages:** brands (A–Z) and brand pages, provincial agents/branches with map, clinic starter packs, blog/magazine, return policy, warranty, licences, about/contact, capital-equipment consultation form.

## 6. Admin dashboard

Build the full dashboard defined in `docs/DATA_AND_ADMIN_SPEC.md` (information architecture, per-module list tables with columns/filters/actions, detail pages, KPI cards, charts, reports, RBAC matrix, notifications, settings). Highlights:

- **Home dashboard:** KPI cards, charts (sales trend, orders by status, top products/categories/brands, customer growth, funnel, stock health, expiry risk, payments), and action tables (recent orders, low stock, near expiry, pending proformas, pending B2B approvals, open tickets, unavailable-item requests, failed payments, running import jobs).
- **Every list is a real data table:** server-side pagination/sort/filter, column chooser, saved filters, bulk actions, Excel/CSV export of the current filter, row actions, empty/loading/error states.
- **Bulk import/export** (products, variants, prices, stock, categories, brands) with templates, validation, row-level error preview, background processing, resume/cancel, result report.
- **Bulk edit** (price, stock, status, category, tags).
- Categories as a drag-and-drop tree; attribute sets editable per category.
- Campaigns, group prices, coupons; proforma and invoice PDF (Persian, RTL, proper font).
- RBAC (admin, warehouse, content manager, support, accountant, sales manager) enforced server-side, with a permission-aware UI.
- Global search (Cmd/Ctrl+K), real-time notifications, audit log of every sensitive change, queue monitor, search-index tools, backups and health.

## 7. SEO and discoverability (first-class requirement)

Full details, matrices and test list: `docs/DATA_AND_ADMIN_SPEC.md` §17. Summary of what must be true:

**Crawlability and indexation**
- Every indexable page is server-rendered (SSR/ISR): H1, price, availability, spec table, description, breadcrumbs and internal links are in the initial HTML (verify with JavaScript disabled). All links are real `<a href>`.
- One host, HTTPS only, one URL form (lower-case Latin, no trailing slash, no duplicate paths); everything else 301s in a single hop. Products use flat, stable URLs (`/product/{slug}`) so category changes never break them.
- **Indexation matrix (spec §17.2):** home, categories, brands, products, blog and pages are indexable; internal search, cart, checkout, account, compare, wishlist, public proforma links, sort/filter parameter URLs and admin are not. Only whitelisted facet combinations (category + brand) get clean, indexable URLs.
- **Pagination:** crawlable `?page=N` links (infinite scroll only as an enhancement), self-canonical on each page, page 1 canonical to the base URL.
- **Product lifecycle:** temporary out of stock stays 200 with alternatives; discontinued → 301 to the replacement product (or the category after a grace period); deleted → 410; drafts → 404. No soft 404s.
- `robots.txt` blocks only private/transactional paths and never CSS/JS/images; auto-split sitemap index with accurate `lastmod`, image sitemaps, only 200 + canonical + indexable URLs. Staging is `noindex` and password-protected.
- Make sure the Iran-hosted server and WAF do **not** geo-block or rate-limit Googlebot/Bingbot; verify with Search Console live URL tests.

**On-page**
- **Exactly one H1 per page**, built from a real keyword (not "Site categories"), logical H2/H3. **No kashida/tatweel (ـ)** in headings or metadata.
- Unique `title` and meta description per URL from templates with fallbacks (spec §17.5); no technical junk in any meta/OG text. `og:image` is absolute (generated 1200×630), `og:url` = canonical, `og:locale` = `fa_IR`. Add automated tests.
- Descriptive image alt text from product names, descriptive file names, no junk `title` attributes, `width`/`height` on every image.
- Visible breadcrumbs + `BreadcrumbList`; internal linking rules (category → subcategories/top brands/top products; product → category/brand/related; blog → products) and an orphan-page check.
- Content quality: product descriptions are unique (similarity warning against manufacturer text), categories carry one short useful intro (not a dozen text blocks), brand pages have unique intros.
- **E-E-A-T (dental is health-adjacent):** author bios with credentials, an optional "reviewed by (dentist)" field on educational posts, real About/Contact pages with address, licences and policies, visible `dateModified`.

**Structured data (generated from the same data as the visible page, never hardcoded)**
- Home: `Organization` + `WebSite` (**not `Article`**); `sameAs` only valid URLs. A `SearchAction` is optional and not relied on for any rich result.
- Category: `BreadcrumbList` + `CollectionPage`/`ItemList`.
- Product: `Product` with `brand`, `sku`, `gtin` when present, `additionalProperty` from spec attributes, `Offer` (or `AggregateOffer` for price ranges). **Omit `offers` for "call for price".** `priceValidUntil` only for a real campaign. **`aggregateRating`/`review` only when approved real reviews exist and are visible.** `priceCurrency` is **`IRR`** (Toman × 10); keep Toman in the UI.
- Blog: `BlogPosting` with author/publisher/dates. Agents/branches: `LocalBusiness`. `FAQPage` only for FAQs that are visible on the page (do not expect a rich result from it).
- Validate JSON-LD in CI.

**Performance (Core Web Vitals, field data)**
- p75 targets: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**, measured with real-user monitoring, not only Lighthouse. TTFB from outside Iran is tracked.

**Analytics and webmaster tooling**
- GA4 (or Matomo) with full ecommerce events; **no Universal Analytics (UA-)**. Search Console and Bing Webmaster verification slots, IndexNow support for Bing, and an optional price-comparison feed endpoint (e.g. Torob/Emalls style) that exposes only real in-stock prices.

**Gates:** the automated SEO test suite in spec §17.12 runs in CI and blocks merges.

## 8. Performance and scale

- Targets (p75 field data via RUM): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; mobile Lighthouse > 90 in CI as a regression guard.
- **Every image has width/height (or aspect-ratio)**; lazy-load below the fold; `priority` for the hero; modern formats.
- JS budget: no duplicate libraries (slider, timer, menu), code-splitting, no jQuery.
- Self-hosted, subsetted Persian font (Vazirmatn or IRANYekan) with `font-display: swap`; only needed weights.
- Multi-layer cache (Redis, CDN-ready), cursor-based pagination, cached facets.
- Search/filter served only by the search engine, not heavy SQL.
- Queues for heavy work: import, email, SMS, indexing, image processing, PDF.
- Seeders: 2,000 products (with variants, batches, realistic dental attributes), 100 categories, 80 brands, campaigns, customer groups; plus a load-test seeder for 50,000 products.

## 9. Security and compliance

- Server-side Zod validation on every endpoint; CSRF/XSS/SQLi protection; HTML sanitization.
- Rate limiting on OTP, login, search and import; OTP abuse protection.
- argon2 password hashing, secure HttpOnly sessions, server-side RBAC, ownership checks (IDOR).
- Secure uploads (real file type, size, random names); private storage for B2B documents.
- Payment safety: server-side Verify, no double-pay, never trust a callback without Verify.
- Privacy: minimal data, account deletion/anonymization, automated DB backups and a tested restore.
- Display legally required items correctly (eNamad, return policy, privacy policy, IMED code, licences). **Make no invented legal claims; flag anything needing legal review in `ASSUMPTIONS.md`.**

## 10. UI/UX and accessibility

- Modern, clean, medical look (blue / white / teal), RTL-first, optional dark mode.
- Mobile-first with a bottom navigation bar (search, categories, cart, account).
- **Never disable user zoom** (no `user-scalable=no` or `maximum-scale=1`).
- WCAG 2.2 AA: contrast, keyboard navigation, ARIA, visible focus, alt text, labels.
- Skeleton loading, clear empty and error states, subtle animation respecting `prefers-reduced-motion`.
- **No dead links or unfinished sections:** social links only when a real URL is set, newsletter only with a working form, dynamic copyright year.

## 11. Working method and delivery (very important)

Work **stage by stage and wait for my approval after each stage:**

- **Stage 0:** architecture, folder structure, full ERD, Prisma schema, index rationale, API list, `ASSUMPTIONS.md`
- **Stage 1:** project setup, Docker, CI, auth (OTP), RBAC, abstractions (payments, SMS, storage), **and the SEO foundation**: URL scheme and `url_registry`, metadata/canonical/robots helpers, JSON-LD builders, breadcrumbs, redirect middleware (301/410), custom 404, `robots.txt`, sitemap generator, host/HTTPS canonicalization, and the SEO CI gates (§17.12). Show the SEO tests passing on a sample template before moving on
- **Stage 2:** admin: categories, brands, attributes, products, variants, batches/expiry, pricing, campaigns
- **Stage 3:** bulk import/export, seeders, search sync and index
- **Stage 4:** admin dashboard home (KPIs, charts, action tables) and reports
- **Stage 5:** storefront: home, menu, category + filters, search, product card/page, compare, wishlist
- **Stage 6:** cart, checkout, payment, proforma, credit/installment requests, customer account, agents, starter packs
- **Stage 7:** blog, SEO/Schema, analytics, performance, full test suite, docs and deployment guide

In **every stage:**
- Provide complete, runnable code: no pseudo-code, no "rest is similar".
- Give the exact path of every file, run commands, and how to test.
- Write and run unit and integration tests for sensitive logic (pricing, stock, payments, import).
- End with an explicit list of unfinished work, assumptions and risks; update `ASSUMPTIONS.md`.
- If you did not run or test something, say so plainly. Never claim "it works" without running it.

## 12. Acceptance criteria

- Filtering inside a 10,000-product category responds in < 300 ms (P95, on the load-test seed).
- A new category with new attributes can be added from the admin only, with no code change.
- Importing 5,000 products from Excel never freezes the dashboard and gives a row-level error report.
- No product ever shows "0 Toman"; no badge/star/timer is hardcoded (prove with grep + automated tests).
- Each page has exactly one H1; `og:description` never contains code; JSON-LD validates and matches the visible price/availability.
- All SEO gates in spec §17.12 pass in CI; sitemap contains only 200, canonical, indexable URLs; no redirect chains longer than one hop; real 404/410 status codes.
- Indexable pages render their full content with JavaScript disabled.
- Field Core Web Vitals (p75): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- A product with variants never appears as several separate products.
- Mobile Lighthouse > 90 and CLS < 0.1 on home, category and product pages.
- All main pages are mobile-friendly and RTL with no visual breakage; user zoom works.
- Every admin list supports server-side pagination, sorting, filtering, column chooser, and export.
- Every admin chart and table in the spec exists and is backed by real queries on seeded data.
- All tests green in CI; the project starts with a single `docker compose up`.

## 13. "Do NOT" list (known competitor mistakes)

- ✗ Showing "0 Toman" or meaningless ranges like "0 – X"
- ✗ Hardcoded "in stock" labels and five-star ratings on every card
- ✗ A countdown timer to a far-off or fake date
- ✗ A permanent 50% discount over a fabricated "original" price
- ✗ Storing pack sizes / units of one product as separate products
- ✗ `Article` instead of `Organization`/`WebSite` schema on the home page
- ✗ Meta/OG descriptions filled with technical text or code
- ✗ Duplicate or generic H1 ("Site categories"), or no H2 at all
- ✗ Kashida/tatweel in headings
- ✗ Several slider/menu/cart/timer libraries at once
- ✗ Universal Analytics (UA-)
- ✗ Locking mobile zoom
- ✗ Images without dimensions or meaningful alt text
- ✗ `#` links, a newsletter with no form, a stale copyright year
- ✗ Mixing unrelated goods (lab/medical) into the dental home page feed
- ✗ Indexable internal search results, sort/filter parameter URLs, or infinite scroll without crawlable links
- ✗ Soft 404s (200 status on "not found"), redirect chains/loops, or discontinued products answering 200 forever
- ✗ `aggregateRating` without real visible reviews, or FAQ/Offer schema that does not match visible content
- ✗ Client-only rendering of H1, price, spec table or product links
- ✗ A `robots.txt` that blocks CSS/JS/images, or geo-blocking search-engine crawlers
- ✗ Copying manufacturer descriptions verbatim across hundreds of products

## ▲▲▲ END PROMPT ▲▲▲

---

## Usage notes

1. **Tool:** use an agentic coding tool (Claude Code, Cursor) in an empty repo. Save this file as `PROMPT.md` and the companion as `docs/DATA_AND_ADMIN_SPEC.md`.
2. **Decide before starting:** (a) really 50,000 products, or ~1,000–5,000? If smaller, defer Meilisearch and filter with Postgres first. (b) Do you need installment/cheque requests from day one? (c) Agents and starter packs now or later?
3. **Fast MVP:** do stages 0–2, then stages 5–6 with simple search; leave stage 3 and 4 for later.
4. **Other stack (WordPress/WooCommerce, Laravel):** change §3 only; §1 and §13 stay valid for any stack.
5. **Legal review:** have returns, installments and medical-device selling licences reviewed before launch. The prompt deliberately makes no legal claims.
