import { normalizeDigitsAndArabic, normalizeHeaderName } from './normalize';
import { brandsTemplate } from './templates/brands';
import { categoriesTemplate } from './templates/categories';
import { pricesTemplate } from './templates/prices';
import { productsTemplate } from './templates/products';
import { redirectsTemplate } from './templates/redirects';
import { stockTemplate } from './templates/stock';
import { variantsTemplate } from './templates/variants';
import type {
  ColumnMapping,
  ImportBatchRuntimeState,
  ImportCatalogContext,
  ImportDryRunResult,
  ImportTemplateDefinition,
  ImportTemplateKey,
  ImportValidationRow,
} from './types';

export * from './types';
export * from './normalize';

export const IMPORT_TEMPLATE_REGISTRY: Record<ImportTemplateKey, ImportTemplateDefinition> = {
  products: productsTemplate,
  variants: variantsTemplate,
  prices: pricesTemplate,
  stock: stockTemplate,
  categories: categoriesTemplate,
  brands: brandsTemplate,
  redirects: redirectsTemplate,
};

export const IMPORT_TEMPLATE_LIST: ImportTemplateDefinition[] = [
  productsTemplate,
  variantsTemplate,
  pricesTemplate,
  stockTemplate,
  categoriesTemplate,
  brandsTemplate,
  redirectsTemplate,
];

export function getImportTemplate(key: string): ImportTemplateDefinition | null {
  if (key in IMPORT_TEMPLATE_REGISTRY) {
    return IMPORT_TEMPLATE_REGISTRY[key as ImportTemplateKey];
  }
  return null;
}

function headerMatchesColumn(normalizedHeader: string, templateCol: ImportTemplateDefinition['columns'][number]): number {
  const keyNorm = normalizeHeaderName(templateCol.key);
  const labelNorm = normalizeHeaderName(templateCol.labelFa);
  if (normalizedHeader === keyNorm) return 10;
  if (normalizedHeader === labelNorm) return 8;
  for (const alias of templateCol.aliases) {
    if (normalizedHeader === normalizeHeaderName(alias)) return 6;
  }
  return 0;
}

export interface TemplateDetectionResult {
  templateKey: ImportTemplateKey;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  mapping: ColumnMapping;
}

export function autoMapColumns(headers: string[], template: ImportTemplateDefinition): ColumnMapping {
  const normalizedHeaders = headers.map((h) => normalizeHeaderName(h));
  const usedIndexes = new Set<number>();
  const mapping: ColumnMapping = {};

  for (const col of template.columns) {
    let bestIdx: number | null = null;
    let bestScore = 0;
    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      if (usedIndexes.has(i) || !normalizedHeaders[i]) continue;
      const score = headerMatchesColumn(normalizedHeaders[i], col);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx !== null) {
      usedIndexes.add(bestIdx);
    }
    mapping[col.key] = bestIdx;
  }

  return mapping;
}

export function detectTemplateFromHeaders(headers: string[]): TemplateDetectionResult {
  let bestKey: ImportTemplateKey = 'products';
  let bestScore = -1;
  let bestRequiredRatio = 0;
  let bestMapping: ColumnMapping = {};

  const normalizedHeaders = headers.map((h) => normalizeHeaderName(h));

  for (const tpl of IMPORT_TEMPLATE_LIST) {
    const mapping = autoMapColumns(headers, tpl);
    let score = 0;
    let requiredTotal = 0;
    let requiredMatched = 0;

    for (const col of tpl.columns) {
      if (col.required) requiredTotal += 1;
      const idx = mapping[col.key];
      if (idx !== null && idx !== undefined) {
        score += headerMatchesColumn(normalizedHeaders[idx], col);
        if (col.required) requiredMatched += 1;
      }
    }

    // Disambiguate templates cleanly (e.g., prices vs stock vs variants vs products)
    if (tpl.key === 'variants' && mapping.variant_sku !== null && mapping.product_sku !== null) {
      score += 12;
    }
    if (tpl.key === 'stock' && mapping.warehouse_code !== null && mapping.stock_on_hand !== null) {
      score += 12;
    }
    if (tpl.key === 'prices' && mapping.sku !== null && mapping.base_price !== null && mapping.title_fa === undefined) {
      score += 8;
    }
    if (tpl.key === 'redirects' && mapping.from_path !== null) {
      score += 12;
    }

    const reqRatio = requiredTotal > 0 ? requiredMatched / requiredTotal : 1;
    if (score > bestScore || (score === bestScore && reqRatio > bestRequiredRatio)) {
      bestScore = score;
      bestKey = tpl.key;
      bestRequiredRatio = reqRatio;
      bestMapping = mapping;
    }
  }

  const confidence: TemplateDetectionResult['confidence'] =
    bestRequiredRatio >= 1 && bestScore >= 12 ? 'high' : bestScore >= 8 ? 'medium' : 'low';

  return {
    templateKey: bestKey,
    confidence,
    score: Math.max(0, bestScore),
    mapping: bestMapping,
  };
}

