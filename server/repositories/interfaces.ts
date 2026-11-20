import {
  CustomerGroupCode,
  Order,
  OrderBatchAllocation,
  OrderSource,
  OrderStatus,
  PaymentLedgerEntry,
  ProformaInvoice,
  ReturnRequest,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  Warehouse,
} from '../../src/types/domain';
import {
  ServerAuditLogRecord,
  ServerCatalogSnapshot,
  ServerPaymentSession,
  ServerUserGroupRecord,
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

export interface CatalogRepository {
  getSnapshot(): Promise<ServerCatalogSnapshot>;
  getUserGroupAndProfile(params: { uid?: string; mobile?: string }): Promise<{
    customerGroup: CustomerGroupCode;
    b2bStatus: ServerUserGroupRecord['b2bStatus'];
    displayName?: string;
  }>;
  setUserGroup(record: ServerUserGroupRecord): Promise<void>;
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

export interface RepositoryBundle {
  driver: 'file' | 'firestore';
  orders: OrderRepository;
  payments: PaymentRepository;
  stock: StockRepository;
  returns: ReturnRepository;
  catalog: CatalogRepository;
  proformas: ProformaRepository;
  audit: AuditRepository;
  runTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
