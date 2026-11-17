import fs from 'node:fs';
import path from 'node:path';
import {
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
  SEED_CONTRACT_PRICES,
  SEED_PAYMENT_LEDGER,
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
  Order,
  PaymentLedgerEntry,
  Product,
  RedirectRule,
  RfqRequest,
  SiteSettings,
} from '../src/types/domain';

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
  status: 'initiated' | 'verified' | 'failed';
  sandboxTokenHash?: string;
  ownerUid?: string;
  ownerMobile?: string;
  refId?: string;
  createdAt: string;
  verifiedAt?: string;
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

export interface PersistedServerData {
  catalogState: ServerCatalogSnapshot;
  otpChallenges: Record<string, OtpChallengeRecord>;
  otpVerifiedTokens: Record<string, OtpVerifiedTokenRecord>;
  mobileSessions: Record<string, MobileSessionRecord>;
  paymentSessions: Record<string, ServerPaymentSession>;
  paymentLedger: PaymentLedgerEntry[];
  verifiedOrderStatuses: Record<string, VerifiedOrderPaymentState>;
  guestOrders: Record<string, Order>;
  rfqs: Record<string, RfqRequest>;
}

function createInitialData(): PersistedServerData {
  return {
    catalogState: {
      categories: EXPANDED_CATEGORIES,
      brands: EXPANDED_BRANDS,
      products: EXPANDED_PRODUCTS,
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
    otpChallenges: {},
    otpVerifiedTokens: {},
    mobileSessions: {},
    paymentSessions: {},
    paymentLedger: [...SEED_PAYMENT_LEDGER],
    verifiedOrderStatuses: {},
    guestOrders: {},
    rfqs: {},
  };
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
          otpChallenges: parsed.otpChallenges ?? {},
          otpVerifiedTokens: parsed.otpVerifiedTokens ?? {},
          mobileSessions: parsed.mobileSessions ?? {},
          paymentSessions: parsed.paymentSessions ?? {},
          paymentLedger: Array.isArray(parsed.paymentLedger) ? parsed.paymentLedger : defaults.paymentLedger,
          verifiedOrderStatuses: parsed.verifiedOrderStatuses ?? {},
          guestOrders: parsed.guestOrders ?? {},
          rfqs: parsed.rfqs ?? {},
        };
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
