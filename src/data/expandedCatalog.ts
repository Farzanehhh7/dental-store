import {
  AttributeDef,
  BannerItem,
  Brand,
  Category,
  ContractPrice,
  FaqItem,
  InvoiceRecord,
  NewsletterSubscriber,
  NotFoundLog,
  PaymentLedgerEntry,
  Product,
  ProductCostRecord,
  ReturnRequest,
  SitePage,
  StockMovement,
  StockNotification,
  Supplier,
  Warehouse,
} from '../types/domain';
import {
  IMG_COMPOSITE,
  IMG_EQUIPMENT,
  IMG_GLOVES,
  IMG_HERO_CLINIC,
  IMG_ROTARY,
  SEED_ATTRIBUTES,
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
} from './seed';

const nowIso = new Date().toISOString();
const plusDaysIso = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const minusDaysIso = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

// Complete 49 Dental Attributes (§3.1)
const EXTRA_ATTRIBUTES: AttributeDef[] = [
  { id: 'attr_weight_volume', code: 'weight_volume', labelFa: 'وزن / حجم', labelEn: 'Weight/Volume', type: 'text', unit: 'g/ml', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_size_gauge', code: 'size_gauge', labelFa: 'سایز / گیج', labelEn: 'Size/Gauge', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: '27G', labelFa: '27G', labelEn: '27G' }, { key: '30G', labelFa: '30G', labelEn: '30G' }, { key: 'S', labelFa: 'کوچک (S)', labelEn: 'S' }, { key: 'M', labelFa: 'متوسط (M)', labelEn: 'M' }, { key: 'L', labelFa: 'بزرگ (L)', labelEn: 'L' }], updatedAt: nowIso },
  { id: 'attr_flavor', code: 'flavor', labelFa: 'طعم', labelEn: 'Flavor', type: 'select', isFilterable: true, isComparable: false, showInSpec: true, options: [{ key: 'mint', labelFa: 'نعناع', labelEn: 'Mint' }, { key: 'strawberry', labelFa: 'توت‌فرنگی', labelEn: 'Strawberry' }, { key: 'neutral', labelFa: 'بدون طعم', labelEn: 'Neutral' }], updatedAt: nowIso },
  { id: 'attr_sterility', code: 'sterility', labelFa: 'استریل', labelEn: 'Sterile', type: 'boolean', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_latex_free', code: 'latex_free', labelFa: 'بدون لاتکس', labelEn: 'Latex-Free', type: 'boolean', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_shelf_life_months', code: 'shelf_life_months', labelFa: 'عمر قفسه', labelEn: 'Shelf Life', type: 'number', unit: 'ماه', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_storage_temp', code: 'storage_temp', labelFa: 'دمای نگهداری', labelEn: 'Storage Temp', type: 'text', unit: '°C', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_generation', code: 'generation', labelFa: 'نسل باندینگ', labelEn: 'Generation', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: '5th', labelFa: 'نسل پنجم', labelEn: '5th' }, { key: '7th', labelFa: 'نسل هفتم', labelEn: '7th' }, { key: '8th', labelFa: 'نسل هشتم (یونیورسال)', labelEn: '8th' }], updatedAt: nowIso },
  { id: 'attr_radiopacity', code: 'radiopacity', labelFa: 'رادیواپاسیتی', labelEn: 'Radiopaque', type: 'boolean', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_filler_pct', code: 'filler_pct', labelFa: 'درصد فیلر وزنی', labelEn: 'Filler %', type: 'number', unit: '٪', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_viscosity', code: 'viscosity', labelFa: 'ویسکوزیته', labelEn: 'Viscosity', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'flow', labelFa: 'فلو (روان)', labelEn: 'Flowable' }, { key: 'packable', labelFa: 'خمیری (Packable)', labelEn: 'Packable' }, { key: 'putty', labelFa: 'پوتی', labelEn: 'Putty' }], updatedAt: nowIso },
  { id: 'attr_working_time_sec', code: 'working_time_sec', labelFa: 'زمان کاری', labelEn: 'Working Time', type: 'number', unit: 'ثانیه', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_setting_time_sec', code: 'setting_time_sec', labelFa: 'زمان سخت‌شدن', labelEn: 'Setting Time', type: 'number', unit: 'ثانیه', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_length_mm', code: 'length_mm', labelFa: 'طول', labelEn: 'Length', type: 'select', unit: 'mm', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: '21', labelFa: '۲۱ میلی‌متر', labelEn: '21mm' }, { key: '25', labelFa: '۲۵ میلی‌متر', labelEn: '25mm' }, { key: '31', labelFa: '۳۱ میلی‌متر', labelEn: '31mm' }], updatedAt: nowIso },
  { id: 'attr_torque_ncm', code: 'torque_ncm', labelFa: 'گشتاور خروجی', labelEn: 'Torque', type: 'number', unit: 'N·cm', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_rpm_range', code: 'rpm_range', labelFa: 'بازه دور موتور', labelEn: 'RPM Range', type: 'text', unit: 'RPM', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_motion_mode', code: 'motion_mode', labelFa: 'حالت حرکتی', labelEn: 'Motion Mode', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'rotary', labelFa: 'چرخشی پیوسته', labelEn: 'Continuous' }, { key: 'reciprocating', labelFa: 'رفت‌وبرگشتی (Reciprocating)', labelEn: 'Reciprocating' }], updatedAt: nowIso },
  { id: 'attr_shank_type', code: 'shank_type', labelFa: 'نوع شفت فرز', labelEn: 'Shank Type', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'FG', labelFa: 'FG (توربین)', labelEn: 'FG' }, { key: 'RA', labelFa: 'RA (آنگل)', labelEn: 'RA' }, { key: 'HP', labelFa: 'HP (هندپیس مستقیم)', labelEn: 'HP' }], updatedAt: nowIso },
  { id: 'attr_grit', code: 'grit', labelFa: 'درجه زبری فرز', labelEn: 'Grit', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'coarse', labelFa: 'زبر (سبز/مشکی)', labelEn: 'Coarse' }, { key: 'medium', labelFa: 'متوسط (آبی)', labelEn: 'Medium' }, { key: 'fine', labelFa: 'نرم (قرمز/زرد)', labelEn: 'Fine' }], updatedAt: nowIso },
  { id: 'attr_head_size', code: 'head_size', labelFa: 'سایز هد', labelEn: 'Head Size', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'standard', labelFa: 'استاندارد', labelEn: 'Standard' }, { key: 'torque', labelFa: 'تورک', labelEn: 'Torque' }, { key: 'mini', labelFa: 'مینی', labelEn: 'Mini' }], updatedAt: nowIso },
  { id: 'attr_light_type', code: 'light_type', labelFa: 'نور هندپیس', labelEn: 'Illumination', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'optic', labelFa: 'فایبر اپتیک LED', labelEn: 'Fiber Optic' }, { key: 'non_optic', labelFa: 'بدون نور', labelEn: 'Non-Optic' }], updatedAt: nowIso },
  { id: 'attr_bearing_type', code: 'bearing_type', labelFa: 'بلبرینگ', labelEn: 'Bearing', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'ceramic', labelFa: 'سرامیکی', labelEn: 'Ceramic' }, { key: 'steel', labelFa: 'استیل', labelEn: 'Steel' }], updatedAt: nowIso },
  { id: 'attr_chuck_type', code: 'chuck_type', labelFa: 'نوع چاک', labelEn: 'Chuck Type', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'push_button', labelFa: 'پوش‌باتن', labelEn: 'Push Button' }, { key: 'wrench', labelFa: 'آچاری', labelEn: 'Wrench' }], updatedAt: nowIso },
  { id: 'attr_noise_db', code: 'noise_db', labelFa: 'سطح صدا', labelEn: 'Noise Level', type: 'number', unit: 'dB', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_gear_ratio', code: 'gear_ratio', labelFa: 'نسبت دنده', labelEn: 'Gear Ratio', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: '1:1', labelFa: '۱:۱', labelEn: '1:1' }, { key: '1:5', labelFa: '۱:۵ افزاینده', labelEn: '1:5' }, { key: '20:1', labelFa: '۲۰:۱ ایمپلنت', labelEn: '20:1' }], updatedAt: nowIso },
  { id: 'attr_voltage', code: 'voltage', labelFa: 'ولتاژ ورودی', labelEn: 'Voltage', type: 'text', unit: 'V', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_power_w', code: 'power_w', labelFa: 'توان مصرفی', labelEn: 'Power', type: 'number', unit: 'W', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_frequency_khz', code: 'frequency_khz', labelFa: 'فرکانس کاری', labelEn: 'Frequency', type: 'number', unit: 'kHz', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_wavelength_nm', code: 'wavelength_nm', labelFa: 'طول موج نور', labelEn: 'Wavelength', type: 'text', unit: 'nm', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_intensity_mw', code: 'intensity_mw', labelFa: 'شدت نور', labelEn: 'Intensity', type: 'number', unit: 'mW/cm²', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_chamber_liters', code: 'chamber_liters', labelFa: 'ظرفیت چمبر', labelEn: 'Chamber', type: 'number', unit: 'لیتر', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_sensor_size', code: 'sensor_size', labelFa: 'سایز سنسور', labelEn: 'Sensor Size', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'size1', labelFa: 'سایز ۱', labelEn: 'Size 1' }, { key: 'size1.5', labelFa: 'سایز ۱.۵', labelEn: 'Size 1.5' }, { key: 'size2', labelFa: 'سایز ۲', labelEn: 'Size 2' }], updatedAt: nowIso },
  { id: 'attr_resolution_lp', code: 'resolution_lp', labelFa: 'تفکیک‌پذیری تصویر', labelEn: 'Resolution', type: 'number', unit: 'lp/mm', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_fov_cm', code: 'fov_cm', labelFa: 'میدان دید CBCT', labelEn: 'FOV', type: 'text', unit: 'cm', isFilterable: false, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_implant_diameter', code: 'implant_diameter', labelFa: 'قطر فیکسچر', labelEn: 'Diameter', type: 'number', unit: 'mm', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
  { id: 'attr_implant_connection', code: 'implant_connection', labelFa: 'نوع کانکشن ایمپلنت', labelEn: 'Implant Connection', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'internal_hex', labelFa: 'هگز داخلی', labelEn: 'Internal Hex' }, { key: 'conical', labelFa: 'مخروطی (Conical)', labelEn: 'Conical' }], updatedAt: nowIso },
  { id: 'attr_surface_treatment', code: 'surface_treatment', labelFa: 'آماده‌سازی سطح', labelEn: 'Surface', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: 'sla', labelFa: 'SLA', labelEn: 'SLA' }, { key: 'rbt', labelFa: 'RBT', labelEn: 'RBT' }], updatedAt: nowIso },
  { id: 'attr_suture_size', code: 'suture_size', labelFa: 'سایز نخ بخیه', labelEn: 'Suture USP', type: 'select', isFilterable: true, isComparable: true, showInSpec: true, options: [{ key: '3-0', labelFa: '3-0', labelEn: '3-0' }, { key: '4-0', labelFa: '4-0', labelEn: '4-0' }, { key: '5-0', labelFa: '5-0', labelEn: '5-0' }], updatedAt: nowIso },
  { id: 'attr_autoclavable', code: 'autoclavable', labelFa: 'قابل اتوکلاو', labelEn: 'Autoclavable', type: 'boolean', isFilterable: true, isComparable: true, showInSpec: true, updatedAt: nowIso },
];

