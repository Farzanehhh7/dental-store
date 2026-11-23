import { normalizePersian, scoreSearchMatch } from '../../src/lib/persian-search';
import { getProductPriceSummary, resolveVariantPrice } from '../../src/lib/pricing';
import { CustomerGroupCode, Product } from '../../src/types/domain';
import type { ServerCatalogSnapshot } from '../persistence';

export interface CatalogQueryParams {
  q?: string;
  category?: string;
  brand?: string;
  origin?: string;
  vertical?: string;
  kind?: string;
  inStock?: string;
  discount?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  attrs?: string;
  sort?: string;
  group?: string;
  cursor?: string;
  page?: string | number;
  limit?: string | number;
  [key: string]: unknown;
}

export interface CatalogFacets {
  categories: Array<{ id: string; slug: string; nameFa: string; count: number }>;
  brands: Array<{ id: string; slug: string; nameFa: string; nameEn: string; count: number }>;
  origins: Array<{ code: string; nameFa: string; count: number }>;
  verticals: Array<{ code: string; count: number }>;
  inStockCount: number;
  discountCount: number;
  priceRange: { min: number; max: number };
  attributes: Record<string, Array<{ value: string; count: number }>>;
}

const UNSAFE_ATTR_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function encodeCatalogCursor(offset: number): string {
  const safeOffset = Math.max(0, Math.floor(offset));
  return Buffer.from(JSON.stringify({ o: safeOffset }), 'utf8').toString('base64url');
}

export function decodeCatalogCursor(cursor: string | undefined): number | null {
  if (!cursor || typeof cursor !== 'string') return null;
  const trimmed = cursor.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(Buffer.from(trimmed, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof parsed?.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) {
      return parsed.o;
    }
  } catch {
    // Ignore malformed cursor and fall back to page/offset 0
  }
  return null;
}

function parseMultiValueParam(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const str = Array.isArray(raw) ? raw.join(',') : String(raw);
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAttributeFilters(query: CatalogQueryParams): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const addValues = (rawKey: string, rawVal: unknown) => {
    const key = rawKey.trim();
    if (!key || UNSAFE_ATTR_KEYS.has(key)) return;
    const vals = parseMultiValueParam(rawVal);
    if (vals.length === 0) return;
    map[key] = Array.from(new Set([...(map[key] ?? []), ...vals]));
  };

  if (typeof query.attrs === 'string' && query.attrs.trim()) {
    try {
      const parsed = JSON.parse(query.attrs) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          addValues(k, Array.isArray(v) ? v.join(',') : v);
        }
      }
    } catch {
      // Ignore invalid attrs JSON
    }
  }

  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('attr.') || k.startsWith('attr_')) {
      const code = k.slice(5);
      addValues(code, v);
    }
  }
  return map;
}

interface EvaluatedProduct {
  product: Product;
  score: number;
  summary: ReturnType<typeof getProductPriceSummary>;
  matchesCategory: boolean;
  matchesBrand: boolean;
  matchesOrigin: boolean;
  matchesVertical: boolean;
  matchesKind: boolean;
  matchesInStock: boolean;
  matchesDiscount: boolean;
  matchesPrice: boolean;
  matchesAttrsByKey: Record<string, boolean>;
  matchesAllAttrs: boolean;
}

