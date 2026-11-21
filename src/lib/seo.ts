import { normalizeAssetUrl } from './media';
import { stripKashida } from './persian-search';
import { getProductPriceSummary } from './pricing';
import {
  AgentBranch,
  AttributeDef,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  Category,
  Product,
  SiteSettings,
} from '../types/domain';

export interface SeoHeadInput {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogType?: 'website' | 'product' | 'article';
  ogImage?: string;
  jsonLd?: Record<string, unknown>[];
}

export function resolveSeoOrigin(explicitOrigin?: string): string {
  if (explicitOrigin && explicitOrigin.trim()) {
    return explicitOrigin.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://dentalmarket.ir';
}

export function normalizeCanonicalPath(rawPath: string): string {
  const input = (rawPath || '/').trim();
  const [rawPathname, rawSearch] = input.split('?');
  const withLeadingSlash = (rawPathname || '/').startsWith('/') ? rawPathname || '/' : `/${rawPathname || ''}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const trimmedTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';

  if (!rawSearch) return trimmedTrailing;
  const params = new URLSearchParams(rawSearch);
  const kept = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    const lk = k.toLowerCase();
    if (lk.startsWith('utm_') || lk === 'fbclid' || lk === 'gclid' || lk === 'yclid') {
      continue;
    }
    if (lk === 'page' && v === '1') {
      continue;
    }
    kept.append(k, v);
  }
  const qs = kept.toString();
  return qs ? `${trimmedTrailing}?${qs}` : trimmedTrailing;
}

export function applySeoHead(input: SeoHeadInput): void {
  const cleanTitle = stripKashida(input.title).slice(0, 120);
  const cleanDesc = stripKashida(input.description).slice(0, 180);
  const origin = resolveSeoOrigin();
  const canonicalPath = normalizeCanonicalPath(input.canonicalPath);
  const canonicalUrl = `${origin}${canonicalPath}`;

  document.title = cleanTitle;

  const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  const setLink = (rel: string, href: string, hreflang?: string) => {
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      if (hreflang) el.setAttribute('hreflang', hreflang);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  };

  setMeta('name', 'description', cleanDesc);
  setMeta('name', 'robots', input.robots);
  setMeta('property', 'og:title', cleanTitle);
  setMeta('property', 'og:description', cleanDesc);
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:locale', 'fa_IR');
  setMeta('property', 'og:type', input.ogType ?? 'website');

  const ogImg = normalizeAssetUrl(input.ogImage, '/og-default.svg');
  const absImg = ogImg.startsWith('http') ? ogImg : `${origin}${ogImg}`;
  setMeta('property', 'og:image', absImg);
  setMeta('property', 'og:image:width', '1200');
  setMeta('property', 'og:image:height', '630');

  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', cleanTitle);
  setMeta('name', 'twitter:description', cleanDesc);
  setMeta('name', 'twitter:image', absImg);

  setLink('canonical', canonicalUrl);
  setLink('alternate', canonicalUrl, 'fa-IR');
  setLink('alternate', canonicalUrl, 'x-default');

  document.querySelectorAll('script[data-dental-jsonld="true"]').forEach((n) => n.remove());
  if (input.jsonLd && input.jsonLd.length > 0) {
    for (const schemaObj of input.jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-dental-jsonld', 'true');
      script.textContent = JSON.stringify(schemaObj);
      document.head.appendChild(script);
    }
  }
}

export function buildHomeJsonLd(settings: SiteSettings, explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: settings.storeNameFa,
      url: origin,
      logo: `${origin}/og-default.svg`,
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: settings.phone,
        contactType: 'customer service',
        areaServed: 'IR',
        availableLanguage: ['fa'],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: settings.storeNameFa,
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

export function buildBreadcrumbJsonLd(items: { name: string; path: string }[], explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${origin}${normalizeCanonicalPath(item.path)}`,
    })),
  };
}

export function buildFaqJsonLd(faqs: { q: string; a: string }[]) {
  if (!faqs || faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

export function buildBrandJsonLd(brand: Brand, explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: brand.nameFa,
    alternateName: brand.nameEn,
    description: brand.descriptionFa,
    url: `${origin}/brand/${brand.slug}`,
  };
}

export function buildStaticPageJsonLd(slug: string, title: string, settings: SiteSettings, explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  const type = slug === 'about' ? 'AboutPage' : slug === 'contact' ? 'ContactPage' : 'WebPage';
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: title,
    url: `${origin}/page/${slug}`,
    publisher: {
      '@type': 'Organization',
      name: settings.storeNameFa,
      telephone: settings.phone,
    },
  };
}

export function buildBundleJsonLd(bundle: Bundle, discountedPrice: number, explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  const normImg = normalizeAssetUrl(bundle.imageUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: bundle.nameFa,
    description: bundle.descriptionFa,
    image: normImg.startsWith('http') ? normImg : `${origin}${normImg}`,
    sku: bundle.id.toUpperCase(),
    url: `${origin}/pack/${bundle.slug}`,
    offers:
      discountedPrice > 0
        ? {
            '@type': 'Offer',
            priceCurrency: 'IRR',
            price: discountedPrice * 10,
            availability: 'https://schema.org/InStock',
          }
        : undefined,
  };
}

