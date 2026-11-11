import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import { permissionCatalog } from '../access/permissions.js';
import { accessibleBranches } from '../branches/branch.service.js';
import {
  createBranch,
  getBranch,
  listBranches,
  setBranchStatus,
  updateBranch,
} from '../branches/branch.service.js';
import {
  branchIdSchema,
  branchStatusSchema,
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
} from '../branches/branch.validation.js';
import {
  commissionConfiguration,
  deactivateServiceCommission,
  saveServiceCommission,
  saveTenantCommission,
} from '../commissions/commission.service.js';
import { z } from 'zod';
import { COMMISSION_KINDS } from '../commissions/commission.model.js';
import { objectId } from '../branches/branch.validation.js';

const money = z.number().min(0).max(10_000_000);
const commissionValue = z.object({
  kind: z.enum(COMMISSION_KINDS),
  value: money,
});

const defaultCommissionSchema = z.object({
  body: commissionValue,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const serviceCommissionSchema = z.object({
  body: commissionValue.extend({
    serviceCode: z.string().trim().min(1).max(40),
    serviceName: z.string().trim().min(2).max(120),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const serviceCommissionIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const branchRouter = Router();

branchRouter.get('/', requirePermission('branches.view'), validateBody(listBranchesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listBranchesSchema>>(req);
  res.json(await listBranches(readAccess(req), query));
}));

branchRouter.post('/', requirePermission('branches.create'), validateBody(createBranchSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createBranchSchema>>(req);
  res.status(201).json({ data: await createBranch(readAccess(req), body) });
}));

branchRouter.get('/:id', requirePermission('branches.view'), validateBody(branchIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof branchIdSchema>>(req);
  res.json({ data: await getBranch(readAccess(req), params.id) });
}));

branchRouter.put('/:id', requirePermission('branches.update'), validateBody(updateBranchSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateBranchSchema>>(req);
  res.json({ data: await updateBranch(readAccess(req), params.id, body) });
}));

branchRouter.patch('/:id/status', requirePermission('branches.disable'), validateBody(branchStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof branchStatusSchema>>(req);
  res.json({ data: await setBranchStatus(readAccess(req), params.id, body.status) });
}));

export const commissionRouter = Router();

commissionRouter.get('/', requirePermission('commissions.view'), asyncHandler(async (req, res) => {
  res.json({ data: await commissionConfiguration(readAccess(req).tenantId) });
}));

commissionRouter.put('/default', requirePermission('commissions.update'), validateBody(defaultCommissionSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof defaultCommissionSchema>>(req);
  res.json({ data: await saveTenantCommission(readAccess(req), body.kind, body.value) });
}));

commissionRouter.put('/services', requirePermission('commissions.update'), validateBody(serviceCommissionSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof serviceCommissionSchema>>(req);
  res.json({ data: await saveServiceCommission(readAccess(req), body) });
}));

commissionRouter.patch('/services/:id/status', requirePermission('commissions.update'), validateBody(serviceCommissionIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof serviceCommissionIdSchema>>(req);
  res.json({ data: await deactivateServiceCommission(readAccess(req), params.id) });
}));

export const accessRouter = Router();

accessRouter.get('/access', asyncHandler(async (req, res) => {
  const access = readAccess(req);
  res.json({
    data: {
      isOwner: access.isOwner,
      permissions: [...access.permissions],
      branchScope: access.branchScope,
      branches: await accessibleBranches(access),
    },
  });
}));

accessRouter.get('/permissions', requirePermission('roles.view'), asyncHandler(async (_req, res) => {
  res.json({ data: permissionCatalog() });
}));
