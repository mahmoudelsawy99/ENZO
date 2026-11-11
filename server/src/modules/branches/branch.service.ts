import { HttpError } from '../../shared/http-error.js';
import { assertWithinLimit } from '../billing/entitlement.service.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { assertBranchInScope } from '../access/access.middleware.js';
import { writeAudit } from '../access/audit.service.js';
import { User } from '../users/user.model.js';
import { Branch, WEEK_DAYS, type BranchStatus, type WeekDay } from './branch.model.js';
import type { BranchBody, ListBranchesQuery } from './branch.validation.js';

export interface PublicBranch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  workingHours: Record<WeekDay, { isOpen: boolean; openingTime: string; closingTime: string }>;
  managerUserId: string | null;
  managerName: string;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

function hoursFrom(value: unknown): PublicBranch['workingHours'] {
  const source = value && typeof value === 'object' && 'toObject' in value && typeof value.toObject === 'function'
    ? (value.toObject() as unknown)
    : value;
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const hours = {} as PublicBranch['workingHours'];
  for (const day of WEEK_DAYS) {
    const entry = record[day];
    const dayRecord = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    hours[day] = {
      isOpen: dayRecord['isOpen'] === true,
      openingTime: typeof dayRecord['openingTime'] === 'string' ? dayRecord['openingTime'] : '10:00',
      closingTime: typeof dayRecord['closingTime'] === 'string' ? dayRecord['closingTime'] : '22:00',
    };
  }
  return hours;
}

function present(branch: {
  _id: unknown;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  workingHours: unknown;
  managerUserId?: unknown;
  status: BranchStatus;
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}, managerName = ''): PublicBranch {
  return {
    id: String(branch._id),
    name: branch.name,
    code: branch.code,
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    workingHours: hoursFrom(branch.workingHours),
    managerUserId: branch.managerUserId ? String(branch.managerUserId) : null,
    managerName,
    status: branch.status,
    createdAt: timestamp(branch.createdAt),
    updatedAt: timestamp(branch.updatedAt),
    createdBy: branch.createdBy ? String(branch.createdBy) : null,
    updatedBy: branch.updatedBy ? String(branch.updatedBy) : null,
  };
}

async function managerNames(ids: Array<unknown>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id) => id).map((id) => String(id)))];
  if (unique.length === 0) {
    return new Map();
  }
  const users = await User.find({ _id: { $in: unique } }).select('fullName');
  return new Map(users.map((user) => [String(user._id), user.fullName]));
}

async function requireManager(tenantId: string, managerUserId: string): Promise<string | null> {
  if (!managerUserId) {
    return null;
  }
  const manager = await User.findOne({ _id: managerUserId, tenantId, userType: 'TENANT_USER' }).select('_id');
  if (!manager) {
    throw new HttpError(400, 'validation_error', 'Choose a user from this barbershop as the manager.');
  }
  return String(manager._id);
}

function scopedFilter(access: TenantAccess): Record<string, unknown> {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (access.branchScope === 'SELECTED') {
    filter['_id'] = { $in: access.branchIds };
  }
  return filter;
}

async function loadBranch(access: TenantAccess, id: string) {
  const branch = await Branch.findOne({ _id: id, tenantId: access.tenantId });
  if (!branch) {
    throw new HttpError(404, 'not_found', 'Branch was not found.');
  }
  assertBranchInScope(access, String(branch._id));
  return branch;
}

export async function listBranches(access: TenantAccess, query: ListBranchesQuery) {
  const filter = scopedFilter(access);
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ name: pattern }, { code: pattern }, { phone: pattern }, { address: pattern }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Branch.find(filter).sort({ name: 1 }).skip(skip).limit(query.pageSize),
    Branch.countDocuments(filter),
  ]);
  const names = await managerNames(items.map((item) => item.managerUserId));
  return {
    data: items.map((item) => present(item, names.get(String(item.managerUserId ?? '')) ?? '')),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function accessibleBranches(access: TenantAccess) {
  const filter = scopedFilter(access);
  const items = await Branch.find(filter).sort({ name: 1 }).select('name code status');
  return items.map((item) => ({
    id: String(item._id),
    name: item.name,
    code: item.code,
    status: item.status,
  }));
}

export async function getBranch(access: TenantAccess, id: string): Promise<PublicBranch> {
  const branch = await loadBranch(access, id);
  const names = await managerNames([branch.managerUserId]);
  return present(branch, names.get(String(branch.managerUserId ?? '')) ?? '');
}

export async function createBranch(access: TenantAccess, input: BranchBody): Promise<PublicBranch> {
  if (access.branchScope !== 'ALL') {
    throw new HttpError(403, 'branch_forbidden', 'Adding a branch requires access to the whole barbershop.');
  }
  await assertWithinLimit(access.tenantId, 'branches');
  const managerUserId = await requireManager(access.tenantId, input.managerUserId);
  try {
    const branch = await Branch.create({
      tenantId: access.tenantId,
      name: input.name.trim(),
      code: input.code,
      address: input.address,
      phone: input.phone,
      workingHours: input.workingHours,
      managerUserId,
      status: 'ACTIVE',
      createdBy: access.userId,
      updatedBy: access.userId,
    });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'branch.created',
      entityType: 'branch',
      entityId: String(branch._id),
      summary: `Branch ${branch.name} created.`,
    });
    return getBranch(access, String(branch._id));
  } catch (error) {
    if (hasDuplicateKey(error, 'code')) {
      throw new HttpError(409, 'duplicate_code', 'A branch with this code already exists.');
    }
    throw error;
  }
}

export async function updateBranch(access: TenantAccess, id: string, input: BranchBody): Promise<PublicBranch> {
  const branch = await loadBranch(access, id);
  const managerUserId = await requireManager(access.tenantId, input.managerUserId);
  branch.name = input.name.trim();
  branch.code = input.code;
  branch.address = input.address;
  branch.phone = input.phone;
  branch.set('workingHours', input.workingHours);
  branch.set('managerUserId', managerUserId);
  branch.set('updatedBy', access.userId);
  try {
    await branch.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'code')) {
      throw new HttpError(409, 'duplicate_code', 'A branch with this code already exists.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'branch.updated',
    entityType: 'branch',
    entityId: String(branch._id),
    summary: `Branch ${branch.name} updated.`,
  });
  return getBranch(access, String(branch._id));
}

export async function setBranchStatus(access: TenantAccess, id: string, status: BranchStatus): Promise<PublicBranch> {
  const branch = await loadBranch(access, id);
  branch.status = status;
  branch.set('updatedBy', access.userId);
  await branch.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'branch.status',
    entityType: 'branch',
    entityId: String(branch._id),
    summary: `Branch ${branch.name} marked ${status}. Historical records were kept.`,
  });
  return getBranch(access, String(branch._id));
}
