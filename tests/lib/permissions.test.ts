import { describe, expect, it } from 'vitest';
import { assertPermission, can, PermissionError } from '@/lib/auth/permissions';

describe('permissions', () => {
  it('grants ADMIN every permission', () => {
    expect(can('ADMIN', 'trading:emergency_stop')).toBe(true);
    expect(can('ADMIN', 'profiles:manage_roles')).toBe(true);
    expect(can('ADMIN', 'trading:start')).toBe(true);
  });

  it('grants TRADER trading permissions but not role management', () => {
    expect(can('TRADER', 'trading:start')).toBe(true);
    expect(can('TRADER', 'trading:emergency_stop')).toBe(true);
    expect(can('TRADER', 'profiles:manage_roles')).toBe(false);
  });

  it('denies VIEWER every mutating permission (read-only)', () => {
    expect(can('VIEWER', 'trading:start')).toBe(false);
    expect(can('VIEWER', 'trading:stop')).toBe(false);
    expect(can('VIEWER', 'trading:emergency_stop')).toBe(false);
    expect(can('VIEWER', 'trading:close_all')).toBe(false);
    expect(can('VIEWER', 'accounts:write')).toBe(false);
    expect(can('VIEWER', 'strategy:write')).toBe(false);
    expect(can('VIEWER', 'risk:write')).toBe(false);
  });

  it('assertPermission throws PermissionError for a denied action', () => {
    expect(() => assertPermission('VIEWER', 'trading:start')).toThrow(PermissionError);
  });

  it('assertPermission does not throw for a granted action', () => {
    expect(() => assertPermission('TRADER', 'trading:start')).not.toThrow();
  });
});
