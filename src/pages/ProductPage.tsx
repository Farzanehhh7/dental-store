import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatNumber, products } from '../data';

export default function ProductPage() {
  const { slug } = useParams();
  const product = products.find((p) => p.slug === slug);
  const [variantId, setVariantId] = useState(product?.variants[0]?.id);

  if (!product) return <p className="max-w-6xl mx-auto p-8">محصول پیدا نشد.</p>;
  const variant = product.variants.find((v) => v.id === variantId)!;

  const priceText = !variant.inStock
    ? 'ناموجود'
    : variant.price === null
    ? 'برای قیمت تماس بگیرید'
    : `${formatNumber(variant.price)} تومان`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to={`/category/${product.category}`} className="text-sm text-brand">بازگشت به دسته‌بندی</Link>
      <div className="mt-4 grid md:grid-cols-2 gap-8">
        <div className="bg-white border border-line rounded-lg h-72 flex items-center justify-center text-ink/30">تصویر محصول</div>
        <div>
          <p className="text-sm text-ink/60">{product.brand}</p>
          <h1 className="text-2xl font-extrabold mt-1">{product.name}</h1>
          <p className="mt-3 text-ink/80">{product.summary}</p>

          <h2 className="font-bold mt-6 mb-2">انتخاب نوع</h2>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setVariantId(v.id)}
                className={`px-3 py-2 rounded border text-sm ${v.id === variantId ? 'border-brand bg-brand text-white' : 'border-line bg-white'} ${!v.inStock ? 'opacity-60' : ''}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <p className="mt-6 text-2xl font-extrabold text-brand">{priceText}</p>
          <button disabled={!variant.inStock || variant.price === null} className="mt-4 bg-brand text-white font-bold rounded px-6 py-3 disabled:bg-line disabled:text-ink/40">
            افزودن به سبد خرید
          </button>
        </div>
      </div>
    </div>
  );
}
