import { pathToFileURL } from 'node:url';
import type { Order, OrderSource } from '../src/types/domain';
import { createServerStore, type ServerStore } from '../server/persistence';

export interface MigrationReport {
  scannedLegacy: number;
  migrated: number;
  skippedAlreadyPresent: number;
  dryRun: boolean;
}

export function migrateGuestOrdersStore(store: ServerStore, options: { dryRun?: boolean } = {}): MigrationReport {
  const dryRun = Boolean(options.dryRun);
  const legacyEntries = Object.values(store.data.guestOrders ?? {});
  let migrated = 0;
  let skippedAlreadyPresent = 0;

  for (const legacy of legacyEntries) {
    if (!legacy?.id) continue;
    const existing = store.data.orders[legacy.id];
    if (existing) {
      skippedAlreadyPresent += 1;
      continue;
    }

    const inferredSource: OrderSource =
      legacy.source ?? (legacy.userId?.startsWith('mobile:') ? 'otp' : 'guest');

    const normalizedOrder: Order = {
      ...legacy,
      source: inferredSource,
      statusHistory:
        Array.isArray(legacy.statusHistory) && legacy.statusHistory.length > 0
          ? legacy.statusHistory
          : [
              {
                status: legacy.status,
                paymentStatus: legacy.paymentStatus,
                changedAt: legacy.updatedAt || legacy.createdAt,
                actorType: 'system',
                note: 'Migrated from legacy guestOrders store',
              },
            ],
    };

    if (!dryRun) {
      store.data.orders[normalizedOrder.id] = normalizedOrder;
    }
    migrated += 1;
  }

  if (!dryRun && (migrated > 0 || store.data.guestOrders)) {
    delete store.data.guestOrders;
    store.save();
  }

  return {
    scannedLegacy: legacyEntries.length,
    migrated,
    skippedAlreadyPresent,
    dryRun,
  };
}

const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dataDirArg = args.find((a) => a.startsWith('--data-dir='))?.split('=')[1];
  const store = createServerStore(dataDirArg);
  const report = migrateGuestOrdersStore(store, { dryRun });
  console.log(
    JSON.stringify({
      ok: true,
      ...report,
    })
  );
}
