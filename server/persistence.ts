import fs from 'node:fs';
import path from 'node:path';
import {
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
  SEED_CONTRACT_PRICES,
  SEED_PAGES,
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
  AbandonedCartRecord,
  AgentBranch,
  BlogPost,
  Brand,
  Bundle,
  Campaign,
  CampaignRun,
  Category,
  ContractPrice,
  Coupon,
  CustomerGroupCode,
  MarketingConsentRecord,
  NewsletterSubscriber,
  NotFoundLog,
  Order,
  OutboxMessage,
  PaymentLedgerEntry,
  PaymentSessionStatus,
  Product,
  ProformaInvoice,
  RedirectRule,
  ReturnRequest,
  RfqRequest,
  SitePage,
  SiteSettings,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  StockNotification,
  SuppressionEntry,
  Warehouse,
} from '../src/types/domain';
import type { ImportJobRecord } from '../src/pages/admin/importExport/types';
import { migrateStockToWarehousesData } from '../scripts/migrate-stock-warehouses';

function normalizeCatalogImageUrl(url: string): string {
  const clean = (url || '').trim();
  if (clean.startsWith('/src/assets/images/')) {
    return `/assets/images/${clean.slice('/src/assets/images/'.length)}`;
  }
  return clean;
}

export interface ServerCatalogSnapshot {
  categories: Category[];
  brands: Brand[];
  products: Product[];
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  pages: SitePage[];
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

export interface OtpLockoutRecord {
  lockedUntil: number;
  failedAttempts: number;
  reason?: string;
}

export interface UploadedFileRecord {
  id: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose: 'b2b_doc' | 'catalog_asset' | 'banner' | 'certificate';
  ownerUid: string;
  createdAt: string;
}

export interface ServerAuditLogRecord {
  id: string;
  actorType: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
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
  otpLockouts: Record<string, OtpLockoutRecord>;
  otpPhoneSendHistory: Record<string, number[]>;
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
  notFoundLogs: Record<string, NotFoundLog>;
  newsletterSubscribers: Record<string, NewsletterSubscriber>;
  stockNotifications: Record<string, StockNotification>;
  uploadedFiles: Record<string, UploadedFileRecord>;
  guestOrders?: Record<string, Order>;
  rfqs: Record<string, RfqRequest>;
  importJobs: ImportJobRecord[];
  outboxMessages: Record<string, OutboxMessage>;
  campaignRuns: Record<string, CampaignRun>;
  marketingConsents: Record<string, MarketingConsentRecord>;
  suppressionList: Record<string, SuppressionEntry>;
  abandonedCarts: Record<string, AbandonedCartRecord>;
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
      pages: SEED_PAGES.map((p) => ({ ...p })),
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
    otpLockouts: {},
    otpPhoneSendHistory: {},
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
    notFoundLogs: {},
    newsletterSubscribers: {},
    stockNotifications: {},
    uploadedFiles: {},
    rfqs: {},
    importJobs: [],
    outboxMessages: {},
    campaignRuns: {},
    marketingConsents: {},
    suppressionList: {},
    abandonedCarts: {},
  };

  migrateStockToWarehousesData(data, { dryRun: false });
  return data;
}

export interface ServerStore {
  readonly filePath: string;
  readonly persistenceMode: 'file' | 'memory';
  data: PersistedServerData;
  save(): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
  getWriteStats(): { scheduledSaves: number; completedFlushes: number; dirty: boolean };
  pruneExpired(): void;
}

export interface CreateServerStoreOptions {
  persistenceMode?: 'file' | 'memory';
  writeDebounceMs?: number;
}

const activeStoresByFilePath = new Map<string, Set<ServerStore>>();

export async function flushPendingStoresForDir(dataDir?: string): Promise<void> {
  const resolvedDir = path.resolve(process.cwd(), dataDir || process.env.DATA_DIR || '.data');
  const filePath = path.join(resolvedDir, 'store.json');
  const stores = activeStoresByFilePath.get(filePath);
  if (!stores || stores.size === 0) return;
  await Promise.all(Array.from(stores).map((s) => s.flush()));
}

