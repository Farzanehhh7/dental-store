import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import StoreLayout from './components/store/StoreLayout';
import AdminLayout from './components/admin/AdminLayout';
import { useStore } from './context/StoreContext';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import ProductPage from './pages/ProductPage';
import { ComparePage, SearchPage, WishlistPage } from './pages/SearchComparePages';
import { CartPage, CheckoutPage } from './pages/CartCheckoutPages';
import AccountPage from './pages/AccountPage';
import {
  AgentsPage,
  BlogListPage,
  BlogPostPage,
  BrandDetailPage,
  BrandsListPage,
  NotFoundPage,
  StaticInfoPage,
} from './pages/ContentPages';
import AdminDashboardHome from './pages/admin/AdminDashboardHome';
import {
  AdminBrandsPage,
  AdminCategoriesPage,
  AdminPricingCampaignsPage,
  AdminProductsPage,
} from './pages/admin/AdminCatalogPages';
import {
  AdminCustomersSupportPage,
  AdminInventoryPage,
  AdminSalesPage,
} from './pages/admin/AdminOperationsPages';
import {
  AdminContentPage,
  AdminImportExportPage,
  AdminReportsPage,
  AdminSeoPage,
  AdminSystemPage,
} from './pages/admin/AdminSystemSeoPages';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function ToastContainer() {
  const { toasts } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-16 md:bottom-5 left-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-lg text-xs font-bold border ${
            t.tone === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : t.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-ink text-white border-slate-700'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Admin Routes */}
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
        <Route path="/search" element={<StoreLayout><SearchPage /></StoreLayout>} />
        <Route path="/compare" element={<StoreLayout><ComparePage /></StoreLayout>} />
        <Route path="/wishlist" element={<StoreLayout><WishlistPage /></StoreLayout>} />
        <Route path="/cart" element={<StoreLayout><CartPage /></StoreLayout>} />
        <Route path="/checkout" element={<StoreLayout><CheckoutPage /></StoreLayout>} />
        <Route path="/account" element={<StoreLayout><AccountPage /></StoreLayout>} />
        <Route path="/login" element={<StoreLayout><AccountPage /></StoreLayout>} />
        <Route path="/brands" element={<StoreLayout><BrandsListPage /></StoreLayout>} />
        <Route path="/brand/:slug" element={<StoreLayout><BrandDetailPage /></StoreLayout>} />
        <Route path="/agents" element={<StoreLayout><AgentsPage /></StoreLayout>} />
        <Route path="/agents/:provinceSlug" element={<StoreLayout><AgentsPage /></StoreLayout>} />
        <Route path="/blog" element={<StoreLayout><BlogListPage /></StoreLayout>} />
        <Route path="/blog/:slug" element={<StoreLayout><BlogPostPage /></StoreLayout>} />
        <Route path="/page/:slug" element={<StoreLayout><StaticInfoPage /></StoreLayout>} />
        <Route path="*" element={<StoreLayout><NotFoundPage /></StoreLayout>} />
      </Routes>
      <ToastContainer />
    </>
  );
}
