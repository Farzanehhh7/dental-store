import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, ShieldCheck } from 'lucide-react';
import { IMG_HERO_CLINIC } from '../../data/seed';
import { toPersianDigits } from '../../lib/jalali';
import { t } from '../../lib/i18n';
import { buildResponsiveImageProps } from '../../lib/media';
import { BannerItem } from '../../types/domain';

const ACCENT_CLASSES: Record<'brand' | 'rose' | 'amber' | 'slate', { split: string; overlay: string }> = {
  brand: {
    split: 'text-brand dark:text-teal-300',
    overlay: 'text-teal-300',
  },
  rose: {
    split: 'text-rose-700 dark:text-rose-400',
    overlay: 'text-rose-300',
  },
  amber: {
    split: 'text-amber-700 dark:text-amber-300',
    overlay: 'text-amber-300',
  },
  slate: {
    split: 'text-ink/75 dark:text-slate-300',
    overlay: 'text-slate-200',
  },
};

function ActionCta({
  to,
  label,
  className,
  disableLinks,
  icon,
}: {
  to: string;
  label: string;
  className: string;
  disableLinks?: boolean;
  icon?: React.ReactNode;
}) {
  if (disableLinks) {
    return (
      <span className={className}>
        <span>{label}</span>
        {icon}
      </span>
    );
  }
  return (
    <Link to={to || '/'} className={className}>
      <span>{label}</span>
      {icon}
    </Link>
  );
}

