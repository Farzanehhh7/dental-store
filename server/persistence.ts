import fs from 'node:fs';
import path from 'node:path';
import {
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
  SEED_CONTRACT_PRICES,
  SEED_PAYMENT_LEDGER,
  SEED_RETURNS,
  SEED_STOCK_MOVEMENTS,
  SEED_WAREHOUSES,
} from '../src/data/expandedCatalog';
import {
  SEED_AGENTS,
  SEED_BLOG_POSTS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_COUPONS,
  SEED_REDIRECTS,
  SEED_SETTINGS,
} from '../src/data/seed';
import {
  AgentBranch,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  Category,
  ContractPrice,
  Coupon,
  CustomerGroupCode,
  Order,
  PaymentLedgerEntry,
  PaymentSessionStatus,
  Product,
  ProformaInvoice,
  RedirectRule,
  ReturnRequest,
  RfqRequest,
  SiteSettings,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  Warehouse,
} from '../src/types/domain';
import { migrateStockToWarehousesData } from '../scripts/migrate-stock-warehouses';

export interface ServerCatalogSnapshot {
  categories: Category[];
  brands: Brand[];
  products: Product[];
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  redirects: RedirectRule[];
  coupons: Coupon[];
  contractPrices: ContractPrice[];
  settings: SiteSettings;
  warehouses?: Warehouse[];
  stockLevels?: StockLevel[];
  stockBatches?: StockBatchRecord[];
  updatedAt: string;
}

export interface OtpChallengeRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

export interface OtpVerifiedTokenRecord {
  tokenHash: string;
  mobile: string;
  expiresAt: number;
  consumedAt?: string;
}

export interface MobileSessionRecord {
  tokenHash: string;
  mobile: string;
  displayName?: string;
  createdAt: string;
  expiresAt: number;
}

export interface ServerPaymentSession {
  authority: string;
  orderId: string;
  orderNo: string;
  amount: number;
  gateway: 'zarinpal' | 'idpay';
  mode: 'sandbox' | 'live';
  idempotencyKey: string;
  status: PaymentSessionStatus;
  sandboxTokenHash?: string;
  redirectUrl?: string;
  ownerUid?: string;
  ownerMobile?: string;
  refId?: string;
  expiresAt: string;
  createdAt: string;
  verifiedAt?: string;
  webhookProcessedAt?: string;
}

export interface VerifiedOrderPaymentState {
  orderId: string;
  orderNo: string;
  status: 'paid';
  paymentStatus: 'paid';
  refId: string;
  gateway: string;
  amount: number;
  verifiedAt: string;
}

export interface ServerUserGroupRecord {
  key: string;
  uid?: string;
  mobile?: string;
  customerGroup: CustomerGroupCode;
  b2bStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'needs_info';
  displayName?: string;
  updatedAt: string;
}

export interface ServerAuditLogRecord {
  id: string;
  actorType: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface PersistedServerData {
  catalogState: ServerCatalogSnapshot;
  warehouses: Warehouse[];
  stockLevels: Record<string, StockLevel>;
  stockBatches: Record<string, StockBatchRecord>;
  stockMovements: StockMovement[];
  returns: Record<string, ReturnRequest>;
  otpChallenges: Record<string, OtpChallengeRecord>;
  otpVerifiedTokens: Record<string, OtpVerifiedTokenRecord>;
  mobileSessions: Record<string, MobileSessionRecord>;
  paymentSessions: Record<string, ServerPaymentSession>;
  paymentLedger: PaymentLedgerEntry[];
  verifiedOrderStatuses: Record<string, VerifiedOrderPaymentState>;
  orders: Record<string, Order>;
  proformas: Record<string, ProformaInvoice>;
  userGroups: Record<string, ServerUserGroupRecord>;
  paymentWebhookEvents: Record<string, string>;
  auditLogs: ServerAuditLogRecord[];
  guestOrders?: Record<string, Order>;
  rfqs: Record<string, RfqRequest>;
}

function cloneCatalogProducts(products: Product[]): Product[] {
  return products.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      reserved: 0,
      ...(v.batches ? { batches: v.batches.map((b) => ({ ...b })) } : {}),
    })),
  }));
}

