import type { Request } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { readValidated } from '../../middleware/validate-request.js';
import {
  createTenant,
  getTenant,
  listTenants,
  platformDashboard,
  setTenantStatus,
  tenantForAuthenticatedUser,
  updateTenant,
} from './tenant.service.js';
import type { createTenantSchema, listTenantsSchema, tenantStatusSchema, updateTenantSchema } from './tenant.validation.js';
import type { z } from 'zod';

function idempotencyKey(req: Request): string | undefined {
  const value = req.get('Idempotency-Key')?.trim() ?? '';
  if (!value) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new HttpError(400, 'validation_error', 'The idempotency key is not valid.');
  }
  return value;
}

export const dashboardHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await platformDashboard() });
});

export const listHandler = asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listTenantsSchema>>(req);
  const result = await listTenants(query);
  res.json(result);
});

export const createHandler = asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createTenantSchema>>(req);
  const result = await createTenant(body, idempotencyKey(req));
  res.status(result.replayed ? 200 : 201).json({ data: result.tenant });
});

export const detailHandler = asyncHandler(async (req, res) => {
  const id = req.params['id'];
  if (typeof id !== 'string') {
    throw new HttpError(400, 'validation_error', 'Choose a valid record.');
  }
  res.json({ data: await getTenant(id) });
});

export const updateHandler = asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateTenantSchema>>(req);
  res.json({ data: await updateTenant(params.id, body) });
});

export const statusHandler = asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof tenantStatusSchema>>(req);
  res.json({ data: await setTenantStatus(params.id, body.status) });
});

export const ownTenantHandler = asyncHandler(async (req, res) => {
  res.json({ data: await tenantForAuthenticatedUser(req.auth?.tenantId ?? null) });
});
