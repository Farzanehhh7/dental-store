import crypto from 'node:crypto';
import type {
  Brand,
  Category,
  CustomerGroupCode,
  PriceHistoryEntry,
  Product,
  ProductVariant,
  RedirectRule,
} from '../../src/types/domain';
import { MAX_IMPORT_ROWS } from '../../src/lib/excel';
import {
  IMPORT_TEMPLATE_REGISTRY,
  exportTemplateDataRows,
  validateTemplateRows,
  type ImportCatalogContext,
  type ImportChangesetEntry,
  type ImportDryRunResult,
  type ImportJobRecord,
  type ImportJobSummaryDto,
  type ImportTemplateKey,
} from '../../src/pages/admin/importExport';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';

const COMMIT_BATCH_SIZE = 50;
const DEFAULT_IMPORT_PRODUCT_IMAGE = '/assets/images/product_composite_kit_1794921818527.jpg';

function normalizeRawRowsInput(rawRows: Array<Record<string, unknown>>): Record<string, string>[] {
  return rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row ?? {})) {
      out[k] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
}

export async function buildImportCatalogContext(
  repos: RepositoryBundle
): Promise<ImportCatalogContext> {
  const [snapshot, warehouses, stockLevels] = await Promise.all([
    repos.catalog.getSnapshot(),
    repos.stock.listWarehouses(),
    repos.stock.listStockLevels(),
  ]);
  return {
    products: snapshot.products,
    categories: snapshot.categories,
    brands: snapshot.brands,
    redirects: snapshot.redirects,
    warehouses,
    stockLevels,
  };
}

export async function validateImportRowsService(
  repos: RepositoryBundle,
  params: {
    templateKey: ImportTemplateKey;
    rawRows: Array<Record<string, unknown>>;
  }
): Promise<ImportDryRunResult> {
  if (params.rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`تعداد ردیف‌ها بیش از سقف مجاز (${MAX_IMPORT_ROWS} ردیف) است.`);
  }
  const context = await buildImportCatalogContext(repos);
  const stringRows = normalizeRawRowsInput(params.rawRows);
  return validateTemplateRows(params.templateKey, stringRows, context, 2);
}

export async function exportTemplateService(
  repos: RepositoryBundle,
  templateKey: ImportTemplateKey
): Promise<{ headers: string[]; rows: Record<string, unknown>[]; label: string }> {
  const context = await buildImportCatalogContext(repos);
  const { headers, rows } = exportTemplateDataRows(templateKey, context);
  return {
    headers,
    rows,
    label: IMPORT_TEMPLATE_REGISTRY[templateKey].label,
  };
}

export interface CommitImportResult {
  job: ImportJobSummaryDto;
  dryRun: ImportDryRunResult;
}

export function toJobSummaryDto(job: ImportJobRecord): ImportJobSummaryDto {
  return {
    id: job.id,
    templateKey: job.templateKey,
    templateLabel: job.templateLabel,
    filename: job.filename,
    actorUid: job.actorUid,
    actorEmail: job.actorEmail,
    counts: job.counts,
    status: job.status,
    createdAt: job.createdAt,
    rolledBackAt: job.rolledBackAt,
    rolledBackBy: job.rolledBackBy,
    changesetSize: job.changeset.length,
  };
}

