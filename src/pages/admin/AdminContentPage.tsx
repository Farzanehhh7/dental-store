import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, MessageSquare, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { HeroSlideView } from '../../components/store/HeroBannerSlider';
import { useStore } from '../../context/StoreContext';
import { BRAND_OFFICIAL_IMAGES } from '../../data/brandProducts';
import { IMG_COMPOSITE, IMG_EQUIPMENT, IMG_HERO_CLINIC, IMG_ROTARY } from '../../data/seed';
import { formatJalaliDate, toPersianDigits } from '../../lib/jalali';
import { AgentBranch, BannerItem, BlogPost, FaqItem, SitePage } from '../../types/domain';

const PRESET_BANNER_IMAGES: { label: string; url: string }[] = [
  { label: 'کلینیک دندانپزشکی', url: IMG_HERO_CLINIC },
  { label: 'کامپوزیت و ترمیمی', url: IMG_COMPOSITE },
  { label: 'یونیت و تجهیزات', url: IMG_EQUIPMENT },
  { label: 'فایل روتاری و اندو', url: IMG_ROTARY },
  { label: 'یونیت KaVo آلمان', url: '/assets/products/kavo-estetica-unit.jpg' },
  { label: 'اتوکلاو MELAG آلمان', url: '/assets/products/melag-vacuklav.jpg' },
  { label: 'اتوکلاو W&H Lisa', url: '/assets/products/wh-lisa-autoclave.jpg' },
  { label: 'کامپوزیت 3M Filtek', url: '/assets/products/3m-filtek-universal.jpg' },
  { label: 'فایل ProTaper Dentsply', url: '/assets/products/dentsply-protaper-gold.jpg' },
  { label: 'لایت‌کیور Ivoclar', url: '/assets/products/ivoclar-bluephase-powercure.png' },
  { label: 'ایمپلنت Straumann', url: '/assets/products/straumann-implant-system.webp' },
  { label: 'رادیوگرافی Vatech', url: '/assets/products/vatech-greenx.jpg' },
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

function createEmptyBannerForm(nextSortOrder: number): BannerFormState {
  return {
    id: '',
    slot: 'hero',
    layout: 'split',
    accentTone: 'brand',
    badgeTextFa: 'تأمین تخصصی کلینیک‌ها و مطب‌ها',
    titleFa: '',
    subtitleFa: '',
    ctaTextFa: 'مشاهده محصولات',
    linkPath: '/category/consumables',
    secondaryCtaTextFa: '',
    secondaryLinkPath: '',
    imageUrl: IMG_HERO_CLINIC,
    isActive: true,
    sortOrder: nextSortOrder,
  };
}

function compressBannerImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر معتبر نیست'));
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
          reject(new Error('عدم پشتیبانی مرورگر از پردازش تصویر'));
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

  const [tab, setTab] = useState<'blog' | 'pages' | 'banners' | 'faqs' | 'agents' | 'marketing'>('blog');
  const [postForm, setPostForm] = useState({ id: '', titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  const [pageForm, setPageForm] = useState({ id: '', slug: '', titleFa: '', bodyFa: '' });
  const [bannerForm, setBannerForm] = useState<BannerFormState>(() => createEmptyBannerForm(banners.length + 1));
  const [faqForm, setFaqForm] = useState({ categoryFa: 'ارسال و اصالت', questionFa: '', answerFa: '' });
  const [agentForm, setAgentForm] = useState({ nameFa: '', province: 'فارس', provinceSlug: 'fars', city: 'شیراز', phone: '071-32300000', address: '' });
  const [smsBody, setSmsBody] = useState('کلینیک گرامی، جشنواره تجهیزات اندو دنتال‌مارکت با ۱۵٪ تخفیف همکار آغاز شد.');

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
    titleFa: bannerForm.titleFa.trim() || 'تیتر نمونه اسلاید تبلیغاتی یا معرفی برند',
    subtitleFa: bannerForm.subtitleFa.trim() || 'توضیح تکمیلی درباره تخفیف، جشنواره یا برند منتخب برای نمایش در ویترین صفحه اول.',
    ctaTextFa: bannerForm.ctaTextFa.trim() || 'مشاهده محصولات',
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
      badgeTextFa: 'جشنواره تخفیف ویژه مطب‌ها',
      titleFa: 'تخفیف‌های دوره‌ای تجهیزات و مواد مصرفی دندانپزشکی',
      subtitleFa: 'خرید مستقیم کالاهای دارای تخفیف واقعی و شرایط ارسال فوری ویژه کلینیک‌ها و مطب‌ها.',
      ctaTextFa: 'مشاهده کالاهای تخفیف‌دار',
      linkPath: '/search?discount=1',
      secondaryCtaTextFa: 'پک‌های اقتصادی کلینیک',
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
      badgeTextFa: `موجود شد · برند رسمی ${brand.countryFa}`,
      titleFa: `محصولات تخصصی برند ${brand.nameFa} (${brand.nameEn})`,
      subtitleFa: `تأمین مستقیم تجهیزات و مواد مصرفی ${brand.nameFa} با کد اصالت IMED، گارانتی شرکتی و ارسال سراسری.`,
      ctaTextFa: `مشاهده محصولات ${brand.nameFa}`,
      linkPath: `/brand/${brand.slug}`,
      secondaryCtaTextFa: 'همه برندهای رسمی',
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
      badgeTextFa: 'گروه تخصصی کالا',
      titleFa: `تامین کامل محصولات دسته ${cat.nameFa}`,
      subtitleFa: cat.descriptionFa || `مشاهده و مقایسه قیمت انواع ${cat.nameFa} از برندهای معتبر جهانی با اصالت IMED.`,
      ctaTextFa: `مشاهده ${cat.nameFa}`,
      linkPath: `/category/${cat.slug}`,
    }));
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.titleFa.trim()) {
      pushToast('لطفاً تیتر بنر را وارد کنید.', 'error');
      return;
    }
    if (bannerForm.imageUrl.length > 420000) {
      pushToast('حجم تصویر آپلودی بیش از حد مجاز است. لطفاً تصویر کم‌حجم‌تری انتخاب کنید.', 'error');
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
      ctaTextFa: bannerForm.ctaTextFa.trim() || 'مشاهده',
      linkPath: bannerForm.linkPath.trim() || '/',
      secondaryCtaTextFa: bannerForm.secondaryCtaTextFa.trim() || undefined,
      secondaryLinkPath: bannerForm.secondaryLinkPath.trim() || undefined,
      imageUrl: bannerForm.imageUrl.trim() || IMG_HERO_CLINIC,
      isActive: bannerForm.isActive,
      sortOrder: Number(bannerForm.sortOrder) || sortedBanners.length + 1,
    };
    await upsertBanner(nextBanner);
    setBannerForm(createEmptyBannerForm(sortedBanners.length + 2));
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
      const compressed = await compressBannerImageFile(file);
      if (compressed.length > 420000) {
        pushToast('حجم تصویر پس از فشرده‌سازی همچنان زیاد است. تصویر سبک‌تری انتخاب کنید.', 'error');
        return;
      }
      setBannerForm((prev) => ({ ...prev, imageUrl: compressed }));
      pushToast('تصویر بنر بارگذاری و آماده پیش‌نمایش شد.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'خطا در پردازش تصویر', 'error');
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
      imageUrl: '/src/assets/images/hero_dental_clinic_1794921818923.jpg',
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
      <h1 className="text-xl font-extrabold">مدیریت محتوا، صفحات، بنرها، نمایندگان و بازاریابی</h1>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'blog', label: `مجله تخصصی (${toPersianDigits(blogPosts.length)})` },
          { id: 'pages', label: `صفحات CMS (${toPersianDigits(pages.length)})` },
          { id: 'banners', label: `بنرهای ویترین (${toPersianDigits(banners.length)})` },
          { id: 'faqs', label: `سوالات متداول (${toPersianDigits(faqs.length)})` },
          { id: 'agents', label: `نمایندگان استانی (${toPersianDigits(agents.length)})` },
          { id: 'marketing', label: `خبرنامه (${toPersianDigits(newsletterSubscribers.length)}) و SMS` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === t.id ? 'bg-brand text-white' : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'blog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <form onSubmit={handlePublishPost} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">{postForm.id ? 'ویرایش مقاله' : 'انتشار مقاله تخصصی جدید'}</h2>
            <input required value={postForm.titleFa} onChange={(e) => setPostForm({ ...postForm, titleFa: e.target.value })} placeholder="عنوان مقاله..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={postForm.categoryFa} onChange={(e) => setPostForm({ ...postForm, categoryFa: e.target.value })} placeholder="دسته علمی..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input required value={postForm.excerptFa} onChange={(e) => setPostForm({ ...postForm, excerptFa: e.target.value })} placeholder="چکیده..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <textarea required rows={4} value={postForm.bodyFa} onChange={(e) => setPostForm({ ...postForm, bodyFa: e.target.value })} placeholder="متن کامل مقاله..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">ذخیره و انتشار مقاله</button>
          </form>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">فهرست مقالات</h2>
            {blogPosts.map((bp) => (
              <div key={bp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{bp.titleFa}</p>
                  <p className="text-ink/55">{bp.authorName} · {formatJalaliDate(bp.publishedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPostForm({ id: bp.id, titleFa: bp.titleFa, categoryFa: bp.categoryFa, excerptFa: bp.excerptFa, bodyFa: bp.bodyFa })} className="text-brand font-bold">ویرایش</button>
                  <button type="button" onClick={() => deleteBlogPost(bp.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">ایجاد / ویرایش صفحه ایستا</h2>
            <input value={pageForm.slug} onChange={(e) => setPageForm({ ...pageForm, slug: e.target.value })} placeholder="نامک مسیر (مثلاً warranty)" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={pageForm.titleFa} onChange={(e) => setPageForm({ ...pageForm, titleFa: e.target.value })} placeholder="عنوان صفحه" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <textarea rows={4} value={pageForm.bodyFa} onChange={(e) => setPageForm({ ...pageForm, bodyFa: e.target.value })} placeholder="محتوای صفحه..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!pageForm.slug || !pageForm.titleFa) return;
                const sp: SitePage = { id: pageForm.id || `pg_${Date.now()}`, slug: pageForm.slug, titleFa: pageForm.titleFa, bodyFa: pageForm.bodyFa, status: 'published', updatedAt: new Date().toISOString() };
                await upsertSitePage(sp);
                setPageForm({ id: '', slug: '', titleFa: '', bodyFa: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              ذخیره صفحه
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2">
            {pages.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
                <div>
                  <p className="font-bold">{p.titleFa}</p>
                  <p className="text-ink/55">/page/{p.slug}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPageForm({ id: p.id, slug: p.slug, titleFa: p.titleFa, bodyFa: p.bodyFa })} className="text-brand font-bold">ویرایش</button>
                  <button type="button" onClick={() => deleteSitePage(p.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'banners' && (
        <div className="space-y-6 text-xs">
          {/* Quick Presets Bar */}
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand" />
                <h2 className="text-sm font-extrabold">الگوهای آماده ساخت سریع اسلاید</h2>
              </div>
              <span className="text-ink/60 dark:text-slate-400">
                می‌توانید برای تخفیف‌ها، معرفی برند یا دسته‌بندی با یک کلیک فیلدها را پر کنید و سپس ویرایش کنید.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={applyDiscountPreset}
                className="px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold text-right hover:border-rose-500 transition-colors"
              >
                + تنظیم سریع بنر جشنواره و تخفیف
              </button>

              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyBrandPreset(e.target.value);
                  e.target.value = '';
                }}
                aria-label="الگوی پیشنهاد برند خاص"
                className="px-3 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="">+ پیشنهاد و معرفی یک برند خاص...</option>
                {activeBrandsList.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.nameFa} ({br.nameEn}) {BRAND_OFFICIAL_IMAGES[br.id] ? '★ تصویر رسمی' : ''}
                  </option>
                ))}
              </select>

              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyCategoryPreset(e.target.value);
                  e.target.value = '';
                }}
                aria-label="الگوی معرفی دسته‌بندی"
                className="px-3 py-2.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
              >
                <option value="">+ بنر معرفی یک دسته‌بندی...</option>
                {activeCategoriesList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.depth > 0 ? '— ' : ''}{cat.nameFa}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Banner Editor Form */}
            <form
              onSubmit={handleSaveBanner}
              className="xl:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold">
                  {bannerForm.id ? 'ویرایش اسلاید / بنر انتخاب‌شده' : 'افزودن اسلاید یا بنر جدید'}
                </h2>
                {bannerForm.id && (
                  <button
                    type="button"
                    onClick={() => setBannerForm(createEmptyBannerForm(sortedBanners.length + 1))}
                    className="text-rose-600 font-bold hover:underline"
                  >
                    انصراف از ویرایش
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">جایگاه نمایش</span>
                  <select
                    value={bannerForm.slot}
                    onChange={(e) => setBannerForm({ ...bannerForm, slot: e.target.value as BannerItem['slot'] })}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="hero">اسلایدر اصلی بالای صفحه (Hero)</option>
                    <option value="top_strip">نوار اطلاع‌رسانی بالای صفحه (Top Strip)</option>
                    <option value="mid_promo">بنر تبلیغاتی میانی صفحه (Mid Promo)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">نحوه قرارگیری نوشته و عکس</span>
                  <select
                    value={bannerForm.layout}
                    onChange={(e) => setBannerForm({ ...bannerForm, layout: e.target.value as 'split' | 'overlay' })}
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                  >
                    <option value="split">نوشته کنار تصویر (حالت پیش‌فرض)</option>
                    <option value="overlay">نوشته روی تصویر (با سایه تیره خوانایی)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="sm:col-span-2 space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">برچسب بالای تیتر (اختیاری)</span>
                  <input
                    value={bannerForm.badgeTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, badgeTextFa: e.target.value })}
                    placeholder="مثلاً: جشنواره تخفیف ویژه یا برند رسمی KaVo"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">رنگ برچسب</span>
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
                    <option value="brand">فیروزه‌ای برند</option>
                    <option value="rose">قرمز تخفیف</option>
                    <option value="amber">کهربایی تجهیزات</option>
                    <option value="slate">خنثی رسمی</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-bold text-ink/70 dark:text-slate-300">تیتر اصلی بنر *</span>
                <input
                  required
                  value={bannerForm.titleFa}
                  onChange={(e) => setBannerForm({ ...bannerForm, titleFa: e.target.value })}
                  placeholder="تیتر جذاب بنر..."
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 font-bold"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-bold text-ink/70 dark:text-slate-300">زیرتیتر / توضیح بنر</span>
                <textarea
                  rows={2}
                  value={bannerForm.subtitleFa}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitleFa: e.target.value })}
                  placeholder="توضیح کوتاه درباره تخفیف، ویژگی کالا یا شرایط فروش..."
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">متن دکمه اصلی</span>
                  <input
                    value={bannerForm.ctaTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, ctaTextFa: e.target.value })}
                    placeholder="مثلاً: مشاهده محصولات"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">لینک مقصد دکمه اصلی</span>
                  <input
                    dir="ltr"
                    value={bannerForm.linkPath}
                    onChange={(e) => setBannerForm({ ...bannerForm, linkPath: e.target.value })}
                    placeholder="/brand/kavo یا /search?discount=1"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">متن دکمه دوم (اختیاری)</span>
                  <input
                    value={bannerForm.secondaryCtaTextFa}
                    onChange={(e) => setBannerForm({ ...bannerForm, secondaryCtaTextFa: e.target.value })}
                    placeholder="مثلاً: همه برندها"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-bold text-ink/70 dark:text-slate-300">لینک دکمه دوم</span>
                  <input
                    dir="ltr"
                    value={bannerForm.secondaryLinkPath}
                    onChange={(e) => setBannerForm({ ...bannerForm, secondaryLinkPath: e.target.value })}
                    placeholder="/brands یا /account"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink/70 dark:text-slate-300">آدرس تصویر یا انتخاب از گالری</span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 hover:border-brand cursor-pointer font-bold">
                    <ImagePlus className="w-3.5 h-3.5 text-brand" />
                    <span>آپلود تصویر از سیستم</span>
                    <input type="file" accept="image/*" onChange={handleBannerFileChange} className="hidden" />
                  </label>
                </div>
                <input
                  dir="ltr"
                  value={bannerForm.imageUrl}
                  onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                  placeholder="/assets/products/... یا https://..."
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-left"
                />
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1">
                  {PRESET_BANNER_IMAGES.map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => setBannerForm({ ...bannerForm, imageUrl: img.url })}
                      title={img.label}
                      className={`group rounded-lg overflow-hidden border text-right transition-colors ${
                        bannerForm.imageUrl === img.url
                          ? 'border-brand ring-2 ring-brand/30'
                          : 'border-line dark:border-slate-700 hover:border-brand'
                      }`}
                    >
                      <img src={img.url} alt={img.label} className="w-full h-11 object-cover bg-surface" />
                      <span className="block px-1 py-0.5 text-[10px] truncate text-ink/75 dark:text-slate-300">
                        {img.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-line dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-bold">
                    <span>ترتیب:</span>
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
                    <span>انتشار فعال</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brandDark transition-colors"
                >
                  {bannerForm.id ? 'ذخیره تغییرات بنر' : 'افزودن به اسلایدر'}
                </button>
              </div>
            </form>

            {/* Live Preview + Banner Slides List */}
            <div className="xl:col-span-6 space-y-5">
              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold">پیش‌نمایش زنده بنر</h2>
                  <span className="text-[11px] font-bold text-ink/60 dark:text-slate-400">
                    چیدمان: {bannerForm.layout === 'overlay' ? 'نوشته روی تصویر' : 'نوشته کنار تصویر'}
                  </span>
                </div>
                <HeroSlideView banner={previewBanner} headingTag="h2" disableLinks compact />
              </div>

              <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-extrabold">فهرست اسلایدها و بنرها ({toPersianDigits(sortedBanners.length)})</h2>
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
                            {b.slot === 'hero' ? 'اسلایدر اصلی' : b.slot === 'top_strip' ? 'نوار بالا' : 'بنر میانی'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{b.layout === 'overlay' ? 'روی عکس' : 'کنار عکس'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">ترتیب {toPersianDigits(b.sortOrder)}</span>
                        </div>
                        <p className="font-extrabold text-ink dark:text-slate-100 truncate">{b.titleFa}</p>
                        <p dir="ltr" className="text-[11px] text-ink/55 dark:text-slate-400 truncate text-right">
                          {b.linkPath}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveBanner(idx, -1)}
                          disabled={idx === 0}
                          title="انتقال به بالا"
                          className="p-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-30 hover:border-brand"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBanner(idx, 1)}
                          disabled={idx === sortedBanners.length - 1}
                          title="انتقال به پایین"
                          className="p-2 rounded-lg border border-line dark:border-slate-700 disabled:opacity-30 hover:border-brand"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => upsertBanner({ ...b, isActive: !b.isActive })}
                          title={b.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                          className="p-2 rounded-lg border border-line dark:border-slate-700 hover:border-brand"
                        >
                          {b.isActive ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditBanner(b)}
                          title="ویرایش"
                          className="p-2 rounded-lg border border-line dark:border-slate-700 text-brand hover:border-brand"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBanner(b.id)}
                          title="حذف"
                          className="p-2 rounded-lg border border-line dark:border-slate-700 text-rose-600 hover:border-rose-500"
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
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={faqForm.questionFa} onChange={(e) => setFaqForm({ ...faqForm, questionFa: e.target.value })} placeholder="سوال متداول..." className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={faqForm.answerFa} onChange={(e) => setFaqForm({ ...faqForm, answerFa: e.target.value })} placeholder="پاسخ..." className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!faqForm.questionFa || !faqForm.answerFa) return;
                const f: FaqItem = { id: `faq_${Date.now()}`, ...faqForm, sortOrder: faqs.length + 1, isActive: true };
                await upsertFaq(f);
                setFaqForm({ categoryFa: 'ارسال و اصالت', questionFa: '', answerFa: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              افزودن سوال متداول
            </button>
          </div>
          {faqs.map((f) => (
            <div key={f.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
              <div>
                <p className="font-bold">{f.questionFa}</p>
                <p className="text-ink/60">{f.answerFa}</p>
              </div>
              <button type="button" onClick={() => deleteFaq(f.id)} className="text-rose-600 font-bold">حذف</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'agents' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input value={agentForm.nameFa} onChange={(e) => setAgentForm({ ...agentForm, nameFa: e.target.value })} placeholder="نام شعبه/نمایندگی" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.province} onChange={(e) => setAgentForm({ ...agentForm, province: e.target.value })} placeholder="استان" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.city} onChange={(e) => setAgentForm({ ...agentForm, city: e.target.value })} placeholder="شهر" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} placeholder="تلفن" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
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
                setAgentForm({ nameFa: '', province: 'فارس', provinceSlug: 'fars', city: 'شیراز', phone: '', address: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              افزودن نمایندگی
            </button>
          </div>
          {agents.map((ag) => (
            <div key={ag.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
              <span>{ag.nameFa} ({ag.province} - {ag.city}) · {ag.phone}</span>
              <button type="button" onClick={() => deleteAgent(ag.id)} className="text-rose-600 font-bold">حذف</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">اعضای خبرنامه ({toPersianDigits(newsletterSubscribers.length)})</h2>
            {newsletterSubscribers.map((sub) => (
              <div key={sub.id} className="p-2.5 rounded-lg border border-line flex justify-between">
                <span>{sub.contact} ({sub.type})</span>
                <span className="tabular-nums text-ink/55">{formatJalaliDate(sub.createdAt)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand" />
              <span>ارسال کمپین پیامکی هدفمند (SMS Campaign)</span>
            </h2>
            <textarea rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className="w-full p-3 rounded-xl border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={() => pushToast(`کمپین پیامکی برای ${toPersianDigits(newsletterSubscribers.length)} مخاطب در صف ارسال ثبت شد.`, 'success')}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              ارسال گروهی کمپین
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminContentPage;