export function createServerStore(dataDir?: string, options?: CreateServerStoreOptions): ServerStore {
  const resolvedDir = path.resolve(process.cwd(), dataDir || process.env.DATA_DIR || '.data');
  const filePath = path.join(resolvedDir, 'store.json');
  const envDriver = (process.env.STORAGE_DRIVER || 'file').trim().toLowerCase();
  const persistenceMode: 'file' | 'memory' =
    options?.persistenceMode ?? (envDriver === 'firestore' ? 'memory' : 'file');

  const rawDebounce =
    options?.writeDebounceMs ??
    (process.env.STORE_WRITE_DEBOUNCE_MS !== undefined ? Number(process.env.STORE_WRITE_DEBOUNCE_MS) : 80);
  const writeDebounceMs = Number.isFinite(rawDebounce) && rawDebounce >= 0 ? Math.floor(rawDebounce) : 80;

  let data = createInitialData();
  if (persistenceMode === 'file') {
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
              products: (Array.isArray(parsed.catalogState?.products)
                ? parsed.catalogState.products
                : defaults.catalogState.products
              ).map((p) => ({
                ...p,
                imageUrl: normalizeCatalogImageUrl(p.imageUrl),
                galleryUrls: Array.isArray(p.galleryUrls) ? p.galleryUrls.map(normalizeCatalogImageUrl) : [],
              })),
              bundles: (Array.isArray(parsed.catalogState?.bundles)
                ? parsed.catalogState.bundles
                : defaults.catalogState.bundles
              ).map((b) => ({
                ...b,
                imageUrl: normalizeCatalogImageUrl(b.imageUrl),
              })),
              blogPosts: (Array.isArray(parsed.catalogState?.blogPosts)
                ? parsed.catalogState.blogPosts
                : defaults.catalogState.blogPosts
              ).map((bp) => ({
                ...bp,
                imageUrl: normalizeCatalogImageUrl(bp.imageUrl),
              })),
              pages: Array.isArray(parsed.catalogState?.pages) ? parsed.catalogState.pages : defaults.catalogState.pages,
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
            otpLockouts: parsed.otpLockouts ?? {},
            otpPhoneSendHistory: parsed.otpPhoneSendHistory ?? {},
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
            notFoundLogs: parsed.notFoundLogs ?? {},
            newsletterSubscribers: parsed.newsletterSubscribers ?? {},
            stockNotifications: parsed.stockNotifications ?? {},
            uploadedFiles: parsed.uploadedFiles ?? {},
            ...(parsed.guestOrders ? { guestOrders: parsed.guestOrders } : {}),
            rfqs: parsed.rfqs ?? {},
            importJobs: Array.isArray(parsed.importJobs) ? parsed.importJobs : [],
            outboxMessages: parsed.outboxMessages ?? {},
            campaignRuns: parsed.campaignRuns ?? {},
            marketingConsents: parsed.marketingConsents ?? {},
            suppressionList: parsed.suppressionList ?? {},
            abandonedCarts: parsed.abandonedCarts ?? {},
          };

          migrateStockToWarehousesData(data, { dryRun: false });
        }
      }
    } catch (err) {
      console.warn('Warning: failed to load persisted server store, using fresh defaults:', err);
    }
  }

  let dirty = false;
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let scheduledSaves = 0;
  let completedFlushes = 0;
  let tmpSeq = 0;

  const performAtomicWrite = async (): Promise<void> => {
    if (persistenceMode !== 'file') {
      dirty = false;
      return;
    }
    // Loop ensures any mutations made while an async write is in flight get written in the next batch
    while (dirty) {
      dirty = false;
      const serialized = JSON.stringify(store.data, null, 2);
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${++tmpSeq}.tmp`;
      await fs.promises.mkdir(resolvedDir, { recursive: true });
      try {
        await fs.promises.writeFile(tmpPath, serialized, 'utf8');
        await fs.promises.rename(tmpPath, filePath);
        completedFlushes += 1;
      } catch (err) {
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // Ignore temp file cleanup error
        }
        throw err;
      }
    }
  };

  const enqueueWrite = (): Promise<void> => {
    writeChain = writeChain.then(performAtomicWrite, performAtomicWrite);
    return writeChain;
  };

  const store: ServerStore = {
    filePath,
    persistenceMode,
    data,
    save() {
      if (persistenceMode !== 'file' || disposed) return;
      dirty = true;
      scheduledSaves += 1;
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!dirty || disposed) return;
        enqueueWrite().catch((err) => {
          console.warn('[persistence] async debounced store flush failed:', err);
        });
      }, writeDebounceMs);
      debounceTimer.unref();
    },
    async flush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (persistenceMode !== 'file') {
        dirty = false;
        return;
      }
      if (!dirty) {
        await writeChain.catch(() => {});
        return;
      }
      await enqueueWrite();
    },
    async dispose() {
      disposed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      try {
        if (persistenceMode === 'file' && dirty) {
          await enqueueWrite();
        } else {
          await writeChain.catch(() => {});
        }
      } finally {
        const set = activeStoresByFilePath.get(filePath);
        if (set) {
          set.delete(store);
          if (set.size === 0) activeStoresByFilePath.delete(filePath);
        }
      }
    },
    getWriteStats() {
      return {
        scheduledSaves,
        completedFlushes,
        dirty,
      };
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
      for (const [k, v] of Object.entries(store.data.otpLockouts)) {
        if (v.lockedUntil <= now) {
          delete store.data.otpLockouts[k];
          changed = true;
        }
      }
      const sendCutoff = now - 15 * 60 * 1000;
      for (const [k, stamps] of Object.entries(store.data.otpPhoneSendHistory)) {
        const recent = stamps.filter((ts) => ts > sendCutoff);
        if (recent.length !== stamps.length) {
          if (recent.length === 0) delete store.data.otpPhoneSendHistory[k];
          else store.data.otpPhoneSendHistory[k] = recent;
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

  if (persistenceMode === 'file') {
    let set = activeStoresByFilePath.get(filePath);
    if (!set) {
      set = new Set<ServerStore>();
      activeStoresByFilePath.set(filePath, set);
    }
    set.add(store);
  }

  return store;
}

