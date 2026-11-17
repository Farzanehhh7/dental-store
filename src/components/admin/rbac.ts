import { AdminRoleCode } from '../../types/domain';

export type AdminModuleKey =
  | 'dashboard'
  | 'reports'
  | 'products'
  | 'categories'
  | 'brands'
  | 'pricing'
  | 'inventory'
  | 'orders'
  | 'customers'
  | 'support'
  | 'content'
  | 'seo'
  | 'import_export'
  | 'system';

const ROLE_MODULES: Record<AdminRoleCode, AdminModuleKey[]> = {
  super_admin: [
    'dashboard', 'reports', 'products', 'categories', 'brands', 'pricing',
    'inventory', 'orders', 'customers', 'support', 'content', 'seo', 'import_export', 'system',
  ],
  admin: [
    'dashboard', 'reports', 'products', 'categories', 'brands', 'pricing',
    'inventory', 'orders', 'customers', 'support', 'content', 'seo', 'import_export', 'system',
  ],
  sales_mgr: [
    'dashboard', 'reports', 'products', 'categories', 'brands', 'pricing',
    'inventory', 'orders', 'customers', 'support', 'content', 'import_export',
  ],
  warehouse: ['dashboard', 'reports', 'products', 'categories', 'brands', 'inventory', 'orders', 'import_export'],
  content: ['products', 'categories', 'brands', 'support', 'content', 'seo', 'import_export'],
  support: ['dashboard', 'reports', 'products', 'categories', 'brands', 'inventory', 'orders', 'customers', 'support'],
  accountant: ['dashboard', 'reports', 'products', 'pricing', 'inventory', 'orders', 'customers', 'import_export', 'system'],
};

export const ADMIN_ROLE_LABELS: Record<AdminRoleCode, string> = {
  super_admin: 'مدیر ارشد (Super Admin)',
  admin: 'مدیر فروشگاه',
  sales_mgr: 'مدیر فروش و B2B',
  warehouse: 'مسئول انبار و بچ',
  content: 'مدیر محتوا و سئو',
  support: 'پشتیبان و مشاور فنی',
  accountant: 'حسابدار و مالی',
};

export function canAccessModule(role: AdminRoleCode, mod: AdminModuleKey): boolean {
  return ROLE_MODULES[role].includes(mod);
}

export function canSeeCostPrice(role: AdminRoleCode): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'accountant';
}
