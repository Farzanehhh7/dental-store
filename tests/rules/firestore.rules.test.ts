import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'dental-store-rules-test';

function parseEmulatorHost(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, portStr] = raw.split(':');
  return {
    host: host || '127.0.0.1',
    port: Number(portStr) || 8080,
  };
}

function makeOrderPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_valid_1',
    orderNo: 'DM-2026-10001',
    userId: 'user_a',
    customerName: 'دکتر احمدی',
    customerMobile: '09121112233',
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    paymentMethod: 'online',
    subtotal: 3450000,
    discountTotal: 0,
    shippingTotal: 120000,
    taxTotal: 345000,
    grandTotal: 3915000,
    items: [
      {
        productId: 'prod_rotary_files',
        variantId: 'var_rot_25',
        quantity: 1,
        unitPrice: 3450000,
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const { host, port } = parseEmulatorHost();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host,
      port,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'admins', 'admin_1'), { role: 'admin' });
    await setDoc(doc(db, 'admins', 'super_1'), { role: 'super_admin' });
    await setDoc(doc(db, 'admins', 'unverified_admin'), { role: 'admin' });

    await setDoc(doc(db, 'products', 'prod-1'), {
      id: 'prod-1',
      titleFa: 'کامپوزیت دندانی تست',
      status: 'active',
    });
    await setDoc(doc(db, 'users', 'user_a'), {
      uid: 'user_a',
      customerGroup: 'retail',
      accountType: 'clinic',
      b2bStatus: 'none',
      isBlocked: false,
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
    });
    await setDoc(doc(db, 'users', 'user_b'), {
      uid: 'user_b',
      customerGroup: 'dentist',
      accountType: 'individual',
      b2bStatus: 'approved',
      isBlocked: false,
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
    });
    await setDoc(doc(db, 'orders', 'order-of-user-a'), {
      ...makeOrderPayload({
        id: 'order-of-user-a',
        userId: 'user_a',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      }),
    });
    await setDoc(doc(db, 'orders', 'order-of-user-b'), {
      ...makeOrderPayload({
        id: 'order-of-user-b',
        userId: 'user_b',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      }),
    });
    await setDoc(doc(db, 'auditLogs', 'log-1'), {
      id: 'log-1',
      actorUid: 'admin_1',
      action: 'seed',
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
    });
  });
});