export const EXPANDED_ATTRIBUTES: AttributeDef[] = [...SEED_ATTRIBUTES, ...EXTRA_ATTRIBUTES];

// 16 L1 Dental Specialties + 88 L2 Subcategories = 104 Total Categories (§2)
const EXTRA_L1_DEFS: {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  desc: string;
  subs: [string, string, string][];
}[] = [
  {
    id: 'cat_diagnostics',
    slug: 'diagnostics',
    nameFa: 'تشخیص و معاینه',
    nameEn: 'Diagnostics & Exam',
    desc: 'آینه، سوند، پنس، دوربین داخل دهانی و کیت معاینه',
    subs: [
      ['cat_mirrors_probes', 'mirrors-probes', 'آینه، سوند و پنس معاینه'],
      ['cat_intraoral_cam', 'intraoral-cameras', 'دوربین داخل دهانی و چراغ تشخیص'],
      ['cat_pulp_testers', 'pulp-testers', 'تستر پالپ الکتریکی و حرارتی'],
      ['cat_articulating_paper', 'articulating-paper', 'کاغذ کاربن و تشخیص اکلوژن'],
      ['cat_loupes', 'dental-loupes', 'لوپ و هدلایت دندانپزشکی'],
    ],
  },
  {
    id: 'cat_surgery',
    slug: 'oral-surgery',
    nameFa: 'جراحی دهان و فک و صورت',
    nameEn: 'Oral Surgery',
    desc: 'فورسپس، الواتور، نخ بخیه، تیغ بیستوری و پیزوسرجری',
    subs: [
      ['cat_forceps', 'forceps-elevators', 'فورسپس، الواتور و کورت جراحی'],
      ['cat_sutures', 'sutures-blades', 'نخ بخیه و تیغ بیستوری استریل'],
      ['cat_hemostatic', 'hemostatic-agents', 'اسفنج هموستاتیک و بندآورنده خون'],
      ['cat_piezosurgery', 'piezosurgery', 'دستگاه پیزوسرجری و قلم‌های استخوان‌بر'],
      ['cat_surgical_suction', 'surgical-suction', 'سر ساکشن جراحی و ست سرم'],
    ],
  },
  {
    id: 'cat_implantology',
    slug: 'implantology',
    nameFa: 'ایمپلنتولوژی',
    nameEn: 'Implantology',
    desc: 'فیکسچر، اباتمنت، پودر استخوان، ممبرین و کیت جراحی ایمپلنت',
    subs: [
      ['cat_fixtures', 'implant-fixtures', 'فیکسچر و کاور اسکرو ایمپلنت'],
      ['cat_abutments', 'abutments-scanbody', 'اباتمنت، آنالوگ و اسکن‌بادی'],
      ['cat_bone_graft', 'bone-graft-membrane', 'پودر استخوان و ممبرین کلاژن'],
      ['cat_implant_kits', 'implant-surgical-kits', 'کیت جراحی و دریل‌های ایمپلنت'],
      ['cat_physiodispenser', 'physiodispenser', 'موتور ایمپلنت (فیزیودیسپنسر)'],
      ['cat_prp_prf', 'prp-prf-centrifuge', 'سانتریفیوژ PRF و کیت پی‌آرپی'],
    ],
  },
  {
    id: 'cat_periodontics',
    slug: 'periodontics',
    nameFa: 'پریودانتیکس (جرم‌گیری و لثه)',
    nameEn: 'Periodontics',
    desc: 'کویترو، سرقلم جرم‌گیر، کورت گریسی و پانسمان لثه',
    subs: [
      ['cat_ultrasonic_scalers', 'ultrasonic-scalers', 'جرم‌گیر اولتراسونیک و ایرفلو'],
      ['cat_scaler_tips', 'scaler-tips', 'سرقلم جرم‌گیری و اندوتیپ'],
      ['cat_curettes', 'periodontal-curettes', 'کورت گریسی، سیکل و پروب پریودنتال'],
      ['cat_prophy', 'prophy-paste-cups', 'خمیر و براش پروفیلاکسی'],
    ],
  },
  {
    id: 'cat_orthodontics',
    slug: 'orthodontics',
    nameFa: 'ارتودنسی',
    nameEn: 'Orthodontics',
    desc: 'براکت، آرچ‌وایر، الاستیک، بند، پنس ارتودنسی و ریتینر',
    subs: [
      ['cat_brackets', 'brackets-tubes', 'براکت فلزی، سرامیکی و سلف‌لیگیت'],
      ['cat_archwires', 'archwires', 'سیم‌های ارتودنسی NiTi و استیل'],
      ['cat_elastics', 'orthodontic-elastics', 'اورینگ، چین و الاستیک‌های ارتودنسی'],
      ['cat_ortho_pliers', 'orthodontic-pliers', 'پنس و ابزارهای تخصصی ارتودنسی'],
      ['cat_ortho_adhesives', 'ortho-adhesives', 'باندینگ و چسب براکت ارتودنسی'],
    ],
  },
  {
    id: 'cat_pediatrics',
    slug: 'pediatric-dentistry',
    nameFa: 'دندانپزشکی کودکان',
    nameEn: 'Pediatric Dentistry',
    desc: 'روکش SSC، فیشور سیلانت، وارنیش فلوراید و فرموكروزول',
    subs: [
      ['cat_ssc_crowns', 'pediatric-crowns', 'روکش‌های پیش‌ساخته اطفال (SSC / زیرکونیا)'],
      ['cat_sealants', 'pit-fissure-sealants', 'فیشور سیلانت و گلاس آینومر اطفال'],
      ['cat_fluoride', 'fluoride-varnish', 'وارنیش و ژل فلوراید طعم‌دار'],
      ['cat_pulpotomy', 'pulpotomy-materials', 'مواد پالپوتومی و فضای‌نگه‌دارنده'],
    ],
  },
  {
    id: 'cat_sterilization',
    slug: 'sterilization-control',
    nameFa: 'استریلیزاسیون و کنترل عفونت',
    nameEn: 'Sterilization',
    desc: 'رول اتوکلاو، دستگاه سیلر، آب‌مقطرگیر، شستشوی اولتراسونیک و نشانگرها',
    subs: [
      ['cat_autoclave_pouches', 'autoclave-pouches', 'رول و پاکت استریل اتوکلاو'],
      ['cat_bio_indicators', 'sterilization-indicators', 'نشانگر بیولوژیک و شیمیایی کلاس ۴ تا ۶'],
      ['cat_ultrasonic_cleaners', 'ultrasonic-cleaners', 'دستگاه اولتراسونیک و سیلر رول'],
      ['cat_disinfectants', 'disinfectants', 'محلول ضدعفونی سطوح، ابزار و توربین'],
      ['cat_distillers', 'water-distillers', 'دستگاه آب‌مقطرگیر مطب'],
    ],
  },
  {
    id: 'cat_imaging',
    slug: 'dental-imaging',
    nameFa: 'تصویربرداری دندانپزشکی',
    nameEn: 'Dental Imaging',
    desc: 'سنسور RVG، دستگاه رادیوگرافی تک‌دندان، فسفرپلیت و OPG/CBCT',
    subs: [
      ['cat_rvg_sensors', 'rvg-sensors', 'سنسور دیجیتال RVG و هولدر'],
      ['cat_xray_units', 'xray-units', 'دستگاه رادیوگرافی پرتابل و دیواری'],
      ['cat_psp_scanners', 'psp-scanners', 'اسکنر فسفرپلیت (PSP) و پلیت‌ها'],
      ['cat_opg_cbct', 'opg-cbct', 'دستگاه OPG و CBCT سه‌بعدی'],
      ['cat_dental_film', 'dental-xray-film', 'فیلم رادیوگرافی و دارو ظهور و ثبوت'],
    ],
  },
  {
    id: 'cat_lab',
    slug: 'dental-laboratory',
    nameFa: 'تجهیزات لابراتوار دندانسازی',
    nameEn: 'Dental Laboratory',
    desc: 'میکروموتور لابراتواری، کوره پرسلن، بلانک زیرکونیا، آکریل و گچ',
    subs: [
      ['cat_zirconia_cadcam', 'zirconia-cadcam', 'بلانک زیرکونیا، PMMA و ابزار CAD/CAM'],
      ['cat_lab_micromotors', 'lab-micromotors', 'میکروموتور ماراتن و هندپیس لابراتواری'],
      ['cat_porcelain_wax', 'porcelain-wax', 'پودر پرسلن، موم و آکریل دندانسازی'],
      ['cat_gypsum_investments', 'gypsum-investments', 'گچ قالب‌سازی استون و اینوستمنت'],
      ['cat_lab_furnaces', 'lab-furnaces', 'کوره پرسلن، وکیوم میکسر و ویبراتور'],
    ],
  },
  {
    id: 'cat_student',
    slug: 'student-educational',
    nameFa: 'ملزومات دانشجویی و آموزشی',
    nameEn: 'Student Kits',
    desc: 'ست‌های پری‌کلینیک، فانتوم، تیپودونت و پک‌های دانشجویی',
    subs: [
      ['cat_typodont', 'typodont-models', 'فک آموزشی تیپودونت و دندان فانتوم'],
      ['cat_student_kits', 'student-kits', 'ست ترمیمی و اندو دانشجویی'],
      ['cat_carving_tools', 'carving-wax-tools', 'اسپاتول موم، گچ و ابزار کنده کاری'],
      ['cat_student_handpieces', 'student-handpieces', 'پک توربین و آنگل اقتصادی دانشجویی'],
    ],
  },
];

