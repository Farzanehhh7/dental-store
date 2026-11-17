import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { categories, products } from '../data';
import ProductCard from './ProductCard';

export default function CategoryPage() {
  const { slug } = useParams();
  const category = categories.find((c) => c.slug === slug);
  const inCategory = products.filter((p) => p.category === slug);
  const brands = useMemo(() => Array.from(new Set(inCategory.map((p) => p.brand))), [slug]);
  const [selected, setSelected] = useState<string[]>([]);
  const [onlyInStock, setOnlyInStock] = useState(false);

  const shown = inCategory.filter(
    (p) =>
      (selected.length === 0 || selected.includes(p.brand)) &&
      (!onlyInStock || p.variants.some((v) => v.inStock))
  );
  const toggle = (b: string) => setSelected((s) => (s.includes(b) ? s.filter((x) => x !== b) : [...s, b]));

  if (!category) return <p className="max-w-6xl mx-auto p-8">دسته‌بندی پیدا نشد.</p>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold">{category.name}</h1>
      <p className="text-ink/60 mt-1">{category.description}</p>
      <div className="mt-6 grid md:grid-cols-[220px_1fr] gap-6">
        <aside className="bg-white border border-line rounded-lg p-4 h-fit space-y-4">
          <div>
            <h2 className="font-bold mb-2">برند</h2>
            {brands.map((b) => (
              <label key={b} className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={selected.includes(b)} onChange={() => toggle(b)} /> {b}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> فقط موجود
          </label>
        </aside>
        <div>
          {shown.length === 0 ? (
            <p className="text-ink/60">محصولی با این فیلترها پیدا نشد. فیلترها را کم کنید.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {shown.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