export function applyColumnMappingToMatrix(
  matrix: string[][],
  template: ImportTemplateDefinition,
  mapping?: ColumnMapping
): Record<string, string>[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0] ?? [];
  const effectiveMap = mapping ?? autoMapColumns(headers, template);

  const records: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const rowCells = matrix[r] ?? [];
    if (rowCells.every((c) => !String(c ?? '').trim())) continue;
    const raw: Record<string, string> = {};
    for (const col of template.columns) {
      const idx = effectiveMap[col.key];
      raw[col.key] = idx !== null && idx !== undefined && idx >= 0 ? String(rowCells[idx] ?? '').trim() : '';
    }
    records.push(raw);
  }
  return records;
}

export function validateTemplateRows(
  templateKey: ImportTemplateKey,
  rawRows: Record<string, string>[],
  context: ImportCatalogContext,
  rowNumberOffset = 2
): ImportDryRunResult {
  const template = IMPORT_TEMPLATE_REGISTRY[templateKey];
  const batchState: ImportBatchRuntimeState = {
    seenUpsertKeys: new Map<string, number>(),
    pendingCategorySlugs: new Set<string>(),
    pendingBrandSlugs: new Set<string>(),
    pendingProductSkus: new Map<string, string>(),
    pendingVariantSkus: new Map<string, { productSku: string; variantId: string }>(),
  };

  const validatedRows: ImportValidationRow[] = [];
  let createCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawRows.length; i += 1) {
    const rowNumber = rowNumberOffset + i;
    const raw: Record<string, string> = {};
    for (const col of template.columns) {
      raw[col.key] = rawRows[i]?.[col.key] ?? '';
    }
    // Preserve any extra fields on raw if submitted directly so formula scanner inspects all inputs
    for (const [k, v] of Object.entries(rawRows[i] ?? {})) {
      if (!(k in raw)) raw[k] = String(v ?? '');
    }

    const res = template.validateRow(raw, rowNumber, context, batchState);
    if (res.action === 'create') createCount += 1;
    else if (res.action === 'update') updateCount += 1;
    else if (res.action === 'skip') skipCount += 1;
    else errorCount += 1;

    validatedRows.push({
      rowNumber,
      action: res.action,
      upsertKey: res.upsertKey,
      summaryFa: res.summaryFa,
      raw,
      normalized: res.normalized,
      errors: res.errors,
    });
  }

  return {
    templateKey,
    templateLabel: template.label,
    summary: {
      totalRows: validatedRows.length,
      createCount,
      updateCount,
      skipCount,
      errorCount,
    },
    rows: validatedRows,
  };
}

export function validateMatrixWithTemplate(
  templateKey: ImportTemplateKey,
  matrix: string[][],
  context: ImportCatalogContext,
  mapping?: ColumnMapping
): ImportDryRunResult {
  const template = IMPORT_TEMPLATE_REGISTRY[templateKey];
  const mappedRows = applyColumnMappingToMatrix(matrix, template, mapping);
  return validateTemplateRows(templateKey, mappedRows, context, 2);
}

export function buildErrorReportRows(result: ImportDryRunResult): Record<string, unknown>[] {
  const template = IMPORT_TEMPLATE_REGISTRY[result.templateKey];
  return result.rows
    .filter((r) => r.action === 'error')
    .map((r) => {
      const record: Record<string, unknown> = {
        row_number: r.rowNumber,
        upsert_key: r.upsertKey,
        errors_fa: r.errors.join(' | '),
      };
      for (const col of template.columns) {
        record[col.key] = r.raw[col.key] ?? '';
      }
      return record;
    });
}

export function exportTemplateDataRows(
  templateKey: ImportTemplateKey,
  context: ImportCatalogContext
): { headers: string[]; rows: Record<string, unknown>[] } {
  const template = IMPORT_TEMPLATE_REGISTRY[templateKey];
  return {
    headers: template.columns.map((c) => c.key),
    rows: template.exportRows(context),
  };
}

export function isNonEmptyMappedMatrix(matrix: string[][]): boolean {
  return matrix.length >= 2 && matrix.slice(1).some((r) => r.some((c) => normalizeDigitsAndArabic(c) !== ''));
}