// Additional L2 subcategories under the 6 core L1 categories from seed.ts
const CORE_EXTRA_SUBS: { parentId: string; parentSlug: string; subs: [string, string, string][] }[] = [
  {
    parentId: 'cat_endodontics',
    parentSlug: 'endodontics',
    subs: [
      ['cat_gutta_paper', 'gutta-paper-points', 'کن گوتاپرکا و پیپر پوینت'],
      ['cat_sealers_mta', 'sealers-mta', 'سیلر کانال ریشه، MTA و بایوسرامیک'],
      ['cat_irrigants', 'endo-irrigants', 'هیپوکلریت، کلرهگزیدین و EDTA'],
      ['cat_endo_devices', 'endo-motors-apex', 'اندوموتور، اپکس لوکیتور و آبچوریشن'],
      ['cat_rubber_dam', 'rubber-dam-kits', 'رابردم، کلمپ و پانچ اندودانتیکس'],
    ],
  },
  {
    parentId: 'cat_restorative',
    parentSlug: 'restorative',
    subs: [
      ['cat_bonding', 'bonding-adhesives', 'باندینگ یونیورسال و ادهزیوهای عاجی'],
      ['cat_etchant', 'acid-etch-liners', 'اسید اچ، لاینر و کلسیم هیدروکساید'],
      ['cat_glass_ionomer', 'glass-ionomer', 'گلاس آینومر ترمیمی و بیس'],
      ['cat_matrix_wedges', 'matrices-wedges', 'ماتریکس، رینگ و وج‌های ترمیمی'],
      ['cat_polishing', 'finishing-polishing', 'کیت پالیش و دیسک پرداخت کامپوزیت'],
      ['cat_bleaching', 'bleaching-kits', 'کیت بلیچینگ آفیس و هوم'],
    ],
  },
  {
    parentId: 'cat_consumables',
    parentSlug: 'consumables',
    subs: [
      ['cat_gloves_masks', 'gloves-masks', 'دستکش نیتریل، لاتکس و ماسک جراحی'],
      ['cat_anesthesia_needles', 'anesthesia-needles', 'سرسوزن، کارپول و ژل بی‌حسی'],
      ['cat_barriers', 'unit-barriers-drapes', 'روکش یونیت، پیشبند و شان استریل'],
      ['cat_cotton_gauze', 'cotton-gauze-saliva', 'رول پنبه، گاز استریل و سرساکشن'],
      ['cat_syringes_tips', 'tips-microbrushes', 'میکروبراش، سرنگ و سری اتومیکس'],
    ],
  },
  {
    parentId: 'cat_burs_handpieces',
    parentSlug: 'burs-handpieces',
    subs: [
      ['cat_turbines', 'dental-turbines', 'توربین پوش‌باتن و اپتیک'],
      ['cat_contra_angles', 'contra-angles-airmotors', 'آنگل، هندپیس مستقیم و ایرموتور'],
      ['cat_diamond_burs', 'diamond-burs', 'فرز الماسی توربین و زیبایی'],
      ['cat_carbide_burs', 'carbide-burs', 'فرز کارباید، جراحی و پرداخت'],
      ['cat_handpiece_oil', 'handpiece-lubricants', 'روغن و اسپری نگهداری توربین'],
    ],
  },
  {
    parentId: 'cat_clinic_equipment',
    parentSlug: 'clinic-equipment',
    subs: [
      ['cat_dental_units', 'dental-units', 'یونیت و صندلی دندانپزشکی'],
      ['cat_autoclaves', 'class-b-autoclaves', 'اتوکلاو کلاس B و وکیوم‌دار'],
      ['cat_curing_lights', 'curing-lights', 'لایت‌کیور LED و پهن‌طیف'],
      ['cat_compressors', 'compressors-suction', 'کمپرسور اویل‌فری و ساکشن مرکزی'],
      ['cat_intraoral_scanners', 'intraoral-scanners', 'اسکنر داخل دهانی دیجیتال'],
    ],
  },
  {
    parentId: 'cat_prosthodontics',
    parentSlug: 'prosthodontics',
    subs: [
      ['cat_alginate_silicone', 'alginate-silicone', 'آلژینات و سیلیکون قالب‌گیری'],
      ['cat_luting_cements', 'luting-cements', 'سمان رزینی، سلف‌ادهزیو و موقت'],
      ['cat_retraction', 'retraction-cords', 'نخ زیرلثه و خمیر رترکشن'],
      ['cat_impression_trays', 'impression-trays', 'تری قالب‌گیری استیل و پلاستیکی'],
      ['cat_temp_crown', 'temp-crown-resin', 'مواد روکش موقت و پست فایبر'],
    ],
  },
];

