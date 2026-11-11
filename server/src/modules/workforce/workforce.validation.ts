import { z } from 'zod';
import { objectId } from '../branches/branch.validation.js';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^\d{2}:\d{2}$/);
const money = z.number().min(0).max(10_000_000);
const empty = z.object({}).passthrough();

const day = z.object({
  weekday: z.number().int().min(0).max(6),
  working: z.boolean(),
  startTime: clock,
  endTime: clock,
  breakMinutes: z.number().int().min(0).max(600),
}).superRefine((value, context) => {
  if (value.working && value.endTime <= value.startTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The shift must end after it starts.', path: ['endTime'] });
  }
});

const holiday = z.object({ date: dateOnly, name: z.string().trim().min(1).max(80) });

export const policySchema = z.object({
  body: z.object({
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    graceMinutes: z.number().int().min(0).max(240),
    earlyLeaveGraceMinutes: z.number().int().min(0).max(240),
    halfDayRatio: z.number().min(0).max(1),
    overtimeRoundingMinutes: z.number().int().min(0).max(60),
    weeklyDaysOff: z.array(z.number().int().min(0).max(6)).max(7),
    publicHolidays: z.array(holiday).max(40),
    lateDeductionPerMinute: money,
    earlyLeaveDeductionPerMinute: money,
    absenceDeductionMode: z.enum(['NONE', 'DAILY_RATE']),
    dailyRateDays: z.number().int().min(1).max(31),
    halfDayFactor: z.number().min(0).max(1),
    overtimeMultiplier: z.number().min(0).max(5),
    monthlyHours: z.number().int().min(1).max(400),
  }),
  query: empty,
  params: empty,
});

export const policyQuerySchema = z.object({
  body: empty,
  query: z.object({ branchId: z.union([objectId, z.literal('')]).optional().default('') }),
  params: empty,
});

export const scheduleSchema = z.object({
  body: z.object({
    employeeId: objectId,
    branchId: objectId,
    days: z.array(day).length(7),
    effectiveFrom: dateOnly,
    effectiveTo: z.union([dateOnly, z.literal('')]).optional().default(''),
  }).superRefine((value, context) => {
    const weekdays = new Set(value.days.map((row) => row.weekday));
    if (weekdays.size !== 7) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Include each weekday once.', path: ['days'] });
    }
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'The schedule must end on or after it starts.', path: ['effectiveTo'] });
    }
  }),
  query: empty,
  params: z.object({ id: objectId.optional() }).passthrough(),
});

export const scheduleListSchema = z.object({
  body: empty,
  query: z.object({ employeeId: z.union([objectId, z.literal('')]).optional().default(''), branchId: z.union([objectId, z.literal('')]).optional().default('') }),
  params: empty,
});

