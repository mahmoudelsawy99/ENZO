import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { addMinor, fromMinor, toMinor } from '../../shared/money.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { saveDoc } from '../../shared/persist.js';
import { timestamp } from '../../shared/text.js';
import { assertBranchInScope } from '../access/access.middleware.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import type { PermissionKey } from '../access/permissions.js';
import { Branch } from '../branches/branch.model.js';
import { EmployeeBranch } from '../employees/assignment.model.js';
import { Employee } from '../employees/employee.model.js';
import { CommissionSnapshot, SaleTransaction, Tip } from '../pos/sale.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import {
  Attendance,
  AttendancePolicy,
  DeviceEmployeeMap,
  DeviceEvent,
  DeviceInbox,
  DeviceSyncLog,
  FingerprintDevice,
  LeaveAdjustment,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  Payroll,
  WorkSchedule,
} from './workforce.model.js';
import {
  classifyAttendance,
  eachDate,
  formatInZone,
  todayInZone,
  weekdayOf,
  zonedTime,
  type DaySchedule,
} from './workforce.time.js';

type Source = 'MANUAL' | 'DEVICE' | 'SYSTEM';

function assertCan(access: TenantAccess, key: PermissionKey): void {
  if (!access.isOwner && !access.permissions.has(key)) {
    throw new HttpError(403, 'forbidden', 'You do not have access to this action.');
  }
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function keysMatch(stored: string, supplied: string): boolean {
  const left = Buffer.from(stored);
  const right = Buffer.from(hashKey(supplied));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function zoneOf(tenantId: string): Promise<string> {
  const tenant = await Tenant.findById(tenantId).select('timezone');
  return tenant?.timezone || 'Africa/Cairo';
}

async function requireBranch(access: TenantAccess, branchId: string) {
  assertBranchInScope(access, branchId);
  const branch = await Branch.findOne({ _id: branchId, tenantId: access.tenantId });
  if (!branch) {
    throw new HttpError(404, 'not_found', 'Branch was not found.');
  }
  if (branch.status !== 'ACTIVE') {
    throw new HttpError(409, 'branch_disabled', 'This branch is not active.');
  }
  return branch;
}

async function requireAssigned(access: TenantAccess, employeeId: string, branchId: string) {
  await requireBranch(access, branchId);
  const employee = await Employee.findOne({ _id: employeeId, tenantId: access.tenantId });
  if (!employee || employee.status === 'TERMINATED') {
    throw new HttpError(404, 'not_found', 'Employee was not found.');
  }
  const assigned = await EmployeeBranch.exists({ tenantId: access.tenantId, employeeId, branchId, status: 'ACTIVE' });
  if (!assigned) {
    throw new HttpError(409, 'not_assigned', 'This employee is not assigned to the branch.');
  }
  return employee;
}

async function assertEmployeeVisible(access: TenantAccess, employeeId: string) {
  const employee = await Employee.findOne({ _id: employeeId, tenantId: access.tenantId });
  if (!employee) {
    throw new HttpError(404, 'not_found', 'Employee was not found.');
  }
  if (access.branchScope === 'SELECTED') {
    const assigned = await EmployeeBranch.exists({
      tenantId: access.tenantId,
      employeeId,
      branchId: { $in: access.branchIds },
      status: 'ACTIVE',
    });
    if (!assigned) {
      throw new HttpError(403, 'branch_forbidden', 'This employee is outside your branches.');
    }
  }
  return employee;
}

function rulesOf(policy: {
  graceMinutes: number;
  earlyLeaveGraceMinutes: number;
  halfDayRatio: number;
  overtimeRoundingMinutes: number;
  weeklyDaysOff: number[];
}) {
  return {
    graceMinutes: policy.graceMinutes,
    earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
    halfDayRatio: policy.halfDayRatio,
    overtimeRoundingMinutes: policy.overtimeRoundingMinutes,
    weeklyDaysOff: policy.weeklyDaysOff,
  };
}

async function policyFor(tenantId: string, branchId: string) {
  if (branchId) {
    const branchPolicy = await AttendancePolicy.findOne({ tenantId, branchId });
    if (branchPolicy) {
      return branchPolicy;
    }
  }
  const tenantPolicy = await AttendancePolicy.findOne({ tenantId, branchId: null });
  if (tenantPolicy) {
    return tenantPolicy;
  }
  return AttendancePolicy.create({ tenantId, branchId: null });
}

function presentPolicy(policy: {
  _id: unknown;
  branchId?: unknown;
  graceMinutes: number;
  earlyLeaveGraceMinutes: number;
  halfDayRatio: number;
  overtimeRoundingMinutes: number;
  weeklyDaysOff: number[];
  publicHolidays: Array<{ date: string; name: string }>;
  lateDeductionPerMinute: number;
  earlyLeaveDeductionPerMinute: number;
  absenceDeductionMode: string;
  dailyRateDays: number;
  halfDayFactor: number;
  overtimeMultiplier: number;
  monthlyHours: number;
}) {
  return {
    id: String(policy._id),
    branchId: policy.branchId ? String(policy.branchId) : '',
    graceMinutes: policy.graceMinutes,
    earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
    halfDayRatio: policy.halfDayRatio,
    overtimeRoundingMinutes: policy.overtimeRoundingMinutes,
    weeklyDaysOff: policy.weeklyDaysOff,
    publicHolidays: policy.publicHolidays,
    lateDeductionPerMinute: policy.lateDeductionPerMinute,
    earlyLeaveDeductionPerMinute: policy.earlyLeaveDeductionPerMinute,
    absenceDeductionMode: policy.absenceDeductionMode,
    dailyRateDays: policy.dailyRateDays,
    halfDayFactor: policy.halfDayFactor,
    overtimeMultiplier: policy.overtimeMultiplier,
    monthlyHours: policy.monthlyHours,
  };
}

async function scheduleDay(tenantId: string, employeeId: string, branchId: string, date: string, timeZone: string): Promise<DaySchedule | null> {
  const rows = await WorkSchedule.find({ tenantId, employeeId, branchId, status: 'ACTIVE', effectiveFrom: { $lte: date } });
  const match = rows.find((row) => !row.effectiveTo || row.effectiveTo >= date);
  const weekday = weekdayOf(date, timeZone);
  const day = match?.days.find((item) => item.weekday === weekday);
  return day
    ? { weekday: day.weekday, working: day.working, startTime: day.startTime, endTime: day.endTime, breakMinutes: day.breakMinutes }
    : null;
}

async function leaveCover(tenantId: string, employeeId: string, date: string): Promise<'FULL' | 'HALF' | null> {
  const rows = await LeaveRequest.find({
    tenantId,
    employeeId,
    status: 'APPROVED',
    startDate: { $lte: date },
    endDate: { $gte: date },
  });
  if (rows.some((row) => row.portion === 'FULL')) {
    return 'FULL';
  }
  return rows.length > 0 ? 'HALF' : null;
}

async function classifyFor(tenantId: string, employeeId: string, branchId: string, date: string, checkIn: Date | null, checkOut: Date | null) {
  const zone = await zoneOf(tenantId);
  const policy = await policyFor(tenantId, branchId);
  const holiday = policy.publicHolidays.some((item) => item.date === date);
  const schedule = await scheduleDay(tenantId, employeeId, branchId, date, zone);
  const leave = await leaveCover(tenantId, employeeId, date);
  return classifyAttendance({ date, timeZone: zone, rules: rulesOf(policy), holiday, schedule, leave, checkIn, checkOut });
}

function presentAttendance(row: {
  _id: unknown;
  employeeId: unknown;
  branchId: unknown;
  attendanceDate: string;
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
  checkInSource: string;
  checkOutSource?: string | null;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  notes?: string | null;
  revisions?: Array<{ at: Date; by: unknown; summary: string }>;
  createdAt?: Date;
  updatedAt?: Date;
}, zone: string, employeeName = '') {
  return {
    id: String(row._id),
    employeeId: String(row.employeeId),
    employeeName,
    branchId: String(row.branchId),
    attendanceDate: row.attendanceDate,
    checkInTime: timestamp(row.checkInTime),
    checkOutTime: timestamp(row.checkOutTime),
    checkInLabel: formatInZone(row.checkInTime ?? null, zone),
    checkOutLabel: formatInZone(row.checkOutTime ?? null, zone),
    checkInSource: row.checkInSource,
    checkOutSource: row.checkOutSource || '',
    status: row.status,
    lateMinutes: row.lateMinutes,
    earlyLeaveMinutes: row.earlyLeaveMinutes,
    overtimeMinutes: row.overtimeMinutes,
    notes: row.notes ?? '',
    revisions: (row.revisions ?? []).map((item) => ({ at: timestamp(item.at), by: String(item.by), summary: item.summary })),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

export async function getAttendancePolicy(access: TenantAccess, branchId: string) {
  assertCan(access, 'attendance.view');
  if (branchId) {
    await requireBranch(access, branchId);
  }
  return presentPolicy(await policyFor(access.tenantId, branchId));
}

export async function saveAttendancePolicy(access: TenantAccess, input: {
  branchId: string;
  graceMinutes: number;
  earlyLeaveGraceMinutes: number;
  halfDayRatio: number;
  overtimeRoundingMinutes: number;
  weeklyDaysOff: number[];
  publicHolidays: Array<{ date: string; name: string }>;
  lateDeductionPerMinute: number;
  earlyLeaveDeductionPerMinute: number;
  absenceDeductionMode: 'NONE' | 'DAILY_RATE';
  dailyRateDays: number;
  halfDayFactor: number;
  overtimeMultiplier: number;
  monthlyHours: number;
}) {
  assertCan(access, 'attendance.rules.manage');
  const branchId = input.branchId || null;
  if (branchId) {
    await requireBranch(access, branchId);
  }
  const current = await AttendancePolicy.findOne({ tenantId: access.tenantId, branchId });
  const policy = current ?? new AttendancePolicy({ tenantId: access.tenantId, branchId });
  Object.assign(policy, { ...input, branchId });
  await policy.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'attendance.rules.saved',
    entityType: 'attendance-policy',
    entityId: String(policy._id),
    summary: 'Attendance rules were saved.',
    changes: { branchId: branchId ?? '', graceMinutes: input.graceMinutes },
  });
  return presentPolicy(policy);
}

export async function listSchedules(access: TenantAccess, employeeId: string, branchId: string) {
  assertCan(access, 'schedules.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId, status: 'ACTIVE' };
  if (employeeId) {
    await assertEmployeeVisible(access, employeeId);
    filter['employeeId'] = employeeId;
  }
  if (branchId) {
    await requireBranch(access, branchId);
    filter['branchId'] = branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const rows = await WorkSchedule.find(filter).sort({ effectiveFrom: -1 });
  return rows.map((row) => ({
    id: String(row._id),
    employeeId: String(row.employeeId),
    branchId: String(row.branchId),
    days: row.days,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo ?? '',
  }));
}

export async function saveSchedule(access: TenantAccess, input: {
  employeeId: string;
  branchId: string;
  days: DaySchedule[];
  effectiveFrom: string;
  effectiveTo: string;
}, id?: string) {
  assertCan(access, 'schedules.manage');
  await requireAssigned(access, input.employeeId, input.branchId);
  const end = input.effectiveTo || '9999-12-31';
  const others = await WorkSchedule.find({
    tenantId: access.tenantId,
    employeeId: input.employeeId,
    branchId: input.branchId,
    status: 'ACTIVE',
    ...(id ? { _id: { $ne: id } } : {}),
  });
  const overlap = others.some((row) => row.effectiveFrom <= end && (row.effectiveTo || '9999-12-31') >= input.effectiveFrom);
  if (overlap) {
    throw new HttpError(409, 'schedule_overlap', 'This schedule overlaps another schedule for the same branch.');
  }
  const schedule = id
    ? await WorkSchedule.findOne({ _id: id, tenantId: access.tenantId })
    : new WorkSchedule({ tenantId: access.tenantId });
  if (!schedule) {
    throw new HttpError(404, 'not_found', 'Schedule was not found.');
  }
  Object.assign(schedule, input);
  await schedule.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'schedule.saved',
    entityType: 'work-schedule',
    entityId: String(schedule._id),
    summary: 'A working schedule was saved.',
    changes: { employeeId: input.employeeId, branchId: input.branchId, effectiveFrom: input.effectiveFrom },
  });
  return { id: String(schedule._id) };
}

async function namesFor(tenantId: string, ids: string[]) {
  const employees = await Employee.find({ tenantId, _id: { $in: ids } }).select('fullName');
  return new Map(employees.map((employee) => [String(employee._id), employee.fullName]));
}

export async function listAttendance(access: TenantAccess, query: { branchId: string; from: string; to: string; employeeId: string }) {
  assertCan(access, 'attendance.view');
  await requireBranch(access, query.branchId);
  const filter: Record<string, unknown> = {
    tenantId: access.tenantId,
    branchId: query.branchId,
    attendanceDate: { $gte: query.from, $lte: query.to },
  };
  if (query.employeeId) {
    filter['employeeId'] = query.employeeId;
  }
  const rows = await Attendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 }).limit(500);
  const zone = await zoneOf(access.tenantId);
  const names = await namesFor(access.tenantId, rows.map((row) => String(row.employeeId)));
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0, DAY_OFF: 0 };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return { counts, data: rows.map((row) => presentAttendance(row, zone, names.get(String(row.employeeId)) ?? '')) };
}

