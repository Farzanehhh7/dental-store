import type { AdminRoleCode } from '../../src/types/domain';

export type AdminPermission =
  | 'orders:read'
  | 'orders:create_manual'
  | 'orders:update_status'
  | 'orders:expire'
  | 'payments:ledger'
  | 'inventory:read'
  | 'inventory:write'
  | 'inventory:batch_price'
  | 'returns:process'
  | 'rfq:read_all'
  | 'rfq:quote'
  | 'rfq:convert'
  | 'proforma:read_all'
  | 'users:manage_group'
  | 'catalog:seo_sync'
  | 'catalog:import'
  | 'telemetry:read'
  | 'audit:read'
  | 'files:upload_catalog'
  | 'reports:read'
  | 'reports:read_financial'
  | 'marketing:read'
  | 'marketing:write';

const ALL_PERMISSIONS: AdminPermission[] = [
  'orders:read',
  'orders:create_manual',
  'orders:update_status',
  'orders:expire',
  'payments:ledger',
  'inventory:read',
  'inventory:write',
  'inventory:batch_price',
  'returns:process',
  'rfq:read_all',
  'rfq:quote',
  'rfq:convert',
  'proforma:read_all',
  'users:manage_group',
  'catalog:seo_sync',
  'catalog:import',
  'telemetry:read',
  'audit:read',
  'files:upload_catalog',
  'reports:read',
  'reports:read_financial',
  'marketing:read',
  'marketing:write',
];

export const ROLE_PERMISSIONS: Record<AdminRoleCode, ReadonlySet<AdminPermission>> = {
  super_admin: new Set<AdminPermission>(ALL_PERMISSIONS),
  admin: new Set<AdminPermission>(ALL_PERMISSIONS),
  sales_mgr: new Set<AdminPermission>([
    'orders:read',
    'orders:create_manual',
    'orders:update_status',
    'orders:expire',
    'payments:ledger',
    'inventory:read',
    'inventory:batch_price',
    'returns:process',
    'rfq:read_all',
    'rfq:quote',
    'rfq:convert',
    'proforma:read_all',
    'users:manage_group',
    'catalog:seo_sync',
    'catalog:import',
    'files:upload_catalog',
    'reports:read',
    'marketing:read',
    'marketing:write',
  ]),
  warehouse: new Set<AdminPermission>([
    'orders:read',
    'orders:update_status',
    'inventory:read',
    'inventory:write',
    'inventory:batch_price',
    'returns:process',
    'files:upload_catalog',
    'reports:read',
  ]),
  content: new Set<AdminPermission>([
    'catalog:seo_sync',
    'catalog:import',
    'telemetry:read',
    'files:upload_catalog',
    'reports:read',
    'marketing:read',
    'marketing:write',
  ]),
  support: new Set<AdminPermission>([
    'orders:read',
    'orders:update_status',
    'returns:process',
    'rfq:read_all',
    'proforma:read_all',
    'users:manage_group',
    'reports:read',
  ]),
  accountant: new Set<AdminPermission>([
    'orders:read',
    'orders:expire',
    'payments:ledger',
    'inventory:read',
    'returns:process',
    'proforma:read_all',
    'reports:read',
    'reports:read_financial',
  ]),
};

export function normalizeAdminRole(rawRole?: string): AdminRoleCode | null {
  const clean = (rawRole || '').trim().toLowerCase();
  if (clean === 'sales') return 'sales_mgr';
  if (
    clean === 'super_admin' ||
    clean === 'admin' ||
    clean === 'sales_mgr' ||
    clean === 'warehouse' ||
    clean === 'content' ||
    clean === 'support' ||
    clean === 'accountant'
  ) {
    return clean;
  }
  return null;
}

export function hasAdminPermission(role: AdminRoleCode, requirement: AdminPermission | readonly AdminRoleCode[]): boolean {
  if (typeof requirement === 'string') {
    return ROLE_PERMISSIONS[role]?.has(requirement) ?? false;
  }
  return requirement.includes(role);
}
