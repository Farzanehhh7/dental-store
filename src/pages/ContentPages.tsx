import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Award, Clock, MapPin, PackagePlus, Phone, Printer, ShieldCheck } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { useStore } from '../context/StoreContext';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../lib/jalali';
import { getProductPriceSummary } from '../lib/pricing';
import {
  applySeoHead,
  buildAgentJsonLd,
  buildBlogPostJsonLd,
  buildBrandJsonLd,
  buildBreadcrumbJsonLd,
  buildBundleJsonLd,
  buildFaqJsonLd,
  buildStaticPageJsonLd,
} from '../lib/seo';

export function BrandsListPage() {
  const { brands, products, settings } = useStore();

  useEffect(() => {
    applySeoHead({
      title: `برندهای تجهیزات و مواد دندانپزشکی | ${settings.storeNameFa}`,
      description: 'فهرست کامل برندهای معتبر جهانی دندانپزشکی با تضمین اصالت و کد IMED',
      canonicalPath: '/brands',
      robots: 'index, follow',
    });
  }, [settings.storeNameFa]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-2">
        <h1 className="text-2xl font-extrabold">برندهای تخصصی تجهیزات و مواد دندانپزشکی</h1>
        <p className="text-sm text-ink/70 dark:text-slate-400">
          تمامی برندها دارای شناسه پیگیری اصالت، مجوز رسمی وزارت بهداشت و گارانتی شرکتی معتبر هستند.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {brands
          .filter((b) => b.isActive)
          .map((brand) => {
            const count = products.filter((p) => p.brandId === brand.id && p.status === 'active').length;
            return (
              <Link
                key={brand.id}
                to={`/brand/${brand.slug}`}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 hover:border-brand transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold">{brand.nameFa}</h2>
                    <p className="text-xs text-ink/50 dark:text-slate-400">{brand.nameEn} · {brand.countryFa}</p>
                  </div>
                  {brand.isAuthorizedDealer && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      <Award className="w-3.5 h-3.5" />
                      نماینده رسمی
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed line-clamp-2">{brand.descriptionFa}</p>
                <p className="text-xs font-bold text-brand dark:text-teal-300 tabular-nums">
                  {toPersianDigits(count)} محصول فعال در کاتالوگ
                </p>
              </Link>
            );
          })}
      </div>
    </div>
  );
}

export function BrandDetailPage() {
  const { slug } = useParams();
  const { brands, products, settings } = useStore();
  const brand = brands.find((b) => b.slug === slug);

  useEffect(() => {
    if (!brand) return;
    applySeoHead({
      title: `${brand.nameFa} (${brand.nameEn}) | ${settings.storeNameFa}`,
      description: brand.descriptionFa,
      canonicalPath: `/brand/${brand.slug}`,
      robots: 'index, follow',
      jsonLd: [
        buildBrandJsonLd(brand),
        buildBreadcrumbJsonLd([
          { name: 'خانه', path: '/' },
          { name: 'برندها', path: '/brands' },
          { name: brand.nameFa, path: `/brand/${brand.slug}` },
        ]),
      ],
    });
  }, [brand, settings.storeNameFa]);

  if (!brand) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <h1 className="text-xl font-bold">برند مورد نظر یافت نشد</h1>
        <Link to="/brands" className="text-brand font-bold">بازگشت به لیست برندها</Link>
      </div>
    );
  }

  const brandProducts = products.filter((p) => p.brandId === brand.id && p.status !== 'archived');

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">{brand.nameFa} ({brand.nameEn})</h1>
            <p className="text-xs text-ink/60 dark:text-slate-400 mt-1">
              کشور سازنده: {brand.countryFa} {brand.warrantyProvider ? `· پشتیبانی گارانتی: ${brand.warrantyProvider}` : ''}
            </p>
          </div>
          {brand.isAuthorizedDealer && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              تامین مستقیم و گارانتی اصالت
            </span>
          )}
        </div>
        <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed">{brand.descriptionFa}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {brandProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

