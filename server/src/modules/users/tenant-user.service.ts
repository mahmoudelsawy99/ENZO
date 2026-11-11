import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { hashPassword } from '../../shared/password.js';
import { escapeRegex } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { assertWithinLimit } from '../billing/entitlement.service.js';
import { Employee } from '../employees/employee.model.js';
import { revokeAllForUser } from '../sessions/session.service.js';
import { Tenant } from '../tenants/tenant.model.js';
import { rolesForUser } from '../roles/role.service.js';
import { User } from './user.model.js';
import { normalizeEmail, toPublicUser } from './user.service.js';
import type { ListUsersQuery, UserProfile } from './tenant-user.validation.js';

async function loadTenantUser(access: TenantAccess, id: string) {
  const user = await User.findOne({ _id: id, tenantId: access.tenantId, userType: 'TENANT_USER' });
  if (!user) {
    throw new HttpError(404, 'not_found', 'User was not found.');
  }
  return user;
}

async function ownerId(tenantId: string): Promise<string | null> {
  const tenant = await Tenant.findById(tenantId).select('ownerUserId');
  return tenant?.ownerUserId ? String(tenant.ownerUserId) : null;
}

async function present(access: TenantAccess, id: string) {
  const user = await loadTenantUser(access, id);
  const employee = await Employee.findOne({ tenantId: access.tenantId, userId: user._id }).select('fullName employeeNumber');
  const roles = await rolesForUser(access, String(user._id));
  return {
    ...toPublicUser(user),
    isOwner: (await ownerId(access.tenantId)) === String(user._id),
    employee: employee
      ? { id: String(employee._id), fullName: employee.fullName, employeeNumber: employee.employeeNumber }
      : null,
    roles,
  };
}

export async function listTenantUsers(access: TenantAccess, query: ListUsersQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId, userType: 'TENANT_USER' };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ fullName: pattern }, { email: pattern }, { phone: pattern }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ fullName: 1 }).skip(skip).limit(query.pageSize).select('_id'),
    User.countDocuments(filter),
  ]);
  const data = await Promise.all(items.map((item) => present(access, String(item._id))));
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getTenantUser(access: TenantAccess, id: string) {
  return present(access, id);
}

export async function createTenantUser(access: TenantAccess, input: UserProfile & { password: string }) {
  await assertWithinLimit(access.tenantId, 'users');
  const email = normalizeEmail(input.email);
  try {
    const user = await User.create({
      fullName: input.fullName.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone,
      userType: 'TENANT_USER',
      tenantId: access.tenantId,
      status: 'ACTIVE',
      isEmailVerified: true,
    });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'user.created',
      entityType: 'user',
      entityId: String(user._id),
      summary: `User ${user.fullName} created.`,
    });
    return present(access, String(user._id));
  } catch (error) {
    if (hasDuplicateKey(error, 'email')) {
      throw new HttpError(409, 'duplicate_email', 'This email is already used.');
    }
    throw error;
  }
}

export async function updateTenantUser(access: TenantAccess, id: string, input: UserProfile) {
  const user = await loadTenantUser(access, id);
  user.fullName = input.fullName.trim();
  user.email = normalizeEmail(input.email);
  user.phone = input.phone;
  try {
    await user.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'email')) {
      throw new HttpError(409, 'duplicate_email', 'This email is already used.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'user.updated',
    entityType: 'user',
    entityId: String(user._id),
    summary: `User ${user.fullName} updated.`,
  });
  return present(access, String(user._id));
}

export async function setTenantUserStatus(access: TenantAccess, id: string, status: 'ACTIVE' | 'INACTIVE') {
  const user = await loadTenantUser(access, id);
  if (String(user._id) === access.userId && status !== 'ACTIVE') {
    throw new HttpError(409, 'self_status', 'You cannot deactivate your own account.');
  }
  if ((await ownerId(access.tenantId)) === String(user._id) && status !== 'ACTIVE') {
    throw new HttpError(409, 'owner_protected', 'The owner account stays active.');
  }
  user.status = status;
  if (status === 'ACTIVE') {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }
  await user.save();
  if (status !== 'ACTIVE') {
    await revokeAllForUser(String(user._id));
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'user.status',
    entityType: 'user',
    entityId: String(user._id),
    summary: `User ${user.fullName} marked ${status}.`,
  });
  return present(access, String(user._id));
}

export async function resetTenantUserPassword(access: TenantAccess, id: string, password: string) {
  const user = await User.findOne({ _id: id, tenantId: access.tenantId, userType: 'TENANT_USER' }).select('+passwordHash');
  if (!user) {
    throw new HttpError(404, 'not_found', 'User was not found.');
  }
  user.passwordHash = await hashPassword(password);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  if (user.status === 'LOCKED') {
    user.status = 'ACTIVE';
  }
  await user.save();
  await revokeAllForUser(String(user._id));
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'user.password',
    entityType: 'user',
    entityId: String(user._id),
    summary: `Password reset for ${user.fullName}. Sessions were revoked.`,
  });
}

export async function revokeTenantUserSessions(access: TenantAccess, id: string) {
  const user = await loadTenantUser(access, id);
  await revokeAllForUser(String(user._id));
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'user.sessions.revoked',
    entityType: 'user',
    entityId: String(user._id),
    summary: `Sessions revoked for ${user.fullName}.`,
  });
}

export async function linkUserEmployee(access: TenantAccess, userId: string, employeeId: string | null) {
  const user = await loadTenantUser(access, userId);
  const current = await Employee.findOne({ tenantId: access.tenantId, userId: user._id });
  if (!employeeId) {
    if (current) {
      current.userId = null;
      await current.save();
    }
  } else {
    const employee = await Employee.findOne({ _id: employeeId, tenantId: access.tenantId });
    if (!employee) {
      throw new HttpError(404, 'not_found', 'Employee was not found.');
    }
    if (employee.userId && String(employee.userId) !== String(user._id)) {
      throw new HttpError(409, 'employee_link', 'This employee is already linked to a user.');
    }
    const other = await Employee.findOne({ tenantId: access.tenantId, userId: user._id, _id: { $ne: employee._id } });
    if (other) {
      throw new HttpError(409, 'employee_link', 'This user is already linked to an employee.');
    }
    if (current && String(current._id) !== String(employee._id)) {
      current.userId = null;
      await current.save();
    }
    employee.userId = user._id;
    await employee.save();
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'user.employee',
    entityType: 'user',
    entityId: String(user._id),
    summary: employeeId ? 'User linked to an employee.' : 'User unlinked from an employee.',
  });
  return present(access, String(user._id));
}
