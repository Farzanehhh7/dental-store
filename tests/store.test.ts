import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMoney, gregorianToJalali, toPersianDigits } from '../src/lib/jalali';
import { normalizePersian, scoreSearchMatch } from '../src/lib/persian-search';
import { getProductPriceSummary, isDiscountGenuineByHistory, resolveVariantPrice } from '../src/lib/pricing';
import { auditSeoHealth, buildFaqJsonLd, buildProductJsonLd, findOrphanProducts } from '../src/lib/seo';
import { SEED_CAMPAIGNS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_SETTINGS, SEED_BRANDS } from '../src/data/seed';
import { SEED_BANNERS } from '../src/data/expandedCatalog';
import { ContractPrice, Product } from '../src/types/domain';

describe('Currency, Persian Digits & Jalali Calendar', () => {
  it('never displays 0 Toman and formats IRT vs IRR properly', () => {
    expect(formatMoney(0, 'IRT')).toBe('تماس برای قیمت');
    expect(formatMoney(null, 'IRR')).toBe('تماس برای قیمت');
    expect(formatMoney(1500000, 'IRT')).toContain('تومان');
    expect(formatMoney(1500000, 'IRR')).toContain('ریال');
    expect(toPersianDigits('2026-03-21')).toBe('۲۰۲۶-۰۳-۲۱');
  });

  it('converts Gregorian equinox date 2025-03-21 to 1404/01/01 Jalali', () => {
    const [jy, jm, jd] = gregorianToJalali(2025, 3, 21);
    expect([jy, jm, jd]).toEqual([1404, 1, 1]);
  });
});

describe('Persian Search Normalization & Ranking', () => {
  it('normalizes Arabic kaf/yeh, kashida, ZWNJ, and Persian digits', () => {
    expect(normalizePersian('كامپوزيت‌ نـــانو ۱۲۳')).toBe('کامپوزیت نانو 123');
  });

  it('prioritizes exact SKU/IMED code without false typo fuzzing and matches synonym typos', () => {
    const exactScore = scoreSearchMatch('DM-COMP-01', {
      exactCodes: ['DM-COMP-01'],
      textFields: ['کامپوزیت'],
    });
    expect(exactScore).toBe(100);

    const noFalseCodeTypo = scoreSearchMatch('DM-COMP-99', {
      exactCodes: ['DM-COMP-01'],
      textFields: ['کامپوزیت'],
    });
    expect(noFalseCodeTypo).toBe(0);

    const synonymScore = scoreSearchMatch('ودپیکر', {
      exactCodes: [],
      textFields: ['دستگاه جرم‌گیر Woodpecker UDS-P'],
    });
    expect(synonymScore).toBeGreaterThanOrEqual(60);
  });
});

describe('Pricing Resolution, Contract Override & Genuine Discount Verification', () => {
  const sample = SEED_PRODUCTS[0];
  const variant = sample.variants[0];

  it('resolves contract price and checks historical discount validity', () => {
    const contracts: ContractPrice[] = [
      {
        id: 'ctr_test',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک تست',
        productId: sample.id,
        productTitleFa: sample.titleFa,
        variantId: variant.id,
        unitPrice: 350000,
        validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
        isActive: true,
      },
    ];

    const resolved = resolveVariantPrice(sample, variant, {
      customerGroup: 'dentist',
      quantity: 1,
      campaigns: [],
      settings: SEED_SETTINGS,
      contractPrices: contracts,
      userId: 'usr_clinic_1',
    });

    expect(resolved.state).toBe('fixed');
    expect(resolved.unitPrice).toBe(350000);
    expect(resolved.priceSource).toBe('contract');
  });

  it('rejects genuine discount badge if artificial price hike happened inside proof window', () => {
    const manipulatedProduct: Product = {
      ...sample,
      publishedAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      priceHistory: [
        {
          variantId: variant.id,
          variantLabel: variant.labelFa,
          oldPrice: 2000000,
          newPrice: 2900000,
          changedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          source: 'admin',
        },
      ],
    };
    expect(isDiscountGenuineByHistory(manipulatedProduct, variant.id, 2800000, 30)).toBe(false);
  });

  it('respects call_for_price and coming_soon summary states', () => {
    const callProd: Product = { ...sample, pricingMode: 'call_for_price' };
    expect(getProductPriceSummary(callProd, { campaigns: SEED_CAMPAIGNS, settings: SEED_SETTINGS }).label).toBe('تماس برای قیمت');

    const soonProd: Product = { ...sample, status: 'coming_soon' };
    expect(getProductPriceSummary(soonProd, { campaigns: SEED_CAMPAIGNS, settings: SEED_SETTINGS }).label).toBe('به‌زودی');
  });
});

