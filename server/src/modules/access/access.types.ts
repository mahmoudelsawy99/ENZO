import type { PermissionKey } from './permissions.js';

/**
 * Effective access for the signed-in tenant user.
 * Built from stored role assignments. Client-supplied tenant or branch ids are ignored.
 */
export interface TenantAccess {
  tenantId: string;
  userId: string;
  isOwner: boolean;
  permissions: Set<PermissionKey>;
  branchScope: 'ALL' | 'SELECTED';
  branchIds: string[];
}
