import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FolderTree,
  Globe,
  Languages,
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
import { useI18n } from '../../context/i18n';
import { useStore } from '../../context/StoreContext';
import { applySeoHead } from '../../lib/seo';
import { AdminRoleCode } from '../../types/domain';
import { AccessibleModal } from '../ui/Modal';
import { PageSkeleton } from '../ui/States';
import { ADMIN_ROLE_LABELS, AdminModuleKey, canAccessModule, getAdminRoleLabel } from './rbac';

interface NavItem {
  to: string;
  labelKey: string;
  module: AdminModuleKey;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', labelKey: 'adminNav.dashboard', module: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', labelKey: 'adminNav.reports', module: 'reports', icon: BarChart3 },
  { to: '/admin/products', labelKey: 'adminNav.products', module: 'products', icon: Package },
  { to: '/admin/categories', labelKey: 'adminNav.categories', module: 'categories', icon: FolderTree },
  { to: '/admin/brands', labelKey: 'adminNav.brands', module: 'brands', icon: Tag },
  { to: '/admin/pricing', labelKey: 'adminNav.pricing', module: 'pricing', icon: Tag },
  { to: '/admin/inventory', labelKey: 'adminNav.inventory', module: 'inventory', icon: Boxes },
  { to: '/admin/orders', labelKey: 'adminNav.orders', module: 'orders', icon: ShoppingCart },
  { to: '/admin/customers', labelKey: 'adminNav.customers', module: 'customers', icon: Users },
  { to: '/admin/support', labelKey: 'adminNav.support', module: 'support', icon: MessageSquare },
  { to: '/admin/content', labelKey: 'adminNav.content', module: 'content', icon: Globe },
  { to: '/admin/seo', labelKey: 'adminNav.seo', module: 'seo', icon: Globe },
  { to: '/admin/import-export', labelKey: 'adminNav.importExport', module: 'import_export', icon: FileSpreadsheet },
  { to: '/admin/system', labelKey: 'adminNav.system', module: 'system', icon: Settings },
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
  const { t, locale, toggleLocale, formatDate, formatMoney } = useI18n();

  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');

  useEffect(() => {
    const brandName = locale === 'en' ? t('brandName') : settings.storeNameFa;
    applySeoHead({
      title: `${t('nav.admin')} | ${brandName}`,
      description: t('adminLayout.seoDesc'),
      canonicalPath: '/admin',
      robots: 'noindex, nofollow',
    });
  }, [settings.storeNameFa, locale, t]);

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
        .filter((tk) => tk.ticketNo.toLowerCase().includes(q) || tk.subject.toLowerCase().includes(q))
        .slice(0, 4),
    };
  }, [cmdQuery, products, orders, tickets]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-paper dark:bg-slate-950 py-6">
        <PageSkeleton />
      </div>
    );
  }

  if (!authUser || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-brand" aria-hidden="true" />
          <h1 className="text-xl font-extrabold">{t('adminLayout.loginTitle')}</h1>
          <p className="text-xs leading-relaxed text-ink/75 dark:text-slate-300">
            {t('adminLayout.loginHint')}{' '}
            <code dir="ltr" className="font-mono">admins/{'{uid}'}</code>
          </p>
          {authUser ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                {t('adminLayout.noAdminAccess', { email: authUser.email ?? '' })}
              </p>
              <div className="p-2.5 rounded-xl bg-surface dark:bg-slate-800 text-[11px] font-mono break-all select-all" dir="ltr">
                UID: {authUser.uid}
              </div>
              <p className="text-[11px] text-ink/70 dark:text-slate-300">
                {t('adminLayout.registerUidHint', { uid: authUser.uid })}
              </p>
              <button
                type="button"
                onClick={logout}
                className="w-full py-2.5 rounded-xl border border-line dark:border-slate-700 text-xs font-bold"
              >
                {t('adminLayout.signOutOtherAccount')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brandDark"
            >
              {t('adminLayout.signInAdminGoogle')}
            </button>
          )}
          <Link to="/" className="inline-block text-xs font-bold text-brand hover:underline">
            {t('adminLayout.backToStore')}
          </Link>
        </div>
      </div>
    );
  }

  const effectiveRole = actualAdminRole === 'super_admin' ? activeAdminRole : actualAdminRole ?? activeAdminRole;
  const visibleNav = NAV_ITEMS.filter((item) => canAccessModule(effectiveRole, item.module));

  return (
    <div className="min-h-screen flex bg-paper dark:bg-slate-950 text-ink dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand focus:text-white focus:font-bold focus:text-xs"
      >
        {t('common.skipToContent')}
      </a>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-line dark:border-slate-800 bg-white dark:bg-slate-900 transition-all ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-line dark:border-slate-800">
          {!sidebarCollapsed && (
            <Link to="/admin" className="font-extrabold text-brand dark:text-teal-300 text-base truncate">
              {t('adminLayout.brandAdminTitle')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={t('adminLayout.toggleSidebarAria')}
            aria-expanded={!sidebarCollapsed}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-surface dark:hover:bg-slate-800"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav aria-label={t('adminLayout.sidebarNavAria')} className="flex-1 overflow-y-auto p-3 space-y-1">
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
                      : 'text-ink/80 dark:text-slate-200 hover:bg-surface dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {!sidebarCollapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-line dark:border-slate-800 space-y-2">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-line dark:border-slate-700 text-xs font-bold hover:border-brand"
          >
            <Store className="w-4 h-4 text-brand" aria-hidden="true" />
            {!sidebarCollapsed && <span>{t('adminLayout.viewStorefront')}</span>}
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer with Focus Trap */}
      <AccessibleModal
        open={mobileDrawer}
        onClose={() => setMobileDrawer(false)}
        align="start"
        ariaLabel={t('adminLayout.sidebarNavAria')}
        containerClassName="lg:hidden"
        panelClassName="w-72 bg-white dark:bg-slate-900 h-full p-4 flex flex-col gap-3 overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line dark:border-slate-800 pb-3">
          <span className="font-extrabold text-brand dark:text-teal-300">{t('adminLayout.brandAdminTitle')}</span>
          <button
            type="button"
            onClick={() => setMobileDrawer(false)}
            aria-label={t('actions.close')}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg"
          >
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
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
        <div className="pt-3 mt-auto border-t border-line dark:border-slate-800 space-y-2 text-xs sm:hidden">
          {actualAdminRole === 'super_admin' && (
            <select
              value={activeAdminRole}
              onChange={(e) => setActiveAdminRole(e.target.value as AdminRoleCode)}
              aria-label={t('adminLayout.roleSwitchAria')}
              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
            >
              {(Object.keys(ADMIN_ROLE_LABELS) as AdminRoleCode[]).map((r) => (
                <option key={r} value={r}>
                  {getAdminRoleLabel(r, t)}
                </option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCurrency(currency === 'IRT' ? 'IRR' : 'IRT')}
              aria-label={t('adminLayout.currencySwitchAria')}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              {currency === 'IRT' ? t('price.toman') : t('price.rial')}
            </button>
            <button
              type="button"
              onClick={toggleLocale}
              aria-label={t('adminLayout.switchLangAria')}
              className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              <Languages className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span>{locale === 'fa' ? 'EN' : t('storeLayout.langFaShort')}</span>
            </button>
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={t('storeLayout.themeToggleAria')}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={seedDatabaseNow}
              title={t('adminLayout.seedTitle')}
              className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 rounded-lg border border-line dark:border-slate-700 hover:border-brand font-bold"
            >
              <Database className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span>{t('adminLayout.seedLabel')}</span>
            </button>
          </div>
        </div>
      </AccessibleModal>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-line dark:border-slate-800 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileDrawer(true)}
              aria-label={t('adminLayout.openMenuAria')}
              className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-line dark:border-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              aria-label={t('adminLayout.cmdAria')}
              className="inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs text-ink/75 dark:text-slate-200 hover:border-brand"
            >
              <Search className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span className="hidden sm:inline">{t('adminLayout.cmdButtonLabel')}</span>
              <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-surface dark:bg-slate-700">Ctrl+K</kbd>
            </button>

            <div className="relative">
              <button
                type="button"
                aria-expanded={quickOpen}
                aria-haspopup="true"
                aria-label={t('adminLayout.quickCreate')}
                onClick={() => setQuickOpen((v) => !v)}
                className="inline-flex items-center justify-center gap-1 min-w-[44px] min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brandDark"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t('adminLayout.quickCreate')}</span>
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
                    {t('adminLayout.quickNewProduct')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/pricing');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    {t('adminLayout.quickNewCampaign')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/orders');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    {t('adminLayout.quickManageProformas')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate('/admin/content');
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 font-bold"
                  >
                    {t('adminLayout.quickNewBlog')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="hidden xl:inline text-ink/70 dark:text-slate-300 tabular-nums">
              {t('adminLayout.todayLabel', { date: formatDate(new Date(), true) })}
            </span>

            {actualAdminRole && (
              <span className="hidden md:inline px-2 py-1 rounded-lg bg-brand/10 text-brand dark:text-teal-300 font-bold">
                {t('adminLayout.actualRoleLabel', { role: getAdminRoleLabel(actualAdminRole, t) })}
              </span>
            )}

            {actualAdminRole === 'super_admin' && (
              <select
                value={activeAdminRole}
                onChange={(e) => setActiveAdminRole(e.target.value as AdminRoleCode)}
                aria-label={t('adminLayout.roleSwitchAria')}
                className="hidden sm:block px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800 text-xs font-bold"
              >
                {(Object.keys(ADMIN_ROLE_LABELS) as AdminRoleCode[]).map((r) => (
                  <option key={r} value={r}>
                    {getAdminRoleLabel(r, t)}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={seedDatabaseNow}
              title={t('adminLayout.seedTitle')}
              className="hidden sm:inline-flex items-center gap-1 min-h-[40px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 hover:border-brand font-bold"
            >
              <Database className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span className="hidden md:inline">{t('adminLayout.seedLabel')}</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrency(currency === 'IRT' ? 'IRR' : 'IRT')}
              aria-label={t('adminLayout.currencySwitchAria')}
              className="hidden sm:inline-flex items-center min-h-[40px] px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              {currency === 'IRT' ? t('price.toman') : t('price.rial')}
            </button>

            <button
              type="button"
              onClick={toggleLocale}
              aria-label={t('adminLayout.switchLangAria')}
              className="hidden sm:inline-flex min-w-[40px] min-h-[40px] items-center justify-center gap-1 px-2 rounded-lg border border-line dark:border-slate-700 font-bold"
            >
              <Languages className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span>{locale === 'fa' ? 'EN' : t('storeLayout.langFaShort')}</span>
            </button>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={t('storeLayout.themeToggleAria')}
              className="hidden sm:inline-flex min-w-[40px] min-h-[40px] items-center justify-center rounded-lg border border-line dark:border-slate-700"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={logout}
              aria-label={t('actions.signOut')}
              className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg border border-line dark:border-slate-700 text-rose-600"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden outline-none">
          {children}
        </main>
      </div>

      {/* Ctrl+K Global Command Search with Focus Trap */}
      <AccessibleModal
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        align="top"
        ariaLabel={t('adminLayout.cmdAria')}
        panelClassName="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-line dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-slate-800">
          <Search className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
          <input
            data-autofocus="true"
            type="search"
            value={cmdQuery}
            onChange={(e) => setCmdQuery(e.target.value)}
            aria-label={t('adminLayout.cmdAria')}
            placeholder={t('adminLayout.cmdPlaceholder')}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCmdOpen(false)}
            aria-label={t('actions.close')}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-4 space-y-4 text-xs">
          {cmdQuery.trim() === '' ? (
            <p className="text-ink/65 dark:text-slate-400">{t('adminLayout.cmdEmptyPrompt')}</p>
          ) : (
            <>
              {searchHits.orders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-bold text-ink/75 dark:text-slate-300">{t('adminLayout.cmdOrders')}</p>
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
                  <p className="font-bold text-ink/75 dark:text-slate-300">{t('adminLayout.cmdProducts')}</p>
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
                      <span className="tabular-nums text-ink/65 dark:text-slate-400">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchHits.tickets.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-bold text-ink/75 dark:text-slate-300">{t('adminLayout.cmdTickets')}</p>
                  {searchHits.tickets.map((tk) => (
                    <button
                      key={tk.id}
                      type="button"
                      onClick={() => {
                        setCmdOpen(false);
                        navigate('/admin/support');
                      }}
                      className="w-full text-right p-2 rounded-lg hover:bg-surface dark:hover:bg-slate-800 flex justify-between"
                    >
                      <span className="font-bold">{tk.subject}</span>
                      <span className="tabular-nums">{tk.ticketNo}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </AccessibleModal>
    </div>
  );
}
