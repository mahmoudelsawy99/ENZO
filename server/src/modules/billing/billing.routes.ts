import { Router } from 'express';
import type { z } from 'zod';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { readAccess } from '../access/access.middleware.js';
import { enqueueJob, runDueJobs } from '../jobs/job.service.js';
import {
  assignSubscription,
  createInvoice,
  getInvoice,
  listInvoices,
  listPlans,
  listSubscriptions,
  recordPayment,
  savePlan,
  subscriptionForTenant,
  updateSubscription,
} from './billing.service.js';
import { resolveEntitlement } from './entitlement.service.js';
import { renderInvoice } from './invoice.export.js';
import { assignSchema, idSchema, invoiceSchema, jobSchema, listSchema, paymentSchema, planUpdateSchema, subscriptionUpdateSchema } from './billing.validation.js';

function requireOwner(req: Parameters<typeof readAccess>[0]): void {
  if (!readAccess(req).isOwner) {
    throw new HttpError(403, 'forbidden', 'Only the shop owner can view the ENZO subscription.');
  }
}

export const platformBillingRouter = Router();

platformBillingRouter.get('/plans', asyncHandler(async (_req, res) => {
  res.json({ data: await listPlans() });
}));

platformBillingRouter.put('/plans/:id', validateBody(planUpdateSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof planUpdateSchema>>(req);
  res.json({ data: await savePlan({ ...body, id: params.id }) });
}));

platformBillingRouter.get('/subscriptions', validateBody(listSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listSchema>>(req);
  res.json({ data: await listSubscriptions(query.status) });
}));

platformBillingRouter.post('/subscriptions', validateBody(assignSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof assignSchema>>(req);
  res.status(201).json({ data: await assignSubscription(req.auth?.userId ?? '', body) });
}));

platformBillingRouter.patch('/subscriptions/:id', validateBody(subscriptionUpdateSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof subscriptionUpdateSchema>>(req);
  res.json({ data: await updateSubscription(req.auth?.userId ?? '', params.id, body) });
}));

platformBillingRouter.get('/invoices', asyncHandler(async (_req, res) => {
  res.json({ data: await listInvoices(null) });
}));

platformBillingRouter.post('/invoices', validateBody(invoiceSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof invoiceSchema>>(req);
  res.status(201).json({ data: await createInvoice(body) });
}));

platformBillingRouter.post('/invoices/:id/payments', validateBody(paymentSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof paymentSchema>>(req);
  res.status(201).json({ data: await recordPayment(req.auth?.userId ?? '', params.id, body) });
}));

platformBillingRouter.get('/invoices/:id/download', validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params, query } = readValidated<z.infer<typeof idSchema>>(req);
  const invoice = await getInvoice(params.id, null);
  const file = await renderInvoice(invoice, query.format === 'html' ? 'html' : 'pdf');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));

platformBillingRouter.post('/jobs', validateBody(jobSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof jobSchema>>(req);
  const queued = await enqueueJob(body.type, body.idempotencyKey, body.tenantId || null);
  const ran = await runDueJobs();
  res.status(queued.created ? 201 : 200).json({ data: { ...queued, ran } });
}));

export const tenantBillingRouter = Router();

tenantBillingRouter.get('/entitlements', asyncHandler(async (req, res) => {
  requireOwner(req);
  res.json({ data: await resolveEntitlement(readAccess(req).tenantId) });
}));

tenantBillingRouter.get('/subscription', asyncHandler(async (req, res) => {
  requireOwner(req);
  res.json({ data: await subscriptionForTenant(readAccess(req).tenantId) });
}));

tenantBillingRouter.get('/invoices', asyncHandler(async (req, res) => {
  requireOwner(req);
  res.json({ data: await listInvoices(readAccess(req).tenantId) });
}));

tenantBillingRouter.get('/invoices/:id/download', validateBody(idSchema), asyncHandler(async (req, res) => {
  requireOwner(req);
  const { params, query } = readValidated<z.infer<typeof idSchema>>(req);
  const invoice = await getInvoice(params.id, readAccess(req).tenantId);
  const file = await renderInvoice(invoice, query.format === 'html' ? 'html' : 'pdf');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));