export async function commitImportService(
  store: ServerStore,
  repos: RepositoryBundle,
  params: {
    templateKey: ImportTemplateKey;
    filename: string;
    rawRows: Array<Record<string, unknown>>;
    actorUid: string;
    actorEmail: string;
  }
): Promise<{ ok: true; data: CommitImportResult } | { ok: false; status: number; message: string; dryRun?: ImportDryRunResult }> {
  if (params.rawRows.length > MAX_IMPORT_ROWS) {
    return { ok: false, status: 400, message: `حداکثر ${MAX_IMPORT_ROWS} ردیف در هر بار ورود داده مجاز است.` };
  }

  return repos.runTransaction(async () => {
    const context = await buildImportCatalogContext(repos);
    const stringRows = normalizeRawRowsInput(params.rawRows);
    const dryRun = validateTemplateRows(params.templateKey, stringRows, context, 2);

    const actionable = dryRun.rows.filter((r) => r.action === 'create' || r.action === 'update');
    if (actionable.length === 0) {
      return {
        ok: false,
        status: 400,
        message: 'هیچ ردیف جدید یا تغییریافته معتبری برای ثبت یافت نشد.',
        dryRun,
      };
    }

    const nowIso = new Date().toISOString();
    const jobId = `IMP-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const changesetMap = new Map<string, ImportChangesetEntry>();

    let workingCategories = structuredClone(context.categories);
    let workingBrands = structuredClone(context.brands);
    let workingProducts = structuredClone(context.products);
    let workingRedirects = structuredClone(context.redirects);

    let touchedCategories = false;
    let touchedBrands = false;
    let touchedProducts = false;
    let touchedRedirects = false;

    const productStockSyncQueue: Array<{
      productId: string;
      variantId: string;
      onHand: number;
    }> = [];

    for (let start = 0; start < actionable.length; start += COMMIT_BATCH_SIZE) {
      const batch = actionable.slice(start, start + COMMIT_BATCH_SIZE);

      for (const row of batch) {
        const n = row.normalized;

        if (params.templateKey === 'brands') {
          const slug = String(n.slug);
          const idx = workingBrands.findIndex((b) => b.slug.toLowerCase() === slug.toLowerCase());
          if (idx >= 0) {
            const existing = workingBrands[idx];
            if (!changesetMap.has(`brand:${existing.id}`)) {
              changesetMap.set(`brand:${existing.id}`, {
                kind: 'brand',
                entityId: existing.id,
                op: 'update',
                before: structuredClone(existing),
              });
            }
            workingBrands[idx] = {
              ...existing,
              nameFa: String(n.name_fa),
              nameEn: String(n.name_en),
              countryCode: String(n.country_code),
              countryFa: String(n.country_fa),
              isAuthorizedDealer: Boolean(n.is_authorized_dealer),
              isActive: Boolean(n.is_active),
              descriptionFa: String(n.description_fa ?? ''),
              updatedAt: nowIso,
            };
          } else {
            const created: Brand = {
              id: `brand_imp_${crypto.randomBytes(4).toString('hex')}`,
              slug,
              nameFa: String(n.name_fa),
              nameEn: String(n.name_en),
              countryCode: String(n.country_code),
              countryFa: String(n.country_fa),
              descriptionFa: String(n.description_fa ?? ''),
              isAuthorizedDealer: Boolean(n.is_authorized_dealer),
              isActive: Boolean(n.is_active),
              updatedAt: nowIso,
            };
            workingBrands.push(created);
            changesetMap.set(`brand:${created.id}`, {
              kind: 'brand',
              entityId: created.id,
              op: 'create',
              before: null,
            });
          }
          touchedBrands = true;
        } else if (params.templateKey === 'categories') {
          const slug = String(n.slug);
          const parentSlug = String(n.parent_slug ?? '');
          const parent = parentSlug
            ? workingCategories.find((c) => c.slug.toLowerCase() === parentSlug.toLowerCase())
            : undefined;
          const path = parent ? `${parent.path}/${slug}` : slug;
          const depth = parent ? parent.depth + 1 : 0;

          const idx = workingCategories.findIndex((c) => c.slug.toLowerCase() === slug.toLowerCase());
          if (idx >= 0) {
            const existing = workingCategories[idx];
            if (!changesetMap.has(`cat:${existing.id}`)) {
              changesetMap.set(`cat:${existing.id}`, {
                kind: 'category',
                entityId: existing.id,
                op: 'update',
                before: structuredClone(existing),
              });
            }
            workingCategories[idx] = {
              ...existing,
              parentId: parent?.id ?? null,
              path,
              depth,
              vertical: n.vertical as Category['vertical'],
              nameFa: String(n.name_fa),
              nameEn: String(n.name_en),
              descriptionFa: String(n.description_fa ?? ''),
              isActive: Boolean(n.is_active),
              sortOrder: Number(n.sort_order),
              updatedAt: nowIso,
            };
          } else {
            const created: Category = {
              id: `cat_imp_${crypto.randomBytes(4).toString('hex')}`,
              parentId: parent?.id ?? null,
              path,
              depth,
              vertical: n.vertical as Category['vertical'],
              nameFa: String(n.name_fa),
              nameEn: String(n.name_en),
              slug,
              descriptionFa: String(n.description_fa ?? ''),
              seoTextFa: String(n.description_fa ?? ''),
              isActive: Boolean(n.is_active),
              showInMenu: true,
              showOnHome: false,
              sortOrder: Number(n.sort_order),
              attributeIds: [],
              updatedAt: nowIso,
            };
            workingCategories.push(created);
            changesetMap.set(`cat:${created.id}`, {
              kind: 'category',
              entityId: created.id,
              op: 'create',
              before: null,
            });
          }
          touchedCategories = true;
        } else if (params.templateKey === 'products') {
          const sku = String(n.sku).toUpperCase();
          const brandSlug = String(n.brand_slug).toLowerCase();
          const catSlug = String(n.category_slug).toLowerCase();
          const matchedBrand = workingBrands.find(
            (b) => b.slug.toLowerCase() === brandSlug || b.id.toLowerCase() === brandSlug
          );
          const matchedCat = workingCategories.find(
            (c) => c.slug.toLowerCase() === catSlug || c.id.toLowerCase() === catSlug
          );
          const idx = workingProducts.findIndex((p) => p.sku.toUpperCase() === sku);

          if (idx >= 0) {
            const existing = workingProducts[idx];
            if (!changesetMap.has(`prod:${existing.id}`)) {
              changesetMap.set(`prod:${existing.id}`, {
                kind: 'product',
                entityId: existing.id,
                op: 'update',
                before: structuredClone(existing),
              });
            }
            const nextBrandId = matchedBrand?.id ?? existing.brandId;
            const nextCatId = matchedCat?.id ?? existing.primaryCategoryId;
            const nextCatIds = existing.categoryIds.includes(nextCatId)
              ? existing.categoryIds
              : [nextCatId, ...existing.categoryIds];
            const defaultIdx = existing.variants.findIndex((v) => v.isDefault);
            const targetVarIdx = defaultIdx >= 0 ? defaultIdx : 0;
            const nextVariants = existing.variants.map((v, vIdx) => {
              if (vIdx !== targetVarIdx) return v;
              return {
                ...v,
                basePrice: n.base_price === null ? null : Number(n.base_price),
                ...(typeof n.stock_on_hand === 'number' ? { stockOnHand: n.stock_on_hand } : {}),
              };
            });
            if (typeof n.stock_on_hand === 'number' && nextVariants[targetVarIdx]) {
              productStockSyncQueue.push({
                productId: existing.id,
                variantId: nextVariants[targetVarIdx].id,
                onHand: n.stock_on_hand,
              });
            }

            workingProducts[idx] = {
              ...existing,
              titleFa: String(n.title_fa),
              titleEn: String(n.title_en),
              slug: String(n.slug),
              brandId: nextBrandId,
              primaryCategoryId: nextCatId,
              categoryIds: nextCatIds,
              vertical: n.vertical as Product['vertical'],
              kind: n.kind as Product['kind'],
              status: n.status as Product['status'],
              pricingMode: n.pricing_mode as Product['pricingMode'],
              imedCode: String(n.imed_code ?? ''),
              shortDescriptionFa: String(n.short_description_fa ?? ''),
              variants: nextVariants,
              updatedAt: nowIso,
            };
          } else {
            const newProdId = `prod_imp_${crypto.randomBytes(4).toString('hex')}`;
            const newVarId = `var_imp_${crypto.randomBytes(4).toString('hex')}`;
            const initialStock = typeof n.stock_on_hand === 'number' ? n.stock_on_hand : 0;
            const created: Product = {
              id: newProdId,
              vertical: n.vertical as Product['vertical'],
              sku,
              imedCode: String(n.imed_code ?? ''),
              titleFa: String(n.title_fa),
              titleEn: String(n.title_en),
              slug: String(n.slug),
              brandId: matchedBrand?.id ?? workingBrands[0]?.id ?? 'brand_3m',
              originCountryCode: matchedBrand?.countryCode ?? 'DE',
              originCountryFa: matchedBrand?.countryFa ?? 'آلمان',
              primaryCategoryId: matchedCat?.id ?? workingCategories[0]?.id ?? 'cat_restorative',
              categoryIds: [matchedCat?.id ?? workingCategories[0]?.id ?? 'cat_restorative'],
              kind: n.kind as Product['kind'],
              status: n.status as Product['status'],
              pricingMode: n.pricing_mode as Product['pricingMode'],
              shortDescriptionFa: String(n.short_description_fa ?? n.title_fa),
              descriptionFa: String(n.short_description_fa ?? n.title_fa),
              imageUrl: DEFAULT_IMPORT_PRODUCT_IMAGE,
              galleryUrls: [DEFAULT_IMPORT_PRODUCT_IMAGE],
              installationAvailable: false,
              trainingAvailable: false,
              minOrderQty: 1,
              ratingAvg: 0,
              ratingCount: 0,
              viewCount: 0,
              soldCount: 0,
              tags: [],
              attributes: {},
              variants: [
                {
                  id: newVarId,
                  sku: `${sku}-STD`,
                  labelFa: 'بسته استاندارد',
                  optionType: 'pack',
                  optionValueFa: 'استاندارد',
                  basePrice: n.base_price === null ? null : Number(n.base_price),
                  stockOnHand: initialStock,
                  reserved: 0,
                  lowStockThreshold: 5,
                  weightG: 150,
                  isDefault: true,
                  isActive: true,
                },
              ],
              publishedAt: nowIso,
              updatedAt: nowIso,
            };
            workingProducts.push(created);
            changesetMap.set(`prod:${created.id}`, {
              kind: 'product',
              entityId: created.id,
              op: 'create',
              before: null,
            });
            if (initialStock > 0) {
              productStockSyncQueue.push({
                productId: newProdId,
                variantId: newVarId,
                onHand: initialStock,
              });
            }
          }
          touchedProducts = true;
        } else if (params.templateKey === 'variants') {
          const parentSku = String(n.product_sku).toUpperCase();
          const variantSku = String(n.variant_sku).toUpperCase();
          const prodIdx = workingProducts.findIndex((p) => p.sku.toUpperCase() === parentSku);
          if (prodIdx < 0) continue;
          const prod = workingProducts[prodIdx];
          if (!changesetMap.has(`prod:${prod.id}`)) {
            changesetMap.set(`prod:${prod.id}`, {
              kind: 'product',
              entityId: prod.id,
              op: 'update',
              before: structuredClone(prod),
            });
          }

          const varIdx = prod.variants.findIndex((v) => v.sku.toUpperCase() === variantSku);
          if (varIdx >= 0) {
            const existingVar = prod.variants[varIdx];
            prod.variants[varIdx] = {
              ...existingVar,
              labelFa: String(n.label_fa),
              optionType: n.option_type as ProductVariant['optionType'],
              optionValueFa: String(n.option_value_fa),
              ...(n.color_hex ? { colorHex: String(n.color_hex) } : { colorHex: undefined }),
              basePrice: n.base_price === null ? null : Number(n.base_price),
              stockOnHand: Number(n.stock_on_hand),
              lowStockThreshold: Number(n.low_stock_threshold),
              weightG: Number(n.weight_g),
              isActive: Boolean(n.is_active),
            };
          } else {
            const newVar: ProductVariant = {
              id: `var_imp_${crypto.randomBytes(4).toString('hex')}`,
              sku: variantSku,
              labelFa: String(n.label_fa),
              optionType: n.option_type as ProductVariant['optionType'],
              optionValueFa: String(n.option_value_fa),
              ...(n.color_hex ? { colorHex: String(n.color_hex) } : {}),
              basePrice: n.base_price === null ? null : Number(n.base_price),
              stockOnHand: Number(n.stock_on_hand),
              reserved: 0,
              lowStockThreshold: Number(n.low_stock_threshold),
              weightG: Number(n.weight_g),
              isActive: Boolean(n.is_active),
            };
            prod.variants.push(newVar);
          }
          prod.updatedAt = nowIso;
          touchedProducts = true;
        } else if (params.templateKey === 'prices') {
          const prodId = String(n.productId);
          const varId = String(n.variantId);
          const prodIdx = workingProducts.findIndex((p) => p.id === prodId);
          if (prodIdx < 0) continue;
          const prod = workingProducts[prodIdx];
          if (!changesetMap.has(`prod:${prod.id}`)) {
            changesetMap.set(`prod:${prod.id}`, {
              kind: 'product',
              entityId: prod.id,
              op: 'update',
              before: structuredClone(prod),
            });
          }
          const varIdx = prod.variants.findIndex((v) => v.id === varId);
          if (varIdx < 0) continue;

          const v = prod.variants[varIdx];
          const oldPrice = v.basePrice ?? 0;
          const newBasePrice = Number(n.base_price);
          const nextGroupPrices: Partial<Record<CustomerGroupCode, number>> = { ...(v.groupPrices ?? {}) };

          if (typeof n.dentist_price === 'number') nextGroupPrices.dentist = n.dentist_price;
          else delete nextGroupPrices.dentist;
          if (typeof n.clinic_price === 'number') nextGroupPrices.clinic = n.clinic_price;
          else delete nextGroupPrices.clinic;
          if (typeof n.lab_price === 'number') nextGroupPrices.lab = n.lab_price;
          else delete nextGroupPrices.lab;
          if (typeof n.wholesale_price === 'number') nextGroupPrices.wholesale = n.wholesale_price;
          else delete nextGroupPrices.wholesale;

          prod.variants[varIdx] = {
            ...v,
            basePrice: newBasePrice,
            groupPrices: Object.keys(nextGroupPrices).length > 0 ? nextGroupPrices : undefined,
          };

          if (oldPrice !== newBasePrice) {
            const historyEntry: PriceHistoryEntry = {
              variantId: v.id,
              variantLabel: v.labelFa,
              oldPrice,
              newPrice: newBasePrice,
              changedAt: nowIso,
              source: 'import',
            };
            prod.priceHistory = [historyEntry, ...(prod.priceHistory ?? [])].slice(0, 50);
          }
          prod.updatedAt = nowIso;
          touchedProducts = true;
        } else if (params.templateKey === 'redirects') {
          const fromPath = String(n.from_path);
          const idx = workingRedirects.findIndex((r) => r.fromPath.toLowerCase() === fromPath.toLowerCase());
          if (idx >= 0) {
            const existing = workingRedirects[idx];
            if (!changesetMap.has(`redir:${existing.id}`)) {
              changesetMap.set(`redir:${existing.id}`, {
                kind: 'redirect',
                entityId: existing.id,
                op: 'update',
                before: structuredClone(existing),
              });
            }
            workingRedirects[idx] = {
              ...existing,
              toPath: String(n.to_path ?? ''),
              statusCode: Number(n.status_code) as RedirectRule['statusCode'],
            };
          } else {
            const created: RedirectRule = {
              id: `redir_imp_${crypto.randomBytes(4).toString('hex')}`,
              fromPath,
              toPath: String(n.to_path ?? ''),
              statusCode: Number(n.status_code) as RedirectRule['statusCode'],
              hitCount: 0,
              createdAt: nowIso,
            };
            workingRedirects.push(created);
            changesetMap.set(`redir:${created.id}`, {
              kind: 'redirect',
              entityId: created.id,
              op: 'create',
              before: null,
            });
          }
          touchedRedirects = true;
        } else if (params.templateKey === 'stock') {
          const productId = String(n.productId);
          const variantId = String(n.variantId);
          const warehouseId = String(n.warehouseId);
          const warehouseCode = String(n.warehouse_code);
          const sku = String(n.sku);
          const nextOnHand = Number(n.stock_on_hand);
          const reason = String(n.reason || `ایمپورت موجودی (${jobId})`);

          const existingLevel = context.stockLevels.find(
            (l) => l.variantId === variantId && l.warehouseId === warehouseId
          );
          const prod = context.products.find((p) => p.id === productId);
          const v = prod?.variants.find((vr) => vr.id === variantId);
          const stockKey = `stock:${warehouseId}:${variantId}`;
          if (!changesetMap.has(stockKey)) {
            changesetMap.set(stockKey, {
              kind: 'stock',
              productId,
              variantId,
              sku,
              warehouseId,
              warehouseCode,
              hadLevel: Boolean(existingLevel),
              beforeOnHand: existingLevel ? existingLevel.onHand : v?.stockOnHand ?? 0,
              beforeLowStockThreshold: existingLevel?.lowStockThreshold ?? v?.lowStockThreshold,
            });
          }

          const opRes = await repos.stock.stocktakeStock({
            productId,
            variantId,
            warehouseId,
            warehouseCode,
            onHand: nextOnHand,
            reason,
            actorEmail: params.actorEmail,
          });
          if (!opRes.ok) {
            return { ok: false, status: opRes.status ?? 409, message: opRes.message ?? 'خطا در بروزرسانی موجودی انبار' };
          }
          if (typeof n.low_stock_threshold === 'number') {
            const levelKey = `${warehouseId}__${variantId}`;
            if (store.data.stockLevels[levelKey]) {
              store.data.stockLevels[levelKey].lowStockThreshold = n.low_stock_threshold;
            }
            const prodRef = workingProducts.find((p) => p.id === productId);
            const varRef = prodRef?.variants.find((vr) => vr.id === variantId);
            if (varRef) {
              varRef.lowStockThreshold = n.low_stock_threshold;
              touchedProducts = true;
            }
          }
        }
      }
    }

    if (touchedBrands || touchedCategories || touchedProducts || touchedRedirects) {
      await repos.catalog.saveCatalogCollections({
        ...(touchedBrands ? { brands: workingBrands } : {}),
        ...(touchedCategories ? { categories: workingCategories } : {}),
        ...(touchedProducts ? { products: workingProducts } : {}),
        ...(touchedRedirects ? { redirects: workingRedirects } : {}),
        updatedAt: nowIso,
      });
    }

    for (const syncItem of productStockSyncQueue) {
      await repos.stock.stocktakeStock({
        productId: syncItem.productId,
        variantId: syncItem.variantId,
        onHand: syncItem.onHand,
        reason: `مقداردهی اولیه محصول از ایمپورت ${jobId}`,
        actorEmail: params.actorEmail,
      });
    }

    const jobRecord: ImportJobRecord = {
      id: jobId,
      templateKey: params.templateKey,
      templateLabel: dryRun.templateLabel,
      filename: params.filename,
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
      counts: dryRun.summary,
      status: 'committed',
      createdAt: nowIso,
      changeset: Array.from(changesetMap.values()),
    };

    store.data.importJobs.unshift(jobRecord);
    if (store.data.importJobs.length > 100) {
      store.data.importJobs.length = 100;
    }
    store.save();

    await repos.audit.append({
      id: `aud_imp_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      actorType: 'admin',
      actorId: params.actorUid,
      actorEmail: params.actorEmail,
      action: 'import_commit',
      entityType: params.templateKey,
      entityId: jobRecord.id,
      summary: `ایمپورت گروهی ${dryRun.templateLabel}: ${dryRun.summary.createCount} جدید، ${dryRun.summary.updateCount} بروزرسانی، ${dryRun.summary.skipCount} بدون تغییر (${params.filename})`,
      after: {
        jobId: jobRecord.id,
        templateKey: params.templateKey,
        counts: dryRun.summary,
      },
      createdAt: nowIso,
    });

    return {
      ok: true,
      data: {
        job: toJobSummaryDto(jobRecord),
        dryRun,
      },
    };
  });
}