async function punch(access: TenantAccess | null, input: {
  tenantId: string;
  employeeId: string;
  branchId: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  source: Source;
  when: Date;
  notes: string;
  actorId: string | null;
}) {
  const zone = await zoneOf(input.tenantId);
  const date = todayInZone(zone, input.when);
  const existing = await Attendance.findOne({
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    branchId: input.branchId,
    attendanceDate: date,
  });
  if (input.action === 'CHECK_IN' && existing?.checkInTime) {
    throw new HttpError(409, 'already_checked_in', 'This employee is already checked in for this date.');
  }
  if (input.action === 'CHECK_OUT' && !existing?.checkInTime) {
    throw new HttpError(409, 'missing_check_in', 'Check in before checking out.');
  }
  const checkIn = input.action === 'CHECK_IN' ? input.when : existing?.checkInTime ?? null;
  const checkOut = input.action === 'CHECK_OUT' ? input.when : existing?.checkOutTime ?? null;
  const classified = await classifyFor(input.tenantId, input.employeeId, input.branchId, date, checkIn, checkOut);
  const row = existing ?? new Attendance({
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    branchId: input.branchId,
    attendanceDate: date,
    createdBy: input.actorId,
  });
  row.checkInTime = checkIn;
  row.checkOutTime = checkOut;
  if (input.action === 'CHECK_IN') {
    row.checkInSource = input.source;
  } else {
    row.checkOutSource = input.source;
  }
  row.status = classified.status;
  row.lateMinutes = classified.lateMinutes;
  row.earlyLeaveMinutes = classified.earlyLeaveMinutes;
  row.overtimeMinutes = classified.overtimeMinutes;
  if (input.notes) {
    row.notes = input.notes;
  }
  if (input.actorId) {
    row.updatedBy = new Types.ObjectId(input.actorId);
  }
  try {
    await row.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'attendanceDate')) {
      throw new HttpError(409, 'duplicate_attendance', 'Attendance for this employee, branch, and date already exists.');
    }
    throw error;
  }
  if (access) {
    await writeAudit({
      tenantId: input.tenantId,
      actorUserId: access.userId,
      action: input.action === 'CHECK_IN' ? 'attendance.checked-in' : 'attendance.checked-out',
      entityType: 'attendance',
      entityId: String(row._id),
      summary: input.action === 'CHECK_IN' ? 'Manual check-in recorded.' : 'Manual check-out recorded.',
    });
  }
  return presentAttendance(row, zone);
}