describe('SEO JSON-LD, Orphan Detector & Automated Health Audit', () => {
  it('outputs Product JSON-LD with IRR priceCurrency and omits offers on call_for_price', () => {
    const fixedProd = SEED_PRODUCTS.find((p) => p.pricingMode === 'fixed')!;
    const brand = SEED_BRANDS.find((b) => b.id === fixedProd.brandId);
    const jsonLd = buildProductJsonLd(fixedProd, brand, SEED_CAMPAIGNS, SEED_SETTINGS);
    expect(jsonLd['@type']).toBe('Product');
    const offers = jsonLd.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe('IRR');

    const callProd = { ...fixedProd, pricingMode: 'call_for_price' as const };
    const callLd = buildProductJsonLd(callProd, brand, SEED_CAMPAIGNS, SEED_SETTINGS);
    expect(callLd.offers).toBeUndefined();
  });

  it('generates FAQPage JSON-LD and detects orphan/kashida issues accurately', () => {
    const faqLd = buildFaqJsonLd([{ q: 'سوال تست؟', a: 'پاسخ تست' }]);
    expect(faqLd?.['@type']).toBe('FAQPage');

    const orphanProd: Product = {
      ...SEED_PRODUCTS[0],
      id: 'orphan_1',
      status: 'active',
      primaryCategoryId: 'non_existent_cat',
      categoryIds: ['non_existent_cat'],
      titleFa: 'محصول بـــا کشیده',
    };

    const orphans = findOrphanProducts([...SEED_PRODUCTS, orphanProd], SEED_CATEGORIES);
    expect(orphans.some((p) => p.id === 'orphan_1')).toBe(true);

    const findings = auditSeoHealth([orphanProd], SEED_CATEGORIES, []);
    const kashidaFinding = findings.find((f) => f.id === 'kashida');
    expect(kashidaFinding?.severity).toBe('error');
    expect(kashidaFinding?.affectedCount).toBe(1);
  });
});

describe('Configurable Hero Slider Banners', () => {
  it('provides multiple active hero slides covering both split and overlay layouts with existing local assets', () => {
    const activeHeroSlides = SEED_BANNERS.filter((b) => b.slot === 'hero' && b.isActive);
    expect(activeHeroSlides.length).toBeGreaterThanOrEqual(3);
    expect(activeHeroSlides.some((b) => b.layout === 'split')).toBe(true);
    expect(activeHeroSlides.some((b) => b.layout === 'overlay')).toBe(true);

    for (const slide of activeHeroSlides) {
      expect(slide.titleFa.length).toBeGreaterThan(5);
      expect(slide.linkPath.startsWith('/')).toBe(true);
      if (slide.imageUrl.startsWith('/assets/')) {
        const diskPath = path.join(process.cwd(), 'public', slide.imageUrl);
        expect(fs.existsSync(diskPath)).toBe(true);
      } else if (slide.imageUrl.startsWith('/src/')) {
        const diskPath = path.join(process.cwd(), slide.imageUrl.slice(1));
        expect(fs.existsSync(diskPath)).toBe(true);
      }
    }
  });
});
