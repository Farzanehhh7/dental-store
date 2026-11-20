import { normalizePersian, scoreSearchMatch } from '../../src/lib/persian-search';
import { getProductPriceSummary, resolveVariantPrice } from '../../src/lib/pricing';
import { CustomerGroupCode } from '../../src/types/domain';
import type { ServerCatalogSnapshot } from '../persistence';

export interface CatalogQueryParams {
  q?: string;
  category?: string;
  brand?: string;
  vertical?: string;
  kind?: string;
  inStock?: string;
  discount?: string;
  sort?: string;
  group?: string;
  page?: string | number;
  limit?: string | number;
}

export function queryCatalogProducts(catalog: ServerCatalogSnapshot, query: CatalogQueryParams) {
  const q = String(query.q || '').trim();
  const categorySlug = String(query.category || '').trim();
  const brandIdOrSlug = String(query.brand || '').trim();
  const vertical = String(query.vertical || '').trim();
  const kind = String(query.kind || '').trim();
  const onlyInStock = query.inStock === '1' || query.inStock === 'true';
  const onlyDiscount = query.discount === '1' || query.discount === 'true';
  const sort = String(query.sort || (q ? 'relevance' : 'best_selling')).trim();
  const customerGroup = (String(query.group || 'retail') as CustomerGroupCode) || 'retail';
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(60, Math.max(1, Number(query.limit || 24) || 24));

  let allowedCategoryIds: Set<string> | null = null;
  if (categorySlug) {
    const cat = catalog.categories.find((c) => c.slug === categorySlug || c.id === categorySlug);
    if (!cat) {
      return { ok: true, items: [], total: 0, page, totalPages: 1 };
    }
    const descendants = catalog.categories
      .filter((c) => c.parentId === cat.id || c.path.includes(cat.slug))
      .map((c) => c.id);
    allowedCategoryIds = new Set([cat.id, ...descendants]);
  }

  let resolvedBrandId = '';
  if (brandIdOrSlug) {
    const br = catalog.brands.find((b) => b.id === brandIdOrSlug || b.slug === brandIdOrSlug);
    resolvedBrandId = br?.id || brandIdOrSlug;
  }

  const scored = catalog.products
    .filter((p) => p.status !== 'draft' && p.status !== 'archived')
    .map((p) => {
      if (vertical && p.vertical !== vertical) return null;
      if (kind && p.kind !== kind) return null;
      if (
        allowedCategoryIds &&
        !allowedCategoryIds.has(p.primaryCategoryId) &&
        !p.categoryIds.some((cid) => allowedCategoryIds!.has(cid))
      ) {
        return null;
      }
      if (resolvedBrandId && p.brandId !== resolvedBrandId) return null;

      const summary = getProductPriceSummary(p, {
        customerGroup,
        campaigns: catalog.campaigns,
        settings: catalog.settings,
        contractPrices: catalog.contractPrices,
      });
      if (onlyInStock && !summary.inStock) return null;
      if (onlyDiscount && summary.discountPercent <= 0) return null;

      let score = 1;
      if (q) {
        const brandName = catalog.brands.find((b) => b.id === p.brandId)?.nameFa ?? '';
        score = scoreSearchMatch(q, {
          exactCodes: [p.sku, p.imedCode ?? '', p.gtin ?? '', ...p.variants.map((v) => v.sku)],
          textFields: [p.titleFa, p.titleEn, brandName, ...p.tags, normalizePersian(p.shortDescriptionFa)],
        });
        if (score <= 0) return null;
      }

      return { product: p, score, summary };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  scored.sort((a, b) => {
    if (sort === 'relevance' && q && b.score !== a.score) return b.score - a.score;
    if (sort === 'newest') return new Date(b.product.publishedAt).getTime() - new Date(a.product.publishedAt).getTime();
    if (sort === 'price_asc') return (a.summary.minPrice ?? Number.MAX_SAFE_INTEGER) - (b.summary.minPrice ?? Number.MAX_SAFE_INTEGER);
    if (sort === 'price_desc') return (b.summary.minPrice ?? 0) - (a.summary.minPrice ?? 0);
    if (sort === 'discount') return b.summary.discountPercent - a.summary.discountPercent;
    return b.product.soldCount - a.product.soldCount;
  });

  const total = scored.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  const paged = scored.slice(offset, offset + limit).map((x) => x.product);

  return {
    ok: true,
    items: paged,
    total,
    page,
    limit,
    totalPages,
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
