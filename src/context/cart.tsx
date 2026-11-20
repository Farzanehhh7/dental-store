import React, { createContext, useContext, useEffect, useState } from 'react';
import { trackEcommerceEvent } from '../lib/analytics';
import type { CartItem, CurrencyMode } from '../types/domain';
import { useAuth } from './auth';
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
  const { bundles } = useContent();

  const [currency, setCurrencyState] = useState<CurrencyMode>(() => readJsonLS<CurrencyMode>(LS_CURRENCY, 'IRT'));
  const [darkMode, setDarkMode] = useState<boolean>(() => readJsonLS<boolean>(LS_DARK, false));
  const [cart, setCart] = useState<CartItem[]>(() => readJsonLS<CartItem[]>(LS_CART, []));
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => readJsonLS<string[]>(LS_WISHLIST, []));
  const [compareIds, setCompareIds] = useState<string[]>(() => readJsonLS<string[]>(LS_COMPARE, []));
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_RECENT, []));

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

  const setCurrency = (c: CurrencyMode) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, JSON.stringify(c));
  };

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const addToCart = (productId: string, variantId: string, qty = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === variantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { productId, variantId, quantity: qty }];
    });
    trackEcommerceEvent('add_to_cart', { productId, variantId, quantity: qty });
    setCartOpen(true);
    pushToast('محصول به سبد خرید اضافه شد.', 'success');
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
      }
      return next;
    });
    setCartOpen(true);
    pushToast(`پکیج «${bundle.nameFa}» به سبد خرید اضافه شد.`, 'success');
  };

  const updateCartQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(variantId);
      return;
    }
    setCart((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)));
  };

  const removeFromCart = (variantId: string) => {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const clearCart = () => setCart([]);

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(productId);
      pushToast(exists ? 'از علاقه‌مندی‌ها حذف شد.' : 'به لیست علاقه‌مندی‌ها اضافه شد.', 'info');
      return exists ? prev.filter((id) => id !== productId) : [...prev, productId];
    });
  };

  const toggleCompare = (productId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.length >= 4) {
        pushToast('حداکثر ۴ محصول هم‌زمان قابل مقایسه است.', 'error');
        return prev;
      }
      pushToast('به لیست مقایسه اضافه شد.', 'success');
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
