import { Brand, Product } from '../types/domain';
import { stripKashida } from '../lib/persian-search';

export interface SeoBuildInput {
  titleFa: string;
  brand: Brand;
  categoryNameFa: string;
  imedCode: string;
  kind: 'consumable' | 'capital_equipment';
  clinicalBullets: string[];
  faqPair?: { q: string; a: string };
  existingShort?: string;
  existingDesc?: string;
}

export function buildSeoProductFields(input: SeoBuildInput): Pick<
  Product,
  'metaTitle' | 'metaDescription' | 'shortDescriptionFa' | 'descriptionFa' | 'faqs'
> {
  const cleanTitle = stripKashida(input.titleFa).slice(0, 195);
  const stdText = input.brand.isAuthorizedDealer ? 'استاندارد CE و FDA' : 'گواهی CE و ISO 13485';

  // Unique Meta Title (~45–65 chars, zero Kashida)
  const rawMetaTitle = `${cleanTitle.slice(0, 46)} | دنتال‌مارکت`;
  const metaTitle = stripKashida(rawMetaTitle).slice(0, 68);

  // Unique Meta Description (~120–160 chars)
  const rawMetaDesc = `${cleanTitle} ساخت ${input.brand.countryFa} با کد ${input.imedCode} و ${stdText}؛ استعلام قیمت، ارسال سریع و پیش‌فاکتور رسمی در دنتال‌مارکت.`;
  const metaDescription = stripKashida(rawMetaDesc).slice(0, 160);

  const shortDescriptionFa = stripKashida(
    input.existingShort && input.existingShort.length >= 45
      ? input.existingShort
      : `${cleanTitle} از برند ${input.brand.nameFa} (${input.brand.countryFa}) ویژه ${input.categoryNameFa} با ${stdText} و کد ${input.imedCode}.`
  );

  const bulletsBlock = input.clinicalBullets.map((b) => `• ${stripKashida(b)}`).join('\n');
  const warrantyClause =
    input.kind === 'capital_equipment'
      ? 'دارای گارانتی معتبر، نصب و راه‌اندازی تخصصی توسط تکنسین مجاز و تامین قطعات یدکی بلندمدت.'
      : 'ارسال با کنترل دقیق شماره بچ (Batch) و تاریخ انقضای معتبر مطابق سیستم انبارداری FEFO.';

  const leadParagraph = input.existingDesc ? stripKashida(input.existingDesc) : `${cleanTitle} یکی از محصولات تخصصی و پرکاربرد در حوزه ${input.categoryNameFa} از برند معتبر ${input.brand.nameFa} (${input.brand.countryFa}) است که برای استفاده روزمره مطب‌ها و کلینیک‌های دندانپزشکی طراحی و تولید شده است.`;

  const descriptionFa = [
    `معرفی تخصصی ${cleanTitle}`,
    leadParagraph,
    '',
    'ویژگی‌ها و مزایای کلینیکی:',
    bulletsBlock,
    '',
    'استانداردها، اصالت کالا و فروش کلینیکی:',
    `• شناسه ردیابی تجهیزات پزشکی وزارت بهداشت: ${input.imedCode}`,
    `• کشور مبدا و استاندارد کیفیت: ${input.brand.countryFa} (${stdText})`,
    `• ${warrantyClause}`,
    '• امکان خرید تکی یا عمده با تعرفه اختصاصی دندانپزشکان، کلینیک‌ها و صدور پیش‌فاکتور رسمی.',
  ].join('\n');

  const faqs: { q: string; a: string }[] = [
    input.faqPair ?? {
      q: `آیا ${cleanTitle} دارای اصالت و تاییدیه IMED است؟`,
      a: `بله، این محصول از برند ${input.brand.nameFa} همراه با شناسه ردیابی ${input.imedCode}، ${stdText} و ضمانت اصالت دنتال‌مارکت عرضه می‌شود.`,
    },
    input.kind === 'capital_equipment'
      ? {
          q: 'شرایط گارانتی، نصب و صدور پیش‌فاکتور رسمی چگونه است؟',
          a: 'کلیه تجهیزات سرمایه‌ای با گارانتی رسمی شرکتی، خدمات نصب و آموزش و امکان صدور پیش‌فاکتور رسمی دارای کد اقتصادی برای کلینیک‌ها ارائه می‌شوند.',
        }
      : {
          q: 'کنترل تاریخ انقضا (FEFO) و تخفیف خرید تعدادی چگونه محاسبه می‌شود؟',
          a: 'تمامی اقلام مصرفی بر اساس نزدیک‌ترین بچ دارای تاریخ انقضای مطمئن ارسال می‌شوند و برای سفارش‌های چندتایی و کلینیکی تخفیف پلکانی و گروهی اعمال می‌گردد.',
        },
  ];

  return {
    metaTitle,
    metaDescription,
    shortDescriptionFa,
    descriptionFa,
    faqs,
  };
}

export function enrichProductWithSeo(
  product: Product,
  brand: Brand | undefined,
  categoryNameFa: string
): Product {
  const safeBrand: Brand = brand ?? {
    id: product.brandId,
    nameFa: product.originCountryFa,
    nameEn: product.brandId,
    slug: product.brandId,
    countryCode: product.originCountryCode,
    countryFa: product.originCountryFa,
    descriptionFa: '',
    isAuthorizedDealer: true,
    isActive: true,
    updatedAt: product.updatedAt,
  };

  const defaultBullets =
    product.kind === 'capital_equipment'
      ? [
          `طراحی دقیق و ارگونومیک ویژه درمان‌های تخصصی ${categoryNameFa}`,
          'پایداری عملکرد در استفاده طولانی‌مدت مطب و کلینیک دندانپزشکی',
          'سازگار با استانداردهای استریلیزاسیون و کنترل عفونت کلینیکی',
        ]
      : [
          `فرمولاسیون و دقت ساخت استاندارد در گروه ${categoryNameFa}`,
          'ثبات کیفی بالا و سهولت کاربری در پروسیجرهای بالینی روزمره',
          'بسته‌بندی ایمن و استاندارد جهت حفظ خواص فیزیکی و شیمیایی محصول',
        ];

  const seo = buildSeoProductFields({
    titleFa: product.titleFa,
    brand: safeBrand,
    categoryNameFa,
    imedCode: product.imedCode ?? 'IMED-400100',
    kind: product.kind,
    clinicalBullets: defaultBullets,
    faqPair: product.faqs?.[0],
    existingShort: product.shortDescriptionFa,
    existingDesc: product.descriptionFa,
  });

  return {
    ...product,
    metaTitle: product.metaTitle ?? seo.metaTitle,
    metaDescription: product.metaDescription ?? seo.metaDescription,
    shortDescriptionFa: seo.shortDescriptionFa,
    descriptionFa: seo.descriptionFa,
    faqs: product.faqs && product.faqs.length > 0 ? product.faqs : seo.faqs,
  };
}
