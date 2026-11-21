import type {
  Brand,
  Category,
  Product,
  RedirectRule,
  StockLevel,
  Warehouse,
} from '../../../types/domain';

export type ImportTemplateKey =
  | 'products'
  | 'variants'
  | 'prices'
  | 'stock'
  | 'categories'
  | 'brands'
  | 'redirects';

export type ImportColumnType = 'string' | 'number' | 'boolean' | 'enum';

export interface ImportColumnDef {
  key: string;
  labelFa: string;
  required: boolean;
  aliases: string[];
  type: ImportColumnType;
  enumValues?: string[];
  descriptionFa?: string;
}

export type ImportAction = 'create' | 'update' | 'skip' | 'error';

export interface ImportValidationRow {
  rowNumber: number;
  action: ImportAction;
  upsertKey: string;
  summaryFa: string;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  errors: string[];
}

export interface ImportDryRunSummary {
  totalRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
}

export interface ImportDryRunResult {
  templateKey: ImportTemplateKey;
  templateLabel: string;
  summary: ImportDryRunSummary;
  rows: ImportValidationRow[];
}

export type ImportChangesetEntry =
  | {
      kind: 'product';
      entityId: string;
      op: 'create' | 'update';
      before: Product | null;
    }
  | {
      kind: 'category';
      entityId: string;
      op: 'create' | 'update';
      before: Category | null;
    }
  | {
      kind: 'brand';
      entityId: string;
      op: 'create' | 'update';
      before: Brand | null;
    }
  | {
      kind: 'redirect';
      entityId: string;
      op: 'create' | 'update';
      before: RedirectRule | null;
    }
  | {
      kind: 'stock';
      productId: string;
      variantId: string;
      sku: string;
      warehouseId: string;
      warehouseCode: string;
      hadLevel: boolean;
      beforeOnHand: number;
      beforeLowStockThreshold?: number;
    };

export interface ImportJobRecord {
  id: string;
  templateKey: ImportTemplateKey;
  templateLabel: string;
  filename: string;
  actorUid: string;
  actorEmail: string;
  counts: ImportDryRunSummary;
  status: 'committed' | 'rolled_back';
  createdAt: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  changeset: ImportChangesetEntry[];
}

export interface ImportJobSummaryDto {
  id: string;
  templateKey: ImportTemplateKey;
  templateLabel: string;
  filename: string;
  actorUid: string;
  actorEmail: string;
  counts: ImportDryRunSummary;
  status: 'committed' | 'rolled_back';
  createdAt: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  changesetSize: number;
}

export interface ImportCatalogContext {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  redirects: RedirectRule[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
}

export interface ImportBatchRuntimeState {
  seenUpsertKeys: Map<string, number>;
  pendingCategorySlugs: Set<string>;
  pendingBrandSlugs: Set<string>;
  pendingProductSkus: Map<string, string>; // upper SKU -> titleFa
  pendingVariantSkus: Map<string, { productSku: string; variantId: string }>;
}

export interface RowValidationOutput {
  upsertKey: string;
  action: ImportAction;
  summaryFa: string;
  normalized: Record<string, unknown>;
  errors: string[];
}

export interface ImportTemplateDefinition {
  key: ImportTemplateKey;
  label: string;
  description: string;
  upsertKeyField: string;
  upsertKeyLabel: string;
  columns: ImportColumnDef[];
  sampleRows: Record<string, string | number | boolean>[];
  validateRow: (
    raw: Record<string, string>,
    rowNumber: number,
    context: ImportCatalogContext,
    batchState: ImportBatchRuntimeState
  ) => RowValidationOutput;
  exportRows: (context: ImportCatalogContext) => Record<string, unknown>[];
}

export type ColumnMapping = Record<string, number | null>;
