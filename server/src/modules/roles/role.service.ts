import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey, runInTransaction } from '../../shared/mongo.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { assertBranchInScope, assertCanGrant } from '../access/access.middleware.js';
import { writeAudit } from '../access/audit.service.js';
import { PERMISSION_KEYS, isPermissionKey } from '../access/permissions.js';
import { Branch } from '../branches/branch.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { Role, type RoleStatus } from './role.model.js';
import { UserRole } from './user-role.model.js';
import type { ListRolesQuery, RoleAssignmentInput, RoleBody } from './role.validation.js';

function presentRole(role: InstanceType<typeof Role>) {
  return {
    id: String(role._id),
    name: role.name,
    description: role.description ?? '',
    permissions: role.permissions.filter(isPermissionKey),
    status: role.status,
    isOwner: role.isOwner,
    createdAt: timestamp(role.get('createdAt')),
    updatedAt: timestamp(role.get('updatedAt')),
  };
}

async function loadRole(tenantId: string, id: string) {
  const role = await Role.findOne({ _id: id, tenantId });
  if (!role) {
    throw new HttpError(404, 'not_found', 'Role was not found.');
  }
  return role;
}

export async function listRoles(access: TenantAccess, query: ListRolesQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    filter['name'] = new RegExp(escapeRegex(query.search), 'i');
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Role.find(filter).sort({ isOwner: -1, name: 1 }).skip(skip).limit(query.pageSize),
    Role.countDocuments(filter),
  ]);
  return { data: items.map(presentRole), meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getRole(access: TenantAccess, id: string) {
  return presentRole(await loadRole(access.tenantId, id));
}

export async function createRole(access: TenantAccess, input: RoleBody) {
  assertCanGrant(access, input.permissions);
  try {
    const role = await Role.create({
      tenantId: access.tenantId,
      name: input.name.trim(),
      description: input.description,
      permissions: [...new Set(input.permissions)],
      status: 'ACTIVE',
      isOwner: false,
      createdBy: access.userId,
      updatedBy: access.userId,
    });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'role.created',
      entityType: 'role',
      entityId: String(role._id),
      summary: `Role ${role.name} created.`,
    });
    return presentRole(role);
  } catch (error) {
    if (hasDuplicateKey(error, 'name')) {
      throw new HttpError(409, 'duplicate_name', 'A role with this name already exists.');
    }
    throw error;
  }
}

export async function updateRole(access: TenantAccess, id: string, input: RoleBody) {
  const role = await loadRole(access.tenantId, id);
  if (role.isOwner) {
    throw new HttpError(409, 'owner_role_locked', 'The owner role keeps full access.');
  }
  assertCanGrant(access, input.permissions);
  role.name = input.name.trim();
  role.description = input.description;
  role.permissions = [...new Set(input.permissions)];
  role.set('updatedBy', access.userId);
  try {
    await role.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'name')) {
      throw new HttpError(409, 'duplicate_name', 'A role with this name already exists.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'role.updated',
    entityType: 'role',
    entityId: String(role._id),
    summary: `Role ${role.name} updated.`,
  });
  return presentRole(role);
}

export async function setRoleStatus(access: TenantAccess, id: string, status: RoleStatus) {
  const role = await loadRole(access.tenantId, id);
  if (role.isOwner && status !== 'ACTIVE') {
    throw new HttpError(409, 'owner_role_locked', 'The owner role cannot be disabled.');
  }
  role.status = status;
  role.set('updatedBy', access.userId);
  await role.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'role.status',
    entityType: 'role',
    entityId: String(role._id),
    summary: `Role ${role.name} marked ${status}.`,
  });
  return presentRole(role);
}

export async function duplicateRole(access: TenantAccess, id: string, name: string) {
  const source = await loadRole(access.tenantId, id);
  const permissions = source.isOwner ? [...PERMISSION_KEYS] : source.permissions.filter(isPermissionKey);
  return createRole(access, { name, description: source.description ?? '', permissions });
}

