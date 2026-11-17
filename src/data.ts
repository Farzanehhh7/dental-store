// MOCK DATA ONLY. The real store reads everything from the database (see docs/DATA_AND_ADMIN_SPEC.md).

export type Variant = { id: string; label: string; price: number | null; inStock: boolean };
export type Product = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  summary: string;
  variants: Variant[];
};
export type Category = { slug: string; name: string; description: string };

export const categories: Category[] = [
  { slug: 'consumables', name: 'مواد مصرفی', description: 'دستکش، ماسک، سرنگ، سوزن و لوازم یک‌بارمصرف' },
  { slug: 'restorative', name: 'مواد ترمیمی', description: 'کامپوزیت، بانداینگ، گلاس‌آینومر' },
  { slug: 'endodontics', name: 'اندودنتیکس', description: 'فایل، گوتاپرکا، سیلر و لوازم ریشه' },
  { slug: 'instruments', name: 'ابزار و تجهیزات', description: 'ابزار دستی، فرز و هندپیس' },
];

export const products: Product[] = [
  {
    slug: 'nitrile-gloves',
    name: 'دستکش نیتریل معاینه',
    brand: 'نمونه‌برند الف',
    category: 'consumables',
    summary: 'دستکش بدون پودر، مناسب معاینه و کار روزانه مطب.',
    variants: [
      { id: 'v1', label: 'سایز S - بسته ۱۰۰ عددی', price: 420000, inStock: true },
      { id: 'v2', label: 'سایز M - بسته ۱۰۰ عددی', price: 420000, inStock: true },
      { id: 'v3', label: 'سایز L - کارتن ۱۰ بسته', price: 3900000, inStock: false },
    ],
  },
  {
    slug: 'universal-composite',
    name: 'کامپوزیت یونیورسال',
    brand: 'نمونه‌برند ب',
    category: 'restorative',
    summary: 'کامپوزیت نانوهیبرید با طیف رنگی کامل.',
    variants: [
      { id: 'v1', label: 'رنگ A2 - سرنگ ۴ گرمی', price: 1850000, inStock: true },
      { id: 'v2', label: 'رنگ A3 - سرنگ ۴ گرمی', price: 1850000, inStock: true },
      { id: 'v3', label: 'ست کامل ۶ رنگ', price: null, inStock: true },
    ],
  },
  {
    slug: 'rotary-files',
    name: 'فایل روتاری ریشه',
    brand: 'نمونه‌برند الف',
    category: 'endodontics',
    summary: 'فایل نیکل‌تیتانیوم برای شکل‌دهی کانال.',
    variants: [
      { id: 'v1', label: 'طول ۲۵ میلی‌متر - بسته ۶ عددی', price: 2600000, inStock: true },
      { id: 'v2', label: 'طول ۲۱ میلی‌متر - بسته ۶ عددی', price: 2500000, inStock: false },
    ],
  },
  {
    slug: 'mirror-set',
    name: 'ست آینه و سوند معاینه',
    brand: 'نمونه‌برند ج',
    category: 'instruments',
    summary: 'ست استیل ضدزنگ، قابل استریل در اتوکلاو.',
    variants: [{ id: 'v1', label: 'ست ۱۲ عددی', price: 980000, inStock: true }],
  },
  {
    slug: 'bonding-agent',
    name: 'بانداینگ نسل هفتم',
    brand: 'نمونه‌برند ب',
    category: 'restorative',
    summary: 'بانداینگ تک‌جزئی با چسبندگی بالا به مینا و عاج.',
    variants: [{ id: 'v1', label: 'بطری ۵ میلی‌لیتری', price: 1450000, inStock: true }],
  },
];

const nf = new Intl.NumberFormat('fa-IR');
export const formatNumber = (n: number) => nf.format(n);

/** Price always has an explicit state: never "0 Toman". */
export function priceLabel(p: Product): string {
  const priced = p.variants.filter((v) => v.price !== null && v.inStock).map((v) => v.price as number);
  if (!p.variants.some((v) => v.inStock)) return 'ناموجود';
  if (priced.length === 0) return 'تماس بگیرید';
  const min = Math.min(...priced);
  const max = Math.max(...priced);
  return min === max ? `${formatNumber(min)} تومان` : `از ${formatNumber(min)} تومان`;
}
