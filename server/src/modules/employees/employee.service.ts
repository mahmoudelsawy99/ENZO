import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey, runInTransaction } from '../../shared/mongo.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { assertBranchInScope, assertBranchOperational, assertEmployeeOperational } from '../access/access.middleware.js';
import { writeAudit, auditTime } from '../access/audit.service.js';
import { AuditLog } from '../access/audit.model.js';
import { Branch } from '../branches/branch.model.js';
import { employeeCommissionRules } from '../commissions/commission.service.js';
import { User } from '../users/user.model.js';
import { assertWithinLimit } from '../billing/entitlement.service.js';
import { EmployeeBranch } from './assignment.model.js';
import { EmploymentType, JobTitle } from './catalog.model.js';
import { Employee, type EmployeeStatus, type SalaryPeriod } from './employee.model.js';
import type { EmployeeBody, ListEmployeesQuery } from './employee.validation.js';

export interface PublicAssignment {
  id: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  branchStatus: string;
  status: 'ACTIVE' | 'REMOVED';
  isPrimary: boolean;
  assignedAt: string;
  removedAt: string | null;
}

interface SalaryView {
  period: SalaryPeriod;
  basicSalary: number;
  allowances: number;
  tips: number;
  deductions: number;
}

function maskNationalId(value: string): string {
  if (!value) {
    return '';
  }
  return `••••${value.slice(-4)}`;
}

function salaryOf(value: unknown): SalaryView {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const period = record['period'];
  return {
    period: period === 'DAILY' || period === 'WEEKLY' || period === 'MONTHLY' ? period : 'MONTHLY',
    basicSalary: typeof record['basicSalary'] === 'number' ? record['basicSalary'] : 0,
    allowances: typeof record['allowances'] === 'number' ? record['allowances'] : 0,
    tips: typeof record['tips'] === 'number' ? record['tips'] : 0,
    deductions: typeof record['deductions'] === 'number' ? record['deductions'] : 0,
  };
}

async function catalogName(model: typeof EmploymentType, id: unknown): Promise<string> {
  if (!id) {
    return '';
  }
  const item = await model.findById(id).select('name');
  return item?.name ?? '';
}

async function assignmentsFor(tenantId: string, employeeId: string): Promise<PublicAssignment[]> {
  const rows = await EmployeeBranch.find({ tenantId, employeeId }).sort({ status: 1, assignedAt: -1 });
  const branches = await Branch.find({ _id: { $in: rows.map((row) => row.branchId) } }).select('name code status');
  const byId = new Map(branches.map((branch) => [String(branch._id), branch]));
  return rows.map((row) => {
    const branch = byId.get(String(row.branchId));
    return {
      id: String(row._id),
      branchId: String(row.branchId),
      branchName: branch?.name ?? '',
      branchCode: branch?.code ?? '',
      branchStatus: branch?.status ?? '',
      status: row.status,
      isPrimary: row.isPrimary,
      assignedAt: timestamp(row.assignedAt),
      removedAt: row.removedAt ? timestamp(row.removedAt) : null,
    };
  });
}

async function visibleIds(access: TenantAccess): Promise<string[] | null> {
  if (access.branchScope === 'ALL') {
    return null;
  }
  const rows = await EmployeeBranch.find({
    tenantId: access.tenantId,
    branchId: { $in: access.branchIds },
    status: 'ACTIVE',
  }).select('employeeId');
  return rows.map((row) => String(row.employeeId));
}

async function loadEmployee(access: TenantAccess, id: string, withNationalId: boolean) {
  const query = Employee.findOne({ _id: id, tenantId: access.tenantId });
  const employee = await (withNationalId ? query.select('+nationalId') : query);
  if (!employee) {
    throw new HttpError(404, 'not_found', 'Employee was not found.');
  }
  if (access.branchScope === 'SELECTED') {
    const allowed = await EmployeeBranch.exists({
      tenantId: access.tenantId,
      employeeId: employee._id,
      branchId: { $in: access.branchIds },
      status: 'ACTIVE',
    });
    if (!allowed) {
      throw new HttpError(403, 'branch_forbidden', 'This employee is outside your branch access.');
    }
  }
  return employee;
}

async function requireActiveCatalog(tenantId: string, employmentTypeId: string, jobTitleId: string) {
  const [employmentType, jobTitle] = await Promise.all([
    EmploymentType.findOne({ _id: employmentTypeId, tenantId, status: 'ACTIVE' }),
    JobTitle.findOne({ _id: jobTitleId, tenantId, status: 'ACTIVE' }),
  ]);
  if (!employmentType || !jobTitle) {
    throw new HttpError(400, 'validation_error', 'Choose an active employment type and job title.');
  }
}

