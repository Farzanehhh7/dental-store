import crypto from 'node:crypto';
import {
  CustomerGroupCode,
  Order,
  OrderBatchAllocation,
  PaymentLedgerEntry,
  Product,
  ProductVariant,
  ProformaInvoice,
  ReturnRequest,
  StockBatch,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  Warehouse,
} from '../../src/types/domain';
import { SEED_WAREHOUSES } from '../../src/data/expandedCatalog';
import { normalizeMobile } from '../auth';
import {
  ServerAuditLogRecord,
  ServerCatalogSnapshot,
  ServerPaymentSession,
  ServerStore,
  ServerUserGroupRecord,
  VerifiedOrderPaymentState,
} from '../persistence';
import { normalizeDigits, parseFilterDateBoundary } from './dateUtils';
import {
  AuditRepository,
  CatalogRepository,
  OrderQueryFilter,
  OrderRepository,
  PaginatedResult,
  PaymentRepository,
  ProformaRepository,
  RepositoryBundle,
  ReturnRepository,
  StockAdjustParams,
  StockItemDelta,
  StockMovementContext,
  StockOperationResult,
  StockRepository,
  StockReservationResult,
  StocktakeParams,
  StockTransferParams,
} from './interfaces';

export function filterAndPaginateOrders(allOrders: Order[], filter: OrderQueryFilter = {}): PaginatedResult<Order> {
  let list = [...allOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filter.userId) {
    list = list.filter((o) => o.userId === filter.userId);
  }
  if (filter.mobile) {
    const targetMobile = normalizeMobile(filter.mobile);
    list = list.filter((o) => normalizeMobile(o.customerMobile) === targetMobile);
  }
  if (filter.status) {
    list = list.filter((o) => o.status === filter.status);
  }
  if (filter.source) {
    list = list.filter((o) => (o.source ?? (o.isGuest ? 'guest' : 'google')) === filter.source);
  }
  if (filter.q && filter.q.trim()) {
    const q = normalizeDigits(filter.q.trim().toLowerCase());
    list = list.filter((o) => {
      const hay = normalizeDigits(
        `${o.orderNo} ${o.customerName} ${o.customerMobile} ${o.trackingCode || ''} ${o.shippingAddress?.city || ''}`
      ).toLowerCase();
      return hay.includes(q);
    });
  }

  const fromMs = parseFilterDateBoundary(filter.fromDate, 'start');
  if (fromMs !== null) {
    list = list.filter((o) => new Date(o.createdAt).getTime() >= fromMs);
  }
  const toMs = parseFilterDateBoundary(filter.toDate, 'end');
  if (toMs !== null) {
    list = list.filter((o) => new Date(o.createdAt).getTime() <= toMs);
  }

  const total = list.length;
  const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.max(1, Math.min(totalPages, filter.page ?? 1));
  const offset = (page - 1) * limit;

  return {
    items: list.slice(offset, offset + limit),
    total,
    page,
    limit,
    totalPages,
  };
}

