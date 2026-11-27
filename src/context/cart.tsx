import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { trackEcommerceEvent } from '../lib/analytics';
import { t } from '../lib/i18n';
import type { CartItem, CurrencyMode } from '../types/domain';
import { useAuth } from './auth';
import { useCatalog } from './catalog';
import { useContent } from './content';
import {
  LS_CART,
  LS_COMPARE,
  LS_CURRENCY,
  LS_DARK,
  LS_RECENT,
  LS_WISHLIST,
  readJsonLS,
} from './storeHelpers';

export interface CartContextValue {
  currency: CurrencyMode;
  setCurrency: (c: CurrencyMode) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  cart: CartItem[];
  cartPendingVariantIds: string[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (productId: string, variantId: string, qty?: number) => void;
  addBundleToCart: (bundleId: string) => void;
  updateCartQty: (variantId: string, qty: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => void;
  compareIds: string[];
  toggleCompare: (productId: string) => void;
  recentlyViewedIds: string[];
  markViewed: (productId: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { pushToast } = useAuth();
  const { products } = useCatalog();
  const { bundles } = useContent();

  const [currency, setCurrencyState] = useState<CurrencyMode>(() => readJsonLS<CurrencyMode>(LS_CURRENCY, 'IRT'));
  const [darkMode, setDarkMode] = useState<boolean>(() => readJsonLS<boolean>(LS_DARK, false));
  const [cart, setCart] = useState<CartItem[]>(() => readJsonLS<CartItem[]>(LS_CART, []));
  const [cartPendingVariantIds, setCartPendingVariantIds] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => readJsonLS<string[]>(LS_WISHLIST, []));
  const [compareIds, setCompareIds] = useState<string[]>(() => readJsonLS<string[]>(LS_COMPARE, []));
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_RECENT, []));

  const pendingTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(LS_DARK, JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem(LS_CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(LS_WISHLIST, JSON.stringify(wishlistIds));
  }, [wishlistIds]);

  useEffect(() => {
    localStorage.setItem(LS_COMPARE, JSON.stringify(compareIds));
  }, [compareIds]);

  useEffect(() => {
    localStorage.setItem(LS_RECENT, JSON.stringify(recentlyViewedIds));
  }, [recentlyViewedIds]);

  useEffect(() => {
    return () => {
      Object.values(pendingTimersRef.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const markVariantOptimistic = (variantId: string) => {
    setCartPendingVariantIds((prev) => (prev.includes(variantId) ? prev : [...prev, variantId]));
    if (pendingTimersRef.current[variantId]) {
      window.clearTimeout(pendingTimersRef.current[variantId]);
    }
    pendingTimersRef.current[variantId] = window.setTimeout(() => {
      setCartPendingVariantIds((prev) => prev.filter((id) => id !== variantId));
      delete pendingTimersRef.current[variantId];
    }, 280);
  };

  const setCurrency = (c: CurrencyMode) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, JSON.stringify(c));
  };

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const getVariantStockCeiling = (productId: string, variantId: string): number | null => {
    const product = products.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!variant) return null;
    const avail = Math.max(0, (variant.stockOnHand ?? 0) - (variant.reserved ?? 0));
    return avail > 0 ? avail : 0;
  };

  const addToCart = (productId: string, variantId: string, qty = 1) => {
    const safeQty = Math.max(1, Math.floor(qty));
    const snapshot = cart;
    let rolledBack = false;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === variantId);
      const nextQty = idx >= 0 ? prev[idx].quantity + safeQty : safeQty;
      const ceiling = getVariantStockCeiling(productId, variantId);
      if (ceiling !== null && nextQty > ceiling) {
        rolledBack = true;
        return snapshot;
      }
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: nextQty };
        return next;
      }
      return [...prev, { productId, variantId, quantity: safeQty }];
    });

    if (rolledBack) {
      pushToast(t('cart.stockExceededRollback'), 'error');
      return;
    }

    markVariantOptimistic(variantId);
    trackEcommerceEvent('add_to_cart', { productId, variantId, quantity: safeQty });
    setCartOpen(true);
    pushToast(t('cart.addedToast'), 'success');
  };

  const addBundleToCart = (bundleId: string) => {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    setCart((prev) => {
      const next = [...prev];
      for (const item of bundle.items) {
        const idx = next.findIndex((i) => i.variantId === item.variantId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
        } else {
          next.push({ productId: item.productId, variantId: item.variantId, quantity: item.quantity });
        }
        markVariantOptimistic(item.variantId);
      }
      return next;
    });
    setCartOpen(true);
    pushToast(t('cart.bundleAddedToast', { name: bundle.nameFa }), 'success');
  };

  const updateCartQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(variantId);
      return;
    }
    const existing = cart.find((i) => i.variantId === variantId);
    if (existing) {
      const ceiling = getVariantStockCeiling(existing.productId, variantId);
      if (ceiling !== null && qty > ceiling) {
        pushToast(t('cart.stockExceededRollback'), 'error');
        return;
      }
    }
    markVariantOptimistic(variantId);
    setCart((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)));
  };

  const removeFromCart = (variantId: string) => {
    markVariantOptimistic(variantId);
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const clearCart = () => setCart([]);

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(productId);
      pushToast(exists ? t('cart.wishlistRemoved') : t('cart.wishlistAdded'), 'info');
      return exists ? prev.filter((id) => id !== productId) : [...prev, productId];
    });
  };

  const toggleCompare = (productId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.length >= 4) {
        pushToast(t('cart.compareLimitReached'), 'error');
        return prev;
      }
      pushToast(t('cart.compareAdded'), 'success');
      return [...prev, productId];
    });
  };

  const markViewed = (productId: string) => {
    setRecentlyViewedIds((prev) => [productId, ...prev.filter((id) => id !== productId)].slice(0, 8));
  };

  return (
    <CartContext.Provider
      value={{
        currency,
        setCurrency,
        darkMode,
        toggleDarkMode,
        cart,
        cartPendingVariantIds,
        cartOpen,
        setCartOpen,
        addToCart,
        addBundleToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        wishlistIds,
        toggleWishlist,
        compareIds,
        toggleCompare,
        recentlyViewedIds,
        markViewed,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