async function requireBranchForAssignment(access: TenantAccess, branchId: string) {
  const branch = await Branch.findOne({ _id: branchId, tenantId: access.tenantId });
  if (!branch) {
    throw new HttpError(400, 'validation_error', 'Choose a branch from this barbershop.');
  }
  assertBranchInScope(access, String(branch._id));
  assertBranchOperational(branch.status);
  return branch;
}

async function nextNumber(tenantId: string, preferred: string): Promise<string> {
  if (preferred.trim()) {
    return preferred.trim().toUpperCase();
  }
  const count = await Employee.countDocuments({ tenantId });
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

function salaryInput(input: EmployeeBody['salary']): SalaryView {
  return {
    period: input?.period ?? 'MONTHLY',
    basicSalary: input?.basicSalary ?? 0,
    allowances: input?.allowances ?? 0,
    tips: input?.tips ?? 0,
    deductions: input?.deductions ?? 0,
  };
}

async function syncBranches(access: TenantAccess, employeeId: string, links: EmployeeBody['branches']): Promise<void> {
  const current = await EmployeeBranch.find({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' });
  const wanted = new Map(links.map((link) => [link.branchId, link.isPrimary]));
  for (const row of current) {
    const branchId = String(row.branchId);
    if (!wanted.has(branchId)) {
      row.status = 'REMOVED';
      row.isPrimary = false;
      row.removedAt = new Date();
      await row.save();
      continue;
    }
    row.isPrimary = wanted.get(branchId) === true;
    await row.save();
    wanted.delete(branchId);
  }
  for (const [branchId, isPrimary] of wanted) {
    await requireBranchForAssignment(access, branchId);
    await EmployeeBranch.create({
      tenantId: access.tenantId,
      employeeId,
      branchId,
      assignedAt: new Date(),
      status: 'ACTIVE',
      isPrimary,
    });
  }
}

export async function presentEmployee(access: TenantAccess, id: string, includeSensitive: boolean) {
  const employee = await loadEmployee(access, id, includeSensitive);
  const [employmentTypeName, jobTitleName, branches, user, commissions] = await Promise.all([
    catalogName(EmploymentType, employee.employmentTypeId),
    catalogName(JobTitle, employee.jobTitleId),
    assignmentsFor(access.tenantId, String(employee._id)),
    employee.userId ? User.findById(employee.userId).select('fullName email status') : Promise.resolve(null),
    employeeCommissionRules(access.tenantId, String(employee._id)),
  ]);
  const nationalId = includeSensitive ? String(employee.get('nationalId') ?? '') : '';
  return {
    id: String(employee._id),
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    profileImage: employee.profileImage ?? '',
    nationalIdMasked: maskNationalId(nationalId || String(employee.get('nationalId') ?? '')),
    address: employee.address ?? '',
    dateOfBirth: employee.dateOfBirth ?? '',
    joiningDate: employee.joiningDate,
    employmentTypeId: String(employee.employmentTypeId),
    employmentTypeName,
    jobTitleId: String(employee.jobTitleId),
    jobTitleName,
    userId: employee.userId ? String(employee.userId) : null,
    user: user ? { id: String(user._id), fullName: user.fullName, email: user.email, status: user.status } : null,
    salary: salaryOf(employee.salary),
    salaryFormula: {
      gross: 'basicSalary + allowances + commission + tips',
      net: 'gross - deductions',
    },
    commissionRules: commissions,
    branches,
    status: employee.status,
    notes: employee.notes ?? '',
    createdAt: timestamp(employee.get('createdAt')),
    updatedAt: timestamp(employee.get('updatedAt')),
  };
}

export async function listEmployees(access: TenantAccess, query: ListEmployeesQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  const allowed = await visibleIds(access);
  if (allowed) {
    filter['_id'] = { $in: allowed };
  }
  if (query.branchId) {
    if (access.branchScope === 'SELECTED') {
      assertBranchInScope(access, query.branchId);
    }
    const rows = await EmployeeBranch.find({
      tenantId: access.tenantId,
      branchId: query.branchId,
      status: 'ACTIVE',
    }).select('employeeId');
    const ids = rows.map((row) => String(row.employeeId));
    const current = Array.isArray(filter['_id']) ? filter['_id'].map(String) : ids;
    filter['_id'] = { $in: allowed ? ids.filter((id) => allowed.includes(id)) : current };
  }
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ fullName: pattern }, { employeeNumber: pattern }, { email: pattern }, { phone: pattern }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ fullName: 1 }).skip(skip).limit(query.pageSize),
    Employee.countDocuments(filter),
  ]);
  const data = await Promise.all(items.map((item) => presentEmployee(access, String(item._id), false)));
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

