import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, Clock, MapPin, Phone, ShieldCheck } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { useStore } from '../context/StoreContext';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import {
  applySeoHead,
  buildAgentJsonLd,
  buildBlogPostJsonLd,
  buildBreadcrumbJsonLd,
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
  const { blogPosts, settings } = useStore();
  const published = blogPosts.filter((p) => p.status === 'published');

  useEffect(() => {
    applySeoHead({
      title: `مجله تخصصی دندانپزشکی | ${settings.storeNameFa}`,
      description: 'مقالات آموزشی، راهنمای خرید تجهیزات و پروتکل‌های کلینیکی دندانپزشکی',
      canonicalPath: '/blog',
      robots: 'index, follow',
    });
  }, [settings.storeNameFa]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-2">
        <h1 className="text-2xl font-extrabold">مجله تخصصی و راهنمای خرید تجهیزات دندانپزشکی</h1>
        <p className="text-sm text-ink/70 dark:text-slate-400">
          نگارش و بازبینی علمی توسط متخصصان دندانپزشکی و مهندسی پزشکی
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {published.map((post) => (
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
    applySeoHead({
      title: `${post.titleFa} | ${settings.storeNameFa}`,
      description: post.excerptFa,
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
  const { slug } = useParams();
  const { settings } = useStore();
  const page = STATIC_CONTENT[slug ?? 'about'] ?? STATIC_CONTENT.about;

  useEffect(() => {
    applySeoHead({
      title: `${page.title} | ${settings.storeNameFa}`,
      description: page.body.slice(0, 150),
      canonicalPath: `/page/${slug ?? 'about'}`,
      robots: 'index, follow',
    });
  }, [page, slug, settings.storeNameFa]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 space-y-4">
        <h1 className="text-2xl font-extrabold">{page.title}</h1>
        <p className="text-sm leading-8 text-ink/80 dark:text-slate-300">{page.body}</p>
        <div className="pt-4 border-t border-line dark:border-slate-800 text-xs text-ink/60 dark:text-slate-400 space-y-1">
          <p>نشانی: {settings.addressFa}</p>
          <p className="tabular-nums">تلفن: {settings.phone} · کد IMED: {settings.imedRegistryCode}</p>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { settings } = useStore();
  useEffect(() => {
    applySeoHead({
      title: `صفحه پیدا نشد | ${settings.storeNameFa}`,
      description: 'صفحه درخواستی یافت نشد',
      canonicalPath: '/404',
      robots: 'noindex, nofollow',
    });
  }, [settings.storeNameFa]);

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
