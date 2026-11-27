import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import StoreLayout from './components/store/StoreLayout';
import { PageSkeleton } from './components/ui/States';
import { useI18n } from './context/i18n';
import { useStore } from './context/StoreContext';

const Home = lazy(() => import('./pages/Home'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));

const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));

const SearchPage = lazy(() => import('./pages/SearchComparePages').then((m) => ({ default: m.SearchPage })));
const ComparePage = lazy(() => import('./pages/SearchComparePages').then((m) => ({ default: m.ComparePage })));
const WishlistPage = lazy(() => import('./pages/SearchComparePages').then((m) => ({ default: m.WishlistPage })));

const CartPage = lazy(() => import('./pages/CartCheckoutPages').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./pages/CartCheckoutPages').then((m) => ({ default: m.CheckoutPage })));

const PackDetailPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.PackDetailPage })));
const PublicProformaPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.PublicProformaPage })));
const BrandsListPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.BrandsListPage })));
const BrandDetailPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.BrandDetailPage })));
const AgentsPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.AgentsPage })));
const BlogListPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.BlogListPage })));
const BlogPostPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.BlogPostPage })));
const StaticInfoPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.StaticInfoPage })));
const NotFoundPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.NotFoundPage })));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));

const AdminDashboardHome = lazy(() => import('./pages/admin/AdminDashboardHome'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminBrandsPage = lazy(() => import('./pages/admin/AdminBrandsPage'));
const AdminPricingCampaignsPage = lazy(() => import('./pages/admin/AdminPricingCampaignsPage'));
const AdminInventoryPage = lazy(() => import('./pages/admin/AdminInventoryPage'));
const AdminSalesPage = lazy(() => import('./pages/admin/AdminSalesPage'));
const AdminCustomersSupportPage = lazy(() => import('./pages/admin/AdminCustomersSupportPage'));
const AdminContentPage = lazy(() => import('./pages/admin/AdminContentPage'));
const AdminSeoPage = lazy(() => import('./pages/admin/AdminSeoPage'));
const AdminImportExportPage = lazy(() => import('./pages/admin/AdminImportExportPage'));
const AdminSystemPage = lazy(() => import('./pages/admin/AdminSystemPage'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RedirectInterceptor({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { redirects, incrementRedirectHit } = useStore();
  const { t, formatDigits } = useI18n();
  const [gonePath, setGonePath] = useState<string | null>(null);

  useEffect(() => {
    const match = redirects.find((r) => r.fromPath === pathname);
    if (!match) {
      setGonePath(null);
      return;
    }
    void incrementRedirectHit(match.id);
    if (match.statusCode === 410) {
      setGonePath(pathname);
    } else if (match.toPath && match.toPath !== pathname) {
      setGonePath(null);
      navigate(match.toPath, { replace: true });
    }
  }, [pathname, redirects, navigate]);

  if (gonePath === pathname) {
    return (
      <StoreLayout>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
          <p className="text-4xl font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
            {formatDigits('410')}
          </p>
          <h1 className="text-2xl font-extrabold">{t('seo.goneTitle')}</h1>
          <Link to="/" className="inline-block px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
            {t('actions.backHome')}
          </Link>
        </div>
      </StoreLayout>
    );
  }

  return <>{children}</>;
}

function ToastContainer() {
  const { toasts } = useStore();
  const { t } = useI18n();
  return (
    <div
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-label={t('common.notificationsRegion')}
      className="fixed bottom-16 md:bottom-5 inset-x-4 sm:inset-x-auto sm:left-5 z-50 flex flex-col gap-2 sm:max-w-sm pointer-events-none"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-xs font-bold border ${
            item.tone === 'success'
              ? 'bg-emerald-700 text-white border-emerald-600'
              : item.tone === 'error'
              ? 'bg-rose-700 text-white border-rose-600'
              : 'bg-ink text-white border-slate-700'
          }`}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <RedirectInterceptor>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* Admin Routes (lazy loaded shell + pages) */}
            <Route path="/admin" element={<AdminLayout><AdminDashboardHome /></AdminLayout>} />
            <Route path="/admin/reports" element={<AdminLayout><AdminReportsPage /></AdminLayout>} />
            <Route path="/admin/products" element={<AdminLayout><AdminProductsPage /></AdminLayout>} />
            <Route path="/admin/categories" element={<AdminLayout><AdminCategoriesPage /></AdminLayout>} />
            <Route path="/admin/brands" element={<AdminLayout><AdminBrandsPage /></AdminLayout>} />
            <Route path="/admin/pricing" element={<AdminLayout><AdminPricingCampaignsPage /></AdminLayout>} />
            <Route path="/admin/inventory" element={<AdminLayout><AdminInventoryPage /></AdminLayout>} />
            <Route path="/admin/orders" element={<AdminLayout><AdminSalesPage /></AdminLayout>} />
            <Route path="/admin/customers" element={<AdminLayout><AdminCustomersSupportPage mode="customers" /></AdminLayout>} />
            <Route path="/admin/support" element={<AdminLayout><AdminCustomersSupportPage mode="support" /></AdminLayout>} />
            <Route path="/admin/content" element={<AdminLayout><AdminContentPage /></AdminLayout>} />
            <Route path="/admin/seo" element={<AdminLayout><AdminSeoPage /></AdminLayout>} />
            <Route path="/admin/import-export" element={<AdminLayout><AdminImportExportPage /></AdminLayout>} />
            <Route path="/admin/system" element={<AdminLayout><AdminSystemPage /></AdminLayout>} />

            {/* Storefront Routes */}
            <Route path="/" element={<StoreLayout><Home /></StoreLayout>} />
            <Route path="/category/:slug" element={<StoreLayout><CategoryPage /></StoreLayout>} />
            <Route path="/category/:slug/brand/:brandSlug" element={<StoreLayout><CategoryPage /></StoreLayout>} />
            <Route path="/product/:slug" element={<StoreLayout><ProductPage /></StoreLayout>} />
            <Route path="/pack/:slug" element={<StoreLayout><PackDetailPage /></StoreLayout>} />
            <Route path="/search" element={<StoreLayout><SearchPage /></StoreLayout>} />
            <Route path="/compare" element={<StoreLayout><ComparePage /></StoreLayout>} />
            <Route path="/wishlist" element={<StoreLayout><WishlistPage /></StoreLayout>} />
            <Route path="/cart" element={<StoreLayout><CartPage /></StoreLayout>} />
            <Route path="/checkout" element={<StoreLayout><CheckoutPage /></StoreLayout>} />
            <Route path="/account" element={<StoreLayout><AccountPage /></StoreLayout>} />
            <Route path="/login" element={<StoreLayout><AccountPage /></StoreLayout>} />
            <Route path="/proforma/:token" element={<StoreLayout><PublicProformaPage /></StoreLayout>} />
            <Route path="/brands" element={<StoreLayout><BrandsListPage /></StoreLayout>} />
            <Route path="/brand/:slug" element={<StoreLayout><BrandDetailPage /></StoreLayout>} />
            <Route path="/agents" element={<StoreLayout><AgentsPage /></StoreLayout>} />
            <Route path="/agents/:provinceSlug" element={<StoreLayout><AgentsPage /></StoreLayout>} />
            <Route path="/blog" element={<StoreLayout><BlogListPage /></StoreLayout>} />
            <Route path="/blog/category/:slug" element={<StoreLayout><BlogListPage /></StoreLayout>} />
            <Route path="/blog/:slug" element={<StoreLayout><BlogPostPage /></StoreLayout>} />
            <Route path="/page/:slug" element={<StoreLayout><StaticInfoPage /></StoreLayout>} />
            <Route path="/unsubscribe" element={<StoreLayout><UnsubscribePage /></StoreLayout>} />
            <Route path="*" element={<StoreLayout><NotFoundPage /></StoreLayout>} />
          </Routes>
        </Suspense>
      </RedirectInterceptor>
      <ToastContainer />
    </>
  );
}