export async function rollbackImportJobService(
  store: ServerStore,
  repos: RepositoryBundle,
  params: {
    jobId: string;
    actorUid: string;
    actorEmail: string;
  }
): Promise<{ ok: true; job: ImportJobSummaryDto } | { ok: false; status: number; message: string }> {
  return repos.runTransaction(async () => {
    const job = store.data.importJobs.find((j) => j.id === params.jobId);
    if (!job) {
      return { ok: false, status: 404, message: 'عملیات ورود داده مورد نظر یافت نشد.' };
    }
    if (job.status === 'rolled_back') {
      return { ok: false, status: 409, message: 'این عملیات ورود داده قبلاً بازگردانی شده است.' };
    }

    const nowIso = new Date().toISOString();
    const snapshot = await repos.catalog.getSnapshot();
    let workingBrands = structuredClone(snapshot.brands);
    let workingCategories = structuredClone(snapshot.categories);
    let workingProducts = structuredClone(snapshot.products);
    let workingRedirects = structuredClone(snapshot.redirects);

    let touchedBrands = false;
    let touchedCategories = false;
    let touchedProducts = false;
    let touchedRedirects = false;

    for (let i = job.changeset.length - 1; i >= 0; i -= 1) {
      const entry = job.changeset[i];
      if (entry.kind === 'brand') {
        touchedBrands = true;
        if (entry.op === 'create') {
          workingBrands = workingBrands.filter((b) => b.id !== entry.entityId);
        } else if (entry.before) {
          const idx = workingBrands.findIndex((b) => b.id === entry.entityId);
          if (idx >= 0) workingBrands[idx] = structuredClone(entry.before);
          else workingBrands.push(structuredClone(entry.before));
        }
      } else if (entry.kind === 'category') {
        touchedCategories = true;
        if (entry.op === 'create') {
          workingCategories = workingCategories.filter((c) => c.id !== entry.entityId);
        } else if (entry.before) {
          const idx = workingCategories.findIndex((c) => c.id === entry.entityId);
          if (idx >= 0) workingCategories[idx] = structuredClone(entry.before);
          else workingCategories.push(structuredClone(entry.before));
        }
      } else if (entry.kind === 'product') {
        touchedProducts = true;
        if (entry.op === 'create') {
          workingProducts = workingProducts.filter((p) => p.id !== entry.entityId);
          for (const lvlKey of Object.keys(store.data.stockLevels)) {
            if (store.data.stockLevels[lvlKey]?.productId === entry.entityId) {
              delete store.data.stockLevels[lvlKey];
            }
          }
        } else if (entry.before) {
          const idx = workingProducts.findIndex((p) => p.id === entry.entityId);
          if (idx >= 0) workingProducts[idx] = structuredClone(entry.before);
          else workingProducts.push(structuredClone(entry.before));
        }
      } else if (entry.kind === 'redirect') {
        touchedRedirects = true;
        if (entry.op === 'create') {
          workingRedirects = workingRedirects.filter((r) => r.id !== entry.entityId);
        } else if (entry.before) {
          const idx = workingRedirects.findIndex((r) => r.id === entry.entityId);
          if (idx >= 0) workingRedirects[idx] = structuredClone(entry.before);
          else workingRedirects.push(structuredClone(entry.before));
        }
      } else if (entry.kind === 'stock') {
        const res = await repos.stock.stocktakeStock({
          productId: entry.productId,
          variantId: entry.variantId,
          warehouseId: entry.warehouseId,
          warehouseCode: entry.warehouseCode,
          onHand: entry.beforeOnHand,
          reason: `بازگردانی ایمپورت ${job.id}`,
          actorEmail: params.actorEmail,
        });
        if (!res.ok) {
          return {
            ok: false,
            status: res.status ?? 409,
            message: res.message ?? 'امکان بازگردانی موجودی انبار وجود ندارد.',
          };
        }
        if (typeof entry.beforeLowStockThreshold === 'number') {
          const levelKey = `${entry.warehouseId}__${entry.variantId}`;
          if (store.data.stockLevels[levelKey]) {
            store.data.stockLevels[levelKey].lowStockThreshold = entry.beforeLowStockThreshold;
          }
          const prodRef = workingProducts.find((p) => p.id === entry.productId);
          const varRef = prodRef?.variants.find((vr) => vr.id === entry.variantId);
          if (varRef) {
            varRef.lowStockThreshold = entry.beforeLowStockThreshold;
            touchedProducts = true;
          }
        }
      }
    }

    if (touchedBrands || touchedCategories || touchedProducts || touchedRedirects) {
      await repos.catalog.saveCatalogCollections({
        ...(touchedBrands ? { brands: workingBrands } : {}),
        ...(touchedCategories ? { categories: workingCategories } : {}),
        ...(touchedProducts ? { products: workingProducts } : {}),
        ...(touchedRedirects ? { redirects: workingRedirects } : {}),
        updatedAt: nowIso,
      });
    }

    job.status = 'rolled_back';
    job.rolledBackAt = nowIso;
    job.rolledBackBy = params.actorEmail;
    store.save();

    await repos.audit.append({
      id: `aud_rb_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      actorType: 'admin',
      actorId: params.actorUid,
      actorEmail: params.actorEmail,
      action: 'import_rollback',
      entityType: job.templateKey,
      entityId: job.id,
      summary: `بازگردانی عملیات ایمپورت ${job.id} (${job.templateLabel}) با ${job.changeset.length} تغییر`,
      createdAt: nowIso,
    });

    return { ok: true, job: toJobSummaryDto(job) };
  });
}
