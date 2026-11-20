import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  bindPublicCollection,
  bindScopedCollection,
  fetchPublicCollectionOnce,
  handleListenerError,
} from '../lib/firestoreStore';
import {
  SEED_AGENTS,
  SEED_BLOG_POSTS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_COUPONS,
  SEED_PRODUCTS,
  SEED_REDIRECTS,
  SEED_SETTINGS,
  SEED_STOCK_REQUESTS,
} from '../data/seed';
import {
  EXPANDED_ATTRIBUTES,
  EXPANDED_BRANDS,
  EXPANDED_CATEGORIES,
  EXPANDED_PRODUCTS,
  SEED_BANNERS,
  SEED_CONTRACT_PRICES,
  SEED_FAQS,
  SEED_PAGES,
  SEED_PRODUCT_COSTS,
  SEED_STOCK_MOVEMENTS,
  SEED_STOCK_NOTIFICATIONS,
  SEED_SUPPLIERS,
  SEED_WAREHOUSES,
} from '../data/expandedCatalog';
import type {
  AttributeDef,
  Brand,
  Category,
  ContractPrice,
  Product,
  ProductCostRecord,
  StockBatch,
  StockBatchRecord,
  StockLevel,
  StockMovement,
  StockNotification,
  StockRequest,
  Supplier,
  Warehouse,
} from '../types/domain';
import type { BulkPriceUndoSnapshot, LowStockAlertItem, StoreContextValue } from './storeTypes';
import { ADMIN_REQUIRED_MSG, commitInChunks, mergeById, resolveAuthHeaders, stripCostFromProduct } from './storeHelpers';
import { useAuth } from './auth';