async function assertAssignment(access: TenantAccess, input: RoleAssignmentInput) {
  const role = await Role.findOne({ _id: input.roleId, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!role) {
    throw new HttpError(400, 'validation_error', 'Choose an active role from this barbershop.');
  }
  if (role.isOwner && !access.isOwner) {
    throw new HttpError(403, 'forbidden', 'Only the owner can assign the owner role.');
  }
  assertCanGrant(access, role.permissions);
  if (input.branchScope === 'ALL') {
    if (!access.isOwner || !role.isOwner) {
      throw new HttpError(403, 'branch_forbidden', 'Full branch access belongs to the owner role.');
    }
    return;
  }
  if (input.branchIds.length === 0) {
    throw new HttpError(400, 'validation_error', 'Choose at least one branch.');
  }
  const branches = await Branch.find({ _id: { $in: input.branchIds }, tenantId: access.tenantId }).select('_id');
  if (branches.length !== new Set(input.branchIds).size) {
    throw new HttpError(400, 'validation_error', 'Choose branches from this barbershop.');
  }
  for (const branchId of input.branchIds) {
    assertBranchInScope(access, branchId);
  }
}

export async function rolesForUser(access: TenantAccess, userId: string) {
  const user = await User.findOne({ _id: userId, tenantId: access.tenantId, userType: 'TENANT_USER' }).select('_id');
  if (!user) {
    throw new HttpError(404, 'not_found', 'User was not found.');
  }
  const rows = await UserRole.find({ tenantId: access.tenantId, userId, status: 'ACTIVE' });
  const roles = await Role.find({ _id: { $in: rows.map((row) => row.roleId) } });
  const byId = new Map(roles.map((role) => [String(role._id), role]));
  return rows.map((row) => {
    const role = byId.get(String(row.roleId));
    return {
      id: String(row._id),
      roleId: String(row.roleId),
      roleName: role?.name ?? '',
      roleStatus: role?.status ?? 'INACTIVE',
      permissions: (role?.permissions ?? []).filter(isPermissionKey),
      branchScope: row.branchScope,
      branchIds: row.branchIds.map((branchId) => String(branchId)),
    };
  });
}

export async function replaceUserRoles(access: TenantAccess, userId: string, assignments: RoleAssignmentInput[]) {
  const user = await User.findOne({ _id: userId, tenantId: access.tenantId, userType: 'TENANT_USER' });
  if (!user) {
    throw new HttpError(404, 'not_found', 'User was not found.');
  }
  const uniqueRoles = new Set(assignments.map((item) => item.roleId));
  if (uniqueRoles.size !== assignments.length) {
    throw new HttpError(400, 'validation_error', 'Assign each role once.');
  }
  for (const item of assignments) {
    await assertAssignment(access, item);
  }
  const tenant = await Tenant.findById(access.tenantId).select('ownerUserId');
  const targetIsOwner = String(tenant?.ownerUserId) === userId;
  if (targetIsOwner) {
    const ownerRole = await Role.findOne({ tenantId: access.tenantId, isOwner: true });
    const kept = ownerRole
      ? assignments.some((item) => item.roleId === String(ownerRole._id) && item.branchScope === 'ALL')
      : false;
    if (!kept) {
      throw new HttpError(409, 'owner_role_required', 'The owner keeps full access to this barbershop.');
    }
  }
  await runInTransaction(async (session) => {
    const existing = UserRole.find({ tenantId: access.tenantId, userId });
    if (session) {
      await existing.session(session).deleteMany();
    } else {
      await existing.deleteMany();
    }
    for (const item of assignments) {
      const created = new UserRole({
        tenantId: access.tenantId,
        userId,
        roleId: item.roleId,
        branchScope: item.branchScope,
        branchIds: item.branchScope === 'ALL' ? [] : item.branchIds,
        status: 'ACTIVE',
      });
      if (session) {
        await created.save({ session });
      } else {
        await created.save();
      }
    }
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'user.roles',
        entityType: 'user',
        entityId: userId,
        summary: 'Role and branch access updated.',
      },
      session,
    );
    return true;
  });
  return rolesForUser(access, userId);
}
