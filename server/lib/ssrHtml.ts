import { SEED_PAGES } from '../../src/data/expandedCatalog';
import { formatMoney } from '../../src/lib/jalali';
import { normalizeAssetUrl } from '../../src/lib/media';
import { stripKashida } from '../../src/lib/persian-search';
import { getProductPriceSummary, resolveVariantPrice } from '../../src/lib/pricing';
import {
  buildAgentJsonLd,
  buildBlogPostJsonLd,
  buildBrandJsonLd,
  buildBreadcrumbJsonLd,
  buildBundleJsonLd,
  buildFaqJsonLd,
  buildHomeJsonLd,
  buildStaticPageJsonLd,
  buildProductJsonLd,
  normalizeCanonicalPath,
} from '../../src/lib/seo';
import type { ServerCatalogSnapshot } from '../persistence';

export interface SsrRenderInput {
  templateHtml: string;
  pathname: string;
  search?: string;
  origin: string;
  catalog: ServerCatalogSnapshot;
}

export interface SsrRenderResult {
  statusCode: 200 | 404 | 410;
  html: string;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeJsonLdStringify(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/-->/g, '--\\>');
}

function stripStaticSeoTags(headHtml: string): string {
  return headHtml
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta[^>]+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+name=["']robots["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]+rel=["']alternate["'][^>]*hreflang=["'][^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
}

function resolveAbsoluteUrl(urlOrPath: string | undefined, origin: string, fallback = '/og-default.svg'): string {
  const norm = normalizeAssetUrl(urlOrPath, fallback);
  if (/^https?:\/\//i.test(norm)) return norm;
  return `${origin.replace(/\/+$/, '')}${norm.startsWith('/') ? norm : `/${norm}`}`;
}

function buildNavLinksHtml(catalog: ServerCatalogSnapshot): string {
  const topCats = catalog.categories
    .filter((c) => c.depth === 0 && c.isActive)
    .slice(0, 6)
    .map((c) => `<li><a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.nameFa)}</a></li>`)
    .join('');

  return `<nav aria-label="دسترسی سریع کاتالوگ">
    <ul>
      <li><a href="/">صفحه اصلی</a></li>
      <li><a href="/brands">برندهای تخصصی</a></li>
      <li><a href="/blog">مجله دندانپزشکی</a></li>
      <li><a href="/agents">نمایندگی‌ها و شعب</a></li>
      <li><a href="/page/about">درباره ما</a></li>
      ${topCats}
    </ul>
  </nav>`;
}

function renderBreadcrumbsHtml(items: { name: string; path: string }[]): string {
  return `<nav aria-label="breadcrumb"><ol>${items
    .map((item, idx) =>
      idx === items.length - 1
        ? `<li><span>${escapeHtml(item.name)}</span></li>`
        : `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`
    )
    .join('')}</ol></nav>`;
}

interface ResolvedRouteSeo {
  statusCode: 200 | 404 | 410;
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogType: 'website' | 'product' | 'article';
  ogImage: string;
  jsonLd: Record<string, unknown>[];
  bodyHtml: string;
}

function resolveRouteSeo(input: {
  pathname: string;
  search: string;
  origin: string;
  catalog: ServerCatalogSnapshot;
}): ResolvedRouteSeo {
  const { catalog, origin } = input;
  const settings = catalog.settings;
  const cleanPath = normalizeCanonicalPath(input.pathname);
  const query = new URLSearchParams(input.search || '');
  const activePages = catalog.pages && catalog.pages.length > 0 ? catalog.pages : SEED_PAGES;

  const renderNotFound = (heading = 'صفحه مورد نظر یافت نشد', description = 'صفحه درخواستی در دنتال‌مارکت یافت نشد.'): ResolvedRouteSeo => ({
    statusCode: 404,
    title: `${heading} | ${settings.storeNameFa}`,
    description,
    canonicalPath: '/404',
    robots: 'noindex, follow',
    ogType: 'website',
    ogImage: '/og-default.svg',
    jsonLd: [],
    bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(description)}</p>
      <p><a href="/">بازگشت به صفحه اصلی</a> · <a href="/search">جستجو در کاتالوگ</a></p>
      ${buildNavLinksHtml(catalog)}
    </main>`,
  });

  // 1. Home
  if (cleanPath === '/') {
    const activeProducts = catalog.products.filter((p) => p.status === 'active').slice(0, 12);
    const activeCategories = catalog.categories.filter((c) => c.depth === 0 && c.isActive).slice(0, 12);
    const publishedBlogs = catalog.blogPosts.filter((p) => p.status === 'published').slice(0, 4);
    const heroImg = '/assets/images/hero_dental_clinic_1794921818923.jpg';
    const title = `${settings.storeNameFa} | فروشگاه تخصصی تجهیزات و مواد دندانپزشکی`;
    const description =
      'فروشگاه تخصصی تجهیزات، دستگاه‌ها و مواد مصرفی دندانپزشکی با قیمت شفاف، کد IMED، پیش‌فاکتور رسمی کلینیک‌ها و ارسال سراسری.';

    return {
      statusCode: 200,
      title,
      description,
      canonicalPath: '/',
      robots: 'index, follow',
      ogType: 'website',
      ogImage: heroImg,
      jsonLd: buildHomeJsonLd(settings, origin),
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        <header>
          <h1>${escapeHtml(settings.storeNameFa)} — تامین تجهیزات و مواد مصرفی دندانپزشکی</h1>
          <p>${escapeHtml(description)}</p>
        </header>
        <section>
          <h2>دسته‌بندی‌های تخصصی</h2>
          <ul>${activeCategories
            .map((c) => `<li><a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.nameFa)}</a></li>`)
            .join('')}</ul>
        </section>
        <section>
          <h2>محصولات منتخب</h2>
          <ul>${activeProducts
            .map((p) => {
              const summary = getProductPriceSummary(p, { campaigns: catalog.campaigns, settings });
              return `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.titleFa)}</a> — ${escapeHtml(summary.label)}</li>`;
            })
            .join('')}</ul>
        </section>
        <section>
          <h2>مجله تخصصی</h2>
          <ul>${publishedBlogs
            .map((b) => `<li><a href="/blog/${escapeHtml(b.slug)}">${escapeHtml(b.titleFa)}</a></li>`)
            .join('')}</ul>
        </section>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 2. Product detail: /product/:slug
  const productMatch = cleanPath.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    const slug = decodeURIComponent(productMatch[1]);
    const product = catalog.products.find((p) => p.slug === slug && p.status !== 'draft' && p.status !== 'archived');
    if (!product) {
      return renderNotFound('محصول مورد نظر یافت نشد', 'این محصول در کاتالوگ فعلی موجود نیست یا حذف شده است.');
    }

    const brand = catalog.brands.find((b) => b.id === product.brandId);
    const category = catalog.categories.find((c) => c.id === product.primaryCategoryId);
    const summary = getProductPriceSummary(product, { campaigns: catalog.campaigns, settings });
    const stockStatusFa =
      summary.state === 'coming_soon'
        ? 'به زودی'
        : summary.inStock
        ? 'موجود و آماده ارسال'
        : 'ناموجود';
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      ...(category ? [{ name: category.nameFa, path: `/category/${category.slug}` }] : []),
      { name: product.titleFa, path: `/product/${product.slug}` },
    ];
    const faqLd = product.faqs && product.faqs.length > 0 ? buildFaqJsonLd(product.faqs) : null;
    const relatedProducts = catalog.products
      .filter(
        (p) =>
          p.id !== product.id &&
          p.status === 'active' &&
          (product.relatedIds?.includes(p.id) || p.primaryCategoryId === product.primaryCategoryId)
      )
      .slice(0, 6);

    const imgUrl = normalizeAssetUrl(product.imageUrl);

    return {
      statusCode: 200,
      title: product.metaTitle || `${product.titleFa} | خرید و قیمت | ${settings.storeNameFa}`,
      description: product.metaDescription || product.shortDescriptionFa,
      canonicalPath: `/product/${product.slug}`,
      robots: 'index, follow',
      ogType: 'product',
      ogImage: imgUrl,
      jsonLd: [
        buildProductJsonLd(product, brand, catalog.campaigns, settings, [], origin),
        buildBreadcrumbJsonLd(breadcrumbs, origin),
        ...(faqLd ? [faqLd] : []),
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <article>
          <h1>${escapeHtml(product.titleFa)}</h1>
          <p lang="en" dir="ltr">${escapeHtml(product.titleEn)}</p>
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(product.titleFa)}" width="640" height="480" />
          <p><strong>قیمت:</strong> ${escapeHtml(summary.label)} · <strong>وضعیت انبار:</strong> ${escapeHtml(stockStatusFa)}</p>
          <p><strong>کد کالا (SKU):</strong> ${escapeHtml(product.sku)}${
            product.imedCode ? ` · <strong>کد IMED:</strong> ${escapeHtml(product.imedCode)}` : ''
          }</p>
          ${brand ? `<p><strong>برند:</strong> <a href="/brand/${escapeHtml(brand.slug)}">${escapeHtml(brand.nameFa)}</a></p>` : ''}
          ${category ? `<p><strong>دسته‌بندی:</strong> <a href="/category/${escapeHtml(category.slug)}">${escapeHtml(category.nameFa)}</a></p>` : ''}
          <p>${escapeHtml(product.shortDescriptionFa)}</p>
          <section>
            <h2>توضیحات تخصصی</h2>
            <p>${escapeHtml(product.descriptionFa.slice(0, 800))}</p>
          </section>
          ${
            relatedProducts.length > 0
              ? `<section><h2>محصولات مرتبط</h2><ul>${relatedProducts
                  .map((rp) => `<li><a href="/product/${escapeHtml(rp.slug)}">${escapeHtml(rp.titleFa)}</a></li>`)
                  .join('')}</ul></section>`
              : ''
          }
        </article>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 3. Category & Category+Brand facet: /category/:slug(/brand/:brandSlug)?
  const catMatch = cleanPath.match(/^\/category\/([^/]+)(?:\/brand\/([^/]+))?$/);
  if (catMatch) {
    const catSlug = decodeURIComponent(catMatch[1]);
    const brandSlug = catMatch[2] ? decodeURIComponent(catMatch[2]) : undefined;
    const category = catalog.categories.find((c) => c.slug === catSlug && c.isActive);
    const routeBrand = brandSlug ? catalog.brands.find((b) => b.slug === brandSlug && b.isActive) : undefined;
    if (!category || (brandSlug && !routeBrand)) {
      return renderNotFound('دسته‌بندی مورد نظر یافت نشد', 'دسته‌بندی یا برند درخواستی یافت نشد.');
    }

    const childIds = catalog.categories
      .filter((c) => c.parentId === category.id || c.path.includes(category.slug))
      .map((c) => c.id);
    const validCatIds = new Set([category.id, ...childIds]);
    const catProducts = catalog.products.filter(
      (p) =>
        p.status === 'active' &&
        (validCatIds.has(p.primaryCategoryId) || p.categoryIds.some((id) => validCatIds.has(id))) &&
        (!routeBrand || p.brandId === routeBrand.id)
    );

    const hasFilterParams =
      query.has('brand') ||
      query.has('origin') ||
      query.get('inStock') === '1' ||
      query.get('discount') === '1' ||
      query.has('minPrice') ||
      query.has('maxPrice') ||
      (query.has('sort') && query.get('sort') !== 'best_selling');
    const pageNum = Math.max(1, Number(query.get('page') || 1) || 1);

    const isFacetWhitelisted = Boolean(routeBrand && catProducts.length >= settings.indexableFacetThreshold);
    const canonicalPath = routeBrand
      ? `/category/${category.slug}/brand/${routeBrand.slug}`
      : pageNum > 1 && !hasFilterParams
      ? `/category/${category.slug}?page=${pageNum}`
      : `/category/${category.slug}`;
    const robots = hasFilterParams || (routeBrand && !isFacetWhitelisted) ? 'noindex, follow' : 'index, follow';

    const title = routeBrand
      ? `${category.nameFa} ${routeBrand.nameFa} | ${settings.storeNameFa}`
      : category.metaTitle || `${category.nameFa}: مشخصات و قیمت | ${settings.storeNameFa}`;
    const description = category.metaDescription || category.seoTextFa || category.descriptionFa;
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: category.nameFa, path: `/category/${category.slug}` },
      ...(routeBrand ? [{ name: routeBrand.nameFa, path: `/category/${category.slug}/brand/${routeBrand.slug}` }] : []),
    ];
    const subCats = catalog.categories.filter((c) => c.parentId === category.id && c.isActive);

    return {
      statusCode: 200,
      title,
      description,
      canonicalPath,
      robots,
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [
        buildBreadcrumbJsonLd(breadcrumbs, origin),
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: catProducts.slice(0, 12).map((p, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              name: p.titleFa,
              url: `${origin}/product/${p.slug}`,
            })),
          },
        },
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <header>
          <h1>${escapeHtml(routeBrand ? `${category.nameFa} ${routeBrand.nameFa}` : category.nameFa)}</h1>
          <p>${escapeHtml(category.seoTextFa || category.descriptionFa)}</p>
        </header>
        ${
          subCats.length > 0
            ? `<section><h2>زیردسته‌ها</h2><ul>${subCats
                .map((sc) => `<li><a href="/category/${escapeHtml(sc.slug)}">${escapeHtml(sc.nameFa)}</a></li>`)
                .join('')}</ul></section>`
            : ''
        }
        <section>
          <h2>محصولات (${catProducts.length})</h2>
          <ul>${catProducts
            .slice(0, 24)
            .map((p) => {
              const summary = getProductPriceSummary(p, { campaigns: catalog.campaigns, settings });
              return `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.titleFa)}</a> — ${escapeHtml(summary.label)}</li>`;
            })
            .join('')}</ul>
        </section>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 4. Brands index: /brands
  if (cleanPath === '/brands') {
    const activeBrands = catalog.brands.filter((b) => b.isActive);
    return {
      statusCode: 200,
      title: `برندهای تجهیزات و مواد دندانپزشکی | ${settings.storeNameFa}`,
      description: 'فهرست کامل برندهای معتبر جهانی دندانپزشکی با تضمین اصالت و کد IMED',
      canonicalPath: '/brands',
      robots: 'index, follow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [
        buildBreadcrumbJsonLd(
          [
            { name: 'خانه', path: '/' },
            { name: 'برندها', path: '/brands' },
          ],
          origin
        ),
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml([
          { name: 'خانه', path: '/' },
          { name: 'برندها', path: '/brands' },
        ])}
        <h1>برندهای تخصصی تجهیزات و مواد دندانپزشکی</h1>
        <ul>${activeBrands
          .map((b) => `<li><a href="/brand/${escapeHtml(b.slug)}">${escapeHtml(b.nameFa)} (${escapeHtml(b.nameEn)})</a></li>`)
          .join('')}</ul>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 5. Brand detail: /brand/:slug
  const brandMatch = cleanPath.match(/^\/brand\/([^/]+)$/);
  if (brandMatch) {
    const brandSlug = decodeURIComponent(brandMatch[1]);
    const brand = catalog.brands.find((b) => b.slug === brandSlug && b.isActive);
    if (!brand) {
      return renderNotFound('برند مورد نظر یافت نشد');
    }
    const brandProducts = catalog.products.filter((p) => p.brandId === brand.id && p.status !== 'archived' && p.status !== 'draft');
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: 'برندها', path: '/brands' },
      { name: brand.nameFa, path: `/brand/${brand.slug}` },
    ];
    return {
      statusCode: 200,
      title: `${brand.nameFa} (${brand.nameEn}) | ${settings.storeNameFa}`,
      description: brand.descriptionFa,
      canonicalPath: `/brand/${brand.slug}`,
      robots: 'index, follow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [buildBrandJsonLd(brand, origin), buildBreadcrumbJsonLd(breadcrumbs, origin)],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <h1>${escapeHtml(brand.nameFa)} (${escapeHtml(brand.nameEn)})</h1>
        <p>کشور سازنده: ${escapeHtml(brand.countryFa)}</p>
        <p>${escapeHtml(brand.descriptionFa)}</p>
        <ul>${brandProducts
          .map((p) => `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.titleFa)}</a></li>`)
          .join('')}</ul>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 6. Pack detail: /pack/:slug
  const packMatch = cleanPath.match(/^\/pack\/([^/]+)$/);
  if (packMatch) {
    const packSlug = decodeURIComponent(packMatch[1]);
    const bundle = catalog.bundles.find((b) => b.slug === packSlug && b.status === 'active');
    if (!bundle) {
      return renderNotFound('پک تجهیزاتی مورد نظر یافت نشد');
    }
    let originalTotal = 0;
    const itemLinks: string[] = [];
    for (const bi of bundle.items) {
      const product = catalog.products.find((p) => p.id === bi.productId);
      const variant = product?.variants.find((v) => v.id === bi.variantId) ?? product?.variants[0];
      if (product && variant) {
        const res = resolveVariantPrice(product, variant, { campaigns: catalog.campaigns, settings });
        originalTotal += (res.unitPrice ?? variant.basePrice ?? 0) * bi.quantity;
        itemLinks.push(`<li><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.titleFa)}</a></li>`);
      }
    }
    const discountedTotal = Math.round(originalTotal * (1 - bundle.discountPercent / 100));
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: bundle.nameFa, path: `/pack/${bundle.slug}` },
    ];
    const packImg = normalizeAssetUrl(bundle.imageUrl);
    return {
      statusCode: 200,
      title: `${bundle.nameFa} | ${settings.storeNameFa}`,
      description: bundle.descriptionFa,
      canonicalPath: `/pack/${bundle.slug}`,
      robots: 'index, follow',
      ogType: 'product',
      ogImage: packImg,
      jsonLd: [buildBundleJsonLd(bundle, discountedTotal, origin), buildBreadcrumbJsonLd(breadcrumbs, origin)],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <h1>${escapeHtml(bundle.nameFa)}</h1>
        <img src="${escapeHtml(packImg)}" alt="${escapeHtml(bundle.nameFa)}" width="640" height="480" />
        <p>${escapeHtml(bundle.descriptionFa)}</p>
        ${discountedTotal > 0 ? `<p>قیمت پک: ${escapeHtml(formatMoney(discountedTotal, 'IRT'))}</p>` : ''}
        <ul>${itemLinks.join('')}</ul>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 7. Blog list & category
  if (cleanPath === '/blog' || cleanPath.startsWith('/blog/category/')) {
    const published = catalog.blogPosts.filter((p) => p.status === 'published');
    const catParam = cleanPath.startsWith('/blog/category/')
      ? decodeURIComponent(cleanPath.slice('/blog/category/'.length))
      : '';
    const filtered = catParam ? published.filter((p) => p.categoryFa === catParam) : published;
    return {
      statusCode: 200,
      title: `مجله تخصصی دندانپزشکی${catParam ? ` — ${catParam}` : ''} | ${settings.storeNameFa}`,
      description: 'مقالات آموزشی، راهنمای خرید تجهیزات و پروتکل‌های کلینیکی دندانپزشکی',
      canonicalPath: cleanPath,
      robots: 'index, follow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [
        buildBreadcrumbJsonLd(
          [
            { name: 'خانه', path: '/' },
            { name: 'مجله تخصصی', path: '/blog' },
          ],
          origin
        ),
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        <h1>مجله تخصصی و راهنمای خرید تجهیزات دندانپزشکی</h1>
        <ul>${filtered
          .map(
            (post) =>
              `<li><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.titleFa)}</a> — ${escapeHtml(post.excerptFa)}</li>`
          )
          .join('')}</ul>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 8. Blog post detail: /blog/:slug
  const blogMatch = cleanPath.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const postSlug = decodeURIComponent(blogMatch[1]);
    const post = catalog.blogPosts.find((p) => p.slug === postSlug && p.status === 'published');
    if (!post) {
      return renderNotFound('مقاله مورد نظر یافت نشد');
    }
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: 'مجله تخصصی', path: '/blog' },
      { name: post.titleFa, path: `/blog/${post.slug}` },
    ];
    const faqLd = post.faq && post.faq.length > 0 ? buildFaqJsonLd(post.faq) : null;
    const mentioned = catalog.products.filter((p) => post.productIds.includes(p.id));
    const postImg = normalizeAssetUrl(post.imageUrl);

    return {
      statusCode: 200,
      title: `${post.metaTitle || post.titleFa} | ${settings.storeNameFa}`,
      description: post.metaDescription || post.excerptFa,
      canonicalPath: `/blog/${post.slug}`,
      robots: 'index, follow',
      ogType: 'article',
      ogImage: postImg,
      jsonLd: [
        buildBlogPostJsonLd(post, settings, origin),
        buildBreadcrumbJsonLd(breadcrumbs, origin),
        ...(faqLd ? [faqLd] : []),
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <article>
          <h1>${escapeHtml(post.titleFa)}</h1>
          <p>نویسنده: ${escapeHtml(post.authorName)} (${escapeHtml(post.authorRole)})</p>
          <img src="${escapeHtml(postImg)}" alt="${escapeHtml(post.titleFa)}" width="800" height="450" />
          <p>${escapeHtml(post.excerptFa)}</p>
          <div>${escapeHtml(post.bodyFa.slice(0, 1200))}</div>
          ${
            mentioned.length > 0
              ? `<section><h2>محصولات معرفی‌شده</h2><ul>${mentioned
                  .map((p) => `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.titleFa)}</a></li>`)
                  .join('')}</ul></section>`
              : ''
          }
        </article>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 9. CMS Pages: /page/:slug
  const pageMatch = cleanPath.match(/^\/page\/([^/]+)$/);
  if (pageMatch) {
    const pageSlug = decodeURIComponent(pageMatch[1]);
    const cmsPage = activePages.find((p) => p.slug === pageSlug && p.status === 'published');
    if (!cmsPage) {
      return renderNotFound('صفحه مورد نظر یافت نشد');
    }
    const breadcrumbs = [
      { name: 'خانه', path: '/' },
      { name: cmsPage.titleFa, path: `/page/${cmsPage.slug}` },
    ];
    return {
      statusCode: 200,
      title: `${cmsPage.metaTitle || cmsPage.titleFa} | ${settings.storeNameFa}`,
      description: cmsPage.metaDescription || cmsPage.bodyFa.slice(0, 150),
      canonicalPath: `/page/${cmsPage.slug}`,
      robots: 'index, follow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [
        buildStaticPageJsonLd(cmsPage.slug, cmsPage.titleFa, settings, origin),
        buildBreadcrumbJsonLd(breadcrumbs, origin),
      ],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        ${renderBreadcrumbsHtml(breadcrumbs)}
        <h1>${escapeHtml(cmsPage.titleFa)}</h1>
        <p>${escapeHtml(cmsPage.bodyFa)}</p>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 10. Agents: /agents or /agents/:provinceSlug
  const agentsMatch = cleanPath.match(/^\/agents(?:\/([^/]+))?$/);
  if (agentsMatch) {
    const provinceSlug = agentsMatch[1] ? decodeURIComponent(agentsMatch[1]) : 'all';
    const activeAgents = catalog.agents.filter(
      (a) => a.isActive && (provinceSlug === 'all' || a.provinceSlug === provinceSlug)
    );
    if (provinceSlug !== 'all' && activeAgents.length === 0) {
      return renderNotFound('نمایندگی استانی یافت نشد');
    }
    const canonicalPath = provinceSlug === 'all' ? '/agents' : `/agents/${provinceSlug}`;
    return {
      statusCode: 200,
      title: `شبکه نمایندگی‌ها و شعب استانی | ${settings.storeNameFa}`,
      description: 'نشانی و شماره تماس شعب و نمایندگی‌های مجاز خدمات پس از فروش دنتال‌مارکت',
      canonicalPath,
      robots: 'index, follow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: activeAgents.map(buildAgentJsonLd),
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        <h1>شعب و نمایندگی‌های رسمی خدمات پس از فروش</h1>
        <ul>${activeAgents
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.nameFa)}</strong> — ${escapeHtml(a.province)}، ${escapeHtml(a.city)}: ${escapeHtml(a.address)} (${escapeHtml(a.phone)})</li>`
          )
          .join('')}</ul>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 11. Known transactional/utility SPA routes (200 + noindex)
  const isSpaUtilityRoute =
    cleanPath === '/search' ||
    cleanPath === '/compare' ||
    cleanPath === '/wishlist' ||
    cleanPath === '/cart' ||
    cleanPath === '/checkout' ||
    cleanPath === '/account' ||
    cleanPath === '/login' ||
    cleanPath.startsWith('/proforma/') ||
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/');

  if (isSpaUtilityRoute) {
    return {
      statusCode: 200,
      title: `${settings.storeNameFa} | فروشگاه تخصصی تجهیزات و مواد دندانپزشکی`,
      description: 'سامانه خرید آنلاین و مدیریت سفارش‌های تجهیزات دندانپزشکی دنتال‌مارکت',
      canonicalPath: cleanPath,
      robots: cleanPath === '/search' ? 'noindex, follow' : 'noindex, nofollow',
      ogType: 'website',
      ogImage: '/og-default.svg',
      jsonLd: [],
      bodyHtml: `<main data-ssr="true" class="ssr-shell" dir="rtl">
        <h1>${escapeHtml(settings.storeNameFa)}</h1>
        ${buildNavLinksHtml(catalog)}
      </main>`,
    };
  }

  // 12. Unknown route => HTTP 404
  return renderNotFound();
}