function buildExpandedCategories(): Category[] {
  const existingIds = new Set(SEED_CATEGORIES.map((c) => c.id));
  const out: Category[] = [...SEED_CATEGORIES];
  let sortL1 = 7;

  for (const extra of EXTRA_L1_DEFS) {
    if (!existingIds.has(extra.id)) {
      out.push({
        id: extra.id,
        parentId: null,
        path: extra.slug,
        depth: 0,
        vertical: 'dental',
        nameFa: extra.nameFa,
        nameEn: extra.nameEn,
        slug: extra.slug,
        descriptionFa: extra.desc,
        seoTextFa: `خرید تخصصی تجهیزات و مواد ${extra.nameFa} با ضمانت اصالت، کد IMED و ارسال سریع سراسر کشور.`,
        isActive: true,
        showInMenu: true,
        showOnHome: true,
        sortOrder: sortL1++,
        attributeIds: ['attr_origin_standard', 'attr_pack_count', 'attr_material'],
        updatedAt: nowIso,
      });
      existingIds.add(extra.id);
    }
    extra.subs.forEach(([subId, subSlug, subNameFa], idx) => {
      if (!existingIds.has(subId)) {
        out.push({
          id: subId,
          parentId: extra.id,
          path: `${extra.slug}/${subSlug}`,
          depth: 1,
          vertical: 'dental',
          nameFa: subNameFa,
          nameEn: subSlug,
          slug: subSlug,
          descriptionFa: `${subNameFa} استاندارد مطب و کلینیک دندانپزشکی`,
          seoTextFa: `فهرست قیمت و خرید ${subNameFa} از برندهای معتبر با تاریخ معتبر و اصالت کالا.`,
          isActive: true,
          showInMenu: true,
          showOnHome: false,
          sortOrder: idx + 1,
          attributeIds: ['attr_origin_standard', 'attr_pack_count', 'attr_material'],
          updatedAt: nowIso,
        });
        existingIds.add(subId);
      }
    });
  }

  for (const group of CORE_EXTRA_SUBS) {
    group.subs.forEach(([subId, subSlug, subNameFa], idx) => {
      if (!existingIds.has(subId)) {
        out.push({
          id: subId,
          parentId: group.parentId,
          path: `${group.parentSlug}/${subSlug}`,
          depth: 1,
          vertical: 'dental',
          nameFa: subNameFa,
          nameEn: subSlug,
          slug: subSlug,
          descriptionFa: `${subNameFa} تخصصی با گارانتی و اصالت IMED`,
          seoTextFa: `خرید اینترنتی ${subNameFa} ویژه مطب‌ها و کلینیک‌های دندانپزشکی با ارسال فوری.`,
          isActive: true,
          showInMenu: true,
          showOnHome: false,
          sortOrder: idx + 2,
          attributeIds: ['attr_origin_standard', 'attr_pack_count', 'attr_shade', 'attr_taper'],
          updatedAt: nowIso,
        });
        existingIds.add(subId);
      }
    });
  }

  // Add L3 leaf subcategories so total categories comfortably exceeds 100+
  const l3Extras: [string, string, string, string][] = [
    ['cat_bulkfill_comp', 'cat_composites', 'bulkfill-composites', 'کامپوزیت بالک‌فیل خلفی'],
    ['cat_flowable_comp', 'cat_composites', 'flowable-composites', 'کامپوزیت فلو و استتیک'],
    ['cat_endo_retreat', 'cat_endo_files', 'retreatment-files', 'فایل درمان مجدد ریشه'],
    ['cat_nitrile_exam', 'cat_gloves_masks', 'nitrile-exam-gloves', 'دستکش معاینه نیتریل'],
    ['cat_surgical_gloves', 'cat_gloves_masks', 'surgical-sterile-gloves', 'دستکش جراحی استریل'],
    ['cat_push_turbines', 'cat_turbines', 'push-button-turbines', 'توربین پوش‌باتن سرامیکی'],
    ['cat_optic_turbines', 'cat_turbines', 'fiber-optic-turbines', 'توربین LED فایبر اپتیک'],
    ['cat_addition_silicone', 'cat_alginate_silicone', 'addition-silicone-vps', 'سیلیکون افزایشی (A-Silicone)'],
    ['cat_condensation_silicone', 'cat_alginate_silicone', 'condensation-silicone', 'سیلیکون تراکمی (C-Silicone)'],
    ['cat_implant_motor_unit', 'cat_physiodispenser', 'optic-physiodispenser', 'فیزیودیسپنسر نوری ایمپلنت'],
  ];
  for (const [id, parentId, slug, nameFa] of l3Extras) {
    if (!existingIds.has(id)) {
      const parent = out.find((c) => c.id === parentId);
      out.push({
        id,
        parentId,
        path: `${parent?.path ?? 'dental'}/${slug}`,
        depth: 2,
        vertical: 'dental',
        nameFa,
        nameEn: slug,
        slug,
        descriptionFa: `${nameFa} تخصصی با ضمانت اصالت`,
        seoTextFa: `مشخصات فنی و خرید ${nameFa} در دنتال‌مارکت.`,
        isActive: true,
        showInMenu: true,
        showOnHome: false,
        sortOrder: 1,
        attributeIds: ['attr_origin_standard', 'attr_shade', 'attr_pack_count'],
        updatedAt: nowIso,
      });
    }
  }

  return out;
}

export const EXPANDED_CATEGORIES: Category[] = buildExpandedCategories();

