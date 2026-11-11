import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../shared/http-error.js';
import { Branch } from '../branches/branch.model.js';
import { Role } from '../roles/role.model.js';
import { UserRole } from '../roles/user-role.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import type { TenantAccess } from './access.types.js';
import { PERMISSION_KEYS, type PermissionKey, isPermissionKey } from './permissions.js';
import { ensureOwnerAccess } from './seed.js';

export function readAccess(req: Request): TenantAccess {
  if (!req.access) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  return req.access;
}

export function requirePermission(...keys: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const access = req.access;
    if (!access || (!access.isOwner && keys.some((key) => !access.permissions.has(key)))) {
      next(new HttpError(403, 'forbidden', 'You do not have access to this action.'));
      return;
    }
    next();
  };
}

export function requireAnyPermission(...keys: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const access = req.access;
    if (!access || (!access.isOwner && keys.every((key) => !access.permissions.has(key)))) {
      next(new HttpError(403, 'forbidden', 'You do not have access to this action.'));
      return;
    }
    next();
  };
}

export function assertBranchInScope(access: TenantAccess, branchId: string): void {
  if (access.branchScope === 'ALL' || access.branchIds.includes(branchId)) {
    return;
  }
  throw new HttpError(403, 'branch_forbidden', 'This branch is outside your access.');
}

export function assertCanGrant(access: TenantAccess, permissions: readonly string[]): void {
  if (access.isOwner) {
    return;
  }
  if (permissions.some((permission) => !access.permissions.has(permission as PermissionKey))) {
    throw new HttpError(403, 'permission_escalation', 'You cannot grant a permission you do not have.');
  }
}

export function assertBranchOperational(status: string): void {
  if (status !== 'ACTIVE') {
    throw new HttpError(409, 'branch_disabled', 'This branch is not accepting new operations.');
  }
}

export function assertEmployeeOperational(status: string): void {
  if (status !== 'ACTIVE') {
    throw new HttpError(409, 'employee_inactive', 'This employee cannot be used for new operations.');
  }
}

/**
 * Loads permissions and branch scope from stored assignments.
 * The tenant id always comes from the authenticated user.
 */
export async function loadAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth || req.auth.userType !== 'TENANT_USER' || !req.auth.tenantId) {
      throw new HttpError(403, 'forbidden', 'This action is only available inside a barbershop.');
    }
    const tenantId = req.auth.tenantId;
    const userId = req.auth.userId;
    await ensureOwnerAccess(tenantId, userId);

    const tenant = await Tenant.findById(tenantId).select('ownerUserId');
    const isOwner = Boolean(tenant?.ownerUserId && String(tenant.ownerUserId) === userId);
    const assignments = await UserRole.find({ tenantId, userId, status: 'ACTIVE' });
    const roles = await Role.find({
      _id: { $in: assignments.map((assignment) => assignment.roleId) },
      tenantId,
      status: 'ACTIVE',
    });
    const rolesById = new Map(roles.map((role) => [String(role._id), role]));
    const permissions = new Set<PermissionKey>();
    const branchIds = new Set<string>();
    let allBranches = false;

    for (const assignment of assignments) {
      const role = rolesById.get(String(assignment.roleId));
      if (!role) {
        continue;
      }
      for (const permission of role.permissions) {
        if (isPermissionKey(permission)) {
          permissions.add(permission);
        }
      }
      if (assignment.branchScope === 'ALL' && role.isOwner) {
        allBranches = true;
      } else {
        for (const branchId of assignment.branchIds) {
          branchIds.add(String(branchId));
        }
      }
    }

    if (isOwner) {
      allBranches = true;
      for (const permission of PERMISSION_KEYS) {
        permissions.add(permission);
      }
    }

    if (!allBranches && branchIds.size > 0) {
      const allowed = await Branch.find({ tenantId, _id: { $in: [...branchIds] } }).select('_id');
      branchIds.clear();
      for (const branch of allowed) {
        branchIds.add(String(branch._id));
      }
    }

    req.access = {
      tenantId,
      userId,
      isOwner,
      permissions,
      branchScope: allBranches ? 'ALL' : 'SELECTED',
      branchIds: [...branchIds],
    };
    next();
  } catch (error) {
    next(error);
  }
}