export function injectHeadAndBodyIntoTemplate(
  templateHtml: string,
  meta: {
    title: string;
    description: string;
    canonicalUrl: string;
    robots: string;
    ogType: 'website' | 'product' | 'article';
    ogImageUrl: string;
    jsonLd: Record<string, unknown>[];
    bodyHtml: string;
  }
): string {
  const cleanTitle = stripKashida(meta.title).slice(0, 120);
  const cleanDesc = stripKashida(meta.description).slice(0, 180);

  const headTags = [
    `<title>${escapeHtml(cleanTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(cleanDesc)}" />`,
    `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`,
    `<link rel="alternate" hreflang="fa-IR" href="${escapeHtml(meta.canonicalUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.canonicalUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(cleanTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(cleanDesc)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.ogImageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="fa_IR" />`,
    `<meta property="og:type" content="${escapeHtml(meta.ogType)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(cleanTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(cleanDesc)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.ogImageUrl)}" />`,
    ...meta.jsonLd.map(
      (obj) =>
        `<script type="application/ld+json" data-dental-jsonld="true">${safeJsonLdStringify(obj)}</script>`
    ),
  ].join('\n    ');

  let html = templateHtml;
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const strippedInner = stripStaticSeoTags(headMatch[1]);
    html = html.replace(headMatch[0], `<head>\n    ${headTags}\n${strippedInner}</head>`);
  }

  html = html.replace(
    /<div\s+id=["']root["'][^>]*>[\s\S]*?<\/div>/i,
    `<div id="root">${meta.bodyHtml}</div>`
  );
  return html;
}

