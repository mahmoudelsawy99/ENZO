import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import {
  appointmentHistory,
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  createAppointment,
  createWalkIn,
  getAppointment,
  joinQueue,
  listAppointments,
  listBarbers,
  markNoShow,
  rescheduleAppointment,
  startAppointment,
  updateAppointment,
} from './appointment.service.js';
import {
  appointmentIdSchema,
  barberQuerySchema,
  createAppointmentSchema,
  listAppointmentsSchema,
  reasonSchema,
  rescheduleSchema,
  updateAppointmentSchema,
  walkInSchema,
} from './appointment.validation.js';

export const appointmentRouter = Router();

appointmentRouter.get('/barbers', requirePermission('appointments.view'), validateBody(barberQuerySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof barberQuerySchema>>(req);
  res.json({ data: await listBarbers(readAccess(req), query.branchId) });
}));

appointmentRouter.get('/', requirePermission('appointments.view'), validateBody(listAppointmentsSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listAppointmentsSchema>>(req);
  res.json(await listAppointments(readAccess(req), query));
}));

appointmentRouter.post('/walk-in', requirePermission('appointments.create'), validateBody(walkInSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof walkInSchema>>(req);
  res.status(201).json({ data: await createWalkIn(readAccess(req), body) });
}));

appointmentRouter.post('/', requirePermission('appointments.create'), validateBody(createAppointmentSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createAppointmentSchema>>(req);
  res.status(201).json({ data: await createAppointment(readAccess(req), body) });
}));

appointmentRouter.get('/:id/history', requirePermission('appointments.view'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await appointmentHistory(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/confirm', requirePermission('appointments.confirm'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await confirmAppointment(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/check-in', requirePermission('appointments.check-in'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await checkInAppointment(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/queue', requirePermission('queue.create'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await joinQueue(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/start', requirePermission('queue.start-service'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await startAppointment(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/complete', requirePermission('queue.complete-service'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await completeAppointment(readAccess(req), params.id) });
}));

appointmentRouter.post('/:id/cancel', requirePermission('appointments.cancel'), validateBody(reasonSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof reasonSchema>>(req);
  res.json({ data: await cancelAppointment(readAccess(req), params.id, body.reason) });
}));

appointmentRouter.post('/:id/no-show', requirePermission('appointments.mark-no-show'), validateBody(reasonSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof reasonSchema>>(req);
  res.json({ data: await markNoShow(readAccess(req), params.id, body.reason) });
}));

appointmentRouter.post('/:id/reschedule', requirePermission('appointments.reschedule'), validateBody(rescheduleSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof rescheduleSchema>>(req);
  res.json({ data: await rescheduleAppointment(readAccess(req), params.id, body.scheduledAt, body.reason) });
}));

appointmentRouter.get('/:id', requirePermission('appointments.view'), validateBody(appointmentIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof appointmentIdSchema>>(req);
  res.json({ data: await getAppointment(readAccess(req), params.id) });
}));

appointmentRouter.put('/:id', requirePermission('appointments.update'), validateBody(updateAppointmentSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof updateAppointmentSchema>>(req);
  res.json({ data: await updateAppointment(readAccess(req), params.id, body) });
}));
