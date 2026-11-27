import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BellOff,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ImagePlus,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { HeroSlideView } from '../../components/store/HeroBannerSlider';
import { resolveAuthHeaders } from '../../context/storeHelpers';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { BRAND_OFFICIAL_IMAGES } from '../../data/brandProducts';
import { IMG_COMPOSITE, IMG_EQUIPMENT, IMG_HERO_CLINIC, IMG_ROTARY } from '../../data/seed';
import {
  AbandonedCartRecord,
  AgentBranch,
  BannerItem,
  BlogPost,
  CampaignRun,
  CampaignSegment,
  FaqItem,
  MarketingChannel,
  NewsletterSubscriber,
  OutboxMessage,
  OutboxStatus,
  SitePage,
  SuppressionEntry,
} from '../../types/domain';

const PRESET_BANNER_IMAGES: { labelKey: string; url: string }[] = [
  { labelKey: 'adminContent.presets.clinic', url: IMG_HERO_CLINIC },
  { labelKey: 'adminContent.presets.composite', url: IMG_COMPOSITE },
  { labelKey: 'adminContent.presets.equipment', url: IMG_EQUIPMENT },
  { labelKey: 'adminContent.presets.rotary', url: IMG_ROTARY },
  { labelKey: 'adminContent.presets.kavo', url: '/assets/products/kavo-estetica-unit.jpg' },
  { labelKey: 'adminContent.presets.melag', url: '/assets/products/melag-vacuklav.jpg' },
  { labelKey: 'adminContent.presets.whLisa', url: '/assets/products/wh-lisa-autoclave.jpg' },
  { labelKey: 'adminContent.presets.filtek', url: '/assets/products/3m-filtek-universal.jpg' },
  { labelKey: 'adminContent.presets.protaper', url: '/assets/products/dentsply-protaper-gold.jpg' },
  { labelKey: 'adminContent.presets.ivoclar', url: '/assets/products/ivoclar-bluephase-powercure.png' },
  { labelKey: 'adminContent.presets.straumann', url: '/assets/products/straumann-implant-system.webp' },
  { labelKey: 'adminContent.presets.vatech', url: '/assets/products/vatech-greenx.jpg' },
];

interface BannerFormState {
  id: string;
  slot: BannerItem['slot'];
  layout: 'split' | 'overlay';
  accentTone: 'brand' | 'rose' | 'amber' | 'slate';
  badgeTextFa: string;
  titleFa: string;
  subtitleFa: string;
  ctaTextFa: string;
  linkPath: string;
  secondaryCtaTextFa: string;
  secondaryLinkPath: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
}

function createEmptyBannerForm(
  nextSortOrder: number,
  defaults?: { badgeText?: string; ctaText?: string }
): BannerFormState {
  return {
    id: '',
    slot: 'hero',
    layout: 'split',
    accentTone: 'brand',
    badgeTextFa: defaults?.badgeText ?? '',
    titleFa: '',
    subtitleFa: '',
    ctaTextFa: defaults?.ctaText ?? '',
    linkPath: '/category/consumables',
    secondaryCtaTextFa: '',
    secondaryLinkPath: '',
    imageUrl: IMG_HERO_CLINIC,
    isActive: true,
    sortOrder: nextSortOrder,
  };
}

