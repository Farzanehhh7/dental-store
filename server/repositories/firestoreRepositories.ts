import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Firestore, Transaction, getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SEED_WAREHOUSES } from '../../src/data/expandedCatalog';
import {
  CustomerGroupCode,
  NewsletterSubscriber,
  NotFoundLog,
  Order,
  OrderBatchAllocation,
  PaymentLedgerEntry,
  Product,
  ProductVariant,
  ProformaInvoice,
  ReturnRequest,
  RfqRequest,
  StockBatch,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  StockNotification,
  Warehouse,
} from '../../src/types/domain';
import type { ImportJobRecord } from '../../src/pages/admin/importExport/types';
import { normalizeMobile } from '../auth';
import {
  MobileSessionRecord,
  OtpChallengeRecord,
  OtpLockoutRecord,
  OtpVerifiedTokenRecord,
  ServerAuditLogRecord,
  ServerCatalogSnapshot,
  ServerPaymentSession,
  ServerStore,
  ServerUserGroupRecord,
  UploadedFileRecord,
  VerifiedOrderPaymentState,
} from '../persistence';
import { stripUndefinedDeep } from './dateUtils';
import { filterAndPaginateOrders } from './fileRepositories';
import {
  AuditRepository,
  AuthSessionRepository,
  CatalogRepository,
  CatalogSnapshotPatch,
  EngagementRepository,
  OrderRepository,
  PaymentRepository,
  ProformaRepository,
  RepositoryBundle,
  ReturnRepository,
  RfqRepository,
  StockAdjustParams,
  StockItemDelta,
  StockMovementContext,
  StockOperationResult,
  StockRepository,
  StockReservationResult,
  StocktakeParams,
  StockTransferParams,
} from './interfaces';

function getAdminFirestore(): Firestore {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        projectId: firebaseConfig.projectId,
      });
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  return getFirestore(app);
}

/**
 * Primary production adapter backed by Firebase Admin Firestore SDK.
 * Enabled via STORAGE_DRIVER=firestore when running in a project where the service account has Firestore permissions.
 */