// 80 Specialized Dental & Medical Brands
const EXTRA_BRAND_TUPLES: [string, string, string, string, string, string, boolean][] = [
  ['brand_kerr', 'کر (Kerr)', 'Kerr Dental', 'kerr', 'US', 'آمریکا', true],
  ['brand_ivoclar', 'ایووکلار ویوادنت', 'Ivoclar Vivadent', 'ivoclar', 'LI', 'لیختن‌اشتاین', true],
  ['brand_gc', 'جی‌سی (GC)', 'GC Corporation', 'gc', 'JP', 'ژاپن', true],
  ['brand_wh', 'دبلیو اند اچ (W&H)', 'W&H Dentalwerk', 'wh', 'AT', 'اتریش', true],
  ['brand_kavo', 'کاوو (KaVo)', 'KaVo Dental', 'kavo', 'DE', 'آلمان', true],
  ['brand_vatech', 'واتک (Vatech)', 'Vatech', 'vatech', 'KR', 'کره جنوبی', true],
  ['brand_mani', 'مانی (Mani)', 'Mani Inc.', 'mani', 'JP', 'ژاپن', true],
  ['brand_vdw', 'وی‌دی‌دبلیو (VDW)', 'VDW GmbH', 'vdw', 'DE', 'آلمان', true],
  ['brand_bisco', 'بیسکو (Bisco)', 'Bisco Dental', 'bisco', 'US', 'آمریکا', true],
  ['brand_zhermack', 'ژرماک (Zhermack)', 'Zhermack', 'zhermack', 'IT', 'ایتالیا', true],
  ['brand_ultradent', 'اولترادنت', 'Ultradent', 'ultradent', 'US', 'آمریکا', true],
  ['brand_metabiomed', 'متابیومد', 'Meta Biomed', 'meta-biomed', 'KR', 'کره جنوبی', true],
  ['brand_shofu', 'شوفو (Shofu)', 'Shofu Dental', 'shofu', 'JP', 'ژاپن', false],
  ['brand_septodont', 'سپتودونت', 'Septodont', 'septodont', 'FR', 'فرانسه', true],
  ['brand_straumann', 'اشترومن', 'Straumann', 'straumann', 'CH', 'سوئیس', true],
  ['brand_osstem', 'اوستم (Osstem)', 'Osstem Implant', 'osstem', 'KR', 'کره جنوبی', true],
  ['brand_dentium', 'دنتیوم (Implantium)', 'Dentium', 'dentium', 'KR', 'کره جنوبی', true],
  ['brand_megagen', 'مگاژن (MegaGen)', 'MegaGen', 'megagen', 'KR', 'کره جنوبی', true],
  ['brand_bienair', 'بین‌ایر (Bien-Air)', 'Bien-Air', 'bien-air', 'CH', 'سوئیس', true],
  ['brand_acteon', 'اکتئون ساتلک', 'Acteon Satelec', 'acteon', 'FR', 'فرانسه', true],
  ['brand_dmg', 'دی‌ام‌جی (DMG)', 'DMG Chemisch', 'dmg', 'DE', 'آلمان', true],
  ['brand_voco', 'ووکو (Voco)', 'VOCO GmbH', 'voco', 'DE', 'آلمان', true],
  ['brand_tokuyama', 'توکویاما', 'Tokuyama Dental', 'tokuyama', 'JP', 'ژاپن', true],
  ['brand_kuraray', 'کورارای نریتاکی', 'Kuraray Noritake', 'kuraray', 'JP', 'ژاپن', true],
  ['brand_kulzer', 'کولزر (Kulzer)', 'Kulzer GmbH', 'kulzer', 'DE', 'آلمان', false],
  ['brand_coltene', 'کلتن (Coltene)', 'Coltene Whaledent', 'coltene', 'CH', 'سوئیس', true],
  ['brand_fgm', 'اف‌جی‌ام (FGM)', 'FGM Dental', 'fgm', 'BR', 'برزیل', false],
  ['brand_hufriedy', 'هوفریدی', 'Hu-Friedy', 'hu-friedy', 'US', 'آمریکا', true],
  ['brand_euronda', 'یوروندا', 'Euronda', 'euronda', 'IT', 'ایتالیا', true],
  ['brand_mocom', 'موکوم (Mocom)', 'Mocom', 'mocom', 'IT', 'ایتالیا', true],
  ['brand_melag', 'ملاگ (Melag)', 'MELAG', 'melag', 'DE', 'آلمان', true],
  ['brand_tuttnauer', 'تاتناور', 'Tuttnauer', 'tuttnauer', 'NL', 'هلند', false],
  ['brand_runyes', 'رانیس (Runyes)', 'Runyes Medical', 'runyes', 'CN', 'چین', true],
  ['brand_planmeca', 'پلنمکا', 'Planmeca', 'planmeca', 'FI', 'فنلاند', true],
  ['brand_carestream', 'کرستریم', 'Carestream Dental', 'carestream', 'US', 'آمریکا', true],
  ['brand_micronx', 'میکروان‌ایکس', 'Micro-NX', 'micro-nx', 'KR', 'کره جنوبی', false],
  ['brand_saeshin', 'سشین (Strong)', 'Saeshin', 'saeshin', 'KR', 'کره جنوبی', true],
  ['brand_marathon', 'ماراتن (SDE)', 'Saeyang Marathon', 'marathon', 'KR', 'کره جنوبی', true],
  ['brand_renfert', 'رنفرت', 'Renfert GmbH', 'renfert', 'DE', 'آلمان', true],
  ['brand_bego', 'بگو (Bego)', 'BEGO', 'bego', 'DE', 'آلمان', true],
  ['brand_vita', 'ویتا (VITA)', 'VITA Zahnfabrik', 'vita', 'DE', 'آلمان', true],
  ['brand_ormco', 'اورمکو (Ormco)', 'Ormco', 'ormco', 'US', 'آمریکا', true],
  ['brand_americanortho', 'امریکن ارتودانتیکس', 'American Orthodontics', 'american-ortho', 'US', 'آمریکا', true],
  ['brand_dentaurum', 'دنتاروم', 'Dentaurum', 'dentaurum', 'DE', 'آلمان', false],
  ['brand_morita', 'جیموریتا (Morita)', 'J. Morita', 'morita', 'JP', 'ژاپن', true],
  ['brand_fona', 'فونا (Fona)', 'Fona Dental', 'fona', 'SK', 'اسلواکی', false],
  ['brand_ems', 'ای‌ام‌اس (EMS)', 'EMS Swiss', 'ems', 'CH', 'سوئیس', true],
  ['brand_durr', 'دور دنتال', 'Dürr Dental', 'durr-dental', 'DE', 'آلمان', true],
  ['brand_cattani', 'کاتانی', 'Cattani', 'cattani', 'IT', 'ایتالیا', true],
  ['brand_mectron', 'مکترون', 'Mectron', 'mectron', 'IT', 'ایتالیا', true],
  ['brand_geistlich', 'گایستلیش', 'Geistlich Pharma', 'geistlich', 'CH', 'سوئیس', true],
  ['brand_botiss', 'بوتیس', 'Botiss Biomaterials', 'botiss', 'DE', 'آلمان', false],
  ['brand_ethicon', 'اتیکون', 'Ethicon', 'ethicon', 'US', 'آمریکا', false],
  ['brand_komet', 'کومت (Komet)', 'Komet Dental', 'komet', 'DE', 'آلمان', true],
  ['brand_diadent', 'دیادنت', 'DiaDent', 'diadent', 'KR', 'کره جنوبی', true],
  ['brand_angelus', 'آنجلوس', 'Angelus', 'angelus', 'BR', 'برزیل', true],
  ['brand_sdi', 'اس‌دی‌آی (SDI)', 'SDI Limited', 'sdi', 'AU', 'استرالیا', false],
  ['brand_coxo', 'کوکسو (COXO)', 'COXO Medical', 'coxo', 'CN', 'چین', true],
  ['brand_eighteeth', 'ایدتیت (Eighteeth)', 'Eighteeth', 'eighteeth', 'CN', 'چین', true],
  ['brand_dte', 'دی‌تی‌ای (DTE)', 'DTE Woodpecker', 'dte', 'CN', 'چین', true],
  ['brand_apple', 'اپل‌دنتال', 'Apple Dental', 'apple-dental', 'CN', 'چین', false],
  ['brand_siger', 'سیگر (Siger)', 'Siger Dental', 'siger', 'CN', 'چین', true],
  ['brand_fedesa', 'فدسا', 'Fedesa', 'fedesa', 'ES', 'اسپانیا', true],
  ['brand_anthos', 'آنتوس (Anthos)', 'Anthos', 'anthos', 'IT', 'ایتالیا', true],
  ['brand_sternweber', 'اشترن وبر', 'Stern Weber', 'stern-weber', 'IT', 'ایتالیا', true],
  ['brand_supa', 'سوپا (SUPA)', 'SUPA Medical', 'supa', 'IR', 'ایران', true],
  ['brand_pishro', 'پیشرو طب پارس', 'Pishro Teb', 'pishro-teb', 'IR', 'ایران', true],
  ['brand_nakhjavan', 'پارس نخ', 'Pars Suture', 'pars-suture', 'IR', 'ایران', true],
  ['brand_kimia', 'کیمیا شیمی', 'Kimia Dental', 'kimia-dental', 'IR', 'ایران', false],
  ['brand_marlik', 'مارلیک مدیکال', 'Marlik Medical', 'marlik', 'IR', 'ایران', true],
  ['brand_nikdarman', 'نیک‌درمان', 'Nik Darman', 'nik-darman', 'IR', 'ایران', true],
  ['brand_behradan', 'بهرادان تجهیز', 'Behradan', 'behradan', 'IR', 'ایران', false],
  ['brand_parsunit', 'پارس یونیت', 'Pars Unit', 'pars-unit', 'IR', 'ایران', true],
  ['brand_tebiran', 'طب ایران', 'Teb Iran', 'teb-iran', 'IR', 'ایران', false],
  ['brand_azma', 'آزما دنتال', 'Azma Dental', 'azma-dental', 'IR', 'ایران', false],
].map((row) => row) as [string, string, string, string, string, string, boolean][];

export const EXPANDED_BRANDS: Brand[] = [
  ...SEED_BRANDS,
  ...EXTRA_BRAND_TUPLES.map(([id, nameFa, nameEn, slug, countryCode, countryFa, isAuthorizedDealer]) => ({
    id,
    nameFa,
    nameEn,
    slug,
    countryCode,
    countryFa,
    descriptionFa: `تولیدکننده تخصصی تجهیزات و مواد دندانپزشکی ${nameFa} (${countryFa}) با استانداردهای بین‌المللی CE و ISO 13485.`,
    isAuthorizedDealer,
    warrantyProvider: isAuthorizedDealer ? 'نمایندگی رسمی دنتال‌مارکت' : undefined,
    isActive: true,
    updatedAt: nowIso,
  })),
];