/**
 * Generates Product JSON-LD strictly matching spec §17.4:
 * - priceCurrency is ALWAYS "IRR" (Toman * 10)
 * - omits offers when pricingMode === 'call_for_price'
 * - aggregateRating only included when real approved reviews exist
 * - includes additionalProperty PropertyValue from technical attributes
 */
export function buildProductJsonLd(
  product: Product,
  brand: Brand | undefined,
  campaigns: Campaign[],
  settings: SiteSettings,
  attributes: AttributeDef[] = [],
  explicitOrigin?: string
) {
  const origin = resolveSeoOrigin(explicitOrigin);
  const summary = getProductPriceSummary(product, { campaigns, settings });
  const normImg = normalizeAssetUrl(product.imageUrl);
  const absImg = normImg.startsWith('http') ? normImg : `${origin}${normImg}`;

  const additionalProperty = Object.entries(product.attributes || {}).map(([code, raw]) => {
    const def = attributes.find((a) => a.code === code);
    let valText = String(raw);
    if (typeof raw === 'boolean') valText = raw ? 'بله' : 'خیر';
    else if (Array.isArray(raw)) valText = raw.join('، ');
    else if (def?.options) {
      valText = def.options.find((o) => o.key === String(raw))?.labelFa ?? String(raw);
    }
    return {
      '@type': 'PropertyValue',
      name: def?.labelFa ?? code,
      value: def?.unit ? `${valText} ${def.unit}` : valText,
    };
  });

  if (product.imedCode) {
    additionalProperty.unshift({
      '@type': 'PropertyValue',
      name: 'کد IMED وزارت بهداشت',
      value: product.imedCode,
    });
  }

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.titleFa,
    alternateName: product.titleEn,
    image: [absImg],
    description: product.shortDescriptionFa,
    sku: product.sku,
    url: `${origin}/product/${product.slug}`,
    brand: brand ? { '@type': 'Brand', name: brand.nameFa } : undefined,
    ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
  };

  if (product.gtin) schema.gtin = product.gtin;

  if (summary.state !== 'call_for_price') {
    const availability =
      summary.state === 'coming_soon'
        ? 'https://schema.org/PreOrder'
        : summary.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock';

    if (summary.state === 'range' && summary.minPrice && summary.maxPrice) {
      schema.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'IRR',
        lowPrice: summary.minPrice * 10,
        highPrice: summary.maxPrice * 10,
        offerCount: product.variants.filter((v) => v.isActive).length,
        availability,
      };
    } else if (summary.minPrice) {
      schema.offers = {
        '@type': 'Offer',
        priceCurrency: 'IRR',
        price: summary.minPrice * 10,
        availability,
        itemCondition: 'https://schema.org/NewCondition',
        ...(summary.campaignEndsAt ? { priceValidUntil: summary.campaignEndsAt.slice(0, 10) } : {}),
      };
    }
  }

  if (product.ratingCount > 0 && product.ratingAvg > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.ratingAvg,
      reviewCount: product.ratingCount,
    };
  }

  return schema;
}

