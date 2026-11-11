import assert from 'node:assert/strict';
import type { Express } from 'express';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type mongoose from 'mongoose';
import request from 'supertest';
import { zonedTime } from '../src/modules/workforce/workforce.time.js';

process.env['NODE_ENV'] = 'test';
process.env['JWT_ACCESS_SECRET'] = 'a'.repeat(48);
process.env['JWT_REFRESH_SECRET'] = 'b'.repeat(48);
process.env['COOKIE_SECURE'] = 'false';
process.env['SUPER_ADMIN_EMAIL'] = '';
process.env['SUPER_ADMIN_PASSWORD'] = '';

let replSet: MongoMemoryReplSet;
let db: typeof mongoose;
let app: Express;
let User: typeof import('../src/modules/users/user.model.js').User;
let Employee: typeof import('../src/modules/employees/employee.model.js').Employee;
let AuditLog: typeof import('../src/modules/access/audit.model.js').AuditLog;
let SaleTransaction: typeof import('../src/modules/pos/sale.model.js').SaleTransaction;
let Tip: typeof import('../src/modules/pos/sale.model.js').Tip;
let CommissionSnapshot: typeof import('../src/modules/pos/sale.model.js').CommissionSnapshot;
let CommissionRule: typeof import('../src/modules/commissions/commission.model.js').CommissionRule;

const adminEmail = 'admin@enzo.test';
const adminPassword = 'ValidPass1';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function hours() {
  const open = { isOpen: true, openingTime: '10:00', closingTime: '22:00' };
  const closed = { isOpen: false, openingTime: '10:00', closingTime: '22:00' };
  return { saturday: open, sunday: open, monday: open, tuesday: open, wednesday: open, thursday: open, friday: closed };
}

function tenantBody(suffix: string) {
  return {
    businessName: `Shop ${suffix}`,
    slug: `shop-${suffix}`,
    contactEmail: `shop-${suffix}@enzo.test`,
    contactPhone: '01000000000',
    address: 'Cairo',
    logo: '',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    defaultLanguage: 'en',
    theme: 'dark',
    owner: { fullName: `Owner ${suffix}`, email: `owner-${suffix}@enzo.test`, phone: '01111111111', password: 'OwnerPass1' },
  };
}

function branchBody(code: string, name: string) {
  return { name, code, address: `${name} street`, phone: '01000000000', managerUserId: '', workingHours: hours() };
}

async function tokenFor(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password, rememberMe: true });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function setupShop(adminToken: string, suffix: string) {
  const created = await request(app).post('/api/v1/platform/tenants').set(auth(adminToken)).send(tenantBody(suffix));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ownerToken = await tokenFor(`owner-${suffix}@enzo.test`, 'OwnerPass1');
  const branch = await request(app).post('/api/v1/branches').set(auth(ownerToken)).send(branchBody('CAI', 'Cairo'));
  const other = await request(app).post('/api/v1/branches').set(auth(ownerToken)).send(branchBody('GIZ', 'Giza'));
  assert.equal(branch.status, 201, JSON.stringify(branch.body));
  const [types, titles] = await Promise.all([
    request(app).get('/api/v1/employees/employment-types').set(auth(ownerToken)),
    request(app).get('/api/v1/employees/job-titles').set(auth(ownerToken)),
  ]);
  const barber = await request(app).post('/api/v1/employees').set(auth(ownerToken)).send({
    fullName: 'Omar Adel',
    email: '',
    phone: '01200000001',
    nationalId: '29901011234567',
    address: 'Cairo',
    dateOfBirth: '1999-01-01',
    joiningDate: '2026-01-01',
    employmentTypeId: types.body.data[0].id,
    jobTitleId: titles.body.data[0].id,
    salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 500, tips: 200, deductions: 100 },
    notes: '',
    branches: [{ branchId: branch.body.data.id, isPrimary: true }],
  });
  assert.equal(barber.status, 201, JSON.stringify(barber.body));
  return {
    ownerToken,
    tenantId: created.body.data.id as string,
    branchId: branch.body.data.id as string,
    otherBranchId: other.body.data.id as string,
    barberId: barber.body.data.id as string,
  };
}

