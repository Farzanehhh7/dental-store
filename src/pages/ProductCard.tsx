import { Link } from 'react-router-dom';
import { Product, priceLabel } from '../data';

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/product/${product.slug}`} className="block bg-white border border-line rounded-lg p-4 hover:border-brand">
      <div className="h-32 rounded bg-paper mb-3 flex items-center justify-center text-ink/30 text-sm">تصویر محصول</div>
      <p className="text-xs text-ink/60">{product.brand}</p>
      <h3 className="font-bold mt-1">{product.name}</h3>
      <p className="mt-3 text-brand font-bold">{priceLabel(product)}</p>
    </Link>
  );
}