export async function checkIn(access: TenantAccess, input: { employeeId: string; branchId: string; notes: string }) {
  assertCan(access, 'attendance.manual-entry');
  await requireAssigned(access, input.employeeId, input.branchId);
  return punch(access, { ...input, tenantId: access.tenantId, action: 'CHECK_IN', source: 'MANUAL', when: new Date(), actorId: access.userId });
}

export async function checkOut(access: TenantAccess, input: { employeeId: string; branchId: string; notes: string }) {
  assertCan(access, 'attendance.manual-entry');
  await requireAssigned(access, input.employeeId, input.branchId);
  return punch(access, { ...input, tenantId: access.tenantId, action: 'CHECK_OUT', source: 'MANUAL', when: new Date(), actorId: access.userId });
}

export async function correctAttendance(access: TenantAccess, id: string, input: { checkInTime: string; checkOutTime: string; notes: string }) {
  assertCan(access, 'attendance.correct');
  const row = await Attendance.findOne({ _id: id, tenantId: access.tenantId });
  if (!row) {
    throw new HttpError(404, 'not_found', 'Attendance was not found.');
  }
  assertBranchInScope(access, String(row.branchId));
  const before = { checkInTime: timestamp(row.checkInTime), checkOutTime: timestamp(row.checkOutTime), status: row.status };
  row.checkInTime = input.checkInTime ? new Date(input.checkInTime) : null;
  row.checkOutTime = input.checkOutTime ? new Date(input.checkOutTime) : null;
  row.notes = input.notes;
  row.checkInSource = row.checkInTime ? 'MANUAL' : row.checkInSource;
  if (row.checkOutTime) {
    row.checkOutSource = 'MANUAL';
  }
  const classified = await classifyFor(access.tenantId, String(row.employeeId), String(row.branchId), row.attendanceDate, row.checkInTime ?? null, row.checkOutTime ?? null);
  row.status = classified.status;
  row.lateMinutes = classified.lateMinutes;
  row.earlyLeaveMinutes = classified.earlyLeaveMinutes;
  row.overtimeMinutes = classified.overtimeMinutes;
  row.updatedBy = new Types.ObjectId(access.userId);
  row.revisions.push({ at: new Date(), by: new Types.ObjectId(access.userId), summary: 'Attendance was corrected.' });
  await row.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'attendance.corrected',
    entityType: 'attendance',
    entityId: String(row._id),
    summary: 'Attendance was corrected.',
    changes: { before, after: { checkInTime: timestamp(row.checkInTime), checkOutTime: timestamp(row.checkOutTime), status: row.status } },
  });
  return presentAttendance(row, await zoneOf(access.tenantId));
}

export async function closeAttendanceDay(access: TenantAccess, branchId: string, date: string) {
  assertCan(access, 'attendance.manage');
  await requireBranch(access, branchId);
  const assignments = await EmployeeBranch.find({ tenantId: access.tenantId, branchId, status: 'ACTIVE' });
  let created = 0;
  for (const assignment of assignments) {
    const exists = await Attendance.exists({
      tenantId: access.tenantId,
      employeeId: assignment.employeeId,
      branchId,
      attendanceDate: date,
    });
    if (exists) {
      continue;
    }
    const classified = await classifyFor(access.tenantId, String(assignment.employeeId), branchId, date, null, null);
    await Attendance.create({
      tenantId: access.tenantId,
      employeeId: assignment.employeeId,
      branchId,
      attendanceDate: date,
      checkInSource: 'SYSTEM',
      status: classified.status,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      createdBy: access.userId,
    });
    created += 1;
  }
  return { created };
}

function presentDevice(device: {
  _id: unknown;
  branchId: unknown;
  name: string;
  serialNumber: string;
  provider: string;
  deviceType: string;
  status: string;
  connectionStatus: string;
  lastSyncAt?: Date | null;
}) {
  return {
    id: String(device._id),
    branchId: String(device.branchId),
    name: device.name,
    serialNumber: device.serialNumber,
    provider: device.provider,
    deviceType: device.deviceType,
    status: device.status,
    connectionStatus: device.connectionStatus,
    lastSyncAt: timestamp(device.lastSyncAt),
    hardwareReady: false,
    adapter: 'normalized-json',
  };
}

export async function registerDevice(access: TenantAccess, input: { branchId: string; name: string; serialNumber: string; provider: string; deviceType: string }) {
  assertCan(access, 'fingerprint-devices.manage');
  await requireBranch(access, input.branchId);
  const apiKey = randomBytes(24).toString('hex');
  try {
    const device = await FingerprintDevice.create({ ...input, tenantId: access.tenantId, keyHash: hashKey(apiKey), provider: input.provider || 'mock' });
    return { device: presentDevice(device), apiKey };
  } catch (error) {
    if (hasDuplicateKey(error, 'serialNumber')) {
      throw new HttpError(409, 'duplicate_device', 'A device with this serial number is already registered.');
    }
    throw error;
  }
}