function compressBannerImageFile(file: File, errs: { read: string; format: string; canvas: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(errs.read));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(errs.format));
      img.onload = () => {
        const maxWidth = 1280;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error(errs.canvas));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function AdminContentPage() {
  const {
    authUser,
    currency,
    blogPosts,
    pages,
    banners,
    faqs,
    agents,
    brands,
    categories,
    newsletterSubscribers,
    upsertBlogPost,
    deleteBlogPost,
    upsertSitePage,
    deleteSitePage,
    upsertBanner,
    deleteBanner,
    upsertFaq,
    deleteFaq,
    upsertAgent,
    deleteAgent,
    pushToast,
  } = useStore();
  const { t, formatDate, formatDateTime, formatDigits, formatMoney } = useI18n();

  const [tab, setTab] = useState<'blog' | 'pages' | 'banners' | 'faqs' | 'agents' | 'marketing'>('blog');
  const [postForm, setPostForm] = useState({ id: '', titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  const [pageForm, setPageForm] = useState({ id: '', slug: '', titleFa: '', bodyFa: '' });
  const [bannerForm, setBannerForm] = useState<BannerFormState>(() =>
    createEmptyBannerForm(banners.length + 1, {
      badgeText: t('adminContent.defaultBannerBadge'),
      ctaText: t('adminContent.defaultBannerCta'),
    })
  );
  const [faqForm, setFaqForm] = useState({ categoryFa: 'ارسال و اصالت', questionFa: '', answerFa: '' });
  const [agentForm, setAgentForm] = useState({ nameFa: '', province: 'فارس', provinceSlug: 'fars', city: 'شیراز', phone: '071-32300000', address: '' });

  // Phase 9 Marketing Automation State
  const [mktLoading, setMktLoading] = useState(false);
  const [mktBusy, setMktBusy] = useState(false);
  const [providerMode, setProviderMode] = useState<'sandbox' | 'live'>('sandbox');
  const [providerName, setProviderName] = useState('sandbox');
  const [mktConfig, setMktConfig] = useState({
    quietHoursStart: 22,
    quietHoursEnd: 8,
    abandonedCartMinutes: 30,
    reminderThrottleHours: 24,
    perRecipientDailyMax: 3,
  });
  const [campaignRuns, setCampaignRuns] = useState<CampaignRun[]>([]);
  const [outboxMessages, setOutboxMessages] = useState<OutboxMessage[]>([]);
  const [outboxFilter, setOutboxFilter] = useState<string>('all');
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCartRecord[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionEntry[]>([]);
  const [serverSubscribers, setServerSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [suppressionContact, setSuppressionContact] = useState('');
  const [suppressionNote, setSuppressionNote] = useState('');
  const [campaignForm, setCampaignForm] = useState<{
    title: string;
    channel: MarketingChannel;
    segment: CampaignSegment;
    subject: string;
    message: string;
    customContactsText: string;
    respectQuietHours: boolean;
  }>({
    title: 'جشنواره تجهیزات اندو و مصرفی',
    channel: 'sms',
    segment: 'newsletter_subscribers',
    subject: 'اطلاعیه ویژه دنتال‌مارکت',
    message: 'کلینیک گرامی، جشنواره تجهیزات اندو دنتال‌مارکت با ۱۵٪ تخفیف همکار آغاز شد.',
    customContactsText: '',
    respectQuietHours: true,
  });

  const loadMarketingOverview = useCallback(async () => {
    if (!authUser) return;
    setMktLoading(true);
    try {
      const headers = await resolveAuthHeaders(authUser);
      const res = await fetch('/api/admin/marketing/overview', {
        method: 'GET',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || t('adminContent.mktLoadError'), 'error');
        return;
      }
      setProviderMode(data.providerMode === 'live' ? 'live' : 'sandbox');
      setProviderName(String(data.providerName || 'sandbox'));
      if (data.config) {
        setMktConfig({
          quietHoursStart: Number(data.config.quietHoursStart ?? 22),
          quietHoursEnd: Number(data.config.quietHoursEnd ?? 8),
          abandonedCartMinutes: Number(data.config.abandonedCartMinutes ?? 30),
          reminderThrottleHours: Number(data.config.reminderThrottleHours ?? 24),
          perRecipientDailyMax: Number(data.config.perRecipientDailyMax ?? 3),
        });
      }
      setCampaignRuns(Array.isArray(data.campaigns) ? data.campaigns : []);
      setOutboxMessages(Array.isArray(data.outbox) ? data.outbox : []);
      setAbandonedCarts(Array.isArray(data.abandonedCarts) ? data.abandonedCarts : []);
      setSuppressions(Array.isArray(data.suppressions) ? data.suppressions : []);
      setServerSubscribers(Array.isArray(data.subscribers) ? data.subscribers : []);
    } catch {
      pushToast(t('adminContent.mktFetchError'), 'error');
    } finally {
      setMktLoading(false);
    }
  }, [authUser, pushToast, t]);

  useEffect(() => {
    if (tab === 'marketing' && authUser) {
      void loadMarketingOverview();
    }
  }, [tab, authUser, loadMarketingOverview]);

  const sortedBanners = useMemo(
    () => [...banners].sort((a, b) => a.sortOrder - b.sortOrder),
    [banners]
  );

  const activeBrandsList = useMemo(
    () =>
      brands
        .filter((b) => b.isActive)
        .sort((a, b) => (BRAND_OFFICIAL_IMAGES[b.id] ? 1 : 0) - (BRAND_OFFICIAL_IMAGES[a.id] ? 1 : 0)),
    [brands]
  );

  const activeCategoriesList = useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder),
    [categories]
  );

  const previewBanner: BannerItem = {
    id: bannerForm.id || 'preview_slide',
    slot: bannerForm.slot,
    layout: bannerForm.layout,
    accentTone: bannerForm.accentTone,
    badgeTextFa: bannerForm.badgeTextFa.trim() || undefined,
    titleFa: bannerForm.titleFa.trim() || t('adminContent.previewDefaultTitle'),
    subtitleFa: bannerForm.subtitleFa.trim() || t('adminContent.previewDefaultSubtitle'),
    ctaTextFa: bannerForm.ctaTextFa.trim() || t('adminContent.defaultBannerCta'),
    linkPath: bannerForm.linkPath.trim() || '/',
    secondaryCtaTextFa: bannerForm.secondaryCtaTextFa.trim() || undefined,
    secondaryLinkPath: bannerForm.secondaryLinkPath.trim() || undefined,
    imageUrl: bannerForm.imageUrl.trim() || IMG_HERO_CLINIC,
    isActive: bannerForm.isActive,
    sortOrder: bannerForm.sortOrder,
  };

  const applyDiscountPreset = () => {
    setBannerForm((prev) => ({
      ...prev,
      slot: 'hero',
      layout: 'overlay',
      accentTone: 'rose',
      badgeTextFa: t('adminContent.discountPreset.badge'),
      titleFa: t('adminContent.discountPreset.title'),
      subtitleFa: t('adminContent.discountPreset.subtitle'),
      ctaTextFa: t('adminContent.discountPreset.cta'),
      linkPath: '/search?discount=1',
      secondaryCtaTextFa: t('adminContent.discountPreset.secondaryCta'),
      secondaryLinkPath: '/pack/new-clinic-starter-pack',
      imageUrl: IMG_COMPOSITE,
    }));
  };

  const applyBrandPreset = (brandId: string) => {
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;
    const officialImg = BRAND_OFFICIAL_IMAGES[brand.id]?.[0];
    setBannerForm((prev) => ({
      ...prev,
      slot: 'hero',
      accentTone: 'brand',
      badgeTextFa: t('adminContent.brandPreset.badge', { country: brand.countryFa }),
      titleFa: t('adminContent.brandPreset.title', { nameFa: brand.nameFa, nameEn: brand.nameEn }),
      subtitleFa: t('adminContent.brandPreset.subtitle', { nameFa: brand.nameFa }),
      ctaTextFa: t('adminContent.brandPreset.cta', { nameFa: brand.nameFa }),
      linkPath: `/brand/${brand.slug}`,
      secondaryCtaTextFa: t('adminContent.brandPreset.secondaryCta'),
      secondaryLinkPath: '/brands',
      imageUrl: officialImg || prev.imageUrl || IMG_EQUIPMENT,
    }));
  };

  const applyCategoryPreset = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    setBannerForm((prev) => ({
      ...prev,
      slot: 'hero',
      accentTone: 'brand',
      badgeTextFa: t('adminContent.categoryPreset.badge'),
      titleFa: t('adminContent.categoryPreset.title', { name: cat.nameFa }),
      subtitleFa: cat.descriptionFa || t('adminContent.categoryPreset.subtitle', { name: cat.nameFa }),
      ctaTextFa: t('adminContent.categoryPreset.cta', { name: cat.nameFa }),
      linkPath: `/category/${cat.slug}`,
    }));
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.titleFa.trim()) {
      pushToast(t('adminContent.bannerTitleRequired'), 'error');
      return;
    }
    if (bannerForm.imageUrl.length > 420000) {
      pushToast(t('adminContent.bannerImageTooLarge'), 'error');
      return;
    }
    const nextBanner: BannerItem = {
      id: bannerForm.id || `bn_${Date.now()}`,
      slot: bannerForm.slot,
      layout: bannerForm.layout,
      accentTone: bannerForm.accentTone,
      badgeTextFa: bannerForm.badgeTextFa.trim() || undefined,
      titleFa: bannerForm.titleFa.trim(),
      subtitleFa: bannerForm.subtitleFa.trim(),
      ctaTextFa: bannerForm.ctaTextFa.trim() || t('adminContent.bannerDefaultViewCta'),
      linkPath: bannerForm.linkPath.trim() || '/',
      secondaryCtaTextFa: bannerForm.secondaryCtaTextFa.trim() || undefined,
      secondaryLinkPath: bannerForm.secondaryLinkPath.trim() || undefined,
      imageUrl: bannerForm.imageUrl.trim() || IMG_HERO_CLINIC,
      isActive: bannerForm.isActive,
      sortOrder: Number(bannerForm.sortOrder) || sortedBanners.length + 1,
    };
    await upsertBanner(nextBanner);
    setBannerForm(
      createEmptyBannerForm(sortedBanners.length + 2, {
        badgeText: t('adminContent.defaultBannerBadge'),
        ctaText: t('adminContent.defaultBannerCta'),
      })
    );
  };

  const handleEditBanner = (b: BannerItem) => {
    setBannerForm({
      id: b.id,
      slot: b.slot,
      layout: b.layout === 'overlay' ? 'overlay' : 'split',
      accentTone: b.accentTone ?? 'brand',
      badgeTextFa: b.badgeTextFa ?? '',
      titleFa: b.titleFa,
      subtitleFa: b.subtitleFa,
      ctaTextFa: b.ctaTextFa,
      linkPath: b.linkPath,
      secondaryCtaTextFa: b.secondaryCtaTextFa ?? '',
      secondaryLinkPath: b.secondaryLinkPath ?? '',
      imageUrl: b.imageUrl || IMG_HERO_CLINIC,
      isActive: b.isActive,
      sortOrder: b.sortOrder,
    });
  };

  const handleMoveBanner = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= sortedBanners.length) return;
    const current = sortedBanners[index];
    const swapWith = sortedBanners[targetIdx];
    const orderA = current.sortOrder;
    const orderB = swapWith.sortOrder === orderA ? orderA + direction : swapWith.sortOrder;
    await Promise.all([
      upsertBanner({ ...current, sortOrder: orderB }),
      upsertBanner({ ...swapWith, sortOrder: orderA }),
    ]);
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressBannerImageFile(file, {
        read: t('adminContent.imageReadError'),
        format: t('adminContent.imageFormatError'),
        canvas: t('adminContent.imageCanvasError'),
      });
      if (compressed.length > 420000) {
        pushToast(t('adminContent.bannerCompressedTooLarge'), 'error');
        return;
      }
      setBannerForm((prev) => ({ ...prev, imageUrl: compressed }));
      pushToast(t('adminContent.bannerImageLoaded'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t('adminContent.imageProcessError'), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const post: BlogPost = {
      id: postForm.id || `blog_${now}`,
      titleFa: postForm.titleFa,
      slug: `post-${now}`,
      categoryFa: postForm.categoryFa,
      excerptFa: postForm.excerptFa,
      bodyFa: postForm.bodyFa,
      imageUrl: '/assets/images/hero_dental_clinic_1794921818923.jpg',
      authorName: 'دکتر سارا احمدی',
      authorRole: 'متخصص دندانپزشکی ترمیمی',
      reviewedBy: 'هیئت علمی دنتال‌مارکت',
      readingMinutes: 5,
      productIds: [],
      status: 'published',
      publishedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await upsertBlogPost(post);
    setPostForm({ id: '', titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-lg sm:text-xl font-extrabold">{t('adminContent.title')}</h1>

      <div className="w-full max-w-full flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 text-xs pb-1">
        {[
          { id: 'blog', label: t('adminContent.tabs.blog', { count: formatDigits(blogPosts.length) }) },
          { id: 'pages', label: t('adminContent.tabs.pages', { count: formatDigits(pages.length) }) },
          { id: 'banners', label: t('adminContent.tabs.banners', { count: formatDigits(banners.length) }) },
          { id: 'faqs', label: t('adminContent.tabs.faqs', { count: formatDigits(faqs.length) }) },
          { id: 'agents', label: t('adminContent.tabs.agents', { count: formatDigits(agents.length) }) },
          { id: 'marketing', label: t('adminContent.tabs.marketing', { count: formatDigits(newsletterSubscribers.length) }) },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id as typeof tab)}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === tabItem.id
                ? 'bg-brand text-white'
                : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'blog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <form
            onSubmit={handlePublishPost}
            className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3"
          >
            <h2 className="text-base font-extrabold">
              {postForm.id ? t('adminContent.editArticle') : t('adminContent.newArticle')}
            </h2>
            <input
              required
              value={postForm.titleFa}
              onChange={(e) => setPostForm({ ...postForm, titleFa: e.target.value })}
              placeholder={t('adminContent.articleTitlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={postForm.categoryFa}
              onChange={(e) => setPostForm({ ...postForm, categoryFa: e.target.value })}
              placeholder={t('adminContent.articleCategoryPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              required
              value={postForm.excerptFa}
              onChange={(e) => setPostForm({ ...postForm, excerptFa: e.target.value })}
              placeholder={t('adminContent.articleExcerptPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              required
              rows={4}
              value={postForm.bodyFa}
              onChange={(e) => setPostForm({ ...postForm, bodyFa: e.target.value })}
              placeholder={t('adminContent.articleBodyPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button type="submit" className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold">
              {t('adminContent.publishArticleBtn')}
            </button>
          </form>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-extrabold">{t('adminContent.articlesListTitle')}</h2>
            {blogPosts.map((bp) => (
              <div
                key={bp.id}
                className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{bp.titleFa}</p>
                  <p className="text-ink/55">
                    {bp.authorName} · {formatDate(bp.publishedAt)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPostForm({
                        id: bp.id,
                        titleFa: bp.titleFa,
                        categoryFa: bp.categoryFa,
                        excerptFa: bp.excerptFa,
                        bodyFa: bp.bodyFa,
                      })
                    }
                    className="min-h-[34px] px-2 text-brand font-bold"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBlogPost(bp.id)}
                    className="min-h-[34px] px-2 text-rose-600 font-bold"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-extrabold">{t('adminContent.cmsFormTitle')}</h2>
            <input
              dir="ltr"
              value={pageForm.slug}
              onChange={(e) => setPageForm({ ...pageForm, slug: e.target.value })}
              placeholder={t('adminContent.cmsSlugPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={pageForm.titleFa}
              onChange={(e) => setPageForm({ ...pageForm, titleFa: e.target.value })}
              placeholder={t('adminContent.cmsTitlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <textarea
              rows={4}
              value={pageForm.bodyFa}
              onChange={(e) => setPageForm({ ...pageForm, bodyFa: e.target.value })}
              placeholder={t('adminContent.cmsBodyPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={async () => {
                if (!pageForm.slug || !pageForm.titleFa) return;
                const sp: SitePage = {
                  id: pageForm.id || `pg_${Date.now()}`,
                  slug: pageForm.slug,
                  titleFa: pageForm.titleFa,
                  bodyFa: pageForm.bodyFa,
                  status: 'published',
                  updatedAt: new Date().toISOString(),
                };
                await upsertSitePage(sp);
                setPageForm({ id: '', slug: '', titleFa: '', bodyFa: '' });
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminContent.savePageBtn')}
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
            {pages.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{p.titleFa}</p>
                  <p className="text-ink/55 break-all">/page/{p.slug}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPageForm({ id: p.id, slug: p.slug, titleFa: p.titleFa, bodyFa: p.bodyFa })}
                    className="min-h-[34px] px-2 text-brand font-bold"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSitePage(p.id)}
                    className="min-h-[34px] px-2 text-rose-600 font-bold"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'banners' && (
        <div className="space-y-6 text-xs">
          {/* Quick Presets Bar */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand shrink-0" />
                <h2 className="text-sm font-extrabold">{t('adminContent.quickPresetsTitle')}</h2>
              </div>
              <span className="text-ink/60 dark:text-slate-400">{t('adminContent.quickPresetsSubtitle')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={applyDiscountPreset}
                className="min-h-[42px] px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold text-start hover:border-rose-500 transition-colors"
              >
                {t('adminContent.discountPresetBtn')}
              </button>

              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyBrandPreset(e.target.value);
                  e.target.value = '';
                }}
                aria-label={t('adminContent.brandPresetAria')}
                className="min-h-[42px] px-3 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="">{t('adminContent.brandPresetOption')}</option>
                {activeBrandsList.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.nameFa} ({br.nameEn}) {BRAND_OFFICIAL_IMAGES[br.id] ? t('adminContent.officialImageStar') : ''}
                  </option>
                ))}
              </select>

              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyCategoryPreset(e.target.value);
                  e.target.value = '';
                }}
                aria-label={t('adminContent.categoryPresetAria')}
                className="min-h-[42px] px-3 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="">{t('adminContent.categoryPresetOption')}</option>
                {activeCategoriesList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.depth > 0 ? '— ' : ''}
                    {cat.nameFa}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Banner Editor Form */}
            <form
              onSubmit={handleSaveBanner}
              className="xl:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold">
                  {bannerForm.id ? t('adminContent.editBannerHeading') : t('adminContent.addBannerHeading')}
                </h2>
                {bannerForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setBannerForm(
                        createEmptyBannerForm(sortedBanners.length + 1, {
                          badgeText: t('adminContent.defaultBannerBadge'),
                          ctaText: t('adminContent.defaultBannerCta'),
                        })
                      )
                    }
                    className="text-rose-600 font-bold hover:underline"
                  >
                    {t('adminContent.cancelEditBtn')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerSlotLabel')}</span>
                  <select
                    value={bannerForm.slot}
                    onChange={(e) => setBannerForm({ ...bannerForm, slot: e.target.value as BannerItem['slot'] })}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="hero">{t('adminContent.slotHero')}</option>
                    <option value="top_strip">{t('adminContent.slotTopStrip')}</option>
                    <option value="mid_promo">{t('adminContent.slotMidPromo')}</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerLayoutLabel')}</span>
                  <select
                    value={bannerForm.layout}
                    onChange={(e) => setBannerForm({ ...bannerForm, layout: e.target.value as 'split' | 'overlay' })}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="split">{t('adminContent.layoutSplitOption')}</option>
                    <option value="overlay">{t('adminContent.layoutOverlayOption')}</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="sm:col-span-2 space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerBadgeLabel')}</span>
                  <input
                    value={bannerForm.badgeTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, badgeTextFa: e.target.value })}
                    placeholder={t('adminContent.bannerBadgePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerToneLabel')}</span>
                  <select
                    value={bannerForm.accentTone}
                    onChange={(e) =>
                      setBannerForm({
                        ...bannerForm,
                        accentTone: e.target.value as BannerFormState['accentTone'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="brand">{t('adminContent.toneBrand')}</option>
                    <option value="rose">{t('adminContent.toneRose')}</option>
                    <option value="amber">{t('adminContent.toneAmber')}</option>
                    <option value="slate">{t('adminContent.toneSlate')}</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerTitleLabel')}</span>
                <input
                  required
                  value={bannerForm.titleFa}
                  onChange={(e) => setBannerForm({ ...bannerForm, titleFa: e.target.value })}
                  placeholder={t('adminContent.bannerTitlePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerSubtitleLabel')}</span>
                <textarea
                  rows={2}
                  value={bannerForm.subtitleFa}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitleFa: e.target.value })}
                  placeholder={t('adminContent.bannerSubtitlePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerCtaLabel')}</span>
                  <input
                    value={bannerForm.ctaTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, ctaTextFa: e.target.value })}
                    placeholder={t('adminContent.bannerCtaPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerLinkLabel')}</span>
                  <input
                    dir="ltr"
                    value={bannerForm.linkPath}
                    onChange={(e) => setBannerForm({ ...bannerForm, linkPath: e.target.value })}
                    placeholder="/brand/kavo"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerCta2Label')}</span>
                  <input
                    value={bannerForm.secondaryCtaTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, secondaryCtaTextFa: e.target.value })}
                    placeholder={t('adminContent.bannerCta2Placeholder')}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerLink2Label')}</span>
                  <input
                    dir="ltr"
                    value={bannerForm.secondaryLinkPath}
                    onChange={(e) => setBannerForm({ ...bannerForm, secondaryLinkPath: e.target.value })}
                    placeholder="/brands"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink/70 dark:text-slate-300">{t('adminContent.bannerImageLabel')}</span>
                  <label className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 hover:border-brand cursor-pointer font-bold">
                    <ImagePlus className="w-3.5 h-3.5 text-brand" />
                    <span>{t('adminContent.uploadBannerImageBtn')}</span>
                    <input type="file" accept="image/*" onChange={handleBannerFileChange} className="hidden" />
                  </label>
                </div>
                <input
                  dir="ltr"
                  value={bannerForm.imageUrl}
                  onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                  placeholder="/assets/products/... or https://..."
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                  {PRESET_BANNER_IMAGES.map((img) => {
                    const label = t(img.labelKey);
                    return (
                      <button
                        key={img.url}
                        type="button"
                        onClick={() => setBannerForm({ ...bannerForm, imageUrl: img.url })}
                        title={label}
                        className={`group rounded-lg overflow-hidden border text-start transition-colors ${
                          bannerForm.imageUrl === img.url
                            ? 'border-brand ring-2 ring-brand/30'
                            : 'border-line dark:border-slate-700 hover:border-brand'
                        }`}
                      >
                        <img src={img.url} alt={label} className="w-full h-11 object-cover bg-surface" />
                        <span className="block px-1 py-0.5 text-[10px] truncate text-ink/75 dark:text-slate-300">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-line dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-bold">
                    <span>{t('adminContent.sortOrderLabel')}</span>
                    <input
                      type="number"
                      min={1}
                      value={bannerForm.sortOrder}
                      onChange={(e) => setBannerForm({ ...bannerForm, sortOrder: Number(e.target.value) || 1 })}
                      className="w-16 px-2 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 tabular-nums"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bannerForm.isActive}
                      onChange={(e) => setBannerForm({ ...bannerForm, isActive: e.target.checked })}
                      className="accent-brand"
                    />
                    <span>{t('adminContent.isActiveLabel')}</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brandDark transition-colors"
                >
                  {bannerForm.id ? t('adminContent.saveBannerBtn') : t('adminContent.addBannerBtn')}
                </button>
              </div>
            </form>

            {/* Live Preview + Banner Slides List */}
            <div className="xl:col-span-6 space-y-5">
              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold">{t('adminContent.livePreviewTitle')}</h2>
                  <span className="text-[11px] font-bold text-ink/60 dark:text-slate-400">
                    {t('adminContent.layoutModeDisplay', {
                      mode:
                        bannerForm.layout === 'overlay'
                          ? t('adminContent.layoutOverlayShort')
                          : t('adminContent.layoutSplitShort'),
                    })}
                  </span>
                </div>
                <HeroSlideView banner={previewBanner} headingTag="h2" disableLinks compact />
              </div>

              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <h2 className="text-sm font-extrabold">
                  {t('adminContent.bannersListTitle', { count: formatDigits(sortedBanners.length) })}
                </h2>
                <div className="space-y-2.5">
                  {sortedBanners.map((b, idx) => (
                    <div
                      key={b.id}
                      className={`p-3 rounded-xl border flex flex-wrap sm:flex-nowrap items-center gap-3 ${
                        b.isActive
                          ? 'border-line dark:border-slate-800'
                          : 'border-dashed border-slate-300 dark:border-slate-700 opacity-65'
                      }`}
                    >
                      <img
                        src={b.imageUrl || IMG_HERO_CLINIC}
                        alt={b.titleFa}
                        className="w-20 h-14 object-cover rounded-lg bg-surface shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink/60 dark:text-slate-400">
                          <span className="font-bold text-brand dark:text-teal-300">
                            {b.slot === 'hero'
                              ? t('adminContent.slotShortHero')
                              : b.slot === 'top_strip'
                                ? t('adminContent.slotShortTopStrip')
                                : t('adminContent.slotShortMidPromo')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {b.layout === 'overlay' ? t('adminContent.badgeOverlay') : t('adminContent.badgeSplit')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {t('adminContent.sortOrderDisplay', { order: formatDigits(b.sortOrder) })}
                          </span>
                        </div>
                        <p className="font-extrabold text-ink dark:text-slate-100 truncate">{b.titleFa}</p>
                        <p dir="ltr" className="text-[11px] text-ink/55 dark:text-slate-400 truncate text-end">
                          {b.linkPath}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveBanner(idx, -1)}
                          disabled={idx === 0}
                          title={t('adminContent.moveUp')}
                          aria-label={t('adminContent.moveUp')}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-30 hover:border-brand"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBanner(idx, 1)}
                          disabled={idx === sortedBanners.length - 1}
                          title={t('adminContent.moveDown')}
                          aria-label={t('adminContent.moveDown')}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-30 hover:border-brand"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => upsertBanner({ ...b, isActive: !b.isActive })}
                          title={b.isActive ? t('adminContent.deactivate') : t('adminContent.activate')}
                          aria-label={b.isActive ? t('adminContent.deactivate') : t('adminContent.activate')}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-line dark:border-slate-700 hover:border-brand"
                        >
                          {b.isActive ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditBanner(b)}
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-line dark:border-slate-700 text-brand hover:border-brand"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBanner(b.id)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-line dark:border-slate-700 text-rose-600 hover:border-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'faqs' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={faqForm.questionFa}
              onChange={(e) => setFaqForm({ ...faqForm, questionFa: e.target.value })}
              placeholder={t('adminContent.faqQuestionPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={faqForm.answerFa}
              onChange={(e) => setFaqForm({ ...faqForm, answerFa: e.target.value })}
              placeholder={t('adminContent.faqAnswerPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={async () => {
                if (!faqForm.questionFa || !faqForm.answerFa) return;
                const f: FaqItem = { id: `faq_${Date.now()}`, ...faqForm, sortOrder: faqs.length + 1, isActive: true };
                await upsertFaq(f);
                setFaqForm({ categoryFa: t('adminContent.defaultFaqCategory'), questionFa: '', answerFa: '' });
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminContent.addFaqBtn')}
            </button>
          </div>
          {faqs.map((f) => (
            <div
              key={f.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{f.questionFa}</p>
                <p className="text-ink/60">{f.answerFa}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteFaq(f.id)}
                className="min-h-[34px] px-2 text-rose-600 font-bold shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'agents' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <input
              value={agentForm.nameFa}
              onChange={(e) => setAgentForm({ ...agentForm, nameFa: e.target.value })}
              placeholder={t('adminContent.agentNamePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={agentForm.province}
              onChange={(e) => setAgentForm({ ...agentForm, province: e.target.value })}
              placeholder={t('adminContent.agentProvincePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              value={agentForm.city}
              onChange={(e) => setAgentForm({ ...agentForm, city: e.target.value })}
              placeholder={t('adminContent.agentCityPlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <input
              dir="ltr"
              value={agentForm.phone}
              onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
              placeholder={t('adminContent.agentPhonePlaceholder')}
              className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={async () => {
                if (!agentForm.nameFa) return;
                const ag: AgentBranch = {
                  id: `ag_${Date.now()}`,
                  type: 'agent',
                  ...agentForm,
                  mobile: '09170000000',
                  workingHoursFa: 'شنبه تا چهارشنبه ۹ تا ۱۸',
                  brandIds: [],
                  lat: 29.5918,
                  lng: 52.5837,
                  isActive: true,
                  updatedAt: new Date().toISOString(),
                };
                await upsertAgent(ag);
                setAgentForm({
                  nameFa: '',
                  province: t('adminContent.defaultAgentProvince'),
                  provinceSlug: 'fars',
                  city: t('adminContent.defaultAgentCity'),
                  phone: '',
                  address: '',
                });
              }}
              className="min-h-[40px] sm:col-span-2 lg:col-span-1 px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminContent.addAgentBtn')}
            </button>
          </div>
          {agents.map((ag) => (
            <div
              key={ag.id}
              className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap justify-between items-center gap-2"
            >
              <span className="min-w-0">
                {ag.nameFa} ({ag.province} - {ag.city}) · {ag.phone}
              </span>
              <button
                type="button"
                onClick={() => deleteAgent(ag.id)}
                className="min-h-[34px] px-2 text-rose-600 font-bold shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'marketing' && (
        <div className="space-y-6 text-xs">
          {/* Provider & Config Honest Header */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold">{t('adminContent.mktTitle')}</h2>
                <span
                  data-testid="marketing-provider-badge"
                  className={`px-2.5 py-1 rounded-lg border font-bold ${
                    providerMode === 'live'
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {providerMode === 'live'
                    ? t('adminContent.providerLiveBadge', { name: providerName })
                    : t('adminContent.providerSandboxBadge')}
                </span>
              </div>
              <p className="text-ink/60 dark:text-slate-400 tabular-nums">
                {t('adminContent.mktConfigSummary', {
                  start: formatDigits(mktConfig.quietHoursStart),
                  end: formatDigits(mktConfig.quietHoursEnd),
                  abandonedMin: formatDigits(mktConfig.abandonedCartMinutes),
                  throttleHours: formatDigits(mktConfig.reminderThrottleHours),
                  dailyMax: formatDigits(mktConfig.perRecipientDailyMax),
                })}
              </p>
            </div>
            <button
              type="button"
              disabled={mktLoading}
              onClick={() => void loadMarketingOverview()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold hover:border-brand disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${mktLoading ? 'animate-spin' : ''}`} />
              <span>{t('adminContent.refreshMktBtn')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Send Campaign Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!campaignForm.title.trim() || !campaignForm.message.trim()) return;
                setMktBusy(true);
                try {
                  const headers = await resolveAuthHeaders(authUser);
                  const customContacts =
                    campaignForm.segment === 'custom_contacts'
                      ? campaignForm.customContactsText
                          .split(/[\n,،]+/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : undefined;

                  const res = await fetch('/api/admin/marketing/campaigns/send', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      title: campaignForm.title.trim(),
                      channel: campaignForm.channel,
                      segment: campaignForm.segment,
                      subject: campaignForm.channel === 'email' ? campaignForm.subject.trim() : undefined,
                      message: campaignForm.message.trim(),
                      customContacts,
                      respectQuietHours: campaignForm.respectQuietHours,
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok || !data?.ok) {
                    pushToast(data?.message || t('adminContent.campaignRunError'), 'error');
                    return;
                  }
                  const r: CampaignRun = data.run;
                  const skipped = r.skippedOptOutCount + r.skippedSuppressedCount + r.skippedRateLimitCount;
                  pushToast(
                    t('adminContent.campaignSuccessToast', {
                      sent: formatDigits(r.sentCount),
                      quiet: formatDigits(r.scheduledQuietHoursCount),
                      skipped: formatDigits(skipped),
                    }),
                    'success'
                  );
                  await loadMarketingOverview();
                } catch {
                  pushToast(t('adminContent.campaignSendError'), 'error');
                } finally {
                  setMktBusy(false);
                }
              }}
              className="xl:col-span-5 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3"
            >
              <h3 className="text-sm font-extrabold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand shrink-0" />
                <span>{t('adminContent.sendCampaignTitle')}</span>
              </h3>

              <label className="block space-y-1">
                <span className="font-bold">{t('adminContent.campaignTitleLabel')}</span>
                <input
                  required
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold">{t('adminContent.campaignChannelLabel')}</span>
                  <select
                    value={campaignForm.channel}
                    onChange={(e) =>
                      setCampaignForm((p) => ({ ...p, channel: e.target.value as MarketingChannel }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="sms">{t('adminContent.channelSms')}</option>
                    <option value="email">{t('adminContent.channelEmail')}</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-bold">{t('adminContent.campaignSegmentLabel')}</span>
                  <select
                    value={campaignForm.segment}
                    onChange={(e) =>
                      setCampaignForm((p) => ({ ...p, segment: e.target.value as CampaignSegment }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="newsletter_subscribers">{t('adminContent.segments.newsletter_subscribers')}</option>
                    <option value="approved_b2b">{t('adminContent.segments.approved_b2b')}</option>
                    <option value="all_customers">{t('adminContent.segments.all_customers')}</option>
                    <option value="abandoned_cart_users">{t('adminContent.segments.abandoned_cart_users')}</option>
                    <option value="custom_contacts">{t('adminContent.segments.custom_contacts')}</option>
                  </select>
                </label>
              </div>

              {campaignForm.channel === 'email' && (
                <label className="block space-y-1">
                  <span className="font-bold">{t('adminContent.emailSubjectLabel')}</span>
                  <input
                    value={campaignForm.subject}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
              )}

              {campaignForm.segment === 'custom_contacts' && (
                <label className="block space-y-1">
                  <span className="font-bold">{t('adminContent.customContactsLabel')}</span>
                  <textarea
                    rows={2}
                    dir="ltr"
                    value={campaignForm.customContactsText}
                    onChange={(e) =>
                      setCampaignForm((p) => ({ ...p, customContactsText: e.target.value }))
                    }
                    placeholder={'09120000001\nclinic@example.com'}
                    className="w-full p-2.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                  />
                </label>
              )}

              <label className="block space-y-1">
                <span className="font-bold">{t('adminContent.campaignMessageLabel')}</span>
                <textarea
                  required
                  rows={3}
                  value={campaignForm.message}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, message: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>

              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={campaignForm.respectQuietHours}
                  onChange={(e) =>
                    setCampaignForm((p) => ({ ...p, respectQuietHours: e.target.checked }))
                  }
                  className="accent-brand"
                />
                <span>
                  {t('adminContent.respectQuietHoursLabel', {
                    start: formatDigits(mktConfig.quietHoursStart),
                    end: formatDigits(mktConfig.quietHoursEnd),
                  })}
                </span>
              </label>

              <div>
                <button
                  type="submit"
                  disabled={mktBusy}
                  data-testid="marketing-send-campaign-btn"
                  className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brandDark disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{mktBusy ? t('adminContent.sendingCampaign') : t('adminContent.runCampaignBtn')}</span>
                </button>
              </div>
            </form>

            {/* Campaign Runs History */}
            <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-extrabold">
                {t('adminContent.campaignRunsTitle', { count: formatDigits(campaignRuns.length) })}
              </h3>
              {campaignRuns.length === 0 ? (
                <p className="text-ink/55 dark:text-slate-400 py-4">{t('adminContent.noCampaignRuns')}</p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {campaignRuns.map((run) => (
                    <div
                      key={run.id}
                      className="p-3 rounded-xl border border-line dark:border-slate-800 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm">{run.title}</strong>
                        <span className="text-[11px] text-ink/60 dark:text-slate-400 tabular-nums">
                          {run.channel.toUpperCase()} · {run.providerMode === 'live' ? 'Live' : 'Sandbox'} ·{' '}
                          {formatDateTime(run.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] tabular-nums text-ink/75 dark:text-slate-300">
                        <span>
                          {t('adminContent.runStatTotal')}: <strong>{formatDigits(run.totalMatched)}</strong>
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {t('adminContent.runStatSent')}: <strong>{formatDigits(run.sentCount)}</strong>
                        </span>
                        <span>
                          {t('adminContent.runStatQuiet')}: <strong>{formatDigits(run.scheduledQuietHoursCount)}</strong>
                        </span>
                        <span>
                          {t('adminContent.runStatOptOut')}: <strong>{formatDigits(run.skippedOptOutCount)}</strong>
                        </span>
                        <span>
                          {t('adminContent.runStatSuppressed')}: <strong>{formatDigits(run.skippedSuppressedCount)}</strong>
                        </span>
                        <span>
                          {t('adminContent.runStatRateLimit')}: <strong>{formatDigits(run.skippedRateLimitCount)}</strong>
                        </span>
                        <span className="text-rose-600">
                          {t('adminContent.runStatFailed')}: <strong>{formatDigits(run.failedCount)}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Outbox Queue */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="w-4 h-4 text-brand shrink-0" />
                <h3 className="text-sm font-extrabold">
                  {t('adminContent.outboxTitle', { count: formatDigits(outboxMessages.length) })}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={outboxFilter}
                  onChange={(e) => setOutboxFilter(e.target.value)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                >
                  <option value="all">{t('adminContent.outboxFilter.all')}</option>
                  <option value="sent">{t('adminContent.outboxFilter.sent')}</option>
                  <option value="delivered">{t('adminContent.outboxFilter.delivered')}</option>
                  <option value="scheduled_quiet_hours">{t('adminContent.outboxFilter.scheduled_quiet_hours')}</option>
                  <option value="failed">{t('adminContent.outboxFilter.failed')}</option>
                  <option value="suppressed">{t('adminContent.outboxFilter.suppressed')}</option>
                  <option value="rate_limited">{t('adminContent.outboxFilter.rate_limited')}</option>
                </select>
                <button
                  type="button"
                  disabled={mktBusy}
                  onClick={async () => {
                    setMktBusy(true);
                    try {
                      const headers = await resolveAuthHeaders(authUser);
                      const res = await fetch('/api/admin/marketing/outbox/flush', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({}),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || !data?.ok) {
                        pushToast(data?.message || t('adminContent.flushError'), 'error');
                        return;
                      }
                      pushToast(
                        t('adminContent.flushSuccessToast', {
                          dispatched: formatDigits(data.summary?.dispatched || 0),
                          waiting: formatDigits(data.summary?.stillWaiting || 0),
                        }),
                        'success'
                      );
                      await loadMarketingOverview();
                    } finally {
                      setMktBusy(false);
                    }
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-brand text-white font-bold disabled:opacity-50"
                >
                  {t('adminContent.flushOutboxBtn')}
                </button>
              </div>
            </div>

            {outboxMessages.filter((m) => outboxFilter === 'all' || m.status === outboxFilter).length === 0 ? (
              <p className="text-ink/55 dark:text-slate-400 py-3">{t('adminContent.noOutboxMessages')}</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {outboxMessages
                  .filter((m) => outboxFilter === 'all' || m.status === outboxFilter)
                  .slice(0, 40)
                  .map((msg) => {
                    const transitionOutbox = async (nextStatus: OutboxStatus) => {
                      const headers = await resolveAuthHeaders(authUser);
                      const res = await fetch(`/api/admin/marketing/outbox/${msg.id}/status`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ status: nextStatus }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || !data?.ok) {
                        pushToast(data?.message || t('adminContent.outboxTransitionNotAllowed'), 'error');
                        return;
                      }
                      pushToast(t('adminContent.outboxTransitionSuccess'), 'success');
                      await loadMarketingOverview();
                    };

                    return (
                      <div
                        key={msg.id}
                        className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span dir="ltr" className="font-bold tabular-nums break-all">
                              {msg.recipient}
                            </span>
                            <span className="px-2 py-0.5 rounded border border-line dark:border-slate-700 font-bold">
                              {msg.channel.toUpperCase()} · {msg.status}
                            </span>
                            <span className="text-[11px] text-ink/55 tabular-nums">
                              {formatDateTime(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-ink/80 dark:text-slate-300 truncate">{msg.body}</p>
                          {msg.errorMessage && <p className="text-[11px] text-rose-600">{msg.errorMessage}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {(msg.status === 'queued' || msg.status === 'scheduled_quiet_hours') && (
                            <button
                              type="button"
                              onClick={() => void transitionOutbox('sent')}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-brand text-white font-bold"
                            >
                              {t('adminContent.sendNowBtn')}
                            </button>
                          )}
                          {msg.status === 'sent' && (
                            <>
                              <button
                                type="button"
                                onClick={() => void transitionOutbox('delivered')}
                                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{t('adminContent.markDeliveredBtn')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void transitionOutbox('failed')}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-rose-300 text-rose-600 font-bold"
                              >
                                {t('adminContent.markFailedBtn')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Abandoned Carts Recovery */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-brand shrink-0" />
                <span>{t('adminContent.abandonedCartsTitle', { count: formatDigits(abandonedCarts.length) })}</span>
              </h3>
              <span className="text-[11px] text-ink/60 dark:text-slate-400">
                {t('adminContent.abandonedCartsPolicy', {
                  hours: formatDigits(mktConfig.reminderThrottleHours),
                })}
              </span>
            </div>

            {abandonedCarts.length === 0 ? (
              <p className="text-ink/55 dark:text-slate-400 py-3">{t('adminContent.noAbandonedCarts')}</p>
            ) : (
              <div className="space-y-2">
                {abandonedCarts.map((cartRec) => (
                  <div
                    key={cartRec.id}
                    className="p-3 rounded-xl border border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{cartRec.customerName || cartRec.ownerKey}</strong>
                        <span dir="ltr" className="text-ink/65 dark:text-slate-400 tabular-nums break-all">
                          {cartRec.mobile || cartRec.email || t('adminContent.noContactInfo')}
                        </span>
                        <span className="px-2 py-0.5 rounded border border-line dark:border-slate-700 font-bold">
                          {cartRec.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink/65 dark:text-slate-400 tabular-nums">
                        {t('adminContent.abandonedCartMeta', {
                          items: formatDigits(cartRec.items.reduce((s, i) => s + i.quantity, 0)),
                          total: formatMoney(cartRec.subtotal, currency),
                          reminders: formatDigits(cartRec.reminderCount),
                        })}
                        {cartRec.lastReminderAt
                          ? ` · ${t('adminContent.lastReminderAt', { date: formatDateTime(cartRec.lastReminderAt) })}`
                          : ''}
                      </p>
                    </div>
                    {cartRec.status !== 'recovered' && cartRec.status !== 'opted_out' && (
                      <button
                        type="button"
                        disabled={mktBusy}
                        onClick={async () => {
                          setMktBusy(true);
                          try {
                            const headers = await resolveAuthHeaders(authUser);
                            const res = await fetch(`/api/admin/marketing/abandoned-carts/${cartRec.id}/remind`, {
                              method: 'POST',
                              headers,
                              body: JSON.stringify({
                                channel: cartRec.mobile ? 'sms' : 'email',
                                respectQuietHours: true,
                              }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok || !data?.ok) {
                              pushToast(data?.message || t('adminContent.cannotSendReminder'), 'error');
                              return;
                            }
                            pushToast(t('adminContent.cartReminderQueued'), 'success');
                            await loadMarketingOverview();
                          } finally {
                            setMktBusy(false);
                          }
                        }}
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-brand text-white font-bold hover:bg-brandDark disabled:opacity-50 shrink-0"
                      >
                        {t('adminContent.sendCartReminderBtn', {
                          channel: cartRec.mobile ? t('adminContent.smsLabel') : t('adminContent.emailLabel'),
                        })}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suppression List & Newsletter Subscribers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-extrabold flex items-center gap-2">
                <BellOff className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{t('adminContent.suppressionTitle', { count: formatDigits(suppressions.length) })}</span>
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!suppressionContact.trim()) return;
                  setMktBusy(true);
                  try {
                    const headers = await resolveAuthHeaders(authUser);
                    const res = await fetch('/api/admin/marketing/suppression', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        contact: suppressionContact.trim(),
                        note: suppressionNote.trim() || undefined,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data?.ok) {
                      pushToast(data?.message || t('adminContent.suppressionAddError'), 'error');
                      return;
                    }
                    setSuppressionContact('');
                    setSuppressionNote('');
                    pushToast(t('adminContent.suppressionAddedToast'), 'success');
                    await loadMarketingOverview();
                  } finally {
                    setMktBusy(false);
                  }
                }}
                className="flex flex-col sm:flex-row flex-wrap gap-2"
              >
                <input
                  dir="ltr"
                  value={suppressionContact}
                  onChange={(e) => setSuppressionContact(e.target.value)}
                  placeholder="0912... / email@domain"
                  className="flex-1 min-w-0 sm:min-w-[160px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                />
                <input
                  value={suppressionNote}
                  onChange={(e) => setSuppressionNote(e.target.value)}
                  placeholder={t('adminContent.suppressionNotePlaceholder')}
                  className="flex-1 min-w-0 sm:min-w-[120px] px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <button
                  type="submit"
                  disabled={mktBusy}
                  className="min-h-[38px] px-4 py-2 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-50 shrink-0"
                >
                  {t('common.add')}
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {suppressions.map((sup) => (
                  <div
                    key={sup.id}
                    className="p-2.5 rounded-lg border border-line dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span dir="ltr" className="font-bold tabular-nums break-all">
                        {sup.contact}
                      </span>
                      <span className="text-ink/55 dark:text-slate-400 ms-2">
                        ({sup.reason}
                        {sup.note ? ` · ${sup.note}` : ''})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const headers = await resolveAuthHeaders(authUser);
                        const res = await fetch(`/api/admin/marketing/suppression/${sup.id}`, {
                          method: 'DELETE',
                          headers,
                        });
                        if (res.ok) {
                          pushToast(t('adminContent.suppressionRemovedToast'), 'success');
                          await loadMarketingOverview();
                        }
                      }}
                      className="min-h-[34px] px-2 text-rose-600 font-bold shrink-0"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-extrabold">
                {t('adminContent.newsletterSubscribersTitle', {
                  count: formatDigits(
                    (serverSubscribers.length > 0 ? serverSubscribers : newsletterSubscribers).length
                  ),
                })}
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(serverSubscribers.length > 0 ? serverSubscribers : newsletterSubscribers).map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2.5 rounded-lg border border-line dark:border-slate-800 flex flex-wrap justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span dir="ltr" className="tabular-nums break-all">
                        {sub.contact}
                      </span>{' '}
                      ({sub.type})
                      {sub.status === 'unsubscribed' && (
                        <strong className="text-rose-600 ms-2">{t('adminContent.unsubscribedBadge')}</strong>
                      )}
                    </span>
                    <span className="tabular-nums text-ink/55 shrink-0">{formatDate(sub.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminContentPage;