export function HeroSlideView({
  banner,
  productCount,
  headingTag = 'h1',
  disableLinks = false,
  compact = false,
}: {
  banner: BannerItem;
  productCount?: number;
  headingTag?: 'h1' | 'h2';
  disableLinks?: boolean;
  compact?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [banner.imageUrl]);

  const layout = banner.layout === 'overlay' ? 'overlay' : 'split';
  const tone = banner.accentTone ?? 'brand';
  const badgeColor = ACCENT_CLASSES[tone];
  const HeadingTag = headingTag;

  const kickerText =
    banner.badgeTextFa?.trim() ||
    (productCount
      ? `تأمین تخصصی کلینیک‌ها، مطب‌ها و لابراتوارهای دندانپزشکی (${t('counts.products', { count: productCount })})`
      : 'تأمین تخصصی کلینیک‌ها و مطب‌های دندانپزشکی');

  const imageSrc = banner.imageUrl?.trim() || IMG_HERO_CLINIC;

  const renderFallbackImage = () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-teal-900 via-slate-800 to-slate-900 text-white/80 p-6 text-center">
      <ShieldCheck className="w-10 h-10 text-teal-300" />
      <p className="text-xs font-bold max-w-xs line-clamp-2">{banner.titleFa}</p>
    </div>
  );

  if (layout === 'overlay') {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden border border-line dark:border-slate-800 bg-slate-900 flex items-center ${
          compact ? 'min-h-[250px] lg:min-h-[300px]' : 'min-h-[320px] sm:min-h-[360px] lg:min-h-[410px]'
        }`}
      >
        <div className="absolute inset-0">
          {imgError ? (
            renderFallbackImage()
          ) : (
            <img
              {...buildResponsiveImageProps(imageSrc, {
                widths: [640, 960, 1280],
                sizes: '(max-width: 1024px) 100vw, 1280px',
                eager: headingTag === 'h1',
                fallback: IMG_HERO_CLINIC,
              })}
              alt={banner.titleFa}
              width={1280}
              height={540}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-l from-slate-950/90 via-slate-950/75 to-slate-950/25"
          />
        </div>

        <div
          className={`relative z-10 w-full max-w-2xl flex flex-col justify-center gap-4 text-white ${
            compact ? 'p-6 sm:p-8' : 'p-7 sm:p-10 lg:p-14 pb-16 sm:pb-14'
          }`}
        >
          <p className={`text-xs font-bold ${badgeColor.overlay}`}>{kickerText}</p>
          <HeadingTag
            className={`font-extrabold leading-snug text-white [text-wrap:balance] ${
              compact ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-2xl sm:text-3xl lg:text-4xl'
            }`}
          >
            {banner.titleFa}
          </HeadingTag>
          {banner.subtitleFa && (
            <p className="text-sm lg:text-base text-slate-200 leading-relaxed max-w-xl">{banner.subtitleFa}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {banner.ctaTextFa && (
              <ActionCta
                to={banner.linkPath}
                label={banner.ctaTextFa}
                disableLinks={disableLinks}
                icon={<ArrowLeft className="w-4 h-4 shrink-0" />}
                className="px-6 py-3 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              />
            )}
            {banner.secondaryCtaTextFa && banner.secondaryLinkPath && (
              <ActionCta
                to={banner.secondaryLinkPath}
                label={banner.secondaryCtaTextFa}
                disableLinks={disableLinks}
                className="px-5 py-3 rounded-lg border border-white/35 bg-slate-950/35 text-sm font-bold text-white hover:bg-white/15 transition-colors whitespace-nowrap shrink-0"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-12 items-stretch bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl overflow-hidden">
      <div
        className={`lg:col-span-6 flex flex-col justify-center gap-4 ${
          compact ? 'p-6 sm:p-8' : 'p-7 sm:p-10 lg:p-12'
        }`}
      >
        <p className={`text-xs font-bold ${badgeColor.split}`}>{kickerText}</p>
        <HeadingTag
          className={`font-extrabold leading-snug text-ink dark:text-slate-100 [text-wrap:balance] ${
            compact ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-2xl sm:text-3xl lg:text-4xl'
          }`}
        >
          {banner.titleFa}
        </HeadingTag>
        {banner.subtitleFa && (
          <p className="text-sm lg:text-base text-ink/75 dark:text-slate-300 leading-relaxed max-w-xl">
            {banner.subtitleFa}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {banner.ctaTextFa && (
            <ActionCta
              to={banner.linkPath}
              label={banner.ctaTextFa}
              disableLinks={disableLinks}
              icon={<ArrowLeft className="w-4 h-4 shrink-0" />}
              className="px-6 py-3 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brandDark transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            />
          )}
          {banner.secondaryCtaTextFa && banner.secondaryLinkPath && (
            <ActionCta
              to={banner.secondaryLinkPath}
              label={banner.secondaryCtaTextFa}
              disableLinks={disableLinks}
              className="px-5 py-3 rounded-lg border border-line dark:border-slate-700 text-sm font-bold text-ink dark:text-slate-200 hover:border-brand transition-colors whitespace-nowrap shrink-0"
            />
          )}
        </div>
      </div>

      <div
        className={`lg:col-span-6 bg-surface dark:bg-slate-800 relative ${
          compact ? 'min-h-[220px] lg:min-h-[280px]' : 'min-h-[250px] sm:min-h-[320px] lg:min-h-[410px]'
        }`}
      >
        {imgError ? (
          renderFallbackImage()
        ) : (
          <img
            {...buildResponsiveImageProps(imageSrc, {
              widths: [480, 768, 960],
              sizes: '(max-width: 1024px) 100vw, 50vw',
              eager: headingTag === 'h1',
              fallback: IMG_HERO_CLINIC,
            })}
            alt={banner.titleFa}
            width={960}
            height={540}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>
    </div>
  );
}

export default function HeroBannerSlider({
  banners,
  productCount,
}: {
  banners: BannerItem[];
  productCount: number;
}) {
  const slides = useMemo(() => {
    const activeHero = banners
      .filter((b) => b.slot === 'hero' && b.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (activeHero.length > 0) return activeHero;

    return [
      {
        id: 'fallback_hero',
        slot: 'hero' as const,
        layout: 'split' as const,
        badgeTextFa: `تأمین تخصصی کلینیک‌ها، مطب‌ها و لابراتوارهای دندانپزشکی (${t('counts.products', { count: productCount })})`,
        titleFa: 'تجهیزات و مواد دندانپزشکی با قیمت شفاف و اصالت IMED',
        subtitleFa:
          'از مواد مصرفی روزانه و کامپوزیت‌های ترمیمی با کنترل دقیق تاریخ انقضا تا تجهیزات سرمایه‌ای مطب همراه با پیش‌فاکتور رسمی، نصب در محل و گارانتی شرکتی.',
        ctaTextFa: 'مشاهده کاتالوگ محصولات',
        linkPath: '/category/consumables',
        secondaryCtaTextFa: 'حساب همکاری B2B کلینیک‌ها',
        secondaryLinkPath: '/account',
        accentTone: 'brand' as const,
        imageUrl: IMG_HERO_CLINIC,
        isActive: true,
        sortOrder: 1,
      },
    ];
  }, [banners, productCount]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [slides.length, activeIndex]);

  useEffect(() => {
    if (slides.length <= 1 || isPaused || !autoPlayEnabled) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, autoPlayEnabled]);

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const currentSlide = slides[activeIndex] ?? slides[0];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slides.length <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goPrev();
    }
  };

  return (
    <div
      className="space-y-3"
      role="region"
      aria-roledescription="carousel"
      aria-label="بنرهای ویژه صفحه اصلی"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="relative">
        <HeroSlideView banner={currentSlide} productCount={productCount} headingTag="h1" />

        {slides.length > 1 && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-slate-950/75 backdrop-blur-sm border border-white/15 rounded-xl p-1 text-white shadow-lg">
            <button
              type="button"
              onClick={goPrev}
              aria-label="اسلاید قبلی"
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-xs font-bold tabular-nums whitespace-nowrap">
              {toPersianDigits(activeIndex + 1)} / {toPersianDigits(slides.length)}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="اسلاید بعدی"
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAutoPlayEnabled((v) => !v)}
              aria-label={autoPlayEnabled ? 'توقف حرکت خودکار اسلایدر' : 'شروع حرکت خودکار اسلایدر'}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors border-r border-white/15"
            >
              {autoPlayEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="انتخاب اسلاید بنر"
        >
          {slides.map((slide, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveIndex(idx)}
                className={`flex-1 min-w-[140px] max-w-xs text-right px-3.5 py-2.5 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-brand text-brand dark:text-teal-300 shadow-sm'
                    : 'bg-surface/70 dark:bg-slate-900/60 border-line dark:border-slate-800 text-ink/70 dark:text-slate-400 hover:border-brand/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                  <span className="truncate">{slide.badgeTextFa || slide.titleFa}</span>
                  <span className="tabular-nums opacity-60 shrink-0">{toPersianDigits(idx + 1)}</span>
                </div>
                <p className="text-xs font-extrabold truncate mt-0.5 text-ink dark:text-slate-100">
                  {slide.titleFa}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
