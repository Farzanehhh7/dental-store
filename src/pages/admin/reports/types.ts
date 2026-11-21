import type {
  B2BVerification,
  BlogPost,
  Brand,
  Campaign,
  Category,
  ConsultationRequest,
  Coupon,
  InvoiceRecord,
  NotFoundLog,
  Order,
  PaymentLedgerEntry,
  PaymentPlan,
  Product,
  ProductCostRecord,
  ProductQuestion,
  ProformaInvoice,
  RedirectRule,
  ReturnRequest,
  Review,
  RfqRequest,
  SiteSettings,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  SupportTicket,
  UserProfile,
  Warehouse,
} from '../../../types/domain';

export type ReportGroup =
  | 'فروش و سفارش'
  | 'مالی و پرداخت'
  | 'انبار و FEFO'
  | 'مشتریان و B2B'
  | 'محتوا و سئو';

export type ReportFilterParam =
  | 'dateRange'
  | 'status'
  | 'brandId'
  | 'categoryId'
  | 'warehouseId'
  | 'search';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'percent' | 'date' | 'status';
}

export interface ReportSummaryItem {
  label: string;
  value: string | number;
  type?: 'text' | 'number' | 'money' | 'percent';
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

export interface ReportChartConfig {
  type: 'bar' | 'line';
  title: string;
  xKey: string;
  yKey: string;
  yLabel?: string;
  valueType?: 'money' | 'number' | 'percent';
  data: Array<Record<string, string | number>>;
}

export interface ReportParams {
  from?: string;
  to?: string;
  status?: string;
  brandId?: string;
  categoryId?: string;
  warehouseId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface ReportDataset {
  orders: Order[];
  invoices: InvoiceRecord[];
  proformas: ProformaInvoice[];
  returns: ReturnRequest[];
  paymentPlans: PaymentPlan[];
  paymentLedger: PaymentLedgerEntry[];
  rfqs: RfqRequest[];
  products: Product[];
  productCosts: ProductCostRecord[];
  categories: Category[];
  brands: Brand[];
  campaigns: Campaign[];
  coupons: Coupon[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
  stockBatches: StockBatchRecord[];
  stockMovements: StockMovement[];
  b2bVerifications: B2BVerification[];
  tickets: SupportTicket[];
  consultationRequests: ConsultationRequest[];
  usersList: UserProfile[];
  blogPosts: BlogPost[];
  redirects: RedirectRule[];
  notFoundLogs: NotFoundLog[];
  reviews: Review[];
  questions: ProductQuestion[];
  settings: SiteSettings;
  now?: Date;
}

export interface ReportResult {
  id: string;
  group: ReportGroup;
  title: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number>>;
  allRowsCount: number;
  page: number;
  limit: number;
  totalPages: number;
  totalsRow?: Record<string, string | number>;
  summary: ReportSummaryItem[];
  chart?: ReportChartConfig;
}

export interface ReportCatalogMeta {
  id: string;
  group: ReportGroup;
  title: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  sensitiveFinancial?: boolean;
  params: ReportFilterParam[];
  statusOptions?: Array<{ value: string; label: string }>;
}

export interface ReportDefinition extends ReportCatalogMeta {
  run(data: ReportDataset, params?: ReportParams): ReportResult;
}
