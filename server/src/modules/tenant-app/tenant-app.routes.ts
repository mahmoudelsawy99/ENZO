import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadAccess } from '../access/access.middleware.js';
import { appointmentRouter } from '../appointments/appointment.routes.js';
import { queueRouter } from '../appointments/queue.routes.js';
import { accessRouter, branchRouter, commissionRouter } from '../branches/branch.routes.js';
import { customerRouter } from '../customers/customer.routes.js';
import { employeeRouter } from '../employees/employee.routes.js';
import {
  inventoryRouter,
  productCategoryRouter,
  productRouter,
  purchaseRouter,
  stockAlertRouter,
  supplierRouter,
  transferRouter,
} from '../inventory/inventory.routes.js';
import { customerPackageRouter, packageRouter } from '../packages/package.routes.js';
import { commissionReportRouter, posRouter, refundRouter, shiftRouter, transactionRouter } from '../pos/pos.routes.js';
import { reportRouter } from '../reports/report.routes.js';
import { roleRouter } from '../roles/role.routes.js';
import { serviceCategoryRouter, serviceRouter } from '../services/service.routes.js';
import { tenantUserRouter } from '../users/tenant-user.routes.js';
import { attendanceRouter, deviceRouter, leaveBalanceRouter, leaveRouter, leaveTypeRouter, payrollRouter, scheduleRouter } from '../workforce/workforce.routes.js';
import { whatsappRouter } from '../whatsapp/whatsapp.routes.js';
import { tenantBillingRouter } from '../billing/billing.routes.js';
import { requireFeature } from '../billing/entitlement.middleware.js';

/**
 * Tenant business routes. Tenant identity comes from the authenticated user.
 */
export const tenantAppRouter = Router();

tenantAppRouter.use(authenticate, loadAccess);
tenantAppRouter.use(accessRouter);
tenantAppRouter.use('/branches', branchRouter);
tenantAppRouter.use('/employees', employeeRouter);
tenantAppRouter.use('/roles', roleRouter);
tenantAppRouter.use('/users', tenantUserRouter);
tenantAppRouter.use('/commissions', commissionRouter);
tenantAppRouter.use('/services', serviceRouter);
tenantAppRouter.use('/service-categories', serviceCategoryRouter);
tenantAppRouter.use('/customers', customerRouter);
tenantAppRouter.use('/appointments', appointmentRouter);
tenantAppRouter.use('/queue', queueRouter);
tenantAppRouter.use('/packages', packageRouter);
tenantAppRouter.use('/customer-packages', customerPackageRouter);
tenantAppRouter.use('/pos', posRouter);
tenantAppRouter.use('/transactions', transactionRouter);
tenantAppRouter.use('/refunds', refundRouter);
tenantAppRouter.use('/cashier-shifts', shiftRouter);
tenantAppRouter.use('/commission-reports', commissionReportRouter);
tenantAppRouter.use('/products', requireFeature('inventory'), productRouter);
tenantAppRouter.use('/product-categories', requireFeature('inventory'), productCategoryRouter);
tenantAppRouter.use('/inventory', requireFeature('inventory'), inventoryRouter);
tenantAppRouter.use('/suppliers', requireFeature('inventory'), supplierRouter);
tenantAppRouter.use('/purchases', requireFeature('inventory'), purchaseRouter);
tenantAppRouter.use('/transfers', requireFeature('inventory'), transferRouter);
tenantAppRouter.use('/stock-alerts', requireFeature('inventory'), stockAlertRouter);
tenantAppRouter.use('/attendance', attendanceRouter);
tenantAppRouter.use('/schedules', scheduleRouter);
tenantAppRouter.use('/fingerprint-devices', deviceRouter);
tenantAppRouter.use('/leave-types', leaveTypeRouter);
tenantAppRouter.use('/leave-requests', leaveRouter);
tenantAppRouter.use('/leave-balances', leaveBalanceRouter);
tenantAppRouter.use('/payroll', requireFeature('payroll'), payrollRouter);
tenantAppRouter.use('/reports', reportRouter);
tenantAppRouter.use('/whatsapp', requireFeature('whatsapp'), whatsappRouter);
tenantAppRouter.use('/billing', tenantBillingRouter);
