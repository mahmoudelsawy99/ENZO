import type { IconName } from '../icons/icon-name';

export interface NavItem {
  path: string;
  labelKey: string;
  descriptionKey: string;
  icon: IconName;
  /** Display hint only. The API remains the authority for access. */
  permission?: string;
  anyPermissions?: readonly string[];
  feature?: string;
  ownerOnly?: boolean;
}

export interface NavGroup {
  labelKey: string;
  items: readonly NavItem[];
}

/**
 * Tenant navigation. Items with a permission are hidden when the signed-in user lacks it.
 * Hiding a menu is not a security control. The API enforces every operation.
 */
/** A cashier who cannot book, manage people, or open reports does not get the dashboard. */
export const DASHBOARD_ACCESS = ['appointments.view', 'users.view', 'branches.view', 'employees.view', 'reports.view'] as const;

export function seesDashboard(can: (key: string) => boolean): boolean {
  return DASHBOARD_ACCESS.some((key) => can(key));
}

export function staffHome(can: (key: string) => boolean): string {
  if (seesDashboard(can)) {
    return '/dashboard';
  }
  if (can('queue.view')) {
    return '/queue';
  }
  if (can('pos.view')) {
    return '/pos';
  }
  return '/account';
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelKey: 'navGroup.operations',
    items: [
      { path: 'dashboard', labelKey: 'nav.dashboard', descriptionKey: 'pages.dashboard', icon: 'dashboard', anyPermissions: DASHBOARD_ACCESS },
      { path: 'appointments', labelKey: 'nav.appointments', descriptionKey: 'pages.appointments', icon: 'calendar', permission: 'appointments.view' },
      { path: 'queue', labelKey: 'nav.queue', descriptionKey: 'pages.queue', icon: 'queue', permission: 'queue.view' },
      { path: 'customers', labelKey: 'nav.customers', descriptionKey: 'pages.customers', icon: 'users', permission: 'customers.view' },
      { path: 'pos', labelKey: 'nav.pos', descriptionKey: 'pages.pos', icon: 'card', permission: 'pos.view' },
      { path: 'transactions', labelKey: 'nav.transactions', descriptionKey: 'pages.transactions', icon: 'receipt', permission: 'transactions.view' },
      { path: 'refunds', labelKey: 'nav.refunds', descriptionKey: 'pages.refunds', icon: 'alert', permission: 'refunds.view' },
      { path: 'shifts', labelKey: 'nav.shifts', descriptionKey: 'pages.shifts', icon: 'wallet', permission: 'cashier-shifts.view' },
      { path: 'commissions', labelKey: 'nav.commissions', descriptionKey: 'pages.commissions', icon: 'banknote', permission: 'commissions.view' },
    ],
  },
  {
    labelKey: 'navGroup.catalog',
    items: [
      { path: 'services', labelKey: 'nav.services', descriptionKey: 'pages.services', icon: 'scissors', permission: 'services.view' },
      { path: 'packages', labelKey: 'nav.packages', descriptionKey: 'pages.packages', icon: 'package', permission: 'packages.view' },
    ],
  },
  {
    labelKey: 'navGroup.people',
    items: [
      { path: 'employees', labelKey: 'nav.employees', descriptionKey: 'pages.employees', icon: 'users', permission: 'employees.view' },
      { path: 'attendance', labelKey: 'nav.attendance', descriptionKey: 'pages.attendance', icon: 'clock', permission: 'attendance.view' },
      { path: 'leaves', labelKey: 'nav.leaves', descriptionKey: 'pages.leaves', icon: 'leave', permission: 'leave-requests.view' },
      { path: 'payroll', labelKey: 'nav.payroll', descriptionKey: 'pages.payroll', icon: 'banknote', permission: 'payroll.view', feature: 'payroll' },
    ],
  },
  {
    labelKey: 'navGroup.supply',
    items: [
      { path: 'inventory', labelKey: 'nav.inventory', descriptionKey: 'pages.inventory', icon: 'boxes', permission: 'inventory.view', feature: 'inventory' },
      { path: 'suppliers', labelKey: 'nav.suppliers', descriptionKey: 'pages.suppliers', icon: 'truck', permission: 'suppliers.view', feature: 'inventory' },
      { path: 'purchases', labelKey: 'nav.purchases', descriptionKey: 'pages.purchases', icon: 'cart', permission: 'purchases.view', feature: 'inventory' },
      { path: 'transfers', labelKey: 'stock.transfers', descriptionKey: 'stock.transfersDescription', icon: 'boxes', permission: 'transfers.view', feature: 'inventory' },
    ],
  },
  {
    labelKey: 'navGroup.organization',
    items: [
      { path: 'branches', labelKey: 'nav.branches', descriptionKey: 'pages.branches', icon: 'building', permission: 'branches.view' },
      { path: 'users', labelKey: 'nav.users', descriptionKey: 'pages.users', icon: 'user', permission: 'users.view' },
      { path: 'reports', labelKey: 'nav.reports', descriptionKey: 'pages.reports', icon: 'chart', anyPermissions: ['reports.view', 'reports.sales', 'reports.employees', 'reports.customers', 'reports.inventory', 'reports.attendance', 'reports.payroll', 'reports.cashier'] },
      { path: 'whatsapp', labelKey: 'nav.whatsapp', descriptionKey: 'pages.whatsapp', icon: 'bell', anyPermissions: ['whatsapp.settings.view', 'whatsapp.messages.view', 'notifications.settings.manage'], feature: 'whatsapp' },
      { path: 'billing', labelKey: 'nav.billing', descriptionKey: 'pages.billing', icon: 'card', ownerOnly: true },
      { path: 'roles', labelKey: 'nav.roles', descriptionKey: 'pages.roles', icon: 'shield', permission: 'roles.view' },
      { path: 'settings', labelKey: 'nav.settings', descriptionKey: 'pages.settings', icon: 'settings', permission: 'workforce.manage' },
    ],
  },
];

export const PLATFORM_NAV: readonly NavGroup[] = [
  {
    labelKey: 'navGroup.platform',
    items: [
      {
        path: 'platform',
        labelKey: 'platform.dashboard',
        descriptionKey: 'platform.dashboardDescription',
        icon: 'dashboard',
      },
      {
        path: 'platform/tenants',
        labelKey: 'platform.tenants',
        descriptionKey: 'platform.tenantsDescription',
        icon: 'building',
      },
      {
        path: 'platform/billing',
        labelKey: 'platform.billing',
        descriptionKey: 'platform.billingDescription',
        icon: 'card',
      },
    ],
  },
];

export function groupKeyForPath(path: string): string {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.path === path))?.labelKey ?? '';
}
