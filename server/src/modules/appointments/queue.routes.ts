import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import { completeQueueEntry, listQueue, reorderQueue, startQueueEntry } from './appointment.service.js';
import { appointmentIdSchema, listQueueSchema, reorderQueueSchema } from './appointment.validation.js';

export const queueRouter = Router();

queueRouter.get('/', requirePermission('queue.view'), validateBody(listQueueSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listQueueSchema>>(req);
  res.json({ data: await listQueue(readAccess(req), query) });
}));

queueRouter.post('/reorder', requirePermission('queue.reorder'), validateBody(reorderQueueSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof reorderQueueSchema>>(req);
  res.json({ data: await reorderQueue(readAccess(req), body) });
}));

queueRouter.post('/:id/start', requirePermission('queue.start-service'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await startQueueEntry(readAccess(req), params.id) });
}));

queueRouter.post('/:id/complete', requirePermission('queue.complete-service'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await completeQueueEntry(readAccess(req), params.id) });
}));