function week(start: string, end: string) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    working: weekday !== 5 && weekday !== 0,
    startTime: start,
    endTime: end,
    breakMinutes: 60,
  }));
}

function policyBody(extra: Record<string, unknown> = {}) {
  return {
    branchId: '',
    graceMinutes: 15,
    earlyLeaveGraceMinutes: 0,
    halfDayRatio: 0.5,
    overtimeRoundingMinutes: 0,
    weeklyDaysOff: [5],
    publicHolidays: [{ date: '2026-12-01', name: 'Branch holiday' }],
    lateDeductionPerMinute: 1,
    earlyLeaveDeductionPerMinute: 0,
    absenceDeductionMode: 'DAILY_RATE',
    dailyRateDays: 30,
    halfDayFactor: 0.5,
    overtimeMultiplier: 1.5,
    monthlyHours: 208,
    ...extra,
  };
}

function at(date: string, time: string) {
  return zonedTime(date, time, 'Africa/Cairo').toISOString();
}

async function rowOn(token: string, branchId: string, date: string) {
  const listed = await request(app).get('/api/v1/attendance').query({ branchId, from: date, to: date }).set(auth(token));
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  return listed.body.data[0] as {
    id: string;
    status: string;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    revisions: Array<{ summary: string }>;
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  Employee = (await import('../src/modules/employees/employee.model.js')).Employee;
  AuditLog = (await import('../src/modules/access/audit.model.js')).AuditLog;
  const sales = await import('../src/modules/pos/sale.model.js');
  SaleTransaction = sales.SaleTransaction;
  Tip = sales.Tip;
  CommissionSnapshot = sales.CommissionSnapshot;
  CommissionRule = (await import('../src/modules/commissions/commission.model.js')).CommissionRule;
  const workforce = await import('../src/modules/workforce/workforce.model.js');
  app = created.createApp();
  await db.connect(replSet.getUri());
  const models = [
    User,
    (await import('../src/modules/tenants/tenant.model.js')).Tenant,
    (await import('../src/modules/sessions/session.model.js')).Session,
    (await import('../src/modules/roles/role.model.js')).Role,
    (await import('../src/modules/roles/user-role.model.js')).UserRole,
    (await import('../src/modules/branches/branch.model.js')).Branch,
    Employee,
    (await import('../src/modules/employees/assignment.model.js')).EmployeeBranch,
    (await import('../src/modules/employees/catalog.model.js')).EmploymentType,
    (await import('../src/modules/employees/catalog.model.js')).JobTitle,
    CommissionRule,
    AuditLog,
    SaleTransaction,
    Tip,
    CommissionSnapshot,
    ...Object.values(workforce),
  ];
  await Promise.all(models.filter((value) => value && typeof value === 'object' && 'init' in value).map((model) => (model as { init: () => Promise<void> }).init()));
});

after(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  const collections = await db.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
  await User.create({
    fullName: 'Platform Admin',
    email: adminEmail,
    passwordHash: await (await import('../src/shared/password.js')).hashPassword(adminPassword),
    userType: 'SUPER_ADMIN',
    status: 'ACTIVE',
    tenantId: null,
  });
});