// Strip costPrice cleanly from public Product payloads & store cost map separately
export function stripCostPriceFromProduct(product: Product): Product {
  return {
    ...product,
    variants: product.variants.map(({ costPrice: _omitted, ...rest }) => rest),
  };
}

export function extractProductCostRecord(product: Product): ProductCostRecord {
  const variantCosts: Record<string, number> = {};
  product.variants.forEach((v) => {
    if (typeof v.costPrice === 'number' && v.costPrice > 0) {
      variantCosts[v.id] = v.costPrice;
    } else if (v.basePrice && v.basePrice > 0) {
      variantCosts[v.id] = Math.round(v.basePrice * 0.78);
    }
  });
  return { productId: product.id, variantCosts, updatedAt: nowIso };
}

const PRODUCT_ARCHETYPES = [
  { prefix: 'فایل روتاری اندودانتیکس', cat: 'cat_endo_files', parentCat: 'cat_endodontics', kind: 'consumable' as const, img: IMG_ROTARY, base: 1850000, optType: 'size' as const, optLabel: 'طول ۲۵ میلی‌متر - بسته ۶ عددی' },
  { prefix: 'کن گوتاپرکا استریل با کد رنگ ISO', cat: 'cat_gutta_paper', parentCat: 'cat_endodontics', kind: 'consumable' as const, img: IMG_ROTARY, base: 420000, optType: 'pack' as const, optLabel: 'بسته ۶۰ عددی تیپر ۴٪' },
  { prefix: 'کامپوزیت نانوهیبرید ترمیمی قدامی و خلفی', cat: 'cat_composites', parentCat: 'cat_restorative', kind: 'consumable' as const, img: IMG_COMPOSITE, base: 2450000, optType: 'shade' as const, optLabel: 'شید A2 سرنگ ۴ گرمی' },
  { prefix: 'باندینگ یونیورسال تک‌مرحله‌ای نسل هشتم', cat: 'cat_bonding', parentCat: 'cat_restorative', kind: 'consumable' as const, img: IMG_COMPOSITE, base: 2900000, optType: 'unit' as const, optLabel: 'بطری ۵ میلی‌لیتری' },
  { prefix: 'دستکش معاینه نیتریل بدون پودر کلینیکال', cat: 'cat_gloves_masks', parentCat: 'cat_consumables', kind: 'consumable' as const, img: IMG_GLOVES, base: 295000, optType: 'size' as const, optLabel: 'سایز M بسته ۱۰۰ عددی' },
  { prefix: 'سرسوزن تزریق دندانپزشکی سیلیکونی استریل', cat: 'cat_anesthesia_needles', parentCat: 'cat_consumables', kind: 'consumable' as const, img: IMG_GLOVES, base: 480000, optType: 'size' as const, optLabel: 'گیج 30G کوتاه - بسته ۱۰۰ تایی' },
  { prefix: 'توربین پوش‌باتن سرامیکی فایبر اپتیک', cat: 'cat_turbines', parentCat: 'cat_burs_handpieces', kind: 'capital_equipment' as const, img: IMG_EQUIPMENT, base: 16500000, optType: 'model' as const, optLabel: 'اتصال ۴ سوراخ میدوست' },
  { prefix: 'آنگل ایمپلنت کاهنده ۲۰ به ۱ پوش‌باتن', cat: 'cat_contra_angles', parentCat: 'cat_burs_handpieces', kind: 'capital_equipment' as const, img: IMG_EQUIPMENT, base: 24500000, optType: 'model' as const, optLabel: 'نسخه جراحی E-Type' },
  { prefix: 'فرز الماسی توربین کلینیکال بسته ۵ عددی', cat: 'cat_diamond_burs', parentCat: 'cat_burs_handpieces', kind: 'consumable' as const, img: IMG_ROTARY, base: 340000, optType: 'pack' as const, optLabel: 'کد آبی متوسط' },
  { prefix: 'لایت‌کیور بی‌سیم با باتری لیتیومی پهن‌طیف', cat: 'cat_curing_lights', parentCat: 'cat_clinic_equipment', kind: 'capital_equipment' as const, img: IMG_EQUIPMENT, base: 11800000, optType: 'model' as const, optLabel: 'شدت ۲۰۰۰ mW/cm²' },
  { prefix: 'سیلیکون قالب‌گیری افزایشی پوتی و واش', cat: 'cat_alginate_silicone', parentCat: 'cat_prosthodontics', kind: 'consumable' as const, img: IMG_COMPOSITE, base: 3850000, optType: 'pack' as const, optLabel: 'ست پوتی ۲×۴۵۰ گرمی' },
  { prefix: 'سمان رزینی دوآل‌کیور سلف‌ادهزیو پروتز', cat: 'cat_luting_cements', parentCat: 'cat_prosthodontics', kind: 'consumable' as const, img: IMG_COMPOSITE, base: 4200000, optType: 'shade' as const, optLabel: 'سرنگ اتومیکس ترنسلوسنت' },
  { prefix: 'رول اتوکلاو لمینت‌شده با نشانگر بخار و اتیلن اکساید', cat: 'cat_autoclave_pouches', parentCat: 'cat_sterilization', kind: 'consumable' as const, img: IMG_GLOVES, base: 650000, optType: 'size' as const, optLabel: 'عرض ۱۰ سانتی‌متر طول ۲۰۰ متر' },
  { prefix: 'براکت ارتودنسی فلزی MBT اسلات ۰.۰۲۲', cat: 'cat_brackets', parentCat: 'cat_orthodontics', kind: 'consumable' as const, img: IMG_ROTARY, base: 1950000, optType: 'pack' as const, optLabel: 'ست کامل فک بالا و پایین' },
  { prefix: 'پودر استخوان آلوگرافت مینرالیزه جراحی ایمپلنت', cat: 'cat_bone_graft', parentCat: 'cat_implantology', kind: 'consumable' as const, img: IMG_COMPOSITE, base: 5400000, optType: 'pack' as const, optLabel: 'ویال ۰.۵ سی‌سی' },
  { prefix: 'فورسپس جراحی و کشیدن دندان استیل ضدزنگ', cat: 'cat_forceps', parentCat: 'cat_surgery', kind: 'consumable' as const, img: IMG_ROTARY, base: 2300000, optType: 'model' as const, optLabel: 'شماره ۱۵۰ قدامی بالا' },
  { prefix: 'سرقلم جرم‌گیر اولتراسونیک سازگار با ساطلک و EMS', cat: 'cat_scaler_tips', parentCat: 'cat_periodontics', kind: 'consumable' as const, img: IMG_ROTARY, base: 690000, optType: 'model' as const, optLabel: 'سری G1 سوپراجینجیوال' },
  { prefix: 'روکش پیش‌ساخته استیل اطفال (SSC)', cat: 'cat_ssc_crowns', parentCat: 'cat_pediatrics', kind: 'consumable' as const, img: IMG_ROTARY, base: 580000, optType: 'size' as const, optLabel: 'بسته ۵ عددی مولر اول' },
  { prefix: 'بلانک زیرکونیا مولتی‌لایر CAD/CAM قطر ۹۸ میلی‌متر', cat: 'cat_zirconia_cadcam', parentCat: 'cat_lab', kind: 'consumable' as const, img: IMG_EQUIPMENT, base: 6800000, optType: 'shade' as const, optLabel: 'شید A2 ضخامت ۱۴ میلی‌متر' },
  { prefix: 'سنسور رادیوگرافی دیجیتال RVG با کابل تقویت‌شده', cat: 'cat_rvg_sensors', parentCat: 'cat_imaging', kind: 'capital_equipment' as const, img: IMG_EQUIPMENT, base: 89000000, optType: 'size' as const, optLabel: 'سایز ۱.۵ با نرم‌افزار فارسی' },
];

