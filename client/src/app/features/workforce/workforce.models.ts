export interface AttendanceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime: string;
  checkInLabel: string;
  checkOutLabel: string;
  checkInSource: string;
  checkOutSource: string;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  notes: string;
  revisions: Array<{ at: string; by: string; summary: string }>;
}

export interface AttendanceCounts {
  PRESENT: number;
  LATE: number;
  ABSENT: number;
  HALF_DAY: number;
  ON_LEAVE: number;
  DAY_OFF: number;
  total?: number;
}

export interface WorkSchedule {
  id: string;
  employeeId: string;
  branchId: string;
  days: Array<{ weekday: number; working: boolean; startTime: string; endTime: string; breakMinutes: number }>;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface AttendancePolicy {
  id: string;
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
}

export interface FingerprintDevice {
  id: string;
  branchId: string;
  name: string;
  serialNumber: string;
  provider: string;
  deviceType: string;
  status: 'ENABLED' | 'DISABLED';
  connectionStatus: string;
  lastSyncAt: string;
  hardwareReady: boolean;
  adapter: string;
}

export interface DeviceSyncLog {
  id: string;
  deviceId: string;
  status: string;
  message: string;
  eventCount: number;
  startedAt: string;
  finishedAt: string;
}

export interface LeaveType {
  id: string;
  name: { en: string; ar: string };
  paid: boolean;
  annualAllowance: number;
  requiresApproval: boolean;
  allowPartialDay: boolean;
  carryForward: 'NONE' | 'LIMITED' | 'UNLIMITED';
  carryForwardLimit: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  branchId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  portion: string;
  totalDays: number;
  reason: string;
  status: string;
  requestedAt: string;
  approvedBy: string;
  approvedAt: string;
  rejectionReason: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitled: number;
  carriedDays: number;
  used: number;
  pending: number;
  adjustmentDays: number;
  remaining: number;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  correctsPayrollId: string;
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
  attendanceSummary: {
    present: number;
    late: number;
    absent: number;
    halfDay: number;
    onLeave: number;
    unpaidLeaveDays: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;
  };
  adjustments: Array<{ id: string; kind: string; label: string; amount: number; reason: string; createdAt: string }>;
  generatedBy: string;
  submittedBy: string;
  approvedBy: string;
  paidBy: string;
  submittedAt: string;
  approvedAt: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string;
}