export async function listDevices(access: TenantAccess) {
  assertCan(access, 'fingerprint-devices.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const rows = await FingerprintDevice.find(filter).sort({ name: 1 });
  return rows.map((row) => presentDevice(row));
}

export async function setDeviceStatus(access: TenantAccess, id: string, status: 'ENABLED' | 'DISABLED') {
  assertCan(access, 'fingerprint-devices.manage');
  const device = await FingerprintDevice.findOne({ _id: id, tenantId: access.tenantId });
  if (!device) {
    throw new HttpError(404, 'not_found', 'Device was not found.');
  }
  assertBranchInScope(access, String(device.branchId));
  device.status = status;
  if (status === 'DISABLED') {
    device.connectionStatus = 'OFFLINE';
  }
  await device.save();
  return presentDevice(device);
}

export async function mapDeviceEmployee(access: TenantAccess, deviceId: string, employeeId: string, externalEmployeeId: string) {
  assertCan(access, 'fingerprint-devices.manage');
  const device = await FingerprintDevice.findOne({ _id: deviceId, tenantId: access.tenantId });
  if (!device) {
    throw new HttpError(404, 'not_found', 'Device was not found.');
  }
  await requireAssigned(access, employeeId, String(device.branchId));
  const existing = await DeviceEmployeeMap.findOne({ deviceId, externalEmployeeId });
  const row = existing ?? new DeviceEmployeeMap({ tenantId: access.tenantId, deviceId });
  row.employeeId = new Types.ObjectId(employeeId);
  row.externalEmployeeId = externalEmployeeId;
  await row.save();
  return { id: String(row._id), employeeId, externalEmployeeId };
}

export async function listDeviceMaps(access: TenantAccess, deviceId: string) {
  assertCan(access, 'fingerprint-devices.view');
  const device = await FingerprintDevice.findOne({ _id: deviceId, tenantId: access.tenantId });
  if (!device) {
    throw new HttpError(404, 'not_found', 'Device was not found.');
  }
  assertBranchInScope(access, String(device.branchId));
  const rows = await DeviceEmployeeMap.find({ tenantId: access.tenantId, deviceId });
  return rows.map((row) => ({ id: String(row._id), employeeId: String(row.employeeId), externalEmployeeId: row.externalEmployeeId }));
}

async function applyDeviceEvent(
  device: { _id: Types.ObjectId; tenantId: Types.ObjectId; branchId: Types.ObjectId; status: string },
  event: { externalEventId: string; externalEmployeeId: string; action: 'CHECK_IN' | 'CHECK_OUT' },
) {
  if (device.status !== 'ENABLED') {
    throw new HttpError(403, 'device_disabled', 'This device is disabled.');
  }
  const duplicate = await DeviceEvent.exists({ deviceId: device._id, externalEventId: event.externalEventId });
  if (duplicate) {
    return { duplicate: true, status: 'APPLIED' };
  }
  const mapped = await DeviceEmployeeMap.findOne({ deviceId: device._id, externalEmployeeId: event.externalEmployeeId });
  const stored = {
    tenantId: device.tenantId,
    deviceId: device._id,
    externalEventId: event.externalEventId,
    externalEmployeeId: event.externalEmployeeId,
    action: event.action,
  };
  if (!mapped) {
    await DeviceEvent.create({
      ...stored,
      status: 'FAILED',
      message: 'No employee is mapped to this device identifier.',
    });
    throw new HttpError(404, 'employee_unmapped', 'No employee is mapped to this device identifier.');
  }
  try {
    await punch(null, {
      tenantId: String(device.tenantId),
      employeeId: String(mapped.employeeId),
      branchId: String(device.branchId),
      action: event.action,
      source: 'DEVICE',
      when: new Date(),
      notes: '',
      actorId: null,
    });
    await DeviceEvent.create({ ...stored, status: 'APPLIED', message: '' });
  } catch (error) {
    if (hasDuplicateKey(error, 'externalEventId')) {
      return { duplicate: true, status: 'APPLIED' };
    }
    const message = error instanceof HttpError ? error.message : 'The attendance event could not be applied.';
    try {
      await DeviceEvent.create({ ...stored, status: 'FAILED', message });
    } catch (saveError) {
      if (!hasDuplicateKey(saveError, 'externalEventId')) {
        throw saveError;
      }
    }
    throw error;
  }
  await FingerprintDevice.updateOne({ _id: device._id }, { $set: { connectionStatus: 'ONLINE', lastSyncAt: new Date() } });
  return { duplicate: false, status: 'APPLIED' };
}

export async function ingestDeviceEvent(input: { serialNumber: string; externalEventId: string; externalEmployeeId: string; action: 'CHECK_IN' | 'CHECK_OUT' }, apiKey: string) {
  const device = await FingerprintDevice.findOne({ serialNumber: input.serialNumber });
  if (!device || !keysMatch(device.keyHash, apiKey)) {
    throw new HttpError(401, 'device_unauthorized', 'The device is not authorized.');
  }
  return applyDeviceEvent(device, input);
}

export async function queueMockEvent(access: TenantAccess, deviceId: string, input: { externalEventId: string; externalEmployeeId: string; action: 'CHECK_IN' | 'CHECK_OUT' }) {
  assertCan(access, 'fingerprint-devices.sync');
  const device = await FingerprintDevice.findOne({ _id: deviceId, tenantId: access.tenantId });
  if (!device) {
    throw new HttpError(404, 'not_found', 'Device was not found.');
  }
  if (device.provider !== 'mock') {
    throw new HttpError(409, 'provider_unsupported', 'Only the mock provider accepts queued test events.');
  }
  await DeviceInbox.create({ tenantId: access.tenantId, deviceId, ...input });
  return { queued: true };
}

export async function syncDevice(access: TenantAccess, deviceId: string) {
  assertCan(access, 'fingerprint-devices.sync');
  const device = await FingerprintDevice.findOne({ _id: deviceId, tenantId: access.tenantId });
  if (!device) {
    throw new HttpError(404, 'not_found', 'Device was not found.');
  }
  assertBranchInScope(access, String(device.branchId));
  const startedAt = new Date();
  if (device.provider !== 'mock') {
    const finishedAt = new Date();
    await DeviceSyncLog.create({
      tenantId: access.tenantId,
      deviceId,
      status: 'FAILED',
      message: 'No hardware adapter is registered for this provider. The normalized mock adapter is the only available provider.',
      eventCount: 0,
      startedAt,
      finishedAt,
    });
    device.connectionStatus = 'OFFLINE';
    await device.save();
    throw new HttpError(409, 'provider_unsupported', 'This provider has no hardware adapter.');
  }
  const queued = await DeviceInbox.find({ deviceId });
  let applied = 0;
  const failures: string[] = [];
  for (const event of queued) {
    try {
      const result = await applyDeviceEvent(device, event);
      if (!result.duplicate) {
        applied += 1;
      }
      await event.deleteOne();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Sync event failed.');
      await event.deleteOne();
    }
  }
  const finishedAt = new Date();
  const status = failures.length > 0 ? 'FAILED' : 'SUCCESS';
  await DeviceSyncLog.create({
    tenantId: access.tenantId,
    deviceId,
    status,
    message: failures[0] ?? 'Mock synchronization finished.',
    eventCount: applied,
    startedAt,
    finishedAt,
  });
  device.lastSyncAt = finishedAt;
  device.connectionStatus = status === 'SUCCESS' ? 'ONLINE' : 'OFFLINE';
  await device.save();
  return { status, eventCount: applied, failures };
}

export async function listSyncLogs(access: TenantAccess, deviceId: string) {
  assertCan(access, 'fingerprint-devices.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (deviceId) {
    const device = await FingerprintDevice.findOne({ _id: deviceId, tenantId: access.tenantId });
    if (!device) {
      throw new HttpError(404, 'not_found', 'Device was not found.');
    }
    assertBranchInScope(access, String(device.branchId));
    filter['deviceId'] = deviceId;
  }
  const rows = await DeviceSyncLog.find(filter).sort({ startedAt: -1 }).limit(100);
  return rows.map((row) => ({
    id: String(row._id),
    deviceId: String(row.deviceId),
    status: row.status,
    message: row.message,
    eventCount: row.eventCount,
    startedAt: timestamp(row.startedAt),
    finishedAt: timestamp(row.finishedAt),
  }));
}

function presentLeaveType(row: {
  _id: unknown;
  name: { en: string; ar?: string | null };
  paid: boolean;
  annualAllowance: number;
  requiresApproval: boolean;
  allowPartialDay: boolean;
  carryForward: string;
  carryForwardLimit: number;
  status: string;
}) {
  return {
    id: String(row._id),
    name: { en: row.name.en, ar: row.name.ar ?? '' },
    paid: row.paid,
    annualAllowance: row.annualAllowance,
    requiresApproval: row.requiresApproval,
    allowPartialDay: row.allowPartialDay,
    carryForward: row.carryForward,
    carryForwardLimit: row.carryForwardLimit,
    status: row.status,
  };
}

export async function listLeaveTypes(access: TenantAccess) {
  assertCan(access, 'leave-requests.view');
  const rows = await LeaveType.find({ tenantId: access.tenantId }).sort({ 'name.en': 1 });
  return rows.map((row) => presentLeaveType(row));
}

export async function saveLeaveType(access: TenantAccess, input: {
  name: { en: string; ar: string };
  paid: boolean;
  annualAllowance: number;
  requiresApproval: boolean;
  allowPartialDay: boolean;
  carryForward: 'NONE' | 'LIMITED' | 'UNLIMITED';
  carryForwardLimit: number;
  status: 'ACTIVE' | 'INACTIVE';
}, id?: string) {
  assertCan(access, 'leave-types.manage');
  const row = id ? await LeaveType.findOne({ _id: id, tenantId: access.tenantId }) : new LeaveType({ tenantId: access.tenantId });
  if (!row) {
    throw new HttpError(404, 'not_found', 'Leave type was not found.');
  }
  Object.assign(row, input);
  await row.save();
  return presentLeaveType(row);
}

async function primaryBranch(access: TenantAccess, employeeId: string) {
  const primary = await EmployeeBranch.findOne({ tenantId: access.tenantId, employeeId, status: 'ACTIVE', isPrimary: true });
  const assignment = primary ?? await EmployeeBranch.findOne({ tenantId: access.tenantId, employeeId, status: 'ACTIVE' });
  if (!assignment) {
    throw new HttpError(409, 'not_assigned', 'Assign the employee to a branch before requesting leave.');
  }
  assertBranchInScope(access, String(assignment.branchId));
  return String(assignment.branchId);
}

function remainingOf(balance: { entitled: number; adjustmentDays: number; used: number; pending: number }) {
  return balance.entitled + balance.adjustmentDays - balance.used - balance.pending;
}

async function ensureBalance(tenantId: string, employeeId: string, leaveTypeId: string, year: number) {
  const current = await LeaveBalance.findOne({ tenantId, employeeId, leaveTypeId, year });
  if (current) {
    return current;
  }
  const type = await LeaveType.findOne({ _id: leaveTypeId, tenantId });
  if (!type) {
    throw new HttpError(404, 'not_found', 'Leave type was not found.');
  }
  const previous = await LeaveBalance.findOne({ tenantId, employeeId, leaveTypeId, year: year - 1 });
  let carried = 0;
  if (previous && type.carryForward !== 'NONE') {
    const available = Math.max(remainingOf(previous), 0);
    carried = type.carryForward === 'LIMITED' ? Math.min(available, type.carryForwardLimit) : available;
  }
  try {
    return await LeaveBalance.create({
      tenantId,
      employeeId,
      leaveTypeId,
      year,
      entitled: type.annualAllowance + carried,
      carriedDays: carried,
    });
  } catch (error) {
    if (!hasDuplicateKey(error, 'year')) {
      throw error;
    }
    const again = await LeaveBalance.findOne({ tenantId, employeeId, leaveTypeId, year });
    if (!again) {
      throw error;
    }
    return again;
  }
}

async function reserveDays(balanceId: unknown, days: number, field: 'pending' | 'used') {
  const updated = await LeaveBalance.findOneAndUpdate(
    { _id: balanceId, [field]: { $gte: 0 } },
    { $inc: { [field]: days } },
    { returnDocument: 'after' },
  );
  if (!updated || updated[field] < 0) {
    throw new HttpError(409, 'leave_balance', 'The leave balance could not be updated.');
  }
}

export async function createLeaveRequest(access: TenantAccess, input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  portion: 'FULL' | 'HALF';
  reason: string;
  override: boolean;
}) {
  assertCan(access, 'leave-requests.create');
  let employeeId = input.employeeId;
  if (!employeeId) {
    const self = await Employee.findOne({ tenantId: access.tenantId, userId: access.userId, status: 'ACTIVE' });
    if (!self) {
      throw new HttpError(404, 'not_found', 'No employee record is linked to this user.');
    }
    employeeId = String(self._id);
  }
  await assertEmployeeVisible(access, employeeId);
  const type = await LeaveType.findOne({ _id: input.leaveTypeId, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!type) {
    throw new HttpError(404, 'not_found', 'Leave type was not found.');
  }
  if (input.portion === 'HALF' && !type.allowPartialDay) {
    throw new HttpError(409, 'partial_not_allowed', 'This leave type does not allow a partial day.');
  }
  const totalDays = input.portion === 'HALF' ? 0.5 : eachDate(input.startDate, input.endDate).length;
  const year = Number(input.startDate.slice(0, 4));
  const balance = await ensureBalance(access.tenantId, employeeId, input.leaveTypeId, year);
  if (remainingOf(balance) < totalDays) {
    if (!(input.override && (access.isOwner || access.permissions.has('leave-balances.manage')))) {
      throw new HttpError(409, 'leave_balance', 'The request is higher than the remaining balance.');
    }
  }
  const approved = !type.requiresApproval;
  const request = await LeaveRequest.create({
    tenantId: access.tenantId,
    employeeId,
    branchId: await primaryBranch(access, employeeId),
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    portion: input.portion,
    totalDays,
    reason: input.reason,
    status: approved ? 'APPROVED' : 'PENDING',
    requestedAt: new Date(),
    requestedBy: access.userId,
    approvedBy: approved ? access.userId : null,
    approvedAt: approved ? new Date() : null,
  });
  await reserveDays(balance._id, totalDays, approved ? 'used' : 'pending');
  if (approved) {
    await applyLeaveToAttendance(access.tenantId, employeeId, String(request.branchId), input.startDate, input.endDate);
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'leave.requested',
    entityType: 'leave-request',
    entityId: String(request._id),
    summary: 'A leave request was recorded.',
    changes: { employeeId, totalDays, status: request.status },
  });
  return presentLeave(request);
}