function applyEmployee(employee: InstanceType<typeof Employee>, input: EmployeeBody, number: string, actorId: string) {
  employee.employeeNumber = number;
  employee.fullName = input.fullName.trim();
  employee.email = input.email.trim().toLowerCase();
  employee.phone = input.phone;
  employee.profileImage = input.profileImage;
  employee.address = input.address;
  employee.dateOfBirth = input.dateOfBirth;
  employee.joiningDate = input.joiningDate;
  employee.set('employmentTypeId', input.employmentTypeId);
  employee.set('jobTitleId', input.jobTitleId);
  employee.set('salary', salaryInput(input.salary));
  employee.notes = input.notes;
  employee.set('updatedBy', actorId);
  if (input.nationalId) {
    employee.set('nationalId', input.nationalId);
  }
}

export async function createEmployee(access: TenantAccess, input: EmployeeBody) {
  await assertWithinLimit(access.tenantId, 'employees');
  await requireActiveCatalog(access.tenantId, input.employmentTypeId, input.jobTitleId);
  for (const link of input.branches) {
    await requireBranchForAssignment(access, link.branchId);
  }
  try {
    const employeeId = await runInTransaction(async (session) => {
      const employee = new Employee({
        tenantId: access.tenantId,
        employeeNumber: await nextNumber(access.tenantId, input.employeeNumber),
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
        profileImage: input.profileImage,
        nationalId: input.nationalId,
        address: input.address,
        dateOfBirth: input.dateOfBirth,
        joiningDate: input.joiningDate,
        employmentTypeId: input.employmentTypeId,
        jobTitleId: input.jobTitleId,
        salary: salaryInput(input.salary),
        status: 'ACTIVE',
        notes: input.notes,
        createdBy: access.userId,
        updatedBy: access.userId,
      });
      if (session) {
        await employee.save({ session });
      } else {
        await employee.save();
      }
      for (const link of input.branches) {
        const assignment = new EmployeeBranch({
          tenantId: access.tenantId,
          employeeId: employee._id,
          branchId: link.branchId,
          assignedAt: new Date(),
          status: 'ACTIVE',
          isPrimary: link.isPrimary,
        });
        if (session) {
          await assignment.save({ session });
        } else {
          await assignment.save();
        }
      }
      await writeAudit(
        {
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'employee.created',
          entityType: 'employee',
          entityId: String(employee._id),
          summary: `Employee ${employee.fullName} created.`,
        },
        session,
      );
      return String(employee._id);
    });
    return presentEmployee(access, employeeId, true);
  } catch (error) {
    if (hasDuplicateKey(error, 'employeeNumber')) {
      throw new HttpError(409, 'duplicate_employee_number', 'This employee number is already used.');
    }
    if (hasDuplicateKey(error, 'email')) {
      throw new HttpError(409, 'duplicate_email', 'This email is already used by an employee.');
    }
    throw error;
  }
}

export async function updateEmployee(access: TenantAccess, id: string, input: EmployeeBody) {
  const employee = await loadEmployee(access, id, false);
  await requireActiveCatalog(access.tenantId, input.employmentTypeId, input.jobTitleId);
  applyEmployee(employee, input, input.employeeNumber.trim() ? input.employeeNumber.trim().toUpperCase() : employee.employeeNumber, access.userId);
  try {
    await employee.save();
    await syncBranches(access, String(employee._id), input.branches);
  } catch (error) {
    if (hasDuplicateKey(error, 'employeeNumber')) {
      throw new HttpError(409, 'duplicate_employee_number', 'This employee number is already used.');
    }
    if (hasDuplicateKey(error, 'email')) {
      throw new HttpError(409, 'duplicate_email', 'This email is already used by an employee.');
    }
    if (hasDuplicateKey(error, 'branchId')) {
      throw new HttpError(409, 'duplicate_assignment', 'This employee is already assigned to that branch.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'employee.updated',
    entityType: 'employee',
    entityId: String(employee._id),
    summary: `Employee ${employee.fullName} updated.`,
  });
  return presentEmployee(access, String(employee._id), true);
}

export async function setEmployeeStatus(access: TenantAccess, id: string, status: EmployeeStatus) {
  const employee = await loadEmployee(access, id, false);
  employee.status = status;
  employee.set('updatedBy', access.userId);
  await employee.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'employee.status',
    entityType: 'employee',
    entityId: String(employee._id),
    summary: `Employee ${employee.fullName} marked ${status}. Historical records were kept.`,
  });
  return presentEmployee(access, String(employee._id), true);
}