export interface CatalogContextValue {
  categories: Category[];
  brands: Brand[];
  attributes: AttributeDef[];
  products: Product[];
  productCosts: ProductCostRecord[];
  contractPrices: ContractPrice[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
  stockBatches: StockBatchRecord[];
  lowStockAlerts: LowStockAlertItem[];
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  stockRequests: StockRequest[];
  stockNotifications: StockNotification[];
  canUndoBulkPrice: boolean;
  refreshInventory: StoreContextValue['refreshInventory'];
  submitStockRequest: StoreContextValue['submitStockRequest'];
  submitStockNotification: StoreContextValue['submitStockNotification'];
  upsertProduct: StoreContextValue['upsertProduct'];
  deleteProduct: StoreContextValue['deleteProduct'];
  upsertCategory: StoreContextValue['upsertCategory'];
  deleteCategory: StoreContextValue['deleteCategory'];
  upsertBrand: StoreContextValue['upsertBrand'];
  deleteBrand: StoreContextValue['deleteBrand'];
  upsertAttribute: StoreContextValue['upsertAttribute'];
  deleteAttribute: StoreContextValue['deleteAttribute'];
  upsertContractPrice: StoreContextValue['upsertContractPrice'];
  deleteContractPrice: StoreContextValue['deleteContractPrice'];
  applyBulkPriceAdjustment: StoreContextValue['applyBulkPriceAdjustment'];
  undoBulkPriceAdjustment: StoreContextValue['undoBulkPriceAdjustment'];
  adjustVariantStock: StoreContextValue['adjustVariantStock'];
  stocktakeVariantStock: StoreContextValue['stocktakeVariantStock'];
  transferStock: StoreContextValue['transferStock'];
  applyNearExpirySpecialPrice: StoreContextValue['applyNearExpirySpecialPrice'];
  markStockNotificationSent: StoreContextValue['markStockNotificationSent'];
  upsertWarehouse: StoreContextValue['upsertWarehouse'];
  deleteWarehouse: StoreContextValue['deleteWarehouse'];
  upsertSupplier: StoreContextValue['upsertSupplier'];
  deleteSupplier: StoreContextValue['deleteSupplier'];
  updateStockRequestStatus: StoreContextValue['updateStockRequestStatus'];
  seedDatabaseNow: StoreContextValue['seedDatabaseNow'];
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const {
    authUser,
    authReady,
    isAdmin,
    actualAdminRole,
    activeAdminRole,
    dbSynced,
    connectionChecked,
    pushToast,
    deletedSet,
    markIdDeleted,
    writeAudit,
  } = useAuth();

  const seededOnceRef = useRef(false);
  const cleanBaselineProducts = useMemo(() => EXPANDED_PRODUCTS.map(stripCostFromProduct), []);

  const [categories, setCategories] = useState<Category[]>(EXPANDED_CATEGORIES);
  const [brands, setBrands] = useState<Brand[]>(EXPANDED_BRANDS);
  const [attributes, setAttributes] = useState<AttributeDef[]>(EXPANDED_ATTRIBUTES);
  const [products, setProducts] = useState<Product[]>(cleanBaselineProducts);
  const [productCosts, setProductCosts] = useState<ProductCostRecord[]>(SEED_PRODUCT_COSTS);
  const [contractPrices, setContractPrices] = useState<ContractPrice[]>(SEED_CONTRACT_PRICES);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(SEED_WAREHOUSES);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [stockBatches, setStockBatches] = useState<StockBatchRecord[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(SEED_SUPPLIERS);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(SEED_STOCK_MOVEMENTS);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>(SEED_STOCK_REQUESTS);
  const [stockNotifications, setStockNotifications] = useState<StockNotification[]>(SEED_STOCK_NOTIFICATIONS);
  const [bulkPriceUndo, setBulkPriceUndo] = useState<BulkPriceUndoSnapshot | null>(null);

  // Public catalog sync (categories, brands, attributes, products)
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady) return;

    if (!authUser) {
      let cancelled = false;
      const isCancelled = () => cancelled;
      void Promise.allSettled([
        fetchPublicCollectionOnce<Category>('categories', setCategories, EXPANDED_CATEGORIES, deletedSet, isCancelled),
        fetchPublicCollectionOnce<Brand>('brands', setBrands, EXPANDED_BRANDS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<AttributeDef>('attributes', setAttributes, EXPANDED_ATTRIBUTES, deletedSet, isCancelled),
        fetchPublicCollectionOnce<Product>(
          'products',
          setProducts,
          cleanBaselineProducts,
          deletedSet,
          isCancelled,
          stripCostFromProduct
        ),
      ]);
      return () => {
        cancelled = true;
      };
    }

    const unsubs = [
      bindPublicCollection<Category>('categories', setCategories, EXPANDED_CATEGORIES, deletedSet),
      bindPublicCollection<Brand>('brands', setBrands, EXPANDED_BRANDS, deletedSet),
      bindPublicCollection<AttributeDef>('attributes', setAttributes, EXPANDED_ATTRIBUTES, deletedSet),
      bindPublicCollection<Product>(
        'products',
        setProducts,
        cleanBaselineProducts,
        deletedSet,
        stripCostFromProduct
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, cleanBaselineProducts, deletedSet]);

  // Authenticated user & admin inventory/pricing listeners
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const unsubs: (() => void)[] = [
      bindScopedCollection<StockRequest>('stockRequests', setStockRequests, isAdmin, authUser.uid, SEED_STOCK_REQUESTS),
      bindScopedCollection<ContractPrice>(
        'contractPrices',
        setContractPrices,
        isAdmin,
        authUser.uid,
        SEED_CONTRACT_PRICES
      ),
    ];

    const roleEffective = actualAdminRole ?? activeAdminRole;
    if (isAdmin) {
      if (['super_admin', 'admin', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'productCosts'),
            (snap) => {
              if (!snap.empty) {
                const map = new Map<string, ProductCostRecord>();
                SEED_PRODUCT_COSTS.forEach((c) => map.set(c.productId, c));
                snap.docs.forEach((d) => map.set(d.id, d.data() as ProductCostRecord));
                setProductCosts(Array.from(map.values()));
              }
            },
            (err) => handleListenerError(err, OperationType.LIST, 'productCosts')
          )
        );
      }
      if (['super_admin', 'admin', 'warehouse', 'sales_mgr', 'accountant'].includes(roleEffective)) {
        unsubs.push(
          onSnapshot(
            collection(db, 'suppliers'),
            (snap) =>
              setSuppliers(mergeById(SEED_SUPPLIERS, snap.docs.map((d) => ({ ...(d.data() as Supplier), id: d.id })))),
            (err) => handleListenerError(err, OperationType.LIST, 'suppliers')
          ),
          onSnapshot(
            collection(db, 'stockNotifications'),
            (snap) =>
              setStockNotifications(
                mergeById(
                  SEED_STOCK_NOTIFICATIONS,
                  snap.docs.map((d) => ({ ...(d.data() as StockNotification), id: d.id }))
                )
              ),
            (err) => handleListenerError(err, OperationType.LIST, 'stockNotifications')
          )
        );
      }
    }

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin, actualAdminRole, activeAdminRole]);

  const refreshInventory = useCallback(async () => {
    const roleEffective = actualAdminRole ?? activeAdminRole;
    if (!isAdmin || !authUser || !['super_admin', 'admin', 'warehouse', 'sales_mgr', 'accountant'].includes(roleEffective)) {
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/inventory', { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok) return;

      const levels = (Array.isArray(data.stockLevels) ? data.stockLevels : []) as StockLevel[];
      const batches = (Array.isArray(data.stockBatches) ? data.stockBatches : []) as StockBatchRecord[];
      if (Array.isArray(data.warehouses)) setWarehouses(data.warehouses as Warehouse[]);
      setStockLevels(levels);
      setStockBatches(batches);
      if (Array.isArray(data.movements)) setStockMovements(data.movements as StockMovement[]);
      if (Array.isArray(data.lowStockAlerts)) setLowStockAlerts(data.lowStockAlerts as LowStockAlertItem[]);

      // Keep aggregate variant quantities & resellable batches in sync across products
      const aggMap = new Map<string, { onHand: number; reserved: number; levels: StockLevel[] }>();
      for (const lvl of levels) {
        const cur = aggMap.get(lvl.variantId) ?? { onHand: 0, reserved: 0, levels: [] };
        cur.onHand += lvl.onHand;
        cur.reserved += lvl.reserved;
        cur.levels.push(lvl);
        aggMap.set(lvl.variantId, cur);
      }
      const batchMap = new Map<string, StockBatch[]>();
      for (const b of batches) {
        if (b.condition !== 'resellable') continue;
        const list = batchMap.get(b.variantId) ?? [];
        list.push({
          id: b.id,
          batchNo: b.batchNo,
          warehouseId: b.warehouseId,
          warehouseCode: b.warehouseCode,
          expiresAt: b.expiryDate,
          expiryDate: b.expiryDate,
          qtyOnHand: b.qty,
          qty: b.qty,
          reserved: b.reserved,
          unitCost: b.unitCost,
          specialPrice: b.specialPrice ?? null,
          condition: b.condition,
        });
        batchMap.set(b.variantId, list);
      }

      if (aggMap.size > 0 || batchMap.size > 0) {
        setProducts((prev) =>
          prev.map((p) => {
            const hasAnyVariant = p.variants.some((v) => aggMap.has(v.id) || batchMap.has(v.id));
            if (!hasAnyVariant) return p;
            return {
              ...p,
              variants: p.variants.map((v) => {
                const agg = aggMap.get(v.id);
                const vb = batchMap.get(v.id);
                return {
                  ...v,
                  ...(agg ? { stockOnHand: agg.onHand, reserved: agg.reserved, stockLevels: agg.levels } : {}),
                  ...(vb ? { batches: vb } : {}),
                };
              }),
            };
          })
        );
      }
    } catch {
      // Ignore transient errors
    }
  }, [actualAdminRole, activeAdminRole, authUser, isAdmin]);

  useEffect(() => {
    if (!authReady || !isAdmin || !authUser) return;
    void refreshInventory();
  }, [authReady, authUser, isAdmin, refreshInventory]);

  const seedDatabaseNow = async () => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) => b.set(doc(db, 'settings', 'site_main'), SEED_SETTINGS));
      EXPANDED_CATEGORIES.forEach((c) => ops.push((b) => b.set(doc(db, 'categories', c.id), c)));
      EXPANDED_BRANDS.forEach((br) => ops.push((b) => b.set(doc(db, 'brands', br.id), br)));
      EXPANDED_ATTRIBUTES.forEach((a) => ops.push((b) => b.set(doc(db, 'attributes', a.id), a)));
      SEED_PRODUCTS.map(stripCostFromProduct).forEach((p) => ops.push((b) => b.set(doc(db, 'products', p.id), p)));
      SEED_PRODUCT_COSTS.slice(0, 60).forEach((pc) => ops.push((b) => b.set(doc(db, 'productCosts', pc.productId), pc)));
      SEED_CAMPAIGNS.forEach((cp) => ops.push((b) => b.set(doc(db, 'campaigns', cp.id), cp)));
      SEED_BUNDLES.forEach((bn) => ops.push((b) => b.set(doc(db, 'bundles', bn.id), bn)));
      SEED_AGENTS.forEach((ag) => ops.push((b) => b.set(doc(db, 'agents', ag.id), ag)));
      SEED_BLOG_POSTS.forEach((bp) => ops.push((b) => b.set(doc(db, 'blogPosts', bp.id), bp)));
      SEED_COUPONS.forEach((cpn) => ops.push((b) => b.set(doc(db, 'coupons', cpn.id), cpn)));
      SEED_REDIRECTS.forEach((r) => ops.push((b) => b.set(doc(db, 'redirects', r.id), r)));
      SEED_PAGES.forEach((pg) => ops.push((b) => b.set(doc(db, 'pages', pg.id), pg)));
      SEED_BANNERS.forEach((bn) => ops.push((b) => b.set(doc(db, 'banners', bn.id), bn)));
      SEED_FAQS.forEach((fq) => ops.push((b) => b.set(doc(db, 'faqs', fq.id), fq)));
      SEED_SUPPLIERS.forEach((sp) => ops.push((b) => b.set(doc(db, 'suppliers', sp.id), sp)));

      await commitInChunks(ops, 280);
      pushToast('کاتالوگ، دسته‌بندی‌ها، برندها و پیکربندی پایه با موفقیت در Firestore ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seed_batch');
    }
  };

  useEffect(() => {
    if (isAdmin && !seededOnceRef.current) {
      seededOnceRef.current = true;
      getDoc(doc(db, 'settings', 'site_main'))
        .then((snap) => {
          if (!snap.exists()) {
            void seedDatabaseNow();
          }
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const submitStockRequest: StoreContextValue['submitStockRequest'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ثبت درخواست کالای ناموجود لطفاً وارد شوید.', 'error');
      return;
    }
    const id = `sr_${Date.now()}`;
    try {
      await setDoc(doc(db, 'stockRequests', id), {
        id,
        userId: authUser.uid,
        ...payload,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      pushToast('درخواست تأمین کالا با موفقیت ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stockRequests/${id}`);
    }
  };

  const submitStockNotification: StoreContextValue['submitStockNotification'] = async (payload) => {
    const id = `sn_${Date.now()}`;
    const item: StockNotification = {
      id,
      productId: payload.productId,
      ...(payload.variantId ? { variantId: payload.variantId } : {}),
      productTitleFa: payload.productTitleFa,
      mobile: payload.mobile,
      ...(authUser ? { userId: authUser.uid } : {}),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'stockNotifications', id), item);
      setStockNotifications((prev) => [item, ...prev]);
      pushToast('شماره شما برای اطلاع‌رسانی موجودی ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stockNotifications/${id}`);
    }
  };

  const upsertProduct = async (product: Product, costMap?: Record<string, number>) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const cleaned = stripCostFromProduct({ ...product, updatedAt: new Date().toISOString() });
    try {
      await setDoc(doc(db, 'products', cleaned.id), cleaned);
      if (costMap && Object.keys(costMap).length > 0) {
        const costRec: ProductCostRecord = {
          productId: cleaned.id,
          variantCosts: costMap,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'productCosts', cleaned.id), costRec);
      }
      await writeAudit('product.upsert', 'product', cleaned.id, `ذخیره/ویرایش محصول «${cleaned.titleFa}»`);
      pushToast('محصول با موفقیت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${cleaned.id}`);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'products', productId)).catch(() => {});
      markIdDeleted(productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      await writeAudit('product.delete', 'product', productId, `حذف محصول ${productId}`);
      pushToast('محصول حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const upsertCategory = async (category: Category) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...category, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'categories', updated.id), updated);
      await writeAudit('category.upsert', 'category', updated.id, `ویرایش دسته‌بندی «${updated.nameFa}»`);
      pushToast('دسته‌بندی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${updated.id}`);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    if (products.some((p) => p.primaryCategoryId === categoryId) || categories.some((c) => c.parentId === categoryId)) {
      pushToast('این دسته‌بندی دارای زیرمجموعه یا کالای فعال است و نمی‌توان آن را حذف کرد.', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'categories', categoryId)).catch(() => {});
      markIdDeleted(categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      await writeAudit('category.delete', 'category', categoryId, `حذف دسته‌بندی ${categoryId}`);
      pushToast('دسته‌بندی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
    }
  };

  const upsertBrand = async (brand: Brand) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...brand, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'brands', updated.id), updated);
      await writeAudit('brand.upsert', 'brand', updated.id, `ویرایش برند «${updated.nameFa}»`);
      pushToast('برند ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `brands/${updated.id}`);
    }
  };

  const deleteBrand = async (brandId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'brands', brandId)).catch(() => {});
      markIdDeleted(brandId);
      setBrands((prev) => prev.filter((b) => b.id !== brandId));
      await writeAudit('brand.delete', 'brand', brandId, `حذف برند ${brandId}`);
      pushToast('برند حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `brands/${brandId}`);
    }
  };

  const upsertAttribute = async (attr: AttributeDef) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...attr, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'attributes', updated.id), updated);
      await writeAudit('attribute.upsert', 'attribute', updated.id, `ویرایش ویژگی «${updated.labelFa}»`);
      pushToast('ویژگی فنی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attributes/${updated.id}`);
    }
  };

  const deleteAttribute = async (attrId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'attributes', attrId)).catch(() => {});
      markIdDeleted(attrId);
      setAttributes((prev) => prev.filter((a) => a.id !== attrId));
      pushToast('ویژگی حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `attributes/${attrId}`);
    }
  };

  const upsertContractPrice = async (contract: ContractPrice) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'contractPrices', contract.id), contract);
      await writeAudit('contract.upsert', 'contractPrice', contract.id, `تنظیم قرارداد قیمت ${contract.customerName}`);
      pushToast('قرارداد قیمت اختصاصی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `contractPrices/${contract.id}`);
    }
  };

  const deleteContractPrice = async (contractId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'contractPrices', contractId));
      pushToast('قرارداد قیمت حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contractPrices/${contractId}`);
    }
  };

  const applyBulkPriceAdjustment: StoreContextValue['applyBulkPriceAdjustment'] = async ({
    scopeType,
    scopeId,
    percent,
    roundingStep,
  }) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const targets = products.filter((p) => {
      if (scopeType === 'category' && scopeId) return p.primaryCategoryId === scopeId || p.categoryIds.includes(scopeId);
      if (scopeType === 'brand' && scopeId) return p.brandId === scopeId;
      return true;
    });

    const previousPrices: BulkPriceUndoSnapshot['previousPrices'] = [];
    const now = new Date().toISOString();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const updatedMap = new Map<string, Product>();

    for (const p of targets) {
      let changed = false;
      const newVariants = p.variants.map((v) => {
        if (v.basePrice === null || v.basePrice <= 0) return v;
        previousPrices.push({ productId: p.id, variantId: v.id, basePrice: v.basePrice });
        const raw = v.basePrice * (1 + percent / 100);
        const step = Math.max(1000, roundingStep);
        const rounded = Math.max(1000, Math.round(raw / step) * step);
        changed = true;
        return { ...v, basePrice: rounded };
      });
      if (changed) {
        const nextP = stripCostFromProduct({ ...p, variants: newVariants, updatedAt: now });
        updatedMap.set(p.id, nextP);
        if (ops.length < 250) {
          ops.push((b) => b.set(doc(db, 'products', p.id), nextP));
        }
      }
    }

    setBulkPriceUndo({ scopeLabel: `${scopeType}:${scopeId || 'all'} (${percent}%)`, previousPrices });
    setProducts((prev) => prev.map((p) => updatedMap.get(p.id) ?? p));
    if (ops.length > 0) await commitInChunks(ops, 250);
    await writeAudit(
      'pricing.bulk_adjust',
      'products',
      scopeId || 'all',
      `اصلاح گروهی قیمت ${percent}٪ (${targets.length} کالا)`
    );
    pushToast(`قیمت ${targets.length} محصول بروزرسانی شد (امکان بازگشت وجود دارد).`, 'success');
  };

  const undoBulkPriceAdjustment = async () => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    if (!bulkPriceUndo) return;
    const mapByProd = new Map<string, Map<string, number | null>>();
    bulkPriceUndo.previousPrices.forEach((rec) => {
      if (!mapByProd.has(rec.productId)) mapByProd.set(rec.productId, new Map());
      mapByProd.get(rec.productId)!.set(rec.variantId, rec.basePrice);
    });
    const now = new Date().toISOString();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    setProducts((prev) =>
      prev.map((p) => {
        const vMap = mapByProd.get(p.id);
        if (!vMap) return p;
        const nextP = stripCostFromProduct({
          ...p,
          variants: p.variants.map((v) => (vMap.has(v.id) ? { ...v, basePrice: vMap.get(v.id)! } : v)),
          updatedAt: now,
        });
        if (ops.length < 250) ops.push((b) => b.set(doc(db, 'products', p.id), nextP));
        return nextP;
      })
    );
    if (ops.length > 0) await commitInChunks(ops, 250);
    setBulkPriceUndo(null);
    pushToast('تغییرات قیمت گروهی به حالت قبل بازگردانده شد.', 'info');
  };

  const adjustVariantStock: StoreContextValue['adjustVariantStock'] = async (
    productId,
    variantId,
    delta,
    reason,
    warehouseCode = 'TEH-CENTRAL',
    type = 'adjust',
    options
  ) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    if (!reason.trim()) {
      pushToast('درج علت تعدیل/ورود کالا الزامی است.', 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          productId,
          variantId,
          ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
          warehouseCode,
          delta,
          type: type === 'receive' ? 'receive' : 'adjust',
          reason: reason.trim(),
          ...(options?.batchNo ? { batchNo: options.batchNo } : {}),
          ...(options?.expiryDate ? { expiryDate: options.expiryDate } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'بروزرسانی موجودی انبار ناموفق بود.', 'error');
        return;
      }
      await refreshInventory();
      pushToast('موجودی انبار و دفترکل انبار با موفقیت بروزرسانی شد.', 'success');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام بروزرسانی موجودی.', 'error');
    }
  };

  const stocktakeVariantStock: StoreContextValue['stocktakeVariantStock'] = async (payload) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return false;
    }
    if (!payload.reason.trim()) {
      pushToast('درج علت انبارگردانی الزامی است.', 'error');
      return false;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/inventory/stocktake', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          ...payload,
          reason: payload.reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ثبت مغایرت انبارگردانی ناموفق بود.', 'error');
        return false;
      }
      await refreshInventory();
      pushToast('انبارگردانی در دفترکل ثبت و موجودی بروزرسانی شد.', 'success');
      return true;
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام انبارگردانی.', 'error');
      return false;
    }
  };

  const transferStock: StoreContextValue['transferStock'] = async (payload) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return false;
    }
    if (!payload.reason.trim()) {
      pushToast('درج علت انتقال بین انبارها الزامی است.', 'error');
      return false;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/inventory/transfer', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          ...payload,
          reason: payload.reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'انتقال بین انبارها ناموفق بود.', 'error');
        return false;
      }
      await refreshInventory();
      pushToast('انتقال موجودی بین انبارها با موفقیت انجام شد.', 'success');
      return true;
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام انتقال موجودی.', 'error');
      return false;
    }
  };

  const applyNearExpirySpecialPrice = async (
    productId: string,
    variantId: string,
    batchId: string,
    specialPrice: number
  ) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/inventory/batch-special-price', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          productId,
          variantId,
          batchId,
          specialPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ثبت قیمت ویژه سری ساخت ناموفق بود.', 'error');
        return;
      }
      await refreshInventory();
      pushToast('قیمت ویژه سری ساخت انقضای نزدیک ثبت شد.', 'success');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام ثبت قیمت ویژه سری ساخت.', 'error');
    }
  };

  const markStockNotificationSent = async (id: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'stockNotifications', id), { status: 'notified' });
      pushToast('وضعیت اطلاع‌رسانی به «ارسال‌شده» تغییر یافت.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stockNotifications/${id}`);
    }
  };

  const upsertWarehouse = async (warehouse: Warehouse) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch('/api/admin/warehouses', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(warehouse),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'ذخیره انبار ناموفق بود.', 'error');
        return;
      }
      await refreshInventory();
      pushToast('انبار در سرور ذخیره شد.', 'success');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام ذخیره انبار.', 'error');
    }
  };

  const deleteWarehouse = async (id: string) => {
    if (!isAdmin || !authUser) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      const headers = await resolveAuthHeaders(authUser, '');
      const res = await fetch(`/api/admin/warehouses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        pushToast(data?.message || 'حذف انبار امکان‌پذیر نیست.', 'error');
        return;
      }
      await refreshInventory();
      pushToast('انبار حذف شد.', 'info');
    } catch {
      pushToast('خطا در ارتباط با سرور هنگام حذف انبار.', 'error');
    }
  };

  const upsertSupplier = async (supplier: Supplier) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'suppliers', supplier.id), supplier);
      pushToast('تامین‌کننده ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `suppliers/${supplier.id}`);
    }
  };

  const deleteSupplier = async (id: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      pushToast('تامین‌کننده حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
    }
  };

  const updateStockRequestStatus = async (id: string, status: StockRequest['status'], adminNote?: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'stockRequests', id), {
        status,
        ...(adminNote ? { adminNote } : {}),
      });
      pushToast('وضعیت درخواست تأمین کالا بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stockRequests/${id}`);
    }
  };

  return (
    <CatalogContext.Provider
      value={{
        categories,
        brands,
        attributes,
        products,
        productCosts,
        contractPrices,
        warehouses,
        stockLevels,
        stockBatches,
        lowStockAlerts,
        suppliers,
        stockMovements,
        stockRequests,
        stockNotifications,
        canUndoBulkPrice: Boolean(bulkPriceUndo),
        refreshInventory,
        submitStockRequest,
        submitStockNotification,
        upsertProduct,
        deleteProduct,
        upsertCategory,
        deleteCategory,
        upsertBrand,
        deleteBrand,
        upsertAttribute,
        deleteAttribute,
        upsertContractPrice,
        deleteContractPrice,
        applyBulkPriceAdjustment,
        undoBulkPriceAdjustment,
        adjustVariantStock,
        stocktakeVariantStock,
        transferStock,
        applyNearExpirySpecialPrice,
        markStockNotificationSent,
        upsertWarehouse,
        deleteWarehouse,
        upsertSupplier,
        deleteSupplier,
        updateStockRequestStatus,
        seedDatabaseNow,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside CatalogProvider');
  return ctx;
}
