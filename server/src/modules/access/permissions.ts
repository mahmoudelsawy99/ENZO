/**
 * Central permission catalog. Tenant roles choose from these keys.
 * Super Admin access stays on platform routes and is not a tenant role.
 */
export const PERMISSIONS = [
  { module: 'branches', key: 'branches.view' },
  { module: 'branches', key: 'branches.create' },
  { module: 'branches', key: 'branches.update' },
  { module: 'branches', key: 'branches.disable' },
  { module: 'employees', key: 'employees.view' },
  { module: 'employees', key: 'employees.create' },
  { module: 'employees', key: 'employees.update' },
  { module: 'employees', key: 'employees.disable' },
  { module: 'employees', key: 'employees.assign-branches' },
  { module: 'appointments', key: 'appointments.view' },
  { module: 'appointments', key: 'appointments.create' },
  { module: 'appointments', key: 'appointments.update' },
  { module: 'appointments', key: 'appointments.confirm' },
  { module: 'appointments', key: 'appointments.check-in' },
  { module: 'appointments', key: 'appointments.cancel' },
  { module: 'appointments', key: 'appointments.reschedule' },
  { module: 'appointments', key: 'appointments.mark-no-show' },
  { module: 'queue', key: 'queue.view' },
  { module: 'queue', key: 'queue.create' },
  { module: 'queue', key: 'queue.reorder' },
  { module: 'queue', key: 'queue.start-service' },
  { module: 'queue', key: 'queue.complete-service' },
  { module: 'pos', key: 'pos.view' },
  { module: 'pos', key: 'pos.checkout' },
  { module: 'pos', key: 'pos.apply-discount' },
  { module: 'transactions', key: 'transactions.view' },
  { module: 'transactions', key: 'transactions.create' },
  { module: 'payments', key: 'payments.view' },
  { module: 'payments', key: 'payments.create' },
  { module: 'payments', key: 'payments.refund' },
  { module: 'payments', key: 'payments.apply-discount' },
  { module: 'refunds', key: 'refunds.view' },
  { module: 'refunds', key: 'refunds.create' },
  { module: 'refunds', key: 'refunds.approve' },
  { module: 'cashier-shifts', key: 'cashier-shifts.view' },
  { module: 'cashier-shifts', key: 'cashier-shifts.open' },
  { module: 'cashier-shifts', key: 'cashier-shifts.close' },
  { module: 'tips', key: 'tips.view' },
  { module: 'tips', key: 'tips.manage' },
  { module: 'inventory', key: 'inventory.view' },
  { module: 'inventory', key: 'inventory.create' },
  { module: 'inventory', key: 'inventory.update' },
  { module: 'inventory', key: 'inventory.manage' },
  { module: 'inventory', key: 'inventory.adjust' },
  { module: 'products', key: 'products.view' },
  { module: 'products', key: 'products.create' },
  { module: 'products', key: 'products.update' },
  { module: 'products', key: 'products.deactivate' },
  { module: 'suppliers', key: 'suppliers.view' },
  { module: 'suppliers', key: 'suppliers.manage' },
  { module: 'purchases', key: 'purchases.view' },
  { module: 'purchases', key: 'purchases.create' },
  { module: 'purchases', key: 'purchases.receive' },
  { module: 'purchases', key: 'purchases.pay' },
  { module: 'transfers', key: 'transfers.view' },
  { module: 'transfers', key: 'transfers.create' },
  { module: 'transfers', key: 'transfers.send' },
  { module: 'transfers', key: 'transfers.receive' },
  { module: 'stock-alerts', key: 'stock-alerts.view' },
  { module: 'stock-alerts', key: 'stock-alerts.manage' },
  { module: 'reports', key: 'reports.view' },
  { module: 'reports', key: 'reports.sales' },
  { module: 'reports', key: 'reports.employees' },
  { module: 'reports', key: 'reports.customers' },
  { module: 'reports', key: 'reports.inventory' },
  { module: 'reports', key: 'reports.attendance' },
  { module: 'reports', key: 'reports.payroll' },
  { module: 'reports', key: 'reports.cashier' },
  { module: 'reports', key: 'reports.export' },
  { module: 'roles', key: 'roles.view' },
  { module: 'roles', key: 'roles.create' },
  { module: 'roles', key: 'roles.update' },
  { module: 'roles', key: 'roles.disable' },
  { module: 'users', key: 'users.view' },
  { module: 'users', key: 'users.create' },
  { module: 'users', key: 'users.update' },
  { module: 'users', key: 'users.disable' },
  { module: 'users', key: 'users.assign-roles' },
  { module: 'users', key: 'users.reset-password' },
  { module: 'commissions', key: 'commissions.view' },
  { module: 'commissions', key: 'commissions.update' },
  { module: 'workforce', key: 'workforce.manage' },
  { module: 'services', key: 'services.view' },
  { module: 'services', key: 'services.create' },
  { module: 'services', key: 'services.update' },
  { module: 'services', key: 'services.disable' },
  { module: 'service-categories', key: 'service-categories.view' },
  { module: 'service-categories', key: 'service-categories.create' },
  { module: 'service-categories', key: 'service-categories.update' },
  { module: 'customers', key: 'customers.view' },
  { module: 'customers', key: 'customers.create' },
  { module: 'customers', key: 'customers.update' },
  { module: 'customers', key: 'customers.disable' },
  { module: 'customers', key: 'customers.notes.create' },
  { module: 'packages', key: 'packages.view' },
  { module: 'packages', key: 'packages.create' },
  { module: 'packages', key: 'packages.update' },
  { module: 'packages', key: 'packages.disable' },
  { module: 'packages', key: 'packages.assign' },
  { module: 'customer-packages', key: 'customer-packages.view' },
  { module: 'customer-packages', key: 'customer-packages.assign' },
  { module: 'attendance', key: 'attendance.view' },
  { module: 'attendance', key: 'attendance.manage' },
  { module: 'attendance', key: 'attendance.manual-entry' },
  { module: 'attendance', key: 'attendance.correct' },
  { module: 'attendance', key: 'attendance.rules.manage' },
  { module: 'schedules', key: 'schedules.view' },
  { module: 'schedules', key: 'schedules.manage' },
  { module: 'fingerprint-devices', key: 'fingerprint-devices.view' },
  { module: 'fingerprint-devices', key: 'fingerprint-devices.manage' },
  { module: 'fingerprint-devices', key: 'fingerprint-devices.sync' },
  { module: 'leave-types', key: 'leave-types.manage' },
  { module: 'leave-requests', key: 'leave-requests.view' },
  { module: 'leave-requests', key: 'leave-requests.create' },
  { module: 'leave-requests', key: 'leave-requests.approve' },
  { module: 'leave-balances', key: 'leave-balances.view' },
  { module: 'leave-balances', key: 'leave-balances.manage' },
  { module: 'payroll', key: 'payroll.view' },
  { module: 'payroll', key: 'payroll.generate' },
  { module: 'payroll', key: 'payroll.review' },
  { module: 'payroll', key: 'payroll.approve' },
  { module: 'payroll', key: 'payroll.pay' },
  { module: 'payroll', key: 'payroll.adjust' },
  { module: 'whatsapp', key: 'whatsapp.settings.view' },
  { module: 'whatsapp', key: 'whatsapp.settings.manage' },
  { module: 'whatsapp', key: 'whatsapp.messages.view' },
  { module: 'whatsapp', key: 'whatsapp.messages.send' },
  { module: 'whatsapp', key: 'whatsapp.templates.manage' },
  { module: 'whatsapp', key: 'whatsapp.webhooks.manage' },
  { module: 'notifications', key: 'notifications.settings.manage' },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((item) => item.key);

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

const permissionSet = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionSet.has(value);
}

export interface PermissionModule {
  module: string;
  permissions: PermissionKey[];
}

export function permissionCatalog(): PermissionModule[] {
  const modules: PermissionModule[] = [];
  for (const item of PERMISSIONS) {
    const current = modules.find((entry) => entry.module === item.module);
    if (current) {
      current.permissions.push(item.key);
    } else {
      modules.push({ module: item.module, permissions: [item.key] });
    }
  }
  return modules;
}
