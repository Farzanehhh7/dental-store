import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Award, Clock, MapPin, PackagePlus, Phone, Printer, ShieldCheck } from 'lucide-react';
import ProductCard from '../components/store/ProductCard';
import { EmptyState } from '../components/ui/States';
import { useStore } from '../context/StoreContext';
import { useI18n } from '../context/i18n';
import { buildResponsiveImageProps } from '../lib/media';
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
import type { Product } from '../types/domain';

export function BrandsListPage() {
  const { brands, products, settings } = useStore();
  const { t, formatDigits } = useI18n();

  useEffect(() => {
    applySeoHead({
      title: `${t('contentPages.brands.seoTitle')} | ${settings.storeNameFa}`,
      description: t('contentPages.brands.seoDesc'),
      canonicalPath: '/brands',
      robots: 'index, follow',
    });
  }, [settings.storeNameFa, t]);

  const sortedBrands = brands
    .filter((b) => b.isActive)
    .sort((a, b) => {
      const aHasCurated = products.some((p) => p.brandId === a.id && !p.id.startsWith('prod_cat_') && p.imageUrl.startsWith('/assets/products/'));
      const bHasCurated = products.some((p) => p.brandId === b.id && !p.id.startsWith('prod_cat_') && p.imageUrl.startsWith('/assets/products/'));
      if (aHasCurated !== bHasCurated) return aHasCurated ? -1 : 1;
      if (a.isAuthorizedDealer !== b.isAuthorizedDealer) return a.isAuthorizedDealer ? -1 : 1;
      return 0;
    });

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-2">
        <h1 className="text-2xl font-extrabold">{t('contentPages.brands.heading')}</h1>
        <p className="text-sm text-ink/70 dark:text-slate-400">
          {t('contentPages.brands.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedBrands.map((brand) => {
          const brandProds = products.filter((p) => p.brandId === brand.id && p.status === 'active');
          const previewImgs = Array.from(
            new Set(
              brandProds
                .filter((p) => !p.id.startsWith('prod_cat_') && p.imageUrl.startsWith('/assets/products/'))
                .map((p) => p.imageUrl)
            )
          ).slice(0, 3);
          return (
            <Link
              key={brand.id}
              to={`/brand/${brand.slug}`}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 hover:border-brand transition-colors space-y-3 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold">{brand.nameFa}</h2>
                  <p className="text-xs text-ink/65 dark:text-slate-400">{brand.nameEn} · {brand.countryFa}</p>
                </div>
                {brand.isAuthorizedDealer && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                    <Award className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('home.authorizedDealer')}
                  </span>
                )}
              </div>
              {previewImgs.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {previewImgs.map((imgUrl, idx) => (
                    <div key={idx} className="aspect-[4/3] rounded-lg bg-white border border-line/70 dark:border-slate-700 overflow-hidden p-1.5">
                      <img
                        {...buildResponsiveImageProps(imgUrl, { widths: [160, 320], sizes: '120px' })}
                        alt={brand.nameEn}
                        width={120}
                        height={90}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-ink/70 dark:text-slate-400 leading-relaxed line-clamp-2">{brand.descriptionFa}</p>
              <div className="mt-auto pt-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-brand dark:text-teal-300 tabular-nums">
                  {t('contentPages.brands.activeProducts', { count: formatDigits(brandProds.length) })}
                </span>
                {brand.websiteUrl && (
                  <span className="text-[11px] text-ink/60 dark:text-slate-400 truncate max-w-[140px]" dir="ltr">
                    {brand.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function BrandDetailPage() {
  const { slug } = useParams();
  const { brands, products, customerGroup, settings } = useStore();
  const { t } = useI18n();
  const brand = brands.find((b) => b.slug === slug);
  const [serverBrandState, setServerBrandState] = useState<{
    items: Product[];
    nextCursor: string | null;
    hasMore: boolean;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

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
          { name: t('common.home'), path: '/' },
          { name: t('nav.brands'), path: '/brands' },
          { name: brand.nameFa, path: `/brand/${brand.slug}` },
        ]),
      ],
    });
  }, [brand, settings.storeNameFa, t]);

  useEffect(() => {
    if (!brand) {
      setServerBrandState(null);
      return;
    }
    const ctrl = new AbortController();
    const qs = new URLSearchParams({
      brand: brand.slug,
      group: customerGroup,
      limit: '24',
    });
    fetch(`/api/catalog/products?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.items)) {
          setServerBrandState({
            items: data.items as Product[],
            nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
            hasMore: Boolean(data.hasMore),
          });
        }
      })
      .catch(() => {
        // Fallback to local store catalog
      });
    return () => ctrl.abort();
  }, [brand, customerGroup]);

  const handleLoadMoreBrand = async () => {
    if (!brand || !serverBrandState?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        brand: brand.slug,
        group: customerGroup,
        cursor: serverBrandState.nextCursor,
        limit: '24',
      });
      const res = await fetch(`/api/catalog/products?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.items)) {
        setServerBrandState((prev) => ({
          items: [...(prev?.items ?? []), ...(data.items as Product[])],
          nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
          hasMore: Boolean(data.hasMore),
        }));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  if (!brand) {
    return (
      <div className="max-w-4xl mx-auto p-12">
        <EmptyState
          title={t('contentPages.brands.notFound')}
          actionLabel={t('contentPages.brands.backToList')}
          actionTo="/brands"
        />
      </div>
    );
  }

  const localBrandProducts = products
    .filter((p) => p.brandId === brand.id && p.status !== 'archived')
    .sort((a, b) => {
      const aCurated = !a.id.startsWith('prod_cat_') ? 1 : 0;
      const bCurated = !b.id.startsWith('prod_cat_') ? 1 : 0;
      return bCurated - aCurated;
    });
  const brandProducts = serverBrandState ? serverBrandState.items : localBrandProducts;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">{brand.nameFa} ({brand.nameEn})</h1>
            <p className="text-xs text-ink/70 dark:text-slate-400 mt-1">
              {t('contentPages.brands.countryLabel', { country: brand.countryFa })}
              {brand.warrantyProvider ? ` · ${t('contentPages.brands.warrantySupport', { provider: brand.warrantyProvider })}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {brand.websiteUrl && (
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 text-xs font-bold text-ink/80 dark:text-slate-200 hover:border-brand"
                dir="ltr"
              >
                <span>{brand.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>
              </a>
            )}
            {brand.isAuthorizedDealer && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>{t('contentPages.brands.directGuarantee')}</span>
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed">{brand.descriptionFa}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {brandProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {serverBrandState?.hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={handleLoadMoreBrand}
            className="px-5 py-2.5 rounded-lg border border-line dark:border-slate-700 text-xs font-bold hover:border-brand disabled:opacity-50"
          >
            {loadingMore ? t('common.loading') : t('contentPages.brands.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}

export function PackDetailPage() {
  const { slug } = useParams();
  const { bundles, products, campaigns, currency, customerGroup, settings, contractPrices, authUser, addBundleToCart } = useStore();
  const { t, formatDigits, formatMoney } = useI18n();
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
          { name: t('common.home'), path: '/' },
          { name: bundle.nameFa, path: `/pack/${bundle.slug}` },
        ]),
      ],
    });
  }, [bundle, discountedTotal, settings.storeNameFa, t]);

  if (!bundle) {
    return (
      <div className="max-w-4xl mx-auto p-12">
        <EmptyState
          title={t('contentPages.pack.notFound')}
          actionLabel={t('actions.backHome')}
          actionTo="/"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <img
          {...buildResponsiveImageProps(bundle.imageUrl, {
            widths: [480, 800],
            sizes: '(max-width: 1024px) 100vw, 42vw',
            eager: true,
          })}
          alt={bundle.nameFa}
          width={640}
          height={480}
          className="lg:col-span-5 w-full aspect-[4/3] object-cover rounded-xl bg-surface"
        />
        <div className="lg:col-span-7 space-y-4">
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
            {t('contentPages.pack.savingLabel', { percent: formatDigits(bundle.discountPercent) })}
          </span>
          <h1 className="text-2xl lg:text-3xl font-extrabold">{bundle.nameFa}</h1>
          <p className="text-sm text-ink/75 dark:text-slate-300 leading-relaxed">{bundle.descriptionFa}</p>

          <div className="p-4 rounded-xl bg-surface/60 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              {originalTotal > 0 && (
                <p className="text-xs text-ink/55 dark:text-slate-400 line-through tabular-nums">{formatMoney(originalTotal, currency)}</p>
              )}
              <p className="text-2xl font-extrabold text-brand dark:text-teal-300 tabular-nums">
                {discountedTotal > 0 ? formatMoney(discountedTotal, currency) : t('contentPages.pack.priceInquiry')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => addBundleToCart(bundle.id)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              <PackagePlus className="w-4 h-4" aria-hidden="true" />
              <span>{t('contentPages.pack.addPackBtn')}</span>
            </button>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold">{t('contentPages.pack.itemsTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {itemsResolved.map(({ bi, product, variant, unitPrice }) => (
            <Link
              key={`${product.id}_${variant.id}`}
              to={`/product/${product.slug}`}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:border-brand transition-colors"
            >
              <img
                {...buildResponsiveImageProps(product.imageUrl, { widths: [160, 320], sizes: '80px' })}
                alt={product.titleFa}
                width={80}
                height={64}
                className="w-20 h-16 object-cover rounded-lg bg-surface shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{product.titleFa}</p>
                <p className="text-xs text-ink/70 dark:text-slate-400">
                  {variant.labelFa} · {t('contentPages.pack.qtyInPack')} <strong className="tabular-nums">{formatDigits(bi.quantity)}</strong>
                </p>
              </div>
              <span className="text-xs font-extrabold text-brand tabular-nums">
                {unitPrice > 0 ? formatMoney(unitPrice, currency) : t('cartDrawer.callForPriceShort')}
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
  const { t, formatDate, formatDigits, formatMoney } = useI18n();
  const pf = proformas.find((p) => p.shareToken === token || p.id === token);

  useEffect(() => {
    if (!pf) return;
    applySeoHead({
      title: `${t('contentPages.proforma.docPrefix')} ${pf.proformaNo} | ${settings.storeNameFa}`,
      description: t('contentPages.proforma.seoDesc', { name: pf.contactName }),
      canonicalPath: `/proforma/${token ?? ''}`,
      robots: 'noindex, nofollow',
    });
  }, [pf, token, settings.storeNameFa, t]);

  if (!pf) {
    return (
      <div className="max-w-3xl mx-auto p-12">
        <EmptyState
          title={t('contentPages.proforma.notFound')}
          actionLabel={t('comparePage.backToStore')}
          actionTo="/"
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-8 space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-4 border-b border-line dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-brand">
              {settings.storeNameFa} — {t('contentPages.proforma.title')}
            </h1>
            <p className="text-xs text-ink/70 dark:text-slate-400 mt-1">
              {t('contentPages.proforma.imedPhoneMeta', { code: settings.imedRegistryCode, phone: settings.phone })}
            </p>
          </div>
          <div className="text-start sm:text-end text-xs space-y-1">
            <p className="font-extrabold tabular-nums">
              {t('contentPages.proforma.numberLabel', { no: pf.proformaNo })}
            </p>
            <p>{t('contentPages.proforma.validUntil', { date: formatDate(pf.validUntil) })}</p>
            <p className="font-bold text-brand">
              {t('contentPages.proforma.statusLabel', {
                status: t(`proformaStatus.${pf.status}`, undefined, pf.status),
              })}
            </p>
          </div>
        </div>

        <div className="text-xs space-y-1">
          <p>
            {t('contentPages.proforma.buyerLabel')} <strong>{pf.contactName}</strong> {pf.clinicName ? `(${pf.clinicName})` : ''}
          </p>
          <p>
            {t('contentPages.proforma.phoneLabel')} <span className="tabular-nums">{pf.contactMobile}</span>
          </p>
        </div>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[460px] text-xs border-collapse border border-line dark:border-slate-700">
            <thead>
              <tr className="bg-surface dark:bg-slate-800">
                <th className="border border-line dark:border-slate-700 p-2 text-start">{t('contentPages.proforma.colItem')}</th>
                <th className="border border-line dark:border-slate-700 p-2">{t('contentPages.proforma.colQty')}</th>
                <th className="border border-line dark:border-slate-700 p-2">{t('contentPages.proforma.colUnitPrice')}</th>
                <th className="border border-line dark:border-slate-700 p-2">{t('contentPages.proforma.colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {pf.items.map((it) => (
                <tr key={it.variantId}>
                  <td className="border border-line dark:border-slate-700 p-2">{it.titleFa} ({it.variantLabelFa})</td>
                  <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{formatDigits(it.quantity)}</td>
                  <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{formatMoney(it.unitPrice, currency)}</td>
                  <td className="border border-line dark:border-slate-700 p-2 text-center tabular-nums">{formatMoney(it.lineTotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center text-sm font-extrabold pt-2">
          <span>{t('contentPages.proforma.grandTotalLabel')}</span>
          <span className="tabular-nums text-brand">{formatMoney(pf.grandTotal, currency)}</span>
        </div>

        <p className="text-xs text-ink/70 dark:text-slate-400">{pf.termsFa}</p>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('contentPages.proforma.printBtn')}</span>
          </button>
          {(pf.status === 'draft' || pf.status === 'sent' || pf.status === 'viewed') && (
            <>
              <button
                type="button"
                onClick={() => respondProforma(pf.id, 'accepted')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                {t('contentPages.proforma.acceptBtn')}
              </button>
              <button
                type="button"
                onClick={() => respondProforma(pf.id, 'rejected')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-300 text-rose-700 dark:text-rose-400 text-xs font-bold"
              >
                {t('contentPages.proforma.rejectBtn')}
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
  const { t } = useI18n();
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
      title: `${t('contentPages.agents.seoTitle')} | ${settings.storeNameFa}`,
      description: t('contentPages.agents.seoDesc'),
      canonicalPath: selectedProvince === 'all' ? '/agents' : `/agents/${selectedProvince}`,
      robots: 'index, follow',
      jsonLd: visibleAgents.map(buildAgentJsonLd),
    });
  }, [selectedProvince, visibleAgents, settings.storeNameFa, t]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">{t('contentPages.agents.heading')}</h1>
          <p className="text-sm text-ink/70 dark:text-slate-400 mt-1">
            {t('contentPages.agents.subtitle')}
          </p>
        </div>
        <select
          value={selectedProvince}
          onChange={(e) => setSelectedProvince(e.target.value)}
          aria-label={t('contentPages.agents.provinceAria')}
          className="px-4 py-2 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-sm font-bold"
        >
          <option value="all">{t('contentPages.agents.allProvinces')}</option>
          {provinces.map((pr) => (
            <option key={pr.slug} value={pr.slug}>{pr.name}</option>
          ))}
        </select>
      </div>

      {visibleAgents.length === 0 ? (
        <EmptyState title={t('contentPages.agents.empty')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleAgents.map((ag) => (
            <article key={ag.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
              <h2 className="text-base font-extrabold">{ag.nameFa}</h2>
              <p className="text-xs text-ink/70 dark:text-slate-400 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                <span>{ag.province}{t('common.commaSeparator')}{ag.city} — {ag.address}</span>
              </p>
              <p className="text-xs tabular-nums flex items-center gap-2">
                <Phone className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
                <span>{ag.phone} · {ag.mobile}</span>
              </p>
              <p className="text-xs text-ink/70 dark:text-slate-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
                <span>{ag.workingHoursFa}</span>
              </p>
              <p className="text-[11px] text-brand dark:text-teal-300 pt-2 border-t border-line dark:border-slate-800">
                {t('contentPages.agents.coveredBrands', {
                  brands: ag.brandIds.map((bid) => brands.find((b) => b.id === bid)?.nameFa).filter(Boolean).join(' · '),
                })}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogListPage() {
  const { slug: categorySlug } = useParams();
  const { blogPosts, settings } = useStore();
  const { t, formatDate, formatDigits } = useI18n();
  const published = blogPosts.filter((p) => p.status === 'published');
  const categories = Array.from(new Set(published.map((p) => p.categoryFa)));
  const filtered = categorySlug
    ? published.filter((p) => p.categoryFa === decodeURIComponent(categorySlug))
    : published;

  useEffect(() => {
    applySeoHead({
      title: `${t('contentPages.blog.seoTitle')} ${categorySlug ? `— ${decodeURIComponent(categorySlug)}` : ''} | ${settings.storeNameFa}`,
      description: t('contentPages.blog.seoDesc'),
      canonicalPath: categorySlug ? `/blog/category/${categorySlug}` : '/blog',
      robots: 'index, follow',
    });
  }, [settings.storeNameFa, categorySlug, t]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3">
        <h1 className="text-xl sm:text-2xl font-extrabold">{t('contentPages.blog.heading')}</h1>
        <p className="text-sm text-ink/70 dark:text-slate-400">
          {t('contentPages.blog.subtitle')}
        </p>
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pt-2 pb-1 text-xs">
          <Link
            to="/blog"
            className={`px-3 py-2 rounded-lg border font-bold whitespace-nowrap shrink-0 ${
              !categorySlug ? 'bg-brand text-white border-brand' : 'border-line dark:border-slate-700'
            }`}
          >
            {t('contentPages.blog.allPosts')}
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              to={`/blog/category/${encodeURIComponent(cat)}`}
              className={`px-3 py-2 rounded-lg border font-bold whitespace-nowrap shrink-0 ${
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

      {filtered.length === 0 ? (
        <EmptyState title={t('contentPages.blog.empty')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {filtered.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden hover:border-brand transition-colors flex flex-col"
            >
              <img
                {...buildResponsiveImageProps(post.imageUrl, {
                  widths: [400, 640],
                  sizes: '(max-width: 768px) 100vw, 33vw',
                })}
                alt={post.titleFa}
                width={640}
                height={360}
                className="aspect-[16/9] w-full object-cover bg-surface"
              />
              <div className="p-5 space-y-2.5 flex-1 flex flex-col">
                <span className="text-[11px] font-bold text-brand dark:text-teal-300">
                  {post.categoryFa} · {formatDate(post.publishedAt)}
                </span>
                <h2 className="text-base font-extrabold leading-snug">{post.titleFa}</h2>
                <p className="text-xs text-ink/70 dark:text-slate-400 line-clamp-3 flex-1">{post.excerptFa}</p>
                <div className="pt-3 border-t border-line dark:border-slate-800 text-[11px] text-ink/70 dark:text-slate-400 flex justify-between">
                  <span>{post.authorName}</span>
                  <span>{t('contentPages.blog.readingMinutes', { minutes: formatDigits(post.readingMinutes) })}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const { blogPosts, products, settings } = useStore();
  const { t, formatDate } = useI18n();
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
          { name: t('common.home'), path: '/' },
          { name: t('nav.blog'), path: '/blog' },
          { name: post.titleFa, path: `/blog/${post.slug}` },
        ]),
        ...(faqLd ? [faqLd] : []),
      ],
    });
  }, [post, settings, t]);

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto p-12">
        <EmptyState
          title={t('contentPages.blog.postNotFound')}
          actionLabel={t('contentPages.blog.backToBlog')}
          actionTo="/blog"
        />
      </div>
    );
  }

  const mentionedProducts = products.filter((p) => post.productIds.includes(p.id));

  return (
    <article className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-bold text-brand dark:text-teal-300">
          {post.categoryFa} · {t('contentPages.blog.publishedAt', { date: formatDate(post.publishedAt, true) })}
        </span>
        <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight">{post.titleFa}</h1>
        <div className="flex flex-wrap gap-4 text-xs text-ink/70 dark:text-slate-400">
          <span>
            {t('contentPages.blog.authorLabel')} <strong>{post.authorName}</strong> ({post.authorRole})
          </span>
          {post.reviewedBy && (
            <span>
              {t('contentPages.blog.reviewedByLabel')} <strong>{post.reviewedBy}</strong>
            </span>
          )}
          <span>{t('contentPages.blog.updatedAt', { date: formatDate(post.updatedAt) })}</span>
        </div>
      </div>

      <img
        {...buildResponsiveImageProps(post.imageUrl, {
          widths: [640, 960],
          sizes: '(max-width: 1024px) 100vw, 896px',
          eager: true,
        })}
        alt={post.titleFa}
        width={960}
        height={540}
        className="w-full aspect-[16/9] object-cover rounded-2xl bg-surface"
      />

      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-4 text-sm leading-8 text-ink/85 dark:text-slate-200 whitespace-pre-line">
        {post.bodyFa}
      </div>

      {post.faq && post.faq.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{t('contentPages.blog.faqHeading')}</h2>
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
          <h2 className="text-lg font-extrabold">{t('contentPages.blog.mentionedProducts')}</h2>
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

const STATIC_SLUG_KEYS = ['about', 'contact', 'returns', 'privacy', 'warranty'] as const;

export function StaticInfoPage() {
  const { slug = 'about' } = useParams();
  const { pages, faqs, settings } = useStore();
  const { t } = useI18n();
  const cmsPage = pages.find((p) => p.slug === slug && p.status === 'published');
  const keySlug = (STATIC_SLUG_KEYS as readonly string[]).includes(slug) ? slug : 'about';
  const pageTitle = cmsPage?.titleFa || t(`staticPages.${keySlug}.title`);
  const pageBody = cmsPage?.bodyFa || t(`staticPages.${keySlug}.body`);
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
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-4">
        <h1 className="text-2xl font-extrabold">{pageTitle}</h1>
        <p className="text-sm leading-8 text-ink/80 dark:text-slate-300 whitespace-pre-line">{pageBody}</p>
        <div className="pt-4 border-t border-line dark:border-slate-800 text-xs text-ink/70 dark:text-slate-400 space-y-1">
          <p>{t('staticPages.addressLabel', { address: settings.addressFa })}</p>
          <p className="tabular-nums">
            {t('staticPages.phoneImedLabel', { phone: settings.phone, code: settings.imedRegistryCode })}
          </p>
        </div>
      </div>

      {activeFaqs.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-extrabold">{t('staticPages.faqTitle')}</h2>
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
  const { t, formatDigits } = useI18n();
  const location = useLocation();

  useEffect(() => {
    applySeoHead({
      title: `${t('notFoundPage.heading')} | ${settings.storeNameFa}`,
      description: t('notFoundPage.seoDesc'),
      canonicalPath: '/404',
      robots: 'noindex, nofollow',
    });
    void recordNotFoundHit(location.pathname);
  }, [settings.storeNameFa, location.pathname, t]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-5">
      <p className="text-5xl font-extrabold text-brand tabular-nums">{formatDigits(404)}</p>
      <h1 className="text-2xl font-extrabold">{t('notFoundPage.heading')}</h1>
      <p className="text-sm text-ink/70 dark:text-slate-400">
        {t('notFoundPage.description')}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
          {t('actions.backHome')}
        </Link>
        <Link to="/search" className="px-5 py-2.5 rounded-xl border border-line dark:border-slate-700 text-sm font-bold">
          {t('notFoundPage.searchCatalogBtn')}
        </Link>
      </div>
    </div>
  );
}
