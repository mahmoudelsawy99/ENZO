import type { ClientSession } from 'mongoose';
import { CommissionRule } from '../commissions/commission.model.js';
import { EmploymentType, JobTitle } from '../employees/catalog.model.js';
import { Role } from '../roles/role.model.js';
import { UserRole } from '../roles/user-role.model.js';
import { saveDoc } from '../../shared/persist.js';
import { PERMISSION_KEYS, type PermissionKey } from './permissions.js';
import { Tenant } from '../tenants/tenant.model.js';

const RECOMMENDED: readonly { name: string; description: string; permissions: PermissionKey[] }[] = [
  {
    name: 'Branch Manager',
    description: 'Runs the branches assigned to this person.',
    permissions: [
      'branches.view',
      'branches.update',
      'employees.view',
      'employees.assign-branches',
      'appointments.view',
      'appointments.create',
      'appointments.update',
      'appointments.confirm',
      'appointments.check-in',
      'appointments.cancel',
      'appointments.reschedule',
      'appointments.mark-no-show',
      'queue.view',
      'queue.create',
      'queue.reorder',
      'queue.start-service',
      'queue.complete-service',
      'pos.view',
      'transactions.view',
      'payments.view',
      'payments.create',
      'refunds.view',
      'cashier-shifts.view',
      'commissions.view',
      'reports.view',
      'services.view',
      'customers.view',
      'customers.create',
      'customers.update',
      'customers.notes.create',
      'packages.view',
      'customer-packages.view',
      'inventory.view',
      'products.view',
      'suppliers.view',
      'purchases.view',
      'transfers.view',
      'stock-alerts.view',
      'attendance.view',
      'attendance.manual-entry',
      'schedules.view',
      'leave-requests.view',
      'leave-requests.approve',
      'leave-balances.view',
    ],
  },
  {
    name: 'Cashier',
    description: 'Takes payments at the assigned branches.',
    permissions: [
      'pos.view',
      'pos.checkout',
      'pos.apply-discount',
      'transactions.view',
      'transactions.create',
      'payments.view',
      'payments.create',
      'payments.apply-discount',
      'refunds.view',
      'refunds.create',
      'cashier-shifts.view',
      'cashier-shifts.open',
      'cashier-shifts.close',
      'tips.view',
      'tips.manage',
      'appointments.create',
      'queue.view',
      'queue.create',
      'services.view',
      'customers.create',
      'packages.view',
      'packages.assign',
      'customer-packages.view',
      'customer-packages.assign',
      'products.view',
      'products.create',
      'inventory.view',
      'reports.cashier',
    ],
  },
  {
    name: 'Receptionist',
    description: 'Books appointments at the assigned branches.',
    permissions: [
      'appointments.view',
      'appointments.create',
      'appointments.update',
      'appointments.confirm',
      'appointments.check-in',
      'appointments.cancel',
      'appointments.reschedule',
      'appointments.mark-no-show',
      'queue.view',
      'queue.create',
      'queue.start-service',
      'queue.complete-service',
      'employees.view',
      'services.view',
      'customers.view',
      'customers.create',
      'customers.update',
      'customers.notes.create',
      'packages.view',
      'customer-packages.view',
      'customer-packages.assign',
    ],
  },
  {
    name: 'HR',
    description: 'Maintains employee and user records.',
    permissions: [
      'employees.view',
      'employees.create',
      'employees.update',
      'employees.disable',
      'employees.assign-branches',
      'users.view',
      'users.create',
      'users.update',
      'users.disable',
      'workforce.manage',
      'commissions.view',
      'attendance.view',
      'attendance.manage',
      'attendance.manual-entry',
      'attendance.correct',
      'attendance.rules.manage',
      'schedules.view',
      'schedules.manage',
      'fingerprint-devices.view',
      'fingerprint-devices.manage',
      'fingerprint-devices.sync',
      'leave-types.manage',
      'leave-requests.view',
      'leave-requests.create',
      'leave-requests.approve',
      'leave-balances.view',
      'leave-balances.manage',
      'payroll.view',
      'payroll.generate',
      'payroll.review',
    ],
  },
  {
    name: 'Accountant',
    description: 'Reviews payments and reports.',
    permissions: [
      'transactions.view',
      'payments.view',
      'payments.refund',
      'refunds.view',
      'refunds.approve',
      'cashier-shifts.view',
      'tips.view',
      'reports.view',
      'reports.export',
      'employees.view',
      'commissions.view',
      'customers.view',
      'packages.view',
      'customer-packages.view',
      'suppliers.view',
      'purchases.view',
      'attendance.view',
      'payroll.view',
      'payroll.review',
      'payroll.approve',
      'payroll.pay',
      'payroll.adjust',
      'leave-balances.view',
    ],
  },
];

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract'];
const JOB_TITLES = ['Barber', 'Receptionist', 'Cashier', 'Branch Manager'];

