import { daysUntil, formatMoney } from './jalali';
import {
  Campaign,
  CurrencyMode,
  CustomerGroupCode,
  Product,
  ProductVariant,
  SiteSettings,
} from '../types/domain';

export interface ResolvedVariantPrice {
  state: 'fixed' | 'call_for_price' | 'out_of_stock' | 'coming_soon';
  unitPrice: number | null;
  originalPrice: number | null;
  discountPercent: number;
  priceSource: 'base' | 'group' | 'tier' | 'campaign';
  campaignEndsAt: string | null;
  campaignBadgeFa: string | null;
  availableStock: number;
  nearExpiry: boolean;
  nearestExpiryDate: string | null;
  nearestBatchNo: string | null;
}

export function getVariantAvailableStock(variant: ProductVariant): number {
  return Math.max(0, variant.stockOnHand - variant.reserved);
}

export function getNearestFefoBatch(variant: ProductVariant, nearExpiryThresholdDays = 90) {
  if (!variant.batches || variant.batches.length === 0) {
    return { nearExpiry: false, expiresAt: null, batchNo: null, specialPrice: null };
  }
  const activeBatches = variant.batches
    .filter((b) => b.qtyOnHand > 0)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  if (activeBatches.length === 0) {
    return { nearExpiry: false, expiresAt: null, batchNo: null, specialPrice: null };
  }

  const first = activeBatches[0];
  const remaining = daysUntil(first.expiresAt);
  const nearExpiry = remaining !== null && remaining <= nearExpiryThresholdDays && remaining >= 0;
  return {
    nearExpiry,
    expiresAt: first.expiresAt,
    batchNo: first.batchNo,
    specialPrice: first.specialPrice ?? null,
  };
}

export function getActiveCampaignForProduct(
  productId: string,
  campaigns: Campaign[]
): Campaign | null {
  const now = Date.now();
  const active = campaigns.filter((c) => {
    if (c.status !== 'active') return false;
    const start = new Date(c.startsAt).getTime();
    const end = new Date(c.endsAt).getTime();
    return start <= now && end > now && c.productIds.includes(productId);
  });
  if (active.length === 0) return null;
  return active.sort((a, b) => b.discountPercent - a.discountPercent)[0];
}

export function resolveVariantPrice(
  product: Product,
  variant: ProductVariant,
  options: {
    customerGroup?: CustomerGroupCode;
    quantity?: number;
    campaigns?: Campaign[];
    settings?: SiteSettings;
  } = {}
): ResolvedVariantPrice {
  const {
    customerGroup = 'retail',
    quantity = 1,
    campaigns = [],
    settings,
  } = options;
  const availableStock = getVariantAvailableStock(variant);
  const nearThreshold = settings?.nearExpiryThresholdDays ?? 90;
  const fefo = getNearestFefoBatch(variant, nearThreshold);

  if (product.status === 'coming_soon') {
    return {
      state: 'coming_soon',
      unitPrice: null,
      originalPrice: null,
      discountPercent: 0,
      priceSource: 'base',
      campaignEndsAt: null,
      campaignBadgeFa: null,
      availableStock: 0,
      nearExpiry: false,
      nearestExpiryDate: null,
      nearestBatchNo: null,
    };
  }

  if (availableStock <= 0 || product.status === 'out_of_stock') {
    return {
      state: 'out_of_stock',
      unitPrice: null,
      originalPrice: null,
      discountPercent: 0,
      priceSource: 'base',
      campaignEndsAt: null,
      campaignBadgeFa: null,
      availableStock: 0,
      nearExpiry: fefo.nearExpiry,
      nearestExpiryDate: fefo.expiresAt,
      nearestBatchNo: fefo.batchNo,
    };
  }

  if (product.pricingMode === 'call_for_price' || variant.basePrice === null || variant.basePrice <= 0) {
    return {
      state: 'call_for_price',
      unitPrice: null,
      originalPrice: null,
      discountPercent: 0,
      priceSource: 'base',
      campaignEndsAt: null,
      campaignBadgeFa: null,
      availableStock,
      nearExpiry: fefo.nearExpiry,
      nearestExpiryDate: fefo.expiresAt,
      nearestBatchNo: fefo.batchNo,
    };
  }

  let effectivePrice = variant.basePrice;
  let priceSource: 'base' | 'group' | 'tier' | 'campaign' = 'base';

  // 1. Customer group price
  const groupOverride = variant.groupPrices?.[customerGroup];
  if (groupOverride && groupOverride > 0 && groupOverride < effectivePrice) {
    effectivePrice = groupOverride;
    priceSource = 'group';
  }

  // 2. Tiered quantity pricing
  if (variant.tierPrices && variant.tierPrices.length > 0) {
    const applicableTiers = variant.tierPrices
      .filter((t) => quantity >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty);
    if (applicableTiers.length > 0 && applicableTiers[0].unitPrice < effectivePrice) {
      effectivePrice = applicableTiers[0].unitPrice;
      priceSource = 'tier';
    }
  }

  // 3. Real time-bound campaign discount (strictly DB-driven, never fabricated)
  const campaign = getActiveCampaignForProduct(product.id, campaigns);
  let originalPrice: number | null = null;
  let discountPercent = 0;
  let campaignEndsAt: string | null = null;
  let campaignBadgeFa: string | null = null;

  if (campaign && campaign.discountPercent > 0) {
    const discounted = Math.round(variant.basePrice * (1 - campaign.discountPercent / 100));
    if (discounted > 0 && discounted < effectivePrice) {
      originalPrice = variant.basePrice;
      effectivePrice = discounted;
      discountPercent = campaign.discountPercent;
      priceSource = 'campaign';
      campaignEndsAt = campaign.showTimer ? campaign.endsAt : null;
      campaignBadgeFa = campaign.badgeTextFa || null;
    }
  } else if (fefo.nearExpiry && fefo.specialPrice && fefo.specialPrice > 0 && fefo.specialPrice < effectivePrice) {
    originalPrice = variant.basePrice;
    effectivePrice = fefo.specialPrice;
    discountPercent = Math.round(((variant.basePrice - fefo.specialPrice) / variant.basePrice) * 100);
    priceSource = 'campaign';
  }

  return {
    state: 'fixed',
    unitPrice: effectivePrice,
    originalPrice,
    discountPercent,
    priceSource,
    campaignEndsAt,
    campaignBadgeFa,
    availableStock,
    nearExpiry: fefo.nearExpiry,
    nearestExpiryDate: fefo.expiresAt,
    nearestBatchNo: fefo.batchNo,
  };
}

