import type { UserRole } from '@/types/database';

/**
 * Central permission table. Server-side API routes MUST call
 * `assertPermission` (or check `can()`) before performing a mutating action -
 * never trust a client-side disabled button as the only gate.
 */
export type Permission =
  | 'accounts:write'
  | 'trading:start'
  | 'trading:stop'
  | 'trading:emergency_stop'
  | 'trading:close_all'
  | 'strategy:write'
  | 'risk:write'
  | 'profiles:manage_roles';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'accounts:write',
    'trading:start',
    'trading:stop',
    'trading:emergency_stop',
    'trading:close_all',
    'strategy:write',
    'risk:write',
    'profiles:manage_roles',
  ],
  TRADER: [
    'accounts:write',
    'trading:start',
    'trading:stop',
    'trading:emergency_stop',
    'trading:close_all',
    'strategy:write',
    'risk:write',
  ],
  VIEWER: [],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`Role does not have permission: ${permission}`);
    this.name = 'PermissionError';
  }
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new PermissionError(permission);
  }
}