export function createFileRepositories(store: ServerStore): RepositoryBundle {
  // Async mutex lock + dirty-save batching inside runTransaction
  let lockChain: Promise<void> = Promise.resolve();
  let txDepth = 0;
  let txNeedsSave = false;

  const persistIfOutsideTx = () => {
    if (txDepth > 0) {
      txNeedsSave = true;
    } else {
      store.save();
    }
  };

  const getActiveWarehouses = (): Warehouse[] =>
    (store.data.warehouses.length > 0 ? store.data.warehouses : SEED_WAREHOUSES).filter((w) => w.isActive);

  const resolveWarehouse = (warehouseId?: string, warehouseCode?: string): Warehouse => {
    const all = store.data.warehouses.length > 0 ? store.data.warehouses : SEED_WAREHOUSES;
    if (warehouseId) {
      const found = all.find((w) => w.id === warehouseId);
      if (found) return found;
    }
    if (warehouseCode) {
      const up = warehouseCode.trim().toUpperCase();
      const found = all.find((w) => w.code.toUpperCase() === up);
      if (found) return found;
    }
    return all.find((w) => w.isDefault && w.isActive) ?? all.find((w) => w.id === 'wh_teh') ?? all[0];
  };

  const findProductVariant = (productId: string, variantId: string): { product: Product; variant: ProductVariant } | null => {
    const product = store.data.catalogState.products.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return null;
    return { product, variant };
  };

  const ensureStockLevel = (
    product: Product,
    variant: ProductVariant,
    wh: Warehouse,
    nowIso: string
  ): StockLevel => {
    const levelId = `${wh.id}__${variant.id}`;
    let lvl = store.data.stockLevels[levelId];
    if (!lvl) {
      lvl = {
        id: levelId,
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        onHand: 0,
        reserved: 0,
        lowStockThreshold: variant.lowStockThreshold ?? 5,
        updatedAt: nowIso,
      };
      store.data.stockLevels[levelId] = lvl;
    }
    return lvl;
  };

  const syncVariantAggregates = (variant: ProductVariant) => {
    const levels = Object.values(store.data.stockLevels).filter((l) => l.variantId === variant.id);
    if (levels.length > 0) {
      variant.stockOnHand = levels.reduce((s, l) => s + Math.max(0, l.onHand), 0);
      variant.reserved = levels.reduce((s, l) => s + Math.max(0, l.reserved), 0);
    }
    const batches = Object.values(store.data.stockBatches)
      .filter((b) => b.variantId === variant.id && b.condition !== 'damaged')
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    if (batches.length > 0 || (variant.batches && variant.batches.length > 0)) {
      variant.batches = batches.map(
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

  const appendMovement = (mv: Omit<StockMovement, 'id'>): StockMovement => {
    const record: StockMovement = {
      id: `sm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ...mv,
    };
    store.data.stockMovements.unshift(record);
    if (store.data.stockMovements.length > 5000) {
      store.data.stockMovements.length = 5000;
    }
    return record;
  };

  const orders: OrderRepository = {
    async getById(id) {
      return store.data.orders[id] ?? null;
    },
    async getByOrderNo(orderNo) {
      const clean = orderNo.trim();
      for (const ord of Object.values(store.data.orders)) {
        if (ord.orderNo === clean) return ord;
      }
      return null;
    },
    async findByIdempotencyKey(idempotencyKey) {
      const clean = idempotencyKey.trim();
      for (const ord of Object.values(store.data.orders)) {
        if (ord.idempotencyKey === clean) return ord;
      }
      return null;
    },
    async save(order) {
      store.data.orders[order.id] = order;
      persistIfOutsideTx();
    },
    async list(filter) {
      return filterAndPaginateOrders(Object.values(store.data.orders), filter);
    },
    async listExpiredPending(nowIso) {
      const nowMs = new Date(nowIso).getTime();
      return Object.values(store.data.orders).filter((o) => {
        if (o.status !== 'pending_payment' && o.status !== 'payment_failed') return false;
        if (!o.expiresAt) return false;
        const expMs = new Date(o.expiresAt).getTime();
        return Number.isFinite(expMs) && expMs <= nowMs;
      });
    },
  };

  const payments: PaymentRepository = {
    async getSessionByAuthority(authority) {
      return store.data.paymentSessions[authority] ?? null;
    },
    async findSessionByIdempotencyKey(idempotencyKey) {
      for (const s of Object.values(store.data.paymentSessions)) {
        if (s.idempotencyKey === idempotencyKey) return s;
      }
      return null;
    },
    async findOpenSessionsByOrderId(orderId) {
      return Object.values(store.data.paymentSessions).filter(
        (s) => s.orderId === orderId && (s.status === 'initiated' || s.status === 'redirected')
      );
    },
    async saveSession(session) {
      store.data.paymentSessions[session.authority] = session;
      persistIfOutsideTx();
    },
    async addLedgerEntry(entry) {
      store.data.paymentLedger.unshift(entry);
      persistIfOutsideTx();
    },
    async listLedger() {
      return store.data.paymentLedger;
    },
    async getVerifiedOrder(orderId) {
      return store.data.verifiedOrderStatuses[orderId] ?? null;
    },
    async listVerifiedOrders() {
      return store.data.verifiedOrderStatuses;
    },
    async saveVerifiedOrder(state) {
      store.data.verifiedOrderStatuses[state.orderId] = state;
      persistIfOutsideTx();
    },
    async hasProcessedWebhook(eventKey) {
      return Boolean(store.data.paymentWebhookEvents[eventKey]);
    },
    async markWebhookProcessed(eventKey, processedAt) {
      store.data.paymentWebhookEvents[eventKey] = processedAt;
      persistIfOutsideTx();
    },
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

      const activeWarehouses = getActiveWarehouses();
      const activeWhIds = new Set(activeWarehouses.map((w) => w.id));
      const defaultWh = resolveWarehouse();
      const nowIso = new Date().toISOString();

      // Phase A: Validate availability across all items BEFORE any mutation
      const targets: Array<{ product: Product; variant: ProductVariant; qty: number; key: string }> = [];
      for (const delta of aggregated.values()) {
        const pv = findProductVariant(delta.productId, delta.variantId);
        if (!pv || !pv.variant.isActive) {
          return { ok: false, message: 'یکی از کالاهای سفارش در انبار یافت نشد.' };
        }
        const { product, variant } = pv;
        const levels = Object.values(store.data.stockLevels).filter(
          (l) => l.variantId === variant.id && activeWhIds.has(l.warehouseId)
        );
        const totalAvail =
          levels.length > 0
            ? levels.reduce((s, l) => s + Math.max(0, l.onHand - l.reserved), 0)
            : Math.max(0, variant.stockOnHand - variant.reserved);

        if (delta.quantity > totalAvail) {
          return {
            ok: false,
            message: `موجودی قابل رزرو برای «${product.titleFa} (${variant.labelFa})» کافی نیست (موجود: ${totalAvail}).`,
          };
        }
        targets.push({ product, variant, qty: delta.quantity, key: `${delta.productId}::${delta.variantId}` });
      }

      // Phase B: Allocate per-warehouse & FEFO batches cleanly inside mutex
      const allocationsByItem: Record<
        string,
        { warehouseId: string; batchNo?: string; batchAllocations: OrderBatchAllocation[] }
      > = {};

      for (const t of targets) {
        let levels = Object.values(store.data.stockLevels).filter(
          (l) => l.variantId === t.variant.id && activeWhIds.has(l.warehouseId)
        );
        if (levels.length === 0) {
          const fallbackLvl = ensureStockLevel(t.product, t.variant, defaultWh, nowIso);
          fallbackLvl.onHand = Math.max(0, t.variant.stockOnHand);
          fallbackLvl.reserved = Math.max(0, t.variant.reserved);
          levels = [fallbackLvl];
        }

        const levelByWh = new Map<string, StockLevel>();
        const whAvailMap = new Map<string, number>();
        for (const l of levels) {
          levelByWh.set(l.warehouseId, l);
          whAvailMap.set(l.warehouseId, Math.max(0, l.onHand - l.reserved));
        }

        const candidateBatches = Object.values(store.data.stockBatches)
          .filter(
            (b) =>
              b.variantId === t.variant.id &&
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
          const lvl = levelByWh.get(batch.warehouseId);
          const whAvail = whAvailMap.get(batch.warehouseId) ?? 0;
          const take = Math.min(remaining, batchAvail, whAvail);
          if (take <= 0 || !lvl) continue;

          batch.reserved = (batch.reserved || 0) + take;
          batch.updatedAt = nowIso;
          lvl.reserved += take;
          lvl.updatedAt = nowIso;
          whAvailMap.set(batch.warehouseId, whAvail - take);
          remaining -= take;

          batchAllocations.push({
            warehouseId: batch.warehouseId,
            warehouseCode: batch.warehouseCode,
            batchId: batch.id,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            qty: take,
          });

          appendMovement({
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

            const wh = resolveWarehouse(lvl.warehouseId);
            batchAllocations.push({
              warehouseId: lvl.warehouseId,
              warehouseCode: lvl.warehouseCode || wh.code,
              batchNo: 'UNBATCHED',
              qty: take,
            });

            appendMovement({
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

        syncVariantAggregates(t.variant);
      }

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, allocationsByItem };
    },

    async commitItems(items: StockItemDelta[], ctx?: StockMovementContext) {
      const nowIso = new Date().toISOString();
      const defaultWh = resolveWarehouse();

      for (const item of items) {
        const pv = findProductVariant(item.productId, item.variantId);
        if (!pv) continue;
        const { product, variant } = pv;

        if (item.batchAllocations && item.batchAllocations.length > 0) {
          for (const alloc of item.batchAllocations) {
            const lvl = store.data.stockLevels[`${alloc.warehouseId}__${variant.id}`];
            if (lvl) {
              lvl.reserved = Math.max(0, lvl.reserved - Math.min(lvl.reserved, alloc.qty));
              lvl.onHand = Math.max(0, lvl.onHand - alloc.qty);
              lvl.updatedAt = nowIso;
            }
            if (alloc.batchId && store.data.stockBatches[alloc.batchId]) {
              const b = store.data.stockBatches[alloc.batchId];
              b.reserved = Math.max(0, (b.reserved || 0) - Math.min(b.reserved || 0, alloc.qty));
              b.qty = Math.max(0, b.qty - alloc.qty);
              b.updatedAt = nowIso;
            } else if (alloc.batchNo && alloc.batchNo !== 'UNBATCHED') {
              const b = Object.values(store.data.stockBatches).find(
                (rec) => rec.variantId === variant.id && rec.warehouseId === alloc.warehouseId && rec.batchNo === alloc.batchNo
              );
              if (b) {
                b.reserved = Math.max(0, (b.reserved || 0) - Math.min(b.reserved || 0, alloc.qty));
                b.qty = Math.max(0, b.qty - alloc.qty);
                b.updatedAt = nowIso;
              }
            }
            appendMovement({
              productId: product.id,
              productTitleFa: product.titleFa,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: alloc.warehouseId,
              warehouseCode: alloc.warehouseCode || resolveWarehouse(alloc.warehouseId).code,
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
          let rem = item.quantity;
          const levels = Object.values(store.data.stockLevels)
            .filter((l) => l.variantId === variant.id)
            .sort((a, b) => (a.warehouseId === defaultWh.id ? -1 : b.warehouseId === defaultWh.id ? 1 : b.reserved - a.reserved));
          for (const lvl of levels) {
            if (rem <= 0) break;
            const take = Math.min(rem, Math.max(lvl.reserved, lvl.onHand));
            if (take <= 0) continue;
            lvl.reserved = Math.max(0, lvl.reserved - Math.min(lvl.reserved, take));
            lvl.onHand = Math.max(0, lvl.onHand - take);
            lvl.updatedAt = nowIso;
            rem -= take;
            appendMovement({
              productId: product.id,
              productTitleFa: product.titleFa,
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

        product.soldCount = (product.soldCount || 0) + item.quantity;
        syncVariantAggregates(variant);
      }

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
    },

    async releaseItems(items: StockItemDelta[], ctx?: StockMovementContext) {
      const nowIso = new Date().toISOString();
      const defaultWh = resolveWarehouse();

      for (const item of items) {
        const pv = findProductVariant(item.productId, item.variantId);
        if (!pv) continue;
        const { product, variant } = pv;

        if (item.batchAllocations && item.batchAllocations.length > 0) {
          for (const alloc of item.batchAllocations) {
            const lvl = store.data.stockLevels[`${alloc.warehouseId}__${variant.id}`];
            if (lvl) {
              lvl.reserved = Math.max(0, lvl.reserved - alloc.qty);
              lvl.updatedAt = nowIso;
            }
            if (alloc.batchId && store.data.stockBatches[alloc.batchId]) {
              const b = store.data.stockBatches[alloc.batchId];
              b.reserved = Math.max(0, (b.reserved || 0) - alloc.qty);
              b.updatedAt = nowIso;
            } else if (alloc.batchNo && alloc.batchNo !== 'UNBATCHED') {
              const b = Object.values(store.data.stockBatches).find(
                (rec) => rec.variantId === variant.id && rec.warehouseId === alloc.warehouseId && rec.batchNo === alloc.batchNo
              );
              if (b) {
                b.reserved = Math.max(0, (b.reserved || 0) - alloc.qty);
                b.updatedAt = nowIso;
              }
            }
            appendMovement({
              productId: product.id,
              productTitleFa: product.titleFa,
              variantId: variant.id,
              sku: variant.sku,
              warehouseId: alloc.warehouseId,
              warehouseCode: alloc.warehouseCode || resolveWarehouse(alloc.warehouseId).code,
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
          let rem = item.quantity;
          const levels = Object.values(store.data.stockLevels)
            .filter((l) => l.variantId === variant.id && l.reserved > 0)
            .sort((a, b) => (a.warehouseId === defaultWh.id ? -1 : b.warehouseId === defaultWh.id ? 1 : b.reserved - a.reserved));
          for (const lvl of levels) {
            if (rem <= 0) break;
            const rel = Math.min(rem, lvl.reserved);
            lvl.reserved = Math.max(0, lvl.reserved - rel);
            lvl.updatedAt = nowIso;
            rem -= rel;
            appendMovement({
              productId: product.id,
              productTitleFa: product.titleFa,
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

        syncVariantAggregates(variant);
      }

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
    },

    async incrementCouponUsage(couponCode: string) {
      const clean = couponCode.trim().toUpperCase();
      if (!clean) return;
      const now = Date.now();
      const coupon = store.data.catalogState.coupons.find(
        (c) =>
          c.isActive &&
          c.code.toUpperCase() === clean &&
          new Date(c.startsAt).getTime() <= now &&
          new Date(c.endsAt).getTime() > now &&
          c.usageCount < c.usageLimit
      );
      if (coupon) {
        coupon.usageCount += 1;
        store.data.catalogState.updatedAt = new Date().toISOString();
        persistIfOutsideTx();
      }
    },

    async adjustStock(params: StockAdjustParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) {
        return { ok: false, status: 400, message: 'ثبت علت تعدیل موجودی الزامی است.' };
      }
      if (!Number.isInteger(params.delta) || params.delta === 0) {
        return { ok: false, status: 400, message: 'مقدار تغییر موجودی باید عدد صحیح غیرصفر باشد.' };
      }
      const pv = findProductVariant(params.productId, params.variantId);
      if (!pv) {
        return { ok: false, status: 404, message: 'کالا یا تنوع مورد نظر یافت نشد.' };
      }
      const { product, variant } = pv;
      const wh = resolveWarehouse(params.warehouseId, params.warehouseCode);
      if (!wh.isActive) {
        return { ok: false, status: 400, message: 'انبار انتخاب‌شده فعال نیست.' };
      }

      const nowIso = new Date().toISOString();
      const lvl = ensureStockLevel(product, variant, wh, nowIso);
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
      if (cleanBatchNo) {
        const existing = Object.values(store.data.stockBatches).find(
          (b) =>
            b.variantId === variant.id &&
            b.warehouseId === wh.id &&
            b.batchNo === cleanBatchNo &&
            b.condition !== 'damaged'
        );
        if (params.delta > 0) {
          if (existing) {
            existing.qty += params.delta;
            if (params.expiryDate) existing.expiryDate = params.expiryDate;
            if (typeof params.specialPrice === 'number') existing.specialPrice = params.specialPrice;
            if (typeof params.unitCost === 'number') existing.unitCost = params.unitCost;
            existing.updatedAt = nowIso;
            touchedBatch = existing;
          } else {
            const batchId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            const rec: StockBatchRecord = {
              id: batchId,
              productId: product.id,
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
            store.data.stockBatches[batchId] = rec;
            touchedBatch = rec;
          }
        } else if (existing) {
          const avail = Math.max(0, existing.qty - (existing.reserved || 0));
          if (Math.abs(params.delta) > avail) {
            return { ok: false, status: 400, message: `موجودی آزاد بچ ${cleanBatchNo} کافی نیست.` };
          }
          existing.qty += params.delta;
          existing.updatedAt = nowIso;
          touchedBatch = existing;
        }
      } else if (params.delta < 0) {
        let toDeduct = Math.abs(params.delta);
        const whBatches = Object.values(store.data.stockBatches)
          .filter((b) => b.variantId === variant.id && b.warehouseId === wh.id && b.condition !== 'damaged' && b.qty > b.reserved)
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
        for (const b of whBatches) {
          if (toDeduct <= 0) break;
          const avail = Math.max(0, b.qty - (b.reserved || 0));
          const cut = Math.min(toDeduct, avail);
          b.qty -= cut;
          b.updatedAt = nowIso;
          toDeduct -= cut;
        }
      }

      lvl.onHand = nextOnHand;
      lvl.updatedAt = nowIso;
      syncVariantAggregates(variant);

      const movement = appendMovement({
        productId: product.id,
        productTitleFa: product.titleFa,
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

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, stockLevel: lvl, ...(touchedBatch ? { batch: touchedBatch } : {}), movement };
    },

    async stocktakeStock(params: StocktakeParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) {
        return { ok: false, status: 400, message: 'ثبت علت انبارگردانی الزامی است.' };
      }
      if (!Number.isInteger(params.onHand) || params.onHand < 0) {
        return { ok: false, status: 400, message: 'مقدار شمارش باید عدد صحیح نامنفی باشد.' };
      }
      const pv = findProductVariant(params.productId, params.variantId);
      if (!pv) {
        return { ok: false, status: 404, message: 'کالا یا تنوع یافت نشد.' };
      }
      const { product, variant } = pv;
      const wh = resolveWarehouse(params.warehouseId, params.warehouseCode);
      const nowIso = new Date().toISOString();
      const lvl = ensureStockLevel(product, variant, wh, nowIso);

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

      // Reconcile warehouse batches so total batch qty never exceeds new onHand
      const whBatches = Object.values(store.data.stockBatches)
        .filter((b) => b.variantId === variant.id && b.warehouseId === wh.id && b.condition !== 'damaged')
        .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());
      let totalBatchQty = whBatches.reduce((s, b) => s + b.qty, 0);
      if (totalBatchQty > params.onHand) {
        let excess = totalBatchQty - params.onHand;
        for (const b of whBatches) {
          if (excess <= 0) break;
          const trimmable = Math.max(0, b.qty - (b.reserved || 0));
          const cut = Math.min(excess, trimmable);
          b.qty -= cut;
          b.updatedAt = nowIso;
          excess -= cut;
          totalBatchQty -= cut;
        }
      }

      syncVariantAggregates(variant);

      const movement = appendMovement({
        productId: product.id,
        productTitleFa: product.titleFa,
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

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, stockLevel: lvl, movement };
    },

    async transferStock(params: StockTransferParams): Promise<StockOperationResult> {
      const cleanReason = params.reason.trim();
      if (!cleanReason) {
        return { ok: false, status: 400, message: 'ذکر علت انتقال بین انبارها الزامی است.' };
      }
      if (params.fromWarehouseId === params.toWarehouseId) {
        return { ok: false, status: 400, message: 'انبار مبدا و مقصد نمی‌توانند یکسان باشند.' };
      }
      if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
        return { ok: false, status: 400, message: 'تعداد انتقال باید عدد صحیح مثبت باشد.' };
      }

      const pv = findProductVariant(params.productId, params.variantId);
      if (!pv) {
        return { ok: false, status: 404, message: 'کالا یا تنوع مورد نظر یافت نشد.' };
      }
      const { product, variant } = pv;

      const allWarehouses = store.data.warehouses.length > 0 ? store.data.warehouses : SEED_WAREHOUSES;
      const fromWh = allWarehouses.find((w) => w.id === params.fromWarehouseId && w.isActive);
      const toWh = allWarehouses.find((w) => w.id === params.toWarehouseId && w.isActive);
      if (!fromWh || !toWh) {
        return { ok: false, status: 404, message: 'انبار مبدا یا مقصد معتبر/فعال نیست.' };
      }

      const nowIso = new Date().toISOString();
      const fromLvl = ensureStockLevel(product, variant, fromWh, nowIso);
      const avail = Math.max(0, fromLvl.onHand - fromLvl.reserved);
      if (params.quantity > avail) {
        return {
          ok: false,
          status: 400,
          message: `موجودی قابل انتقال در «${fromWh.nameFa}» کافی نیست (قابل انتقال: ${avail}، رزروشده: ${fromLvl.reserved}).`,
        };
      }

      const toLvl = ensureStockLevel(product, variant, toWh, nowIso);

      // Transfer unreserved units across warehouse stock levels
      fromLvl.onHand -= params.quantity;
      fromLvl.updatedAt = nowIso;
      toLvl.onHand += params.quantity;
      toLvl.updatedAt = nowIso;

      // Move matching unreserved batch quantities from source to destination warehouse (FEFO order)
      let rem = params.quantity;
      const cleanBatch = params.batchNo?.trim();
      const srcBatches = Object.values(store.data.stockBatches)
        .filter(
          (b) =>
            b.variantId === variant.id &&
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

        const destBatch = Object.values(store.data.stockBatches).find(
          (dbRec) =>
            dbRec.variantId === variant.id &&
            dbRec.warehouseId === toWh.id &&
            dbRec.batchNo === b.batchNo &&
            dbRec.condition === b.condition
        );
        if (destBatch) {
          destBatch.qty += moveQty;
          destBatch.updatedAt = nowIso;
        } else {
          const newId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          store.data.stockBatches[newId] = {
            id: newId,
            productId: product.id,
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
        }
      }

      syncVariantAggregates(variant);

      const movement = appendMovement({
        productId: product.id,
        productTitleFa: product.titleFa,
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

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, fromLevel: fromLvl, toLevel: toLvl, movement };
    },

    async setBatchSpecialPrice({ productId, variantId, batchId, specialPrice }) {
      const pv = findProductVariant(productId, variantId);
      if (!pv) {
        return { ok: false, status: 404, message: 'کالا یا تنوع یافت نشد.' };
      }
      const batch = store.data.stockBatches[batchId];
      if (!batch || batch.variantId !== variantId) {
        return { ok: false, status: 404, message: 'سری ساخت (Batch) مورد نظر یافت نشد.' };
      }
      const nowIso = new Date().toISOString();
      batch.specialPrice = specialPrice;
      batch.updatedAt = nowIso;
      syncVariantAggregates(pv.variant);
      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, batch };
    },

    async restockReturnItems(params) {
      const wh = resolveWarehouse(params.warehouseId);
      if (!wh || !wh.isActive) {
        return { ok: false, status: 400, message: 'انبار مقصد مرجوعی معتبر نیست.' };
      }
      const nowIso = new Date().toISOString();
      const movements: StockMovement[] = [];
      const order = store.data.orders[params.returnRequest.orderId];

      for (const retItem of params.returnRequest.items) {
        const pv = findProductVariant(retItem.productId, retItem.variantId);
        if (!pv) continue;
        const { product, variant } = pv;
        const orderItem = order?.items.find((it) => it.variantId === retItem.variantId);
        const batchNo =
          params.batchNo?.trim() ||
          retItem.batchNo?.trim() ||
          orderItem?.batchNo ||
          `RMA-${params.returnRequest.returnNo}`;

        if (params.condition === 'resellable') {
          const lvl = ensureStockLevel(product, variant, wh, nowIso);
          lvl.onHand += retItem.quantity;
          lvl.updatedAt = nowIso;

          const existingBatch = Object.values(store.data.stockBatches).find(
            (b) =>
              b.variantId === variant.id &&
              b.warehouseId === wh.id &&
              b.batchNo === batchNo &&
              b.condition === 'resellable'
          );
          let batchId = existingBatch?.id;
          if (existingBatch) {
            existingBatch.qty += retItem.quantity;
            existingBatch.updatedAt = nowIso;
          } else {
            batchId = `bat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            store.data.stockBatches[batchId] = {
              id: batchId,
              productId: product.id,
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
          }

          syncVariantAggregates(variant);

          const mv = appendMovement({
            productId: product.id,
            productTitleFa: product.titleFa,
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
          movements.push(mv);
        } else {
          // Damaged items are quarantined into damaged batches and MUST NOT increase sellable stockLevels.onHand
          const dmgBatchId = `bat_dmg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          store.data.stockBatches[dmgBatchId] = {
            id: dmgBatchId,
            productId: product.id,
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

          const mv = appendMovement({
            productId: product.id,
            productTitleFa: product.titleFa,
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
          movements.push(mv);
        }
      }

      store.data.catalogState.updatedAt = nowIso;
      persistIfOutsideTx();
      return { ok: true, movements, warehouseId: wh.id };
    },

    async listWarehouses() {
      return store.data.warehouses;
    },

    async saveWarehouse(warehouse: Warehouse) {
      const idx = store.data.warehouses.findIndex((w) => w.id === warehouse.id);
      if (warehouse.isDefault) {
        store.data.warehouses = store.data.warehouses.map((w) => ({ ...w, isDefault: w.id === warehouse.id }));
      }
      if (idx >= 0) {
        store.data.warehouses[idx] = warehouse;
      } else {
        store.data.warehouses.push(warehouse);
      }
      persistIfOutsideTx();
      return warehouse;
    },

    async deleteWarehouse(warehouseId: string) {
      const idx = store.data.warehouses.findIndex((w) => w.id === warehouseId);
      if (idx < 0) return false;
      store.data.warehouses.splice(idx, 1);
      persistIfOutsideTx();
      return true;
    },

    async listStockLevels(filter) {
      let levels = Object.values(store.data.stockLevels);
      if (filter?.warehouseId) levels = levels.filter((l) => l.warehouseId === filter.warehouseId);
      if (filter?.productId) levels = levels.filter((l) => l.productId === filter.productId);
      if (filter?.variantId) levels = levels.filter((l) => l.variantId === filter.variantId);
      return levels;
    },

    async listBatches(filter) {
      let batches = Object.values(store.data.stockBatches);
      if (filter?.warehouseId) batches = batches.filter((b) => b.warehouseId === filter.warehouseId);
      if (filter?.productId) batches = batches.filter((b) => b.productId === filter.productId);
      if (filter?.variantId) batches = batches.filter((b) => b.variantId === filter.variantId);
      return batches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    },

    async listMovements(limit = 200) {
      return store.data.stockMovements.slice(0, limit);
    },
  };

  const returns: ReturnRepository = {
    async getById(id) {
      return store.data.returns[id] ?? null;
    },
    async list(filter) {
      let list = Object.values(store.data.returns).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      if (filter?.userId) list = list.filter((r) => r.userId === filter.userId);
      if (filter?.status) list = list.filter((r) => r.status === filter.status);
      return list;
    },
    async save(ret) {
      store.data.returns[ret.id] = ret;
      persistIfOutsideTx();
    },
  };

  const catalog: CatalogRepository = {
    async getSnapshot(): Promise<ServerCatalogSnapshot> {
      return {
        ...store.data.catalogState,
        warehouses: store.data.warehouses,
        stockLevels: Object.values(store.data.stockLevels),
        stockBatches: Object.values(store.data.stockBatches),
      };
    },
    async getUserGroupAndProfile({ uid, mobile }) {
      const cleanUid = uid?.trim();
      const cleanMobile = mobile ? normalizeMobile(mobile) : '';
      const keys: string[] = [];
      if (cleanUid) keys.push(`uid:${cleanUid}`, cleanUid);
      if (cleanMobile) keys.push(`mobile:${cleanMobile}`, cleanMobile);

      for (const k of keys) {
        const rec = store.data.userGroups[k];
        if (rec) {
          const effGroup: CustomerGroupCode = rec.b2bStatus === 'approved' ? rec.customerGroup : 'retail';
          return {
            customerGroup: effGroup,
            b2bStatus: rec.b2bStatus,
            displayName: rec.displayName,
          };
        }
      }

      // Secondary lookup across values by uid or normalized mobile
      for (const rec of Object.values(store.data.userGroups)) {
        if (
          (cleanUid && rec.uid === cleanUid) ||
          (cleanMobile && rec.mobile && normalizeMobile(rec.mobile) === cleanMobile)
        ) {
          const effGroup: CustomerGroupCode = rec.b2bStatus === 'approved' ? rec.customerGroup : 'retail';
          return {
            customerGroup: effGroup,
            b2bStatus: rec.b2bStatus,
            displayName: rec.displayName,
          };
        }
      }

      return { customerGroup: 'retail', b2bStatus: 'none' };
    },
    async setUserGroup(record: ServerUserGroupRecord) {
      const normalizedMobile = record.mobile ? normalizeMobile(record.mobile) : undefined;
      const cleanRecord: ServerUserGroupRecord = {
        ...record,
        ...(normalizedMobile ? { mobile: normalizedMobile } : {}),
      };
      store.data.userGroups[cleanRecord.key] = cleanRecord;
      if (cleanRecord.uid) {
        store.data.userGroups[`uid:${cleanRecord.uid}`] = cleanRecord;
      }
      if (normalizedMobile) {
        store.data.userGroups[`mobile:${normalizedMobile}`] = cleanRecord;
      }
      persistIfOutsideTx();
    },
    async saveCatalogCollections(patch) {
      if (patch.categories) store.data.catalogState.categories = patch.categories;
      if (patch.brands) store.data.catalogState.brands = patch.brands;
      if (patch.products) store.data.catalogState.products = patch.products;
      if (patch.redirects) store.data.catalogState.redirects = patch.redirects;
      store.data.catalogState.updatedAt = patch.updatedAt ?? new Date().toISOString();
      persistIfOutsideTx();
    },
  };

  const proformas: ProformaRepository = {
    async getById(id) {
      return store.data.proformas[id] ?? null;
    },
    async getByShareToken(shareToken) {
      for (const pf of Object.values(store.data.proformas)) {
        if (pf.shareToken === shareToken) return pf;
      }
      return null;
    },
    async save(proforma) {
      store.data.proformas[proforma.id] = proforma;
      persistIfOutsideTx();
    },
    async listByUser(userId) {
      return Object.values(store.data.proformas)
        .filter((p) => p.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    async listAll() {
      return Object.values(store.data.proformas).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
  };

  const audit: AuditRepository = {
    async append(record) {
      store.data.auditLogs.unshift(record);
      if (store.data.auditLogs.length > 2000) {
        store.data.auditLogs.length = 2000;
      }
      persistIfOutsideTx();
    },
    async list(limit = 100) {
      return store.data.auditLogs.slice(0, limit);
    },
  };

  async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txDepth > 0) {
      // Nested inside already held mutex
      return fn();
    }
    let release!: () => void;
    const prev = lockChain;
    lockChain = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    txDepth += 1;
    txNeedsSave = false;
    try {
      const result = await fn();
      if (txNeedsSave) {
        store.save();
        txNeedsSave = false;
      }
      return result;
    } finally {
      txDepth -= 1;
      release();
    }
  }

  return {
    driver: 'file',
    orders,
    payments,
    stock,
    returns,
    catalog,
    proformas,
    audit,
    runTransaction,
  };
}