export interface ProductPriceSummary {
  state: 'fixed' | 'range' | 'call_for_price' | 'out_of_stock' | 'coming_soon';
  label: string;
  minPrice: number | null;
  maxPrice: number | null;
  originalMinPrice: number | null;
  discountPercent: number;
  campaignEndsAt: string | null;
  inStock: boolean;
  nearExpiry: boolean;
}

export function getProductPriceSummary(
  product: Product,
  options: {
    customerGroup?: CustomerGroupCode;
    campaigns?: Campaign[];
    currency?: CurrencyMode;
    settings?: SiteSettings;
  } = {}
): ProductPriceSummary {
  const { customerGroup = 'retail', campaigns = [], currency = 'IRT', settings } = options;

  if (product.status === 'coming_soon') {
    return {
      state: 'coming_soon',
      label: 'به‌زودی',
      minPrice: null,
      maxPrice: null,
      originalMinPrice: null,
      discountPercent: 0,
      campaignEndsAt: null,
      inStock: false,
      nearExpiry: false,
    };
  }

  const resolvedList = product.variants
    .filter((v) => v.isActive)
    .map((v) => resolveVariantPrice(product, v, { customerGroup, campaigns, settings }));

  const inStockList = resolvedList.filter((r) => r.state !== 'out_of_stock');
  if (inStockList.length === 0) {
    return {
      state: 'out_of_stock',
      label: 'ناموجود',
      minPrice: null,
      maxPrice: null,
      originalMinPrice: null,
      discountPercent: 0,
      campaignEndsAt: null,
      inStock: false,
      nearExpiry: resolvedList.some((r) => r.nearExpiry),
    };
  }

  const priced = inStockList.filter((r) => r.state === 'fixed' && r.unitPrice !== null && r.unitPrice > 0);
  if (priced.length === 0 || product.pricingMode === 'call_for_price') {
    return {
      state: 'call_for_price',
      label: 'تماس برای قیمت',
      minPrice: null,
      maxPrice: null,
      originalMinPrice: null,
      discountPercent: 0,
      campaignEndsAt: null,
      inStock: true,
      nearExpiry: inStockList.some((r) => r.nearExpiry),
    };
  }

  const prices = priced.map((r) => r.unitPrice as number);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const bestCampaign = priced.find((r) => r.discountPercent > 0);
  const nearExpiry = inStockList.some((r) => r.nearExpiry);

  if (minPrice === maxPrice) {
    return {
      state: 'fixed',
      label: formatMoney(minPrice, currency),
      minPrice,
      maxPrice,
      originalMinPrice: bestCampaign?.originalPrice ?? null,
      discountPercent: bestCampaign?.discountPercent ?? 0,
      campaignEndsAt: bestCampaign?.campaignEndsAt ?? null,
      inStock: true,
      nearExpiry,
    };
  }

  return {
    state: 'range',
    label: `از ${formatMoney(minPrice, currency)}`,
    minPrice,
    maxPrice,
    originalMinPrice: bestCampaign?.originalPrice ?? null,
    discountPercent: bestCampaign?.discountPercent ?? 0,
    campaignEndsAt: bestCampaign?.campaignEndsAt ?? null,
    inStock: true,
    nearExpiry,
  };
}
