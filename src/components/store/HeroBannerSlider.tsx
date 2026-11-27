import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../context/i18n';
import { IMG_HERO_CLINIC } from '../../data/seed';
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
  const { t } = useI18n();
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
      ? t('hero.kickerWithCount', { productsCount: t('counts.products', { count: productCount }) })
      : t('hero.kickerDefault'));

  const imageSrc = banner.imageUrl?.trim() || IMG_HERO_CLINIC;

  const renderFallbackImage = () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-teal-900 via-slate-800 to-slate-900 text-white/90 p-6 text-center">
      <ShieldCheck className="w-10 h-10 text-teal-300" aria-hidden="true" />
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
          className={`relative z-10 w-full max-w-2xl flex flex-col justify-center gap-3 sm:gap-4 text-white ${
            compact ? 'p-5 sm:p-8' : 'p-5 sm:p-10 lg:p-14 pb-16 sm:pb-14'
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
                icon={<ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />}
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
        className={`lg:col-span-6 flex flex-col justify-center gap-3 sm:gap-4 ${
          compact ? 'p-5 sm:p-8' : 'p-5 sm:p-10 lg:p-12'
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
              icon={<ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />}
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
  const { t, formatDigits } = useI18n();

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
        badgeTextFa: t('hero.kickerWithCount', { productsCount: t('counts.products', { count: productCount }) }),
        titleFa: t('hero.fallbackTitle'),
        subtitleFa: t('hero.fallbackSubtitle'),
        ctaTextFa: t('hero.fallbackPrimaryCta'),
        linkPath: '/category/consumables',
        secondaryCtaTextFa: t('hero.fallbackSecondaryCta'),
        secondaryLinkPath: '/account',
        accentTone: 'brand' as const,
        imageUrl: IMG_HERO_CLINIC,
        isActive: true,
        sortOrder: 1,
      },
    ];
  }, [banners, productCount, t]);

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
      aria-label={t('hero.carouselAria')}
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
          <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur-sm border border-white/15 rounded-xl p-1 text-white shadow-lg">
            <button
              type="button"
              onClick={goPrev}
              aria-label={t('hero.prevSlide')}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-xs font-bold tabular-nums whitespace-nowrap">
              {formatDigits(activeIndex + 1)} / {formatDigits(slides.length)}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label={t('hero.nextSlide')}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAutoPlayEnabled((v) => !v)}
              aria-label={autoPlayEnabled ? t('hero.pauseAutoplay') : t('hero.playAutoplay')}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors border-s border-white/15"
            >
              {autoPlayEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <div
          className="flex overflow-x-auto no-scrollbar snap-x items-stretch gap-2 pb-1 sm:grid sm:grid-cols-3 lg:flex lg:flex-wrap"
          role="tablist"
          aria-label={t('hero.selectSlideAria')}
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
                className={`flex-1 min-w-[200px] sm:min-w-0 lg:max-w-xs snap-start text-start px-3.5 py-2.5 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-brand text-brand dark:text-teal-300 shadow-sm'
                    : 'bg-surface/70 dark:bg-slate-900/60 border-line dark:border-slate-800 text-ink/75 dark:text-slate-300 hover:border-brand/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                  <span className="truncate">{slide.badgeTextFa || slide.titleFa}</span>
                  <span className="tabular-nums opacity-85 shrink-0">{formatDigits(idx + 1)}</span>
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
