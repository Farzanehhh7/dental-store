import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../server';
import type { ServerStore } from '../server/persistence';
import type { PaymentService } from '../server/services/paymentService';
import { getVariantAvailableStock } from '../src/lib/pricing';
import { calculateAuthoritativeCheckout } from '../server/pricing';
import { migrateStockToWarehousesStore } from '../scripts/migrate-stock-warehouses';

let server: http.Server;
let baseUrl = '';
let tmpDir = '';
let store: ServerStore;
let paymentService: PaymentService;

const savedEnv: Record<string, string | undefined> = {};

function captureEnv(keys: string[]) {
  for (const key of keys) savedEnv[key] = process.env[key];
}

function restoreEnv() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

function installFirebaseMock() {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.idToken === 'valid-admin-id-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'admin_uid_1', email: 'warehouse@dentalmarket.ir', emailVerified: true, displayName: 'انباردار' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.idToken === 'valid-user-a-token') {
        return new Response(
          JSON.stringify({
            users: [{ localId: 'user_uid_a', email: 'usera@example.com', emailVerified: true, displayName: 'دکتر الف' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
    }
    if (url.startsWith('https://firestore.googleapis.com/')) {
      if (url.includes('/documents/admins/admin_uid_1')) {
        return new Response(JSON.stringify({ fields: { role: { stringValue: 'warehouse' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    return realFetch(input, init);
  });
}

beforeAll(async () => {
  captureEnv(['SMS_PROVIDER', 'PAYMENT_MODE', 'NODE_ENV', 'RATE_LIMIT_ORDER_PAYMENT_MAX']);
  process.env.RATE_LIMIT_ORDER_PAYMENT_MAX = '200';
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase3-'));
  const created = await createServerApp({ dataDir: tmpDir, attachVite: false });
  store = created.store;
  paymentService = created.paymentService;
  await new Promise<void>((resolve) => {
    server = created.app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  restoreEnv();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_PROVIDER = 'sandbox';
  process.env.PAYMENT_MODE = 'sandbox';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 3 — Atomic Per-Warehouse Stock Model, FEFO, Transfers & RMA Restock', () => {
  it('prevents oversell under concurrent Promise.all order reservations and logs append-only reserve movements', async () => {
    installFirebaseMock();
    // Reset var_rot_25 stock to exact 3 units in default warehouse via admin adjust or direct setup
    const adjSetup = await fetch(`${baseUrl}/api/admin/inventory/stocktake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-id-token',
      },
      body: JSON.stringify({
        productId: 'prod_rotary_files',
        variantId: 'var_rot_25',
        warehouseId: 'wh_teh',
        onHand: 3,
        reason: 'تنظیم تست همزمانی ۳ عدد',
      }),
    });
    expect(adjSetup.status).toBe(200);

    // Fire 10 simultaneous guest orders each requesting 1 unit
    const requests = Array.from({ length: 10 }, (_, idx) =>
      fetch(`${baseUrl}/api/orders/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: `مشتری همزمان ${idx + 1}`,
          customerMobile: `091230000${String(idx).padStart(2, '0')}`,
          items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
          shippingMethod: 'courier_tehran',
          paymentMethod: 'online',
          shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست همزمانی' },
        }),
      })
    );

    const responses = await Promise.all(requests);
    const successes = responses.filter((r) => r.status === 200);
    const rejections = responses.filter((r) => r.status === 400);

    expect(successes).toHaveLength(3);
    expect(rejections).toHaveLength(7);

    const lvl = store.data.stockLevels['wh_teh__var_rot_25'];
    expect(lvl).toBeDefined();
    expect(lvl.onHand).toBe(3);
    expect(lvl.reserved).toBe(3);
    expect(lvl.onHand - lvl.reserved).toBe(0);

    const reserveMoves = store.data.stockMovements.filter(
      (m) => m.variantId === 'var_rot_25' && m.type === 'reserve'
    );
    expect(reserveMoves.length).toBeGreaterThanOrEqual(3);
  });

  it('allocates batches in FEFO order (nearest expiry first), records batch on order line, commits on payment, and releases on expiry', async () => {
    installFirebaseMock();

    const soonDate = new Date(Date.now() + 20 * 86400_000).toISOString();
    const laterDate = new Date(Date.now() + 180 * 86400_000).toISOString();

    // Seed two batches in wh_teh for var_rot_21: LOT-LATER added first, LOT-SOON added second (earlier expiry)
    const rLater = await fetch(`${baseUrl}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_rotary_files',
        variantId: 'var_rot_21',
        warehouseId: 'wh_teh',
        delta: 5,
        type: 'receive',
        batchNo: 'LOT-LATER-99',
        expiryDate: laterDate,
        reason: 'ورود بچ دیرانقضا',
      }),
    });
    expect(rLater.status).toBe(200);

    const rSoon = await fetch(`${baseUrl}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_rotary_files',
        variantId: 'var_rot_21',
        warehouseId: 'wh_teh',
        delta: 2,
        type: 'receive',
        batchNo: 'LOT-SOON-01',
        expiryDate: soonDate,
        reason: 'ورود بچ نزدیک انقضا',
      }),
    });
    expect(rSoon.status).toBe(200);

    // Order qty 3 -> FEFO must pick 2 from LOT-SOON-01 and 1 from LOT-LATER-99
    const ord1Res = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'کلینیک FEFO',
        customerMobile: '09124441122',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_21', quantity: 3 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'ونک' },
      }),
    });
    expect(ord1Res.status).toBe(200);
    const { order: ord1, orderToken: tok1 } = (await ord1Res.json()) as {
      order: {
        id: string;
        items: Array<{
          batchNo?: string;
          batchAllocations?: Array<{ batchNo: string; qty: number; warehouseId: string }>;
        }>;
      };
      orderToken: string;
    };

    expect(ord1.items[0].batchNo).toBe('LOT-SOON-01');
    expect(ord1.items[0].batchAllocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ batchNo: 'LOT-SOON-01', qty: 2, warehouseId: 'wh_teh' }),
        expect.objectContaining({ batchNo: 'LOT-LATER-99', qty: 1, warehouseId: 'wh_teh' }),
      ])
    );

    // Initiate & pay via callback -> commits stock and depletes LOT-SOON-01 to 0
    const initRes = await fetch(`${baseUrl}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Order-Token': tok1 },
      body: JSON.stringify({ orderId: ord1.id, gateway: 'zarinpal' }),
    });
    const initJson = (await initRes.json()) as { sandboxToken: string; session: { authority: string } };
    const cbRes = await fetch(
      `${baseUrl}/api/payments/callback?orderId=${ord1.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=${initJson.sandboxToken}&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    expect(cbRes.status).toBe(200);

    const lvlAfterPay = store.data.stockLevels['wh_teh__var_rot_21'];
    expect(lvlAfterPay.onHand).toBe(4);
    expect(lvlAfterPay.reserved).toBe(0);

    const soonBatch = Object.values(store.data.stockBatches).find(
      (b) => b.variantId === 'var_rot_21' && b.batchNo === 'LOT-SOON-01'
    );
    const laterBatch = Object.values(store.data.stockBatches).find(
      (b) => b.variantId === 'var_rot_21' && b.batchNo === 'LOT-LATER-99'
    );
    expect(soonBatch?.qty).toBe(0);
    expect(laterBatch?.qty).toBe(4);
    expect(store.data.stockMovements.some((m) => m.orderId === ord1.id && m.type === 'commit')).toBe(true);

    // Place another order of qty 2 and let it expire -> release movement restores available & batch reserved
    const ord2Res = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'کلینیک منقضی',
        customerMobile: '09124441133',
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_21', quantity: 2 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'جردن' },
      }),
    });
    const { order: ord2 } = (await ord2Res.json()) as { order: { id: string } };
    expect(store.data.stockLevels['wh_teh__var_rot_21'].reserved).toBe(2);

    store.data.orders[ord2.id].expiresAt = new Date(Date.now() - 60_000).toISOString();
    store.save();
    const sweep = await paymentService.runExpirySweep(new Date());
    expect(sweep.expiredOrderIds).toContain(ord2.id);
    expect(store.data.stockLevels['wh_teh__var_rot_21'].reserved).toBe(0);
    expect(store.data.stockLevels['wh_teh__var_rot_21'].onHand).toBe(4);
    expect(store.data.stockMovements.some((m) => m.orderId === ord2.id && m.type === 'release')).toBe(true);
  });

  it('migrates legacy single-number stock into default warehouse idempotently and reads pricing/availability from stockLevels', async () => {
    const migTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-stock-mig-'));
    try {
      const created = await createServerApp({ dataDir: migTmp, attachVite: false });
      // Clear stockLevels to simulate pre-Phase-3 legacy data
      created.store.data.stockLevels = {};
      created.store.data.stockBatches = {};
      const prod = created.store.data.catalogState.products.find((p) => p.id === 'prod_rotary_files')!;
      const variant = prod.variants.find((v) => v.id === 'var_rot_25')!;
      variant.stockOnHand = 15;
      variant.reserved = 3;

      const dryReport = migrateStockToWarehousesStore(created.store, { dryRun: true });
      expect(dryReport.migratedLevels).toBeGreaterThan(0);
      expect(Object.keys(created.store.data.stockLevels)).toHaveLength(0);

      const liveReport = migrateStockToWarehousesStore(created.store, { dryRun: false });
      expect(liveReport.migratedLevels).toBeGreaterThan(0);
      expect(created.store.data.stockLevels['wh_teh__var_rot_25']?.onHand).toBe(15);
      expect(created.store.data.stockLevels['wh_teh__var_rot_25']?.reserved).toBe(3);

      // Repeat is idempotent
      const repeat = migrateStockToWarehousesStore(created.store, { dryRun: false });
      expect(repeat.migratedLevels).toBe(0);

      // Pricing & availability honor stockLevels over legacy variant numbers
      const allLevels = Object.values(created.store.data.stockLevels);
      expect(getVariantAvailableStock(variant, allLevels)).toBe(12);

      // Drop stockLevel available to 0 while legacy variant number is still 15 -> authoritative checkout rejects
      created.store.data.stockLevels['wh_teh__var_rot_25'].reserved = 15;
      const snap = await created.repos.catalog.getSnapshot();
      const calcBlocked = calculateAuthoritativeCheckout(snap, {
        items: [{ productId: 'prod_rotary_files', variantId: 'var_rot_25', quantity: 1 }],
        shippingMethod: 'courier_tehran',
      });
      expect(calcBlocked.ok).toBe(false);
    } finally {
      fs.rmSync(migTmp, { recursive: true, force: true });
    }
  });

  it('enforces transfer integrity across warehouses, rejects transferring reserved units, and exposes low-stock alerts', async () => {
    installFirebaseMock();

    // Receive 6 units into wh_teh for prod_composite_3m / var_comp_a2 (with batch) and reset warehouse first
    await fetch(`${baseUrl}/api/admin/inventory/stocktake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_composite_3m',
        variantId: 'var_comp_a2',
        warehouseId: 'wh_teh',
        onHand: 6,
        reason: 'تنظیم اولیه برای انتقال بین انبارها',
      }),
    });

    // Reserve 4 units via guest order
    const ordRes = await fetch(`${baseUrl}/api/orders/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'مشتری تست انتقال',
        customerMobile: '09126661122',
        items: [{ productId: 'prod_composite_3m', variantId: 'var_comp_a2', quantity: 4 }],
        shippingMethod: 'courier_tehran',
        paymentMethod: 'online',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'تست' },
      }),
    });
    expect(ordRes.status).toBe(200);

    // Only 2 units available in wh_teh (6 onHand - 4 reserved) -> transferring 3 must FAIL
    const badTransfer = await fetch(`${baseUrl}/api/admin/inventory/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_composite_3m',
        variantId: 'var_comp_a2',
        fromWarehouseId: 'wh_teh',
        toWarehouseId: 'wh_isf',
        quantity: 3,
        reason: 'انتقال غیرمجاز موجودی رزروشده',
      }),
    });
    expect(badTransfer.status).toBe(400);

    // Transferring 2 units succeeds and total onHand across warehouses remains 6
    const goodTransfer = await fetch(`${baseUrl}/api/admin/inventory/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_composite_3m',
        variantId: 'var_comp_a2',
        fromWarehouseId: 'wh_teh',
        toWarehouseId: 'wh_isf',
        quantity: 2,
        reason: 'تامین شعبه اصفهان',
      }),
    });
    expect(goodTransfer.status).toBe(200);
    expect(store.data.stockLevels['wh_teh__var_comp_a2'].onHand).toBe(4);
    expect(store.data.stockLevels['wh_isf__var_comp_a2'].onHand).toBe(2);
    expect(store.data.stockMovements.some((m) => m.type === 'transfer' && m.toWarehouseId === 'wh_isf')).toBe(true);

    // Admin overview lists lowStockAlerts where available <= lowStockThreshold
    const invRes = await fetch(`${baseUrl}/api/admin/inventory?lowStockOnly=true`, {
      headers: { Authorization: 'Bearer valid-admin-id-token' },
    });
    expect(invRes.status).toBe(200);
    const invJson = (await invRes.json()) as {
      ok: boolean;
      lowStockAlerts: Array<{ variantId: string; available: number }>;
    };
    expect(invJson.ok).toBe(true);
    expect(invJson.lowStockAlerts.some((a) => a.variantId === 'var_comp_a2')).toBe(true);
  });

  it('handles RMA restock flow with condition resellable vs damaged and idempotent guard against double restock', async () => {
    installFirebaseMock();

    // Ensure clean 10 units on var_comp_a2 in wh_teh
    await fetch(`${baseUrl}/api/admin/inventory/stocktake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        productId: 'prod_composite_3m',
        variantId: 'var_comp_a2',
        warehouseId: 'wh_teh',
        onHand: 10,
        reason: 'شروع تست مرجوعی',
      }),
    });

    // User A creates 2 orders (qty 2 each), pays both, and admin marks both delivered
    const makeDeliveredOrder = async () => {
      const oRes = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-user-a-token' },
        body: JSON.stringify({
          customerName: 'دکتر الف',
          customerMobile: '09123334455',
          items: [{ productId: 'prod_composite_3m', variantId: 'var_comp_a2', quantity: 2 }],
          shippingMethod: 'courier_tehran',
          paymentMethod: 'online',
          shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1417933111', addressLine: 'سعادت آباد' },
        }),
      });
      const { order } = (await oRes.json()) as { order: { id: string; orderNo: string; items: Array<{ batchNo?: string }> } };
      const init = await fetch(`${baseUrl}/api/payments/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-user-a-token' },
        body: JSON.stringify({ orderId: order.id, gateway: 'zarinpal' }),
      });
      const initJson = (await init.json()) as { sandboxToken: string; session: { authority: string } };
      await fetch(
        `${baseUrl}/api/payments/callback?orderId=${order.id}&Authority=${initJson.session.authority}&Status=OK&sandboxToken=${initJson.sandboxToken}&format=json`,
        { headers: { Accept: 'application/json' } }
      );
      await fetch(`${baseUrl}/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ status: 'shipped' }),
      });
      await fetch(`${baseUrl}/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
        body: JSON.stringify({ status: 'delivered' }),
      });
      return order;
    };

    const ordResell = await makeDeliveredOrder();
    const ordDamaged = await makeDeliveredOrder();
    const onHandAfterSales = store.data.stockLevels['wh_teh__var_comp_a2'].onHand; // 10 - 4 = 6

    // Submit RMA 1 (resellable)
    const rma1Res = await fetch(`${baseUrl}/api/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-user-a-token' },
      body: JSON.stringify({
        orderId: ordResell.id,
        items: [{ productId: 'prod_composite_3m', variantId: 'var_comp_a2', titleFa: 'کامپوزیت 3M', quantity: 2 }],
        reasonFa: 'پلمپ سالم — تعویض رنگ',
        resolution: 'refund',
      }),
    });
    expect(rma1Res.status).toBe(200);
    const { returnRequest: rma1 } = (await rma1Res.json()) as { returnRequest: { id: string } };

    // Approve then receive as resellable -> onHand +2
    await fetch(`${baseUrl}/api/admin/returns/${rma1.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({ status: 'approved' }),
    });
    const rma1Recv = await fetch(`${baseUrl}/api/admin/returns/${rma1.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        status: 'received',
        condition: 'resellable',
        warehouseId: 'wh_teh',
        batchNo: ordResell.items[0].batchNo || 'RMA-BATCH-1',
        adminNote: 'پلمپ تایید و به انبار بازگشت',
      }),
    });
    expect(rma1Recv.status).toBe(200);
    expect(store.data.stockLevels['wh_teh__var_comp_a2'].onHand).toBe(onHandAfterSales + 2);

    // Repeating received must NOT double-restock
    await fetch(`${baseUrl}/api/admin/returns/${rma1.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        status: 'received',
        condition: 'resellable',
        warehouseId: 'wh_teh',
      }),
    });
    expect(store.data.stockLevels['wh_teh__var_comp_a2'].onHand).toBe(onHandAfterSales + 2);

    // Submit RMA 2 (damaged) -> sellable onHand must NOT increase, damaged quarantine recorded
    const rma2Res = await fetch(`${baseUrl}/api/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-user-a-token' },
      body: JSON.stringify({
        orderId: ordDamaged.id,
        items: [{ productId: 'prod_composite_3m', variantId: 'var_comp_a2', titleFa: 'کامپوزیت 3M', quantity: 2 }],
        reasonFa: 'آسیب بسته‌بندی حین ارسال',
        resolution: 'replacement',
      }),
    });
    const { returnRequest: rma2 } = (await rma2Res.json()) as { returnRequest: { id: string } };
    await fetch(`${baseUrl}/api/admin/returns/${rma2.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({ status: 'approved' }),
    });
    const rma2Recv = await fetch(`${baseUrl}/api/admin/returns/${rma2.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-id-token' },
      body: JSON.stringify({
        status: 'received',
        condition: 'damaged',
        warehouseId: 'wh_teh',
        adminNote: 'قرنطینه ضایعات',
      }),
    });
    expect(rma2Recv.status).toBe(200);
    expect(store.data.stockLevels['wh_teh__var_comp_a2'].onHand).toBe(onHandAfterSales + 2);
    expect(
      store.data.stockMovements.some((m) => m.returnId === rma2.id && m.type === 'return' && m.condition === 'damaged' && m.delta === 0)
    ).toBe(true);
  });
});
