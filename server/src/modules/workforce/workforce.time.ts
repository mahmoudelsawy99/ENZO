/**
 * Calendar math in the tenant timezone.
 * Attendance rules stay here so device adapters do not invent late or absence decisions.
 */

export interface DaySchedule {
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface AttendanceRuleInput {
  graceMinutes: number;
  earlyLeaveGraceMinutes: number;
  halfDayRatio: number;
  overtimeRoundingMinutes: number;
  weeklyDaysOff: number[];
}

export interface ClassifiedAttendance {
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'DAY_OFF';
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

export function wallParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
}

export function todayInZone(timeZone: string, now = new Date()): string {
  const wall = wallParts(now, timeZone);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

export function formatInZone(value: Date | null, timeZone: string): string {
  if (!value) {
    return '';
  }
  const wall = wallParts(value, timeZone);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')} ${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
}

/** Instant whose wall-clock time in the tenant timezone is the given date and time. */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const dateParts = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const year = dateParts[0] ?? 1970;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  let instant = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const wall = wallParts(instant, timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const next = new Date(instant.getTime() - (got - wanted));
    if (next.getTime() === instant.getTime()) {
      break;
    }
    instant = next;
  }
  return instant;
}

export function weekdayOf(date: string, timeZone: string): number {
  const instant = zonedTime(date, '12:00', timeZone);
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return days[name] ?? 0;
}

export function addDays(date: string, days: number): string {
  const parts = date.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < 370) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function minutesOfClock(value: string): number {
  const parts = value.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function roundDown(minutes: number, step: number): number {
  if (step <= 1) {
    return minutes;
  }
  return Math.floor(minutes / step) * step;
}

/**
 * Status comes from the schedule, leave, and recorded times.
 * Deduction money is intentionally absent: payroll applies the configured rates later.
 */
export function classifyAttendance(input: {
  date: string;
  timeZone: string;
  rules: AttendanceRuleInput;
  holiday: boolean;
  schedule: DaySchedule | null;
  leave: 'FULL' | 'HALF' | null;
  checkIn: Date | null;
  checkOut: Date | null;
}): ClassifiedAttendance {
  const weekday = weekdayOf(input.date, input.timeZone);
  const scheduledOff = input.schedule ? !input.schedule.working : input.rules.weeklyDaysOff.includes(weekday);
  const dayOff = input.holiday || scheduledOff;
  if (input.leave === 'FULL') {
    return { status: 'ON_LEAVE', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
  }
  if (!input.checkIn) {
    if (dayOff) {
      return { status: 'DAY_OFF', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    }
    if (input.leave === 'HALF') {
      return { status: 'HALF_DAY', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    }
    return { status: 'ABSENT', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
  }
  const arrived = minutesOfClock(formatInZone(input.checkIn, input.timeZone).slice(11));
  const left = input.checkOut ? minutesOfClock(formatInZone(input.checkOut, input.timeZone).slice(11)) : null;
  if (dayOff) {
    const worked = left === null ? 0 : Math.max(left - arrived, 0);
    return { status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: roundDown(worked, input.rules.overtimeRoundingMinutes) };
  }
  const start = input.schedule?.working ? minutesOfClock(input.schedule.startTime) : null;
  const end = input.schedule?.working ? minutesOfClock(input.schedule.endTime) : null;
  const breakMinutes = input.schedule?.breakMinutes ?? 0;
  const lateMinutes = start === null ? 0 : Math.max(arrived - start - input.rules.graceMinutes, 0);
  const earlyLeaveMinutes = end === null || left === null ? 0 : Math.max(end - left - input.rules.earlyLeaveGraceMinutes, 0);
  const overtimeMinutes = end === null || left === null ? 0 : roundDown(Math.max(left - end, 0), input.rules.overtimeRoundingMinutes);
  const expected = start === null || end === null ? 0 : Math.max(end - start - breakMinutes, 0);
  const worked = left === null ? expected : Math.max(left - arrived - breakMinutes, 0);
  let status: ClassifiedAttendance['status'] = lateMinutes > 0 ? 'LATE' : 'PRESENT';
  if (input.leave === 'HALF') {
    status = 'HALF_DAY';
  } else if (left !== null && expected > 0 && worked < expected * input.rules.halfDayRatio) {
    status = 'HALF_DAY';
  }
  return { status, lateMinutes, earlyLeaveMinutes, overtimeMinutes };
}
