import {
  CustomerGroupCode,
  NewsletterSubscriber,
  NotFoundLog,
  Order,
  OrderBatchAllocation,
  OrderSource,
  OrderStatus,
  PaymentLedgerEntry,
  ProformaInvoice,
  ReturnRequest,
  RfqRequest,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  StockNotification,
  Warehouse,
} from '../../src/types/domain';
import type { ImportJobRecord } from '../../src/pages/admin/importExport/types';
import {
  MobileSessionRecord,
  OtpChallengeRecord,
  OtpLockoutRecord,
  OtpVerifiedTokenRecord,
  ServerAuditLogRecord,
  ServerCatalogSnapshot,
  ServerPaymentSession,
  ServerUserGroupRecord,
  UploadedFileRecord,
  VerifiedOrderPaymentState,
} from '../persistence';

export interface OrderQueryFilter {
  page?: number;
  limit?: number;
  status?: OrderStatus | string;
  source?: OrderSource;
  q?: string;
  fromDate?: string;
  toDate?: string;
  userId?: string;
  mobile?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StockItemDelta {
  productId: string;
  variantId: string;
  quantity: number;
  warehouseId?: string;
  batchAllocations?: OrderBatchAllocation[];
}

export interface StockMovementContext {
  orderId?: string;
  orderNo?: string;
  returnId?: string;
  actorEmail?: string;
  reason?: string;
}

export type StockReservationResult =
  | {
      ok: true;
      allocationsByItem: Record<
        string,
        {
          warehouseId: string;
          batchNo?: string;
          batchAllocations: OrderBatchAllocation[];
        }
      >;
    }
  | { ok: false; message: string };

export interface StockAdjustParams {
  productId: string;
  variantId: string;
  warehouseId?: string;
  warehouseCode?: string;
  delta: number;
  type: 'receive' | 'adjust';
  reason: string;
  actorEmail: string;
  batchNo?: string;
  expiryDate?: string;
  unitCost?: number;
  specialPrice?: number | null;
}

export interface StocktakeParams {
  productId: string;
  variantId: string;
  warehouseId?: string;
  warehouseCode?: string;
  onHand: number;
  reason: string;
  actorEmail: string;
}

export interface StockTransferParams {
  productId: string;
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason: string;
  actorEmail: string;
  batchNo?: string;
}

export interface StockOperationResult {
  ok: boolean;
  status?: number;
  message?: string;
  stockLevel?: StockLevel;
  fromLevel?: StockLevel;
  toLevel?: StockLevel;
  batch?: StockBatchRecord;
  movement?: StockMovement;
}

export interface OrderRepository {
  getById(id: string): Promise<Order | null>;
  getByOrderNo(orderNo: string): Promise<Order | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  list(filter?: OrderQueryFilter): Promise<PaginatedResult<Order>>;
  listExpiredPending(nowIso: string): Promise<Order[]>;
}

export interface PaymentRepository {
  getSessionByAuthority(authority: string): Promise<ServerPaymentSession | null>;
  findSessionByIdempotencyKey(idempotencyKey: string): Promise<ServerPaymentSession | null>;
  findOpenSessionsByOrderId(orderId: string): Promise<ServerPaymentSession[]>;
  saveSession(session: ServerPaymentSession): Promise<void>;
  addLedgerEntry(entry: PaymentLedgerEntry): Promise<void>;
  listLedger(): Promise<PaymentLedgerEntry[]>;
  getVerifiedOrder(orderId: string): Promise<VerifiedOrderPaymentState | null>;
  listVerifiedOrders(): Promise<Record<string, VerifiedOrderPaymentState>>;
  saveVerifiedOrder(state: VerifiedOrderPaymentState): Promise<void>;
  hasProcessedWebhook(eventKey: string): Promise<boolean>;
  markWebhookProcessed(eventKey: string, processedAt: string): Promise<void>;
}

export interface StockRepository {
  reserveItems(items: StockItemDelta[], ctx?: StockMovementContext): Promise<StockReservationResult>;
  commitItems(items: StockItemDelta[], ctx?: StockMovementContext): Promise<void>;
  releaseItems(items: StockItemDelta[], ctx?: StockMovementContext): Promise<void>;
  incrementCouponUsage(couponCode: string): Promise<void>;
  adjustStock(params: StockAdjustParams): Promise<StockOperationResult>;
  stocktakeStock(params: StocktakeParams): Promise<StockOperationResult>;
  transferStock(params: StockTransferParams): Promise<StockOperationResult>;
  setBatchSpecialPrice(params: {
    productId: string;
    variantId: string;
    batchId: string;
    specialPrice: number | null;
    actorEmail: string;
  }): Promise<StockOperationResult>;
  restockReturnItems(params: {
    returnRequest: ReturnRequest;
    condition: 'resellable' | 'damaged';
    warehouseId?: string;
    batchNo?: string;
    expiryDate?: string;
    actorEmail: string;
  }): Promise<{ ok: true; movements: StockMovement[]; warehouseId: string } | { ok: false; status: number; message: string }>;
  listWarehouses(): Promise<Warehouse[]>;
  saveWarehouse(warehouse: Warehouse): Promise<Warehouse>;
  deleteWarehouse(warehouseId: string): Promise<boolean>;
  listStockLevels(filter?: { warehouseId?: string; productId?: string; variantId?: string }): Promise<StockLevel[]>;
  listBatches(filter?: { warehouseId?: string; productId?: string; variantId?: string }): Promise<StockBatchRecord[]>;
  listMovements(limit?: number): Promise<StockMovement[]>;
}

export interface ReturnRepository {
  getById(id: string): Promise<ReturnRequest | null>;
  list(filter?: { userId?: string; status?: ReturnRequest['status'] }): Promise<ReturnRequest[]>;
  save(ret: ReturnRequest): Promise<void>;
}

export interface CatalogSnapshotPatch {
  categories?: ServerCatalogSnapshot['categories'];
  brands?: ServerCatalogSnapshot['brands'];
  products?: ServerCatalogSnapshot['products'];
  campaigns?: ServerCatalogSnapshot['campaigns'];
  bundles?: ServerCatalogSnapshot['bundles'];
  agents?: ServerCatalogSnapshot['agents'];
  blogPosts?: ServerCatalogSnapshot['blogPosts'];
  pages?: ServerCatalogSnapshot['pages'];
  redirects?: ServerCatalogSnapshot['redirects'];
  coupons?: ServerCatalogSnapshot['coupons'];
  contractPrices?: ServerCatalogSnapshot['contractPrices'];
  settings?: ServerCatalogSnapshot['settings'];
  updatedAt?: string;
}

export interface CatalogRepository {
  getSnapshot(): Promise<ServerCatalogSnapshot>;
  getUserGroupAndProfile(params: { uid?: string; mobile?: string }): Promise<{
    customerGroup: CustomerGroupCode;
    b2bStatus: ServerUserGroupRecord['b2bStatus'];
    displayName?: string;
  }>;
  setUserGroup(record: ServerUserGroupRecord): Promise<void>;
  saveCatalogCollections(patch: CatalogSnapshotPatch): Promise<void>;
  incrementRedirectHits(deltas: Record<string, number>): Promise<void>;
}

export interface ProformaRepository {
  getById(id: string): Promise<ProformaInvoice | null>;
  getByShareToken(shareToken: string): Promise<ProformaInvoice | null>;
  save(proforma: ProformaInvoice): Promise<void>;
  listByUser(userId: string): Promise<ProformaInvoice[]>;
  listAll(): Promise<ProformaInvoice[]>;
}

export interface AuditRepository {
  append(record: ServerAuditLogRecord): Promise<void>;
  list(limit?: number): Promise<ServerAuditLogRecord[]>;
}

export interface AuthSessionRepository {
  getOtpChallenge(mobile: string): Promise<OtpChallengeRecord | null>;
  setOtpChallenge(mobile: string, record: OtpChallengeRecord): Promise<void>;
  deleteOtpChallenge(mobile: string): Promise<void>;
  getOtpLockout(mobile: string): Promise<OtpLockoutRecord | null>;
  setOtpLockout(mobile: string, record: OtpLockoutRecord): Promise<void>;
  deleteOtpLockout(mobile: string): Promise<void>;
  getPhoneSendHistory(mobile: string, cutoffMs: number): Promise<number[]>;
  setPhoneSendHistory(mobile: string, timestamps: number[], ttlExpiresAtMs: number): Promise<void>;
  getVerifiedToken(tokenHash: string): Promise<OtpVerifiedTokenRecord | null>;
  saveVerifiedToken(record: OtpVerifiedTokenRecord): Promise<void>;
  consumeVerifiedToken(tokenHash: string, consumedAt: string): Promise<void>;
  getMobileSession(tokenHash: string): Promise<MobileSessionRecord | null>;
  saveMobileSession(record: MobileSessionRecord): Promise<void>;
  deleteMobileSession(tokenHash: string): Promise<void>;
  pruneExpired(): Promise<void>;
}

export interface RfqRepository {
  getById(id: string): Promise<RfqRequest | null>;
  list(filter?: { status?: string; limit?: number }): Promise<RfqRequest[]>;
  save(rfq: RfqRequest): Promise<void>;
}

export interface EngagementRepository {
  record404Hit(id: string, path: string, lastSeenAt: string): Promise<NotFoundLog>;
  flush404Hits(): Promise<void>;
  list404Logs(): Promise<NotFoundLog[]>;
  findNewsletterByContact(contact: string): Promise<NewsletterSubscriber | null>;
  saveNewsletterSubscriber(sub: NewsletterSubscriber): Promise<void>;
  listNewsletterSubscribers(): Promise<NewsletterSubscriber[]>;
  getStockNotification(id: string): Promise<StockNotification | null>;
  saveStockNotification(item: StockNotification): Promise<void>;
  listStockNotifications(): Promise<StockNotification[]>;
  getUploadedFile(id: string): Promise<UploadedFileRecord | null>;
  saveUploadedFile(record: UploadedFileRecord): Promise<void>;
  getImportJob(id: string): Promise<ImportJobRecord | null>;
  listImportJobs(limit?: number): Promise<ImportJobRecord[]>;
  saveImportJob(job: ImportJobRecord): Promise<void>;
}

export interface RepositoryBundle {
  driver: 'file' | 'firestore';
  orders: OrderRepository;
  payments: PaymentRepository;
  stock: StockRepository;
  returns: ReturnRepository;
  catalog: CatalogRepository;
  proformas: ProformaRepository;
  audit: AuditRepository;
  authSessions: AuthSessionRepository;
  rfqs: RfqRepository;
  engagement: EngagementRepository;
  getCatalogVersion(): number;
  onCatalogChange(listener: () => void): () => void;
  notifyCatalogChanged(): void;
  runTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

