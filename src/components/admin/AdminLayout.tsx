import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Package,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Store,
  Sun,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatMoney } from '../../lib/jalali';
import { applySeoHead } from '../../lib/seo';
import { AdminRoleCode } from '../../types/domain';
import { ADMIN_ROLE_LABELS, AdminModuleKey, canAccessModule } from './rbac';

interface NavItem {
  to: string;
  label: string;
  module: AdminModuleKey;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'نمای کلی داشبورد', module: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', label: 'گزارش‌های تحلیلی', module: 'reports', icon: BarChart3 },
  { to: '/admin/products', label: 'محصولات و تنوع‌ها', module: 'products', icon: Package },
  { to: '/admin/categories', label: 'دسته‌بندی و ویژگی‌ها', module: 'categories', icon: FolderTree },
  { to: '/admin/brands', label: 'برندها و نمایندگی اصالت', module: 'brands', icon: Tag },
  { to: '/admin/pricing', label: 'قیمت‌گذاری، کمپین و کوپن', module: 'pricing', icon: Tag },
  { to: '/admin/inventory', label: 'انبار، بچ FEFO و تامین', module: 'inventory', icon: Boxes },
  { to: '/admin/orders', label: 'سفارش‌ها، پیش‌فاکتور و اعتبار', module: 'orders', icon: ShoppingCart },
  { to: '/admin/customers', label: 'مشتریان و تایید B2B', module: 'customers', icon: Users },
  { to: '/admin/support', label: 'پشتیبانی، نظرات و مشاوره', module: 'support', icon: MessageSquare },
  { to: '/admin/content', label: 'محتوا، بلاگ و شعب', module: 'content', icon: Globe },
  { to: '/admin/seo', label: 'سئو، سلامت Schema و ریدایرکت', module: 'seo', icon: Globe },
  { to: '/admin/import-export', label: 'ورود و خروج گروهی داده', module: 'import_export', icon: FileSpreadsheet },
  { to: '/admin/system', label: 'نقش‌ها، لاگ Audit و تنظیمات', module: 'system', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const {
    authUser,
    authReady,
    isAdmin,
    actualAdminRole,
    activeAdminRole,
    setActiveAdminRole,
    signInWithGoogle,
    logout,
    darkMode,
    toggleDarkMode,
    currency,
    setCurrency,
    products,
    orders,
    tickets,
    settings,
    seedDatabaseNow,
  } = useStore();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [previewAllowed, setPreviewAllowed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.location.search.includes('preview=1') || sessionStorage.getItem('dm_admin_preview') === '1';
  });

