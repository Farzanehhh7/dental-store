import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { toPersianDigits } from '../../lib/jalali';
import { Brand } from '../../types/domain';

export function AdminBrandsPage() {
  const { brands, products, upsertBrand, deleteBrand } = useStore();
  const [editing, setEditing] = useState<Brand | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-extrabold">مدیریت برندها و نمایندگی اصالت</h1>
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: `br_${Date.now()}`,
              nameFa: '',
              nameEn: '',
              slug: `brand-${Date.now()}`,
              countryCode: 'DE',
              countryFa: 'آلمان',
              descriptionFa: '',
              isAuthorizedDealer: true,
              warrantyProvider: 'نمایندگی رسمی دنتال‌مارکت',
              isActive: true,
              updatedAt: new Date().toISOString(),
            })
          }
          className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          + برند جدید
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((b) => (
          <div key={b.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h2 className="text-base font-extrabold">{b.nameFa}</h2>
                <p className="text-ink/55">{b.nameEn} · {b.countryFa}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(structuredClone(b))}
                  className="px-2.5 py-1 rounded-lg border border-line dark:border-slate-700 font-bold"
                >
                  ویرایش
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrand(b.id)}
                  className="px-2 py-1 rounded-lg border border-rose-200 text-rose-600 font-bold"
                >
                  حذف
                </button>
              </div>
            </div>
            <p className="text-ink/70 dark:text-slate-400 line-clamp-2">{b.descriptionFa}</p>
            <p className="font-bold text-brand tabular-nums">
              {toPersianDigits(products.filter((p) => p.brandId === b.id).length)} محصول · {b.isAuthorizedDealer ? 'نماینده رسمی' : 'عرضه‌کننده'}
            </p>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">اطلاعات برند</h2>
            <input value={editing.nameFa} onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })} placeholder="نام فارسی" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} placeholder="نام انگلیسی" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <input value={editing.countryFa} onChange={(e) => setEditing({ ...editing, countryFa: e.target.value })} placeholder="کشور سازنده" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <label className="inline-flex items-center gap-2 font-bold">
              <input type="checkbox" checked={editing.isAuthorizedDealer} onChange={(e) => setEditing({ ...editing, isAuthorizedDealer: e.target.checked })} />
              <span>نماینده رسمی با ضمانت اصالت</span>
            </label>
            <textarea rows={2} value={editing.descriptionFa} onChange={(e) => setEditing({ ...editing, descriptionFa: e.target.value })} placeholder="توضیحات برند" className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertBrand(editing); setEditing(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره برند</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBrandsPage;
