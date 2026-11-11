import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requireAnyPermission, requirePermission } from '../access/access.middleware.js';
import { customerPaymentHistory } from '../pos/pos.service.js';
import { assignPackage, customerPackages } from '../packages/package.service.js';
import { customerServiceHistory, customerVisits } from '../appointments/appointment.service.js';
import {
  addNote,
  createCustomer,
  customerSettings,
  customerStats,
  getCustomer,
  listCustomers,
  listNotes,
  setCustomerStatus,
  updateCustomer,
  updateCustomerSettings,
} from './customer.service.js';
import {
  assignPackageSchema,
  createCustomerSchema,
  customerIdSchema,
  customerNoteSchema,
  customerSettingsSchema,
  customerStatusSchema,
  listCustomersSchema,
  updateCustomerSchema,
} from './customer.validation.js';

export const customerRouter = Router();

customerRouter.get('/settings', requirePermission('customers.view'), asyncHandler(async (req, res) => {
  res.json({ data: await customerSettings(readAccess(req).tenantId) });
}));

customerRouter.put('/settings', requirePermission('customers.update'), validateBody(customerSettingsSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof customerSettingsSchema>>(req);
  res.json({ data: await updateCustomerSettings(readAccess(req), body.uniquePhone) });
}));

customerRouter.get('/', requirePermission('customers.view'), validateBody(listCustomersSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listCustomersSchema>>(req);
  res.json(await listCustomers(readAccess(req), query));
}));

customerRouter.post('/', requirePermission('customers.create'), validateBody(createCustomerSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createCustomerSchema>>(req);
  res.status(201).json({ data: await createCustomer(readAccess(req), body) });
}));

customerRouter.get('/:id/visits', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  const access = readAccess(req);
  await getCustomer(access, params.id);
  res.json(await customerVisits(access.tenantId, params.id));
}));

customerRouter.get('/:id/service-history', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  const access = readAccess(req);
  await getCustomer(access, params.id);
  res.json(await customerServiceHistory(access.tenantId, params.id));
}));

customerRouter.get('/:id/payments', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  const access = readAccess(req);
  await getCustomer(access, params.id);
  res.json(await customerPaymentHistory(access.tenantId, params.id));
}));

customerRouter.get('/:id/stats', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  res.json({ data: await customerStats(readAccess(req), params.id) });
}));

customerRouter.get('/:id/notes', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  res.json({ data: await listNotes(readAccess(req), params.id) });
}));

customerRouter.post('/:id/notes', requirePermission('customers.notes.create'), validateBody(customerNoteSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof customerNoteSchema>>(req);
  res.status(201).json({ data: await addNote(readAccess(req), params.id, body.content) });
}));

customerRouter.get('/:id/packages', requirePermission('customer-packages.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  res.json({ data: await customerPackages(readAccess(req), params.id) });
}));

customerRouter.post(
  '/:id/packages',
  requireAnyPermission('packages.assign', 'customer-packages.assign'),
  validateBody(assignPackageSchema),
  asyncHandler(async (req, res) => {
    const { body, params } = readValidated<z.infer<typeof assignPackageSchema>>(req);
    res.status(201).json({ data: await assignPackage(readAccess(req), params.id, body.packageTemplateId) });
  }),
);

customerRouter.get('/:id', requirePermission('customers.view'), validateBody(customerIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof customerIdSchema>>(req);
  res.json({ data: await getCustomer(readAccess(req), params.id) });
}));

customerRouter.put('/:id', requirePermission('customers.update'), validateBody(updateCustomerSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateCustomerSchema>>(req);
  res.json({ data: await updateCustomer(readAccess(req), params.id, body) });
}));

customerRouter.patch('/:id/status', requirePermission('customers.disable'), validateBody(customerStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof customerStatusSchema>>(req);
  res.json({ data: await setCustomerStatus(readAccess(req), params.id, body.status) });
}));
