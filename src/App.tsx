import { Link, NavLink, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import ProductPage from './pages/ProductPage';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-extrabold text-brand">دنتال‌مارکت</Link>
          <nav className="flex gap-6 text-sm font-medium">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'text-brand' : 'hover:text-brand')}>خانه</NavLink>
            <NavLink to="/category/consumables" className="hover:text-brand">دسته‌بندی‌ها</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/product/:slug" element={<ProductPage />} />
          <Route path="*" element={<p className="max-w-6xl mx-auto p-8">صفحه پیدا نشد.</p>} />
        </Routes>
      </main>
      <footer className="border-t border-line bg-white text-sm text-ink/70">
        <div className="max-w-6xl mx-auto px-4 py-6">نسخه نمایشی با داده نمونه. اطلاعات واقعی از پایگاه داده خواهد آمد.</div>
      </footer>
    </div>
  );
}
