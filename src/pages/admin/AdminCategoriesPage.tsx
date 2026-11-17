import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { toPersianDigits } from '../../lib/jalali';
import { AttributeDef, Bundle, Category } from '../../types/domain';

export function AdminCategoriesPage() {
  const {
    categories,
    attributes,
    bundles,
    products,
    upsertCategory,
    deleteCategory,
    upsertAttribute,
    deleteAttribute,
    upsertBundle,
    deleteBundle,
  } = useStore();

  const [tab, setTab] = useState<'cats' | 'attrs' | 'bundles'>('cats');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingAttr, setEditingAttr] = useState<AttributeDef | null>(null);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">دسته‌بندی‌ها، ویژگی‌های فنی و پکیج‌ها</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('cats')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'cats' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            دسته‌بندی‌ها ({toPersianDigits(categories.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('attrs')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'attrs' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            ویژگی‌های فنی ({toPersianDigits(attributes.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('bundles')}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === 'bundles' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'}`}
          >
            باندل و کیت‌ها ({toPersianDigits(bundles.length)})
          </button>
        </div>
      </div>

      {tab === 'cats' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingCat({
                  id: `cat_${Date.now()}`,
                  parentId: null,
                  path: `cat-${Date.now()}`,
                  depth: 0,
                  vertical: 'dental',
                  nameFa: '',
                  nameEn: '',
                  slug: `category-${Date.now()}`,
                  descriptionFa: '',
                  seoTextFa: '',
                  isActive: true,
                  showInMenu: true,
                  showOnHome: true,
                  sortOrder: categories.length + 1,
                  attributeIds: [],
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
            >
              + دسته‌بندی جدید
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
            {[...categories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat) => {
                const count = products.filter((p) => p.categoryIds.includes(cat.id)).length;
                return (
                  <div key={cat.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div style={{ paddingRight: `${cat.depth * 24}px` }}>
                      <p className="font-extrabold text-sm">{cat.depth > 0 ? '↳ ' : ''}{cat.nameFa} ({cat.nameEn})</p>
                      <p className="text-ink/55 tabular-nums">
                        /{cat.slug} · {toPersianDigits(count)} محصول · {toPersianDigits(cat.attributeIds.length)} ویژگی متصل
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCat(structuredClone(cat))}
                        className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tab === 'attrs' && (
        <div className="space-y-4 text-xs">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingAttr({
                  id: `attr_${Date.now()}`,
                  code: `attr_${String(Date.now()).slice(-4)}`,
                  labelFa: '',
                  labelEn: '',
                  type: 'select',
                  unit: '',
                  isFilterable: true,
                  isComparable: true,
                  showInSpec: true,
                  options: [],
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              + ویژگی جدید
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
            {attributes.map((a) => (
              <div key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-sm">{a.labelFa} ({a.code})</p>
                  <p className="text-ink/60">
                    نوع: {a.type} {a.unit ? `· واحد: ${a.unit}` : ''} · {a.isFilterable ? 'فیلترپذیر' : ''} {a.isComparable ? '· قابل مقایسه' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingAttr(structuredClone(a))} className="px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold">
                    ویرایش
                  </button>
                  <button type="button" onClick={() => deleteAttribute(a.id)} className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold">
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'bundles' && (
        <div className="space-y-4 text-xs">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingBundle({
                  id: `bnd_${Date.now()}`,
                  nameFa: '',
                  slug: `bundle-${Date.now()}`,
                  kind: 'starter_pack',
                  descriptionFa: '',
                  imageUrl: '/src/assets/images/product_composite_kit_1794921818527.jpg',
                  discountPercent: 10,
                  items: products.slice(0, 2).map((p) => ({ productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 })),
                  status: 'active',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              + پکیج / باندل جدید
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bundles.map((bn) => (
              <div key={bn.id} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-extrabold text-sm">{bn.nameFa}</p>
                    <p className="text-ink/55 tabular-nums">/{bn.slug} · {toPersianDigits(bn.discountPercent)}٪ تخفیف · {toPersianDigits(bn.items.length)} کالا</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setEditingBundle(structuredClone(bn))} className="px-2.5 py-1 rounded border border-line font-bold">
                      ویرایش
                    </button>
                    <button type="button" onClick={() => deleteBundle(bn.id)} className="px-2.5 py-1 rounded border border-rose-200 text-rose-600 font-bold">
                      حذف
                    </button>
                  </div>
                </div>
                <p className="text-ink/70">{bn.descriptionFa}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingCat && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 text-xs">
            <h2 className="text-base font-extrabold">ویرایش دسته‌بندی</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-bold">نام فارسی</span>
                <input
                  value={editingCat.nameFa}
                  onChange={(e) => setEditingCat({ ...editingCat, nameFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">نامک (Slug)</span>
                <input
                  value={editingCat.slug}
                  onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">دسته والد</span>
                <select
                  value={editingCat.parentId ?? ''}
                  onChange={(e) => {
                    const pid = e.target.value || null;
                    const parent = categories.find((c) => c.id === pid);
                    setEditingCat({
                      ...editingCat,
                      parentId: pid,
                      depth: parent ? parent.depth + 1 : 0,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                >
                  <option value="">سطح ریشه (دسته اصلی)</option>
                  {categories.filter((c) => c.id !== editingCat.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.nameFa}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-bold">ترتیب نمایش</span>
                <input
                  type="number"
                  value={editingCat.sortOrder}
                  onChange={(e) => setEditingCat({ ...editingCat, sortOrder: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="font-bold">متن مقدمه سئو</span>
                <textarea
                  rows={2}
                  value={editingCat.seoTextFa}
                  onChange={(e) => setEditingCat({ ...editingCat, seoTextFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <div className="col-span-2 space-y-1">
                <span className="font-bold block">ویژگی‌های فیلترپذیر متصل (Attribute Set):</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {attributes.map((a) => {
                    const checked = editingCat.attributeIds.includes(a.id);
                    return (
                      <label key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditingCat({
                              ...editingCat,
                              attributeIds: checked
                                ? editingCat.attributeIds.filter((id) => id !== a.id)
                                : [...editingCat.attributeIds, a.id],
                            })
                          }
                        />
                        <span>{a.labelFa}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingCat(null)} className="px-4 py-2 rounded-xl border border-line font-bold">
                بستن
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertCategory(editingCat);
                  setEditingCat(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                ذخیره دسته‌بندی
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAttr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">ویرایش ویژگی فنی</h2>
            <div className="grid grid-cols-2 gap-3">
              <input value={editingAttr.labelFa} onChange={(e) => setEditingAttr({ ...editingAttr, labelFa: e.target.value })} placeholder="عنوان فارسی" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input value={editingAttr.code} onChange={(e) => setEditingAttr({ ...editingAttr, code: e.target.value })} placeholder="کد انگلیسی (code)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <select value={editingAttr.type} onChange={(e) => setEditingAttr({ ...editingAttr, type: e.target.value as AttributeDef['type'] })} className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800">
                <option value="select">انتخابی (Select)</option>
                <option value="boolean">بله/خیر (Boolean)</option>
                <option value="number">عددی</option>
                <option value="text">متنی</option>
              </select>
              <input value={editingAttr.unit ?? ''} onChange={(e) => setEditingAttr({ ...editingAttr, unit: e.target.value })} placeholder="واحد (مثلاً W یا ml)" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            </div>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-1.5 font-bold">
                <input type="checkbox" checked={editingAttr.isFilterable} onChange={(e) => setEditingAttr({ ...editingAttr, isFilterable: e.target.checked })} /> فیلترپذیر
              </label>
              <label className="inline-flex items-center gap-1.5 font-bold">
                <input type="checkbox" checked={editingAttr.isComparable} onChange={(e) => setEditingAttr({ ...editingAttr, isComparable: e.target.checked })} /> قابل مقایسه
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAttr(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertAttribute(editingAttr); setEditingAttr(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره ویژگی</button>
            </div>
          </div>
        </div>
      )}

      {editingBundle && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <h2 className="text-base font-extrabold">ویرایش پکیج / باندل</h2>
            <input value={editingBundle.nameFa} onChange={(e) => setEditingBundle({ ...editingBundle, nameFa: e.target.value })} placeholder="عنوان پکیج" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-2">
              <input value={editingBundle.slug} onChange={(e) => setEditingBundle({ ...editingBundle, slug: e.target.value })} placeholder="slug" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
              <input type="number" value={editingBundle.discountPercent} onChange={(e) => setEditingBundle({ ...editingBundle, discountPercent: Number(e.target.value) })} placeholder="درصد تخفیف پکیج" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            </div>
            <textarea rows={2} value={editingBundle.descriptionFa} onChange={(e) => setEditingBundle({ ...editingBundle, descriptionFa: e.target.value })} placeholder="توضیحات پکیج" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <div className="space-y-1 max-h-36 overflow-y-auto border border-line rounded-lg p-2">
              <span className="font-bold block mb-1">اقلام داخل پکیج:</span>
              {products.slice(0, 12).map((p) => {
                const active = editingBundle.items.some((it) => it.productId === p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const nextItems = active
                          ? editingBundle.items.filter((it) => it.productId !== p.id)
                          : [...editingBundle.items, { productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 }];
                        setEditingBundle({ ...editingBundle, items: nextItems });
                      }}
                    />
                    <span>{p.titleFa}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingBundle(null)} className="px-4 py-2 rounded-xl border border-line font-bold">انصراف</button>
              <button type="button" onClick={async () => { await upsertBundle(editingBundle); setEditingBundle(null); }} className="px-5 py-2 rounded-xl bg-brand text-white font-bold">ذخیره پکیج</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCategoriesPage;
