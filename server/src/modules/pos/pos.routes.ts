import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import {
  approveRefund,
  checkout,
  checkoutContext,
  closeShift,
  commissionSummary,
  createRefund,
  currentShift,
  getTransaction,
  listReadyAppointments,
  listRefunds,
  listShifts,
  listTransactions,
  openShift,
} from './pos.service.js';
import {
  checkoutSchema,
  closeShiftSchema,
  commissionSummarySchema,
  currentShiftSchema,
  listPosSchema,
  listTransactionsSchema,
  openShiftSchema,
  posAppointmentSchema,
  refundCreateSchema,
  refundIdSchema,
  refundListSchema,
  shiftQuerySchema,
  transactionIdSchema,
} from './pos.validation.js';

export const posRouter = Router();
export const transactionRouter = Router();
export const refundRouter = Router();
export const shiftRouter = Router();
export const commissionReportRouter = Router();

posRouter.get('/appointments', requirePermission('pos.view'), validateBody(listPosSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listPosSchema>>(req);
  res.json(await listReadyAppointments(readAccess(req), query));
}));

posRouter.get('/appointments/:id', requirePermission('pos.view'), validateBody(posAppointmentSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof posAppointmentSchema>>(req);
  res.json({ data: await checkoutContext(readAccess(req), params.id) });
}));

posRouter.post('/checkout', requirePermission('pos.checkout'), validateBody(checkoutSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof checkoutSchema>>(req);
  res.status(201).json({ data: await checkout(readAccess(req), body) });
}));

transactionRouter.get('/', requirePermission('transactions.view'), validateBody(listTransactionsSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listTransactionsSchema>>(req);
  res.json(await listTransactions(readAccess(req), query));
}));

transactionRouter.get('/:id', requirePermission('transactions.view'), validateBody(transactionIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof transactionIdSchema>>(req);
  res.json({ data: await getTransaction(readAccess(req), params.id) });
}));

refundRouter.get('/', requirePermission('refunds.view'), validateBody(refundListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof refundListSchema>>(req);
  res.json({ data: await listRefunds(readAccess(req), query.branchId) });
}));

refundRouter.post('/', requirePermission('refunds.create'), validateBody(refundCreateSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof refundCreateSchema>>(req);
  res.status(201).json({ data: await createRefund(readAccess(req), body) });
}));

refundRouter.post('/:id/approve', requirePermission('refunds.approve'), validateBody(refundIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof refundIdSchema>>(req);
  res.json({ data: await approveRefund(readAccess(req), params.id) });
}));

shiftRouter.get('/', requirePermission('cashier-shifts.view'), validateBody(shiftQuerySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof shiftQuerySchema>>(req);
  res.json(await listShifts(readAccess(req), query.branchId, query.page, query.pageSize));
}));

shiftRouter.get('/current', requirePermission('cashier-shifts.view'), validateBody(currentShiftSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof currentShiftSchema>>(req);
  res.json({ data: await currentShift(readAccess(req), query.branchId) });
}));

shiftRouter.post('/', requirePermission('cashier-shifts.open'), validateBody(openShiftSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof openShiftSchema>>(req);
  res.status(201).json({ data: await openShift(readAccess(req), body) });
}));

shiftRouter.post('/:id/close', requirePermission('cashier-shifts.close'), validateBody(closeShiftSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof closeShiftSchema>>(req);
  res.json({ data: await closeShift(readAccess(req), params.id, body.actualCash) });
}));

commissionReportRouter.get('/summary', requirePermission('commissions.view'), validateBody(commissionSummarySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof commissionSummarySchema>>(req);
  res.json({ data: await commissionSummary(readAccess(req), query) });
}));