export async function assignEmployeeBranch(access: TenantAccess, employeeId: string, branchId: string, isPrimary: boolean) {
  const employee = await loadEmployee(access, employeeId, false);
  assertEmployeeOperational(employee.status);
  await requireBranchForAssignment(access, branchId);
  const existing = await EmployeeBranch.findOne({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    status: 'ACTIVE',
  });
  if (existing) {
    throw new HttpError(409, 'duplicate_assignment', 'This employee is already assigned to that branch.');
  }
  if (isPrimary) {
    await EmployeeBranch.updateMany({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' }, { $set: { isPrimary: false } });
  }
  const activeCount = await EmployeeBranch.countDocuments({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' });
  await EmployeeBranch.create({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    assignedAt: new Date(),
    status: 'ACTIVE',
    isPrimary: isPrimary || activeCount === 0,
  });
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'employee.branch.assigned',
    entityType: 'employee',
    entityId: employeeId,
    summary: `Employee assigned to a branch.`,
  });
  return presentEmployee(access, employeeId, false);
}

export async function removeEmployeeBranch(access: TenantAccess, employeeId: string, branchId: string) {
  await loadEmployee(access, employeeId, false);
  assertBranchInScope(access, branchId);
  const assignment = await EmployeeBranch.findOne({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    status: 'ACTIVE',
  });
  if (!assignment) {
    throw new HttpError(404, 'not_found', 'This branch assignment was not found.');
  }
  assignment.status = 'REMOVED';
  assignment.isPrimary = false;
  assignment.removedAt = new Date();
  await assignment.save();
  if (assignment.isPrimary === false) {
    const next = await EmployeeBranch.findOne({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' }).sort({ assignedAt: 1 });
    if (next && !(await EmployeeBranch.exists({ tenantId: access.tenantId, employeeId, status: 'ACTIVE', isPrimary: true }))) {
      next.isPrimary = true;
      await next.save();
    }
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'employee.branch.removed',
    entityType: 'employee',
    entityId: employeeId,
    summary: 'Employee removed from a branch. Historical records were kept.',
  });
  return presentEmployee(access, employeeId, false);
}

export async function setPrimaryBranch(access: TenantAccess, employeeId: string, branchId: string) {
  await loadEmployee(access, employeeId, false);
  assertBranchInScope(access, branchId);
  const assignment = await EmployeeBranch.findOne({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    status: 'ACTIVE',
  });
  if (!assignment) {
    throw new HttpError(404, 'not_found', 'This branch assignment was not found.');
  }
  await EmployeeBranch.updateMany({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' }, { $set: { isPrimary: false } });
  assignment.isPrimary = true;
  await assignment.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'employee.branch.primary',
    entityType: 'employee',
    entityId: employeeId,
    summary: 'Primary branch changed.',
  });
  return presentEmployee(access, employeeId, false);
}

export async function employeeActivity(access: TenantAccess, employeeId: string) {
  await loadEmployee(access, employeeId, false);
  const entries = await AuditLog.find({ tenantId: access.tenantId, entityType: 'employee', entityId: employeeId })
    .sort({ createdAt: -1 })
    .limit(50);
  return entries.map((entry) => ({
    id: String(entry._id),
    action: entry.action,
    summary: entry.summary,
    createdAt: auditTime(entry.get('createdAt')),
  }));
}

export async function listCatalog(model: typeof EmploymentType, tenantId: string) {
  const items = await model.find({ tenantId }).sort({ name: 1 });
  return items.map((item) => ({ id: String(item._id), name: item.name, status: item.status }));
}

export async function createCatalog(model: typeof EmploymentType, access: TenantAccess, name: string, label: string) {
  try {
    const item = await model.create({ tenantId: access.tenantId, name: name.trim(), status: 'ACTIVE' });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: `${label}.created`,
      entityType: label,
      entityId: String(item._id),
      summary: `${name.trim()} added.`,
    });
    return { id: String(item._id), name: item.name, status: item.status };
  } catch (error) {
    if (hasDuplicateKey(error, 'name')) {
      throw new HttpError(409, 'duplicate_name', 'This name is already used.');
    }
    throw error;
  }
}

export async function setCatalogStatus(model: typeof EmploymentType, access: TenantAccess, id: string, status: 'ACTIVE' | 'INACTIVE', label: string) {
  const item = await model.findOne({ _id: id, tenantId: access.tenantId });
  if (!item) {
    throw new HttpError(404, 'not_found', 'The record was not found.');
  }
  item.status = status;
  await item.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: `${label}.status`,
    entityType: label,
    entityId: String(item._id),
    summary: `${item.name} marked ${status}.`,
  });
  return { id: String(item._id), name: item.name, status: item.status };
}