describe('Firestore Security Rules (security_spec.md Dirty Dozen & Invariants)', () => {
  it('denies unauthenticated read/write on private data & catalog mutations while allowing active catalog get', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const adminDb = testEnv.authenticatedContext('admin_1', { email_verified: true }).firestore();

    // Attack 1: Anonymous write to /products/prod-1 -> DENIED
    await assertFails(setDoc(doc(anonDb, 'products', 'prod-1'), { id: 'prod-1', titleFa: 'Hacked' }));
    // Unauthenticated read of private user/order/audit documents -> DENIED
    await assertFails(getDoc(doc(anonDb, 'users', 'user_a')));
    await assertFails(getDoc(doc(anonDb, 'orders', 'order-of-user-a')));
    await assertFails(getDoc(doc(anonDb, 'auditLogs', 'log-1')));
    // Default-deny catches unknown collections even for admins
    await assertFails(setDoc(doc(adminDb, 'unknownCollection', 'doc-1'), { foo: 'bar' }));
    await assertFails(getDoc(doc(anonDb, 'unknownCollection', 'doc-1')));
    // Public catalog read allowed
    await assertSucceeds(getDoc(doc(anonDb, 'products', 'prod-1')));
  });

  it('rejects extra/unknown fields on user profile creation (hasOnly) and allows valid create', async () => {
    const userNewDb = testEnv
      .authenticatedContext('user_new', { email_verified: true })
      .firestore();

    // Attack 2: Shadow Field Injection (isAdmin: true) -> DENIED
    await assertFails(
      setDoc(doc(userNewDb, 'users', 'user_new'), {
        uid: 'user_new',
        customerGroup: 'retail',
        accountType: 'clinic',
        b2bStatus: 'none',
        isAdmin: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Valid profile create -> ALLOWED
    await assertSucceeds(
      setDoc(doc(userNewDb, 'users', 'user_new'), {
        uid: 'user_new',
        customerGroup: 'retail',
        accountType: 'clinic',
        b2bStatus: 'none',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('prevents user from escalating customerGroup, b2bStatus, or role while permitting safe profile edits', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();

    // Attack 3: Self-privilege escalation -> DENIED
    await assertFails(
      updateDoc(doc(userADb, 'users', 'user_a'), {
        customerGroup: 'wholesale',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(userADb, 'users', 'user_a'), {
        b2bStatus: 'approved',
        updatedAt: serverTimestamp(),
      })
    );

    // Allowed profile fields update -> ALLOWED
    await assertSucceeds(
      updateDoc(doc(userADb, 'users', 'user_a'), {
        displayName: 'کلینیک دندانپزشکی پارس',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('denies reading or writing another user order (IDOR) and allows reading own order', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();

    // Attack 4: Cross-user read & write -> DENIED
    await assertFails(getDoc(doc(userADb, 'orders', 'order-of-user-b')));
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'order-forged-b'),
        makeOrderPayload({ id: 'order-forged-b', userId: 'user_b' })
      )
    );
    await assertFails(
      updateDoc(doc(userADb, 'orders', 'order-of-user-b'), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      })
    );

    // Own order read -> ALLOWED
    await assertSucceeds(getDoc(doc(userADb, 'orders', 'order-of-user-a')));
  });

  it('enforces order create/update state machine, createdAt == request.time, hasOnly, and no deletes', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();

    // Attack 5: status: 'paid' or paymentStatus: 'paid' -> DENIED
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'ord-paid-bypass'),
        makeOrderPayload({ id: 'ord-paid-bypass', status: 'paid' })
      )
    );
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'ord-paystatus-bypass'),
        makeOrderPayload({ id: 'ord-paystatus-bypass', paymentStatus: 'paid' })
      )
    );
    // Backdated createdAt != request.time -> DENIED
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'ord-backdated'),
        makeOrderPayload({
          id: 'ord-backdated',
          createdAt: Timestamp.fromMillis(1_600_000_000_000),
        })
      )
    );
    // Unknown extra field -> DENIED (hasOnly)
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'ord-extra-field'),
        makeOrderPayload({ id: 'ord-extra-field', hackedDiscount: 999999 })
      )
    );

    // Direct client order create -> DENIED (orders are created solely by Express server via Admin SDK)
    await assertFails(
      setDoc(doc(userADb, 'orders', 'ord_valid_1'), makeOrderPayload())
    );

    // Update shortcutting to paid -> DENIED
    await assertFails(
      updateDoc(doc(userADb, 'orders', 'order-of-user-a'), {
        status: 'paid',
        updatedAt: serverTimestamp(),
      })
    );
    // Customer direct update/cancel in Firestore -> DENIED (must go through POST /api/orders/:id/cancel)
    await assertFails(
      updateDoc(doc(userADb, 'orders', 'order-of-user-a'), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      })
    );
    // Order delete -> DENIED
    await assertFails(deleteDoc(doc(userADb, 'orders', 'order-of-user-a')));
  });

  it('blocks review auto-approval bypass and allows pending reviews with request.time', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();

    // Attack 6: status: 'approved' -> DENIED
    await assertFails(
      setDoc(doc(userADb, 'reviews', 'rev-1'), {
        id: 'rev-1',
        productId: 'prod-1',
        userId: 'user_a',
        authorName: 'دکتر الف',
        rating: 5,
        body: 'کیفیت بسیار خوب',
        status: 'approved',
        createdAt: serverTimestamp(),
      })
    );

    // Valid pending review -> ALLOWED
    await assertSucceeds(
      setDoc(doc(userADb, 'reviews', 'rev-2'), {
        id: 'rev-2',
        productId: 'prod-1',
        userId: 'user_a',
        authorName: 'دکتر الف',
        rating: 5,
        body: 'کیفیت بسیار خوب',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('blocks unverified email spoof even when admins/{uid} exists', async () => {
    const unverifiedAdminDb = testEnv
      .authenticatedContext('unverified_admin', { email_verified: false })
      .firestore();

    // Attack 7: email_verified == false -> DENIED
    await assertFails(
      setDoc(doc(unverifiedAdminDb, 'products', 'prod-2'), {
        id: 'prod-2',
        titleFa: 'محصول جعلی',
        status: 'active',
      })
    );
  });

  it('rejects oversized or malformed document IDs (ID poisoning) and backdated ticket timestamps', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();

    // Attack 8: > 128 char doc ID -> DENIED
    const longId = 'a'.repeat(200);
    await assertFails(
      setDoc(
        doc(userADb, 'orders', longId),
        makeOrderPayload({ id: longId })
      )
    );

    // Attack 9: Backdated createdAt on tickets -> DENIED
    await assertFails(
      setDoc(doc(userADb, 'tickets', 't-1'), {
        id: 't-1',
        ticketNo: 'TK-1001',
        userId: 'user_a',
        subject: 'پیگیری ارسال',
        department: 'support',
        priority: 'normal',
        status: 'open',
        messages: [{ authorName: 'کاربر', body: 'سلام', createdAt: '2026-01-01T00:00:00Z' }],
        createdAt: Timestamp.fromMillis(1_600_000_000_000),
        updatedAt: serverTimestamp(),
      })
    );

    // Valid ticket create -> ALLOWED
    await assertSucceeds(
      setDoc(doc(userADb, 'tickets', 't-2'), {
        id: 't-2',
        ticketNo: 'TK-1002',
        userId: 'user_a',
        subject: 'پیگیری ارسال',
        department: 'support',
        priority: 'normal',
        status: 'open',
        messages: [{ authorName: 'کاربر', body: 'سلام', createdAt: '2026-01-01T00:00:00Z' }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('enforces append-only immutable auditLogs', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_1', { email_verified: true })
      .firestore();

    // Non-admin cannot create or read auditLogs
    await assertFails(
      setDoc(doc(userADb, 'auditLogs', 'log-user'), {
        id: 'log-user',
        actorUid: 'user_a',
        action: 'spoof',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(getDoc(doc(userADb, 'auditLogs', 'log-1')));

    // Verified admin can append auditLog with own actorUid and request.time
    await assertSucceeds(
      setDoc(doc(adminDb, 'auditLogs', 'log-2'), {
        id: 'log-2',
        actorUid: 'admin_1',
        action: 'product.updated',
        createdAt: serverTimestamp(),
      })
    );

    // Attack 10: Admin cannot update or delete auditLogs -> DENIED
    await assertFails(updateDoc(doc(adminDb, 'auditLogs', 'log-1'), { action: 'tampered' }));
    await assertFails(deleteDoc(doc(adminDb, 'auditLogs', 'log-1')));
  });

  it('restricts catalog writes and admin registry to verified admins/{uid} (no email fallback)', async () => {
    // User with verified email but NO admins/{uid} doc -> DENIED
    const nonAdminWithClaimDb = testEnv
      .authenticatedContext('regular_user', {
        email: 'admin@example.com',
        email_verified: true,
      })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_1', { email_verified: true })
      .firestore();
    const superAdminDb = testEnv
      .authenticatedContext('super_1', { email_verified: true })
      .firestore();

    // Non-admin cannot write catalog
    await assertFails(
      setDoc(doc(nonAdminWithClaimDb, 'products', 'prod-3'), {
        id: 'prod-3',
        titleFa: 'غیرمجاز',
        status: 'active',
      })
    );
    await assertFails(
      setDoc(doc(nonAdminWithClaimDb, 'categories', 'cat-hack'), {
        id: 'cat-hack',
        nameFa: 'دسته غیرمجاز',
        isActive: true,
      })
    );

    // Attack 11: Non-super-admin (regular user or regular admin) cannot write /admins/hacker-uid -> DENIED
    await assertFails(setDoc(doc(nonAdminWithClaimDb, 'admins', 'hacker-uid'), { role: 'super_admin' }));
    await assertFails(setDoc(doc(adminDb, 'admins', 'hacker-uid'), { role: 'admin' }));

    // Verified admin in admins/{uid} can write catalog; super_admin can add admin record
    await assertSucceeds(
      setDoc(doc(adminDb, 'products', 'prod-admin'), {
        id: 'prod-admin',
        titleFa: 'محصول تاییدشده مدیر',
        status: 'active',
      })
    );
    await assertSucceeds(setDoc(doc(superAdminDb, 'admins', 'staff_sales'), { role: 'sales_mgr' }));
  });

  it('prevents blanket collection scraping on /users while allowing admins to list', async () => {
    const userADb = testEnv
      .authenticatedContext('user_a', { email_verified: true })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_1', { email_verified: true })
      .firestore();

    // Attack 12: Non-admin list on /users -> DENIED
    await assertFails(getDocs(collection(userADb, 'users')));
    // Admin list on /users -> ALLOWED
    await assertSucceeds(getDocs(collection(adminDb, 'users')));
  });

  // --- Phase 0 Rules Regressions (RED until Firestore rules are hardened) ---
  it('[Phase 0 - Claim 9] denies unauthenticated public create/update on notFoundLogs', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(anonDb, 'notFoundLogs', 'nf_poison_1'), {
        id: 'nf_poison_1',
        path: '/poisoned-path',
        hitCount: 9999,
        lastSeenAt: new Date().toISOString(),
      })
    );
  });

  it('[Phase 0 - Claim 5] blocks direct client order creation and tampered negative subtotals', async () => {
    const userADb = testEnv.authenticatedContext('user_a', { email_verified: true }).firestore();
    await assertFails(
      setDoc(
        doc(userADb, 'orders', 'ord_client_direct'),
        makeOrderPayload({ id: 'ord_client_direct', subtotal: -500000, grandTotal: 1 })
      )
    );
  });

  it('[Phase 0 - Missed Rules Holes] blocks unauthenticated get on draft products/inactive coupons and user status overwrite on tickets', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'products', 'prod-draft-secret'), {
        id: 'prod-draft-secret',
        titleFa: 'محصول محرمانه پیش‌نویس',
        status: 'draft',
      });
      await setDoc(doc(db, 'coupons', 'cpn-hidden'), {
        id: 'cpn-hidden',
        code: 'SECRET99',
        isActive: false,
      });
      await setDoc(doc(db, 'tickets', 't-existing'), {
        id: 't-existing',
        ticketNo: 'TK-9001',
        userId: 'user_a',
        subject: 'مشکل سفارش',
        department: 'support',
        priority: 'normal',
        status: 'open',
        messages: [{ authorName: 'پشتیبان', body: 'پاسخ ادمین', createdAt: '2026-01-01T00:00:00Z' }],
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      });
    });

    const anonDb = testEnv.unauthenticatedContext().firestore();
    const userADb = testEnv.authenticatedContext('user_a', { email_verified: true }).firestore();

    // Unauthenticated get on draft product and inactive coupon must fail
    await assertFails(getDoc(doc(anonDb, 'products', 'prod-draft-secret')));
    await assertFails(getDoc(doc(anonDb, 'coupons', 'cpn-hidden')));

    // User must not self-close/resolve tickets via direct client update
    await assertFails(
      updateDoc(doc(userADb, 'tickets', 't-existing'), {
        status: 'resolved',
        messages: [],
        updatedAt: serverTimestamp(),
      })
    );
  });

  // --- Phase 3 Rules Coverage (Atomic Inventory & RMA Returns are server-written only) ---
  it('[Phase 3] denies direct client writes to stockLevels, stockBatches, stockMovements, warehouses, and returns while allowing scoped reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'stockLevels', 'wh_teh__var_1'), {
        id: 'wh_teh__var_1',
        productId: 'prod-1',
        variantId: 'var_1',
        warehouseId: 'wh_teh',
        onHand: 10,
        reserved: 0,
        lowStockThreshold: 2,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(db, 'returns', 'ret_user_a'), {
        id: 'ret_user_a',
        returnNo: 'RMA-2026-1001',
        orderId: 'order-of-user-a',
        orderNo: 'DM-2026-10001',
        userId: 'user_a',
        customerName: 'دکتر احمدی',
        items: [{ productId: 'prod-1', variantId: 'var_1', titleFa: 'کامپوزیت', quantity: 1 }],
        reasonFa: 'آسیب بسته‌بندی',
        resolution: 'refund',
        status: 'requested',
        refundAmount: 1000000,
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      });
    });

    const userADb = testEnv.authenticatedContext('user_a', { email_verified: true }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_1', { email_verified: true }).firestore();

    // Non-admin cannot read stockLevels; admin can read
    await assertFails(getDoc(doc(userADb, 'stockLevels', 'wh_teh__var_1')));
    await assertSucceeds(getDoc(doc(adminDb, 'stockLevels', 'wh_teh__var_1')));

    // Even verified admins cannot write stockLevels/stockBatches/stockMovements/warehouses/returns directly from client
    await assertFails(
      setDoc(doc(adminDb, 'stockLevels', 'wh_teh__var_hack'), {
        id: 'wh_teh__var_hack',
        productId: 'prod-1',
        variantId: 'var_1',
        warehouseId: 'wh_teh',
        onHand: 999,
        reserved: 0,
      })
    );
    await assertFails(
      setDoc(doc(adminDb, 'stockBatches', 'batch_hack'), {
        id: 'batch_hack',
        batchNo: 'LOT-HACK',
      })
    );
    await assertFails(
      setDoc(doc(adminDb, 'stockMovements', 'sm_hack'), {
        id: 'sm_hack',
        delta: 100,
      })
    );
    await assertFails(
      setDoc(doc(adminDb, 'warehouses', 'wh_hack'), {
        id: 'wh_hack',
        code: 'HACK',
      })
    );

    // Owner can read their return request, but neither owner nor admin can mutate returns directly
    await assertSucceeds(getDoc(doc(userADb, 'returns', 'ret_user_a')));
    await assertFails(
      updateDoc(doc(userADb, 'returns', 'ret_user_a'), {
        status: 'refunded',
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, 'returns', 'ret_user_a'), {
        status: 'received',
      })
    );
  });

  it('[Phase 4] enforces server-only telemetry/subscriptions, locks productCosts & auditLogs from public/non-admin, and blocks role escalation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'admins', 'warehouse_1'), { role: 'warehouse' });
      await setDoc(doc(db, 'admins', 'accountant_1'), { role: 'accountant' });
      await setDoc(doc(db, 'productCosts', 'prod-1'), {
        productId: 'prod-1',
        variantCosts: { 'var-1': 450000 },
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(db, 'notFoundLogs', 'nf_1'), {
        id: 'nf_1',
        path: '/missing-item',
        hitCount: 2,
        lastSeenAt: '2026-01-01T00:00:00.000Z',
      });
    });

    const anonDb = testEnv.unauthenticatedContext().firestore();
    const userADb = testEnv.authenticatedContext('user_a', { email_verified: true }).firestore();
    const warehouseDb = testEnv.authenticatedContext('warehouse_1', { email_verified: true }).firestore();
    const accountantDb = testEnv.authenticatedContext('accountant_1', { email_verified: true }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_1', { email_verified: true }).firestore();

    // 1. notFoundLogs, newsletterSubscribers, stockNotifications are not client-creatable/updatable
    await assertFails(
      setDoc(doc(anonDb, 'notFoundLogs', 'nf_anon'), { id: 'nf_anon', path: '/x', hitCount: 1, lastSeenAt: 'now' })
    );
    await assertFails(
      setDoc(doc(userADb, 'notFoundLogs', 'nf_user'), { id: 'nf_user', path: '/x', hitCount: 1, lastSeenAt: 'now' })
    );
    await assertFails(
      updateDoc(doc(adminDb, 'notFoundLogs', 'nf_1'), { hitCount: 99 })
    );
    await assertFails(
      setDoc(doc(anonDb, 'newsletterSubscribers', 'sub_anon'), {
        id: 'sub_anon',
        contact: 'spam@example.com',
        type: 'email',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
    await assertFails(
      setDoc(doc(anonDb, 'stockNotifications', 'sn_anon'), {
        id: 'sn_anon',
        productId: 'prod-1',
        productTitleFa: 'کامپوزیت',
        mobile: '09123456789',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );

    // 2. productCosts blocked for anon, regular users, and warehouse role; allowed for accountant/admin
    await assertFails(getDoc(doc(anonDb, 'productCosts', 'prod-1')));
    await assertFails(getDoc(doc(userADb, 'productCosts', 'prod-1')));
    await assertFails(getDoc(doc(warehouseDb, 'productCosts', 'prod-1')));
    await assertSucceeds(getDoc(doc(accountantDb, 'productCosts', 'prod-1')));
    await assertSucceeds(getDoc(doc(adminDb, 'productCosts', 'prod-1')));

    // 3. auditLogs blocked for anon and regular users
    await assertFails(getDoc(doc(anonDb, 'auditLogs', 'log-1')));
    await assertFails(getDoc(doc(userADb, 'auditLogs', 'log-1')));
    await assertFails(getDocs(collection(userADb, 'auditLogs')));

    // 4. orders client write denied even for verified admin (must go through Express server)
    await assertFails(setDoc(doc(adminDb, 'orders', 'ord_client_admin'), makeOrderPayload({ id: 'ord_client_admin' })));
    await assertFails(setDoc(doc(anonDb, 'orders', 'ord_client_anon'), makeOrderPayload({ id: 'ord_client_anon' })));

    // 5. Role escalation denied: warehouse admin cannot promote self in /admins/{uid}
    await assertFails(setDoc(doc(warehouseDb, 'admins', 'warehouse_1'), { role: 'super_admin' }));
  });
});
