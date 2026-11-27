import React, { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  GitCompareArrows,
  Home,
  Languages,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  ShoppingBag,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useI18n } from '../../context/i18n';
import { useStore } from '../../context/StoreContext';
import { buildResponsiveImageProps } from '../../lib/media';
import { scoreSearchMatch } from '../../lib/persian-search';
import { getProductPriceSummary } from '../../lib/pricing';
import { AccessibleModal } from '../ui/Modal';
import CartDrawer from './CartDrawer';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const {
    categories,
    brands,
    products,
    campaigns,
    contractPrices,
    currency,
    setCurrency,
    darkMode,
    toggleDarkMode,
    cart,
    setCartOpen,
    compareIds,
    authUser,
    mobileSession,
    isAdmin,
    settings,
    subscribeNewsletter,
  } = useStore();
  const { t, locale, setLocale, formatDigits } = useI18n();

  const navigate = useNavigate();
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newsletterInput, setNewsletterInput] = useState('');

  const topCategories = useMemo(
    () => categories.filter((c) => c.depth === 0 && c.isActive && c.showInMenu).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return products
      .filter((p) => p.status === 'active')
      .map((p) => {
        const brand = brands.find((b) => b.id === p.brandId);
        const cat = categories.find((c) => c.id === p.primaryCategoryId);
        const score = scoreSearchMatch(searchQuery, {
          exactCodes: [p.sku, p.imedCode ?? '', ...p.variants.map((v) => v.sku)],
          textFields: [p.titleFa, p.titleEn, brand?.nameFa ?? '', brand?.nameEn ?? '', cat?.nameFa ?? '', ...p.tags],
        });
        return { product: p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [searchQuery, products, brands, categories]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const brandTitle = locale === 'en' ? t('brandName') : settings.storeNameFa || t('brandName');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    await subscribeNewsletter(newsletterInput);
    setNewsletterInput('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper dark:bg-slate-950 text-ink dark:text-slate-100">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand focus:text-white focus:font-bold focus:text-xs focus:shadow-lg"
      >
        {t('common.skipToContent')}
      </a>

      {/* Top Bar following 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-line dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={t('storeLayout.mobileMenuAria')}
              aria-expanded={mobileMenuOpen}
              className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-ink/75 dark:text-slate-200 hover:bg-surface dark:hover:bg-slate-800 shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              to="/"
              className="text-base sm:text-xl font-extrabold tracking-tight text-brand dark:text-teal-300 whitespace-nowrap shrink-0"
            >
              {brandTitle}
            </Link>
          </div>

          {/* Zone 2: Clean Single-Line Nav Links + Tree-Driven Mega Menu */}
          <nav
            aria-label={t('storeLayout.mainNavAria')}
            className="hidden md:flex items-center gap-3.5 lg:gap-6 text-xs lg:text-sm font-medium text-ink/85 dark:text-slate-200"
          >
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 hover:text-brand transition-colors ${isActive ? 'text-brand font-bold' : ''}`
              }
            >
              {t('nav.store')}
            </NavLink>

            <div
              className="relative"
              onMouseEnter={() => setMegaOpen(true)}
              onMouseLeave={() => setMegaOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMegaOpen(false);
              }}
            >
              <button
                type="button"
                aria-expanded={megaOpen}
                aria-haspopup="true"
                onClick={() => setMegaOpen((v) => !v)}
                className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 hover:text-brand transition-colors py-2"
              >
                <span>{t('nav.categories')}</span>
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>

              {megaOpen && (
                <div className="absolute start-0 top-full w-[min(760px,calc(100vw-2rem))] bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl shadow-xl p-5 lg:p-6 grid grid-cols-2 lg:grid-cols-4 gap-5 z-50 max-h-[75vh] overflow-y-auto">
                  {topCategories.slice(0, 12).map((cat) => {
                    const children = categories.filter((c) => c.parentId === cat.id && c.isActive).slice(0, 5);
                    return (
                      <div key={cat.id} className="space-y-1.5">
                        <Link
                          to={`/category/${cat.slug}`}
                          onClick={() => setMegaOpen(false)}
                          className="block font-bold text-xs text-brand dark:text-teal-300 hover:underline"
                        >
                          {locale === 'en' && cat.nameEn ? cat.nameEn : cat.nameFa}
                        </Link>
                        {children.length > 0 ? (
                          <ul className="space-y-1">
                            {children.map((sub) => (
                              <li key={sub.id}>
                                <Link
                                  to={`/category/${sub.slug}`}
                                  onClick={() => setMegaOpen(false)}
                                  className="text-[11px] text-ink/75 dark:text-slate-300 hover:text-brand line-clamp-1"
                                >
                                  {locale === 'en' && sub.nameEn ? sub.nameEn : sub.nameFa}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-ink/65 dark:text-slate-400 line-clamp-2">{cat.descriptionFa}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <NavLink
              to="/brands"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 hover:text-brand transition-colors ${isActive ? 'text-brand font-bold' : ''}`
              }
            >
              {t('nav.brands')}
            </NavLink>
            <NavLink
              to="/agents"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 hover:text-brand transition-colors ${isActive ? 'text-brand font-bold' : ''}`
              }
            >
              {t('nav.agents')}
            </NavLink>
            <NavLink
              to="/blog"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 hover:text-brand transition-colors ${isActive ? 'text-brand font-bold' : ''}`
              }
            >
              {t('nav.blog')}
            </NavLink>
          </nav>

          {/* Zone 3: Action Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t('nav.search')}
              data-testid="header-search-button"
              className="min-w-[44px] min-h-[44px] md:min-w-[40px] md:min-h-[40px] inline-flex items-center justify-center rounded-lg border border-line dark:border-slate-700 text-ink/75 dark:text-slate-200 hover:border-brand transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>

            {compareIds.length > 0 && (
              <Link
                to="/compare"
                aria-label={t('storeLayout.compareProductsAria')}
                className="hidden sm:inline-flex items-center gap-1 min-h-[44px] md:min-h-[40px] px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 text-xs font-medium hover:border-brand whitespace-nowrap shrink-0"
              >
                <GitCompareArrows className="w-4 h-4 text-brand" aria-hidden="true" />
                <span className="tabular-nums">{formatDigits(compareIds.length)}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={t('nav.cart')}
              className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-2 rounded-lg border border-line dark:border-slate-700 text-xs font-bold hover:border-brand transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-brand" aria-hidden="true" />
              <span className="hidden sm:inline">{t('nav.cart')}</span>
              <span className="tabular-nums text-brand dark:text-teal-300">{formatDigits(cartCount)}</span>
            </button>

            <Link
              to={isAdmin ? '/admin' : '/account'}
              className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors whitespace-nowrap shrink-0"
            >
              {isAdmin ? <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" /> : <User className="w-4 h-4 shrink-0" aria-hidden="true" />}
              <span className="max-w-[110px] sm:max-w-none truncate">
                {isAdmin
                  ? t('nav.admin')
                  : authUser || mobileSession
                  ? t('storeLayout.myAccount')
                  : t('storeLayout.signInOrAccount')}
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu with Focus Trap */}
      <AccessibleModal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        align="start"
        ariaLabel={t('storeLayout.mobileMenuAria')}
        containerClassName="md:hidden"
        panelClassName="w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-5 space-y-4 overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line dark:border-slate-800 pb-3">
          <span className="font-extrabold text-brand dark:text-teal-300">{brandTitle}</span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t('actions.close')}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg hover:bg-surface dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {topCategories.slice(0, 10).map((cat) => (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-lg bg-surface dark:bg-slate-800 text-xs font-bold"
            >
              {locale === 'en' && cat.nameEn ? cat.nameEn : cat.nameFa}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 pt-3 border-t border-line dark:border-slate-800 text-sm">
          <Link to="/brands" onClick={() => setMobileMenuOpen(false)}>{t('nav.brands')}</Link>
          <Link to="/agents" onClick={() => setMobileMenuOpen(false)}>{t('nav.agents')}</Link>
          <Link to="/blog" onClick={() => setMobileMenuOpen(false)}>{t('nav.blog')}</Link>
          <Link to="/page/contact" onClick={() => setMobileMenuOpen(false)}>{t('nav.contact')}</Link>
          {isAdmin && (
            <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="text-brand font-bold">
              {t('nav.admin')}
            </Link>
          )}
        </div>

        <div className="pt-3 border-t border-line dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-ink/75 dark:text-slate-300">{t('storeLayout.languageLabel')}</span>
          <div className="inline-flex rounded-lg bg-surface dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setLocale('fa')}
              aria-pressed={locale === 'fa'}
              className={`px-2.5 py-1 rounded-md font-bold ${locale === 'fa' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand' : ''}`}
            >
              {t('storeLayout.langFa')}
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              aria-pressed={locale === 'en'}
              className={`px-2.5 py-1 rounded-md font-bold ${locale === 'en' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand' : ''}`}
            >
              {t('storeLayout.langEn')}
            </button>
          </div>
        </div>
      </AccessibleModal>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 pb-16 md:pb-0 outline-none">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-line dark:border-slate-800 bg-white dark:bg-slate-900 mt-12 sm:mt-16 pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 sm:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-brand dark:text-teal-300">{brandTitle}</h2>
            <p className="text-xs leading-relaxed text-ink/75 dark:text-slate-300">{settings.addressFa}</p>
            <p className="text-xs text-ink/75 dark:text-slate-300 tabular-nums">
              {t('storeLayout.supportPhone', { phone: formatDigits(settings.phone) })}
            </p>
            <p className="text-xs text-ink/70 dark:text-slate-400">{settings.workingHoursFa}</p>
          </div>

          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-ink dark:text-slate-200">{t('storeLayout.quickAccess')}</h3>
            <ul className="space-y-1 text-xs text-ink/75 dark:text-slate-300">
              <li><Link to="/category/endodontics" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkEndo')}</Link></li>
              <li><Link to="/category/restorative" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkRestorative')}</Link></li>
              <li><Link to="/category/clinic-equipment" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkEquipment')}</Link></li>
              <li><Link to="/brands" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkBrands')}</Link></li>
              <li><Link to="/agents" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkAgents')}</Link></li>
            </ul>
          </div>

          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-ink dark:text-slate-200">{t('storeLayout.policiesTitle')}</h3>
            <ul className="space-y-1 text-xs text-ink/75 dark:text-slate-300">
              <li><Link to="/page/about" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkAbout')}</Link></li>
              <li><Link to="/page/returns" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkReturns')}</Link></li>
              <li><Link to="/page/warranty" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkWarranty')}</Link></li>
              <li><Link to="/page/privacy" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkPrivacy')}</Link></li>
              <li><Link to="/page/contact" className="hover:text-brand py-1 inline-block">{t('storeLayout.linkContact')}</Link></li>
              <li className="tabular-nums pt-1 text-ink/85 dark:text-slate-200">
                {t('storeLayout.imedCode', { code: settings.imedRegistryCode })}
              </li>
              <li className="tabular-nums text-ink/85 dark:text-slate-200">
                {t('storeLayout.enamadCode', { code: settings.enamadCode })}
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-ink dark:text-slate-200">{t('storeLayout.newsletterTitle')}</h3>
              <form onSubmit={handleNewsletter} className="flex gap-2">
                <input
                  type="text"
                  value={newsletterInput}
                  onChange={(e) => setNewsletterInput(e.target.value)}
                  aria-label={t('footer.newsletterPlaceholder')}
                  placeholder={t('footer.newsletterPlaceholder')}
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark shrink-0"
                >
                  {t('storeLayout.newsletterJoin')}
                </button>
              </form>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line dark:border-slate-800">
              <div className="inline-flex rounded-lg bg-surface dark:bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setCurrency('IRT')}
                  aria-pressed={currency === 'IRT'}
                  className={`px-2.5 py-1 rounded-md font-medium ${currency === 'IRT' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold' : ''}`}
                >
                  {t('price.toman')}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('IRR')}
                  aria-pressed={currency === 'IRR'}
                  className={`px-2.5 py-1 rounded-md font-medium ${currency === 'IRR' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold' : ''}`}
                >
                  {t('price.rial')}
                </button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg bg-surface dark:bg-slate-800 p-1 text-xs" role="group" aria-label={t('storeLayout.languageLabel')}>
                <Languages className="w-3.5 h-3.5 text-brand mx-1" aria-hidden="true" />
                <button
                  type="button"
                  data-testid="lang-switch-fa"
                  onClick={() => setLocale('fa')}
                  aria-pressed={locale === 'fa'}
                  className={`px-2 py-1 rounded-md font-medium ${locale === 'fa' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold text-brand dark:text-teal-300' : ''}`}
                >
                  {t('storeLayout.langFa')}
                </button>
                <button
                  type="button"
                  data-testid="lang-switch-en"
                  onClick={() => setLocale('en')}
                  aria-pressed={locale === 'en'}
                  className={`px-2 py-1 rounded-md font-medium ${locale === 'en' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold text-brand dark:text-teal-300' : ''}`}
                >
                  {t('storeLayout.langEn')}
                </button>
              </div>

              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label={t('storeLayout.themeToggleAria')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 text-xs font-medium hover:border-brand"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{darkMode ? t('storeLayout.lightTheme') : t('storeLayout.darkTheme')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-line dark:border-slate-800 py-4 px-4 lg:px-8 text-xs text-ink/70 dark:text-slate-400 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            © {formatDigits(new Date().getFullYear())} {brandTitle} — {t('footer.copyright')}
          </span>
          {isAdmin && (
            <Link to="/admin" className="hover:text-brand font-medium">
              {t('storeLayout.adminPanelFooterLink')}
            </Link>
          )}
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label={t('storeLayout.mobileBottomNavAria')}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white dark:bg-slate-900 border-t border-line dark:border-slate-800 grid grid-cols-4 text-[11px] font-medium"
      >
        <Link to="/" className="flex flex-col items-center justify-center gap-0.5 text-ink/85 dark:text-slate-200">
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>{t('storeLayout.mobileHome')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-ink/85 dark:text-slate-200"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span>{t('nav.search')}</span>
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-ink/85 dark:text-slate-200"
        >
          <ShoppingBag className="w-4 h-4" aria-hidden="true" />
          <span>{t('storeLayout.mobileCartCount', { count: formatDigits(cartCount) })}</span>
        </button>
        <Link to="/account" className="flex flex-col items-center justify-center gap-0.5 text-ink/85 dark:text-slate-200">
          <User className="w-4 h-4" aria-hidden="true" />
          <span>{t('storeLayout.mobileAccount')}</span>
        </Link>
      </nav>

      {/* Instant Search Modal with Focus Trap */}
      <AccessibleModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        align="top"
        ariaLabel={t('nav.search')}
        panelClassName="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl border border-line dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-slate-800">
          <Search className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
          <input
            data-autofocus="true"
            type="search"
            data-testid="header-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('nav.search')}
            placeholder={t('storeLayout.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label={t('actions.close')}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-ink/70 hover:text-ink dark:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </form>

        <div className="max-h-96 overflow-y-auto divide-y divide-line dark:divide-slate-800">
          {searchQuery.trim() === '' ? (
            <div className="p-5 text-xs text-ink/70 dark:text-slate-300">
              {t('storeLayout.searchHint')}
            </div>
          ) : searchSuggestions.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-ink/75 dark:text-slate-300">
                {t('storeLayout.searchNoResults', { query: searchQuery })}
              </p>
              <Link
                to={`/search?q=${encodeURIComponent(searchQuery)}`}
                onClick={() => setSearchOpen(false)}
                className="inline-block px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold"
              >
                {t('storeLayout.submitStockRequestBtn')}
              </Link>
            </div>
          ) : (
            searchSuggestions.map(({ product }) => {
              const summary = getProductPriceSummary(product, { campaigns, currency, settings, contractPrices, userId: authUser?.uid });
              const prodTitle = locale === 'en' && product.titleEn ? product.titleEn : product.titleFa;
              return (
                <Link
                  key={product.id}
                  to={`/product/${product.slug}`}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface dark:hover:bg-slate-800 transition-colors"
                >
                  <img
                    {...buildResponsiveImageProps(product.imageUrl, {
                      widths: [96, 192],
                      sizes: '48px',
                    })}
                    alt={prodTitle}
                    width={48}
                    height={36}
                    className="w-12 h-9 object-cover rounded bg-surface"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{prodTitle}</p>
                    <p className="text-xs text-ink/70 dark:text-slate-400 tabular-nums">
                      {product.sku} · {product.imedCode}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-brand dark:text-teal-300 tabular-nums shrink-0">
                    {summary.label}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </AccessibleModal>

      <CartDrawer />
    </div>
  );
}