function presentLeave(row: {
  _id: unknown;
  employeeId: unknown;
  branchId: unknown;
  leaveTypeId: unknown;
  startDate: string;
  endDate: string;
  portion: string;
  totalDays: number;
  reason: string;
  status: string;
  requestedAt: Date;
  approvedBy?: unknown;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
}) {
  return {
    id: String(row._id),
    employeeId: String(row.employeeId),
    branchId: String(row.branchId),
    leaveTypeId: String(row.leaveTypeId),
    startDate: row.startDate,
    endDate: row.endDate,
    portion: row.portion,
    totalDays: row.totalDays,
    reason: row.reason,
    status: row.status,
    requestedAt: timestamp(row.requestedAt),
    approvedBy: row.approvedBy ? String(row.approvedBy) : '',
    approvedAt: timestamp(row.approvedAt),
    rejectionReason: row.rejectionReason ?? '',
  };
}

export async function listLeaveRequests(access: TenantAccess, status: string, employeeId: string) {
  assertCan(access, 'leave-requests.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (status) {
    filter['status'] = status;
  }
  if (employeeId) {
    await assertEmployeeVisible(access, employeeId);
    filter['employeeId'] = employeeId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const rows = await LeaveRequest.find(filter).sort({ requestedAt: -1 }).limit(200);
  return rows.map((row) => presentLeave(row));
}

async function applyLeaveToAttendance(tenantId: string, employeeId: string, branchId: string, start: string, end: string) {
  for (const date of eachDate(start, end)) {
    const existing = await Attendance.findOne({ tenantId, employeeId, branchId, attendanceDate: date });
    const classified = await classifyFor(tenantId, employeeId, branchId, date, existing?.checkInTime ?? null, existing?.checkOutTime ?? null);
    const row = existing ?? new Attendance({ tenantId, employeeId, branchId, attendanceDate: date, checkInSource: 'SYSTEM' });
    row.status = classified.status;
    row.lateMinutes = classified.lateMinutes;
    row.earlyLeaveMinutes = classified.earlyLeaveMinutes;
    row.overtimeMinutes = classified.overtimeMinutes;
    await row.save();
  }
}

export async function decideLeave(access: TenantAccess, id: string, input: { status: 'APPROVED' | 'REJECTED'; rejectionReason: string; override: boolean }) {
  assertCan(access, 'leave-requests.approve');
  const request = await LeaveRequest.findOne({ _id: id, tenantId: access.tenantId, status: 'PENDING' });
  if (!request) {
    throw new HttpError(404, 'not_found', 'Leave request was not found.');
  }
  assertBranchInScope(access, String(request.branchId));
  const balance = await ensureBalance(access.tenantId, String(request.employeeId), String(request.leaveTypeId), Number(request.startDate.slice(0, 4)));
  if (input.status === 'APPROVED') {
    const overlap = await LeaveRequest.exists({
      tenantId: access.tenantId,
      employeeId: request.employeeId,
      status: 'APPROVED',
      startDate: { $lte: request.endDate },
      endDate: { $gte: request.startDate },
    });
    if (overlap) {
      throw new HttpError(409, 'leave_overlap', 'Approved leave already covers these dates.');
    }
    if (remainingOf(balance) < 0 && !(input.override && (access.isOwner || access.permissions.has('leave-balances.manage')))) {
      throw new HttpError(409, 'leave_balance', 'Approving this request would exceed the remaining balance.');
    }
    balance.pending = Math.max(balance.pending - request.totalDays, 0);
    balance.used += request.totalDays;
    await balance.save();
    request.status = 'APPROVED';
    request.approvedBy = new Types.ObjectId(access.userId);
    request.approvedAt = new Date();
    await request.save();
    await applyLeaveToAttendance(access.tenantId, String(request.employeeId), String(request.branchId), request.startDate, request.endDate);
  } else {
    balance.pending = Math.max(balance.pending - request.totalDays, 0);
    await balance.save();
    request.status = 'REJECTED';
    request.rejectionReason = input.rejectionReason;
    request.approvedBy = new Types.ObjectId(access.userId);
    request.approvedAt = new Date();
    await request.save();
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: input.status === 'APPROVED' ? 'leave.approved' : 'leave.rejected',
    entityType: 'leave-request',
    entityId: String(request._id),
    summary: input.status === 'APPROVED' ? 'Leave was approved.' : 'Leave was rejected.',
  });
  return presentLeave(request);
}