export function createFirestoreRepositories(fallbackStore: ServerStore, customDb?: Firestore): RepositoryBundle {
  const db = customDb ?? getAdminFirestore();
  const txStorage = new AsyncLocalStorage<Transaction>();
  let catalogVersion = 1;
  const catalogListeners = new Set<() => void>();

  const notifyCatalogChanged = () => {
    catalogVersion += 1;
    for (const listener of catalogListeners) {
      try {
        listener();
      } catch {
        // Listener error ignored
      }
    }
  };

  const currentTx = (): Transaction | undefined => txStorage.getStore();

  const txGet = async <T extends FirebaseFirestore.DocumentData>(
    refOrQuery: FirebaseFirestore.DocumentReference<T> | FirebaseFirestore.Query<T>
  ) => {
    const tx = currentTx();
    if (tx) {
      return 'get' in refOrQuery ? tx.get(refOrQuery as FirebaseFirestore.DocumentReference<T>) : refOrQuery.get();
    }
    return refOrQuery.get();
  };

  const setDoc = async (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, merge = true) => {
    const clean = stripUndefinedDeep(data);
    const tx = currentTx();
    if (tx) {
      tx.set(ref, clean, { merge });
    } else {
      await ref.set(clean, { merge });
    }
  };

  const loadAllWarehouses = async (): Promise<Warehouse[]> => {
    const tx = currentTx();
    const q = db.collection('warehouses');
    const snap = tx ? await tx.get(q) : await q.get();
    if (snap.empty) {
      return (fallbackStore.data.warehouses.length > 0 ? fallbackStore.data.warehouses : SEED_WAREHOUSES).map((w) => ({
        ...w,
      }));
    }
    return snap.docs.map((d) => d.data() as Warehouse);
  };

  const resolveWarehouseFromList = (list: Warehouse[], warehouseId?: string, warehouseCode?: string): Warehouse => {
    if (warehouseId) {
      const found = list.find((w) => w.id === warehouseId);
      if (found) return found;
    }
    if (warehouseCode) {
      const up = warehouseCode.trim().toUpperCase();
      const found = list.find((w) => w.code.toUpperCase() === up);
      if (found) return found;
    }
    return list.find((w) => w.isDefault && w.isActive) ?? list.find((w) => w.id === 'wh_teh') ?? list[0];
  };

  const syncVariantAggregatesInMem = (
    variant: ProductVariant,
    variantLevels: StockLevel[],
    variantBatches: StockBatchRecord[]
  ) => {
    if (variantLevels.length > 0) {
      variant.stockOnHand = variantLevels.reduce((s, l) => s + Math.max(0, l.onHand), 0);
      variant.reserved = variantLevels.reduce((s, l) => s + Math.max(0, l.reserved), 0);
    }
    const resellable = variantBatches
      .filter((b) => b.condition !== 'damaged')
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    if (resellable.length > 0 || (variant.batches && variant.batches.length > 0)) {
      variant.batches = resellable.map(
        (b): StockBatch => ({
          id: b.id,
          batchNo: b.batchNo,
          warehouseId: b.warehouseId,
          warehouseCode: b.warehouseCode,
          expiresAt: b.expiryDate,
          expiryDate: b.expiryDate,
          qtyOnHand: b.qty,
          qty: b.qty,
          reserved: b.reserved,
          ...(typeof b.unitCost === 'number' ? { unitCost: b.unitCost } : {}),
          specialPrice: b.specialPrice ?? null,
          condition: b.condition,
        })
      );
    }
  };

  const queueMovementWrite = async (mv: Omit<StockMovement, 'id'>): Promise<StockMovement> => {
    const record: StockMovement = {
      id: `sm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ...mv,
    };
    await setDoc(db.collection('stockMovements').doc(record.id), record as unknown as Record<string, unknown>, false);
    return record;
  };

  const orders: OrderRepository = {
    async getById(id) {
      const ref = db.collection('orders').doc(id);
      const tx = currentTx();
      const snap = tx ? await tx.get(ref) : await ref.get();
      return snap.exists ? (snap.data() as Order) : null;
    },
    async getByOrderNo(orderNo) {
      const q = db.collection('orders').where('orderNo', '==', orderNo.trim()).limit(1);
      const tx = currentTx();
      const snap = tx ? await tx.get(q) : await q.get();
      return snap.empty ? null : (snap.docs[0].data() as Order);
    },
    async findByIdempotencyKey(idempotencyKey) {
      const q = db.collection('orders').where('idempotencyKey', '==', idempotencyKey.trim()).limit(1);
      const tx = currentTx();
      const snap = tx ? await tx.get(q) : await q.get();
      return snap.empty ? null : (snap.docs[0].data() as Order);
    },
    async save(order) {
      await setDoc(db.collection('orders').doc(order.id), order as unknown as Record<string, unknown>, true);
    },
    async list(filter) {
      const snap = await db.collection('orders').get();
      const all = snap.docs.map((d) => d.data() as Order);
      return filterAndPaginateOrders(all, filter);
    },
    async listExpiredPending(nowIso) {
      const snap = await db
        .collection('orders')
        .where('status', 'in', ['pending_payment', 'payment_failed'])
        .get();
      const nowMs = new Date(nowIso).getTime();
      return snap.docs
        .map((d) => d.data() as Order)
        .filter((o) => o.expiresAt && new Date(o.expiresAt).getTime() <= nowMs);
    },
  };

  const payments: PaymentRepository = {
    async getSessionByAuthority(authority) {
      const ref = db.collection('paymentSessions').doc(authority);
      const tx = currentTx();
      const snap = tx ? await tx.get(ref) : await ref.get();
      return snap.exists ? (snap.data() as ServerPaymentSession) : null;
    },
    async findSessionByIdempotencyKey(idempotencyKey) {
      const q = db.collection('paymentSessions').where('idempotencyKey', '==', idempotencyKey).limit(1);
      const tx = currentTx();
      const snap = tx ? await tx.get(q) : await q.get();
      return snap.empty ? null : (snap.docs[0].data() as ServerPaymentSession);
    },
    async findOpenSessionsByOrderId(orderId) {
      const q = db
        .collection('paymentSessions')
        .where('orderId', '==', orderId)
        .where('status', 'in', ['initiated', 'redirected']);
      const tx = currentTx();
      const snap = tx ? await tx.get(q) : await q.get();
      return snap.docs.map((d) => d.data() as ServerPaymentSession);
    },
    async saveSession(session) {
      await setDoc(
        db.collection('paymentSessions').doc(session.authority),
        session as unknown as Record<string, unknown>,
        true
      );
    },
    async addLedgerEntry(entry) {
      await setDoc(db.collection('paymentLedger').doc(entry.id), entry as unknown as Record<string, unknown>, false);
    },
    async listLedger() {
      const snap = await db.collection('paymentLedger').orderBy('createdAt', 'desc').limit(500).get();
      return snap.docs.map((d) => d.data() as PaymentLedgerEntry);
    },
    async getVerifiedOrder(orderId) {
      const ref = db.collection('verifiedOrderStatuses').doc(orderId);
      const tx = currentTx();
      const snap = tx ? await tx.get(ref) : await ref.get();
      return snap.exists ? (snap.data() as VerifiedOrderPaymentState) : null;
    },
    async listVerifiedOrders() {
      const snap = await db.collection('verifiedOrderStatuses').get();
      const out: Record<string, VerifiedOrderPaymentState> = {};
      for (const docSnap of snap.docs) {
        out[docSnap.id] = docSnap.data() as VerifiedOrderPaymentState;
      }
      return out;
    },
    async saveVerifiedOrder(state) {
      await setDoc(
        db.collection('verifiedOrderStatuses').doc(state.orderId),
        state as unknown as Record<string, unknown>,
        false
      );
    },
    async hasProcessedWebhook(eventKey) {
      const ref = db.collection('paymentWebhookEvents').doc(eventKey);
      const tx = currentTx();
      const snap = tx ? await tx.get(ref) : await ref.get();
      return snap.exists;
    },
    async markWebhookProcessed(eventKey, processedAt) {
      await setDoc(db.collection('paymentWebhookEvents').doc(eventKey), { processedAt }, false);
    },
  };

  // Helper to read product + all levels & batches for involved variants BEFORE any writes
  const loadProductAndVariantStock = async (productIds: string[], variantIds: string[]) => {
    const tx = currentTx();
    const allWarehouses = await loadAllWarehouses();
    const productsMap = new Map<string, { ref: FirebaseFirestore.DocumentReference; product: Product }>();
    const levelsByVariant = new Map<string, Map<string, StockLevel>>();
    const batchesByVariant = new Map<string, Map<string, StockBatchRecord>>();

    for (const pid of productIds) {
      const ref = db.collection('products').doc(pid);
      const snap = tx ? await tx.get(ref) : await ref.get();
      if (snap.exists) {
        productsMap.set(pid, { ref, product: snap.data() as Product });
      } else {
        const mirror = fallbackStore.data.catalogState.products.find((p) => p.id === pid);
        if (mirror) {
          productsMap.set(pid, { ref, product: JSON.parse(JSON.stringify(mirror)) as Product });
        }
      }
    }

    for (const vid of variantIds) {
      const lvlQuery = db.collection('stockLevels').where('variantId', '==', vid);
      const batQuery = db.collection('stockBatches').where('variantId', '==', vid);
      const [lvlSnap, batSnap] = await Promise.all([
        tx ? tx.get(lvlQuery) : lvlQuery.get(),
        tx ? tx.get(batQuery) : batQuery.get(),
      ]);
      const lvlMap = new Map<string, StockLevel>();
      for (const docSnap of lvlSnap.docs) {
        const lvl = docSnap.data() as StockLevel;
        lvlMap.set(lvl.id, lvl);
      }
      const batMap = new Map<string, StockBatchRecord>();
      for (const docSnap of batSnap.docs) {
        const bat = docSnap.data() as StockBatchRecord;
        batMap.set(bat.id, bat);
      }
      levelsByVariant.set(vid, lvlMap);
      batchesByVariant.set(vid, batMap);
    }

    return { allWarehouses, productsMap, levelsByVariant, batchesByVariant };
  };

  const stock: StockRepository = {
    async reserveItems(items: StockItemDelta[], ctx?: StockMovementContext): Promise<StockReservationResult> {
      const aggregated = new Map<string, StockItemDelta>();
      for (const item of items) {
        const key = `${item.productId}::${item.variantId}`;
        const prev = aggregated.get(key);
        aggregated.set(key, {
          productId: item.productId,
          variantId: item.variantId,
          quantity: (prev?.quantity ?? 0) + item.quantity,
        });
      }

      const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId)));
      const uniqueVariantIds = Array.from(new Set(items.map((i) => i.variantId)));
      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        uniqueProductIds,
        uniqueVariantIds
      );

      const activeWarehouses = allWarehouses.filter((w) => w.isActive);
      const activeWhIds = new Set(activeWarehouses.map((w) => w.id));
      const defaultWh = resolveWarehouseFromList(allWarehouses);
      const nowIso = new Date().toISOString();

      const targets: Array<{ product: Product; variant: ProductVariant; qty: number; key: string }> = [];
      for (const delta of aggregated.values()) {
        const entry = productsMap.get(delta.productId);
        const variant = entry?.product.variants.find((v) => v.id === delta.variantId && v.isActive);
        if (!entry || !variant) {
          return { ok: false, message: 'یکی از کالاهای سفارش در انبار یافت نشد.' };
        }
        const lvlMap = levelsByVariant.get(variant.id) ?? new Map<string, StockLevel>();
        const levels = Array.from(lvlMap.values()).filter((l) => activeWhIds.has(l.warehouseId));
        const totalAvail =
          levels.length > 0
            ? levels.reduce((s, l) => s + Math.max(0, l.onHand - l.reserved), 0)
            : Math.max(0, variant.stockOnHand - variant.reserved);

        if (delta.quantity > totalAvail) {
          return {
            ok: false,
            message: `موجودی قابل رزرو برای «${entry.product.titleFa} (${variant.labelFa})» کافی نیست (موجود: ${totalAvail}).`,
          };
        }
        targets.push({ product: entry.product, variant, qty: delta.quantity, key: `${delta.productId}::${delta.variantId}` });
      }

      const dirtyLevels = new Map<string, StockLevel>();
      const dirtyBatches = new Map<string, StockBatchRecord>();
      const movementsToWrite: Array<Omit<StockMovement, 'id'>> = [];
      const allocationsByItem: Record<
        string,
        { warehouseId: string; batchNo?: string; batchAllocations: OrderBatchAllocation[] }
      > = {};

      for (const t of targets) {
        const lvlMap = levelsByVariant.get(t.variant.id)!;
        const batMap = batchesByVariant.get(t.variant.id)!;

        let levels = Array.from(lvlMap.values()).filter((l) => activeWhIds.has(l.warehouseId));
        if (levels.length === 0) {
          const fallbackId = `${defaultWh.id}__${t.variant.id}`;
          const fallbackLvl: StockLevel = {
            id: fallbackId,
            productId: t.product.id,
            variantId: t.variant.id,
            sku: t.variant.sku,
            warehouseId: defaultWh.id,
            warehouseCode: defaultWh.code,
            onHand: Math.max(0, t.variant.stockOnHand),
            reserved: Math.max(0, t.variant.reserved),
            lowStockThreshold: t.variant.lowStockThreshold ?? 5,
            updatedAt: nowIso,
          };
          lvlMap.set(fallbackId, fallbackLvl);
          levels = [fallbackLvl];
        }

        const whAvailMap = new Map<string, number>();
        for (const l of levels) {
          whAvailMap.set(l.warehouseId, Math.max(0, l.onHand - l.reserved));
        }

        const candidateBatches = Array.from(batMap.values())
          .filter(
            (b) =>
              b.condition !== 'damaged' &&
              activeWhIds.has(b.warehouseId) &&
              b.qty - (b.reserved || 0) > 0
          )
          .sort((a, b) => {
            const diff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            if (diff !== 0) return diff;
            if (a.warehouseId === defaultWh.id && b.warehouseId !== defaultWh.id) return -1;
            if (b.warehouseId === defaultWh.id && a.warehouseId !== defaultWh.id) return 1;
            return 0;
          });

        let remaining = t.qty;
        const batchAllocations: OrderBatchAllocation[] = [];

        for (const batch of candidateBatches) {
          if (remaining <= 0) break;
          const batchAvail = Math.max(0, batch.qty - (batch.reserved || 0));
          const lvl = lvlMap.get(`${batch.warehouseId}__${t.variant.id}`);
          const whAvail = whAvailMap.get(batch.warehouseId) ?? 0;
          const take = Math.min(remaining, batchAvail, whAvail);
          if (take <= 0 || !lvl) continue;

          batch.reserved = (batch.reserved || 0) + take;
          batch.updatedAt = nowIso;
          lvl.reserved += take;
          lvl.updatedAt = nowIso;
          whAvailMap.set(batch.warehouseId, whAvail - take);
          remaining -= take;
          dirtyLevels.set(lvl.id, lvl);
          dirtyBatches.set(batch.id, batch);

          batchAllocations.push({
            warehouseId: batch.warehouseId,
            warehouseCode: batch.warehouseCode,
            batchId: batch.id,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            qty: take,
          });

          movementsToWrite.push({
            productId: t.product.id,
            productTitleFa: t.product.titleFa,
            variantId: t.variant.id,
            sku: t.variant.sku,
            warehouseId: batch.warehouseId,
            warehouseCode: batch.warehouseCode,
            batchId: batch.id,
            batchNo: batch.batchNo,
            ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
            ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
            delta: -take,
            type: 'reserve',
            reason: ctx?.reason || `رزرو سفارش${ctx?.orderNo ? ` ${ctx.orderNo}` : ''} (FEFO: ${batch.batchNo})`,
            actorEmail: ctx?.actorEmail || 'system',
            createdAt: nowIso,
          });
        }

        if (remaining > 0) {
          const orderedLevels = [...levels].sort((a, b) => {
            if (a.warehouseId === defaultWh.id && b.warehouseId !== defaultWh.id) return -1;
            if (b.warehouseId === defaultWh.id && a.warehouseId !== defaultWh.id) return 1;
            return (whAvailMap.get(b.warehouseId) ?? 0) - (whAvailMap.get(a.warehouseId) ?? 0);
          });
          for (const lvl of orderedLevels) {
            if (remaining <= 0) break;
            const whAvail = whAvailMap.get(lvl.warehouseId) ?? 0;
            const take = Math.min(remaining, whAvail);
            if (take <= 0) continue;

            lvl.reserved += take;
            lvl.updatedAt = nowIso;
            whAvailMap.set(lvl.warehouseId, whAvail - take);
            remaining -= take;
            dirtyLevels.set(lvl.id, lvl);

            const wh = resolveWarehouseFromList(allWarehouses, lvl.warehouseId);
            batchAllocations.push({
              warehouseId: lvl.warehouseId,
              warehouseCode: lvl.warehouseCode || wh.code,
              batchNo: 'UNBATCHED',
              qty: take,
            });

            movementsToWrite.push({
              productId: t.product.id,
              productTitleFa: t.product.titleFa,
              variantId: t.variant.id,
              sku: t.variant.sku,
              warehouseId: lvl.warehouseId,
              warehouseCode: lvl.warehouseCode || wh.code,
              ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
              ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
              delta: -take,
              type: 'reserve',
              reason: ctx?.reason || `رزرو موجودی سفارش${ctx?.orderNo ? ` ${ctx.orderNo}` : ''}`,
              actorEmail: ctx?.actorEmail || 'system',
              createdAt: nowIso,
            });
          }
        }

        const firstBatch = batchAllocations.find((a) => a.batchNo && a.batchNo !== 'UNBATCHED');
        allocationsByItem[t.key] = {
          warehouseId: batchAllocations[0]?.warehouseId ?? defaultWh.id,
          ...(firstBatch ? { batchNo: firstBatch.batchNo } : {}),
          batchAllocations,
        };

        syncVariantAggregatesInMem(t.variant, Array.from(lvlMap.values()), Array.from(batMap.values()));
      }

      // Phase C: Perform all Firestore writes strictly after reads
      for (const lvl of dirtyLevels.values()) {
        await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      }
      for (const bat of dirtyBatches.values()) {
        await setDoc(db.collection('stockBatches').doc(bat.id), bat as unknown as Record<string, unknown>, true);
      }
      for (const mv of movementsToWrite) {
        await queueMovementWrite(mv);
      }
      for (const { ref, product } of productsMap.values()) {
        await setDoc(ref, { ...product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);
      }

      notifyCatalogChanged();
      return { ok: true, allocationsByItem };
    },

    async commitItems(items: StockItemDelta[], ctx?: StockMovementContext) {
      const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId)));
      const uniqueVariantIds = Array.from(new Set(items.map((i) => i.variantId)));
      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        uniqueProductIds,
        uniqueVariantIds
      );
      const defaultWh = resolveWarehouseFromList(allWarehouses);
      const nowIso = new Date().toISOString();

      const dirtyLevels = new Map<string, StockLevel>();
      const dirtyBatches = new Map<string, StockBatchRecord>();
      const movementsToWrite: Array<Omit<StockMovement, 'id'>> = [];

      for (const item of items) {
        const entry = productsMap.get(item.productId);
        const variant = entry?.product.variants.find((v) => v.id === item.variantId);
        if (!entry || !variant) continue;

        const lvlMap = levelsByVariant.get(variant.id)!;
        const batMap = batchesByVariant.get(variant.id)!;

        if (item.batchAllocations && item.batchAllocations.length > 0) {
          for (const alloc of item.batchAllocations) {
            const lvl = lvlMap.get(`${alloc.warehouseId}__${variant.id}`);
            if (lvl) {
              lvl.reserved = Math.max(0, lvl.reserved - Math.min(lvl.reserved, alloc.qty));
              lvl.onHand = Math.max(0, lvl.onHand - alloc.qty);
              lvl.updatedAt = nowIso;
              dirtyLevels.set(lvl.id, lvl);
            }
            const b =
              (alloc.batchId ? batMap.get(alloc.batchId) : undefined) ??
              Array.from(batMap.values()).find(
                (rec) => rec.warehouseId === alloc.warehouseId && rec.batchNo === alloc.batchNo
              );
            if (b) {
              b.reserved = Math.max(0, (b.reserved || 0) - Math.min(b.reserved || 0, alloc.qty));
              b.qty = Math.max(0, b.qty - alloc.qty);
              b.updatedAt = nowIso;
              dirtyBatches.set(b.id, b);
            }
            movementsToWrite.push({
              productId: entry.product.id,
              productTitleFa: entry.product.titleFa,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: alloc.warehouseId,
              warehouseCode: alloc.warehouseCode || resolveWarehouseFromList(allWarehouses, alloc.warehouseId).code,
              ...(alloc.batchId ? { batchId: alloc.batchId } : {}),
              ...(alloc.batchNo && alloc.batchNo !== 'UNBATCHED' ? { batchNo: alloc.batchNo } : {}),
              ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
              ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
              delta: -alloc.qty,
              type: 'commit',
              reason: ctx?.reason || `قطعی‌شدن خروج بابت پرداخت سفارش${ctx?.orderNo ? ` ${ctx.orderNo}` : ''}`,
              actorEmail: ctx?.actorEmail || 'gateway',
              createdAt: nowIso,
            });
          }
        } else {
          const levels = Array.from(lvlMap.values()).sort((a, b) =>
            a.warehouseId === defaultWh.id ? -1 : b.warehouseId === defaultWh.id ? 1 : b.reserved - a.reserved
          );
          if (levels.length === 0) {
            const releaseReserved = Math.min(variant.reserved, item.quantity);
            variant.reserved = Math.max(0, variant.reserved - releaseReserved);
            variant.stockOnHand = Math.max(0, variant.stockOnHand - item.quantity);
          } else {
            let rem = item.quantity;
            for (const lvl of levels) {
              if (rem <= 0) break;
              const take = Math.min(rem, Math.max(lvl.reserved, lvl.onHand));
              if (take <= 0) continue;
              lvl.reserved = Math.max(0, lvl.reserved - Math.min(lvl.reserved, take));
              lvl.onHand = Math.max(0, lvl.onHand - take);
              lvl.updatedAt = nowIso;
              dirtyLevels.set(lvl.id, lvl);
              rem -= take;
              movementsToWrite.push({
                productId: entry.product.id,
                productTitleFa: entry.product.titleFa,
                variantId: variant.id,
                sku: variant.sku,
                warehouseId: lvl.warehouseId,
                warehouseCode: lvl.warehouseCode || defaultWh.code,
                ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
                ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
                delta: -take,
                type: 'commit',
                reason: ctx?.reason || `خروج قطعی سفارش${ctx?.orderNo ? ` ${ctx.orderNo}` : ''}`,
                actorEmail: ctx?.actorEmail || 'gateway',
                createdAt: nowIso,
              });
            }
          }
        }

        entry.product.soldCount = (entry.product.soldCount || 0) + item.quantity;
        syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));
      }

      for (const lvl of dirtyLevels.values()) {
        await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      }
      for (const bat of dirtyBatches.values()) {
        await setDoc(db.collection('stockBatches').doc(bat.id), bat as unknown as Record<string, unknown>, true);
      }
      for (const mv of movementsToWrite) {
        await queueMovementWrite(mv);
      }
      for (const { ref, product } of productsMap.values()) {
        await setDoc(ref, { ...product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);
      }
      notifyCatalogChanged();
    },

    async releaseItems(items: StockItemDelta[], ctx?: StockMovementContext) {
      const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId)));
      const uniqueVariantIds = Array.from(new Set(items.map((i) => i.variantId)));
      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        uniqueProductIds,
        uniqueVariantIds
      );
      const defaultWh = resolveWarehouseFromList(allWarehouses);
      const nowIso = new Date().toISOString();

      const dirtyLevels = new Map<string, StockLevel>();
      const dirtyBatches = new Map<string, StockBatchRecord>();
      const movementsToWrite: Array<Omit<StockMovement, 'id'>> = [];

      for (const item of items) {
        const entry = productsMap.get(item.productId);
        const variant = entry?.product.variants.find((v) => v.id === item.variantId);
        if (!entry || !variant) continue;

        const lvlMap = levelsByVariant.get(variant.id)!;
        const batMap = batchesByVariant.get(variant.id)!;

        if (item.batchAllocations && item.batchAllocations.length > 0) {
          for (const alloc of item.batchAllocations) {
            const lvl = lvlMap.get(`${alloc.warehouseId}__${variant.id}`);
            if (lvl) {
              lvl.reserved = Math.max(0, lvl.reserved - alloc.qty);
              lvl.updatedAt = nowIso;
              dirtyLevels.set(lvl.id, lvl);
            }
            const b =
              (alloc.batchId ? batMap.get(alloc.batchId) : undefined) ??
              Array.from(batMap.values()).find(
                (rec) => rec.warehouseId === alloc.warehouseId && rec.batchNo === alloc.batchNo
              );
            if (b) {
              b.reserved = Math.max(0, (b.reserved || 0) - alloc.qty);
              b.updatedAt = nowIso;
              dirtyBatches.set(b.id, b);
            }
            movementsToWrite.push({
              productId: entry.product.id,
              productTitleFa: entry.product.titleFa,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: alloc.warehouseId,
              warehouseCode: alloc.warehouseCode || resolveWarehouseFromList(allWarehouses, alloc.warehouseId).code,
              ...(alloc.batchId ? { batchId: alloc.batchId } : {}),
              ...(alloc.batchNo && alloc.batchNo !== 'UNBATCHED' ? { batchNo: alloc.batchNo } : {}),
              ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
              ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
              delta: alloc.qty,
              type: 'release',
              reason: ctx?.reason || `آزادسازی موجودی رزروشده${ctx?.orderNo ? ` ${ctx.orderNo}` : ''}`,
              actorEmail: ctx?.actorEmail || 'system',
              createdAt: nowIso,
            });
          }
        } else {
          const levels = Array.from(lvlMap.values())
            .filter((l) => l.reserved > 0)
            .sort((a, b) => (a.warehouseId === defaultWh.id ? -1 : b.warehouseId === defaultWh.id ? 1 : b.reserved - a.reserved));
          if (levels.length === 0) {
            variant.reserved = Math.max(0, variant.reserved - item.quantity);
          } else {
            let rem = item.quantity;
            for (const lvl of levels) {
              if (rem <= 0) break;
              const rel = Math.min(rem, lvl.reserved);
              lvl.reserved = Math.max(0, lvl.reserved - rel);
              lvl.updatedAt = nowIso;
              dirtyLevels.set(lvl.id, lvl);
              rem -= rel;
              movementsToWrite.push({
                productId: entry.product.id,
                productTitleFa: entry.product.titleFa,
                variantId: variant.id,
                sku: variant.sku,
                warehouseId: lvl.warehouseId,
                warehouseCode: lvl.warehouseCode || defaultWh.code,
                ...(ctx?.orderId ? { orderId: ctx.orderId } : {}),
                ...(ctx?.orderNo ? { orderNo: ctx.orderNo } : {}),
                delta: rel,
                type: 'release',
                reason: ctx?.reason || `آزادسازی رزرو سفارش${ctx?.orderNo ? ` ${ctx.orderNo}` : ''}`,
                actorEmail: ctx?.actorEmail || 'system',
                createdAt: nowIso,
              });
            }
          }
        }

        syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));
      }

      for (const lvl of dirtyLevels.values()) {
        await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      }
      for (const bat of dirtyBatches.values()) {
        await setDoc(db.collection('stockBatches').doc(bat.id), bat as unknown as Record<string, unknown>, true);
      }
      for (const mv of movementsToWrite) {
        await queueMovementWrite(mv);
      }
      for (const { ref, product } of productsMap.values()) {
        await setDoc(ref, { ...product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);
      }
      notifyCatalogChanged();
    },

    async incrementCouponUsage(couponCode: string) {
      const clean = couponCode.trim().toUpperCase();
      if (!clean) return;
      const tx = currentTx();
      const q = db.collection('coupons').where('code', '==', clean).limit(1);
      const snap = tx ? await tx.get(q) : await q.get();
      if (!snap.empty) {
        const docRef = snap.docs[0].ref;
        const curr = Number(snap.docs[0].data()?.usageCount || 0);
        if (tx) tx.update(docRef, { usageCount: curr + 1 });
        else await docRef.update({ usageCount: curr + 1 });
      }
    },

    async adjustStock(params: StockAdjustParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) return { ok: false, status: 400, message: 'ثبت علت تعدیل موجودی الزامی است.' };
      if (!Number.isInteger(params.delta) || params.delta === 0) {
        return { ok: false, status: 400, message: 'مقدار تغییر موجودی باید عدد صحیح غیرصفر باشد.' };
      }

      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        [params.productId],
        [params.variantId]
      );
      const entry = productsMap.get(params.productId);
      const variant = entry?.product.variants.find((v) => v.id === params.variantId);
      if (!entry || !variant) return { ok: false, status: 404, message: 'کالا یا تنوع مورد نظر یافت نشد.' };

      const wh = resolveWarehouseFromList(allWarehouses, params.warehouseId, params.warehouseCode);
      if (!wh.isActive) return { ok: false, status: 400, message: 'انبار انتخاب‌شده فعال نیست.' };

      const nowIso = new Date().toISOString();
      const lvlMap = levelsByVariant.get(variant.id)!;
      const batMap = batchesByVariant.get(variant.id)!;
      const levelId = `${wh.id}__${variant.id}`;
      let lvl = lvlMap.get(levelId);
      if (!lvl) {
        lvl = {
          id: levelId,
          productId: entry.product.id,
          variantId: variant.id,
          sku: variant.sku,
          warehouseId: wh.id,
          warehouseCode: wh.code,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: variant.lowStockThreshold ?? 5,
          updatedAt: nowIso,
        };
        lvlMap.set(levelId, lvl);
      }

      const nextOnHand = lvl.onHand + params.delta;
      if (nextOnHand < lvl.reserved) {
        return {
          ok: false,
          status: 400,
          message: `مقدار موجودی (${nextOnHand}) نمی‌تواند کمتر از موجودی رزروشده (${lvl.reserved}) باشد.`,
        };
      }

      let touchedBatch: StockBatchRecord | undefined;
      const cleanBatchNo = params.batchNo?.trim();
      const dirtyBatches: StockBatchRecord[] = [];

      if (cleanBatchNo) {
        const existing = Array.from(batMap.values()).find(
          (b) => b.warehouseId === wh.id && b.batchNo === cleanBatchNo && b.condition !== 'damaged'
        );
        if (params.delta > 0) {
          if (existing) {
            existing.qty += params.delta;
            if (params.expiryDate) existing.expiryDate = params.expiryDate;
            if (typeof params.specialPrice === 'number') existing.specialPrice = params.specialPrice;
            if (typeof params.unitCost === 'number') existing.unitCost = params.unitCost;
            existing.updatedAt = nowIso;
            touchedBatch = existing;
            dirtyBatches.push(existing);
          } else {
            const batchId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            const rec: StockBatchRecord = {
              id: batchId,
              productId: entry.product.id,
              variantId: variant.id,
              warehouseId: wh.id,
              warehouseCode: wh.code,
              batchNo: cleanBatchNo,
              expiryDate: params.expiryDate || new Date(Date.now() + 365 * 86400_000).toISOString(),
              qty: params.delta,
              reserved: 0,
              ...(typeof params.unitCost === 'number' ? { unitCost: params.unitCost } : {}),
              specialPrice: params.specialPrice ?? null,
              condition: 'resellable',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            batMap.set(batchId, rec);
            touchedBatch = rec;
            dirtyBatches.push(rec);
          }
        } else if (existing) {
          const avail = Math.max(0, existing.qty - (existing.reserved || 0));
          if (Math.abs(params.delta) > avail) {
            return { ok: false, status: 400, message: `موجودی آزاد بچ ${cleanBatchNo} کافی نیست.` };
          }
          existing.qty += params.delta;
          existing.updatedAt = nowIso;
          touchedBatch = existing;
          dirtyBatches.push(existing);
        }
      } else if (params.delta < 0) {
        let toDeduct = Math.abs(params.delta);
        const whBatches = Array.from(batMap.values())
          .filter((b) => b.warehouseId === wh.id && b.condition !== 'damaged' && b.qty > b.reserved)
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
        for (const b of whBatches) {
          if (toDeduct <= 0) break;
          const avail = Math.max(0, b.qty - (b.reserved || 0));
          const cut = Math.min(toDeduct, avail);
          b.qty -= cut;
          b.updatedAt = nowIso;
          toDeduct -= cut;
          dirtyBatches.push(b);
        }
      }

      lvl.onHand = nextOnHand;
      lvl.updatedAt = nowIso;
      syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));

      await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      for (const b of dirtyBatches) {
        await setDoc(db.collection('stockBatches').doc(b.id), b as unknown as Record<string, unknown>, true);
      }
      await setDoc(entry.ref, { ...entry.product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);

      const movement = await queueMovementWrite({
        productId: entry.product.id,
        productTitleFa: entry.product.titleFa,
        variantId: variant.id,
        sku: variant.sku,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        ...(touchedBatch ? { batchId: touchedBatch.id, batchNo: touchedBatch.batchNo } : cleanBatchNo ? { batchNo: cleanBatchNo } : {}),
        delta: params.delta,
        type: params.type,
        reason: cleanReason,
        actorEmail: params.actorEmail,
        createdAt: nowIso,
      });

      notifyCatalogChanged();
      return { ok: true, stockLevel: lvl, ...(touchedBatch ? { batch: touchedBatch } : {}), movement };
    },

    async stocktakeStock(params: StocktakeParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) return { ok: false, status: 400, message: 'ثبت علت انبارگردانی الزامی است.' };
      if (!Number.isInteger(params.onHand) || params.onHand < 0) {
        return { ok: false, status: 400, message: 'مقدار شمارش باید عدد صحیح نامنفی باشد.' };
      }

      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        [params.productId],
        [params.variantId]
      );
      const entry = productsMap.get(params.productId);
      const variant = entry?.product.variants.find((v) => v.id === params.variantId);
      if (!entry || !variant) return { ok: false, status: 404, message: 'کالا یا تنوع یافت نشد.' };

      const wh = resolveWarehouseFromList(allWarehouses, params.warehouseId, params.warehouseCode);
      const nowIso = new Date().toISOString();
      const lvlMap = levelsByVariant.get(variant.id)!;
      const batMap = batchesByVariant.get(variant.id)!;
      const levelId = `${wh.id}__${variant.id}`;
      let lvl = lvlMap.get(levelId);
      if (!lvl) {
        lvl = {
          id: levelId,
          productId: entry.product.id,
          variantId: variant.id,
          sku: variant.sku,
          warehouseId: wh.id,
          warehouseCode: wh.code,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: variant.lowStockThreshold ?? 5,
          updatedAt: nowIso,
        };
        lvlMap.set(levelId, lvl);
      }

      if (params.onHand < lvl.reserved) {
        return {
          ok: false,
          status: 400,
          message: `موجودی شمارش‌شده (${params.onHand}) نمی‌تواند کمتر از تعداد رزروشده (${lvl.reserved}) باشد.`,
        };
      }

      const delta = params.onHand - lvl.onHand;
      lvl.onHand = params.onHand;
      lvl.updatedAt = nowIso;

      const dirtyBatches: StockBatchRecord[] = [];
      const whBatches = Array.from(batMap.values())
        .filter((b) => b.warehouseId === wh.id && b.condition !== 'damaged')
        .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());
      let totalBatchQty = whBatches.reduce((s, b) => s + b.qty, 0);
      if (totalBatchQty > params.onHand) {
        let excess = totalBatchQty - params.onHand;
        for (const b of whBatches) {
          if (excess <= 0) break;
          const trimmable = Math.max(0, b.qty - (b.reserved || 0));
          const cut = Math.min(excess, trimmable);
          if (cut > 0) {
            b.qty -= cut;
            b.updatedAt = nowIso;
            excess -= cut;
            totalBatchQty -= cut;
            dirtyBatches.push(b);
          }
        }
      }

      syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));

      await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      for (const b of dirtyBatches) {
        await setDoc(db.collection('stockBatches').doc(b.id), b as unknown as Record<string, unknown>, true);
      }
      await setDoc(entry.ref, { ...entry.product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);

      const movement = await queueMovementWrite({
        productId: entry.product.id,
        productTitleFa: entry.product.titleFa,
        variantId: variant.id,
        sku: variant.sku,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        delta,
        type: 'stocktake',
        reason: cleanReason,
        actorEmail: params.actorEmail,
        createdAt: nowIso,
      });

      notifyCatalogChanged();
      return { ok: true, stockLevel: lvl, movement };
    },

    async transferStock(params: StockTransferParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) return { ok: false, status: 400, message: 'ذکر علت انتقال بین انبارها الزامی است.' };
      if (params.fromWarehouseId === params.toWarehouseId) {
        return { ok: false, status: 400, message: 'انبار مبدا و مقصد نمی‌توانند یکسان باشند.' };
      }
      if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
        return { ok: false, status: 400, message: 'تعداد انتقال باید عدد صحیح مثبت باشد.' };
      }

      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        [params.productId],
        [params.variantId]
      );
      const entry = productsMap.get(params.productId);
      const variant = entry?.product.variants.find((v) => v.id === params.variantId);
      if (!entry || !variant) return { ok: false, status: 404, message: 'کالا یا تنوع مورد نظر یافت نشد.' };

      const fromWh = allWarehouses.find((w) => w.id === params.fromWarehouseId && w.isActive);
      const toWh = allWarehouses.find((w) => w.id === params.toWarehouseId && w.isActive);
      if (!fromWh || !toWh) return { ok: false, status: 404, message: 'انبار مبدا یا مقصد معتبر/فعال نیست.' };

      const nowIso = new Date().toISOString();
      const lvlMap = levelsByVariant.get(variant.id)!;
      const batMap = batchesByVariant.get(variant.id)!;

      const fromLvl = lvlMap.get(`${fromWh.id}__${variant.id}`);
      const avail = fromLvl ? Math.max(0, fromLvl.onHand - fromLvl.reserved) : 0;
      if (!fromLvl || params.quantity > avail) {
        return {
          ok: false,
          status: 400,
          message: `موجودی قابل انتقال در «${fromWh.nameFa}» کافی نیست (قابل انتقال: ${avail}، رزروشده: ${fromLvl?.reserved ?? 0}).`,
        };
      }

      const toLevelId = `${toWh.id}__${variant.id}`;
      let toLvl = lvlMap.get(toLevelId);
      if (!toLvl) {
        toLvl = {
          id: toLevelId,
          productId: entry.product.id,
          variantId: variant.id,
          sku: variant.sku,
          warehouseId: toWh.id,
          warehouseCode: toWh.code,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: variant.lowStockThreshold ?? 5,
          updatedAt: nowIso,
        };
        lvlMap.set(toLevelId, toLvl);
      }

      fromLvl.onHand -= params.quantity;
      fromLvl.updatedAt = nowIso;
      toLvl.onHand += params.quantity;
      toLvl.updatedAt = nowIso;

      let rem = params.quantity;
      const cleanBatch = params.batchNo?.trim();
      const dirtyBatches: StockBatchRecord[] = [];
      const srcBatches = Array.from(batMap.values())
        .filter(
          (b) =>
            b.warehouseId === fromWh.id &&
            b.condition !== 'damaged' &&
            b.qty - (b.reserved || 0) > 0 &&
            (!cleanBatch || b.batchNo === cleanBatch)
        )
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

      for (const b of srcBatches) {
        if (rem <= 0) break;
        const bAvail = Math.max(0, b.qty - (b.reserved || 0));
        const moveQty = Math.min(rem, bAvail);
        if (moveQty <= 0) continue;

        b.qty -= moveQty;
        b.updatedAt = nowIso;
        rem -= moveQty;
        dirtyBatches.push(b);

        const destBatch = Array.from(batMap.values()).find(
          (dbRec) => dbRec.warehouseId === toWh.id && dbRec.batchNo === b.batchNo && dbRec.condition === b.condition
        );
        if (destBatch) {
          destBatch.qty += moveQty;
          destBatch.updatedAt = nowIso;
          dirtyBatches.push(destBatch);
        } else {
          const newId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          const created: StockBatchRecord = {
            id: newId,
            productId: entry.product.id,
            variantId: variant.id,
            warehouseId: toWh.id,
            warehouseCode: toWh.code,
            batchNo: b.batchNo,
            expiryDate: b.expiryDate,
            qty: moveQty,
            reserved: 0,
            ...(typeof b.unitCost === 'number' ? { unitCost: b.unitCost } : {}),
            specialPrice: b.specialPrice ?? null,
            condition: b.condition,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          batMap.set(newId, created);
          dirtyBatches.push(created);
        }
      }

      syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));

      await setDoc(db.collection('stockLevels').doc(fromLvl.id), fromLvl as unknown as Record<string, unknown>, true);
      await setDoc(db.collection('stockLevels').doc(toLvl.id), toLvl as unknown as Record<string, unknown>, true);
      for (const b of dirtyBatches) {
        await setDoc(db.collection('stockBatches').doc(b.id), b as unknown as Record<string, unknown>, true);
      }
      await setDoc(entry.ref, { ...entry.product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);

      const movement = await queueMovementWrite({
        productId: entry.product.id,
        productTitleFa: entry.product.titleFa,
        variantId: variant.id,
        sku: variant.sku,
        warehouseId: fromWh.id,
        warehouseCode: fromWh.code,
        toWarehouseId: toWh.id,
        toWarehouseCode: toWh.code,
        ...(cleanBatch ? { batchNo: cleanBatch } : {}),
        delta: params.quantity,
        type: 'transfer',
        reason: cleanReason,
        actorEmail: params.actorEmail,
        createdAt: nowIso,
      });

      return { ok: true, fromLevel: fromLvl, toLevel: toLvl, movement };
    },

    async setBatchSpecialPrice({ productId, variantId, batchId, specialPrice }) {
      const { productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        [productId],
        [variantId]
      );
      const entry = productsMap.get(productId);
      const variant = entry?.product.variants.find((v) => v.id === variantId);
      if (!entry || !variant) return { ok: false, status: 404, message: 'کالا یا تنوع یافت نشد.' };

      const batMap = batchesByVariant.get(variantId)!;
      const lvlMap = levelsByVariant.get(variantId)!;
      const batch = batMap.get(batchId);
      if (!batch || batch.variantId !== variantId) {
        return { ok: false, status: 404, message: 'سری ساخت (Batch) مورد نظر یافت نشد.' };
      }

      const nowIso = new Date().toISOString();
      batch.specialPrice = specialPrice;
      batch.updatedAt = nowIso;
      syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));

      await setDoc(db.collection('stockBatches').doc(batch.id), batch as unknown as Record<string, unknown>, true);
      await setDoc(entry.ref, { ...entry.product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);
      notifyCatalogChanged();
      return { ok: true, batch };
    },

    async restockReturnItems(params) {
      const orderRef = db.collection('orders').doc(params.returnRequest.orderId);
      const orderSnap = await txGet(orderRef);
      const order = orderSnap.exists ? (orderSnap.data() as Order) : null;

      const productIds = Array.from(new Set(params.returnRequest.items.map((i) => i.productId)));
      const variantIds = Array.from(new Set(params.returnRequest.items.map((i) => i.variantId)));
      const { allWarehouses, productsMap, levelsByVariant, batchesByVariant } = await loadProductAndVariantStock(
        productIds,
        variantIds
      );
      const wh = resolveWarehouseFromList(allWarehouses, params.warehouseId);
      if (!wh || !wh.isActive) {
        return { ok: false, status: 400, message: 'انبار مقصد مرجوعی معتبر نیست.' };
      }

      const nowIso = new Date().toISOString();
      const dirtyLevels = new Map<string, StockLevel>();
      const dirtyBatches: StockBatchRecord[] = [];
      const movementsToWrite: Array<Omit<StockMovement, 'id'>> = [];

      for (const retItem of params.returnRequest.items) {
        const entry = productsMap.get(retItem.productId);
        const variant = entry?.product.variants.find((v) => v.id === retItem.variantId);
        if (!entry || !variant) continue;

        const lvlMap = levelsByVariant.get(variant.id)!;
        const batMap = batchesByVariant.get(variant.id)!;
        const orderItem = order?.items.find((it) => it.variantId === retItem.variantId);
        const batchNo =
          params.batchNo?.trim() ||
          retItem.batchNo?.trim() ||
          orderItem?.batchNo ||
          `RMA-${params.returnRequest.returnNo}`;

        if (params.condition === 'resellable') {
          const levelId = `${wh.id}__${variant.id}`;
          let lvl = lvlMap.get(levelId);
          if (!lvl) {
            lvl = {
              id: levelId,
              productId: entry.product.id,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: wh.id,
              warehouseCode: wh.code,
              onHand: 0,
              reserved: 0,
              lowStockThreshold: variant.lowStockThreshold ?? 5,
              updatedAt: nowIso,
            };
            lvlMap.set(levelId, lvl);
          }
          lvl.onHand += retItem.quantity;
          lvl.updatedAt = nowIso;
          dirtyLevels.set(lvl.id, lvl);

          const existingBatch = Array.from(batMap.values()).find(
            (b) => b.warehouseId === wh.id && b.batchNo === batchNo && b.condition === 'resellable'
          );
          let batchId = existingBatch?.id;
          if (existingBatch) {
            existingBatch.qty += retItem.quantity;
            existingBatch.updatedAt = nowIso;
            dirtyBatches.push(existingBatch);
          } else {
            batchId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            const created: StockBatchRecord = {
              id: batchId,
              productId: entry.product.id,
              variantId: variant.id,
              warehouseId: wh.id,
              warehouseCode: wh.code,
              batchNo,
              expiryDate: params.expiryDate || new Date(Date.now() + 365 * 86400_000).toISOString(),
              qty: retItem.quantity,
              reserved: 0,
              specialPrice: null,
              condition: 'resellable',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            batMap.set(batchId, created);
            dirtyBatches.push(created);
          }

          syncVariantAggregatesInMem(variant, Array.from(lvlMap.values()), Array.from(batMap.values()));
          movementsToWrite.push({
            productId: entry.product.id,
            productTitleFa: entry.product.titleFa,
            variantId: variant.id,
            sku: variant.sku,
            warehouseId: wh.id,
            warehouseCode: wh.code,
            batchId,
            batchNo,
            orderId: params.returnRequest.orderId,
            orderNo: params.returnRequest.orderNo,
            returnId: params.returnRequest.id,
            condition: 'resellable',
            delta: retItem.quantity,
            type: 'return',
            reason: `بازگشت سالم کالا به انبار (${params.returnRequest.returnNo})`,
            actorEmail: params.actorEmail,
            createdAt: nowIso,
          });
        } else {
          const dmgBatchId = `bat_dmg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          const dmgBatch: StockBatchRecord = {
            id: dmgBatchId,
            productId: entry.product.id,
            variantId: variant.id,
            warehouseId: wh.id,
            warehouseCode: wh.code,
            batchNo: `${batchNo}-DMG`,
            expiryDate: params.expiryDate || new Date(Date.now() + 365 * 86400_000).toISOString(),
            qty: retItem.quantity,
            reserved: 0,
            specialPrice: null,
            condition: 'damaged',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          batMap.set(dmgBatchId, dmgBatch);
          dirtyBatches.push(dmgBatch);

          movementsToWrite.push({
            productId: entry.product.id,
            productTitleFa: entry.product.titleFa,
            variantId: variant.id,
            sku: variant.sku,
            warehouseId: wh.id,
            warehouseCode: wh.code,
            batchId: dmgBatchId,
            batchNo: `${batchNo}-DMG`,
            orderId: params.returnRequest.orderId,
            orderNo: params.returnRequest.orderNo,
            returnId: params.returnRequest.id,
            condition: 'damaged',
            delta: 0,
            type: 'return',
            reason: `مرجوعی آسیب‌دیده / قرنطینه ضایعات (${params.returnRequest.returnNo})`,
            actorEmail: params.actorEmail,
            createdAt: nowIso,
          });
        }
      }

      for (const lvl of dirtyLevels.values()) {
        await setDoc(db.collection('stockLevels').doc(lvl.id), lvl as unknown as Record<string, unknown>, true);
      }
      for (const b of dirtyBatches) {
        await setDoc(db.collection('stockBatches').doc(b.id), b as unknown as Record<string, unknown>, true);
      }
      for (const { ref, product } of productsMap.values()) {
        await setDoc(ref, { ...product, updatedAt: nowIso } as unknown as Record<string, unknown>, true);
      }
      const writtenMovements: StockMovement[] = [];
      for (const mv of movementsToWrite) {
        writtenMovements.push(await queueMovementWrite(mv));
      }

      return { ok: true, movements: writtenMovements, warehouseId: wh.id };
    },

    async listWarehouses() {
      return loadAllWarehouses();
    },

    async saveWarehouse(warehouse: Warehouse) {
      await setDoc(
        db.collection('warehouses').doc(warehouse.id),
        warehouse as unknown as Record<string, unknown>,
        true
      );
      return warehouse;
    },

    async deleteWarehouse(warehouseId: string) {
      await db.collection('warehouses').doc(warehouseId).delete();
      return true;
    },

    async listStockLevels(filter) {
      let query: FirebaseFirestore.Query = db.collection('stockLevels');
      if (filter?.warehouseId) query = query.where('warehouseId', '==', filter.warehouseId);
      if (filter?.variantId) query = query.where('variantId', '==', filter.variantId);
      const snap = await query.get();
      let levels = snap.docs.map((d) => d.data() as StockLevel);
      if (filter?.productId) levels = levels.filter((l) => l.productId === filter.productId);
      return levels;
    },

    async listBatches(filter) {
      let query: FirebaseFirestore.Query = db.collection('stockBatches');
      if (filter?.warehouseId) query = query.where('warehouseId', '==', filter.warehouseId);
      if (filter?.variantId) query = query.where('variantId', '==', filter.variantId);
      const snap = await query.get();
      let batches = snap.docs.map((d) => d.data() as StockBatchRecord);
      if (filter?.productId) batches = batches.filter((b) => b.productId === filter.productId);
      return batches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    },

    async listMovements(limit = 200) {
      const snap = await db.collection('stockMovements').orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as StockMovement);
    },
  };

  const returns: ReturnRepository = {
    async getById(id) {
      const ref = db.collection('returns').doc(id);
      const tx = currentTx();
      const snap = tx ? await tx.get(ref) : await ref.get();
      return snap.exists ? (snap.data() as ReturnRequest) : null;
    },
    async list(filter) {
      let q: FirebaseFirestore.Query = db.collection('returns');
      if (filter?.userId) q = q.where('userId', '==', filter.userId);
      if (filter?.status) q = q.where('status', '==', filter.status);
      const snap = await q.get();
      return snap.docs
        .map((d) => d.data() as ReturnRequest)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    async save(ret) {
      await setDoc(db.collection('returns').doc(ret.id), ret as unknown as Record<string, unknown>, true);
    },
  };

  const catalog: CatalogRepository = {
    async getSnapshot(): Promise<ServerCatalogSnapshot> {
      const [productsSnap, couponsSnap, warehousesSnap, levelsSnap, batchesSnap] = await Promise.all([
        db.collection('products').get(),
        db.collection('coupons').get(),
        db.collection('warehouses').get(),
        db.collection('stockLevels').get(),
        db.collection('stockBatches').get(),
      ]);
      const base = fallbackStore.data.catalogState;
      return {
        ...base,
        products: productsSnap.empty ? base.products : productsSnap.docs.map((d) => d.data() as Product),
        coupons: couponsSnap.empty
          ? base.coupons
          : couponsSnap.docs.map((d) => d.data() as ServerCatalogSnapshot['coupons'][number]),
        warehouses: warehousesSnap.empty
          ? fallbackStore.data.warehouses
          : warehousesSnap.docs.map((d) => d.data() as Warehouse),
        stockLevels: levelsSnap.empty
          ? Object.values(fallbackStore.data.stockLevels)
          : levelsSnap.docs.map((d) => d.data() as StockLevel),
        stockBatches: batchesSnap.empty
          ? Object.values(fallbackStore.data.stockBatches)
          : batchesSnap.docs.map((d) => d.data() as StockBatchRecord),
      };
    },
    async getUserGroupAndProfile({ uid, mobile }) {
      const cleanUid = uid?.trim();
      const cleanMobile = mobile ? normalizeMobile(mobile) : '';

      if (cleanUid) {
        const userSnap = await db.collection('users').doc(cleanUid).get();
        if (userSnap.exists) {
          const data = userSnap.data() as {
            customerGroup?: CustomerGroupCode;
            b2bStatus?: ServerUserGroupRecord['b2bStatus'];
            displayName?: string;
          };
          const b2bStatus = data.b2bStatus ?? 'none';
          const grp: CustomerGroupCode = b2bStatus === 'approved' && data.customerGroup ? data.customerGroup : 'retail';
          return { customerGroup: grp, b2bStatus, displayName: data.displayName };
        }
      }

      if (cleanMobile) {
        const mobileSnap = await db.collection('users').where('mobile', '==', cleanMobile).limit(1).get();
        if (!mobileSnap.empty) {
          const data = mobileSnap.docs[0].data() as {
            customerGroup?: CustomerGroupCode;
            b2bStatus?: ServerUserGroupRecord['b2bStatus'];
            displayName?: string;
          };
          const b2bStatus = data.b2bStatus ?? 'none';
          const grp: CustomerGroupCode = b2bStatus === 'approved' && data.customerGroup ? data.customerGroup : 'retail';
          return { customerGroup: grp, b2bStatus, displayName: data.displayName };
        }
      }

      return { customerGroup: 'retail', b2bStatus: 'none' };
    },
    async setUserGroup(record) {
      if (record.uid) {
        await db.collection('users').doc(record.uid).set(
          stripUndefinedDeep({
            customerGroup: record.customerGroup,
            b2bStatus: record.b2bStatus,
            mobile: record.mobile ? normalizeMobile(record.mobile) : undefined,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      }
    },
    async saveCatalogCollections(patch: CatalogSnapshotPatch) {
      const updatedAt = patch.updatedAt ?? new Date().toISOString();
      if (patch.categories) {
        fallbackStore.data.catalogState.categories = patch.categories;
        for (const cat of patch.categories) {
          await setDoc(db.collection('categories').doc(cat.id), cat as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.brands) {
        fallbackStore.data.catalogState.brands = patch.brands;
        for (const brand of patch.brands) {
          await setDoc(db.collection('brands').doc(brand.id), brand as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.products) {
        fallbackStore.data.catalogState.products = patch.products;
        for (const prod of patch.products) {
          await setDoc(db.collection('products').doc(prod.id), prod as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.campaigns) {
        fallbackStore.data.catalogState.campaigns = patch.campaigns;
        for (const c of patch.campaigns) {
          await setDoc(db.collection('campaigns').doc(c.id), c as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.bundles) {
        fallbackStore.data.catalogState.bundles = patch.bundles;
        for (const b of patch.bundles) {
          await setDoc(db.collection('bundles').doc(b.id), b as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.agents) {
        fallbackStore.data.catalogState.agents = patch.agents;
        for (const a of patch.agents) {
          await setDoc(db.collection('agents').doc(a.id), a as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.blogPosts) {
        fallbackStore.data.catalogState.blogPosts = patch.blogPosts;
        for (const bp of patch.blogPosts) {
          await setDoc(db.collection('blogPosts').doc(bp.id), bp as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.pages) {
        fallbackStore.data.catalogState.pages = patch.pages;
        for (const pg of patch.pages) {
          await setDoc(db.collection('pages').doc(pg.id), pg as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.redirects) {
        fallbackStore.data.catalogState.redirects = patch.redirects;
        for (const redir of patch.redirects) {
          await setDoc(db.collection('redirects').doc(redir.id), redir as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.coupons) {
        fallbackStore.data.catalogState.coupons = patch.coupons;
        for (const cpn of patch.coupons) {
          await setDoc(db.collection('coupons').doc(cpn.id), cpn as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.contractPrices) {
        fallbackStore.data.catalogState.contractPrices = patch.contractPrices;
        for (const cp of patch.contractPrices) {
          await setDoc(db.collection('contractPrices').doc(cp.id), cp as unknown as Record<string, unknown>, false);
        }
      }
      if (patch.settings) {
        fallbackStore.data.catalogState.settings = patch.settings;
        await setDoc(
          db.collection('settings').doc(patch.settings.id || 'site_settings'),
          patch.settings as unknown as Record<string, unknown>,
          true
        );
      }
      fallbackStore.data.catalogState.updatedAt = updatedAt;
      notifyCatalogChanged();
    },
    async incrementRedirectHits(deltas: Record<string, number>) {
      const entries = Object.entries(deltas).filter(([, d]) => Number.isFinite(d) && d > 0);
      if (entries.length === 0) return;
      const batch = db.batch();
      for (const [id, delta] of entries) {
        const inc = Math.floor(delta);
        const target = fallbackStore.data.catalogState.redirects.find((r) => r.id === id);
        if (target) {
          target.hitCount = (target.hitCount || 0) + inc;
        }
        batch.set(
          db.collection('redirects').doc(id),
          { hitCount: FieldValue.increment(inc) },
          { merge: true }
        );
      }
      await batch.commit();
    },
  };

  const proformas: ProformaRepository = {
    async getById(id) {
      const snap = await db.collection('proformas').doc(id).get();
      return snap.exists ? (snap.data() as ProformaInvoice) : null;
    },
    async getByShareToken(shareToken) {
      const snap = await db.collection('proformas').where('shareToken', '==', shareToken).limit(1).get();
      return snap.empty ? null : (snap.docs[0].data() as ProformaInvoice);
    },
    async save(proforma) {
      await db.collection('proformas').doc(proforma.id).set(stripUndefinedDeep(proforma), { merge: true });
    },
    async listByUser(userId) {
      const snap = await db.collection('proformas').where('userId', '==', userId).get();
      return snap.docs.map((d) => d.data() as ProformaInvoice);
    },
    async listAll() {
      const snap = await db.collection('proformas').get();
      return snap.docs.map((d) => d.data() as ProformaInvoice);
    },
  };

  const audit: AuditRepository = {
    async append(record: ServerAuditLogRecord) {
      await setDoc(db.collection('auditLogs').doc(record.id), record as unknown as Record<string, unknown>, false);
    },
    async list(limit = 100) {
      const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as ServerAuditLogRecord);
    },
  };

  // Ephemeral Auth/OTP/Session storage with Firestore TTL (`ttlExpireAt`) + runtime expiry enforcement
  const authSessions: AuthSessionRepository = {
    async getOtpChallenge(mobile) {
      const ref = db.collection('otpChallenges').doc(mobile);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const rec = snap.data() as OtpChallengeRecord;
      if (Date.now() > rec.expiresAt) {
        await ref.delete().catch(() => {});
        return null;
      }
      return rec;
    },
    async setOtpChallenge(mobile, record) {
      await db
        .collection('otpChallenges')
        .doc(mobile)
        .set(stripUndefinedDeep({ ...record, ttlExpireAt: new Date(record.expiresAt) }));
    },
    async deleteOtpChallenge(mobile) {
      await db.collection('otpChallenges').doc(mobile).delete().catch(() => {});
    },
    async getOtpLockout(mobile) {
      const ref = db.collection('otpLockouts').doc(mobile);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const rec = snap.data() as OtpLockoutRecord;
      if (Date.now() >= rec.lockedUntil) {
        await ref.delete().catch(() => {});
        return null;
      }
      return rec;
    },
    async setOtpLockout(mobile, record) {
      await db
        .collection('otpLockouts')
        .doc(mobile)
        .set(stripUndefinedDeep({ ...record, ttlExpireAt: new Date(record.lockedUntil) }));
    },
    async deleteOtpLockout(mobile) {
      await db.collection('otpLockouts').doc(mobile).delete().catch(() => {});
    },
    async getPhoneSendHistory(mobile, cutoffMs) {
      const ref = db.collection('otpPhoneSendHistory').doc(mobile);
      const snap = await ref.get();
      if (!snap.exists) return [];
      const data = snap.data() as { timestamps?: number[] };
      return Array.isArray(data.timestamps) ? data.timestamps.filter((ts) => ts > cutoffMs) : [];
    },
    async setPhoneSendHistory(mobile, timestamps, ttlExpiresAtMs) {
      const ref = db.collection('otpPhoneSendHistory').doc(mobile);
      if (timestamps.length === 0) {
        await ref.delete().catch(() => {});
        return;
      }
      await ref.set({ timestamps, ttlExpireAt: new Date(ttlExpiresAtMs) });
    },
    async getVerifiedToken(tokenHash) {
      const ref = db.collection('otpVerifiedTokens').doc(tokenHash);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const rec = snap.data() as OtpVerifiedTokenRecord;
      if (Date.now() > rec.expiresAt) {
        await ref.delete().catch(() => {});
        return null;
      }
      return rec;
    },
    async saveVerifiedToken(record) {
      await db
        .collection('otpVerifiedTokens')
        .doc(record.tokenHash)
        .set(stripUndefinedDeep({ ...record, ttlExpireAt: new Date(record.expiresAt) }));
    },
    async consumeVerifiedToken(tokenHash, consumedAt) {
      await db
        .collection('otpVerifiedTokens')
        .doc(tokenHash)
        .set({ consumedAt }, { merge: true });
    },
    async getMobileSession(tokenHash) {
      const ref = db.collection('mobileSessions').doc(tokenHash);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const rec = snap.data() as MobileSessionRecord;
      if (Date.now() > rec.expiresAt) {
        await ref.delete().catch(() => {});
        return null;
      }
      return rec;
    },
    async saveMobileSession(record) {
      await db
        .collection('mobileSessions')
        .doc(record.tokenHash)
        .set(stripUndefinedDeep({ ...record, ttlExpireAt: new Date(record.expiresAt) }));
    },
    async deleteMobileSession(tokenHash) {
      await db.collection('mobileSessions').doc(tokenHash).delete().catch(() => {});
    },
    async pruneExpired() {
      const now = Date.now();
      const targets: Array<{ col: string; field: string }> = [
        { col: 'otpChallenges', field: 'expiresAt' },
        { col: 'otpLockouts', field: 'lockedUntil' },
        { col: 'otpVerifiedTokens', field: 'expiresAt' },
        { col: 'mobileSessions', field: 'expiresAt' },
      ];
      for (const t of targets) {
        const snap = await db.collection(t.col).where(t.field, '<=', now).limit(100).get();
        if (!snap.empty) {
          const batch = db.batch();
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    },
  };

  const rfqs: RfqRepository = {
    async getById(id) {
      const snap = await db.collection('rfqRequests').doc(id).get();
      return snap.exists ? (snap.data() as RfqRequest) : null;
    },
    async list(filter) {
      let q: FirebaseFirestore.Query = db.collection('rfqRequests');
      if (filter?.status) q = q.where('status', '==', filter.status);
      const snap = await q.get();
      let items = snap.docs
        .map((d) => d.data() as RfqRequest)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      if (filter?.limit && filter.limit > 0) {
        items = items.slice(0, filter.limit);
      }
      return items;
    },
    async save(rfq) {
      await setDoc(db.collection('rfqRequests').doc(rfq.id), rfq as unknown as Record<string, unknown>, true);
    },
  };

  // In-memory 404 counter buffer flushed periodically using atomic FieldValue.increment
  const pending404Deltas = new Map<string, { id: string; path: string; delta: number; lastSeenAt: string }>();
  const engagement: EngagementRepository = {
    async record404Hit(id, hitPath, lastSeenAt) {
      const cur = pending404Deltas.get(id);
      const delta = (cur?.delta ?? 0) + 1;
      pending404Deltas.set(id, { id, path: hitPath, delta, lastSeenAt });
      const snap = await db.collection('notFoundLogs').doc(id).get();
      const baseHits = snap.exists ? Number((snap.data() as NotFoundLog).hitCount || 0) : 0;
      return {
        id,
        path: hitPath,
        hitCount: baseHits + delta,
        lastSeenAt,
      };
    },
    async flush404Hits() {
      if (pending404Deltas.size === 0) return;
      const entries = Array.from(pending404Deltas.values());
      pending404Deltas.clear();
      const batch = db.batch();
      for (const item of entries) {
        batch.set(
          db.collection('notFoundLogs').doc(item.id),
          {
            id: item.id,
            path: item.path,
            hitCount: FieldValue.increment(item.delta),
            lastSeenAt: item.lastSeenAt,
          },
          { merge: true }
        );
      }
      await batch.commit();
    },
    async list404Logs() {
      await engagement.flush404Hits();
      const snap = await db.collection('notFoundLogs').get();
      return snap.docs
        .map((d) => d.data() as NotFoundLog)
        .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
    },
    async findNewsletterByContact(contact) {
      const clean = contact.trim().toLowerCase();
      const snap = await db.collection('newsletterSubscribers').where('contact', '==', clean).limit(1).get();
      return snap.empty ? null : (snap.docs[0].data() as NewsletterSubscriber);
    },
    async saveNewsletterSubscriber(sub) {
      await setDoc(db.collection('newsletterSubscribers').doc(sub.id), sub as unknown as Record<string, unknown>, true);
    },
    async listNewsletterSubscribers() {
      const snap = await db.collection('newsletterSubscribers').get();
      return snap.docs
        .map((d) => d.data() as NewsletterSubscriber)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    async getStockNotification(id) {
      const snap = await db.collection('stockNotifications').doc(id).get();
      return snap.exists ? (snap.data() as StockNotification) : null;
    },
    async saveStockNotification(item) {
      await setDoc(db.collection('stockNotifications').doc(item.id), item as unknown as Record<string, unknown>, true);
    },
    async listStockNotifications() {
      const snap = await db.collection('stockNotifications').get();
      return snap.docs
        .map((d) => d.data() as StockNotification)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    async getUploadedFile(id) {
      const snap = await db.collection('uploadedFiles').doc(id).get();
      return snap.exists ? (snap.data() as UploadedFileRecord) : null;
    },
    async saveUploadedFile(record) {
      await setDoc(db.collection('uploadedFiles').doc(record.id), record as unknown as Record<string, unknown>, false);
    },
    async getImportJob(id) {
      const snap = await db.collection('importJobs').doc(id).get();
      return snap.exists ? (snap.data() as ImportJobRecord) : null;
    },
    async listImportJobs(limit = 100) {
      const snap = await db.collection('importJobs').orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as ImportJobRecord);
    },
    async saveImportJob(job) {
      await setDoc(db.collection('importJobs').doc(job.id), job as unknown as Record<string, unknown>, true);
    },
  };

  async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txStorage.getStore()) {
      return fn();
    }
    return db.runTransaction((tx) => txStorage.run(tx, fn));
  }

  return {
    driver: 'firestore',
    orders,
    payments,
    stock,
    returns,
    catalog,
    proformas,
    audit,
    authSessions,
    rfqs,
    engagement,
    getCatalogVersion: () => catalogVersion,
    onCatalogChange: (listener) => {
      catalogListeners.add(listener);
      return () => catalogListeners.delete(listener);
    },
    notifyCatalogChanged,
    runTransaction,
  };
}