export const attendanceListSchema = z.object({
  body: empty,
  query: z.object({
    branchId: objectId,
    from: dateOnly,
    to: dateOnly,
    employeeId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: empty,
});

export const checkSchema = z.object({
  body: z.object({
    employeeId: objectId,
    branchId: objectId,
    notes: z.string().trim().max(500).optional().default(''),
  }),
  query: empty,
  params: empty,
});

export const correctSchema = z.object({
  body: z.object({
    checkInTime: z.union([z.string().datetime(), z.literal('')]).optional().default(''),
    checkOutTime: z.union([z.string().datetime(), z.literal('')]).optional().default(''),
    notes: z.string().trim().max(500).optional().default(''),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const closeDaySchema = z.object({
  body: z.object({ branchId: objectId, date: dateOnly }),
  query: empty,
  params: empty,
});

export const summarySchema = z.object({
  body: empty,
  query: z.object({ branchId: objectId, date: dateOnly }),
  params: empty,
});

export const deviceSchema = z.object({
  body: z.object({
    branchId: objectId,
    name: z.string().trim().min(1).max(80),
    serialNumber: z.string().trim().min(1).max(80),
    provider: z.string().trim().min(1).max(40).optional().default('mock'),
    deviceType: z.string().trim().min(1).max(40).optional().default('fingerprint'),
  }),
  query: empty,
  params: empty,
});

export const deviceStatusSchema = z.object({
  body: z.object({ status: z.enum(['ENABLED', 'DISABLED']) }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const deviceMapSchema = z.object({
  body: z.object({ employeeId: objectId, externalEmployeeId: z.string().trim().min(1).max(80) }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const mockEventSchema = z.object({
  body: z.object({
    externalEventId: z.string().trim().min(1).max(120),
    externalEmployeeId: z.string().trim().min(1).max(80),
    action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const ingestSchema = z.object({
  body: z.object({
    serialNumber: z.string().trim().min(1).max(80),
    externalEventId: z.string().trim().min(1).max(120),
    externalEmployeeId: z.string().trim().min(1).max(80),
    action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  }),
  query: empty,
  params: empty,
});

export const idSchema = z.object({ body: empty, query: empty, params: z.object({ id: objectId }) });

export const noneSchema = z.object({ body: empty, query: empty, params: empty });

export const leaveTypeSchema = z.object({
  body: z.object({
    name: z.object({ en: z.string().trim().min(1).max(80), ar: z.string().trim().max(80).optional().default('') }),
    paid: z.boolean(),
    annualAllowance: z.number().min(0).max(366),
    requiresApproval: z.boolean(),
    allowPartialDay: z.boolean(),
    carryForward: z.enum(['NONE', 'LIMITED', 'UNLIMITED']),
    carryForwardLimit: z.number().min(0).max(366),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  }),
  query: empty,
  params: z.object({ id: objectId.optional() }).passthrough(),
});

export const leaveRequestSchema = z.object({
  body: z.object({
    employeeId: z.union([objectId, z.literal('')]).optional().default(''),
    leaveTypeId: objectId,
    startDate: dateOnly,
    endDate: dateOnly,
    portion: z.enum(['FULL', 'HALF']).optional().default('FULL'),
    reason: z.string().trim().min(2).max(500),
    override: z.boolean().optional().default(false),
  }).superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Leave must end on or after it starts.', path: ['endDate'] });
    }
    if (value.portion === 'HALF' && value.startDate !== value.endDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A half day uses one date.', path: ['portion'] });
    }
  }),
  query: empty,
  params: empty,
});

export const leaveListSchema = z.object({
  body: empty,
  query: z.object({
    status: z.union([z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']), z.literal('')]).optional().default(''),
    employeeId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: empty,
});

export const leaveDecisionSchema = z.object({
  body: z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().max(500).optional().default(''),
    override: z.boolean().optional().default(false),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const balanceListSchema = z.object({
  body: empty,
  query: z.object({
    employeeId: z.union([objectId, z.literal('')]).optional().default(''),
    year: z.coerce.number().int().min(2000).max(2100),
  }),
  params: empty,
});

export const balanceAdjustSchema = z.object({
  body: z.object({
    employeeId: objectId,
    leaveTypeId: objectId,
    year: z.number().int().min(2000).max(2100),
    days: z.number().min(-366).max(366),
    reason: z.string().trim().min(2).max(500),
  }),
  query: empty,
  params: empty,
});

export const payrollGenerateSchema = z.object({
  body: z.object({
    periodStart: dateOnly,
    periodEnd: dateOnly,
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    employeeIds: z.array(objectId).max(200).optional().default([]),
  }).superRefine((value, context) => {
    if (value.periodEnd < value.periodStart) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'The period must end on or after it starts.', path: ['periodEnd'] });
    }
  }),
  query: empty,
  params: empty,
});

export const payrollListSchema = z.object({
  body: empty,
  query: z.object({
    periodStart: z.union([dateOnly, z.literal('')]).optional().default(''),
    periodEnd: z.union([dateOnly, z.literal('')]).optional().default(''),
    status: z.union([z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED']), z.literal('')]).optional().default(''),
  }),
  params: empty,
});

export const payrollAdjustSchema = z.object({
  body: z.object({
    kind: z.enum(['BONUS', 'DEDUCTION']),
    label: z.string().trim().min(1).max(80),
    amount: money.refine((value) => value > 0, 'Enter an amount.'),
    reason: z.string().trim().min(2).max(240),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});

export const payrollPaySchema = z.object({
  body: z.object({
    method: z.enum(['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER']),
    reference: z.string().trim().max(80).optional().default(''),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});