export async function cancelLeave(access: TenantAccess, id: string) {
  assertCan(access, 'leave-requests.create');
  const request = await LeaveRequest.findOne({ _id: id, tenantId: access.tenantId, status: { $in: ['PENDING', 'APPROVED'] } });
  if (!request) {
    throw new HttpError(404, 'not_found', 'Leave request was not found.');
  }
  const self = await Employee.findOne({ tenantId: access.tenantId, userId: access.userId }).select('_id');
  const owns = self && String(self._id) === String(request.employeeId);
  if (!owns) {
    assertCan(access, 'leave-requests.approve');
    assertBranchInScope(access, String(request.branchId));
  }
  const balance = await ensureBalance(access.tenantId, String(request.employeeId), String(request.leaveTypeId), Number(request.startDate.slice(0, 4)));
  if (request.status === 'PENDING') {
    balance.pending = Math.max(balance.pending - request.totalDays, 0);
  } else {
    balance.used = Math.max(balance.used - request.totalDays, 0);
  }
  await balance.save();
  const wasApproved = request.status === 'APPROVED';
  request.status = 'CANCELLED';
  await request.save();
  if (wasApproved) {
    await applyLeaveToAttendance(access.tenantId, String(request.employeeId), String(request.branchId), request.startDate, request.endDate);
  }
  return presentLeave(request);
}

export async function listBalances(access: TenantAccess, employeeId: string, year: number) {
  assertCan(access, 'leave-balances.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId, year };
  if (employeeId) {
    await assertEmployeeVisible(access, employeeId);
    filter['employeeId'] = employeeId;
  }
  const rows = await LeaveBalance.find(filter);
  return rows.map((row) => ({
    id: String(row._id),
    employeeId: String(row.employeeId),
    leaveTypeId: String(row.leaveTypeId),
    year: row.year,
    entitled: row.entitled,
    carriedDays: row.carriedDays,
    used: row.used,
    pending: row.pending,
    adjustmentDays: row.adjustmentDays,
    remaining: remainingOf(row),
  }));
}

export async function adjustBalance(access: TenantAccess, input: { employeeId: string; leaveTypeId: string; year: number; days: number; reason: string }) {
  assertCan(access, 'leave-balances.manage');
  await assertEmployeeVisible(access, input.employeeId);
  const balance = await ensureBalance(access.tenantId, input.employeeId, input.leaveTypeId, input.year);
  balance.adjustmentDays += input.days;
  await balance.save();
  await LeaveAdjustment.create({ ...input, tenantId: access.tenantId, createdBy: access.userId });
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'leave.balance.adjusted',
    entityType: 'leave-balance',
    entityId: String(balance._id),
    summary: 'A leave balance was adjusted.',
    changes: { days: input.days, reason: input.reason },
  });
  return { id: String(balance._id), adjustmentDays: balance.adjustmentDays, remaining: remainingOf(balance) };
}

function netOf(row: {
  basicSalary: number;
  commission: number;
  tips: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  attendanceDeductions: number;
  otherDeductions: number;
}) {
  return fromMinor(addMinor([
    toMinor(row.basicSalary),
    toMinor(row.commission),
    toMinor(row.tips),
    toMinor(row.allowances),
    toMinor(row.overtime),
    toMinor(row.bonuses),
    -toMinor(row.attendanceDeductions),
    -toMinor(row.otherDeductions),
  ]));
}

function presentPayroll(row: {
  _id: unknown;
  employeeId: unknown;
  branchId: unknown;
  periodStart: string;
  periodEnd: string;
  status: string;
  correctsPayrollId?: unknown;
  basicSalary: number;
  commission: number;
  tips: number;
  allowances: number;
  overtime: number;
  attendanceDeductions: number;
  fixedDeductions: number;
  otherDeductions: number;
  bonuses: number;
  netSalary: number;
  attendanceSummary: unknown;
  adjustments: Array<{ _id?: unknown; kind: string; label: string; amount: number; reason: string; createdAt: Date }>;
  generatedBy?: unknown;
  submittedBy?: unknown;
  approvedBy?: unknown;
  paidBy?: unknown;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
}, employeeName = '') {
  return {
    id: String(row._id),
    employeeId: String(row.employeeId),
    employeeName,
    branchId: String(row.branchId),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    correctsPayrollId: row.correctsPayrollId ? String(row.correctsPayrollId) : '',
    basicSalary: row.basicSalary,
    commission: row.commission,
    tips: row.tips,
    allowances: row.allowances,
    overtime: row.overtime,
    attendanceDeductions: row.attendanceDeductions,
    fixedDeductions: row.fixedDeductions,
    otherDeductions: row.otherDeductions,
    bonuses: row.bonuses,
    netSalary: row.netSalary,
    attendanceSummary: row.attendanceSummary,
    adjustments: row.adjustments.map((item) => ({
      id: String(item._id),
      kind: item.kind,
      label: item.label,
      amount: item.amount,
      reason: item.reason,
      createdAt: timestamp(item.createdAt),
    })),
    generatedBy: row.generatedBy ? String(row.generatedBy) : '',
    submittedBy: row.submittedBy ? String(row.submittedBy) : '',
    approvedBy: row.approvedBy ? String(row.approvedBy) : '',
    paidBy: row.paidBy ? String(row.paidBy) : '',
    submittedAt: timestamp(row.submittedAt),
    approvedAt: timestamp(row.approvedAt),
    paidAt: timestamp(row.paidAt),
    paymentMethod: row.paymentMethod ?? '',
    paymentReference: row.paymentReference ?? '',
  };
}

