import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Express } from 'express';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type mongoose from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import { shapeArabic } from '../src/modules/reports/report.export.js';
import { runReport } from '../src/modules/reports/report.service.js';

process.env['NODE_ENV'] = 'test';
process.env['JWT_ACCESS_SECRET'] = 'a'.repeat(48);
process.env['JWT_REFRESH_SECRET'] = 'b'.repeat(48);
process.env['COOKIE_SECURE'] = 'false';
process.env['SUPER_ADMIN_EMAIL'] = '';
process.env['SUPER_ADMIN_PASSWORD'] = '';
process.env['WHATSAPP_ENCRYPTION_KEY'] = 'c'.repeat(48);

let replSet: MongoMemoryReplSet;
let db: typeof mongoose;
let app: Express;
let User: typeof import('../src/modules/users/user.model.js').User;

const adminEmail = 'admin@enzo.test';
const adminPassword = 'ValidPass1';
const range = { from: '2026-06-01', to: '2026-06-30', branchId: '', employeeId: '', categoryId: '', paymentMethod: '', status: '', section: '', payrollStatus: '', lang: 'en', page: 1, pageSize: 25 };

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function hours() {
  const open = { isOpen: true, openingTime: '10:00', closingTime: '22:00' };
  const closed = { isOpen: false, openingTime: '10:00', closingTime: '22:00' };
  return { saturday: open, sunday: open, monday: open, tuesday: open, wednesday: open, thursday: open, friday: closed };
}