export function PackDetailPage() {
  const { slug } = useParams();
  const { bundles, products, campaigns, currency, customerGroup, settings, contractPrices, authUser, addBundleToCart } = useStore();
  const bundle = bundles.find((b) => b.slug === slug);

  const itemsResolved = (bundle?.items ?? [])
    .map((bi) => {
      const product = products.find((p) => p.id === bi.productId);
      const variant = product?.variants.find((v) => v.id === bi.variantId) ?? product?.variants[0];
      if (!product || !variant) return null;
      const summary = getProductPriceSummary(product, {
        customerGroup,
        campaigns,
        currency,
        settings,
        contractPrices,
        userId: authUser?.uid,
      });
      return { bi, product, variant, unitPrice: summary.minPrice ?? variant.basePrice ?? 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const originalTotal = itemsResolved.reduce((sum, x) => sum + x.unitPrice * x.bi.quantity, 0);
  const discountedTotal = bundle ? Math.round(originalTotal * (1 - bundle.discountPercent / 100)) : 0;

  useEffect(() => {
    if (!bundle) return;
    applySeoHead({
      title: `${bundle.nameFa} | ${settings.storeNameFa}`,
      description: bundle.descriptionFa,
      canonicalPath: `/pack/${bundle.slug}`,
      robots: 'index, follow',
      ogImage: bundle.imageUrl,
      jsonLd: [
        buildBundleJsonLd(bundle, discountedTotal),
        buildBreadcrumbJsonLd([
          { name: 'خانه', path: '/' },
          { name: bundle.nameFa, path: `/pack/${bundle.slug}` },
        ]),
      ],
    });
  }, [bundle, discountedTotal, settings.storeNameFa]);

  if (!bundle) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <h1 className="text-xl font-bold">پک تجهیزاتی مورد نظر یافت نشد</h1>
        <Link to="/" className="text-brand font-bold">بازگشت به صفحه اصلی</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <img
          src={bundle.imageUrl}
          alt={bundle.nameFa}
          className="lg:col-span-5 w-full aspect-[4/3] object-cover rounded-xl bg-surface"
        />
        <div className="lg:col-span-7 space-y-4">
          <span className="text-xs font-bold text-rose-600">
            پک آماده کلینیکی با {toPersianDigits(bundle.discountPercent)}٪ صرفه‌جویی اقتصادی
          </span>
          <h1 className="text-2xl lg:text-3xl font-extrabold">{bundle.nameFa}</h1>
          <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed">{bundle.descriptionFa}</p>

          <div className="p-4 rounded-xl bg-surface/60 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              {originalTotal > 0 && (
                <p className="text-xs text-ink/45 line-through tabular-nums">{formatMoney(originalTotal, currency)}</p>
              )}
              <p className="text-2xl font-extrabold text-brand dark:text-teal-300 tabular-nums">
                {discountedTotal > 0 ? formatMoney(discountedTotal, currency) : 'استعلام قیمت'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => addBundleToCart(bundle.id)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              <PackagePlus className="w-4 h-4" />
              <span>افزودن کل پک به سبد خرید</span>
            </button>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold">اقلام موجود در این پک</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {itemsResolved.map(({ bi, product, variant, unitPrice }) => (
            <Link
              key={`${product.id}_${variant.id}`}
              to={`/product/${product.slug}`}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:border-brand transition-colors"
            >
              <img src={product.imageUrl} alt={product.titleFa} className="w-20 h-16 object-cover rounded-lg bg-surface shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{product.titleFa}</p>
                <p className="text-xs text-ink/60">
                  {variant.labelFa} · تعداد در پک: <strong className="tabular-nums">{toPersianDigits(bi.quantity)}</strong>
                </p>
              </div>
              <span className="text-xs font-extrabold text-brand tabular-nums">
                {unitPrice > 0 ? formatMoney(unitPrice, currency) : 'تماس'}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PublicProformaPage() {
  const { token } = useParams();
  const { proformas, currency, settings, respondProforma } = useStore();
  const pf = proformas.find((p) => p.shareToken === token || p.id === token);

  useEffect(() => {
    if (!pf) return;
    applySeoHead({
      title: `پیش‌فاکتور ${pf.proformaNo} | ${settings.storeNameFa}`,
      description: `پیش‌فاکتور رسمی کلینیک برای ${pf.contactName}`,
      canonicalPath: `/proforma/${token ?? ''}`,
      robots: 'noindex, nofollow',
    });
  }, [pf, token, settings.storeNameFa]);

  if (!pf) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center space-y-4">
        <h1 className="text-xl font-bold">پیش‌فاکتور یافت نشد یا منقضی شده است</h1>
        <Link to="/" className="text-brand font-bold">بازگشت به فروشگاه</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-4 border-b border-line dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-extrabold text-brand">{settings.storeNameFa} — پیش‌فاکتور رسمی کلینیک</h1>
            <p className="text-xs text-ink/60 mt-1">کد IMED: {settings.imedRegistryCode} · تلفن: {settings.phone}</p>
          </div>
          <div className="text-left text-xs space-y-1">
            <p className="font-extrabold tabular-nums">شماره: {pf.proformaNo}</p>
            <p>اعتبار تا: {formatJalaliDate(pf.validUntil)}</p>
            <p className="font-bold text-brand">وضعیت: {pf.status}</p>
          </div>
        </div>

        <div className="text-xs space-y-1">
          <p>خریدار: <strong>{pf.contactName}</strong> {pf.clinicName ? `(${pf.clinicName})` : ''}</p>
          <p>شماره تماس: <span className="tabular-nums">{pf.contactMobile}</span></p>
        </div>

        <table className="w-full text-xs border-collapse border border-line dark:border-slate-700">
          <thead>
            <tr className="bg-surface dark:bg-slate-800">
              <th className="border border-line dark:border-slate-700 p-2 text-right">شرح کالا</th>
              <th className="border border-line dark:border-slate-700 p-2">تعداد</th>
              <th className="border border-line dark:border-slate-700 p-2">فی</th>
              <th className="border border-line dark:border-slate-700 p-2">جمع</th>
            </tr>
          </thead>
          <tbody>
            {pf.items.map((it) => (
              <tr key={it.variantId}>
                <td className="border border-line dark:border-slate-700 p-2">{it.titleFa} ({it.variantLabelFa})</td>
                <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{toPersianDigits(it.quantity)}</td>
                <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{formatMoney(it.unitPrice, currency)}</td>
                <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{formatMoney(it.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center text-sm font-extrabold pt-2">
          <span>مبلغ نهایی قابل پرداخت:</span>
          <span className="tabular-nums text-brand">{formatMoney(pf.grandTotal, currency)}</span>
        </div>

        <p className="text-xs text-ink/70 dark:text-slate-400">{pf.termsFa}</p>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>چاپ پیش‌فاکتور</span>
          </button>
          {(pf.status === 'draft' || pf.status === 'sent' || pf.status === 'viewed') && (
            <>
              <button
                type="button"
                onClick={() => respondProforma(pf.id, 'accepted')}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                تایید پیش‌فاکتور
              </button>
              <button
                type="button"
                onClick={() => respondProforma(pf.id, 'rejected')}
                className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
              >
                رد پیش‌فاکتور
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const { provinceSlug } = useParams();
  const { agents, brands, settings } = useStore();
  const [selectedProvince, setSelectedProvince] = useState(provinceSlug ?? 'all');

  useEffect(() => {
    setSelectedProvince(provinceSlug ?? 'all');
  }, [provinceSlug]);

  const provinces = Array.from(new Set(agents.map((a) => a.provinceSlug))).map((slug) => ({
    slug,
    name: agents.find((a) => a.provinceSlug === slug)?.province ?? slug,
  }));

  const visibleAgents = agents.filter(
    (a) => a.isActive && (selectedProvince === 'all' || a.provinceSlug === selectedProvince)
  );

  useEffect(() => {
    applySeoHead({
      title: `شبکه نمایندگی‌ها و شعب استانی | ${settings.storeNameFa}`,
      description: 'نشانی و شماره تماس شعب و نمایندگی‌های مجاز خدمات پس از فروش دنتال‌مارکت',
      canonicalPath: selectedProvince === 'all' ? '/agents' : `/agents/${selectedProvince}`,
      robots: 'index, follow',
      jsonLd: visibleAgents.map(buildAgentJsonLd),
    });
  }, [selectedProvince, visibleAgents, settings.storeNameFa]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">شعب و نمایندگی‌های رسمی خدمات پس از فروش</h1>
          <p className="text-sm text-ink/70 dark:text-slate-400 mt-1">
            نصب یونیت، کالیبراسیون و سرویس دوره‌ای در مراکز استان‌ها
          </p>
        </div>
        <select
          value={selectedProvince}
          onChange={(e) => setSelectedProvince(e.target.value)}
          aria-label="فیلتر استان"
          className="px-4 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm font-bold"
        >
          <option value="all">همه استان‌ها</option>
          {provinces.map((pr) => (
            <option key={pr.slug} value={pr.slug}>{pr.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visibleAgents.map((ag) => (
          <article key={ag.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-extrabold">{ag.nameFa}</h2>
            <p className="text-xs text-ink/70 dark:text-slate-400 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <span>{ag.province}، {ag.city} — {ag.address}</span>
            </p>
            <p className="text-xs tabular-nums flex items-center gap-2">
              <Phone className="w-4 h-4 text-brand shrink-0" />
              <span>{ag.phone} · {ag.mobile}</span>
            </p>
            <p className="text-xs text-ink/60 dark:text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand shrink-0" />
              <span>{ag.workingHoursFa}</span>
            </p>
            <p className="text-[11px] text-brand dark:text-teal-300 pt-2 border-t border-line dark:border-slate-800">
              برندهای تحت پوشش: {ag.brandIds.map((bid) => brands.find((b) => b.id === bid)?.nameFa).filter(Boolean).join(' · ')}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function BlogListPage() {
  const { slug: categorySlug } = useParams();
  const { blogPosts, settings } = useStore();
  const published = blogPosts.filter((p) => p.status === 'published');
  const categories = Array.from(new Set(published.map((p) => p.categoryFa)));
  const filtered = categorySlug
    ? published.filter((p) => p.categoryFa === decodeURIComponent(categorySlug))
    : published;

  useEffect(() => {
    applySeoHead({
      title: `مجله تخصصی دندانپزشکی ${categorySlug ? `— ${decodeURIComponent(categorySlug)}` : ''} | ${settings.storeNameFa}`,
      description: 'مقالات آموزشی، راهنمای خرید تجهیزات و پروتکل‌های کلینیکی دندانپزشکی',
      canonicalPath: categorySlug ? `/blog/category/${categorySlug}` : '/blog',
      robots: 'index, follow',
    });
  }, [settings.storeNameFa, categorySlug]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
        <h1 className="text-2xl font-extrabold">مجله تخصصی و راهنمای خرید تجهیزات دندانپزشکی</h1>
        <p className="text-sm text-ink/70 dark:text-slate-400">
          نگارش و بازبینی علمی توسط متخصصان دندانپزشکی و مهندسی پزشکی
        </p>
        <div className="flex flex-wrap gap-2 pt-2 text-xs">
          <Link
            to="/blog"
            className={`px-3 py-1.5 rounded-lg border font-bold ${
              !categorySlug ? 'bg-brand text-white border-brand' : 'border-line dark:border-slate-700'
            }`}
          >
            همه مقالات
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              to={`/blog/category/${encodeURIComponent(cat)}`}
              className={`px-3 py-1.5 rounded-lg border font-bold ${
                categorySlug && decodeURIComponent(categorySlug) === cat
                  ? 'bg-brand text-white border-brand'
                  : 'border-line dark:border-slate-700'
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((post) => (
          <Link
            key={post.id}
            to={`/blog/${post.slug}`}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden hover:border-brand transition-colors flex flex-col"
          >
            <img src={post.imageUrl} alt={post.titleFa} className="aspect-[16/9] w-full object-cover bg-surface" />
            <div className="p-5 space-y-2.5 flex-1 flex flex-col">
              <span className="text-[11px] font-bold text-brand dark:text-teal-300">
                {post.categoryFa} · {formatJalaliDate(post.publishedAt)}
              </span>
              <h2 className="text-base font-extrabold leading-snug">{post.titleFa}</h2>
              <p className="text-xs text-ink/70 dark:text-slate-400 line-clamp-3 flex-1">{post.excerptFa}</p>
              <div className="pt-3 border-t border-line dark:border-slate-800 text-[11px] text-ink/60 dark:text-slate-400 flex justify-between">
                <span>{post.authorName}</span>
                <span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const { blogPosts, products, settings } = useStore();
  const post = blogPosts.find((p) => p.slug === slug);

  useEffect(() => {
    if (!post) return;
    const faqLd = post.faq ? buildFaqJsonLd(post.faq) : null;
    applySeoHead({
      title: `${post.metaTitle || post.titleFa} | ${settings.storeNameFa}`,
      description: post.metaDescription || post.excerptFa,
      canonicalPath: `/blog/${post.slug}`,
      robots: 'index, follow',
      ogType: 'article',
      ogImage: post.imageUrl,
      jsonLd: [
        buildBlogPostJsonLd(post, settings),
        buildBreadcrumbJsonLd([
          { name: 'خانه', path: '/' },
          { name: 'مجله تخصصی', path: '/blog' },
          { name: post.titleFa, path: `/blog/${post.slug}` },
        ]),
        ...(faqLd ? [faqLd] : []),
      ],
    });
  }, [post, settings]);

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <h1 className="text-xl font-bold">مقاله مورد نظر یافت نشد</h1>
        <Link to="/blog" className="text-brand font-bold">بازگشت به مجله</Link>
      </div>
    );
  }

  const mentionedProducts = products.filter((p) => post.productIds.includes(p.id));

  return (
    <article className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-bold text-brand dark:text-teal-300">
          {post.categoryFa} · منتشرشده در {formatJalaliDate(post.publishedAt, true)}
        </span>
        <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight">{post.titleFa}</h1>
        <div className="flex flex-wrap gap-4 text-xs text-ink/65 dark:text-slate-400">
          <span>نویسنده: <strong>{post.authorName}</strong> ({post.authorRole})</span>
          {post.reviewedBy && <span>بازبینی علمی: <strong>{post.reviewedBy}</strong></span>}
          <span>بروزرسانی: {formatJalaliDate(post.updatedAt)}</span>
        </div>
      </div>

      <img src={post.imageUrl} alt={post.titleFa} className="w-full aspect-[16/9] object-cover rounded-2xl bg-surface" />

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-4 text-sm leading-8 text-ink/85 dark:text-slate-200 whitespace-pre-line">
        {post.bodyFa}
      </div>

      {post.faq && post.faq.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-extrabold">پرسش‌های پرتکرار مقاله</h2>
          {post.faq.map((f, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-surface/60 dark:bg-slate-800/60 space-y-1">
              <p className="text-sm font-bold">{f.q}</p>
              <p className="text-xs text-ink/75 dark:text-slate-300 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </section>
      )}

      {mentionedProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold">محصولات معرفی‌شده در این راهنما</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mentionedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

const STATIC_CONTENT: Record<string, { title: string; body: string }> = {
  about: {
    title: 'درباره دنتال‌مارکت',
    body: 'دنتال‌مارکت سامانه تخصصی تامین مواد مصرفی، ابزار دقیق و تجهیزات سرمایه‌ای دندانپزشکی در ایران است. تمامی محصولات دارای اصالت گارانتی، شناسه رهگیری IMED و تاریخ انقضای شفاف (FEFO) برای دندانپزشکان، کلینیک‌ها و لابراتوارها عرضه می‌شوند.',
  },
  contact: {
    title: 'تماس با ما و پشتیبانی کلینیک‌ها',
    body: 'کارشناسان فروش و مهندسان پزشکی دنتال‌مارکت همه‌روزه از ساعت ۹ تا ۱۸ آماده مشاوره تجهیز مطب، پیگیری پیش‌فاکتورها و هماهنگی نصب تجهیزات هستند.',
  },
  returns: {
    title: 'شرایط مرجوعی و گارانتی تجهیزات',
    body: 'مواد مصرفی دندانپزشکی با بسته‌بندی پلمپ و دست‌نخورده تا ۷ روز کاری پس از تحویل قابل بازگشت هستند. تجهیزات سرمایه‌ای شامل گارانتی رسمی شرکت واردکننده و خدمات نصب توسط تیم فنی استانی هستند.',
  },
  privacy: {
    title: 'حریم خصوصی و امنیت داده‌ها',
    body: 'اطلاعات هویتی، شماره نظام پزشکی و سوابق خرید کلینیک‌ها نزد دنتال‌مارکت محرمانه بوده و مطابق استانداردهای امنیتی و قوانین نظام سلامت نگهداری می‌شوند.',
  },
  warranty: {
    title: 'استعلام اصالت و گارانتی تجهیزات',
    body: 'کلیه تجهیزات دارای کد IMED و برچسب اصالت قابل استعلام هستند و پشتیبانی خدمات پس از فروش در شعب استانی فعال است.',
  },
};

export function StaticInfoPage() {
  const { slug = 'about' } = useParams();
  const { pages, faqs, settings } = useStore();
  const cmsPage = pages.find((p) => p.slug === slug && p.status === 'published');
  const fallback = STATIC_CONTENT[slug] ?? STATIC_CONTENT.about;
  const pageTitle = cmsPage?.titleFa || fallback.title;
  const pageBody = cmsPage?.bodyFa || fallback.body;
  const activeFaqs = faqs.filter((f) => f.isActive);

  useEffect(() => {
    const faqLd = activeFaqs.length > 0 ? buildFaqJsonLd(activeFaqs.map((f) => ({ q: f.questionFa, a: f.answerFa }))) : null;
    applySeoHead({
      title: `${cmsPage?.metaTitle || pageTitle} | ${settings.storeNameFa}`,
      description: cmsPage?.metaDescription || pageBody.slice(0, 150),
      canonicalPath: `/page/${slug}`,
      robots: 'index, follow',
      jsonLd: [
        buildStaticPageJsonLd(slug, pageTitle, settings),
        ...(faqLd ? [faqLd] : []),
      ],
    });
  }, [cmsPage, pageTitle, pageBody, slug, settings, activeFaqs]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 space-y-4">
        <h1 className="text-2xl font-extrabold">{pageTitle}</h1>
        <p className="text-sm leading-8 text-ink/80 dark:text-slate-300 whitespace-pre-line">{pageBody}</p>
        <div className="pt-4 border-t border-line dark:border-slate-800 text-xs text-ink/60 dark:text-slate-400 space-y-1">
          <p>نشانی: {settings.addressFa}</p>
          <p className="tabular-nums">تلفن: {settings.phone} · کد IMED: {settings.imedRegistryCode}</p>
        </div>
      </div>

      {activeFaqs.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-extrabold">پرسش‌های متداول خرید و ضمانت</h2>
          {activeFaqs.map((fq) => (
            <div key={fq.id} className="p-4 rounded-xl bg-surface/50 dark:bg-slate-800/50 space-y-1">
              <p className="text-sm font-bold">{fq.questionFa}</p>
              <p className="text-xs text-ink/75 dark:text-slate-300 leading-relaxed">{fq.answerFa}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function NotFoundPage() {
  const { settings, recordNotFoundHit } = useStore();
  const location = useLocation();

  useEffect(() => {
    applySeoHead({
      title: `صفحه پیدا نشد | ${settings.storeNameFa}`,
      description: 'صفحه درخواستی یافت نشد',
      canonicalPath: '/404',
      robots: 'noindex, nofollow',
    });
    void recordNotFoundHit(location.pathname);
  }, [settings.storeNameFa, location.pathname]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-5">
      <p className="text-5xl font-extrabold text-brand tabular-nums">۴۰۴</p>
      <h1 className="text-2xl font-extrabold">صفحه مورد نظر یافت نشد</h1>
      <p className="text-sm text-ink/70 dark:text-slate-400">
        ممکن است نشانی صفحه تغییر کرده یا محصول منتقل شده باشد. می‌توانید از دسته‌بندی‌های اصلی یا جستجو استفاده کنید.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
          بازگشت به صفحه اصلی
        </Link>
        <Link to="/search" className="px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 text-sm font-bold">
          جستجو در کاتالوگ
        </Link>
      </div>
    </div>
  );
}
