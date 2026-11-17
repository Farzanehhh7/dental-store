import React, { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  GitCompareArrows,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  ShoppingBag,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { t } from '../../lib/i18n';
import { toPersianDigits } from '../../lib/jalali';
import { scoreSearchMatch } from '../../lib/persian-search';
import { getProductPriceSummary } from '../../lib/pricing';
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
      {/* Top Bar following 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-line dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="منوی موبایل"
              className="md:hidden p-2 rounded-lg text-ink/70 dark:text-slate-300 hover:bg-surface dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              to="/"
              className="text-xl font-extrabold tracking-tight text-brand dark:text-teal-300 whitespace-nowrap shrink-0"
            >
              {settings.storeNameFa || t('brandName')}
            </Link>
          </div>

          {/* Zone 2: Clean Single-Line Nav Links + Tree-Driven Mega Menu */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-ink/80 dark:text-slate-300">
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
            >
              <button
                type="button"
                onClick={() => setMegaOpen((v) => !v)}
                className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 hover:text-brand transition-colors py-2"
              >
                <span>{t('nav.categories')}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {megaOpen && (
                <div className="absolute right-0 top-full w-[760px] max-w-[92vw] bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl shadow-xl p-6 grid grid-cols-4 gap-5 z-50 max-h-[75vh] overflow-y-auto">
                  {topCategories.slice(0, 12).map((cat) => {
                    const children = categories.filter((c) => c.parentId === cat.id && c.isActive).slice(0, 5);
                    return (
                      <div key={cat.id} className="space-y-1.5">
                        <Link
                          to={`/category/${cat.slug}`}
                          onClick={() => setMegaOpen(false)}
                          className="block font-bold text-xs text-brand dark:text-teal-300 hover:underline"
                        >
                          {cat.nameFa}
                        </Link>
                        {children.length > 0 ? (
                          <ul className="space-y-1">
                            {children.map((sub) => (
                              <li key={sub.id}>
                                <Link
                                  to={`/category/${sub.slug}`}
                                  onClick={() => setMegaOpen(false)}
                                  className="text-[11px] text-ink/70 dark:text-slate-400 hover:text-brand line-clamp-1"
                                >
                                  {sub.nameFa}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-ink/50 dark:text-slate-500 line-clamp-2">{cat.descriptionFa}</p>
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t('nav.search')}
              className="p-2 rounded-lg border border-line dark:border-slate-700 text-ink/70 dark:text-slate-300 hover:border-brand transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>

            {compareIds.length > 0 && (
              <Link
                to="/compare"
                aria-label="مقایسه محصولات"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-line dark:border-slate-700 text-xs font-medium hover:border-brand whitespace-nowrap shrink-0"
              >
                <GitCompareArrows className="w-4 h-4 text-brand" />
                <span className="tabular-nums">{toPersianDigits(compareIds.length)}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={t('nav.cart')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line dark:border-slate-700 text-xs font-bold hover:border-brand transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">{t('nav.cart')}</span>
              <span className="tabular-nums text-brand dark:text-teal-300">{toPersianDigits(cartCount)}</span>
            </button>

            <Link
              to={isAdmin ? '/admin' : '/account'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark transition-colors whitespace-nowrap shrink-0"
            >
              {isAdmin ? <LayoutDashboard className="w-4 h-4" /> : <User className="w-4 h-4" />}
              <span>
                {isAdmin
                  ? t('nav.admin')
                  : authUser || mobileSession
                  ? 'حساب من'
                  : 'ورود / حساب'}
              </span>
            </Link>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-line dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {topCategories.slice(0, 10).map((cat) => (
                <Link
                  key={cat.id}
                  to={`/category/${cat.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-lg bg-surface dark:bg-slate-800 text-xs font-bold"
                >
                  {cat.nameFa}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-line dark:border-slate-800 text-sm">
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
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      {/* Footer */}
      <footer className="border-t border-line dark:border-slate-800 bg-white dark:bg-slate-900 mt-16 pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-brand dark:text-teal-300">{settings.storeNameFa}</h2>
            <p className="text-xs leading-relaxed text-ink/70 dark:text-slate-400">{settings.addressFa}</p>
            <p className="text-xs text-ink/70 dark:text-slate-400 tabular-nums">تلفن پشتیبانی: {settings.phone}</p>
            <p className="text-xs text-ink/60 dark:text-slate-500">{settings.workingHoursFa}</p>
          </div>

          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-ink dark:text-slate-200">دسترسی سریع</h3>
            <ul className="space-y-1.5 text-xs text-ink/70 dark:text-slate-400">
              <li><Link to="/category/endodontics" className="hover:text-brand">تجهیزات و مواد اندودانتیکس</Link></li>
              <li><Link to="/category/restorative" className="hover:text-brand">مواد ترمیمی و زیبایی</Link></li>
              <li><Link to="/category/clinic-equipment" className="hover:text-brand">تجهیزات سرمایه‌ای مطب</Link></li>
              <li><Link to="/brands" className="hover:text-brand">برندهای معتبر دندانپزشکی</Link></li>
              <li><Link to="/agents" className="hover:text-brand">شبکه نمایندگی‌های استانی</Link></li>
            </ul>
          </div>

          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-ink dark:text-slate-200">قوانین و مجوزها</h3>
            <ul className="space-y-1.5 text-xs text-ink/70 dark:text-slate-400">
              <li><Link to="/page/about" className="hover:text-brand">درباره دنتال‌مارکت</Link></li>
              <li><Link to="/page/returns" className="hover:text-brand">شرایط مرجوعی کالا</Link></li>
              <li><Link to="/page/warranty" className="hover:text-brand">گارانتی و خدمات پس از فروش</Link></li>
              <li><Link to="/page/privacy" className="hover:text-brand">حریم خصوصی و امنیت داده‌ها</Link></li>
              <li><Link to="/page/contact" className="hover:text-brand">تماس با ما و مشاوره</Link></li>
              <li className="tabular-nums pt-1 text-ink/80 dark:text-slate-300">کد IMED: {settings.imedRegistryCode}</li>
              <li className="tabular-nums text-ink/80 dark:text-slate-300">شناسه نماد اعتماد: {settings.enamadCode}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-ink dark:text-slate-200">خبرنامه اطلاع‌رسانی علمی و تخفیف‌ها</h3>
              <form onSubmit={handleNewsletter} className="flex gap-2">
                <input
                  type="text"
                  value={newsletterInput}
                  onChange={(e) => setNewsletterInput(e.target.value)}
                  placeholder={t('footer.newsletterPlaceholder')}
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brandDark shrink-0"
                >
                  عضویت
                </button>
              </form>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-line dark:border-slate-800">
              <div className="inline-flex rounded-lg bg-surface dark:bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setCurrency('IRT')}
                  className={`px-2.5 py-1 rounded-md font-medium ${currency === 'IRT' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold' : ''}`}
                >
                  {t('price.toman')}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('IRR')}
                  className={`px-2.5 py-1 rounded-md font-medium ${currency === 'IRR' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold' : ''}`}
                >
                  {t('price.rial')}
                </button>
              </div>

              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label="تغییر تم روشن/تاریک"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 text-xs font-medium hover:border-brand"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'تم روشن' : 'تم تاریک'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-line dark:border-slate-800 py-4 px-4 lg:px-8 text-xs text-ink/60 dark:text-slate-500 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>© {toPersianDigits(new Date().getFullYear())} {settings.storeNameFa} — {t('footer.copyright')}</span>
          {isAdmin && (
            <Link to="/admin" className="hover:text-brand font-medium">ورود به پنل مدیریت و عملیات انبار</Link>
          )}
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="ناوبری پایین موبایل"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white dark:bg-slate-900 border-t border-line dark:border-slate-800 grid grid-cols-4 text-[11px] font-medium"
      >
        <Link to="/" className="flex flex-col items-center justify-center gap-0.5 text-ink/80 dark:text-slate-300">
          <Home className="w-4 h-4" />
          <span>خانه</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-ink/80 dark:text-slate-300"
        >
          <Search className="w-4 h-4" />
          <span>{t('nav.search')}</span>
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-ink/80 dark:text-slate-300"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>سبد ({toPersianDigits(cartCount)})</span>
        </button>
        <Link to="/account" className="flex flex-col items-center justify-center gap-0.5 text-ink/80 dark:text-slate-300">
          <User className="w-4 h-4" />
          <span>حساب</span>
        </Link>
      </nav>

      {/* Instant Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 px-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0" onClick={() => setSearchOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl border border-line dark:border-slate-800 shadow-2xl overflow-hidden">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-slate-800">
              <Search className="w-5 h-5 text-brand shrink-0" />
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو بر اساس نام فارسی/انگلیسی، کد SKU، کد IMED یا برند (مثلاً کامپوزیت، وودپیکر، DM-RST)..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="p-1 text-ink/50 hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </form>

            <div className="max-h-96 overflow-y-auto divide-y divide-line dark:divide-slate-800">
              {searchQuery.trim() === '' ? (
                <div className="p-5 text-xs text-ink/60 dark:text-slate-400">
                  جستجوی هوشمند با نرمال‌سازی حروف فارسی/عربی، پشتیبانی از غلط املایی و مترادف برندها.
                </div>
              ) : searchSuggestions.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-sm text-ink/70 dark:text-slate-400">نتیجه‌ای برای «{searchQuery}» یافت نشد.</p>
                  <Link
                    to={`/search?q=${encodeURIComponent(searchQuery)}`}
                    onClick={() => setSearchOpen(false)}
                    className="inline-block px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold"
                  >
                    ثبت درخواست کالای ناموجود
                  </Link>
                </div>
              ) : (
                searchSuggestions.map(({ product }) => {
                  const summary = getProductPriceSummary(product, { campaigns, currency, settings, contractPrices, userId: authUser?.uid });
                  return (
                    <Link
                      key={product.id}
                      to={`/product/${product.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface dark:hover:bg-slate-800 transition-colors"
                    >
                      <img src={product.imageUrl} alt={product.titleFa} className="w-12 h-9 object-cover rounded bg-surface" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{product.titleFa}</p>
                        <p className="text-xs text-ink/50 dark:text-slate-400 tabular-nums">
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
          </div>
        </div>
      )}

      <CartDrawer />
    </div>
  );
}
