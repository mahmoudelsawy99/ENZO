import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import { createRole, duplicateRole, getRole, listRoles, replaceUserRoles, rolesForUser, setRoleStatus, updateRole } from './role.service.js';
import {
  assignRolesSchema,
  createRoleSchema,
  duplicateRoleSchema,
  listRolesSchema,
  roleIdSchema,
  roleStatusSchema,
  updateRoleSchema,
} from './role.validation.js';

export const roleRouter = Router();

roleRouter.get('/', requirePermission('roles.view'), validateBody(listRolesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listRolesSchema>>(req);
  res.json(await listRoles(readAccess(req), query));
}));

roleRouter.post('/', requirePermission('roles.create'), validateBody(createRoleSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createRoleSchema>>(req);
  res.status(201).json({ data: await createRole(readAccess(req), body) });
}));

roleRouter.get('/:id', requirePermission('roles.view'), validateBody(roleIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof roleIdSchema>>(req);
  res.json({ data: await getRole(readAccess(req), params.id) });
}));

roleRouter.put('/:id', requirePermission('roles.update'), validateBody(updateRoleSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateRoleSchema>>(req);
  res.json({ data: await updateRole(readAccess(req), params.id, body) });
}));

roleRouter.patch('/:id/status', requirePermission('roles.disable'), validateBody(roleStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof roleStatusSchema>>(req);
  res.json({ data: await setRoleStatus(readAccess(req), params.id, body.status) });
}));

roleRouter.post('/:id/duplicate', requirePermission('roles.create'), validateBody(duplicateRoleSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof duplicateRoleSchema>>(req);
  res.status(201).json({ data: await duplicateRole(readAccess(req), params.id, body.name) });
}));

export const userRoleRouter = Router({ mergeParams: true });

userRoleRouter.get('/', requirePermission('users.view'), validateBody(roleIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof roleIdSchema>>(req);
  res.json({ data: await rolesForUser(readAccess(req), params.id) });
}));

userRoleRouter.post('/', requirePermission('users.assign-roles'), validateBody(assignRolesSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof assignRolesSchema>>(req);
  res.json({ data: await replaceUserRoles(readAccess(req), params.id, body.assignments) });
}));