export function queryCatalogProducts(catalog: ServerCatalogSnapshot, query: CatalogQueryParams) {
  const q = String(query.q || '').trim();
  const categorySlug = String(query.category || '').trim();
  const brandTokens = parseMultiValueParam(query.brand);
  const originTokens = parseMultiValueParam(query.origin).map((t) => t.toLowerCase());
  const vertical = String(query.vertical || '').trim();
  const kind = String(query.kind || '').trim();
  const onlyInStock = query.inStock === '1' || query.inStock === 'true';
  const onlyDiscount = query.discount === '1' || query.discount === 'true';
  const rawMinPrice = query.minPrice !== undefined && query.minPrice !== '' ? Number(query.minPrice) : null;
  const rawMaxPrice = query.maxPrice !== undefined && query.maxPrice !== '' ? Number(query.maxPrice) : null;
  const minPrice = rawMinPrice !== null && Number.isFinite(rawMinPrice) && rawMinPrice >= 0 ? rawMinPrice : null;
  const maxPrice = rawMaxPrice !== null && Number.isFinite(rawMaxPrice) && rawMaxPrice >= 0 ? rawMaxPrice : null;
  const attrFilters = parseAttributeFilters(query);
  const attrFilterKeys = Object.keys(attrFilters);

  const sort = String(query.sort || (q ? 'relevance' : 'best_selling')).trim();
  const customerGroup = (String(query.group || 'retail') as CustomerGroupCode) || 'retail';
  const limit = Math.min(60, Math.max(1, Number(query.limit || 24) || 24));
  const cursorOffset = decodeCatalogCursor(typeof query.cursor === 'string' ? query.cursor : undefined);
  const parsedPage = Math.max(1, Number(query.page || 1) || 1);
  const requestedOffset = cursorOffset !== null ? cursorOffset : (parsedPage - 1) * limit;
  const effectivePage = Math.floor(requestedOffset / limit) + 1;

  let allowedCategoryIds: Set<string> | null = null;
  let categoryNotFound = false;
  if (categorySlug) {
    const cat = catalog.categories.find((c) => c.slug === categorySlug || c.id === categorySlug);
    if (!cat) {
      categoryNotFound = true;
    } else {
      const descendants = catalog.categories
        .filter((c) => c.parentId === cat.id || c.path.includes(cat.slug))
        .map((c) => c.id);
      allowedCategoryIds = new Set([cat.id, ...descendants]);
    }
  }

  let resolvedBrandIds: Set<string> | null = null;
  if (brandTokens.length > 0) {
    resolvedBrandIds = new Set(
      brandTokens.map((tok) => {
        const br = catalog.brands.find((b) => b.id === tok || b.slug === tok);
        return br?.id || tok;
      })
    );
  }

  const brandNameById = new Map(catalog.brands.map((b) => [b.id, b.nameFa]));

  // Precompute category descendant ID sets for fast category facet counting
  const categoryDescendantSets = new Map<string, Set<string>>();
  for (const cat of catalog.categories) {
    if (!cat.isActive) continue;
    const desc = catalog.categories
      .filter((c) => c.parentId === cat.id || c.path.includes(cat.slug))
      .map((c) => c.id);
    categoryDescendantSets.set(cat.id, new Set([cat.id, ...desc]));
  }

  const evaluated: EvaluatedProduct[] = [];
  for (const p of catalog.products) {
    if (p.status === 'draft' || p.status === 'archived') continue;

    let score = 1;
    if (q) {
      const brandName = brandNameById.get(p.brandId) ?? '';
      score = scoreSearchMatch(q, {
        exactCodes: [p.sku, p.imedCode ?? '', p.gtin ?? '', ...p.variants.map((v) => v.sku)],
        textFields: [p.titleFa, p.titleEn, brandName, ...p.tags, normalizePersian(p.shortDescriptionFa)],
      });
      if (score <= 0) continue;
    }

    const summary = getProductPriceSummary(p, {
      customerGroup,
      campaigns: catalog.campaigns,
      settings: catalog.settings,
      contractPrices: catalog.contractPrices,
    });

    const matchesCategory = categoryNotFound
      ? false
      : !allowedCategoryIds ||
        allowedCategoryIds.has(p.primaryCategoryId) ||
        p.categoryIds.some((cid) => allowedCategoryIds!.has(cid));
    const matchesBrand = !resolvedBrandIds || resolvedBrandIds.has(p.brandId);
    const matchesOrigin =
      originTokens.length === 0 ||
      originTokens.includes(p.originCountryCode.toLowerCase()) ||
      originTokens.includes(p.originCountryFa.toLowerCase());
    const matchesVertical = !vertical || p.vertical === vertical;
    const matchesKind = !kind || p.kind === kind;
    const matchesInStock = !onlyInStock || summary.inStock;
    const matchesDiscount = !onlyDiscount || summary.discountPercent > 0;

    let matchesPrice = true;
    if (minPrice !== null || maxPrice !== null) {
      if (summary.minPrice === null) {
        matchesPrice = false;
      } else {
        if (minPrice !== null && summary.minPrice < minPrice) matchesPrice = false;
        if (maxPrice !== null && summary.minPrice > maxPrice) matchesPrice = false;
      }
    }

    const matchesAttrsByKey: Record<string, boolean> = {};
    let matchesAllAttrs = true;
    for (const key of attrFilterKeys) {
      const targetVals = attrFilters[key];
      const rawAttr = p.attributes?.[key];
      const prodVals = Array.isArray(rawAttr)
        ? rawAttr.map((v) => String(v))
        : rawAttr !== undefined && rawAttr !== null && rawAttr !== ''
        ? [String(rawAttr)]
        : [];
      const ok = prodVals.some((pv) => targetVals.includes(pv));
      matchesAttrsByKey[key] = ok;
      if (!ok) matchesAllAttrs = false;
    }

    evaluated.push({
      product: p,
      score,
      summary,
      matchesCategory,
      matchesBrand,
      matchesOrigin,
      matchesVertical,
      matchesKind,
      matchesInStock,
      matchesDiscount,
      matchesPrice,
      matchesAttrsByKey,
      matchesAllAttrs,
    });
  }

  const matchesExcept = (
    e: EvaluatedProduct,
    omit: 'category' | 'brand' | 'origin' | 'vertical' | 'price' | 'inStock' | 'discount' | { attrKey: string }
  ): boolean => {
    if (omit !== 'category' && !e.matchesCategory) return false;
    if (omit !== 'brand' && !e.matchesBrand) return false;
    if (omit !== 'origin' && !e.matchesOrigin) return false;
    if (omit !== 'vertical' && !e.matchesVertical) return false;
    if (!e.matchesKind) return false;
    if (omit !== 'inStock' && !e.matchesInStock) return false;
    if (omit !== 'discount' && !e.matchesDiscount) return false;
    if (omit !== 'price' && !e.matchesPrice) return false;
    if (typeof omit === 'object') {
      for (const key of attrFilterKeys) {
        if (key !== omit.attrKey && !e.matchesAttrsByKey[key]) return false;
      }
    } else if (!e.matchesAllAttrs) {
      return false;
    }
    return true;
  };

  // Compute disjunctive facets
  const brandCounts = new Map<string, number>();
  const originCounts = new Map<string, { code: string; nameFa: string; count: number }>();
  const verticalCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  let inStockCount = 0;
  let discountCount = 0;
  let priceMin = Number.POSITIVE_INFINITY;
  let priceMax = 0;
  const attributeValueCounts: Record<string, Map<string, number>> = {};

  for (const e of evaluated) {
    if (matchesExcept(e, 'brand')) {
      brandCounts.set(e.product.brandId, (brandCounts.get(e.product.brandId) ?? 0) + 1);
    }
    if (matchesExcept(e, 'origin')) {
      const code = e.product.originCountryCode;
      const cur = originCounts.get(code) ?? { code, nameFa: e.product.originCountryFa, count: 0 };
      cur.count += 1;
      originCounts.set(code, cur);
    }
    if (matchesExcept(e, 'vertical')) {
      verticalCounts.set(e.product.vertical, (verticalCounts.get(e.product.vertical) ?? 0) + 1);
    }
    if (matchesExcept(e, 'category')) {
      for (const [catId, idSet] of categoryDescendantSets.entries()) {
        if (idSet.has(e.product.primaryCategoryId) || e.product.categoryIds.some((cid) => idSet.has(cid))) {
          categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
        }
      }
    }
    if (matchesExcept(e, 'inStock') && e.summary.inStock) {
      inStockCount += 1;
    }
    if (matchesExcept(e, 'discount') && e.summary.discountPercent > 0) {
      discountCount += 1;
    }
    if (matchesExcept(e, 'price') && e.summary.minPrice !== null) {
      if (e.summary.minPrice < priceMin) priceMin = e.summary.minPrice;
      if (e.summary.minPrice > priceMax) priceMax = e.summary.minPrice;
    }
    for (const [attrKey, attrVal] of Object.entries(e.product.attributes || {})) {
      if (UNSAFE_ATTR_KEYS.has(attrKey)) continue;
      if (typeof attrVal !== 'string' && typeof attrVal !== 'number' && typeof attrVal !== 'boolean' && !Array.isArray(attrVal)) {
        continue;
      }
      if (!matchesExcept(e, { attrKey })) continue;
      const values = Array.isArray(attrVal)
        ? attrVal.map((v) => String(v))
        : typeof attrVal === 'boolean'
        ? [attrVal ? 'دارد' : 'ندارد']
        : [String(attrVal)];
      if (!attributeValueCounts[attrKey]) attributeValueCounts[attrKey] = new Map<string, number>();
      for (const v of values) {
        if (!v) continue;
        attributeValueCounts[attrKey].set(v, (attributeValueCounts[attrKey].get(v) ?? 0) + 1);
      }
    }
  }

  const facets: CatalogFacets = {
    categories: catalog.categories
      .filter((c) => c.isActive && (categoryCounts.get(c.id) ?? 0) > 0)
      .map((c) => ({ id: c.id, slug: c.slug, nameFa: c.nameFa, count: categoryCounts.get(c.id) ?? 0 })),
    brands: catalog.brands
      .filter((b) => b.isActive && (brandCounts.get(b.id) ?? 0) > 0)
      .map((b) => ({
        id: b.id,
        slug: b.slug,
        nameFa: b.nameFa,
        nameEn: b.nameEn,
        count: brandCounts.get(b.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count),
    origins: Array.from(originCounts.values()).sort((a, b) => b.count - a.count),
    verticals: Array.from(verticalCounts.entries()).map(([code, count]) => ({ code, count })),
    inStockCount,
    discountCount,
    priceRange: {
      min: Number.isFinite(priceMin) ? priceMin : 0,
      max: priceMax,
    },
    attributes: Object.fromEntries(
      Object.entries(attributeValueCounts).map(([k, valMap]) => [
        k,
        Array.from(valMap.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      ])
    ),
  };

  const matched = evaluated.filter(
    (e) =>
      e.matchesCategory &&
      e.matchesBrand &&
      e.matchesOrigin &&
      e.matchesVertical &&
      e.matchesKind &&
      e.matchesInStock &&
      e.matchesDiscount &&
      e.matchesPrice &&
      e.matchesAllAttrs
  );

  matched.sort((a, b) => {
    let cmp = 0;
    if (sort === 'relevance' && q && b.score !== a.score) cmp = b.score - a.score;
    else if (sort === 'newest') cmp = new Date(b.product.publishedAt).getTime() - new Date(a.product.publishedAt).getTime();
    else if (sort === 'price_asc') cmp = (a.summary.minPrice ?? Number.MAX_SAFE_INTEGER) - (b.summary.minPrice ?? Number.MAX_SAFE_INTEGER);
    else if (sort === 'price_desc') cmp = (b.summary.minPrice ?? 0) - (a.summary.minPrice ?? 0);
    else if (sort === 'discount') cmp = b.summary.discountPercent - a.summary.discountPercent;
    else cmp = b.product.soldCount - a.product.soldCount;
    return cmp !== 0 ? cmp : a.product.id.localeCompare(b.product.id);
  });

  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safeOffset = Math.min(requestedOffset, total);
  const paged = matched.slice(safeOffset, safeOffset + limit).map((x) => x.product);
  const hasMore = safeOffset + paged.length < total;
  const nextCursor = hasMore ? encodeCatalogCursor(safeOffset + paged.length) : null;
  const prevCursor = safeOffset > 0 ? encodeCatalogCursor(Math.max(0, safeOffset - limit)) : null;

  return {
    ok: true,
    items: paged,
    total,
    page: effectivePage,
    limit,
    totalPages,
    nextCursor,
    prevCursor,
    hasMore,
    facets,
  };
}

export function buildPriceComparisonFeed(catalog: ServerCatalogSnapshot, origin: string) {
  const items = catalog.products
    .filter((p) => p.status === 'active' && p.pricingMode !== 'call_for_price')
    .flatMap((p) =>
      p.variants
        .filter((v) => v.isActive && v.basePrice !== null && v.basePrice > 0)
        .map((v) => {
          const resolved = resolveVariantPrice(p, v, {
            campaigns: catalog.campaigns,
            settings: catalog.settings,
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

  return {
    generated_at: new Date().toISOString(),
    currency: 'IRT',
    count: items.length,
    products: items,
  };
}
