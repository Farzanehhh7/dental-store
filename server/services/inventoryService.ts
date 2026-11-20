import crypto from 'node:crypto';
import type { Order, ReturnRequest, Warehouse } from '../../src/types/domain';
import { normalizeMobile, verifyGuestOrderToken } from '../auth';
import type { RepositoryBundle } from '../repositories';
import { appendOrderHistory, isValidOrderTransition } from './orderService';

export interface LowStockAlertRow {
  levelId: string;
  productId: string;
  productTitleFa: string;
  variantId: string;
  variantLabelFa: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export const RETURN_TRANSITIONS: Record<ReturnRequest['status'], ReturnRequest['status'][]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'rejected'],
  received: ['refunded'],
  refunded: [],
  rejected: [],
};

export function createInventoryService(repos: RepositoryBundle) {
  async function getOverview(filter?: {
    warehouseId?: string;
    lowStockOnly?: boolean;
    q?: string;
    limit?: number;
  }) {
    const [warehouses, stockLevels, stockBatches, movements, snapshot] = await Promise.all([
      repos.stock.listWarehouses(),
      repos.stock.listStockLevels({ warehouseId: filter?.warehouseId }),
      repos.stock.listBatches({ warehouseId: filter?.warehouseId }),
      repos.stock.listMovements(filter?.limit ?? 200),
      repos.catalog.getSnapshot(),
    ]);

    const productMap = new Map(snapshot.products.map((p) => [p.id, p]));
    const search = filter?.q?.trim().toLowerCase() || '';

    let filteredLevels = stockLevels;
    let filteredBatches = stockBatches;
    let filteredMovements = filter?.warehouseId
      ? movements.filter((m) => m.warehouseId === filter.warehouseId || m.toWarehouseId === filter.warehouseId)
      : movements;

    if (search) {
      filteredLevels = filteredLevels.filter((lvl) => {
        const prod = productMap.get(lvl.productId);
        const variant = prod?.variants.find((v) => v.id === lvl.variantId);
        const hay = `${prod?.titleFa || ''} ${prod?.sku || ''} ${variant?.labelFa || ''} ${lvl.sku}`.toLowerCase();
        return hay.includes(search);
      });
      const allowedVariants = new Set(filteredLevels.map((l) => l.variantId));
      filteredBatches = filteredBatches.filter((b) => allowedVariants.has(b.variantId) || b.batchNo.toLowerCase().includes(search));
      filteredMovements = filteredMovements.filter(
        (m) =>
          m.productTitleFa.toLowerCase().includes(search) ||
          m.sku.toLowerCase().includes(search) ||
          (m.batchNo || '').toLowerCase().includes(search)
      );
    }

    const lowStockAlerts: LowStockAlertRow[] = [];
    for (const lvl of filteredLevels) {
      const avail = Math.max(0, lvl.onHand - lvl.reserved);
      const threshold = lvl.lowStockThreshold ?? 5;
      if (avail <= threshold) {
        const prod = productMap.get(lvl.productId);
        const variant = prod?.variants.find((v) => v.id === lvl.variantId);
        lowStockAlerts.push({
          levelId: lvl.id,
          productId: lvl.productId,
          productTitleFa: prod?.titleFa ?? lvl.productId,
          variantId: lvl.variantId,
          variantLabelFa: variant?.labelFa ?? lvl.sku,
          sku: lvl.sku,
          warehouseId: lvl.warehouseId,
          warehouseCode: lvl.warehouseCode,
          onHand: lvl.onHand,
          reserved: lvl.reserved,
          available: avail,
          lowStockThreshold: threshold,
        });
      }
    }
    lowStockAlerts.sort((a, b) => a.available - b.available);

    const visibleLevels = filter?.lowStockOnly
      ? filteredLevels.filter((l) => Math.max(0, l.onHand - l.reserved) <= (l.lowStockThreshold ?? 5))
      : filteredLevels;

    return {
      warehouses,
      stockLevels: visibleLevels,
      stockBatches: filteredBatches,
      movements: filteredMovements,
      lowStockAlerts,
    };
  }

  async function adjust(params: {
    productId: string;
    variantId: string;
    warehouseId?: string;
    warehouseCode?: string;
    delta: number;
    type: 'receive' | 'adjust';
    reason: string;
    batchNo?: string;
    expiryDate?: string;
    unitCost?: number;
    specialPrice?: number | null;
    actorUid: string;
    actorEmail: string;
  }) {
    return repos.runTransaction(async () => {
      const res = await repos.stock.adjustStock({
        productId: params.productId,
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        warehouseCode: params.warehouseCode,
        delta: params.delta,
        type: params.type,
        reason: params.reason,
        actorEmail: params.actorEmail,
        batchNo: params.batchNo,
        expiryDate: params.expiryDate,
        unitCost: params.unitCost,
        specialPrice: params.specialPrice,
      });
      if (res.ok && res.movement) {
        await repos.audit.append({
          id: `aud_${crypto.randomBytes(6).toString('hex')}`,
          actorType: 'admin',
          actorId: params.actorUid,
          action: `inventory.${params.type}`,
          entityType: 'stock',
          entityId: `${params.productId}:${params.variantId}`,
          summary: `${params.type} (${params.delta > 0 ? '+' : ''}${params.delta}) on ${params.variantId}: ${params.reason}`,
          createdAt: new Date().toISOString(),
        });
      }
      return res;
    });
  }

  async function stocktake(params: {
    productId: string;
    variantId: string;
    warehouseId?: string;
    warehouseCode?: string;
    onHand: number;
    reason: string;
    actorUid: string;
    actorEmail: string;
  }) {
    return repos.runTransaction(async () => {
      const res = await repos.stock.stocktakeStock({
        productId: params.productId,
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        warehouseCode: params.warehouseCode,
        onHand: params.onHand,
        reason: params.reason,
        actorEmail: params.actorEmail,
      });
      if (res.ok) {
        await repos.audit.append({
          id: `aud_${crypto.randomBytes(6).toString('hex')}`,
          actorType: 'admin',
          actorId: params.actorUid,
          action: 'inventory.stocktake',
          entityType: 'stock',
          entityId: `${params.productId}:${params.variantId}`,
          summary: `Stocktake set onHand=${params.onHand} for ${params.variantId}: ${params.reason}`,
          createdAt: new Date().toISOString(),
        });
      }
      return res;
    });
  }

  async function transfer(params: {
    productId: string;
    variantId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    reason: string;
    batchNo?: string;
    actorUid: string;
    actorEmail: string;
  }) {
    return repos.runTransaction(async () => {
      const res = await repos.stock.transferStock({
        productId: params.productId,
        variantId: params.variantId,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        quantity: params.quantity,
        reason: params.reason,
        batchNo: params.batchNo,
        actorEmail: params.actorEmail,
      });
      if (res.ok) {
        await repos.audit.append({
          id: `aud_${crypto.randomBytes(6).toString('hex')}`,
          actorType: 'admin',
          actorId: params.actorUid,
          action: 'inventory.transfer',
          entityType: 'stock',
          entityId: `${params.productId}:${params.variantId}`,
          summary: `Transfer ${params.quantity} of ${params.variantId} from ${params.fromWarehouseId} to ${params.toWarehouseId}`,
          createdAt: new Date().toISOString(),
        });
      }
      return res;
    });
  }

  async function setBatchSpecialPrice(params: {
    productId: string;
    variantId: string;
    batchId: string;
    specialPrice: number | null;
    actorEmail: string;
  }) {
    return repos.runTransaction(() => repos.stock.setBatchSpecialPrice(params));
  }

  async function saveWarehouse(warehouse: Warehouse, actorUid: string) {
    return repos.runTransaction(async () => {
      const saved = await repos.stock.saveWarehouse(warehouse);
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: actorUid,
        action: 'warehouse.saved',
        entityType: 'warehouse',
        entityId: saved.id,
        summary: `Warehouse ${saved.code} saved (${saved.nameFa})`,
        createdAt: new Date().toISOString(),
      });
      return saved;
    });
  }

  async function deleteWarehouse(warehouseId: string, actorUid: string) {
    return repos.runTransaction(async () => {
      const levels = await repos.stock.listStockLevels({ warehouseId });
      if (levels.some((l) => l.onHand > 0 || l.reserved > 0)) {
        return {
          ok: false as const,
          status: 400,
          message: 'حذف انبار دارای موجودی فیزیکی یا رزروشده مجاز نیست. ابتدا موجودی را به انبار دیگر منتقل کنید.',
        };
      }
      const deleted = await repos.stock.deleteWarehouse(warehouseId);
      if (!deleted) {
        return { ok: false as const, status: 404, message: 'انبار یافت نشد.' };
      }
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: actorUid,
        action: 'warehouse.deleted',
        entityType: 'warehouse',
        entityId: warehouseId,
        summary: `Warehouse ${warehouseId} deleted`,
        createdAt: new Date().toISOString(),
      });
      return { ok: true as const };
    });
  }

  async function submitReturn(params: {
    orderId: string;
    items: ReturnRequest['items'];
    reasonFa: string;
    resolution: ReturnRequest['resolution'];
    refundAmount?: number;
    caller: {
      isAdmin?: boolean;
      firebaseUid?: string;
      mobileSessionPhone?: string;
      orderToken?: string | null;
      customerName?: string;
    };
  }): Promise<{ ok: true; returnRequest: ReturnRequest } | { ok: false; status: number; message: string }> {
    const order = (await repos.orders.getById(params.orderId.trim())) ?? (await repos.orders.getByOrderNo(params.orderId.trim()));
    if (!order) {
      return { ok: false, status: 404, message: 'سفارش برای ثبت مرجوعی یافت نشد.' };
    }

    const hasAdmin = Boolean(params.caller.isAdmin);
    const hasUidOwner = Boolean(params.caller.firebaseUid && order.userId === params.caller.firebaseUid);
    const hasMobileOwner = Boolean(
      params.caller.mobileSessionPhone &&
        normalizeMobile(order.customerMobile) === normalizeMobile(params.caller.mobileSessionPhone)
    );
    const hasOrderToken = Boolean(params.caller.orderToken && verifyGuestOrderToken(params.caller.orderToken, order));

    if (!hasAdmin && !hasUidOwner && !hasMobileOwner && !hasOrderToken) {
      const hasAnyCred = Boolean(params.caller.firebaseUid || params.caller.mobileSessionPhone || params.caller.orderToken);
      return {
        ok: false,
        status: hasAnyCred ? 403 : 401,
        message: hasAnyCred ? 'شما مجاز به ثبت مرجوعی برای این سفارش نیستید.' : 'احراز هویت برای ثبت مرجوعی الزامی است.',
      };
    }

    const eligibleStatuses: Order['status'][] = ['delivered', 'completed', 'shipped', 'paid', 'return_requested'];
    if (!eligibleStatuses.includes(order.status)) {
      return {
        ok: false,
        status: 400,
        message: `ثبت درخواست مرجوعی برای سفارش در وضعیت «${order.status}» مجاز نیست.`,
      };
    }

    let computedRefund = 0;
    const normalizedItems: ReturnRequest['items'] = [];
    for (const reqItem of params.items) {
      const orderedItem = order.items.find(
        (oi) => oi.productId === reqItem.productId && oi.variantId === reqItem.variantId
      );
      if (!orderedItem) {
        return { ok: false, status: 400, message: `کالای «${reqItem.titleFa}» در اقلام سفارش وجود ندارد.` };
      }
      if (reqItem.quantity > orderedItem.quantity) {
        return {
          ok: false,
          status: 400,
          message: `تعداد مرجوعی برای «${orderedItem.titleFa}» از تعداد خریداری‌شده (${orderedItem.quantity}) بیشتر است.`,
        };
      }
      computedRefund += orderedItem.unitPrice * reqItem.quantity;
      normalizedItems.push({
        productId: orderedItem.productId,
        variantId: orderedItem.variantId,
        titleFa: reqItem.titleFa || orderedItem.titleFa,
        quantity: reqItem.quantity,
        ...(reqItem.batchNo || orderedItem.batchNo ? { batchNo: reqItem.batchNo || orderedItem.batchNo } : {}),
        ...(reqItem.condition ? { condition: reqItem.condition } : {}),
      });
    }

    return repos.runTransaction(async () => {
      const nowIso = new Date().toISOString();
      const id = `ret_${crypto.randomBytes(6).toString('hex')}`;
      const returnNo = `RMA-${new Date().getFullYear()}-${crypto.randomInt(1000, 10000)}`;
      const ret: ReturnRequest = {
        id,
        returnNo,
        orderId: order.id,
        orderNo: order.orderNo,
        userId: order.userId,
        customerName: params.caller.customerName || order.customerName,
        items: normalizedItems,
        reasonFa: params.reasonFa.trim(),
        resolution: params.resolution,
        status: 'requested',
        refundAmount: typeof params.refundAmount === 'number' && params.refundAmount > 0 ? Math.min(params.refundAmount, order.grandTotal) : computedRefund,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await repos.returns.save(ret);

      if (isValidOrderTransition(order.status, 'return_requested') && order.status !== 'return_requested') {
        await repos.orders.save({
          ...order,
          status: 'return_requested',
          statusHistory: appendOrderHistory(order, {
            status: 'return_requested',
            changedAt: nowIso,
            actorType: hasAdmin ? 'admin' : 'customer',
            actorId: params.caller.firebaseUid ?? order.userId,
            note: `ثبت درخواست مرجوعی ${returnNo}`,
          }),
          updatedAt: nowIso,
        });
      }

      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: hasAdmin ? 'admin' : 'customer',
        actorId: params.caller.firebaseUid ?? order.userId,
        action: 'return.created',
        entityType: 'return',
        entityId: ret.id,
        summary: `RMA ${ret.returnNo} created for order ${order.orderNo}`,
        createdAt: nowIso,
      });

      return { ok: true as const, returnRequest: ret };
    });
  }

  async function listReturns(params: { isAdmin: boolean; callerUserIds: string[] }) {
    if (params.isAdmin) {
      return repos.returns.list();
    }
    const all = await repos.returns.list();
    const idSet = new Set(params.callerUserIds);
    return all.filter((r) => idSet.has(r.userId));
  }

  async function processReturn(params: {
    returnId: string;
    status: ReturnRequest['status'];
    condition?: 'resellable' | 'damaged';
    warehouseId?: string;
    batchNo?: string;
    expiryDate?: string;
    adminNote?: string;
    adminUid: string;
    adminEmail: string;
  }): Promise<
    | { ok: true; returnRequest: ReturnRequest; alreadyProcessed?: boolean; movements?: ReturnType<typeof Array> }
    | { ok: false; status: number; message: string }
  > {
    return repos.runTransaction(async () => {
      const existing = await repos.returns.getById(params.returnId.trim());
      if (!existing) {
        return { ok: false as const, status: 404, message: 'درخواست مرجوعی یافت نشد.' };
      }

      // Idempotent guard: repeating 'received' after already restocked is a safe no-op
      if (params.status === 'received' && (existing.status === 'received' || existing.restockedAt)) {
        return { ok: true as const, returnRequest: existing, alreadyProcessed: true };
      }

      if (existing.status === params.status) {
        return { ok: true as const, returnRequest: existing, alreadyProcessed: true };
      }

      const allowedNext = RETURN_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(params.status)) {
        return {
          ok: false as const,
          status: 400,
          message: `انتقال وضعیت مرجوعی از «${existing.status}» به «${params.status}» مجاز نیست.`,
        };
      }

      const nowIso = new Date().toISOString();
      let restockedAt = existing.restockedAt;
      let usedWarehouseId = existing.warehouseId;
      let usedCondition = params.condition ?? existing.condition;

      if (params.status === 'received') {
        const condition = params.condition ?? 'resellable';
        usedCondition = condition;
        const restockRes = await repos.stock.restockReturnItems({
          returnRequest: existing,
          condition,
          warehouseId: params.warehouseId,
          batchNo: params.batchNo,
          expiryDate: params.expiryDate,
          actorEmail: params.adminEmail,
        });
        if (!restockRes.ok) {
          return { ok: false as const, status: restockRes.status, message: restockRes.message };
        }
        restockedAt = nowIso;
        usedWarehouseId = restockRes.warehouseId;
      }

      const updated: ReturnRequest = {
        ...existing,
        status: params.status,
        ...(usedCondition ? { condition: usedCondition } : {}),
        ...(usedWarehouseId ? { warehouseId: usedWarehouseId } : {}),
        ...(restockedAt ? { restockedAt } : {}),
        ...(params.adminNote?.trim() ? { adminNote: params.adminNote.trim() } : {}),
        updatedAt: nowIso,
      };
      await repos.returns.save(updated);

      const order = await repos.orders.getById(existing.orderId);
      if (order) {
        const targetOrderStatus: Order['status'] | null =
          params.status === 'received'
            ? 'returned'
            : params.status === 'refunded'
            ? 'refunded'
            : null;
        if (targetOrderStatus && isValidOrderTransition(order.status, targetOrderStatus)) {
          await repos.orders.save({
            ...order,
            status: targetOrderStatus,
            ...(targetOrderStatus === 'refunded' ? { paymentStatus: 'refunded' } : {}),
            statusHistory: appendOrderHistory(order, {
              status: targetOrderStatus,
              ...(targetOrderStatus === 'refunded' ? { paymentStatus: 'refunded' } : {}),
              changedAt: nowIso,
              actorType: 'admin',
              actorId: params.adminUid,
              note: `پردازش مرجوعی ${existing.returnNo} (${params.status}${usedCondition ? ` / ${usedCondition}` : ''})`,
            }),
            updatedAt: nowIso,
          });
        }
      }

      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: params.adminUid,
        action: `return.${params.status}`,
        entityType: 'return',
        entityId: updated.id,
        summary: `RMA ${updated.returnNo}: ${existing.status} -> ${params.status}${usedCondition ? ` (${usedCondition})` : ''}`,
        createdAt: nowIso,
      });

      return { ok: true as const, returnRequest: updated };
    });
  }

  return {
    getOverview,
    adjust,
    stocktake,
    transfer,
    setBatchSpecialPrice,
    saveWarehouse,
    deleteWarehouse,
    submitReturn,
    listReturns,
    processReturn,
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