export function renderSeoHtmlResponse(input: SsrRenderInput): SsrRenderResult {
  const origin = input.origin.replace(/\/+$/, '');
  const resolved = resolveRouteSeo({
    pathname: input.pathname,
    search: input.search || '',
    origin,
    catalog: input.catalog,
  });

  const canonicalPath = normalizeCanonicalPath(resolved.canonicalPath);
  const canonicalUrl = `${origin}${canonicalPath}`;
  const ogImageUrl = resolveAbsoluteUrl(resolved.ogImage, origin);

  const html = injectHeadAndBodyIntoTemplate(input.templateHtml, {
    title: resolved.title,
    description: resolved.description,
    canonicalUrl,
    robots: resolved.robots,
    ogType: resolved.ogType,
    ogImageUrl,
    jsonLd: resolved.jsonLd,
    bodyHtml: resolved.bodyHtml,
  });

  return {
    statusCode: resolved.statusCode,
    html,
  };
}

export function render410HtmlResponse(input: {
  templateHtml: string;
  pathname: string;
  origin: string;
  catalog: ServerCatalogSnapshot;
}): string {
  const origin = input.origin.replace(/\/+$/, '');
  const settings = input.catalog.settings;
  const cleanPath = normalizeCanonicalPath(input.pathname);
  const canonicalUrl = `${origin}${cleanPath}`;
  const bodyHtml = `<main data-ssr="true" class="ssr-shell" dir="rtl">
    <h1>این صفحه به‌صورت دائم حذف شده است (410 Gone)</h1>
    <p>محتوای این نشانی به طور کامل از وب‌سایت حذف شده است.</p>
    <p><a href="/">بازگشت به صفحه اصلی</a> · <a href="/search">جستجو در کاتالوگ</a></p>
    ${buildNavLinksHtml(input.catalog)}
  </main>`;

  return injectHeadAndBodyIntoTemplate(input.templateHtml, {
    title: `حذف دائمی صفحه (410 Gone) | ${settings.storeNameFa}`,
    description: 'این صفحه برای همیشه حذف شده است.',
    canonicalUrl,
    robots: 'noindex, nofollow',
    ogType: 'website',
    ogImageUrl: resolveAbsoluteUrl('/og-default.svg', origin),
    jsonLd: [],
    bodyHtml,
  });
}
