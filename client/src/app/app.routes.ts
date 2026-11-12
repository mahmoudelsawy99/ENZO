import { Routes } from '@angular/router';
import { authGuard, guestGuard, superAdminGuard, tenantGuard } from './core/auth/auth.guard';
import { NAV_GROUPS } from './core/navigation/navigation';
import { Shell } from './layout/shell/shell';

/** Loads the page registered for a tenant navigation path. Checkout, sales, refunds, shifts, and commissions are included. */
function tenantPage(path: string) {
  if (path === 'dashboard') return import('./features/dashboard/dashboard.page').then((module) => module.DashboardPage);
  if (path === 'branches') return import('./features/branches/branch-list.page').then((module) => module.BranchListPage);
  if (path === 'employees') return import('./features/employees/employee-list.page').then((module) => module.EmployeeListPage);
  if (path === 'roles') return import('./features/roles/role-list.page').then((module) => module.RoleListPage);
  if (path === 'users') return import('./features/users/user-list.page').then((module) => module.UserListPage);
  if (path === 'settings') return import('./features/settings/workforce-settings.page').then((module) => module.WorkforceSettingsPage);
  if (path === 'services') return import('./features/services/service-list.page').then((module) => module.ServiceListPage);
  if (path === 'customers') return import('./features/customers/customer-list.page').then((module) => module.CustomerListPage);
  if (path === 'packages') return import('./features/packages/package-list.page').then((module) => module.PackageListPage);
  if (path === 'appointments') return import('./features/appointments/appointment-list.page').then((module) => module.AppointmentListPage);
  if (path === 'queue') return import('./features/queue/queue-board.page').then((module) => module.QueueBoardPage);
  if (path === 'pos') return import('./features/pos/pos-list.page').then((module) => module.PosListPage);
  if (path === 'transactions') return import('./features/transactions/transaction-list.page').then((module) => module.TransactionListPage);
  if (path === 'refunds') return import('./features/refunds/refund-list.page').then((module) => module.RefundListPage);
  if (path === 'shifts') return import('./features/cashier-shifts/shift-board.page').then((module) => module.ShiftBoardPage);
  if (path === 'commissions') return import('./features/commissions/commission-summary.page').then((module) => module.CommissionSummaryPage);
  if (path === 'inventory') return import('./features/inventory/stock-board.page').then((module) => module.StockBoardPage);
  if (path === 'suppliers') return import('./features/inventory/supplier-list.page').then((module) => module.SupplierListPage);
  if (path === 'purchases') return import('./features/inventory/purchase-list.page').then((module) => module.PurchaseListPage);
  if (path === 'transfers') return import('./features/inventory/transfer-list.page').then((module) => module.TransferListPage);
  if (path === 'attendance') return import('./features/workforce/attendance-board.page').then((module) => module.AttendanceBoardPage);
  if (path === 'leaves') return import('./features/workforce/leave-requests.page').then((module) => module.LeaveRequestsPage);
  if (path === 'payroll') return import('./features/workforce/payroll-board.page').then((module) => module.PayrollBoardPage);
  if (path === 'reports') return import('./features/reports/reports.page').then((module) => module.ReportsPage);
  if (path === 'whatsapp') return import('./features/whatsapp/whatsapp.page').then((module) => module.WhatsAppPage);
  if (path === 'billing') return import('./features/billing/billing.page').then((module) => module.BillingPage);
  return import('./features/placeholder/placeholder.page').then((module) => module.PlaceholderPage);
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((module) => module.LoginPage),
    data: { titleKey: 'auth.signIn' },
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.page').then((module) => module.ForgotPasswordPage),
    data: { titleKey: 'auth.forgotTitle' },
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/reset-password.page').then((module) => module.ResetPasswordPage),
    data: { titleKey: 'auth.resetTitle' },
  },
  {
    path: '',
    canActivate: [authGuard],
    component: Shell,
    children: [
      {
        path: 'account',
        loadComponent: () => import('./features/account/account.page').then((module) => module.AccountPage),
        data: { titleKey: 'account.title' },
      },
      {
        path: 'platform',
        canActivate: [superAdminGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/super-admin/dashboard/platform-dashboard.page').then((module) => module.PlatformDashboardPage),
            data: { titleKey: 'platform.dashboard' },
          },
          {
            path: 'tenants/new',
            loadComponent: () => import('./features/super-admin/tenants/tenant-wizard.page').then((module) => module.TenantWizardPage),
            data: { titleKey: 'platform.createTenant' },
          },
          {
            path: 'tenants/:id/edit',
            loadComponent: () => import('./features/super-admin/tenants/tenant-edit.page').then((module) => module.TenantEditPage),
            data: { titleKey: 'platform.editTenant' },
          },
          {
            path: 'tenants/:id',
            loadComponent: () => import('./features/super-admin/tenants/tenant-detail.page').then((module) => module.TenantDetailPage),
            data: { titleKey: 'platform.tenantDetails' },
          },
          {
            path: 'tenants',
            loadComponent: () => import('./features/super-admin/tenants/tenant-list.page').then((module) => module.TenantListPage),
            data: { titleKey: 'platform.tenants' },
          },
          {
            path: 'billing',
            loadComponent: () => import('./features/super-admin/billing/platform-billing.page').then((module) => module.PlatformBillingPage),
            data: { titleKey: 'platform.billing' },
          },
        ],
      },
      {
        path: '',
        canActivate: [tenantGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          ...NAV_GROUPS.flatMap((group) =>
            group.items.map((item) => ({
              path: item.path,
              loadComponent: () => tenantPage(item.path),
              data: {
                titleKey: item.labelKey,
                descriptionKey: item.descriptionKey,
                groupKey: group.labelKey,
              },
            })),
          ),
          { path: 'branches/new', loadComponent: () => import('./features/branches/branch-form.page').then((module) => module.BranchFormPage), data: { titleKey: 'branches.add' } },
          { path: 'branches/:id/edit', loadComponent: () => import('./features/branches/branch-form.page').then((module) => module.BranchFormPage), data: { titleKey: 'branches.edit' } },
          { path: 'branches/:id', loadComponent: () => import('./features/branches/branch-detail.page').then((module) => module.BranchDetailPage), data: { titleKey: 'branches.view' } },
          { path: 'employees/new', loadComponent: () => import('./features/employees/employee-form.page').then((module) => module.EmployeeFormPage), data: { titleKey: 'employees.add' } },
          { path: 'employees/:id/edit', loadComponent: () => import('./features/employees/employee-form.page').then((module) => module.EmployeeFormPage), data: { titleKey: 'employees.edit' } },
          { path: 'employees/:id', loadComponent: () => import('./features/employees/employee-detail.page').then((module) => module.EmployeeDetailPage), data: { titleKey: 'employees.view' } },
          { path: 'roles/new', loadComponent: () => import('./features/roles/role-form.page').then((module) => module.RoleFormPage), data: { titleKey: 'roles.add' } },
          { path: 'roles/:id/edit', loadComponent: () => import('./features/roles/role-form.page').then((module) => module.RoleFormPage), data: { titleKey: 'roles.edit' } },
          { path: 'users/new', loadComponent: () => import('./features/users/user-form.page').then((module) => module.UserFormPage), data: { titleKey: 'users.add' } },
          { path: 'services/categories', loadComponent: () => import('./features/services/service-categories.page').then((module) => module.ServiceCategoriesPage), data: { titleKey: 'categories.title' } },
          { path: 'services/new', loadComponent: () => import('./features/services/service-form.page').then((module) => module.ServiceFormPage), data: { titleKey: 'services.add' } },
          { path: 'services/:id/edit', loadComponent: () => import('./features/services/service-form.page').then((module) => module.ServiceFormPage), data: { titleKey: 'services.edit' } },
          { path: 'services/:id', loadComponent: () => import('./features/services/service-detail.page').then((module) => module.ServiceDetailPage), data: { titleKey: 'services.view' } },
          { path: 'customers/new', loadComponent: () => import('./features/customers/customer-form.page').then((module) => module.CustomerFormPage), data: { titleKey: 'customers.add' } },
          { path: 'customers/:id/edit', loadComponent: () => import('./features/customers/customer-form.page').then((module) => module.CustomerFormPage), data: { titleKey: 'customers.edit' } },
          { path: 'customers/:id', loadComponent: () => import('./features/customers/customer-profile.page').then((module) => module.CustomerProfilePage), data: { titleKey: 'customers.view' } },
          { path: 'packages/new', loadComponent: () => import('./features/packages/package-form.page').then((module) => module.PackageFormPage), data: { titleKey: 'packages.add' } },
          { path: 'packages/:id/edit', loadComponent: () => import('./features/packages/package-form.page').then((module) => module.PackageFormPage), data: { titleKey: 'packages.edit' } },
          { path: 'packages/:id', loadComponent: () => import('./features/packages/package-detail.page').then((module) => module.PackageDetailPage), data: { titleKey: 'packages.view' } },
          { path: 'appointments/new', loadComponent: () => import('./features/appointments/appointment-form.page').then((module) => module.AppointmentFormPage), data: { titleKey: 'appointments.add' } },
          { path: 'appointments/:id/edit', loadComponent: () => import('./features/appointments/appointment-form.page').then((module) => module.AppointmentFormPage), data: { titleKey: 'appointments.edit' } },
          { path: 'appointments/:id', loadComponent: () => import('./features/appointments/appointment-detail.page').then((module) => module.AppointmentDetailPage), data: { titleKey: 'appointments.view' } },
          { path: 'queue/walk-in', loadComponent: () => import('./features/queue/walk-in.page').then((module) => module.WalkInPage), data: { titleKey: 'queue.walkIn' } },
          { path: 'inventory/products/new', loadComponent: () => import('./features/inventory/product-form.page').then((module) => module.ProductFormPage), data: { titleKey: 'stock.addProduct' } },
          { path: 'inventory/products/:id', loadComponent: () => import('./features/inventory/product-form.page').then((module) => module.ProductFormPage), data: { titleKey: 'stock.editProduct' } },
          { path: 'inventory/products', loadComponent: () => import('./features/inventory/product-list.page').then((module) => module.ProductListPage), data: { titleKey: 'stock.products' } },
          { path: 'inventory/categories', loadComponent: () => import('./features/inventory/product-categories.page').then((module) => module.ProductCategoriesPage), data: { titleKey: 'stock.categories' } },
          { path: 'inventory/stock/:productId', loadComponent: () => import('./features/inventory/stock-detail.page').then((module) => module.StockDetailPage), data: { titleKey: 'stock.history' } },
          { path: 'inventory/alerts', loadComponent: () => import('./features/inventory/stock-alerts.page').then((module) => module.StockAlertsPage), data: { titleKey: 'stock.alerts' } },
          { path: 'suppliers/new', loadComponent: () => import('./features/inventory/supplier-detail.page').then((module) => module.SupplierDetailPage), data: { titleKey: 'stock.addSupplier' } },
          { path: 'suppliers/:id', loadComponent: () => import('./features/inventory/supplier-detail.page').then((module) => module.SupplierDetailPage), data: { titleKey: 'stock.supplier' } },
          { path: 'purchases/new', loadComponent: () => import('./features/inventory/purchase-form.page').then((module) => module.PurchaseFormPage), data: { titleKey: 'stock.addPurchase' } },
          { path: 'purchases/:id', loadComponent: () => import('./features/inventory/purchase-detail.page').then((module) => module.PurchaseDetailPage), data: { titleKey: 'stock.purchase' } },
          { path: 'transfers/new', loadComponent: () => import('./features/inventory/transfer.page').then((module) => module.TransferPage), data: { titleKey: 'stock.addTransfer' } },
          { path: 'transfers/:id', loadComponent: () => import('./features/inventory/transfer.page').then((module) => module.TransferPage), data: { titleKey: 'stock.transfer' } },
          { path: 'attendance/daily', loadComponent: () => import('./features/workforce/attendance-daily.page').then((module) => module.AttendanceDailyPage), data: { titleKey: 'work.daily' } },
          { path: 'attendance/history', loadComponent: () => import('./features/workforce/attendance-history.page').then((module) => module.AttendanceHistoryPage), data: { titleKey: 'work.history' } },
          { path: 'attendance/manual', loadComponent: () => import('./features/workforce/attendance-manual.page').then((module) => module.AttendanceManualPage), data: { titleKey: 'work.manual' } },
          { path: 'attendance/schedules', loadComponent: () => import('./features/workforce/schedules.page').then((module) => module.SchedulesPage), data: { titleKey: 'work.schedules' } },
          { path: 'attendance/rules', loadComponent: () => import('./features/workforce/attendance-rules.page').then((module) => module.AttendanceRulesPage), data: { titleKey: 'work.rules' } },
          { path: 'attendance/devices', loadComponent: () => import('./features/workforce/devices.page').then((module) => module.DevicesPage), data: { titleKey: 'work.devices' } },
          { path: 'attendance/device-logs', loadComponent: () => import('./features/workforce/device-logs.page').then((module) => module.DeviceLogsPage), data: { titleKey: 'work.logs' } },
          { path: 'leaves/types', loadComponent: () => import('./features/workforce/leave-types.page').then((module) => module.LeaveTypesPage), data: { titleKey: 'work.leaveTypes' } },
          { path: 'leaves/balances', loadComponent: () => import('./features/workforce/leave-balances.page').then((module) => module.LeaveBalancesPage), data: { titleKey: 'work.balances' } },
          { path: 'payroll/generate', loadComponent: () => import('./features/workforce/payroll-generate.page').then((module) => module.PayrollGeneratePage), data: { titleKey: 'work.generate' } },
          { path: 'payroll/:id/payslip', loadComponent: () => import('./features/workforce/payslip.page').then((module) => module.PayslipPage), data: { titleKey: 'work.payslip' } },
          { path: 'payroll/:id', loadComponent: () => import('./features/workforce/payroll-detail.page').then((module) => module.PayrollDetailPage), data: { titleKey: 'work.review' } },
          { path: 'pos/new', loadComponent: () => import('./features/pos/pos-order.page').then((module) => module.PosOrderPage), data: { titleKey: 'finance.newOrder' } },
          { path: 'pos/:appointmentId', loadComponent: () => import('./features/pos/pos-checkout.page').then((module) => module.PosCheckoutPage), data: { titleKey: 'finance.checkoutTitle' } },
          { path: 'transactions/:id', loadComponent: () => import('./features/transactions/transaction-detail.page').then((module) => module.TransactionDetailPage), data: { titleKey: 'finance.receipt' } },
          { path: 'users/:id/edit', loadComponent: () => import('./features/users/user-form.page').then((module) => module.UserFormPage), data: { titleKey: 'users.edit' } },
          {
            path: 'preview',
            loadComponent: () => import('./features/preview/preview.page').then((module) => module.PreviewPage),
            data: {
              titleKey: 'preview.title',
              descriptionKey: 'preview.description',
              groupKey: 'nav.settings',
            },
          },
          { path: '**', redirectTo: 'dashboard' },
        ],
      },
    ],
  },
];