export async function generatePayroll(access: TenantAccess, input: { periodStart: string; periodEnd: string; branchId: string; employeeIds: string[] }) {
  assertCan(access, 'payroll.generate');
  if (input.branchId) {
    await requireBranch(access, input.branchId);
  }
  const assignmentFilter: Record<string, unknown> = { tenantId: access.tenantId, status: 'ACTIVE' };
  if (input.branchId) {
    assignmentFilter['branchId'] = input.branchId;
  } else if (access.branchScope === 'SELECTED') {
    assignmentFilter['branchId'] = { $in: access.branchIds };
  }
  if (input.employeeIds.length > 0) {
    assignmentFilter['employeeId'] = { $in: input.employeeIds };
  }
  const assignments = await EmployeeBranch.find(assignmentFilter);
  const employeeIds = [...new Set(assignments.map((row) => String(row.employeeId)))];
  const zone = await zoneOf(access.tenantId);
  const from = zonedTime(input.periodStart, '00:00', zone);
  const to = zonedTime(nextDate(input.periodEnd), '00:00', zone);
  const created = [];
  const onlyEmployeeId = employeeIds.length === 1 ? employeeIds[0] : undefined;
  if (onlyEmployeeId) {
    const existing = await Payroll.exists({
      tenantId: access.tenantId,
      employeeId: onlyEmployeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      correctsPayrollId: null,
      status: { $in: ['DRAFT', 'REVIEW', 'APPROVED', 'PAID'] },
    });
    if (existing) {
      throw new HttpError(409, 'payroll_exists', 'Payroll already exists for this employee and period.');
    }
  }
  for (const employeeId of employeeIds) {
    const existing = await Payroll.exists({
      tenantId: access.tenantId,
      employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      correctsPayrollId: null,
      status: { $in: ['DRAFT', 'REVIEW', 'APPROVED', 'PAID'] },
    });
    if (existing) {
      continue;
    }
    const employee = await Employee.findOne({ _id: employeeId, tenantId: access.tenantId, status: 'ACTIVE' });
    if (!employee) {
      continue;
    }
    const primary = assignments.find((row) => String(row.employeeId) === employeeId && row.isPrimary) ?? assignments.find((row) => String(row.employeeId) === employeeId);
    if (!primary) {
      continue;
    }
    const policy = await policyFor(access.tenantId, String(primary.branchId));
    const attendance = await Attendance.find({
      tenantId: access.tenantId,
      employeeId,
      attendanceDate: { $gte: input.periodStart, $lte: input.periodEnd },
    });
    const summary = { present: 0, late: 0, absent: 0, halfDay: 0, onLeave: 0, unpaidLeaveDays: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    for (const row of attendance) {
      summary.lateMinutes += row.lateMinutes;
      summary.earlyLeaveMinutes += row.earlyLeaveMinutes;
      summary.overtimeMinutes += row.overtimeMinutes;
      if (row.status === 'PRESENT') summary.present += 1;
      if (row.status === 'LATE') summary.late += 1;
      if (row.status === 'ABSENT') summary.absent += 1;
      if (row.status === 'HALF_DAY') summary.halfDay += 1;
      if (row.status === 'ON_LEAVE') summary.onLeave += 1;
    }
    const unpaid = await unpaidLeaveDays(access.tenantId, employeeId, input.periodStart, input.periodEnd);
    summary.unpaidLeaveDays = unpaid;
    const sales = await SaleTransaction.find({
      tenantId: access.tenantId,
      status: { $in: ['PAID', 'PARTIALLY_REFUNDED'] },
      createdAt: { $gte: from, $lt: to },
    }).select('_id');
    const saleIds = sales.map((sale) => sale._id);
    const commissions = await CommissionSnapshot.find({ tenantId: access.tenantId, employeeId, transactionId: { $in: saleIds } });
    const tips = await Tip.find({ tenantId: access.tenantId, employeeId, transactionId: { $in: saleIds } });
    const commission = fromMinor(addMinor(commissions.map((row) => toMinor(row.commissionAmountSnapshot))));
    const tipTotal = fromMinor(addMinor(tips.map((row) => toMinor(row.amount))));
    const basic = periodBasic(employee.salary.period, employee.salary.basicSalary, summary, eachDate(input.periodStart, input.periodEnd).length);
    const dailyMinor = policy.absenceDeductionMode === 'DAILY_RATE' ? Math.round(toMinor(basic) / policy.dailyRateDays) : 0;
    const attendanceDeductions = fromMinor(addMinor([
      Math.round(toMinor(policy.lateDeductionPerMinute) * summary.lateMinutes),
      Math.round(toMinor(policy.earlyLeaveDeductionPerMinute) * summary.earlyLeaveMinutes),
      dailyMinor * summary.absent,
      Math.round(dailyMinor * summary.halfDay * policy.halfDayFactor),
      Math.round(dailyMinor * unpaid),
    ]));
    const hourlyMinor = Math.round(toMinor(basic) / policy.monthlyHours);
    const overtime = fromMinor(Math.round(hourlyMinor * (summary.overtimeMinutes / 60) * policy.overtimeMultiplier));
    const draft = {
      basicSalary: basic,
      commission,
      tips: tipTotal,
      allowances: employee.salary.allowances,
      overtime,
      bonuses: 0,
      attendanceDeductions,
      fixedDeductions: employee.salary.deductions,
      otherDeductions: employee.salary.deductions,
    };
    try {
      const payroll = await Payroll.create({
        tenantId: access.tenantId,
        employeeId,
        branchId: primary.branchId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'DRAFT',
        correctsPayrollId: null,
        ...draft,
        netSalary: netOf(draft),
        attendanceSummary: summary,
        generatedBy: access.userId,
      });
      created.push(presentPayroll(payroll, employee.fullName));
    } catch (error) {
      if (!hasDuplicateKey(error, 'employeeId')) {
        throw error;
      }
    }
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'payroll.generated',
    entityType: 'payroll',
    entityId: input.periodStart,
    summary: 'Payroll drafts were generated.',
    changes: { periodStart: input.periodStart, periodEnd: input.periodEnd, count: created.length },
  });
  return created;
}

function nextDate(date: string): string {
  const parts = date.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + 1));
  return utc.toISOString().slice(0, 10);
}