describe('phase 8 attendance, leave, and payroll', () => {
  it('keeps one attendance row per employee, branch, and date and classifies the schedule', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'attend');
    const other = await setupShop(admin, 'other');
    const blocked = await request(app).get('/api/v1/attendance').query({ branchId: shop.branchId, from: '2026-11-02', to: '2026-11-02' }).set(auth(admin));
    assert.equal(blocked.status, 403);

    const defaults = await request(app).get('/api/v1/attendance/policy').set(auth(shop.ownerToken));
    assert.equal(defaults.status, 200, JSON.stringify(defaults.body));
    assert.equal(defaults.body.data.graceMinutes, 15);
    const rules = await request(app).put('/api/v1/attendance/policy').set(auth(shop.ownerToken)).send(policyBody());
    assert.equal(rules.status, 200, JSON.stringify(rules.body));
    const cairoSchedule = await request(app).post('/api/v1/schedules').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      branchId: shop.branchId,
      days: week('10:00', '18:00'),
      effectiveFrom: '2026-01-01',
      effectiveTo: '',
    });
    assert.equal(cairoSchedule.status, 201, JSON.stringify(cairoSchedule.body));
    const assigned = await request(app).post(`/api/v1/employees/${shop.barberId}/branches`).set(auth(shop.ownerToken)).send({ branchId: shop.otherBranchId, isPrimary: false });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    const gizaSchedule = await request(app).post('/api/v1/schedules').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      branchId: shop.otherBranchId,
      days: week('12:00', '20:00'),
      effectiveFrom: '2026-01-01',
      effectiveTo: '',
    });
    assert.equal(gizaSchedule.status, 201, JSON.stringify(gizaSchedule.body));

    const missingOut = await request(app).post('/api/v1/attendance/check-out').set(auth(shop.ownerToken)).send({ employeeId: shop.barberId, branchId: shop.branchId, notes: '' });
    assert.equal(missingOut.status, 409);
    assert.equal(missingOut.body.error.code, 'missing_check_in');
    const first = await request(app).post('/api/v1/attendance/check-in').set(auth(shop.ownerToken)).send({ employeeId: shop.barberId, branchId: shop.branchId, notes: 'Desk' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.checkInSource, 'MANUAL');
    const duplicate = await request(app).post('/api/v1/attendance/check-in').set(auth(shop.ownerToken)).send({ employeeId: shop.barberId, branchId: shop.branchId, notes: '' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'already_checked_in');
    const secondBranch = await request(app).post('/api/v1/attendance/check-in').set(auth(shop.ownerToken)).send({ employeeId: shop.barberId, branchId: shop.otherBranchId, notes: '' });
    assert.equal(secondBranch.status, 201, JSON.stringify(secondBranch.body));

    for (const date of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09', '2026-12-01']) {
      const closed = await request(app).post('/api/v1/attendance/close-day').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, date });
      assert.equal(closed.status, 200, `${date} ${JSON.stringify(closed.body)}`);
    }
    const gizaClosed = await request(app).post('/api/v1/attendance/close-day').set(auth(shop.ownerToken)).send({ branchId: shop.otherBranchId, date: '2026-11-02' });
    assert.equal(gizaClosed.status, 200, JSON.stringify(gizaClosed.body));

    const corrections: Array<[string, string, string, string, number, number]> = [
      ['2026-11-02', '10:20', '18:00', 'LATE', 5, 0],
      ['2026-11-03', '10:00', '16:00', 'PRESENT', 0, 120],
      ['2026-11-05', '10:00', '12:00', 'HALF_DAY', 0, 360],
      ['2026-11-09', '10:10', '18:00', 'PRESENT', 0, 0],
    ];
    for (const [date, start, end, status, late, early] of corrections) {
      const current = await rowOn(shop.ownerToken, shop.branchId, date);
      const corrected = await request(app).patch(`/api/v1/attendance/${current.id}`).set(auth(shop.ownerToken)).send({
        checkInTime: at(date, start),
        checkOutTime: at(date, end),
        notes: 'Corrected from the register',
      });
      assert.equal(corrected.status, 200, `${date} ${JSON.stringify(corrected.body)}`);
      assert.equal(corrected.body.data.status, status);
      assert.equal(corrected.body.data.lateMinutes, late);
      assert.equal(corrected.body.data.earlyLeaveMinutes, early);
      assert.equal(corrected.body.data.checkInLabel, `${date} ${start}`);
      assert.equal(corrected.body.data.revisions.length, 1);
    }
    const absent = await rowOn(shop.ownerToken, shop.branchId, '2026-11-04');
    assert.equal(absent.status, 'ABSENT');
    const holiday = await rowOn(shop.ownerToken, shop.branchId, '2026-12-01');
    assert.equal(holiday.status, 'DAY_OFF');
    const gizaRow = await rowOn(shop.ownerToken, shop.otherBranchId, '2026-11-02');
    const gizaCorrected = await request(app).patch(`/api/v1/attendance/${gizaRow.id}`).set(auth(shop.ownerToken)).send({
      checkInTime: at('2026-11-02', '12:10'),
      checkOutTime: at('2026-11-02', '20:00'),
      notes: 'Giza hours',
    });
    assert.equal(gizaCorrected.status, 200, JSON.stringify(gizaCorrected.body));
    assert.equal(gizaCorrected.body.data.lateMinutes, 0);
    assert.equal(gizaCorrected.body.data.status, 'PRESENT');

    const audit = await AuditLog.findOne({ tenantId: shop.tenantId, action: 'attendance.corrected' });
    assert.ok(audit);
    const foreign = await request(app).get('/api/v1/attendance').query({ branchId: shop.branchId, from: '2026-11-02', to: '2026-11-02' }).set(auth(other.ownerToken));
    assert.equal(foreign.status, 404);
    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Giza Desk',
      description: '',
      permissions: ['attendance.view'],
    });
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Giza Desk',
      email: 'giza-desk@enzo.test',
      phone: '',
      password: 'DeskPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [shop.otherBranchId] }],
    });
    const desk = await tokenFor('giza-desk@enzo.test', 'DeskPass1');
    const hidden = await request(app).get('/api/v1/attendance').query({ branchId: shop.branchId, from: '2026-11-02', to: '2026-11-02' }).set(auth(desk));
    assert.equal(hidden.status, 403);
    const visible = await request(app).get('/api/v1/attendance').query({ branchId: shop.otherBranchId, from: '2026-11-02', to: '2026-11-02' }).set(auth(desk));
    assert.equal(visible.status, 200);
    assert.equal(visible.body.data.length, 1);
  });

  it('accepts an authorized mock fingerprint event once and rejects unknown devices', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'device');
    const registered = await request(app).post('/api/v1/fingerprint-devices').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      name: 'Front door',
      serialNumber: 'MOCK-1',
      provider: 'mock',
      deviceType: 'fingerprint',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.equal(registered.body.data.device.hardwareReady, false);
    assert.equal(registered.body.data.device.adapter, 'normalized-json');
    const deviceId = registered.body.data.device.id as string;
    const apiKey = registered.body.data.apiKey as string;
    const mapped = await request(app).post(`/api/v1/fingerprint-devices/${deviceId}/employees`).set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      externalEmployeeId: 'EMP-9',
    });
    assert.equal(mapped.status, 201, JSON.stringify(mapped.body));

    const missing = await request(app).post('/api/v1/device-events').send({
      serialNumber: 'MOCK-1',
      externalEventId: 'evt-1',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_IN',
    });
    assert.equal(missing.status, 401);
    const denied = await request(app).post('/api/v1/device-events').set('X-Device-Key', 'wrong-key').send({
      serialNumber: 'MOCK-1',
      externalEventId: 'evt-1',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_IN',
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'device_unauthorized');
    const punched = await request(app).post('/api/v1/device-events').set('X-Device-Key', apiKey).send({
      serialNumber: 'MOCK-1',
      externalEventId: 'evt-1',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_IN',
    });
    assert.equal(punched.status, 200, JSON.stringify(punched.body));
    assert.equal(punched.body.data.duplicate, false);
    const again = await request(app).post('/api/v1/device-events').set('X-Device-Key', apiKey).send({
      serialNumber: 'MOCK-1',
      externalEventId: 'evt-1',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_IN',
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data.duplicate, true);

    const disabled = await request(app).post(`/api/v1/fingerprint-devices/${deviceId}/status`).set(auth(shop.ownerToken)).send({ status: 'DISABLED' });
    assert.equal(disabled.status, 200);
    const blocked = await request(app).post('/api/v1/device-events').set('X-Device-Key', apiKey).send({
      serialNumber: 'MOCK-1',
      externalEventId: 'evt-2',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_OUT',
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'device_disabled');

    const vendor = await request(app).post('/api/v1/fingerprint-devices').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      name: 'Unknown brand',
      serialNumber: 'VENDOR-1',
      provider: 'unconfirmed-brand',
      deviceType: 'fingerprint',
    });
    assert.equal(vendor.status, 201, JSON.stringify(vendor.body));
    const sync = await request(app).post(`/api/v1/fingerprint-devices/${vendor.body.data.device.id}/sync`).set(auth(shop.ownerToken)).send({});
    assert.equal(sync.status, 409);
    assert.equal(sync.body.error.code, 'provider_unsupported');
    const logs = await request(app).get('/api/v1/fingerprint-devices/logs').set(auth(shop.ownerToken));
    assert.equal(logs.status, 200, JSON.stringify(logs.body));
    assert.equal(logs.body.data.some((row: { status: string }) => row.status === 'FAILED'), true);

    await request(app).post(`/api/v1/fingerprint-devices/${deviceId}/status`).set(auth(shop.ownerToken)).send({ status: 'ENABLED' });
    const queued = await request(app).post(`/api/v1/fingerprint-devices/${deviceId}/mock-events`).set(auth(shop.ownerToken)).send({
      externalEventId: 'evt-queue',
      externalEmployeeId: 'EMP-9',
      action: 'CHECK_OUT',
    });
    assert.equal(queued.status, 201, JSON.stringify(queued.body));
    const synced = await request(app).post(`/api/v1/fingerprint-devices/${deviceId}/sync`).set(auth(shop.ownerToken)).send({});
    assert.equal(synced.status, 200, JSON.stringify(synced.body));
    assert.equal(synced.body.data.status, 'SUCCESS');
    assert.equal(synced.body.data.eventCount, 1);
  });

  it('approves leave without overlap and carries the remaining balance forward', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'leave');
    const type = await request(app).post('/api/v1/leave-types').set(auth(shop.ownerToken)).send({
      name: { en: 'Annual', ar: 'سنوية' },
      paid: true,
      annualAllowance: 10,
      requiresApproval: true,
      allowPartialDay: true,
      carryForward: 'LIMITED',
      carryForwardLimit: 5,
      status: 'ACTIVE',
    });
    assert.equal(type.status, 201, JSON.stringify(type.body));
    const leaveTypeId = type.body.data.id as string;
    const requestLeave = (startDate: string, endDate: string, extra: Record<string, unknown> = {}) => request(app).post('/api/v1/leave-requests').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      leaveTypeId,
      startDate,
      endDate,
      portion: 'FULL',
      reason: 'Family travel',
      override: false,
      ...extra,
    });
    const first = await requestLeave('2026-11-16', '2026-11-17');
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.status, 'PENDING');
    assert.equal(first.body.data.totalDays, 2);
    const approved = await request(app).post(`/api/v1/leave-requests/${first.body.data.id}/decision`).set(auth(shop.ownerToken)).send({ status: 'APPROVED', rejectionReason: '', override: false });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const overlap = await requestLeave('2026-11-17', '2026-11-18');
    assert.equal(overlap.status, 201);
    const blocked = await request(app).post(`/api/v1/leave-requests/${overlap.body.data.id}/decision`).set(auth(shop.ownerToken)).send({ status: 'APPROVED', rejectionReason: '', override: false });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'leave_overlap');
    const tooMuch = await requestLeave('2026-12-01', '2026-12-20');
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.error.code, 'leave_balance');
    const half = await requestLeave('2026-11-18', '2026-11-18', { portion: 'HALF', reason: 'Morning appointment' });
    assert.equal(half.status, 201, JSON.stringify(half.body));
    assert.equal(half.body.data.totalDays, 0.5);
    const halfApproved = await request(app).post(`/api/v1/leave-requests/${half.body.data.id}/decision`).set(auth(shop.ownerToken)).send({ status: 'APPROVED', rejectionReason: '', override: false });
    assert.equal(halfApproved.status, 200, JSON.stringify(halfApproved.body));
    const sameHalf = await requestLeave('2026-11-18', '2026-11-18', { portion: 'HALF', reason: 'Second half' });
    const sameBlocked = await request(app).post(`/api/v1/leave-requests/${sameHalf.body.data.id}/decision`).set(auth(shop.ownerToken)).send({ status: 'APPROVED', rejectionReason: '', override: false });
    assert.equal(sameBlocked.status, 409);
    const cancelledOverlap = await request(app).post(`/api/v1/leave-requests/${overlap.body.data.id}/cancel`).set(auth(shop.ownerToken)).send({});
    const cancelledHalf = await request(app).post(`/api/v1/leave-requests/${sameHalf.body.data.id}/cancel`).set(auth(shop.ownerToken)).send({});
    assert.equal(cancelledOverlap.status, 200, JSON.stringify(cancelledOverlap.body));
    assert.equal(cancelledHalf.status, 200, JSON.stringify(cancelledHalf.body));

    const covered = await request(app).get('/api/v1/attendance').query({ branchId: shop.branchId, from: '2026-11-16', to: '2026-11-16' }).set(auth(shop.ownerToken));
    assert.equal(covered.body.data[0].status, 'ON_LEAVE');
    const partial = await request(app).get('/api/v1/attendance').query({ branchId: shop.branchId, from: '2026-11-18', to: '2026-11-18' }).set(auth(shop.ownerToken));
    assert.equal(partial.body.data[0].status, 'HALF_DAY');

    const changed = await request(app).put(`/api/v1/leave-types/${leaveTypeId}`).set(auth(shop.ownerToken)).send({
      name: { en: 'Annual', ar: 'سنوية' },
      paid: true,
      annualAllowance: 12,
      requiresApproval: true,
      allowPartialDay: true,
      carryForward: 'LIMITED',
      carryForwardLimit: 5,
      status: 'ACTIVE',
    });
    assert.equal(changed.status, 200);
    const year = await request(app).get('/api/v1/leave-balances').query({ employeeId: shop.barberId, year: 2026 }).set(auth(shop.ownerToken));
    assert.equal(year.status, 200, JSON.stringify(year.body));
    const balance = year.body.data[0];
    assert.equal(balance.entitled, 10);
    assert.equal(balance.used, 2.5);
    assert.equal(balance.remaining, 7.5);
    const nextYear = await requestLeave('2027-01-05', '2027-01-05', { reason: 'New year day' });
    assert.equal(nextYear.status, 201, JSON.stringify(nextYear.body));
    const carried = await request(app).get('/api/v1/leave-balances').query({ employeeId: shop.barberId, year: 2027 }).set(auth(shop.ownerToken));
    assert.equal(carried.body.data[0].entitled, 17);
    assert.equal(carried.body.data[0].carriedDays, 5);
    assert.equal(carried.body.data[0].pending, 1);
    const still = await request(app).get('/api/v1/leave-balances').query({ employeeId: shop.barberId, year: 2026 }).set(auth(shop.ownerToken));
    assert.equal(still.body.data[0].entitled, 10);
    const adjusted = await request(app).post('/api/v1/leave-balances/adjustments').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      leaveTypeId,
      year: 2026,
      days: 1,
      reason: 'Correction after review',
    });
    assert.equal(adjusted.status, 200, JSON.stringify(adjusted.body));
    assert.equal(adjusted.body.data.remaining, 8.5);
  });

  it('snapshots commission, tips, and attendance into payroll and locks the paid record', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pay');
    await request(app).put('/api/v1/attendance/policy').set(auth(shop.ownerToken)).send(policyBody());
    await request(app).post('/api/v1/schedules').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      branchId: shop.branchId,
      days: week('10:00', '18:00'),
      effectiveFrom: '2026-01-01',
      effectiveTo: '',
    });
    const unpaid = await request(app).post('/api/v1/leave-types').set(auth(shop.ownerToken)).send({
      name: { en: 'Unpaid', ar: 'بدون راتب' },
      paid: false,
      annualAllowance: 5,
      requiresApproval: true,
      allowPartialDay: false,
      carryForward: 'NONE',
      carryForwardLimit: 0,
      status: 'ACTIVE',
    });
    const requested = await request(app).post('/api/v1/leave-requests').set(auth(shop.ownerToken)).send({
      employeeId: shop.barberId,
      leaveTypeId: unpaid.body.data.id,
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      portion: 'FULL',
      reason: 'Personal day',
      override: false,
    });
    const approved = await request(app).post(`/api/v1/leave-requests/${requested.body.data.id}/decision`).set(auth(shop.ownerToken)).send({ status: 'APPROVED', rejectionReason: '', override: false });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    for (const date of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09']) {
      const closed = await request(app).post('/api/v1/attendance/close-day').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, date });
      assert.equal(closed.status, 200, JSON.stringify(closed.body));
    }
    const corrections: Array<[string, string, string]> = [
      ['2026-11-02', '10:20', '18:00'],
      ['2026-11-03', '10:00', '16:00'],
      ['2026-11-05', '10:00', '12:00'],
      ['2026-11-09', '10:10', '18:00'],
    ];
    for (const [date, start, end] of corrections) {
      const current = await rowOn(shop.ownerToken, shop.branchId, date);
      const corrected = await request(app).patch(`/api/v1/attendance/${current.id}`).set(auth(shop.ownerToken)).send({
        checkInTime: at(date, start),
        checkOutTime: at(date, end),
        notes: 'Register correction',
      });
      assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    }

    const owner = await User.findOne({ email: 'owner-pay@enzo.test' });
    assert.ok(owner);
    const sale = await SaleTransaction.create({
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      transactionNumber: 'T-1',
      appointmentId: new db.Types.ObjectId(),
      customerId: new db.Types.ObjectId(),
      cashierUserId: owner._id,
      items: [{ itemType: 'SERVICE', serviceNameSnapshot: { en: 'Haircut', ar: '' }, quantity: 1, unitPriceSnapshot: 150, discount: 0, lineTotal: 150 }],
      subtotal: 150,
      totalAmount: 150,
      paidAmount: 150,
      status: 'PAID',
      paymentStatus: 'PAID',
      idempotencyKey: 'pay-1',
      createdAt: new Date('2026-11-06T10:00:00.000Z'),
    });
    const refunded = await SaleTransaction.create({
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      transactionNumber: 'T-2',
      appointmentId: new db.Types.ObjectId(),
      customerId: new db.Types.ObjectId(),
      cashierUserId: owner._id,
      items: [{ itemType: 'SERVICE', serviceNameSnapshot: { en: 'Beard', ar: '' }, quantity: 1, unitPriceSnapshot: 80, discount: 0, lineTotal: 80 }],
      subtotal: 80,
      totalAmount: 80,
      paidAmount: 80,
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      idempotencyKey: 'pay-2',
      createdAt: new Date('2026-11-06T11:00:00.000Z'),
    });
    await CommissionSnapshot.create({
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      transactionId: sale._id,
      employeeId: shop.barberId,
      serviceId: new db.Types.ObjectId(),
      commissionTypeSnapshot: 'PERCENTAGE',
      commissionRateSnapshot: 15,
      commissionAmountSnapshot: 22.5,
      source: 'SERVICE',
    });
    await CommissionSnapshot.create({
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      transactionId: refunded._id,
      employeeId: shop.barberId,
      serviceId: new db.Types.ObjectId(),
      commissionTypeSnapshot: 'PERCENTAGE',
      commissionRateSnapshot: 15,
      commissionAmountSnapshot: 99,
      source: 'SERVICE',
    });
    await Tip.create({
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      transactionId: sale._id,
      employeeId: shop.barberId,
      amount: 15,
      method: 'CASH',
      cashierUserId: owner._id,
    });
    await CommissionRule.updateMany({ tenantId: shop.tenantId }, { $set: { value: 90 } });

    const generated = await request(app).post('/api/v1/payroll/generate').set(auth(shop.ownerToken)).send({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      branchId: shop.branchId,
      employeeIds: [shop.barberId],
    });
    assert.equal(generated.status, 201, JSON.stringify(generated.body));
    const payroll = generated.body.data[0];
    assert.equal(payroll.basicSalary, 8000);
    assert.equal(payroll.commission, 22.5);
    assert.equal(payroll.tips, 15);
    assert.equal(payroll.allowances, 500);
    assert.equal(payroll.otherDeductions, 100);
    assert.equal(payroll.attendanceSummary.late, 1);
    assert.equal(payroll.attendanceSummary.lateMinutes, 5);
    assert.equal(payroll.attendanceSummary.absent, 1);
    assert.equal(payroll.attendanceSummary.halfDay, 1);
    assert.equal(payroll.attendanceSummary.unpaidLeaveDays, 1);
    const daily = Math.round(800000 / 30);
    const deductionMinor = 5 * 100 + daily + Math.round(daily * 0.5) + daily;
    assert.equal(payroll.attendanceDeductions, deductionMinor / 100);
    assert.equal(payroll.netSalary, 7765.82);
    assert.equal(payroll.status, 'DRAFT');

    await Employee.updateOne({ _id: shop.barberId }, { $set: { 'salary.basicSalary': 1, 'salary.tips': 0 } });
    const reread = await request(app).get(`/api/v1/payroll/${payroll.id}`).set(auth(shop.ownerToken));
    assert.equal(reread.body.data.basicSalary, 8000);
    assert.equal(reread.body.data.tips, 15);
    const duplicate = await request(app).post('/api/v1/payroll/generate').set(auth(shop.ownerToken)).send({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      branchId: shop.branchId,
      employeeIds: [shop.barberId],
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'payroll_exists');

    const bonus = await request(app).post(`/api/v1/payroll/${payroll.id}/adjustments`).set(auth(shop.ownerToken)).send({
      kind: 'BONUS',
      label: 'Eid',
      amount: 50,
      reason: 'Holiday bonus',
    });
    assert.equal(bonus.status, 200, JSON.stringify(bonus.body));
    assert.equal(bonus.body.data.netSalary, 7815.82);
    const submitted = await request(app).post(`/api/v1/payroll/${payroll.id}/submit`).set(auth(shop.ownerToken)).send({});
    const approvedPayroll = await request(app).post(`/api/v1/payroll/${payroll.id}/approve`).set(auth(shop.ownerToken)).send({});
    const paid = await request(app).post(`/api/v1/payroll/${payroll.id}/pay`).set(auth(shop.ownerToken)).send({ method: 'CASH', reference: 'TRX-1' });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(approvedPayroll.status, 200, JSON.stringify(approvedPayroll.body));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.data.status, 'PAID');
    assert.ok(paid.body.data.paidBy);
    const locked = await request(app).post(`/api/v1/payroll/${payroll.id}/adjustments`).set(auth(shop.ownerToken)).send({
      kind: 'DEDUCTION',
      label: 'Late edit',
      amount: 10,
      reason: 'Should stay locked',
    });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error.code, 'payroll_locked');
    const correction = await request(app).post(`/api/v1/payroll/${payroll.id}/corrections`).set(auth(shop.ownerToken)).send({});
    assert.equal(correction.status, 201, JSON.stringify(correction.body));
    assert.equal(correction.body.data.status, 'DRAFT');
    assert.equal(correction.body.data.correctsPayrollId, payroll.id);
    const original = await request(app).get(`/api/v1/payroll/${payroll.id}`).set(auth(shop.ownerToken));
    assert.equal(original.body.data.status, 'PAID');
    assert.equal(original.body.data.netSalary, 7815.82);
  });
});
