import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, FileText, PackageCheck, ShieldCheck } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import CountdownTimer from '../components/store/CountdownTimer';
import { useStore } from '../context/StoreContext';
import { IMG_HERO_CLINIC } from '../data/seed';
import { formatJalaliDate, formatMoney, toPersianDigits } from '../lib/jalali';
import { applySeoHead, buildHomeJsonLd } from '../lib/seo';
import { resolveVariantPrice } from '../lib/pricing';

type CollectionTab = 'bestsellers' | 'deals' | 'equipment' | 'consumables';

export default function Home() {
  const {
    categories,
    brands,
    products,
    campaigns,
    bundles,
    agents,
    blogPosts,
    currency,
    customerGroup,
    settings,
    addBundleToCart,
  } = useStore();

  const [activeTab, setActiveTab] = useState<CollectionTab>('bestsellers');

  useEffect(() => {
    applySeoHead({
      title: `${settings.storeNameFa} | فروشگاه تخصصی تجهیزات و مواد دندانپزشکی`,
      description: 'فروشگاه تخصصی تجهیزات، دستگاه‌ها و مواد مصرفی دندانپزشکی با قیمت شفاف، کد IMED، پیش‌فاکتور رسمی کلینیک‌ها و ارسال سراسری.',
      canonicalPath: '/',
      robots: 'index, follow',
      ogType: 'website',
      ogImage: IMG_HERO_CLINIC,
      jsonLd: buildHomeJsonLd(settings),
    });
  }, [settings]);

  const l1Categories = useMemo(
    () => categories.filter((c) => c.depth === 0 && c.isActive && c.showOnHome).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.status === 'active' && new Date(c.endsAt).getTime() > Date.now()),
    [campaigns]
  );

  const filteredProducts = useMemo(() => {
    const active = products.filter((p) => p.vertical === 'dental' && p.status === 'active');
    if (activeTab === 'deals' && activeCampaign) {
      return active.filter((p) => activeCampaign.productIds.includes(p.id));
    }
    if (activeTab === 'equipment') {
      return active.filter((p) => p.kind === 'capital_equipment');
    }
    if (activeTab === 'consumables') {
      return active.filter((p) => p.kind === 'consumable');
    }
    return [...active].sort((a, b) => b.soldCount - a.soldCount).slice(0, 8);
  }, [products, activeTab, activeCampaign]);

  const computeBundlePrice = (bundleId: string) => {
    const b = bundles.find((x) => x.id === bundleId);
    if (!b) return { regular: 0, discounted: 0 };
    let regular = 0;
    for (const item of b.items) {
      const p = products.find((x) => x.id === item.productId);
      const v = p?.variants.find((x) => x.id === item.variantId);
      if (p && v) {
        const res = resolveVariantPrice(p, v, { customerGroup, campaigns, settings });
        regular += (res.unitPrice ?? v.basePrice ?? 0) * item.quantity;
      }
    }
    const discounted = Math.round(regular * (1 - b.discountPercent / 100));
    return { regular, discounted };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-16">
      {/* 1. Hero Split Section (One dominant focal anchor, high-res 16:9 image, proof strip below) */}
      <section className="space-y-6">
        <div className="grid lg:grid-cols-12 gap-8 items-stretch bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="lg:col-span-6 p-8 lg:p-12 flex flex-col justify-center gap-5">
            <p className="text-xs font-bold text-brand dark:text-teal-300">
              تأمین تخصصی کلینیک‌ها، مطب‌ها و لابراتوارهای دندانپزشکی
            </p>
            <h1 className="text-3xl lg:text-4xl font-extrabold leading-snug text-ink dark:text-slate-100 [text-wrap:balance]">
              تجهیزات و مواد دندانپزشکی با قیمت شفاف و اصالت IMED
            </h1>
            <p className="text-sm lg:text-base text-ink/75 dark:text-slate-300 leading-relaxed max-w-xl">
              از مواد مصرفی روزانه و کامپوزیت‌های ترمیمی با کنترل دقیق تاریخ انقضا تا تجهیزات سرمایه‌ای مطب همراه با پیش‌فاکتور رسمی، نصب در محل و گارانتی شرکتی.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/category/consumables"
                className="px-6 py-3 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors inline-flex items-center gap-2"
              >
                <span>مشاهده کاتالوگ محصولات</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <Link
                to="/account"
                className="px-5 py-3 rounded-lg border border-line dark:border-slate-700 text-sm font-bold text-ink dark:text-slate-200 hover:border-brand transition-colors"
              >
                حساب همکاری B2B کلینیک‌ها
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6 min-h-[260px] lg:min-h-[380px] bg-surface dark:bg-slate-800">
            <img
              src={IMG_HERO_CLINIC}
              alt="اتاق درمان کلینیک دندانپزشکی مجهز به یونیت و تجهیزات استریل"
              width={960}
              height={540}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Full-width 4-column Proof Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-brand shrink-0" />
            <div>
              <p className="text-xs font-bold">اصالت و کد IMED</p>
              <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">مجوز اداره کل تجهیزات پزشکی</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <PackageCheck className="w-6 h-6 text-brand shrink-0" />
            <div>
              <p className="text-xs font-bold">کنترل انقضای FEFO</p>
              <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">شفافیت بچ و تاریخ مصرفی</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <FileText className="w-6 h-6 text-brand shrink-0" />
            <div>
              <p className="text-xs font-bold">پیش‌فاکتور رسمی B2B</p>
              <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">خرید چکی و اعتباری کلینیک</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <Building2 className="w-6 h-6 text-brand shrink-0" />
            <div>
              <p className="text-xs font-bold">{toPersianDigits(agents.length)} شعبه و نمایندگی</p>
              <p className="text-xs text-ink/60 dark:text-slate-400 mt-0.5">نصب و پشتیبانی استانی</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Categories + Tabbed Product Collection */}
      <section className="space-y-8">
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-extrabold text-ink dark:text-slate-100">دسته‌بندی‌های تخصصی دندانپزشکی</h2>
            <Link to="/brands" className="text-xs font-bold text-brand hover:underline">مشاهده همه برندها</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {l1Categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 hover:border-brand transition-colors flex flex-col justify-between"
              >
                <h3 className="font-bold text-sm text-ink dark:text-slate-100">{cat.nameFa}</h3>
                <p className="text-xs text-ink/60 dark:text-slate-400 mt-1.5 line-clamp-2">{cat.descriptionFa}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-surface dark:bg-slate-900 rounded-lg border border-line dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('bestsellers')}
                className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'bestsellers' ? 'bg-white dark:bg-slate-800 text-brand dark:text-teal-300 shadow-sm' : 'text-ink/70 dark:text-slate-400'
                }`}
              >
                پرفروش‌ترین محصولات
              </button>
              {activeCampaign && (
                <button
                  type="button"
                  onClick={() => setActiveTab('deals')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                    activeTab === 'deals' ? 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 shadow-sm' : 'text-ink/70 dark:text-slate-400'
                  }`}
                >
                  <span>{activeCampaign.nameFa}</span>
                  {activeCampaign.showTimer && <CountdownTimer endsAt={activeCampaign.endsAt} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('equipment')}
                className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'equipment' ? 'bg-white dark:bg-slate-800 text-brand dark:text-teal-300 shadow-sm' : 'text-ink/70 dark:text-slate-400'
                }`}
              >
                تجهیزات سرمایه‌ای مطب
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('consumables')}
                className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'consumables' ? 'bg-white dark:bg-slate-800 text-brand dark:text-teal-300 shadow-sm' : 'text-ink/70 dark:text-slate-400'
                }`}
              >
                مواد مصرفی و ترمیمی
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 3. Clinic Starter Packs & Authorized Brands */}
      <section className="space-y-8">
        <div>
          <h2 className="text-xl font-extrabold text-ink dark:text-slate-100 mb-4">پکیج‌های راه‌اندازی مطب و اقتصادی</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {bundles.filter((b) => b.status === 'active').map((bundle) => {
              const { regular, discounted } = computeBundlePrice(bundle.id);
              return (
                <div
                  key={bundle.id}
                  className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row gap-5"
                >
                  <img
                    src={bundle.imageUrl}
                    alt={bundle.nameFa}
                    width={180}
                    height={135}
                    className="w-full sm:w-44 h-36 object-cover rounded-lg bg-surface shrink-0"
                  />
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-brand dark:text-teal-300">
                        {toPersianDigits(bundle.items.length)} قلم کالا · {toPersianDigits(bundle.discountPercent)}٪ صرفه‌جویی پکیج
                      </p>
                      <h3 className="text-base font-extrabold mt-1">{bundle.nameFa}</h3>
                      <p className="text-xs text-ink/70 dark:text-slate-400 mt-1.5 leading-relaxed">
                        {bundle.descriptionFa}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-line dark:border-slate-800">
                      <div>
                        <p className="text-xs text-ink/45 line-through tabular-nums">{formatMoney(regular, currency)}</p>
                        <p className="text-base font-extrabold text-brand dark:text-teal-300 tabular-nums">
                          {formatMoney(discounted, currency)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addBundleToCart(bundle.id)}
                        className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors shrink-0"
                      >
                        افزودن پک به سبد
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Brands + Clinical Journal */}
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">برندهای تخصصی همکار</h2>
              <Link to="/brands" className="text-xs font-bold text-brand hover:underline">فهرست برندها</Link>
            </div>
            <div className="divide-y divide-line dark:divide-slate-800">
              {brands.map((b) => (
                <Link
                  key={b.id}
                  to={`/brand/${b.slug}`}
                  className="py-3 flex items-center justify-between gap-3 hover:text-brand transition-colors"
                >
                  <div>
                    <p className="text-sm font-bold">{b.nameFa}</p>
                    <p className="text-xs text-ink/55 dark:text-slate-400">{b.nameEn} · {b.countryFa}</p>
                  </div>
                  {b.isAuthorizedDealer && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      نماینده رسمی
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">مجله تخصصی و راهنمای خرید تجهیزات</h2>
              <Link to="/blog" className="text-xs font-bold text-brand hover:underline">مشاهده همه مقالات</Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {blogPosts.filter((p) => p.status === 'published').map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="border border-line dark:border-slate-800 rounded-lg overflow-hidden hover:border-brand transition-colors flex flex-col"
                >
                  <img
                    src={post.imageUrl}
                    alt={post.titleFa}
                    width={360}
                    height={200}
                    loading="lazy"
                    className="w-full h-36 object-cover bg-surface"
                  />
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="text-[11px] text-ink/60 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{post.categoryFa}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatJalaliDate(post.updatedAt)}</span>
                    </div>
                    <h3 className="font-bold text-sm leading-snug line-clamp-2">{post.titleFa}</h3>
                    <p className="text-xs text-ink/65 dark:text-slate-400 line-clamp-2 mt-auto">{post.authorName}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