export function generateCatalogProducts(totalTarget = 1024): {
  publicProducts: Product[];
  costRecords: ProductCostRecord[];
} {
  const costRecords: ProductCostRecord[] = SEED_PRODUCTS.map(extractProductCostRecord);
  const publicProducts: Product[] = SEED_PRODUCTS.map(stripCostPriceFromProduct);

  const extraNeeded = Math.max(0, totalTarget - publicProducts.length);
  for (let i = 0; i < extraNeeded; i++) {
    const arch = PRODUCT_ARCHETYPES[i % PRODUCT_ARCHETYPES.length];
    const brand = EXPANDED_BRANDS[(i * 7 + 3) % EXPANDED_BRANDS.length];
    const seriesNum = Math.floor(i / PRODUCT_ARCHETYPES.length) + 1;
    const code = 2000 + i;
    const id = `prod_cat_${code}`;
    const priceMultiplier = 1 + ((i % 7) * 0.08);
    const basePrice = Math.round((arch.base * priceMultiplier) / 10000) * 10000;
    const stock = i % 29 === 0 ? 0 : 12 + (i % 45);
    const isOut = stock === 0;
    const isCall = arch.kind === 'capital_equipment' && i % 15 === 0;
    const expiresDays = 60 + ((i * 19) % 540);
    const slug = `dental-item-${code}-${brand.slug}`;

    const prod: Product = {
      id,
      vertical: 'dental',
      sku: `DM-${code}`,
      imedCode: `IMED-${410000 + i}`,
      titleFa: `${arch.prefix} ${brand.nameFa} مدل سری ${seriesNum}`,
      titleEn: `${brand.nameEn} Dental Supply Series ${code}`,
      slug,
      brandId: brand.id,
      originCountryCode: brand.countryCode,
      originCountryFa: brand.countryFa,
      primaryCategoryId: arch.cat,
      categoryIds: [arch.cat, arch.parentCat],
      kind: arch.kind,
      status: isOut ? 'out_of_stock' : 'active',
      pricingMode: isCall ? 'call_for_price' : 'fixed',
      shortDescriptionFa: `${arch.prefix} تولید برند ${brand.nameFa} (${brand.countryFa}) با استاندارد بین‌المللی و کد ردیابی وزارت بهداشت.`,
      descriptionFa: `محصول تخصصی ${arch.prefix} از برند ${brand.nameFa} ویژه مطب‌ها، کلینیک‌ها و مراکز درمانی دندانپزشکی. دارای تاییدیه CE/ISO، کنترل بچ تولید و گارانتی اصالت کالا.`,
      imageUrl: arch.img,
      galleryUrls: [arch.img],
      warrantyMonths: arch.kind === 'capital_equipment' ? 12 : undefined,
      warrantyProvider: arch.kind === 'capital_equipment' ? 'خدمات پس از فروش دنتال‌مارکت' : undefined,
      installationAvailable: arch.kind === 'capital_equipment',
      trainingAvailable: arch.kind === 'capital_equipment',
      minOrderQty: 1,
      ratingAvg: Number((4.4 + (i % 6) * 0.1).toFixed(1)),
      ratingCount: 3 + (i % 18),
      viewCount: 80 + (i % 600),
      soldCount: 15 + (i % 240),
      tags: [brand.slug, arch.kind, arch.parentCat],
      attributes: {
        origin_standard: ['CE', 'ISO13485'],
        pack_count: arch.kind === 'consumable' ? 10 : 1,
        material: arch.kind === 'consumable' ? 'nanohybrid' : 'steel',
      },
      variants: [
        {
          id: `var_${code}_1`,
          sku: `DM-${code}-V1`,
          labelFa: arch.optLabel,
          optionType: arch.optType,
          optionValueFa: arch.optLabel,
          basePrice: isCall ? null : basePrice,
          groupPrices: isCall
            ? undefined
            : {
                dentist: Math.round(basePrice * 0.94),
                clinic: Math.round(basePrice * 0.9),
                wholesale: Math.round(basePrice * 0.85),
              },
          tierPrices: isCall
            ? undefined
            : [
                { minQty: 5, unitPrice: Math.round(basePrice * 0.93) },
                { minQty: 10, unitPrice: Math.round(basePrice * 0.88) },
              ],
          stockOnHand: stock,
          reserved: 0,
          lowStockThreshold: 5,
          weightG: arch.kind === 'capital_equipment' ? 1200 : 120,
          isDefault: true,
          isActive: true,
          batches:
            arch.kind === 'consumable'
              ? [
                  {
                    id: `bat_${code}`,
                    batchNo: `LOT-${2026 + (i % 2)}-${code}`,
                    warehouseCode: 'TEH-CENTRAL',
                    expiresAt: plusDaysIso(expiresDays),
                    qtyOnHand: stock,
                    specialPrice: expiresDays <= 90 && !isCall ? Math.round(basePrice * 0.84) : null,
                  },
                ]
              : undefined,
        },
      ],
      files: [
        { id: `f_${code}_ce`, type: 'certificate_ce', titleFa: 'گواهینامه استاندارد CE و کاتالوگ فنی', fileSizeLabel: '۱.۱ مگابایت', code: `CE-${code}` },
      ],
      priceHistory: [
        { variantId: `var_${code}_1`, variantLabel: arch.optLabel, oldPrice: basePrice, newPrice: basePrice, changedAt: minusDaysIso(45), source: 'admin' },
      ],
      publishedAt: minusDaysIso(45),
      updatedAt: nowIso,
    };

    publicProducts.push(prod);
    costRecords.push({
      productId: id,
      variantCosts: { [`var_${code}_1`]: Math.round(basePrice * 0.76) },
      updatedAt: nowIso,
    });
  }

  return { publicProducts, costRecords };
}

const GENERATED_1024 = generateCatalogProducts(1024);
export const EXPANDED_PRODUCTS: Product[] = GENERATED_1024.publicProducts;
export const SEED_PRODUCT_COSTS: ProductCostRecord[] = GENERATED_1024.costRecords;

export const SEED_WAREHOUSES: Warehouse[] = [
  { id: 'wh_teh', code: 'TEH-CENTRAL', nameFa: 'انبار مرکزی تهران (آزادی)', city: 'تهران', address: 'تهران، بزرگراه فتح، مرکز لجستیک تجهیزات پزشکی', isActive: true, isDefault: true },
  { id: 'wh_isf', code: 'ISF-HUB', nameFa: 'انبار منطقه‌ای اصفهان', city: 'اصفهان', address: 'اصفهان، شهرک صنعتی جی، انبار ۲', isActive: true },
  { id: 'wh_mhd', code: 'MHD-EAST', nameFa: 'انبار شرق کشور (مشهد)', city: 'مشهد', address: 'مشهد، بزرگراه پیامبر اعظم، قطب پخش سلامت', isActive: true },
];

export const SEED_SUPPLIERS: Supplier[] = [
  { id: 'sup_parsmed', nameFa: 'پارس‌مد تجهیز واردات رسمی', contactName: 'مهندس شریعتی', phone: '۰۲۱-۶۶۹۰۱۲۰۰', brandIds: ['brand_3m', 'brand_dentsply', 'brand_nsk'], leadTimeDays: 5, isActive: true },
  { id: 'sup_aria_endo', nameFa: 'آریا اندو کالا', contactName: 'دکتر محمدی', phone: '۰۲۱-۸۸۷۷۳۳۱۱', brandIds: ['brand_woodpecker', 'brand_mani', 'brand_vdw'], leadTimeDays: 3, isActive: true },
  { id: 'sup_teb_gostar', nameFa: 'طب‌گستر مصرفی جنوب', contactName: 'خانم رضوانی', phone: '۰۲۱-۴۴۲۲۹۹۱۰', brandIds: ['brand_mediglide', 'brand_supa'], leadTimeDays: 2, isActive: true },
];

export const SEED_STOCK_MOVEMENTS: StockMovement[] = [
  { id: 'sm_1', productId: 'prod_composite_3m', productTitleFa: 'کامپوزیت نانوهیبرید یونیورسال تری‌ام سری Filtek', variantId: 'var_comp_a2', sku: 'DM-RST-2001-A2', warehouseCode: 'TEH-CENTRAL', delta: 30, type: 'receive', reason: 'ورود محموله وارداتی فاکتور ۴۴۱۲', actorEmail: 'farina.connect@gmail.com', createdAt: minusDaysIso(6) },
  { id: 'sm_2', productId: 'prod_curing_light', productTitleFa: 'لایت‌کیور بی‌سیم وودپیکر مدل LED.F', variantId: 'var_led_f', sku: 'DM-EQP-4001-STD', warehouseCode: 'TEH-CENTRAL', delta: -1, type: 'sale', reason: 'خروج بابت سفارش DM-1405-10041', actorEmail: 'system', createdAt: minusDaysIso(2) },
];

