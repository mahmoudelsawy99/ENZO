import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import { userRoleRouter } from '../roles/role.routes.js';
import {
  createTenantUser,
  getTenantUser,
  linkUserEmployee,
  listTenantUsers,
  resetTenantUserPassword,
  revokeTenantUserSessions,
  setTenantUserStatus,
  updateTenantUser,
} from './tenant-user.service.js';
import {
  createUserSchema,
  linkEmployeeSchema,
  listUsersSchema,
  resetUserPasswordSchema,
  updateUserSchema,
  userIdSchema,
  userStatusSchema,
} from './tenant-user.validation.js';

export const tenantUserRouter = Router();

tenantUserRouter.get('/', requirePermission('users.view'), validateBody(listUsersSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listUsersSchema>>(req);
  res.json(await listTenantUsers(readAccess(req), query));
}));

tenantUserRouter.post('/', requirePermission('users.create'), validateBody(createUserSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createUserSchema>>(req);
  res.status(201).json({ data: await createTenantUser(readAccess(req), body) });
}));

tenantUserRouter.get('/:id', requirePermission('users.view'), validateBody(userIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof userIdSchema>>(req);
  res.json({ data: await getTenantUser(readAccess(req), params.id) });
}));

tenantUserRouter.put('/:id', requirePermission('users.update'), validateBody(updateUserSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateUserSchema>>(req);
  res.json({ data: await updateTenantUser(readAccess(req), params.id, body) });
}));

tenantUserRouter.patch('/:id/status', requirePermission('users.disable'), validateBody(userStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof userStatusSchema>>(req);
  res.json({ data: await setTenantUserStatus(readAccess(req), params.id, body.status) });
}));

tenantUserRouter.post('/:id/reset-password', requirePermission('users.reset-password'), validateBody(resetUserPasswordSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof resetUserPasswordSchema>>(req);
  await resetTenantUserPassword(readAccess(req), params.id, body.password);
  res.status(204).send();
}));

tenantUserRouter.post('/:id/sessions/revoke', requirePermission('users.reset-password'), validateBody(userIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof userIdSchema>>(req);
  await revokeTenantUserSessions(readAccess(req), params.id);
  res.status(204).send();
}));

tenantUserRouter.put('/:id/employee', requirePermission('users.update'), validateBody(linkEmployeeSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof linkEmployeeSchema>>(req);
  res.json({ data: await linkUserEmployee(readAccess(req), params.id, body.employeeId) });
}));

tenantUserRouter.use('/:id/roles', userRoleRouter);
