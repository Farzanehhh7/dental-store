import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, FileText, MapPin, PackageCheck, ShieldCheck, X } from 'lucide-react';
import HeroBannerSlider, { HeroSlideView } from '../components/store/HeroBannerSlider';
import ProductCard from '../components/store/ProductCard';
import CountdownTimer from '../components/store/CountdownTimer';
import { useStore } from '../context/StoreContext';
import { useI18n } from '../context/i18n';
import { IMG_HERO_CLINIC } from '../data/seed';
import { buildResponsiveImageProps } from '../lib/media';
import { applySeoHead, buildHomeJsonLd } from '../lib/seo';
import { getProductPriceSummary, resolveVariantPrice } from '../lib/pricing';

type CollectionTab = 'bestsellers' | 'newest' | 'most_viewed' | 'near_expiry' | 'deals' | 'equipment' | 'consumables';

export default function Home() {
  const {
    categories,
    brands,
    products,
    campaigns,
    bundles,
    agents,
    banners,
    blogPosts,
    contractPrices,
    recentlyViewedIds,
    authUser,
    currency,
    customerGroup,
    settings,
    addBundleToCart,
  } = useStore();
  const { t, formatDate, formatDigits, formatMoney } = useI18n();

  const [activeTab, setActiveTab] = useState<CollectionTab>('bestsellers');
  const [stripDismissed, setStripDismissed] = useState(false);

  const heroBanner = useMemo(
    () =>
      banners
        .filter((b) => b.slot === 'hero' && b.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0],
    [banners]
  );

  const topStripBanner = useMemo(
    () =>
      banners
        .filter((b) => b.slot === 'top_strip' && b.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0],
    [banners]
  );

  const midPromoBanner = useMemo(
    () =>
      banners
        .filter((b) => b.slot === 'mid_promo' && b.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0],
    [banners]
  );

  useEffect(() => {
    applySeoHead({
      title: `${settings.storeNameFa} | ${t('home.seoTitleSuffix')}`,
      description: t('home.seoDescription'),
      canonicalPath: '/',
      robots: 'index, follow',
      ogType: 'website',
      ogImage: heroBanner?.imageUrl || IMG_HERO_CLINIC,
      jsonLd: buildHomeJsonLd(settings),
    });
  }, [settings, heroBanner, t]);

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
      return active.filter((p) => activeCampaign.productIds.includes(p.id)).slice(0, 8);
    }
    if (activeTab === 'newest') {
      return [...active]
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, 8);
    }
    if (activeTab === 'most_viewed') {
      return [...active].sort((a, b) => b.viewCount - a.viewCount).slice(0, 8);
    }
    if (activeTab === 'near_expiry') {
      return active
        .filter((p) => getProductPriceSummary(p, { customerGroup, campaigns, currency, settings }).nearExpiry)
        .slice(0, 8);
    }
    if (activeTab === 'equipment') {
      return active.filter((p) => p.kind === 'capital_equipment').slice(0, 8);
    }
    if (activeTab === 'consumables') {
      return active.filter((p) => p.kind === 'consumable').slice(0, 8);
    }
    return [...active].sort((a, b) => b.soldCount - a.soldCount).slice(0, 8);
  }, [products, activeTab, activeCampaign, customerGroup, campaigns, currency, settings]);

  const recentProducts = useMemo(() => {
    if (recentlyViewedIds.length === 0) return [];
    return recentlyViewedIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 4);
  }, [recentlyViewedIds, products]);

  const computeBundlePrice = (bundleId: string) => {
    const b = bundles.find((x) => x.id === bundleId);
    if (!b) return { regular: 0, discounted: 0 };
    let regular = 0;
    for (const item of b.items) {
      const p = products.find((x) => x.id === item.productId);
      const v = p?.variants.find((x) => x.id === item.variantId);
      if (p && v) {
        const res = resolveVariantPrice(p, v, {
          customerGroup,
          campaigns,
          settings,
          contractPrices,
          userId: authUser?.uid,
        });
        regular += (res.unitPrice ?? v.basePrice ?? 0) * item.quantity;
      }
    }
    const discounted = Math.round(regular * (1 - b.discountPercent / 100));
    return { regular, discounted };
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-5 sm:py-6 lg:py-8 space-y-10 sm:space-y-14">
      {/* Optional Slim Top Strip Announcement */}
      {topStripBanner && !stripDismissed && (
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-xl bg-brand/10 dark:bg-teal-950/60 border border-brand/20 dark:border-teal-800/60 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {topStripBanner.badgeTextFa && (
              <span className="font-extrabold text-brand dark:text-teal-300 shrink-0">
                {topStripBanner.badgeTextFa}:
              </span>
            )}
            <span className="font-bold text-ink dark:text-slate-100 truncate">{topStripBanner.titleFa}</span>
            {topStripBanner.ctaTextFa && topStripBanner.linkPath && (
              <Link
                to={topStripBanner.linkPath}
                className="inline-flex items-center gap-1 font-extrabold text-brand dark:text-teal-300 hover:underline shrink-0"
              >
                <span>{topStripBanner.ctaTextFa}</span>
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStripDismissed(true)}
            aria-label={t('home.dismissAnnouncement')}
            className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg text-ink/70 dark:text-slate-300 hover:text-ink dark:hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Hero Multi-Slide Banner + Proof Strip */}
      <section className="space-y-6">
        <HeroBannerSlider banners={banners} productCount={products.length} />

        {/* 4-column Proof Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-brand shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold">{t('home.proof.imedTitle')}</p>
              <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{t('home.proof.imedDesc')}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <PackageCheck className="w-6 h-6 text-brand shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold">{t('home.proof.fefoTitle')}</p>
              <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{t('home.proof.fefoDesc')}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <FileText className="w-6 h-6 text-brand shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold">{t('home.proof.b2bTitle')}</p>
              <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{t('home.proof.b2bDesc')}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <Building2 className="w-6 h-6 text-brand shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold">{t('home.proof.agentsTitle', { count: formatDigits(agents.length) })}</p>
              <p className="text-xs text-ink/70 dark:text-slate-400 mt-0.5">{t('home.proof.agentsDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Categories + Tabbed Product Collection */}
      <section className="space-y-8">
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-extrabold text-ink dark:text-slate-100">
              {t('home.categoriesHeading', { categoriesCount: t('counts.categories', { count: categories.filter((c) => c.isActive).length }) })}
            </h2>
            <Link to="/brands" className="text-xs font-bold text-brand hover:underline">
              {t('counts.brands', { count: brands.filter((b) => b.isActive).length })}
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {l1Categories.slice(0, 12).map((cat) => (
              <Link
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-3.5 sm:p-4 hover:border-brand transition-colors flex flex-col justify-between"
              >
                <h3 className="font-bold text-sm text-ink dark:text-slate-100">{cat.nameFa}</h3>
                <p className="text-xs text-ink/70 dark:text-slate-400 mt-1.5 line-clamp-2">{cat.descriptionFa}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
              <div className="inline-flex sm:flex sm:flex-wrap items-center gap-1 p-1 bg-surface dark:bg-slate-900 rounded-lg border border-line dark:border-slate-800 min-w-max sm:min-w-0">
                {(
                  [
                    ['bestsellers', t('home.tabs.bestsellers')],
                    ['newest', t('home.newest')],
                    ['most_viewed', t('home.mostViewed')],
                    ['near_expiry', t('home.nearExpirySection')],
                    ['equipment', t('home.tabs.equipment')],
                    ['consumables', t('home.tabs.consumables')],
                  ] as [CollectionTab, string][]
                ).map(([tabKey, tabLabel]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveTab(tabKey)}
                    className={`min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === tabKey ? 'bg-white dark:bg-slate-800 text-brand dark:text-teal-300 shadow-sm' : 'text-ink/75 dark:text-slate-300'
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
                {activeCampaign && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('deals')}
                    className={`min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2 ${
                      activeTab === 'deals' ? 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 shadow-sm' : 'text-ink/75 dark:text-slate-300'
                    }`}
                  >
                    <span>{activeCampaign.nameFa}</span>
                    {activeCampaign.showTimer && <CountdownTimer endsAt={activeCampaign.endsAt} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* Optional Mid-Page Promotional Banner */}
      {midPromoBanner && (
        <section>
          <HeroSlideView banner={midPromoBanner} headingTag="h2" compact />
        </section>
      )}

      {/* 3. Clinic Starter Packs */}
      <section className="space-y-8">
        <div>
          <h2 className="text-xl font-extrabold text-ink dark:text-slate-100 mb-4">{t('home.starterPacks')}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            {bundles.filter((b) => b.status === 'active').map((bundle) => {
              const { regular, discounted } = computeBundlePrice(bundle.id);
              return (
                <div
                  key={bundle.id}
                  className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row gap-5"
                >
                  <Link to={`/pack/${bundle.slug}`} className="shrink-0">
                    <img
                      {...buildResponsiveImageProps(bundle.imageUrl, {
                        widths: [320, 480],
                        sizes: '(max-width: 640px) 100vw, 180px',
                      })}
                      alt={bundle.nameFa}
                      width={180}
                      height={135}
                      className="w-full sm:w-44 h-36 object-cover rounded-lg bg-surface"
                    />
                  </Link>
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-brand dark:text-teal-300">
                        {t('home.bundleSavingMeta', {
                          items: formatDigits(bundle.items.length),
                          percent: formatDigits(bundle.discountPercent),
                        })}
                      </p>
                      <Link to={`/pack/${bundle.slug}`} className="hover:text-brand">
                        <h3 className="text-base font-extrabold mt-1">{bundle.nameFa}</h3>
                      </Link>
                      <p className="text-xs text-ink/70 dark:text-slate-400 mt-1.5 leading-relaxed">
                        {bundle.descriptionFa}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-line dark:border-slate-800">
                      <div>
                        <p className="text-xs text-ink/55 dark:text-slate-400 line-through tabular-nums">
                          {formatMoney(regular, currency)}
                        </p>
                        <p className="text-base font-extrabold text-brand dark:text-teal-300 tabular-nums">
                          {formatMoney(discounted, currency)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addBundleToCart(bundle.id)}
                        className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors shrink-0"
                      >
                        {t('home.addBundleBtn')}
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
              <h2 className="text-lg font-extrabold">{t('home.brandsTitle')}</h2>
              <Link to="/brands" className="text-xs font-bold text-brand hover:underline">
                {t('home.viewAllCount', { count: formatDigits(brands.length) })}
              </Link>
            </div>
            <div className="divide-y divide-line dark:divide-slate-800">
              {brands
                .filter((b) => b.isActive)
                .sort((a, b) => (b.websiteUrl ? 1 : 0) - (a.websiteUrl ? 1 : 0))
                .slice(0, 8)
                .map((b) => (
                <Link
                  key={b.id}
                  to={`/brand/${b.slug}`}
                  className="py-3 flex items-center justify-between gap-3 hover:text-brand transition-colors"
                >
                  <div>
                    <p className="text-sm font-bold">{b.nameFa}</p>
                    <p className="text-xs text-ink/65 dark:text-slate-400">{b.nameEn} · {b.countryFa}</p>
                  </div>
                  {b.isAuthorizedDealer && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('home.authorizedDealer')}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{t('home.blogTitle')}</h2>
              <Link to="/blog" className="text-xs font-bold text-brand hover:underline">
                {t('home.viewAllPosts')}
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {blogPosts.filter((p) => p.status === 'published').slice(0, 4).map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="border border-line dark:border-slate-800 rounded-lg overflow-hidden hover:border-brand transition-colors flex flex-col"
                >
                  <img
                    {...buildResponsiveImageProps(post.imageUrl, {
                      widths: [360, 640],
                      sizes: '(max-width: 640px) 100vw, 360px',
                    })}
                    alt={post.titleFa}
                    width={360}
                    height={200}
                    className="w-full h-36 object-cover bg-surface"
                  />
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="text-[11px] text-ink/70 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{post.categoryFa}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatDate(post.updatedAt)}</span>
                    </div>
                    <h3 className="font-bold text-sm leading-snug line-clamp-2">{post.titleFa}</h3>
                    <p className="text-xs text-ink/70 dark:text-slate-400 line-clamp-2 mt-auto">{post.authorName}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Provincial Agents & Service Centers */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-ink dark:text-slate-100">{t('home.agentsSection')}</h2>
          <Link to="/agents" className="text-xs font-bold text-brand hover:underline">
            {t('home.viewAllProvinces')}
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.filter((a) => a.isActive).slice(0, 4).map((ag) => (
            <Link
              key={ag.id}
              to={`/agents/${ag.provinceSlug}`}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 hover:border-brand transition-colors space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <MapPin className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
                <span>{ag.province} — {ag.city}</span>
              </div>
              <p className="text-xs font-medium text-ink/80 dark:text-slate-300 line-clamp-1">{ag.nameFa}</p>
              <p className="text-[11px] text-ink/70 dark:text-slate-400 tabular-nums">{ag.phone}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Recently Viewed Products */}
      {recentProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold text-ink dark:text-slate-100">{t('home.recentlyViewed')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {recentProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