async function tokenFor(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password, rememberMe: true });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function setupShop(adminToken: string, suffix: string) {
  const created = await request(app).post('/api/v1/platform/tenants').set(auth(adminToken)).send({
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
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ownerToken = await tokenFor(`owner-${suffix}@enzo.test`, 'OwnerPass1');
  const branch = await request(app).post('/api/v1/branches').set(auth(ownerToken)).send({ name: 'Cairo', code: 'CAI', address: 'Cairo street', phone: '01000000000', managerUserId: '', workingHours: hours() });
  const other = await request(app).post('/api/v1/branches').set(auth(ownerToken)).send({ name: 'Giza', code: 'GIZ', address: 'Giza street', phone: '01000000000', managerUserId: '', workingHours: hours() });
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

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  app = (await import('../src/app.js')).createApp();
  User = (await import('../src/modules/users/user.model.js')).User;
  const models = [
    User,
    (await import('../src/modules/tenants/tenant.model.js')).Tenant,
    (await import('../src/modules/sessions/session.model.js')).Session,
    (await import('../src/modules/roles/role.model.js')).Role,
    (await import('../src/modules/roles/user-role.model.js')).UserRole,
    (await import('../src/modules/branches/branch.model.js')).Branch,
    (await import('../src/modules/employees/employee.model.js')).Employee,
    (await import('../src/modules/employees/assignment.model.js')).EmployeeBranch,
    (await import('../src/modules/employees/catalog.model.js')).EmploymentType,
    (await import('../src/modules/employees/catalog.model.js')).JobTitle,
    (await import('../src/modules/access/audit.model.js')).AuditLog,
    (await import('../src/modules/customers/customer.model.js')).Customer,
    (await import('../src/modules/appointments/appointment.model.js')).Appointment,
    (await import('../src/modules/pos/sale.model.js')).SaleTransaction,
    (await import('../src/modules/pos/sale.model.js')).Payment,
    (await import('../src/modules/pos/sale.model.js')).Refund,
    (await import('../src/modules/pos/sale.model.js')).Tip,
    (await import('../src/modules/pos/sale.model.js')).CashierShift,
    (await import('../src/modules/pos/sale.model.js')).CommissionSnapshot,
    (await import('../src/modules/commissions/commission.model.js')).CommissionRule,
    (await import('../src/modules/inventory/inventory.model.js')).Stock,
    (await import('../src/modules/inventory/inventory.model.js')).PurchasePayment,
    (await import('../src/modules/workforce/workforce.model.js')).Attendance,
    (await import('../src/modules/workforce/workforce.model.js')).Payroll,
    (await import('../src/modules/whatsapp/whatsapp.model.js')).WhatsAppConfig,
    (await import('../src/modules/whatsapp/whatsapp.model.js')).NotificationPreference,
    (await import('../src/modules/whatsapp/whatsapp.model.js')).WhatsAppTemplate,
    (await import('../src/modules/whatsapp/whatsapp.model.js')).WhatsAppMessage,
    (await import('../src/modules/whatsapp/whatsapp.model.js')).WhatsAppEvent,
  ];
  await db.connect(replSet.getUri());
  await Promise.all(models.map((model) => model.init()));
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

describe('phase 9 reports and whatsapp', () => {
  it('calculates sales, isolation, commission, customers, stock, attendance, payroll, and cashier cash from stored records', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'reports');
    const sales = await import('../src/modules/pos/sale.model.js');
    const { Customer } = await import('../src/modules/customers/customer.model.js');
    const { Appointment } = await import('../src/modules/appointments/appointment.model.js');
    const { CommissionRule } = await import('../src/modules/commissions/commission.model.js');
    const { Stock, PurchasePayment } = await import('../src/modules/inventory/inventory.model.js');
    const { Attendance, Payroll } = await import('../src/modules/workforce/workforce.model.js');
    const owner = await User.findOne({ email: 'owner-reports@enzo.test' });
    assert.ok(owner);
    const tenantId = shop.tenantId;
    const branchId = shop.branchId;
    const returning = await Customer.create({ tenantId, customerNumber: 'C-1', fullName: 'Returning', phone: '01011111111', normalizedPhone: '01011111111', status: 'ACTIVE' });
    const firstTime = await Customer.create({ tenantId, customerNumber: 'C-2', fullName: 'First', phone: '01022222222', normalizedPhone: '01022222222', status: 'ACTIVE' });
    const visitor = await Customer.create({ tenantId, customerNumber: 'C-3', fullName: 'Visit only', phone: '01033333333', normalizedPhone: '01033333333', status: 'ACTIVE' });
    const line = (name: string, total: number) => ({ itemType: 'SERVICE' as const, serviceId: new Types.ObjectId(), serviceNameSnapshot: { en: name, ar: name }, quantity: 1, unitPriceSnapshot: total, discount: 0, lineTotal: total });
    const june = new Date('2026-06-15T10:00:00.000Z');
    const prior = await sales.SaleTransaction.create({ tenantId, branchId, transactionNumber: 'T-OLD', appointmentId: new Types.ObjectId(), customerId: returning._id, cashierUserId: owner._id, items: [line('Old', 30)], subtotal: 30, packageDiscount: 0, manualDiscount: 0, totalDiscount: 0, totalAmount: 30, paidAmount: 30, refundedAmount: 0, amountDue: 0, status: 'PAID', paymentStatus: 'PAID', tipTotal: 0, idempotencyKey: 'old', createdAt: new Date('2026-01-15T10:00:00.000Z') });
    assert.ok(prior);
    const partial = await sales.SaleTransaction.create({ tenantId, branchId, transactionNumber: 'T-1', appointmentId: new Types.ObjectId(), customerId: returning._id, cashierUserId: owner._id, items: [{ ...line('Cut', 100), discount: 10, lineTotal: 90 }], subtotal: 100, packageDiscount: 0, manualDiscount: 10, totalDiscount: 10, totalAmount: 90, paidAmount: 90, refundedAmount: 20, amountDue: 0, status: 'PARTIALLY_REFUNDED', paymentStatus: 'PARTIALLY_REFUNDED', tipTotal: 0, idempotencyKey: 'partial', createdAt: june });
    const fresh = await sales.SaleTransaction.create({ tenantId, branchId, transactionNumber: 'T-2', appointmentId: new Types.ObjectId(), customerId: firstTime._id, cashierUserId: owner._id, items: [line('Beard', 50)], subtotal: 50, packageDiscount: 0, manualDiscount: 0, totalDiscount: 0, totalAmount: 50, paidAmount: 50, refundedAmount: 0, amountDue: 0, status: 'PAID', paymentStatus: 'PAID', tipTotal: 5, idempotencyKey: 'fresh', createdAt: june });
    const refunded = await sales.SaleTransaction.create({ tenantId, branchId, transactionNumber: 'T-3', appointmentId: new Types.ObjectId(), customerId: returning._id, cashierUserId: owner._id, items: [line('Wash', 40)], subtotal: 40, packageDiscount: 0, manualDiscount: 0, totalDiscount: 0, totalAmount: 40, paidAmount: 40, refundedAmount: 40, amountDue: 0, status: 'REFUNDED', paymentStatus: 'REFUNDED', tipTotal: 0, idempotencyKey: 'refunded', createdAt: june });
    await sales.SaleTransaction.create({ tenantId, branchId: shop.otherBranchId, transactionNumber: 'T-GIZA', appointmentId: new Types.ObjectId(), customerId: firstTime._id, cashierUserId: owner._id, items: [line('Other', 500)], subtotal: 500, packageDiscount: 0, manualDiscount: 0, totalDiscount: 0, totalAmount: 500, paidAmount: 500, refundedAmount: 0, amountDue: 0, status: 'PAID', paymentStatus: 'PAID', tipTotal: 0, idempotencyKey: 'giza', createdAt: june });
    const cash = await sales.Payment.create({ tenantId, branchId, transactionId: partial._id, method: 'CASH', amount: 90, refundedAmount: 20, status: 'PARTIALLY_REFUNDED', receivedBy: owner._id, receivedAt: june });
    await sales.Payment.create({ tenantId, branchId, transactionId: fresh._id, method: 'VISA', amount: 50, refundedAmount: 0, status: 'RECORDED', receivedBy: owner._id, receivedAt: june });
    await sales.Payment.create({ tenantId, branchId, transactionId: refunded._id, method: 'CASH', amount: 40, refundedAmount: 40, status: 'REFUNDED', receivedBy: owner._id, receivedAt: june });
    await sales.Refund.create({ tenantId, branchId, transactionId: partial._id, paymentId: cash._id, amount: 20, reason: 'Adjust', method: 'CASH', status: 'PROCESSED', restock: false, requestedBy: owner._id, processedBy: owner._id, processedAt: june, createdAt: june });
    await sales.Tip.create({ tenantId, branchId, transactionId: fresh._id, employeeId: shop.barberId, amount: 5, method: 'CASH', cashierUserId: owner._id });
    await sales.CommissionSnapshot.create({ tenantId, branchId, transactionId: fresh._id, employeeId: shop.barberId, serviceId: new Types.ObjectId(), commissionTypeSnapshot: 'PERCENTAGE', commissionRateSnapshot: 10, commissionAmountSnapshot: 12.5, source: 'SERVICE' });
    await sales.CommissionSnapshot.create({ tenantId, branchId, transactionId: refunded._id, employeeId: shop.barberId, serviceId: new Types.ObjectId(), commissionTypeSnapshot: 'FIXED', commissionRateSnapshot: 99, commissionAmountSnapshot: 99, source: 'TENANT' });
    await CommissionRule.updateOne({ tenantId, scope: 'TENANT' }, { $set: { kind: 'PERCENTAGE', value: 80, status: 'ACTIVE' } });
    const paidAppointment = new Types.ObjectId();
    fresh.appointmentId = paidAppointment;
    await fresh.save();
    await Appointment.create({ tenantId, branchId, appointmentNumber: 'A-PAID', customerId: firstTime._id, barberEmployeeId: shop.barberId, type: 'WALK_IN', scheduledAt: june, services: [{ serviceId: new Types.ObjectId(), serviceNameSnapshot: { en: 'Beard', ar: 'ذقن' }, unitPriceSnapshot: 50, quantity: 1, commissionTypeSnapshot: 'PERCENTAGE', commissionValueSnapshot: 10, lineTotal: 50 }], subtotal: 50, discount: 0, total: 50, status: 'COMPLETED', checkoutStatus: 'PAID', _id: paidAppointment });
    await Appointment.create({ tenantId, branchId, appointmentNumber: 'A-OPEN', customerId: visitor._id, barberEmployeeId: shop.barberId, type: 'WALK_IN', scheduledAt: june, services: [{ serviceId: new Types.ObjectId(), serviceNameSnapshot: { en: 'Trim', ar: 'تشذيب' }, unitPriceSnapshot: 70, quantity: 1, commissionTypeSnapshot: 'PERCENTAGE', commissionValueSnapshot: 10, lineTotal: 70 }], subtotal: 70, discount: 0, total: 70, status: 'COMPLETED', checkoutStatus: 'NOT_CHECKED_OUT' });
    await Stock.create({ tenantId, branchId, productId: new Types.ObjectId(), quantityOnHand: 4, averageCost: 10, minimumStock: 0 });
    await Stock.create({ tenantId, branchId, productId: new Types.ObjectId(), quantityOnHand: 2, averageCost: 2.5, minimumStock: 5 });
    await Stock.create({ tenantId, branchId, productId: new Types.ObjectId(), quantityOnHand: 0, averageCost: 3, minimumStock: 1 });
    await Attendance.create({ tenantId, employeeId: shop.barberId, branchId, attendanceDate: '2026-06-15', checkInSource: 'MANUAL', status: 'LATE', lateMinutes: 10, earlyLeaveMinutes: 0, overtimeMinutes: 0 });
    await Attendance.create({ tenantId, employeeId: shop.barberId, branchId, attendanceDate: '2026-06-16', checkInSource: 'MANUAL', status: 'ABSENT', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 });
    await Attendance.create({ tenantId, employeeId: shop.barberId, branchId, attendanceDate: '2026-06-17', checkInSource: 'MANUAL', status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 20, overtimeMinutes: 0 });
    const summary = { present: 1, late: 1, absent: 1, halfDay: 0, onLeave: 0, unpaidLeaveDays: 0, lateMinutes: 10, earlyLeaveMinutes: 20, overtimeMinutes: 0 };
    await Payroll.create({ tenantId, employeeId: shop.barberId, branchId, periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'PAID', basicSalary: 100, commission: 1, tips: 1, allowances: 0, overtime: 0, attendanceDeductions: 0, fixedDeductions: 0, otherDeductions: 0, bonuses: 0, netSalary: 100, attendanceSummary: summary });
    await Payroll.create({ tenantId, employeeId: shop.barberId, branchId, periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'DRAFT', correctsPayrollId: new Types.ObjectId(), basicSalary: 999, commission: 0, tips: 0, allowances: 0, overtime: 0, attendanceDeductions: 0, fixedDeductions: 0, otherDeductions: 0, bonuses: 0, netSalary: 999, attendanceSummary: summary });
    await sales.CashierShift.create({ tenantId, branchId, cashierUserId: owner._id, shiftType: 'MORNING', openingBalance: 100, openedAt: june, closedAt: june, cashSales: 50, cashTips: 10, cashRefunds: 5, expectedCash: 155, actualCash: 150, difference: -5, status: 'CLOSED', openedBy: owner._id, closedBy: owner._id });
    await PurchasePayment.create({ tenantId, branchId, purchaseId: new Types.ObjectId(), supplierId: new Types.ObjectId(), method: 'CASH', amount: 20, paidBy: owner._id, paidAt: june });

    const dashboard = await request(app).get('/api/v1/reports/dashboard').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(shop.ownerToken));
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
    assert.equal(dashboard.body.data.metrics.gross, 190);
    assert.equal(dashboard.body.data.metrics.discounts, 10);
    assert.equal(dashboard.body.data.metrics.refunds, 60);
    assert.equal(dashboard.body.data.metrics.net, 120);
    assert.equal(dashboard.body.data.metrics.cash, 70);
    assert.equal(dashboard.body.data.metrics.card, 50);
    assert.equal(dashboard.body.data.metrics.tips, 5);
    assert.equal(dashboard.body.data.metrics.transactions, 3);
    assert.equal(dashboard.body.data.metrics.newCustomers, 1);
    assert.equal(dashboard.body.data.metrics.returningCustomers, 1);

    const performance = await request(app).get('/api/v1/reports/performance').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(shop.ownerToken));
    assert.equal(performance.status, 200, JSON.stringify(performance.body));
    const barber = performance.body.data.rows.find((row: { label: string }) => row.label === 'Omar Adel');
    assert.equal(barber.commission, 12.5);
    assert.equal(barber.tips, 5);
    assert.equal(barber.completedAppointments, 2);
    assert.equal(barber.net, 50);

    const customers = await request(app).get('/api/v1/reports/customers').query({ from: '2026-06-01', to: '2026-06-30' }).set(auth(shop.ownerToken));
    assert.equal(customers.status, 200, JSON.stringify(customers.body));
    assert.equal(customers.body.data.rows.some((row: { label: string }) => row.label === 'Visit only'), false);
    const returningRow = customers.body.data.rows.find((row: { label: string }) => row.label === 'Returning');
    assert.equal(returningRow.net, 70);

    const inventory = await request(app).get('/api/v1/reports/inventory').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(shop.ownerToken));
    assert.equal(inventory.body.data.metrics.valuation, 45);
    assert.equal(inventory.body.data.metrics.lowStock, 1);
    assert.equal(inventory.body.data.metrics.outOfStock, 1);

    const attendance = await request(app).get('/api/v1/reports/attendance').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(shop.ownerToken));
    assert.equal(attendance.body.data.metrics.LATE, 1);
    assert.equal(attendance.body.data.metrics.ABSENT, 1);
    assert.equal(attendance.body.data.metrics.earlyDepartures, 1);

    const paidPayroll = await request(app).get('/api/v1/reports/payroll').query({ from: '2026-06-01', to: '2026-06-30', payrollStatus: 'PAID' }).set(auth(shop.ownerToken));
    assert.equal(paidPayroll.body.data.rows.length, 1);
    assert.equal(paidPayroll.body.data.rows[0].status, 'PAID');
    assert.equal(paidPayroll.body.data.rows[0].net, 100);
    const hidden = await runReport({ tenantId, userId: String(owner._id), isOwner: false, permissions: new Set(['reports.payroll']) as never, branchScope: 'ALL', branchIds: [] }, 'payroll', { ...range, payrollStatus: 'PAID' });
    assert.equal(hidden.columns.includes('net'), false);

    const cashier = await request(app).get('/api/v1/reports/cashier').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(shop.ownerToken));
    assert.equal(cashier.body.data.rows[0].expectedCash, 155);
    assert.equal(cashier.body.data.rows[0].formulaExpected, 155);
    assert.equal(cashier.body.data.metrics.supplierPayments, 20);
    assert.notEqual(cashier.body.data.rows[0].expectedCash, 135);

    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({ name: 'Reporter', description: '', permissions: ['reports.sales'] });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const user = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({ fullName: 'Branch Reporter', email: 'reporter@enzo.test', phone: '', password: 'Reporter1' });
    assert.equal(user.status, 201, JSON.stringify(user.body));
    const assigned = await request(app).post(`/api/v1/users/${user.body.data.id}/roles`).set(auth(shop.ownerToken)).send({ assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [branchId] }] });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    const reporter = await tokenFor('reporter@enzo.test', 'Reporter1');
    const foreign = await request(app).get('/api/v1/reports/dashboard').query({ from: '2026-06-01', to: '2026-06-30', branchId: shop.otherBranchId }).set(auth(reporter));
    assert.equal(foreign.status, 403);
    const own = await request(app).get('/api/v1/reports/dashboard').query({ from: '2026-06-01', to: '2026-06-30', branchId }).set(auth(reporter));
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.data.metrics.net, 120);
    const deniedExport = await request(app).get('/api/v1/reports/dashboard/export').query({ from: '2026-06-01', to: '2026-06-30', branchId, format: 'csv', lang: 'en' }).set(auth(reporter));
    assert.equal(deniedExport.status, 403);
    const arabic = await request(app).get('/api/v1/reports/daily/export').query({ from: '2026-06-01', to: '2026-06-30', branchId, format: 'csv', lang: 'ar' }).set(auth(shop.ownerToken));
    assert.equal(arabic.status, 200);
    assert.match(arabic.text, /إجمالي المبيعات/);
    assert.match(arabic.text, /المبيعات اليومية/);
    const english = await request(app).get('/api/v1/reports/daily/export').query({ from: '2026-06-01', to: '2026-06-30', branchId, format: 'csv', lang: 'en' }).set(auth(shop.ownerToken));
    assert.match(english.text, /Gross sales/);
    assert.match(english.text, /Daily sales/);
    const workbook = await request(app).get('/api/v1/reports/daily/export').query({ from: '2026-06-01', to: '2026-06-30', branchId, format: 'xlsx', lang: 'en' }).set(auth(shop.ownerToken)).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    assert.equal(workbook.status, 200);
    assert.equal(workbook.body.subarray(0, 2).toString(), 'PK');
    const pdf = await request(app).get('/api/v1/reports/dashboard/export').query({ from: '2026-06-01', to: '2026-06-30', branchId, format: 'pdf', lang: 'ar' }).set(auth(shop.ownerToken)).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.match(shapeArabic('المبيعات'), /[\uFE70-\uFEFF]/);
  });

  it('verifies webhooks, blocks opted-out promotions, retries failures, and isolates tenant WhatsApp settings', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'wa');
    const other = await setupShop(admin, 'wb');
    const { Customer } = await import('../src/modules/customers/customer.model.js');
    const { WhatsAppEvent } = await import('../src/modules/whatsapp/whatsapp.model.js');
    const customer = await Customer.create({ tenantId: shop.tenantId, customerNumber: 'C-9', fullName: 'Nour', phone: '01012345678', normalizedPhone: '01012345678', promotionalOptIn: true, whatsappOptOut: true, status: 'ACTIVE' });
    const saved = await request(app).put('/api/v1/whatsapp/config').set(auth(shop.ownerToken)).send({ phoneNumberId: '111', businessAccountId: '222', accessToken: 'token-a', appSecret: 'secret-a', verifyToken: 'verify-a', enabled: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.liveMessagingTested, false);
    assert.equal(saved.body.data.tokenSet, true);
    assert.equal(saved.body.data.accessToken, undefined);
    const otherSaved = await request(app).put('/api/v1/whatsapp/config').set(auth(other.ownerToken)).send({ phoneNumberId: '333', businessAccountId: '444', accessToken: 'token-b', appSecret: 'secret-b', verifyToken: 'verify-b', enabled: true });
    assert.equal(otherSaved.status, 200, JSON.stringify(otherSaved.body));
    const isolated = await request(app).get('/api/v1/whatsapp/config').set(auth(other.ownerToken));
    assert.equal(isolated.body.data.phoneNumberId, '333');
    const settings = await request(app).put('/api/v1/whatsapp/notification-settings').set(auth(shop.ownerToken)).send({ appointmentConfirmation: true, appointmentReminder: true, appointmentCancellation: true, appointmentReschedule: true, packagePurchase: true, packageExpiry: true, paymentReceipt: true, promotional: true });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    const challenge = await request(app).get('/api/v1/whatsapp/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-a', 'hub.challenge': '12345' });
    assert.equal(challenge.status, 200);
    assert.equal(challenge.text, '12345');
    const rejected = await request(app).get('/api/v1/whatsapp/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '12345' });
    assert.equal(rejected.status, 403);
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, messages: [{ id: 'wamid.1', from: '201012345678', type: 'text', text: { body: 'STOP' } }] } }] }] };
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', 'secret-a').update(raw).digest('hex');
    const first = await request(app).post('/api/v1/whatsapp/webhook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', `sha256=${signature}`).send(raw);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.duplicate, false);
    const second = await request(app).post('/api/v1/whatsapp/webhook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', `sha256=${signature}`).send(raw);
    assert.equal(second.body.duplicate, true);
    assert.equal(await WhatsAppEvent.countDocuments({ tenantId: other.tenantId }), 0);
    const refreshed = await Customer.findById(customer._id);
    assert.equal(refreshed?.whatsappOptOut, true);
    assert.equal(refreshed?.promotionalOptIn, false);
    const blocked = await request(app).post('/api/v1/whatsapp/messages').set(auth(shop.ownerToken)).send({ customerId: String(customer._id), kind: 'PROMOTION', language: 'ar', idempotencyKey: 'promo-key-1', parameters: ['Offer'] });
    assert.equal(blocked.status, 201, JSON.stringify(blocked.body));
    assert.equal(blocked.body.data.status, 'SKIPPED');
    assert.equal(blocked.body.data.lastError, 'no_consent');
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('no', { status: 500 });
    try {
      const queued = await request(app).post('/api/v1/whatsapp/messages').set(auth(shop.ownerToken)).send({ customerId: String(customer._id), kind: 'APPOINTMENT_CONFIRMATION', language: 'en', idempotencyKey: 'confirm-key-1', parameters: ['Sunday'] });
      assert.equal(queued.status, 201, JSON.stringify(queued.body));
      assert.equal(queued.body.data.attempts, 1);
      assert.equal(queued.body.data.status, 'QUEUED');
      const retry = await request(app).post('/api/v1/whatsapp/retries').set(auth(shop.ownerToken));
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      const { WhatsAppMessage } = await import('../src/modules/whatsapp/whatsapp.model.js');
      const confirmation = await WhatsAppMessage.findOne({ tenantId: shop.tenantId, kind: 'APPOINTMENT_CONFIRMATION' });
      assert.equal(confirmation?.attempts, 2);
    } finally {
      globalThis.fetch = original;
    }
  });
});