function createInitialData(): PersistedServerData {
  const initialReturns: Record<string, ReturnRequest> = {};
  for (const ret of SEED_RETURNS) {
    initialReturns[ret.id] = { ...ret, items: ret.items.map((it) => ({ ...it })) };
  }

  const data: PersistedServerData = {
    catalogState: {
      categories: EXPANDED_CATEGORIES,
      brands: EXPANDED_BRANDS,
      products: cloneCatalogProducts(EXPANDED_PRODUCTS),
      campaigns: SEED_CAMPAIGNS,
      bundles: SEED_BUNDLES,
      agents: SEED_AGENTS,
      blogPosts: SEED_BLOG_POSTS,
      redirects: SEED_REDIRECTS,
      coupons: SEED_COUPONS,
      contractPrices: SEED_CONTRACT_PRICES,
      settings: SEED_SETTINGS,
      updatedAt: new Date().toISOString(),
    },
    warehouses: SEED_WAREHOUSES.map((w) => ({ ...w })),
    stockLevels: {},
    stockBatches: {},
    stockMovements: SEED_STOCK_MOVEMENTS.map((m) => ({
      ...m,
      warehouseId: m.warehouseId ?? 'wh_teh',
    })),
    returns: initialReturns,
    otpChallenges: {},
    otpVerifiedTokens: {},
    mobileSessions: {},
    paymentSessions: {},
    paymentLedger: [...SEED_PAYMENT_LEDGER],
    verifiedOrderStatuses: {},
    orders: {},
    proformas: {},
    userGroups: {},
    paymentWebhookEvents: {},
    auditLogs: [],
    rfqs: {},
  };

  migrateStockToWarehousesData(data, { dryRun: false });
  return data;
}

export interface ServerStore {
  readonly filePath: string;
  data: PersistedServerData;
  save(): void;
  pruneExpired(): void;
}

export function createServerStore(dataDir?: string): ServerStore {
  const resolvedDir = path.resolve(process.cwd(), dataDir || process.env.DATA_DIR || '.data');
  const filePath = path.join(resolvedDir, 'store.json');

  let data = createInitialData();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as Partial<PersistedServerData>;
        const defaults = createInitialData();
        const unifiedOrders: Record<string, Order> = { ...(parsed.orders ?? {}) };
        if (parsed.guestOrders && typeof parsed.guestOrders === 'object') {
          for (const legacyOrder of Object.values(parsed.guestOrders)) {
            if (legacyOrder?.id && !unifiedOrders[legacyOrder.id]) {
              const inferredSource = legacyOrder.source ?? (legacyOrder.userId?.startsWith('mobile:') ? 'otp' : 'guest');
              unifiedOrders[legacyOrder.id] = { ...legacyOrder, source: inferredSource };
            }
          }
        }
        data = {
          catalogState: {
            ...defaults.catalogState,
            ...(parsed.catalogState ?? {}),
            settings: parsed.catalogState?.settings ?? defaults.catalogState.settings,
            coupons: Array.isArray(parsed.catalogState?.coupons) ? parsed.catalogState.coupons : defaults.catalogState.coupons,
            contractPrices: Array.isArray(parsed.catalogState?.contractPrices)
              ? parsed.catalogState.contractPrices
              : defaults.catalogState.contractPrices,
          },
          warehouses:
            Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0 ? parsed.warehouses : defaults.warehouses,
          stockLevels: parsed.stockLevels && typeof parsed.stockLevels === 'object' ? parsed.stockLevels : {},
          stockBatches: parsed.stockBatches && typeof parsed.stockBatches === 'object' ? parsed.stockBatches : {},
          stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : defaults.stockMovements,
          returns: parsed.returns && typeof parsed.returns === 'object' ? parsed.returns : defaults.returns,
          otpChallenges: parsed.otpChallenges ?? {},
          otpVerifiedTokens: parsed.otpVerifiedTokens ?? {},
          mobileSessions: parsed.mobileSessions ?? {},
          paymentSessions: parsed.paymentSessions ?? {},
          paymentLedger: Array.isArray(parsed.paymentLedger) ? parsed.paymentLedger : defaults.paymentLedger,
          verifiedOrderStatuses: parsed.verifiedOrderStatuses ?? {},
          orders: unifiedOrders,
          proformas: parsed.proformas ?? {},
          userGroups: parsed.userGroups ?? {},
          paymentWebhookEvents: parsed.paymentWebhookEvents ?? {},
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          ...(parsed.guestOrders ? { guestOrders: parsed.guestOrders } : {}),
          rfqs: parsed.rfqs ?? {},
        };

        migrateStockToWarehousesData(data, { dryRun: false });
      }
    }
  } catch (err) {
    console.warn('Warning: failed to load persisted server store, using fresh defaults:', err);
  }

  const store: ServerStore = {
    filePath,
    data,
    save() {
      fs.mkdirSync(resolvedDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(store.data, null, 2), 'utf8');
      fs.renameSync(tmpPath, filePath);
    },
    pruneExpired() {
      const now = Date.now();
      let changed = false;
      for (const [k, v] of Object.entries(store.data.otpChallenges)) {
        if (v.expiresAt <= now) {
          delete store.data.otpChallenges[k];
          changed = true;
        }
      }
      for (const [k, v] of Object.entries(store.data.otpVerifiedTokens)) {
        if (v.expiresAt <= now) {
          delete store.data.otpVerifiedTokens[k];
          changed = true;
        }
      }
      for (const [k, v] of Object.entries(store.data.mobileSessions)) {
        if (v.expiresAt <= now) {
          delete store.data.mobileSessions[k];
          changed = true;
        }
      }
      if (changed) store.save();
    },
  };

  return store;
}
