import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import {
  adjustBalance,
  adjustPayroll,
  approvePayroll,
  attendanceDashboard,
  cancelLeave,
  cancelPayroll,
  checkIn,
  checkOut,
  closeAttendanceDay,
  correctAttendance,
  correctPayroll,
  createLeaveRequest,
  decideLeave,
  generatePayroll,
  getAttendancePolicy,
  getPayroll,
  listAttendance,
  listBalances,
  listDevices,
  listDeviceMaps,
  listLeaveRequests,
  listLeaveTypes,
  listPayroll,
  listSchedules,
  listSyncLogs,
  mapDeviceEmployee,
  payPayroll,
  queueMockEvent,
  registerDevice,
  saveAttendancePolicy,
  saveLeaveType,
  saveSchedule,
  setDeviceStatus,
  submitPayroll,
  syncDevice,
} from './workforce.service.js';
import {
  attendanceListSchema,
  balanceAdjustSchema,
  balanceListSchema,
  checkSchema,
  closeDaySchema,
  correctSchema,
  summarySchema,
  deviceMapSchema,
  deviceSchema,
  deviceStatusSchema,
  idSchema,
  leaveDecisionSchema,
  leaveListSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  mockEventSchema,
  noneSchema,
  payrollAdjustSchema,
  payrollGenerateSchema,
  payrollListSchema,
  payrollPaySchema,
  policyQuerySchema,
  policySchema,
  scheduleListSchema,
  scheduleSchema,
} from './workforce.validation.js';

export const attendanceRouter = Router();
export const scheduleRouter = Router();
export const deviceRouter = Router();
export const leaveTypeRouter = Router();
export const leaveRouter = Router();
export const leaveBalanceRouter = Router();
export const payrollRouter = Router();

attendanceRouter.get('/policy', requirePermission('attendance.view'), validateBody(policyQuerySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof policyQuerySchema>>(req);
  res.json({ data: await getAttendancePolicy(readAccess(req), query.branchId) });
}));

attendanceRouter.put('/policy', requirePermission('attendance.rules.manage'), validateBody(policySchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof policySchema>>(req);
  res.json({ data: await saveAttendancePolicy(readAccess(req), body) });
}));

attendanceRouter.get('/summary', requirePermission('attendance.view'), validateBody(summarySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof summarySchema>>(req);
  res.json({ data: await attendanceDashboard(readAccess(req), query.branchId, query.date) });
}));

attendanceRouter.get('/', requirePermission('attendance.view'), validateBody(attendanceListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof attendanceListSchema>>(req);
  res.json(await listAttendance(readAccess(req), query));
}));

attendanceRouter.post('/check-in', requirePermission('attendance.manual-entry'), validateBody(checkSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof checkSchema>>(req);
  res.status(201).json({ data: await checkIn(readAccess(req), body) });
}));

attendanceRouter.post('/check-out', requirePermission('attendance.manual-entry'), validateBody(checkSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof checkSchema>>(req);
  res.json({ data: await checkOut(readAccess(req), body) });
}));

attendanceRouter.post('/close-day', requirePermission('attendance.manage'), validateBody(closeDaySchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof closeDaySchema>>(req);
  res.json({ data: await closeAttendanceDay(readAccess(req), body.branchId, body.date) });
}));

attendanceRouter.patch('/:id', requirePermission('attendance.correct'), validateBody(correctSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof correctSchema>>(req);
  res.json({ data: await correctAttendance(readAccess(req), params.id, body) });
}));

scheduleRouter.get('/', requirePermission('schedules.view'), validateBody(scheduleListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof scheduleListSchema>>(req);
  res.json({ data: await listSchedules(readAccess(req), query.employeeId, query.branchId) });
}));

scheduleRouter.post('/', requirePermission('schedules.manage'), validateBody(scheduleSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof scheduleSchema>>(req);
  res.status(201).json({ data: await saveSchedule(readAccess(req), body) });
}));

scheduleRouter.put('/:id', requirePermission('schedules.manage'), validateBody(scheduleSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof scheduleSchema>>(req);
  res.json({ data: await saveSchedule(readAccess(req), body, params.id) });
}));

deviceRouter.get('/', requirePermission('fingerprint-devices.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await listDevices(readAccess(req)) });
}));

deviceRouter.get('/logs', requirePermission('fingerprint-devices.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await listSyncLogs(readAccess(req), '') });
}));

deviceRouter.post('/', requirePermission('fingerprint-devices.manage'), validateBody(deviceSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof deviceSchema>>(req);
  res.status(201).json({ data: await registerDevice(readAccess(req), body) });
}));

deviceRouter.post('/:id/status', requirePermission('fingerprint-devices.manage'), validateBody(deviceStatusSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof deviceStatusSchema>>(req);
  res.json({ data: await setDeviceStatus(readAccess(req), params.id, body.status) });
}));

