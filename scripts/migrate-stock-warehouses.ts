import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { SEED_WAREHOUSES } from '../src/data/expandedCatalog';
import type { StockBatchRecord, StockLevel, Warehouse } from '../src/types/domain';
import type { PersistedServerData, ServerStore } from '../server/persistence';

export interface StockMigrationReport {
  dryRun: boolean;
  defaultWarehouseId: string;
  migratedLevels: number;
  migratedBatches: number;
  skippedVariants: number;
}

export function resolveDefaultWarehouse(warehouses: Warehouse[]): Warehouse {
  return (
    warehouses.find((w) => w.isDefault && w.isActive) ??
    warehouses.find((w) => w.id === 'wh_teh') ??
    warehouses.find((w) => w.isActive) ??
    SEED_WAREHOUSES[0]
  );
}

export function migrateStockToWarehousesData(
  data: PersistedServerData,
  options: { dryRun?: boolean; defaultWarehouseId?: string } = {}
): StockMigrationReport {
  const dryRun = Boolean(options.dryRun);
  const warehouses: Warehouse[] =
    Array.isArray(data.warehouses) && data.warehouses.length > 0 ? data.warehouses : [...SEED_WAREHOUSES];

  if (!dryRun && (!Array.isArray(data.warehouses) || data.warehouses.length === 0)) {
    data.warehouses = [...SEED_WAREHOUSES];
  }

  const defaultWh =
    (options.defaultWarehouseId ? warehouses.find((w) => w.id === options.defaultWarehouseId) : undefined) ??
    resolveDefaultWarehouse(warehouses);

  const byCode = new Map<string, Warehouse>();
  for (const w of warehouses) {
    byCode.set(w.code.toUpperCase(), w);
    byCode.set(w.id.toUpperCase(), w);
  }
  // Legacy catalog code alias
  byCode.set('TEH-MAIN', defaultWh);

  const existingLevels = data.stockLevels ?? {};
  const existingBatches = data.stockBatches ?? {};

  const variantsWithLevels = new Set<string>();
  for (const lvl of Object.values(existingLevels)) {
    if (lvl?.variantId) variantsWithLevels.add(lvl.variantId);
  }

  const existingBatchKeys = new Set<string>();
  for (const b of Object.values(existingBatches)) {
    if (b?.variantId && b?.warehouseId && b?.batchNo) {
      existingBatchKeys.add(`${b.warehouseId}__${b.variantId}__${b.batchNo}`);
    }
  }

  const nowIso = new Date().toISOString();
  let migratedLevels = 0;
  let migratedBatches = 0;
  let skippedVariants = 0;

  for (const product of data.catalogState.products) {
    for (const variant of product.variants) {
      if (variantsWithLevels.has(variant.id)) {
        skippedVariants += 1;
        continue;
      }

      const perWhOnHand = new Map<string, { warehouse: Warehouse; onHand: number }>();
      const variantBatches = variant.batches ?? [];

      for (const batch of variantBatches) {
        const mappedWh =
          (batch.warehouseId ? warehouses.find((w) => w.id === batch.warehouseId) : undefined) ??
          byCode.get(String(batch.warehouseCode || '').toUpperCase()) ??
          defaultWh;

        const batchQty = Math.max(0, Number(batch.qty ?? batch.qtyOnHand ?? 0));
        const batchReserved = Math.max(0, Number(batch.reserved ?? 0));
        const batchCondition = batch.condition ?? 'resellable';
        const batchExpiry = batch.expiryDate || batch.expiresAt || new Date(Date.now() + 365 * 86400_000).toISOString();

        const batchDedupKey = `${mappedWh.id}__${variant.id}__${batch.batchNo}`;
        if (!existingBatchKeys.has(batchDedupKey)) {
          existingBatchKeys.add(batchDedupKey);
          migratedBatches += 1;
          if (!dryRun) {
            const batchId = batch.id || `bat_${mappedWh.id}_${variant.id}_${batch.batchNo}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const rec: StockBatchRecord = {
              id: existingBatches[batchId] ? `${batchId}_${migratedBatches}` : batchId,
              productId: product.id,
              variantId: variant.id,
              warehouseId: mappedWh.id,
              warehouseCode: mappedWh.code,
              batchNo: batch.batchNo,
              expiryDate: batchExpiry,
              qty: batchQty,
              reserved: batchReserved,
              ...(typeof batch.unitCost === 'number' ? { unitCost: batch.unitCost } : {}),
              specialPrice: batch.specialPrice ?? null,
              condition: batchCondition,
              createdAt: batch.producedAt || nowIso,
              updatedAt: nowIso,
            };
            existingBatches[rec.id] = rec;
          }
        }

        if (batchCondition !== 'damaged') {
          const prev = perWhOnHand.get(mappedWh.id);
          perWhOnHand.set(mappedWh.id, {
            warehouse: mappedWh,
            onHand: (prev?.onHand ?? 0) + batchQty,
          });
        }
      }

      const batchedTotal = Array.from(perWhOnHand.values()).reduce((s, e) => s + e.onHand, 0);
      const legacyOnHand = Math.max(0, Number(variant.stockOnHand ?? 0));
      const legacyReserved = Math.max(0, Number(variant.reserved ?? 0));
      const unbatchedRemainder = Math.max(0, legacyOnHand - batchedTotal);

      const defaultEntry = perWhOnHand.get(defaultWh.id);
      if (defaultEntry) {
        defaultEntry.onHand += unbatchedRemainder;
      } else {
        perWhOnHand.set(defaultWh.id, {
          warehouse: defaultWh,
          onHand: unbatchedRemainder > 0 ? unbatchedRemainder : batchedTotal === 0 ? legacyOnHand : 0,
        });
      }

      for (const [whId, entry] of perWhOnHand.entries()) {
        const levelId = `${whId}__${variant.id}`;
        if (!existingLevels[levelId]) {
          migratedLevels += 1;
          if (!dryRun) {
            const lvl: StockLevel = {
              id: levelId,
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: whId,
              warehouseCode: entry.warehouse.code,
              onHand: entry.onHand,
              reserved: whId === defaultWh.id ? legacyReserved : 0,
              lowStockThreshold: variant.lowStockThreshold ?? 5,
              updatedAt: nowIso,
            };
            existingLevels[levelId] = lvl;
          }
        }
      }
    }
  }

  if (!dryRun) {
    data.stockLevels = existingLevels;
    data.stockBatches = existingBatches;
  }

  return {
    dryRun,
    defaultWarehouseId: defaultWh.id,
    migratedLevels,
    migratedBatches,
    skippedVariants,
  };
}

export function migrateStockToWarehousesStore(
  store: ServerStore,
  options: { dryRun?: boolean; defaultWarehouseId?: string } = {}
): StockMigrationReport {
  const report = migrateStockToWarehousesData(store.data, options);
  if (!options.dryRun && (report.migratedLevels > 0 || report.migratedBatches > 0)) {
    store.save();
  }
  return report;
}

const isMainEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry && !process.env.VITEST) {
  const dryRun = process.argv.includes('--dry-run');
  const dataDirArg = process.argv.find((a) => a.startsWith('--data-dir='));
  const dataDir = dataDirArg ? dataDirArg.slice('--data-dir='.length) : undefined;

  import('../server/persistence')
    .then(async ({ createServerStore }) => {
      const store = createServerStore(dataDir);
      const report = migrateStockToWarehousesStore(store, { dryRun });
      await store.flush();
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
