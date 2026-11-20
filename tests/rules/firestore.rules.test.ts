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

    // Valid order create -> ALLOWED
    await assertSucceeds(
      setDoc(doc(userADb, 'orders', 'ord_valid_1'), makeOrderPayload())
    );

    // Update shortcutting to paid -> DENIED
    await assertFails(
      updateDoc(doc(userADb, 'orders', 'order-of-user-a'), {
        status: 'paid',
        updatedAt: serverTimestamp(),
      })
    );
    // Customer cancelling own pending order -> ALLOWED
    await assertSucceeds(
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
});
