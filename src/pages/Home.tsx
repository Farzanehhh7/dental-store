import { Link } from 'react-router-dom';
import { categories, products } from '../data';
import ProductCard from './ProductCard';

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      <section className="bg-brandDark text-white rounded-xl p-8 md:p-12">
        <h1 className="text-3xl md:text-4xl font-extrabold leading-snug">تجهیزات و مواد مصرفی مطب، یک‌جا</h1>
        <p className="mt-4 max-w-xl text-white/80">از مواد ترمیمی تا ابزار اندو، با قیمت و موجودی شفاف.</p>
        <Link to="/category/consumables" className="inline-block mt-6 bg-white text-brandDark font-bold rounded px-5 py-2.5">مشاهده محصولات</Link>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">دسته‌بندی‌ها</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((c) => (
            <Link key={c.slug} to={`/category/${c.slug}`} className="bg-white border border-line rounded-lg p-4 hover:border-brand">
              <h3 className="font-bold">{c.name}</h3>
              <p className="text-sm text-ink/60 mt-1">{c.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">محصولات</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>
    </div>
  );
}