export function buildBlogPostJsonLd(post: BlogPost, settings: SiteSettings, explicitOrigin?: string) {
  const origin = resolveSeoOrigin(explicitOrigin);
  const normImg = normalizeAssetUrl(post.imageUrl);
  const absImg = normImg.startsWith('http') ? normImg : `${origin}${normImg}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.titleFa,
    description: post.metaDescription || post.excerptFa,
    image: absImg,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: `${origin}/blog/${post.slug}`,
    author: { '@type': 'Person', name: post.authorName },
    publisher: { '@type': 'Organization', name: settings.storeNameFa },
  };
}

export function buildAgentJsonLd(agent: AgentBranch) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: agent.nameFa,
    telephone: agent.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: agent.address,
      addressLocality: agent.city,
      addressRegion: agent.province,
      addressCountry: 'IR',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: agent.lat,
      longitude: agent.lng,
    },
  };
}

export function findOrphanProducts(products: Product[], categories: Category[]): Product[] {
  const activeCatIds = new Set(categories.filter((c) => c.isActive).map((c) => c.id));
  return products.filter(
    (p) =>
      p.status === 'active' &&
      !activeCatIds.has(p.primaryCategoryId) &&
      !p.categoryIds.some((cid) => activeCatIds.has(cid))
  );
}

export interface SeoHealthFinding {
  id: string;
  rule: string;
  severity: 'error' | 'warning' | 'pass';
  affectedCount: number;
  samplePaths: string[];
  descriptionFa: string;
}

export function auditSeoHealth(
  products: Product[],
  categories: Category[],
  posts: BlogPost[]
): SeoHealthFinding[] {
  const kashidaRegex = /\u0640/;
  const junkRegex = /(\[i\]|ps_|undefined|null|stacktrace)/i;

  const kashidaItems = [
    ...products.filter((p) => kashidaRegex.test(p.titleFa) || kashidaRegex.test(p.metaTitle ?? '')).map((p) => `/product/${p.slug}`),
    ...categories.filter((c) => kashidaRegex.test(c.nameFa)).map((c) => `/category/${c.slug}`),
  ];

  const missingDesc = products
    .filter((p) => !p.shortDescriptionFa || p.shortDescriptionFa.length < 25)
    .map((p) => `/product/${p.slug}`);

  const junkMeta = products
    .filter((p) => junkRegex.test(p.metaTitle ?? '') || junkRegex.test(p.metaDescription ?? ''))
    .map((p) => `/product/${p.slug}`);

  const missingImed = products
    .filter((p) => p.status === 'active' && !p.imedCode)
    .map((p) => `/product/${p.slug}`);

  const missingImage = products
    .filter((p) => !p.imageUrl)
    .map((p) => `/product/${p.slug}`);

  const duplicateTitles = (() => {
    const seen = new Map<string, string[]>();
    products.forEach((p) => {
      const key = p.titleFa.trim();
      seen.set(key, [...(seen.get(key) ?? []), `/product/${p.slug}`]);
    });
    return Array.from(seen.values()).filter((arr) => arr.length > 1).flat();
  })();

  const missingCategoryIntro = categories
    .filter((c) => c.isActive && (!c.seoTextFa || c.seoTextFa.length < 40))
    .map((c) => `/category/${c.slug}`);

  return [
    {
      id: 'kashida',
      rule: 'عدم وجود کشیده (ـ) در عناوین و متا',
      severity: kashidaItems.length > 0 ? 'error' : 'pass',
      affectedCount: kashidaItems.length,
      samplePaths: kashidaItems.slice(0, 5),
      descriptionFa: 'استفاده از کشیده در H1 یا متا تایتل باعث افت خوانایی و نقض قواعد سئو می‌شود.',
    },
    {
      id: 'meta_junk',
      rule: 'سلامت متا و نبود متن فنی در توضیحات',
      severity: junkMeta.length > 0 ? 'error' : 'pass',
      affectedCount: junkMeta.length,
      samplePaths: junkMeta.slice(0, 5),
      descriptionFa: 'متا تایتل و توضیحات متا نباید شامل رشته‌های فنی یا کد خطا باشند.',
    },
    {
      id: 'short_desc',
      rule: 'حداقل طول توضیحات یکتای محصول',
      severity: missingDesc.length > 0 ? 'warning' : 'pass',
      affectedCount: missingDesc.length,
      samplePaths: missingDesc.slice(0, 5),
      descriptionFa: 'محصولات فعال باید دارای توضیح کوتاه و یکتا (حداقل ۲۵ کاراکتر) باشند.',
    },
    {
      id: 'imed_code',
      rule: 'ثبت کد IMED برای تجهیزات و ملزومات',
      severity: missingImed.length > 0 ? 'warning' : 'pass',
      affectedCount: missingImed.length,
      samplePaths: missingImed.slice(0, 5),
      descriptionFa: 'کد IMED اعتبار تخصصی E-E-A-T و جستجوی کاتالوگ دندانپزشکی را تقویت می‌کند.',
    },
    {
      id: 'missing_img',
      rule: 'تصویر اصلی و ابعاد استاندارد محصولات',
      severity: missingImage.length > 0 ? 'error' : 'pass',
      affectedCount: missingImage.length,
      samplePaths: missingImage.slice(0, 5),
      descriptionFa: 'هر محصول منتشرشده باید حداقل یک تصویر با alt توصیفی داشته باشد.',
    },
    {
      id: 'dup_titles',
      rule: 'یکتا بودن عنوان صفحات محصول',
      severity: duplicateTitles.length > 0 ? 'error' : 'pass',
      affectedCount: duplicateTitles.length,
      samplePaths: duplicateTitles.slice(0, 5),
      descriptionFa: 'عناوین تکراری باعث رقابت داخلی صفحات (Keyword Cannibalization) می‌شود.',
    },
    {
      id: 'cat_intro',
      rule: 'مقدمه کاربردی دسته‌بندی‌ها',
      severity: missingCategoryIntro.length > 0 ? 'warning' : 'pass',
      affectedCount: missingCategoryIntro.length,
      samplePaths: missingCategoryIntro.slice(0, 5),
      descriptionFa: 'هر دسته‌بندی فعال باید دارای یک پاراگراف مقدمه تخصصی سئو باشد.',
    },
    {
      id: 'blog_eeat',
      rule: 'بررسی E-E-A-T مقالات تخصصی',
      severity: posts.some((b) => !b.authorName) ? 'warning' : 'pass',
      affectedCount: posts.filter((b) => !b.authorName).length,
      samplePaths: posts.filter((b) => !b.authorName).map((b) => `/blog/${b.slug}`),
      descriptionFa: 'مقالات سلامت و دندانپزشکی باید دارای نویسنده متخصص و تاریخ بروزرسانی باشند.',
    },
  ];
}
