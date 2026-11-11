import { Schema, model } from 'mongoose';

const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'DAY_OFF'] as const;
const ATTENDANCE_SOURCES = ['MANUAL', 'DEVICE', 'SYSTEM'] as const;
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const PAYROLL_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED'] as const;
const nameSchema = new Schema(
  { en: { type: String, required: true, trim: true, maxlength: 80 }, ar: { type: String, default: '', trim: true, maxlength: 80 } },
  { _id: false },
);

const daySchema = new Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    working: { type: Boolean, required: true },
    startTime: { type: String, required: true, trim: true, maxlength: 5 },
    endTime: { type: String, required: true, trim: true, maxlength: 5 },
    breakMinutes: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const holidaySchema = new Schema(
  { date: { type: String, required: true, trim: true, maxlength: 10 }, name: { type: String, required: true, trim: true, maxlength: 80 } },
  { _id: false },
);

/**
 * Tenant default when branchId is null. A branch document replaces the whole policy for that branch.
 * Rates are configuration. Attendance classification does not apply them.
 */
const policySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    graceMinutes: { type: Number, required: true, min: 0, default: 15 },
    earlyLeaveGraceMinutes: { type: Number, required: true, min: 0, default: 0 },
    halfDayRatio: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    overtimeRoundingMinutes: { type: Number, required: true, min: 0, default: 0 },
    weeklyDaysOff: { type: [Number], required: true, default: [5] },
    publicHolidays: { type: [holidaySchema], required: true, default: [] },
    lateDeductionPerMinute: { type: Number, required: true, min: 0, default: 0 },
    earlyLeaveDeductionPerMinute: { type: Number, required: true, min: 0, default: 0 },
    absenceDeductionMode: { type: String, required: true, enum: ['NONE', 'DAILY_RATE'], default: 'NONE' },
    dailyRateDays: { type: Number, required: true, min: 1, default: 30 },
    halfDayFactor: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    overtimeMultiplier: { type: Number, required: true, min: 0, default: 1.5 },
    monthlyHours: { type: Number, required: true, min: 1, default: 208 },
  },
  { timestamps: true },
);
policySchema.index({ tenantId: 1, branchId: 1 }, { unique: true });

const scheduleSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    days: { type: [daySchema], required: true },
    effectiveFrom: { type: String, required: true, trim: true, maxlength: 10 },
    effectiveTo: { type: String, default: '', trim: true, maxlength: 10 },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);
scheduleSchema.index({ tenantId: 1, employeeId: 1, branchId: 1, effectiveFrom: 1 });

const revisionSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { _id: false },
);

const attendanceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    attendanceDate: { type: String, required: true, trim: true, maxlength: 10 },
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    checkInSource: { type: String, required: true, enum: ATTENDANCE_SOURCES, default: 'SYSTEM' },
    checkOutSource: { type: String, default: '', enum: ['', ...ATTENDANCE_SOURCES] },
    status: { type: String, required: true, enum: ATTENDANCE_STATUSES },
    lateMinutes: { type: Number, required: true, min: 0, default: 0 },
    earlyLeaveMinutes: { type: Number, required: true, min: 0, default: 0 },
    overtimeMinutes: { type: Number, required: true, min: 0, default: 0 },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revisions: { type: [revisionSchema], default: [] },
  },
  { timestamps: true },
);
attendanceSchema.index({ tenantId: 1, employeeId: 1, branchId: 1, attendanceDate: 1 }, { unique: true });
attendanceSchema.index({ tenantId: 1, branchId: 1, attendanceDate: 1 });

const deviceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    serialNumber: { type: String, required: true, trim: true, maxlength: 80 },
    provider: { type: String, required: true, trim: true, maxlength: 40, default: 'mock' },
    deviceType: { type: String, required: true, trim: true, maxlength: 40, default: 'fingerprint' },
    status: { type: String, required: true, enum: ['ENABLED', 'DISABLED'], default: 'ENABLED' },
    connectionStatus: { type: String, required: true, enum: ['ONLINE', 'OFFLINE', 'UNKNOWN'], default: 'UNKNOWN' },
    lastSyncAt: { type: Date, default: null },
    keyHash: { type: String, required: true },
  },
  { timestamps: true },
);
deviceSchema.index({ tenantId: 1, serialNumber: 1 }, { unique: true });

const deviceMapSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'FingerprintDevice', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    externalEmployeeId: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);
deviceMapSchema.index({ deviceId: 1, externalEmployeeId: 1 }, { unique: true });

const deviceEventSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'FingerprintDevice', required: true, index: true },
    externalEventId: { type: String, required: true, trim: true, maxlength: 120 },
    externalEmployeeId: { type: String, required: true, trim: true, maxlength: 80 },
    action: { type: String, required: true, enum: ['CHECK_IN', 'CHECK_OUT'] },
    status: { type: String, required: true, enum: ['APPLIED', 'FAILED'], default: 'APPLIED' },
    message: { type: String, default: '', trim: true, maxlength: 240 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
deviceEventSchema.index({ deviceId: 1, externalEventId: 1 }, { unique: true });

const inboxSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'FingerprintDevice', required: true, index: true },
    externalEventId: { type: String, required: true, trim: true, maxlength: 120 },
    externalEmployeeId: { type: String, required: true, trim: true, maxlength: 80 },
    action: { type: String, required: true, enum: ['CHECK_IN', 'CHECK_OUT'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
inboxSchema.index({ deviceId: 1, externalEventId: 1 }, { unique: true });

const syncLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'FingerprintDevice', required: true, index: true },
    status: { type: String, required: true, enum: ['SUCCESS', 'FAILED'] },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    eventCount: { type: Number, required: true, min: 0, default: 0 },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const leaveTypeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: nameSchema, required: true },
    paid: { type: Boolean, required: true, default: true },
    annualAllowance: { type: Number, required: true, min: 0, default: 0 },
    requiresApproval: { type: Boolean, required: true, default: true },
    allowPartialDay: { type: Boolean, required: true, default: true },
    carryForward: { type: String, required: true, enum: ['NONE', 'LIMITED', 'UNLIMITED'], default: 'NONE' },
    carryForwardLimit: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

const leaveRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    startDate: { type: String, required: true, trim: true, maxlength: 10 },
    endDate: { type: String, required: true, trim: true, maxlength: 10 },
    portion: { type: String, required: true, enum: ['FULL', 'HALF'], default: 'FULL' },
    totalDays: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, required: true, enum: LEAVE_STATUSES, default: 'PENDING' },
    requestedAt: { type: Date, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);
leaveRequestSchema.index({ tenantId: 1, employeeId: 1, status: 1, startDate: 1 });

const leaveBalanceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    entitled: { type: Number, required: true, min: 0 },
    carriedDays: { type: Number, required: true, min: 0, default: 0 },
    used: { type: Number, required: true, min: 0, default: 0 },
    pending: { type: Number, required: true, min: 0, default: 0 },
    adjustmentDays: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);
leaveBalanceSchema.index({ tenantId: 1, employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

const leaveAdjustmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const payrollAdjustmentSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['BONUS', 'DEDUCTION'] },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 240 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: true },
);

const payrollSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    periodStart: { type: String, required: true, trim: true, maxlength: 10 },
    periodEnd: { type: String, required: true, trim: true, maxlength: 10 },
    status: { type: String, required: true, enum: PAYROLL_STATUSES, default: 'DRAFT' },
    correctsPayrollId: { type: Schema.Types.ObjectId, ref: 'Payroll', default: null },
    basicSalary: { type: Number, required: true, min: 0, default: 0 },
    commission: { type: Number, required: true, min: 0, default: 0 },
    tips: { type: Number, required: true, min: 0, default: 0 },
    allowances: { type: Number, required: true, min: 0, default: 0 },
    overtime: { type: Number, required: true, min: 0, default: 0 },
    attendanceDeductions: { type: Number, required: true, min: 0, default: 0 },
    fixedDeductions: { type: Number, required: true, min: 0, default: 0 },
    otherDeductions: { type: Number, required: true, min: 0, default: 0 },
    bonuses: { type: Number, required: true, min: 0, default: 0 },
    netSalary: { type: Number, required: true, default: 0 },
    attendanceSummary: {
      type: new Schema(
        {
          present: { type: Number, required: true, default: 0 },
          late: { type: Number, required: true, default: 0 },
          absent: { type: Number, required: true, default: 0 },
          halfDay: { type: Number, required: true, default: 0 },
          onLeave: { type: Number, required: true, default: 0 },
          unpaidLeaveDays: { type: Number, required: true, default: 0 },
          lateMinutes: { type: Number, required: true, default: 0 },
          earlyLeaveMinutes: { type: Number, required: true, default: 0 },
          overtimeMinutes: { type: Number, required: true, default: 0 },
        },
        { _id: false },
      ),
      required: true,
    },
    adjustments: { type: [payrollAdjustmentSchema], default: [] },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, default: '', trim: true, maxlength: 40 },
    paymentReference: { type: String, default: '', trim: true, maxlength: 80 },
  },
  { timestamps: true },
);
payrollSchema.index(
  { tenantId: 1, employeeId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['DRAFT', 'REVIEW', 'APPROVED', 'PAID'] }, correctsPayrollId: null } },
);

export const AttendancePolicy = model('AttendancePolicy', policySchema);
export const WorkSchedule = model('WorkSchedule', scheduleSchema);
export const Attendance = model('Attendance', attendanceSchema);
export const FingerprintDevice = model('FingerprintDevice', deviceSchema);
export const DeviceEmployeeMap = model('DeviceEmployeeMap', deviceMapSchema);
export const DeviceEvent = model('DeviceEvent', deviceEventSchema);
export const DeviceInbox = model('DeviceInbox', inboxSchema);
export const DeviceSyncLog = model('DeviceSyncLog', syncLogSchema);
export const LeaveType = model('LeaveType', leaveTypeSchema);
export const LeaveRequest = model('LeaveRequest', leaveRequestSchema);
export const LeaveBalance = model('LeaveBalance', leaveBalanceSchema);
export const LeaveAdjustment = model('LeaveAdjustment', leaveAdjustmentSchema);
export const Payroll = model('Payroll', payrollSchema);