export const SEED_CONTRACT_PRICES: ContractPrice[] = [
  { id: 'cnt_1', userId: 'demo_clinic_1', customerName: 'کلینیک تخصصی لبخند', productId: 'prod_composite_3m', productTitleFa: 'کامپوزیت نانوهیبرید یونیورسال تری‌ام سری Filtek', variantId: 'var_comp_a2', unitPrice: 2450000, validUntil: plusDaysIso(90), isActive: true },
];

export const SEED_INVOICES: InvoiceRecord[] = [
  { id: 'inv_1', invoiceNo: 'INV-1405-8801', orderId: 'ord_10041', orderNo: 'DM-1405-10041', userId: 'demo_clinic_1', customerName: 'کلینیک تخصصی لبخند', isOfficial: true, nationalId: '14009911223', economicCode: '411552233441', subtotal: 20500000, discountTotal: 1480000, taxTotal: 1902000, grandTotal: 20922000, status: 'issued', issuedAt: minusDaysIso(2) },
  { id: 'inv_2', invoiceNo: 'INV-1405-8802', orderId: 'ord_10042', orderNo: 'DM-1405-10042', userId: 'demo_dentist_2', customerName: 'دکتر نوید شریفی', isOfficial: false, subtotal: 7600000, discountTotal: 0, taxTotal: 760000, grandTotal: 8540000, status: 'issued', issuedAt: minusDaysIso(5) },
];

export const SEED_PAYMENT_LEDGER: PaymentLedgerEntry[] = [
  { id: 'pay_1', orderId: 'ord_10041', orderNo: 'DM-1405-10041', gateway: 'zarinpal', amount: 20922000, idempotencyKey: 'IDEMP-10041', refId: '991844210', status: 'verified', createdAt: minusDaysIso(2) },
  { id: 'pay_2', orderId: 'ord_10042', orderNo: 'DM-1405-10042', gateway: 'idpay', amount: 8540000, idempotencyKey: 'IDEMP-10042', refId: '774201982', status: 'verified', createdAt: minusDaysIso(6) },
];

export const SEED_RETURNS: ReturnRequest[] = [
  { id: 'ret_1', returnNo: 'RT-1405-101', orderId: 'ord_10042', orderNo: 'DM-1405-10042', userId: 'demo_dentist_2', customerName: 'دکتر نوید شریفی', items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', titleFa: 'فایل روتاری ProTaper Gold', quantity: 1 }], reasonFa: 'تغییر طول مورد نیاز از ۲۵ به ۲۱ میلی‌متر (بسته‌بندی پلمپ)', resolution: 'replacement', status: 'approved', refundAmount: 3250000, adminNote: 'تایید تعویض با سایز ۲۱ میلی‌متر', createdAt: minusDaysIso(1), updatedAt: nowIso },
];

export const SEED_STOCK_NOTIFICATIONS: StockNotification[] = [
  { id: 'sn_1', productId: 'prod_nitrile_gloves', productTitleFa: 'دستکش معاینه نیتریل بدون پودر مدی‌گلاید', mobile: '۰۹۱۲۲۲۰۹۹۱۱', status: 'pending', createdAt: minusDaysIso(2) },
];

export const SEED_NEWSLETTER_SUBSCRIBERS: NewsletterSubscriber[] = [
  { id: 'sub_1', contact: 'dr.rahimi@clinic.ir', type: 'email', status: 'active', createdAt: minusDaysIso(10) },
  { id: 'sub_2', contact: '۰۹۱۲۵۵۴۷۷۸۸', type: 'mobile', status: 'active', createdAt: minusDaysIso(4) },
];

export const SEED_PAGES: SitePage[] = [
  { id: 'pg_about', slug: 'about', titleFa: 'درباره دنتال‌مارکت', bodyFa: 'دنتال‌مارکت به‌عنوان مرکز تخصصی تأمین تجهیزات و مواد مصرفی دندانپزشکی با هدف شفافیت قیمت، ردیابی اصالت کالا (کد IMED)، مدیریت تاریخ انقضای FEFO و ارائه پیش‌فاکتور رسمی برای کلینیک‌ها فعالیت می‌کند.', status: 'published', updatedAt: minusDaysIso(10) },
  { id: 'pg_returns', slug: 'returns', titleFa: 'شرایط بازگشت و تعویض کالا', bodyFa: 'در راستای استانداردهای بهداشتی تجهیزات پزشکی، کلیه ابزارها و مواد مصرفی با پلمپ بازنشده تا ۷ روز کاری قابل تعویض یا مرجوع هستند. اقلام زنجیره سرد پس از تحویل مشمول استرداد نمی‌باشند.', status: 'published', updatedAt: minusDaysIso(10) },
  { id: 'pg_warranty', slug: 'warranty', titleFa: 'گارانتی تجهیزات و خدمات پس از فروش', bodyFa: 'تجهیزات سرمایه‌ای شامل یونیت، اتوکلاو کلاس B، رادیوگرافی و هندپیس‌ها با کارت گارانتی شرکتی ۱۲ تا ۲۴ ماهه، نصب توسط تکنسین مجاز و تامین قطعات یدکی تا ۵ سال ارائه می‌شوند.', status: 'published', updatedAt: minusDaysIso(10) },
  { id: 'pg_privacy', slug: 'privacy', titleFa: 'حریم خصوصی و امنیت اطلاعات مطب‌ها', bodyFa: 'کلیه مدارک نظام پزشکی، اطلاعات کد اقتصادی و نشانی کلینیک‌ها صرفاً برای احراز هویت B2B و صدور فاکتور رسمی استفاده شده و نزد دنتال‌مارکت محرمانه می‌ماند.', status: 'published', updatedAt: minusDaysIso(10) },
  { id: 'pg_contact', slug: 'contact', titleFa: 'تماس با ما و پشتیبانی کلینیک‌ها', bodyFa: 'دفتر مرکزی: تهران، خیابان آزادی، مجتمع تخصصی تجهیزات پزشکی پارس. تلفن: ۰۲۱-۸۸۴۵۱۲۰۰. پشتیبانی فنی و مشاوره خرید تجهیزات همه روزه در ساعات اداری پاسخگوی شماست.', status: 'published', updatedAt: minusDaysIso(10) },
];

export const SEED_BANNERS: BannerItem[] = [
  { id: 'ban_hero', slot: 'hero', titleFa: 'تجهیزات و مواد دندانپزشکی با قیمت شفاف و اصالت IMED', subtitleFa: 'تامین مستقیم کلینیک‌ها با پیش‌فاکتور رسمی، کنترل FEFO و ارسال سراسری', ctaTextFa: 'مشاهده کاتالوگ محصولات', linkPath: '/category/consumables', imageUrl: IMG_HERO_CLINIC, isActive: true, sortOrder: 1 },
  { id: 'ban_strip', slot: 'top_strip', titleFa: 'جشنواره تجهیزات ترمیمی و مصرفی مطب', subtitleFa: 'ارسال رایگان سفارش‌های بالای ۱۵ میلیون تومان در تهران', ctaTextFa: 'مشاهده پیشنهادها', linkPath: '/category/restorative', imageUrl: IMG_COMPOSITE, isActive: true, sortOrder: 2 },
];

export const SEED_FAQS: FaqItem[] = [
  { id: 'faq_1', categoryFa: 'پیش‌فاکتور و B2B', questionFa: 'چگونه پیش‌فاکتور رسمی با مهر و شناسه ملی دریافت کنیم؟', answerFa: 'در صفحه محصول یا سبد خرید دکمه «صدور پیش‌فاکتور» را بزنید و در پروفایل کلینیک اطلاعات حقوقی را تکمیل کنید.', sortOrder: 1, isActive: true },
  { id: 'faq_2', categoryFa: 'گارانتی و نصب', questionFa: 'آیا نصب اتوکلاو و تجهیزات در شهرستان هم انجام می‌شود؟', answerFa: 'بله، شبکه نمایندگی‌های دنتال‌مارکت در مراکز استان‌ها خدمات نصب، کالیبراسیون و آموزش کاربری را انجام می‌دهند.', sortOrder: 2, isActive: true },
];

export const SEED_NOT_FOUND_LOGS: NotFoundLog[] = [
  { id: 'nf_1', path: '/product/legacy-composite-kit-2023', hitCount: 14, lastSeenAt: minusDaysIso(1) },
];
