import crypto from 'node:crypto';
import express from 'express';
import { extractOrderToken, resolveMobileSession, verifyFirebaseUser } from '../auth';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import type { InventoryService } from '../services/inventoryService';
import {
  batchSpecialPriceBodySchema,
  inventoryAdjustBodySchema,
  inventoryQuerySchema,
  inventoryStocktakeBodySchema,
  inventoryTransferBodySchema,
  parseRequestBody,
  parseRequestQuery,
  returnCreateBodySchema,
  returnProcessBodySchema,
  warehouseUpsertBodySchema,
} from '../validation';

export function createInventoryRouter(
  store: ServerStore,
  inventoryService: InventoryService,
  _repos?: RepositoryBundle
): express.Router {
  const router = express.Router();

  // --- Admin Per-Warehouse Inventory Overview & Low-Stock Alerts ---
  router.get('/api/admin/inventory', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:read');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const query = parseRequestQuery(inventoryQuerySchema, req, res);
    if (!query) return;

    const overview = await inventoryService.getOverview({
      warehouseId: query.warehouseId,
      lowStockOnly: query.lowStockOnly,
      q: query.q,
      limit: query.limit,
    });
    return res.json({ ok: true, ...overview });
  });

  // --- Receive or Adjust Stock with Mandatory Reason & Optional Batch ---
  router.post('/api/admin/inventory/adjust', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(inventoryAdjustBodySchema, req, res);
    if (!parsed) return;

    const result = await inventoryService.adjust({
      productId: parsed.productId,
      variantId: parsed.variantId,
      warehouseId: parsed.warehouseId,
      warehouseCode: parsed.warehouseCode,
      delta: parsed.delta,
      type: parsed.type,
      reason: parsed.reason,
      batchNo: parsed.batchNo,
      expiryDate: parsed.expiryDate,
      unitCost: parsed.unitCost,
      specialPrice: parsed.specialPrice,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email || adminCheck.user.uid,
    });

    if (!result.ok) {
      return res.status(result.status ?? 400).json({ ok: false, message: result.message });
    }
    return res.json({
      ok: true,
      stockLevel: result.stockLevel,
      ...(result.batch ? { batch: result.batch } : {}),
      movement: result.movement,
    });
  });

  // --- Physical Stocktake (Reconcile On-Hand Per Warehouse) ---
  router.post('/api/admin/inventory/stocktake', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(inventoryStocktakeBodySchema, req, res);
    if (!parsed) return;

    const result = await inventoryService.stocktake({
      productId: parsed.productId,
      variantId: parsed.variantId,
      warehouseId: parsed.warehouseId,
      warehouseCode: parsed.warehouseCode,
      onHand: parsed.onHand,
      reason: parsed.reason,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email || adminCheck.user.uid,
    });

    if (!result.ok) {
      return res.status(result.status ?? 400).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, stockLevel: result.stockLevel, movement: result.movement });
  });

  // --- Inter-Warehouse Transfer (Enforces Available = OnHand - Reserved) ---
  router.post('/api/admin/inventory/transfer', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(inventoryTransferBodySchema, req, res);
    if (!parsed) return;

    const result = await inventoryService.transfer({
      productId: parsed.productId,
      variantId: parsed.variantId,
      fromWarehouseId: parsed.fromWarehouseId,
      toWarehouseId: parsed.toWarehouseId,
      quantity: parsed.quantity,
      reason: parsed.reason,
      batchNo: parsed.batchNo,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email || adminCheck.user.uid,
    });

    if (!result.ok) {
      return res.status(result.status ?? 400).json({ ok: false, message: result.message });
    }
    return res.json({
      ok: true,
      fromLevel: result.fromLevel,
      toLevel: result.toLevel,
      movement: result.movement,
    });
  });

  // --- Near-Expiry Batch Special Clearance Price ---
  router.post('/api/admin/inventory/batch-special-price', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:batch_price');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(batchSpecialPriceBodySchema, req, res);
    if (!parsed) return;

    const result = await inventoryService.setBatchSpecialPrice({
      productId: parsed.productId,
      variantId: parsed.variantId,
      batchId: parsed.batchId,
      specialPrice: parsed.specialPrice,
      actorUid: adminCheck.user.uid,
      actorEmail: adminCheck.user.email || adminCheck.user.uid,
    });
    if (!result.ok) {
      return res.status(result.status ?? 400).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, batch: result.batch });
  });

  // --- Warehouse CRUD ---
  router.post('/api/admin/warehouses', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(warehouseUpsertBodySchema, req, res);
    if (!parsed) return;

    const warehouse = await inventoryService.saveWarehouse(
      {
        id: parsed.id?.trim() || `wh_${crypto.randomBytes(4).toString('hex')}`,
        code: parsed.code.toUpperCase(),
        nameFa: parsed.nameFa,
        city: parsed.city,
        address: parsed.address,
        isDefault: parsed.isDefault,
        isActive: parsed.isActive,
      },
      adminCheck.user.uid
    );
    return res.json({ ok: true, warehouse });
  });

  router.delete('/api/admin/warehouses/:id', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'inventory:write');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const result = await inventoryService.deleteWarehouse(String(req.params.id || ''), adminCheck.user.uid);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true });
  });

  // --- RMA Returns ---
  router.get('/api/returns', async (req, res) => {
    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'returns:process') : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
    const mobSession = resolveMobileSession(store, req);

    if (!isAdmin && !fbUser && !mobSession) {
      return res.status(401).json({ ok: false, message: 'برای مشاهده درخواست‌های مرجوعی وارد شوید.' });
    }

    const callerUserIds: string[] = [];
    if (fbUser) callerUserIds.push(fbUser.uid);
    if (mobSession) callerUserIds.push(`mobile:${mobSession.mobile}`);

    const returns = await inventoryService.listReturns({ isAdmin, callerUserIds });
    return res.json({ ok: true, returns });
  });

  router.post('/api/returns', async (req, res) => {
    const parsed = parseRequestBody(returnCreateBodySchema, req, res);
    if (!parsed) return;

    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'returns:process') : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
    const mobSession = resolveMobileSession(store, req);
    const orderToken = parsed.orderToken || extractOrderToken(req);

    const result = await inventoryService.submitReturn({
      orderId: parsed.orderId,
      items: parsed.items,
      reasonFa: parsed.reasonFa,
      resolution: parsed.resolution,
      refundAmount: parsed.refundAmount,
      caller: {
        isAdmin,
        firebaseUid: fbUser?.uid,
        mobileSessionPhone: mobSession?.mobile,
        orderToken,
        customerName: fbUser?.displayName || mobSession?.displayName,
      },
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, returnRequest: result.returnRequest });
  });

  router.post('/api/admin/returns/:id/process', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'returns:process');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }
    const parsed = parseRequestBody(returnProcessBodySchema, req, res);
    if (!parsed) return;

    const result = await inventoryService.processReturn({
      returnId: String(req.params.id || ''),
      status: parsed.status,
      condition: parsed.condition,
      warehouseId: parsed.warehouseId,
      batchNo: parsed.batchNo,
      expiryDate: parsed.expiryDate,
      adminNote: parsed.adminNote,
      adminUid: adminCheck.user.uid,
      adminEmail: adminCheck.user.email || adminCheck.user.uid,
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, message: result.message });
    }
    return res.json({
      ok: true,
      returnRequest: result.returnRequest,
      ...(result.alreadyProcessed ? { alreadyProcessed: true } : {}),
    });
  });

  return router;
}