function periodBasic(period: string, basic: number, summary: { present: number; late: number; halfDay: number; onLeave: number }, dayCount: number): number {
  if (period === 'DAILY') {
    return fromMinor(Math.round(toMinor(basic) * (summary.present + summary.late + summary.onLeave + summary.halfDay * 0.5)));
  }
  if (period === 'WEEKLY') {
    return fromMinor(Math.round(toMinor(basic) * (dayCount / 7)));
  }
  return basic;
}

async function unpaidLeaveDays(tenantId: string, employeeId: string, start: string, end: string) {
  const requests = await LeaveRequest.find({
    tenantId,
    employeeId,
    status: 'APPROVED',
    startDate: { $lte: end },
    endDate: { $gte: start },
  });
  const types = await LeaveType.find({ tenantId, _id: { $in: requests.map((row) => row.leaveTypeId) }, paid: false });
  const unpaidIds = new Set(types.map((row) => String(row._id)));
  let days = 0;
  for (const request of requests) {
    if (!unpaidIds.has(String(request.leaveTypeId))) {
      continue;
    }
    if (request.portion === 'HALF') {
      days += 0.5;
      continue;
    }
    days += eachDate(request.startDate > start ? request.startDate : start, request.endDate < end ? request.endDate : end).length;
  }
  return days;
}

export async function listPayroll(access: TenantAccess, query: { periodStart: string; periodEnd: string; status: string }) {
  assertCan(access, 'payroll.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.periodStart) {
    filter['periodStart'] = query.periodStart;
  }
  if (query.periodEnd) {
    filter['periodEnd'] = query.periodEnd;
  }
  if (query.status) {
    filter['status'] = query.status;
  }
  if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const rows = await Payroll.find(filter).sort({ periodStart: -1, createdAt: -1 }).limit(200);
  const names = await namesFor(access.tenantId, rows.map((row) => String(row.employeeId)));
  return rows.map((row) => presentPayroll(row, names.get(String(row.employeeId)) ?? ''));
}

export async function getPayroll(access: TenantAccess, id: string) {
  assertCan(access, 'payroll.view');
  const row = await Payroll.findOne({ _id: id, tenantId: access.tenantId });
  if (!row) {
    throw new HttpError(404, 'not_found', 'Payroll was not found.');
  }
  assertBranchInScope(access, String(row.branchId));
  const employee = await Employee.findOne({ _id: row.employeeId, tenantId: access.tenantId }).select('fullName');
  return presentPayroll(row, employee?.fullName ?? '');
}

function editable(status: string) {
  if (status !== 'DRAFT' && status !== 'REVIEW') {
    throw new HttpError(409, 'payroll_locked', 'Finalized payroll cannot be edited. Create a correction instead.');
  }
}

export async function adjustPayroll(access: TenantAccess, id: string, input: { kind: 'BONUS' | 'DEDUCTION'; label: string; amount: number; reason: string }) {
  assertCan(access, 'payroll.adjust');
  const row = await Payroll.findOne({ _id: id, tenantId: access.tenantId });
  if (!row) {
    throw new HttpError(404, 'not_found', 'Payroll was not found.');
  }
  assertBranchInScope(access, String(row.branchId));
  editable(row.status);
  row.adjustments.push({ ...input, createdBy: new Types.ObjectId(access.userId), createdAt: new Date() });
  const bonuses = fromMinor(addMinor(row.adjustments.filter((item) => item.kind === 'BONUS').map((item) => toMinor(item.amount))));
  const extra = fromMinor(addMinor(row.adjustments.filter((item) => item.kind === 'DEDUCTION').map((item) => toMinor(item.amount))));
  row.bonuses = bonuses;
  row.otherDeductions = fromMinor(toMinor(row.fixedDeductions) + toMinor(extra));
  row.netSalary = netOf(row);
  await row.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'payroll.adjusted',
    entityType: 'payroll',
    entityId: String(row._id),
    summary: 'A payroll adjustment was recorded.',
    changes: input,
  });
  return getPayroll(access, id);
}

async function movePayroll(access: TenantAccess, id: string, from: string[], to: 'REVIEW' | 'APPROVED' | 'PAID' | 'CANCELLED', permission: PermissionKey, apply: (row: InstanceType<typeof Payroll>) => void) {
  assertCan(access, permission);
  const row = await Payroll.findOne({ _id: id, tenantId: access.tenantId });
  if (!row || !from.includes(row.status)) {
    throw new HttpError(409, 'payroll_state', 'Payroll is not in a state that allows this action.');
  }
  assertBranchInScope(access, String(row.branchId));
  row.status = to;
  apply(row);
  await row.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: `payroll.${to.toLowerCase()}`,
    entityType: 'payroll',
    entityId: String(row._id),
    summary: `Payroll moved to ${to}.`,
  });
  return getPayroll(access, id);
}

export function submitPayroll(access: TenantAccess, id: string) {
  return movePayroll(access, id, ['DRAFT'], 'REVIEW', 'payroll.review', (row) => {
    row.submittedBy = new Types.ObjectId(access.userId);
    row.submittedAt = new Date();
  });
}

export function approvePayroll(access: TenantAccess, id: string) {
  return movePayroll(access, id, ['REVIEW'], 'APPROVED', 'payroll.approve', (row) => {
    row.approvedBy = new Types.ObjectId(access.userId);
    row.approvedAt = new Date();
  });
}

export function payPayroll(access: TenantAccess, id: string, method: string, reference: string) {
  return movePayroll(access, id, ['APPROVED'], 'PAID', 'payroll.pay', (row) => {
    row.paidBy = new Types.ObjectId(access.userId);
    row.paidAt = new Date();
    row.paymentMethod = method;
    row.paymentReference = reference;
  });
}

export function cancelPayroll(access: TenantAccess, id: string) {
  return movePayroll(access, id, ['DRAFT', 'REVIEW'], 'CANCELLED', 'payroll.generate', () => undefined);
}

export async function correctPayroll(access: TenantAccess, id: string) {
  assertCan(access, 'payroll.adjust');
  const original = await Payroll.findOne({ _id: id, tenantId: access.tenantId, status: 'PAID' });
  if (!original) {
    throw new HttpError(409, 'payroll_state', 'A correction can be opened from paid payroll.');
  }
  assertBranchInScope(access, String(original.branchId));
  const open = await Payroll.exists({ tenantId: access.tenantId, correctsPayrollId: original._id, status: { $in: ['DRAFT', 'REVIEW'] } });
  if (open) {
    throw new HttpError(409, 'payroll_exists', 'A correction is already open for this payroll.');
  }
  const correction = await Payroll.create({
    tenantId: access.tenantId,
    employeeId: original.employeeId,
    branchId: original.branchId,
    periodStart: original.periodStart,
    periodEnd: original.periodEnd,
    status: 'DRAFT',
    correctsPayrollId: original._id,
    basicSalary: original.basicSalary,
    commission: original.commission,
    tips: original.tips,
    allowances: original.allowances,
    overtime: original.overtime,
    attendanceDeductions: original.attendanceDeductions,
    fixedDeductions: original.fixedDeductions,
    otherDeductions: original.otherDeductions,
    bonuses: original.bonuses,
    netSalary: original.netSalary,
    attendanceSummary: original.attendanceSummary,
    generatedBy: access.userId,
  });
  return getPayroll(access, String(correction._id));
}

export async function attendanceDashboard(access: TenantAccess, branchId: string, date: string) {
  assertCan(access, 'attendance.view');
  await requireBranch(access, branchId);
  const rows = await Attendance.find({ tenantId: access.tenantId, branchId, attendanceDate: date });
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0, DAY_OFF: 0, total: rows.length };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}
