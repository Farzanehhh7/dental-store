import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateAuthoritativeCheckout, SHIPPING_FEES } from '../server/pricing';
import { EXPANDED_BRANDS, EXPANDED_CATEGORIES, EXPANDED_PRODUCTS } from '../src/data/expandedCatalog';
import { auditSeoHealth } from '../src/lib/seo';
import {
  SEED_BRANDS,
  SEED_CAMPAIGNS,
  SEED_CATEGORIES,
  SEED_COUPONS,
  SEED_PRODUCTS,
  SEED_SETTINGS,
} from '../src/data/seed';
import type { ServerCatalogSnapshot } from '../server/persistence';

function makeSnapshot(): ServerCatalogSnapshot {
  return {
    categories: SEED_CATEGORIES,
    brands: SEED_BRANDS,
    products: EXPANDED_PRODUCTS,
    campaigns: SEED_CAMPAIGNS,
    bundles: [],
    agents: [],
    blogPosts: [],
    redirects: [],
    coupons: SEED_COUPONS,
    contractPrices: [],
    settings: SEED_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
}

describe('Authoritative Server Pricing & Shipping Validation', () => {
  it('computes subtotal, coupon discount, tax, and shipping server-side and honors freeShippingThreshold', () => {
    const snap = makeSnapshot();
    const res = calculateAuthoritativeCheckout(snap, {
      items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      couponCode: 'DENT10',
      shippingMethod: 'courier_tehran',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.subtotal).toBe(3450000);
    expect(res.couponDiscount).toBe(Math.round((3450000 * 5) / 100));
    expect(res.shippingTotal).toBe(SHIPPING_FEES.courier_tehran);
    const afterDiscount = res.subtotal - res.couponDiscount;
    expect(res.taxTotal).toBe(Math.round((afterDiscount * SEED_SETTINGS.taxRatePercent) / 100));
    expect(res.grandTotal).toBe(afterDiscount + res.shippingTotal + res.taxTotal);
  });

  it('rejects call_for_price items, invalid shipping methods, zero quantities, and out-of-stock variants', () => {
    const snap = makeSnapshot();

    const callRes = calculateAuthoritativeCheckout(snap, {
      items: [{ productId: 'prod_endo_motor', variantId: 'var_radar_pro', quantity: 1 }],
      shippingMethod: 'courier_tehran',
    });
    expect(callRes.ok).toBe(false);

    const badShip = calculateAuthoritativeCheckout(snap, {
      items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
      shippingMethod: 'free_hacked',
    });
    expect(badShip.ok).toBe(false);

    const zeroStock = calculateAuthoritativeCheckout(snap, {
      items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_21', quantity: 1 }],
      shippingMethod: 'courier_tehran',
    });
    expect(zeroStock.ok).toBe(false);
  });
});

describe('Firestore Security Rules & Hardcoded Credential Hygiene', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  it('removes hardcoded superadmin emails and enforces RBAC admins collection', () => {
    expect(rulesText).not.toContain('admin@example.com');
    expect(rulesText).not.toContain('request.auth.token.email ==');
    expect(rulesText).toContain('admins/$(request.auth.uid)');
    expect(rulesText).toContain('match /rfqRequests/{rfqId}');
  });

  it('forbids direct client order create, update, and delete in favor of server-only writes', () => {
    const ordersBlock = rulesText.match(/match \/orders\/\{orderId\}\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '';
    expect(ordersBlock).toContain('allow get: if isValidId(orderId)');
    expect(ordersBlock).toContain('allow list:');
    expect(ordersBlock).toContain('allow create, update, delete: if false;');
  });

  it('keeps expanded catalog multi-vertical compatible with valid product schema, 100% category coverage, and clean SEO', () => {
    const validVerticals = new Set(['dental', 'medical', 'lab']);
    expect(SEED_PRODUCTS.every((p) => validVerticals.has(p.vertical))).toBe(true);
    expect(EXPANDED_PRODUCTS.length).toBeGreaterThanOrEqual(1600);
    expect(EXPANDED_PRODUCTS.every((p) => p.titleFa.length <= 200)).toBe(true);

    const emptyCategories = EXPANDED_CATEGORIES.filter((cat) => {
      const descendants = EXPANDED_CATEGORIES.filter(
        (c) => c.parentId === cat.id || c.path.includes(cat.slug)
      ).map((c) => c.id);
      const validIds = new Set([cat.id, ...descendants]);
      return !EXPANDED_PRODUCTS.some(
        (p) => validIds.has(p.primaryCategoryId) || p.categoryIds.some((id) => validIds.has(id))
      );
    });
    expect(emptyCategories).toEqual([]);

    const emptyBrands = EXPANDED_BRANDS.filter(
      (b) => !EXPANDED_PRODUCTS.some((p) => p.brandId === b.id)
    );
    expect(emptyBrands).toEqual([]);

    const seoIssues = auditSeoHealth(EXPANDED_PRODUCTS, EXPANDED_CATEGORIES, []).filter(
      (f) => f.severity !== 'pass'
    );
    expect(seoIssues).toEqual([]);

    const localAssetPaths = new Set(
      EXPANDED_PRODUCTS.flatMap((p) => [p.imageUrl, ...(p.galleryUrls ?? [])]).filter((url) =>
        url.startsWith('/assets/products/')
      )
    );
    expect(localAssetPaths.size).toBeGreaterThanOrEqual(80);
    for (const relPath of localAssetPaths) {
      const diskPath = path.resolve(process.cwd(), 'public', relPath.replace(/^\//, ''));
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.statSync(diskPath).size).toBeGreaterThan(3000);
    }
  });
});