async function findRole(tenantId: string, filter: Record<string, unknown>, session: ClientSession | null) {
  const query = Role.findOne({ tenantId, ...filter });
  return session ? query.session(session) : query;
}

/**
 * Creates the owner role, starter roles, workforce catalogs, and the tenant commission default.
 * Safe to call again. Existing records are left in place.
 */
export async function seedTenantDefaults(tenantId: string, ownerUserId: string, session: ClientSession | null): Promise<void> {
  let ownerRole = await findRole(tenantId, { isOwner: true }, session);
  if (!ownerRole) {
    ownerRole = new Role({
      tenantId,
      name: 'Owner',
      description: 'Full access to this barbershop.',
      permissions: [...PERMISSION_KEYS],
      status: 'ACTIVE',
      isOwner: true,
      createdBy: ownerUserId,
      updatedBy: ownerUserId,
    });
    await saveDoc(ownerRole, session);
  } else if (ownerRole.permissions.length !== PERMISSION_KEYS.length) {
    const update = Role.updateOne(
      { _id: ownerRole._id, tenantId },
      { $set: { permissions: [...PERMISSION_KEYS], updatedBy: ownerUserId } },
    );
    await (session ? update.session(session) : update);
  }

  const assignmentQuery = UserRole.findOne({ tenantId, userId: ownerUserId, roleId: ownerRole._id });
  const assignment = session ? await assignmentQuery.session(session) : await assignmentQuery;
  if (!assignment) {
    const created = new UserRole({
      tenantId,
      userId: ownerUserId,
      roleId: ownerRole._id,
      branchScope: 'ALL',
      branchIds: [],
      status: 'ACTIVE',
    });
    await saveDoc(created, session);
  }

  for (const role of RECOMMENDED) {
    const existing = await findRole(tenantId, { name: role.name }, session);
    if (existing) {
      continue;
    }
    const created = new Role({
      tenantId,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      status: 'ACTIVE',
      isOwner: false,
      createdBy: ownerUserId,
      updatedBy: ownerUserId,
    });
    await saveDoc(created, session);
  }

  for (const name of EMPLOYMENT_TYPES) {
    const query = EmploymentType.findOne({ tenantId, name });
    const existing = session ? await query.session(session) : await query;
    if (!existing) {
      await saveDoc(new EmploymentType({ tenantId, name, status: 'ACTIVE' }), session);
    }
  }

  for (const name of JOB_TITLES) {
    const query = JobTitle.findOne({ tenantId, name });
    const existing = session ? await query.session(session) : await query;
    if (!existing) {
      await saveDoc(new JobTitle({ tenantId, name, status: 'ACTIVE' }), session);
    }
  }

  const commissionQuery = CommissionRule.findOne({ tenantId, scope: 'TENANT', status: 'ACTIVE' });
  const commission = session ? await commissionQuery.session(session) : await commissionQuery;
  if (!commission) {
    await saveDoc(
      new CommissionRule({
        tenantId,
        scope: 'TENANT',
        serviceCode: '',
        serviceName: '',
        employeeId: null,
        kind: 'PERCENTAGE',
        value: 0,
        status: 'ACTIVE',
      }),
      session,
    );
  }
}

export async function cleanupTenantDefaults(tenantId: string): Promise<void> {
  await Promise.all([
    Role.deleteMany({ tenantId }),
    UserRole.deleteMany({ tenantId }),
    EmploymentType.deleteMany({ tenantId }),
    JobTitle.deleteMany({ tenantId }),
    CommissionRule.deleteMany({ tenantId }),
  ]);
}

/** Older tenants receive the owner role the first time their owner calls a tenant API. */
export async function ensureOwnerAccess(tenantId: string, userId: string): Promise<void> {
  const tenant = await Tenant.findById(tenantId).select('ownerUserId');
  if (!tenant || String(tenant.ownerUserId) !== userId) {
    return;
  }
  await seedTenantDefaults(tenantId, userId, null);
}
