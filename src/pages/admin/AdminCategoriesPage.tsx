import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { useI18n } from '../../context/i18n';
import { AccessibleModal } from '../../components/ui/Modal';
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
  const { t, formatDigits } = useI18n();

  const [tab, setTab] = useState<'cats' | 'attrs' | 'bundles'>('cats');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingAttr, setEditingAttr] = useState<AttributeDef | null>(null);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-lg sm:text-xl font-extrabold">{t('adminCategories.title')}</h1>
        <div className="w-full sm:w-auto max-w-full flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 text-xs pb-1">
          <button
            type="button"
            onClick={() => setTab('cats')}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === 'cats' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'
            }`}
          >
            {t('adminCategories.tabs.cats', { count: formatDigits(categories.length) })}
          </button>
          <button
            type="button"
            onClick={() => setTab('attrs')}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === 'attrs' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'
            }`}
          >
            {t('adminCategories.tabs.attrs', { count: formatDigits(attributes.length) })}
          </button>
          <button
            type="button"
            onClick={() => setTab('bundles')}
            className={`whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl font-bold ${
              tab === 'bundles' ? 'bg-brand text-white' : 'border border-line dark:border-slate-700'
            }`}
          >
            {t('adminCategories.tabs.bundles', { count: formatDigits(bundles.length) })}
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
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
            >
              {t('adminCategories.newCategory')}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
            {[...categories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat) => {
                const count = products.filter((p) => p.categoryIds.includes(cat.id)).length;
                return (
                  <div
                    key={cat.id}
                    className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div
                      className="min-w-0 flex-1"
                      style={{ paddingInlineStart: `${Math.min(cat.depth, 3) * 16}px` }}
                    >
                      <p className="font-extrabold text-sm">
                        {cat.depth > 0 ? '↳ ' : ''}
                        {cat.nameFa} ({cat.nameEn})
                      </p>
                      <p className="text-ink/55 tabular-nums break-all">
                        /{cat.slug} · {t('counts.products', { count: formatDigits(count) })} ·{' '}
                        {t('adminCategories.connectedAttrsCount', { count: formatDigits(cat.attributeIds.length) })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingCat(structuredClone(cat))}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 font-bold"
                      >
                        {t('common.delete')}
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
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminCategories.newAttribute')}
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl divide-y divide-line dark:divide-slate-800">
            {attributes.map((a) => (
              <div key={a.id} className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">
                    {a.labelFa} ({a.code})
                  </p>
                  <p className="text-ink/60">
                    {t('adminCategories.attrTypeLabel', { type: a.type })}
                    {a.unit ? ` · ${t('adminCategories.attrUnitLabel', { unit: a.unit })}` : ''}
                    {a.isFilterable ? ` · ${t('adminCategories.filterable')}` : ''}
                    {a.isComparable ? ` · ${t('adminCategories.comparable')}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingAttr(structuredClone(a))}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-line dark:border-slate-700 font-bold"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAttribute(a.id)}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 font-bold"
                  >
                    {t('common.delete')}
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
                  imageUrl: '/assets/images/product_composite_kit_1794921818527.jpg',
                  discountPercent: 10,
                  items: products
                    .slice(0, 2)
                    .map((p) => ({ productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 })),
                  status: 'active',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="min-h-[40px] px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              {t('adminCategories.newBundle')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bundles.map((bn) => (
              <div
                key={bn.id}
                className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-2"
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-sm">{bn.nameFa}</p>
                    <p className="text-ink/55 tabular-nums break-all">
                      /{bn.slug} · {t('adminCategories.bundleDiscount', { percent: formatDigits(bn.discountPercent) })} ·{' '}
                      {t('adminCategories.bundleItemsCount', { count: formatDigits(bn.items.length) })}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingBundle(structuredClone(bn))}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg border border-line dark:border-slate-700 font-bold"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBundle(bn.id)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 font-bold"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
                <p className="text-ink/70">{bn.descriptionFa}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AccessibleModal
        open={Boolean(editingCat)}
        onClose={() => setEditingCat(null)}
        ariaLabel={t('adminCategories.editCategoryTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {editingCat && (
          <>
            <h2 className="text-base font-extrabold">{t('adminCategories.editCategoryTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-bold">{t('adminCategories.catNameFa')}</span>
                <input
                  value={editingCat.nameFa}
                  onChange={(e) => setEditingCat({ ...editingCat, nameFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">{t('adminCategories.catSlug')}</span>
                <input
                  dir="ltr"
                  value={editingCat.slug}
                  onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-bold">{t('adminCategories.parentCat')}</span>
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
                  <option value="">{t('adminCategories.rootLevel')}</option>
                  {categories
                    .filter((c) => c.id !== editingCat.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameFa}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-bold">{t('adminCategories.sortOrder')}</span>
                <input
                  type="number"
                  value={editingCat.sortOrder}
                  onChange={(e) => setEditingCat({ ...editingCat, sortOrder: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <label className="sm:col-span-2 space-y-1">
                <span className="font-bold">{t('adminCategories.seoIntroText')}</span>
                <textarea
                  rows={2}
                  value={editingCat.seoTextFa}
                  onChange={(e) => setEditingCat({ ...editingCat, seoTextFa: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
                />
              </label>
              <div className="sm:col-span-2 space-y-1">
                <span className="font-bold block">{t('adminCategories.attributeSetLabel')}</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {attributes.map((a) => {
                    const checked = editingCat.attributeIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line dark:border-slate-700 cursor-pointer"
                      >
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
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertCategory(editingCat);
                  setEditingCat(null);
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminCategories.saveCategory')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>

      <AccessibleModal
        open={Boolean(editingAttr)}
        onClose={() => setEditingAttr(null)}
        ariaLabel={t('adminCategories.editAttrTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-3 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {editingAttr && (
          <>
            <h2 className="text-base font-extrabold">{t('adminCategories.editAttrTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={editingAttr.labelFa}
                onChange={(e) => setEditingAttr({ ...editingAttr, labelFa: e.target.value })}
                placeholder={t('adminCategories.attrTitlePlaceholder')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                dir="ltr"
                value={editingAttr.code}
                onChange={(e) => setEditingAttr({ ...editingAttr, code: e.target.value })}
                placeholder={t('adminCategories.attrCodePlaceholder')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <select
                value={editingAttr.type}
                onChange={(e) => setEditingAttr({ ...editingAttr, type: e.target.value as AttributeDef['type'] })}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              >
                <option value="select">{t('adminCategories.attrTypes.select')}</option>
                <option value="boolean">{t('adminCategories.attrTypes.boolean')}</option>
                <option value="number">{t('adminCategories.attrTypes.number')}</option>
                <option value="text">{t('adminCategories.attrTypes.text')}</option>
              </select>
              <input
                value={editingAttr.unit ?? ''}
                onChange={(e) => setEditingAttr({ ...editingAttr, unit: e.target.value })}
                placeholder={t('adminCategories.attrUnitPlaceholder')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1.5 font-bold min-h-[36px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAttr.isFilterable}
                  onChange={(e) => setEditingAttr({ ...editingAttr, isFilterable: e.target.checked })}
                />
                <span>{t('adminCategories.filterable')}</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-bold min-h-[36px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAttr.isComparable}
                  onChange={(e) => setEditingAttr({ ...editingAttr, isComparable: e.target.checked })}
                />
                <span>{t('adminCategories.comparable')}</span>
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAttr(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertAttribute(editingAttr);
                  setEditingAttr(null);
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminCategories.saveAttr')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>

      <AccessibleModal
        open={Boolean(editingBundle)}
        onClose={() => setEditingBundle(null)}
        ariaLabel={t('adminCategories.editBundleTitle')}
        panelClassName="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-3 text-xs shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {editingBundle && (
          <>
            <h2 className="text-base font-extrabold">{t('adminCategories.editBundleTitle')}</h2>
            <input
              value={editingBundle.nameFa}
              onChange={(e) => setEditingBundle({ ...editingBundle, nameFa: e.target.value })}
              placeholder={t('adminCategories.bundleNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                dir="ltr"
                value={editingBundle.slug}
                onChange={(e) => setEditingBundle({ ...editingBundle, slug: e.target.value })}
                placeholder="slug"
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
              <input
                type="number"
                value={editingBundle.discountPercent}
                onChange={(e) => setEditingBundle({ ...editingBundle, discountPercent: Number(e.target.value) })}
                placeholder={t('adminCategories.bundleDiscountPlaceholder')}
                className="px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
              />
            </div>
            <textarea
              rows={2}
              value={editingBundle.descriptionFa}
              onChange={(e) => setEditingBundle({ ...editingBundle, descriptionFa: e.target.value })}
              placeholder={t('adminCategories.bundleDescPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-line dark:border-slate-700 bg-paper dark:bg-slate-800"
            />
            <div className="space-y-1 max-h-36 overflow-y-auto border border-line dark:border-slate-700 rounded-lg p-2">
              <span className="font-bold block mb-1">{t('adminCategories.bundleItemsTitle')}</span>
              {products.slice(0, 12).map((p) => {
                const active = editingBundle.items.some((it) => it.productId === p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const nextItems = active
                          ? editingBundle.items.filter((it) => it.productId !== p.id)
                          : [
                              ...editingBundle.items,
                              { productId: p.id, variantId: p.variants[0]?.id ?? '', quantity: 1 },
                            ];
                        setEditingBundle({ ...editingBundle, items: nextItems });
                      }}
                    />
                    <span>{p.titleFa}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingBundle(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-line dark:border-slate-700 font-bold"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await upsertBundle(editingBundle);
                  setEditingBundle(null);
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-white font-bold"
              >
                {t('adminCategories.saveBundle')}
              </button>
            </div>
          </>
        )}
      </AccessibleModal>
    </div>
  );
}

export default AdminCategoriesPage;