  useEffect(() => {
    if (searchParams.get('preview') === '1') {
      sessionStorage.setItem('dm_admin_preview', '1');
      setPreviewAllowed(true);
    }
  }, [searchParams]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');

  useEffect(() => {
    applySeoHead({
      title: `پنل مدیریت | ${settings.storeNameFa}`,
      description: 'پنل عملیات و مدیریت فروشگاه تخصصی دنتال‌مارکت',
      canonicalPath: '/admin',
      robots: 'noindex, nofollow',
    });
  }, [settings.storeNameFa]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchHits = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    if (!q) return { products: [], orders: [], tickets: [] };
    return {
      products: products
        .filter(
          (p) =>
            p.titleFa.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.imedCode ?? '').toLowerCase().includes(q)
        )
        .slice(0, 5),
      orders: orders
        .filter(
          (o) =>
            o.orderNo.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q) ||
            o.customerMobile.includes(q)
        )
        .slice(0, 5),
      tickets: tickets
        .filter((t) => t.ticketNo.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))
        .slice(0, 4),
    };
  }, [cmdQuery, products, orders, tickets]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-slate-950 text-sm">
        در حال بررسی نشست امنیتی مدیر...
      </div>
    );
  }

  if ((!authUser || !isAdmin) && !previewAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-brand" />
          <h1 className="text-xl font-extrabold">ورود به پنل مدیریت دنتال‌مارکت</h1>
          <p className="text-xs leading-relaxed text-ink/70 dark:text-slate-400">
            دسترسی به داشبورد عملیاتی، انبارداری، مالی و ویرایش کاتالوگ صرفاً برای حساب‌های مدیر تاییدشده فعال است.
          </p>
          {authUser ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-rose-600">
                حساب فعلی ({authUser.email}) دسترسی مدیریتی ندارد.
              </p>
              <button
                type="button"
                onClick={logout}
                className="w-full py-2.5 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
              >
                خروج و ورود با حساب مدیر
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              ورود مدیر با حساب گوگل
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem('dm_admin_preview', '1');
              setPreviewAllowed(true);
            }}
            className="w-full py-2.5 rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-bold hover:bg-amber-100"
          >
            ورود موقت به پیش‌نمایش پنل مدیریت (بدون ورود)
          </button>
          <Link to="/" className="inline-block text-xs font-bold text-brand hover:underline">
            بازگشت به ویترین فروشگاه
          </Link>
        </div>
      </div>
    );
  }

  const visibleNav = NAV_ITEMS.filter((item) => canAccessModule(activeAdminRole, item.module));

  return (
    <div className="min-h-screen flex bg-paper dark:bg-slate-950 text-ink dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-line dark:border-slate-800 bg-white dark:bg-slate-900 transition-all ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-line dark:border-slate-800">
          {!sidebarCollapsed && (
            <Link to="/admin" className="font-extrabold text-brand dark:text-teal-300 text-base truncate">
              مدیریت دنتال‌مارکت
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label="جمع/باز کردن منو"
            className="p-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-brand text-white'
                      : 'text-ink/75 dark:text-slate-300 hover:bg-surface dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-line dark:border-slate-800 space-y-2">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand"
          >
            <Store className="w-4 h-4 text-brand" />
            {!sidebarCollapsed && <span>مشاهده فروشگاه</span>}
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/50">
          <aside className="w-72 bg-white dark:bg-slate-900 h-full p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line dark:border-slate-800 pb-3">
              <span className="font-extrabold text-brand">مدیریت دنتال‌مارکت</span>
              <button type="button" onClick={() => setMobileDrawer(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileDrawer(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${
                      isActive ? 'bg-brand text-white' : 'hover:bg-surface dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </aside>
          <div className="flex-1" onClick={() => setMobileDrawer(false)} />
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!isAdmin && previewAllowed && (
          <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-300 dark:border-amber-800 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-amber-900 dark:text-amber-200">
              حالت پیش‌نمایش موقت پنل مدیریت — برای ذخیره دائمی تغییرات در پایگاه داده، با حساب مدیر وارد شوید.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={signInWithGoogle}
                className="px-3 py-1 rounded-lg bg-brand text-white font-bold"
              >
                ورود با حساب گوگل
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('dm_admin_preview');
                  setPreviewAllowed(false);
                  navigate('/');
                }}
                className="px-3 py-1 rounded-lg border border-amber-400 text-amber-900 dark:text-amber-200 font-bold"
              >
                خروج از پیش‌نمایش
              </button>
            </div>
          </div>
        )}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-line dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileDrawer(true)}
              aria-label="منو"
              className="lg:hidden p-2 rounded-lg border border-line dark:border-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs text-ink/65 dark:text-slate-300 hover:border-brand"
            >
              <Search className="w-3.5 h-3.5 text-brand" />
              <span className="hidden sm:inline">جستجوی سریع سفارش / SKU / IMED...</span>
              <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-surface dark:bg-slate-700">Ctrl+K</kbd>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setQuickOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ایجاد سریع</span>
              </button>
              {quickOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl shadow-xl p-1.5 text-xs z-40">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/products');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    + محصول جدید
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/pricing');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    + کمپین یا کد تخفیف
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/orders');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    + مدیریت پیش‌فاکتورها
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/content');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    + مقاله تخصصی بلاگ
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="hidden xl:inline text-ink/60 dark:text-slate-400 tabular-nums">
              امروز: {formatJalaliDate(new Date(), true)}
            </span>

            {actualAdminRole && (
              <span className="hidden md:inline px-2 py-1 rounded-lg bg-brand/10 text-brand dark:text-teal-300 font-bold">
                نقش واقعی: {ADMIN_ROLE_LABELS[actualAdminRole]}
              </span>
            )}

            <select
              value={activeAdminRole}
              onChange={(e) => setActiveAdminRole(e.target.value as AdminRoleCode)}
              aria-label="پیش‌نمایش نقش مدیریتی RBAC"
              className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
            >
              {(Object.keys(ADMIN_ROLE_LABELS) as AdminRoleCode[]).map((r) => (
                <option key={r} value={r}>
                  {ADMIN_ROLE_LABELS[r]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={seedDatabaseNow}
              title="همگام‌سازی داده‌های پایه در Firestore"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 hover:border-brand font-bold"
            >
              <Database className="w-3.5 h-3.5 text-brand" />
              <span className="hidden md:inline">همگام‌سازی پایه</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrency(currency === 'IRT' ? 'IRR' : 'IRT')}
              className="px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              {currency === 'IRT' ? 'تومان' : 'ریال'}
            </button>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="تغییر تم"
              className="p-2 rounded-lg border border-line dark:border-slate-700"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={logout}
              aria-label="خروج"
              className="p-2 rounded-lg border border-line dark:border-slate-700 text-rose-600"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">{children}</main>
      </div>

      {/* Ctrl+K Global Command Search */}
      {cmdOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 px-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0" onClick={() => setCmdOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-line dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-slate-800">
              <Search className="w-4 h-4 text-brand" />
              <input
                autoFocus
                type="search"
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="جستجو در محصولات (نام، SKU، IMED)، سفارش‌ها (شماره، موبایل) و تیکت‌ها..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <button type="button" onClick={() => setCmdOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-4 space-y-4 text-xs">
              {cmdQuery.trim() === '' ? (
                <p className="text-ink/50">عبارت یا کد مورد نظر را تایپ کنید...</p>
              ) : (
                <>
                  {searchHits.orders.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-bold text-ink/60">سفارش‌ها</p>
                      {searchHits.orders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            navigate('/admin/orders');
                          }}
                          className="w-full text-right p-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 flex justify-between"
                        >
                          <span className="font-bold tabular-nums">{o.orderNo} — {o.customerName}</span>
                          <span className="tabular-nums text-brand">{formatMoney(o.grandTotal, currency)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchHits.products.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-bold text-ink/60">محصولات</p>
                      {searchHits.products.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            navigate('/admin/products');
                          }}
                          className="w-full text-right p-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 flex justify-between"
                        >
                          <span className="font-bold">{p.titleFa}</span>
                          <span className="tabular-nums text-ink/50">{p.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchHits.tickets.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-bold text-ink/60">تیکت‌ها</p>
                      {searchHits.tickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setCmdOpen(false);
                            navigate('/admin/support');
                          }}
                          className="w-full text-right p-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 flex justify-between"
                        >
                          <span className="font-bold">{t.subject}</span>
                          <span className="tabular-nums">{t.ticketNo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