deviceRouter.get('/:id/employees', requirePermission('fingerprint-devices.view'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await listDeviceMaps(readAccess(req), params.id) });
}));

deviceRouter.post('/:id/employees', requirePermission('fingerprint-devices.manage'), validateBody(deviceMapSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof deviceMapSchema>>(req);
  res.status(201).json({ data: await mapDeviceEmployee(readAccess(req), params.id, body.employeeId, body.externalEmployeeId) });
}));

deviceRouter.post('/:id/mock-events', requirePermission('fingerprint-devices.sync'), validateBody(mockEventSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof mockEventSchema>>(req);
  res.status(201).json({ data: await queueMockEvent(readAccess(req), params.id, body) });
}));

deviceRouter.post('/:id/sync', requirePermission('fingerprint-devices.sync'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await syncDevice(readAccess(req), params.id) });
}));

leaveTypeRouter.get('/', requirePermission('leave-requests.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await listLeaveTypes(readAccess(req)) });
}));

leaveTypeRouter.post('/', requirePermission('leave-types.manage'), validateBody(leaveTypeSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof leaveTypeSchema>>(req);
  res.status(201).json({ data: await saveLeaveType(readAccess(req), body) });
}));

leaveTypeRouter.put('/:id', requirePermission('leave-types.manage'), validateBody(leaveTypeSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof leaveTypeSchema>>(req);
  res.json({ data: await saveLeaveType(readAccess(req), body, params.id) });
}));

leaveRouter.get('/', requirePermission('leave-requests.view'), validateBody(leaveListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof leaveListSchema>>(req);
  res.json({ data: await listLeaveRequests(readAccess(req), query.status, query.employeeId) });
}));

leaveRouter.post('/', requirePermission('leave-requests.create'), validateBody(leaveRequestSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof leaveRequestSchema>>(req);
  res.status(201).json({ data: await createLeaveRequest(readAccess(req), body) });
}));

leaveRouter.post('/:id/decision', requirePermission('leave-requests.approve'), validateBody(leaveDecisionSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof leaveDecisionSchema>>(req);
  res.json({ data: await decideLeave(readAccess(req), params.id, body) });
}));

leaveRouter.post('/:id/cancel', requirePermission('leave-requests.create'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await cancelLeave(readAccess(req), params.id) });
}));

leaveRouter.get('/balances', requirePermission('leave-balances.view'), validateBody(balanceListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof balanceListSchema>>(req);
  res.json({ data: await listBalances(readAccess(req), query.employeeId, query.year) });
}));

leaveRouter.post('/balances', requirePermission('leave-balances.manage'), validateBody(balanceAdjustSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof balanceAdjustSchema>>(req);
  res.json({ data: await adjustBalance(readAccess(req), body) });
}));

leaveBalanceRouter.get('/', requirePermission('leave-balances.view'), validateBody(balanceListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof balanceListSchema>>(req);
  res.json({ data: await listBalances(readAccess(req), query.employeeId, query.year) });
}));

leaveBalanceRouter.post('/adjustments', requirePermission('leave-balances.manage'), validateBody(balanceAdjustSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof balanceAdjustSchema>>(req);
  res.json({ data: await adjustBalance(readAccess(req), body) });
}));

payrollRouter.get('/', requirePermission('payroll.view'), validateBody(payrollListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof payrollListSchema>>(req);
  res.json({ data: await listPayroll(readAccess(req), query) });
}));

payrollRouter.post('/generate', requirePermission('payroll.generate'), validateBody(payrollGenerateSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof payrollGenerateSchema>>(req);
  res.status(201).json({ data: await generatePayroll(readAccess(req), body) });
}));

payrollRouter.get('/:id', requirePermission('payroll.view'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await getPayroll(readAccess(req), params.id) });
}));

payrollRouter.post('/:id/adjustments', requirePermission('payroll.adjust'), validateBody(payrollAdjustSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof payrollAdjustSchema>>(req);
  res.json({ data: await adjustPayroll(readAccess(req), params.id, body) });
}));

payrollRouter.post('/:id/submit', requirePermission('payroll.review'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await submitPayroll(readAccess(req), params.id) });
}));

payrollRouter.post('/:id/approve', requirePermission('payroll.approve'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await approvePayroll(readAccess(req), params.id) });
}));

payrollRouter.post('/:id/pay', requirePermission('payroll.pay'), validateBody(payrollPaySchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof payrollPaySchema>>(req);
  res.json({ data: await payPayroll(readAccess(req), params.id, body.method, body.reference) });
}));

payrollRouter.post('/:id/cancel', requirePermission('payroll.generate'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await cancelPayroll(readAccess(req), params.id) });
}));

payrollRouter.post('/:id/corrections', requirePermission('payroll.adjust'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.status(201).json({ data: await correctPayroll(readAccess(req), params.id) });
}));
