import assert from 'node:assert/strict';
import type { Express } from 'express';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type mongoose from 'mongoose';
import request from 'supertest';

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
let CustomerPackage: typeof import('../src/modules/packages/package.model.js').CustomerPackage;

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

function serviceBody(categoryId: string, name: string, price: number) {
  return {
    name: { en: name, ar: `${name} عربي` },
    description: { en: '', ar: '' },
    categoryId,
    image: '',
    price,
    commissionType: 'PERCENTAGE',
    commissionValue: 15,
  };
}

async function tokenFor(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password, rememberMe: true });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function createShop(adminToken: string, suffix: string) {
  const response = await request(app).post('/api/v1/platform/tenants').set(auth(adminToken)).send(tenantBody(suffix));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const ownerToken = await tokenFor(`owner-${suffix}@enzo.test`, 'OwnerPass1');
  return { ownerToken, tenantId: response.body.data.id as string };
}

async function setupShop(adminToken: string, suffix: string) {
  const shop = await createShop(adminToken, suffix);
  const branch = await request(app).post('/api/v1/branches').set(auth(shop.ownerToken)).send(branchBody('CAI', 'Cairo'));
  const other = await request(app).post('/api/v1/branches').set(auth(shop.ownerToken)).send(branchBody('GIZ', 'Giza'));
  assert.equal(branch.status, 201, JSON.stringify(branch.body));
  const [types, titles] = await Promise.all([
    request(app).get('/api/v1/employees/employment-types').set(auth(shop.ownerToken)),
    request(app).get('/api/v1/employees/job-titles').set(auth(shop.ownerToken)),
  ]);
  const barber = await request(app).post('/api/v1/employees').set(auth(shop.ownerToken)).send({
    fullName: 'Omar Adel',
    email: '',
    phone: '01200000001',
    nationalId: '29901011234567',
    address: 'Cairo',
    dateOfBirth: '1999-01-01',
    joiningDate: '2026-01-01',
    employmentTypeId: types.body.data[0].id,
    jobTitleId: titles.body.data[0].id,
    salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 0, tips: 0, deductions: 0 },
    notes: '',
    branches: [{ branchId: branch.body.data.id, isPrimary: true }],
  });
  assert.equal(barber.status, 201, JSON.stringify(barber.body));
  const category = await request(app).post('/api/v1/service-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE' });
  const haircut = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 150));
  const beard = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Beard', 80));
  const customer = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
    fullName: 'Mona Adel', phone: '01012345678', email: '', dateOfBirth: '', gender: '', address: '', notes: '',
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.body));
  return {
    ...shop,
    branchId: branch.body.data.id as string,
    otherBranchId: other.body.data.id as string,
    barberId: barber.body.data.id as string,
    haircutId: haircut.body.data.id as string,
    beardId: beard.body.data.id as string,
    customerId: customer.body.data.id as string,
    categoryId: category.body.data.id as string,
  };
}

function booking(shop: Awaited<ReturnType<typeof setupShop>>, extra: Record<string, unknown> = {}) {
  return {
    branchId: shop.branchId,
    customerId: shop.customerId,
    barberEmployeeId: shop.barberId,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    services: [
      { serviceId: shop.haircutId, quantity: 2 },
      { serviceId: shop.beardId, quantity: 1 },
    ],
    discount: 10,
    notes: '',
    ...extra,
  };
}

async function finish(token: string, id: string) {
  for (const action of ['confirm', 'check-in', 'queue', 'start', 'complete']) {
    const response = await request(app).post(`/api/v1/appointments/${id}/${action}`).set(auth(token)).send({});
    assert.equal(response.status, 200, `${action} ${JSON.stringify(response.body)}`);
  }
}

function pay(appointmentId: string, key: string, amount: number, method = 'VISA', extra: Record<string, unknown> = {}) {
  return {
    appointmentId,
    idempotencyKey: key,
    redemptions: [],
    additionalDiscount: 0,
    payments: [{ method, amount, referenceNumber: '' }],
    tips: [],
    ...extra,
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  CustomerPackage = (await import('../src/modules/packages/package.model.js')).CustomerPackage;
  const models = [
    '../src/modules/tenants/tenant.model.js',
    '../src/modules/sessions/session.model.js',
    '../src/modules/roles/role.model.js',
    '../src/modules/roles/user-role.model.js',
    '../src/modules/branches/branch.model.js',
    '../src/modules/employees/employee.model.js',
    '../src/modules/employees/assignment.model.js',
    '../src/modules/employees/catalog.model.js',
    '../src/modules/commissions/commission.model.js',
    '../src/modules/access/audit.model.js',
    '../src/modules/services/service-category.model.js',
    '../src/modules/services/service.model.js',
    '../src/modules/customers/customer.model.js',
    '../src/modules/packages/package.model.js',
    '../src/modules/appointments/appointment.model.js',
    '../src/modules/pos/sale.model.js',
  ];
  app = created.createApp();
  await db.connect(replSet.getUri());
  await Promise.all(models.map(async (path) => {
    const imported = await import(path);
    await Promise.all(Object.values(imported).filter((value) => value && typeof value === 'object' && 'init' in value).map((model) => (model as { init: () => Promise<void> }).init()));
  }));
  await User.init();
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
    phone: '',
    userType: 'SUPER_ADMIN',
    tenantId: null,
    status: 'ACTIVE',
    isEmailVerified: true,
  });
});

describe('checkout, payments, and cashier shifts', () => {
  it('checks out a completed appointment once and keeps financial snapshots', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pay');
    const other = await createShop(admin, 'other');
    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    const early = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(id, 'early-payment-key', 370));
    assert.equal(early.status, 409);
    assert.equal(early.body.error.code, 'appointment_not_ready');
    await finish(shop.ownerToken, id);

    const beforePay = await request(app).get(`/api/v1/customers/${shop.customerId}/stats`).set(auth(shop.ownerToken));
    assert.equal(beforePay.body.data.totalSpending, 0);
    assert.equal(beforePay.body.data.totalTransactions, 0);
    const ready = await request(app).get(`/api/v1/pos/appointments?search=Mona`).set(auth(shop.ownerToken));
    assert.equal(ready.body.data.length, 1);

    const cashBlocked = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(id, 'cash-needs-shift-1', 370, 'CASH'));
    assert.equal(cashBlocked.status, 409);
    assert.equal(cashBlocked.body.error.code, 'shift_required');
    const mismatch = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(id, 'mismatch-payment-1', 10));
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error.code, 'payment_mismatch');

    const shift = await request(app).post('/api/v1/cashier-shifts').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, shiftType: 'MORNING', openingBalance: 100 });
    assert.equal(shift.status, 201, JSON.stringify(shift.body));
    const againShift = await request(app).post('/api/v1/cashier-shifts').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, shiftType: 'EVENING', openingBalance: 0 });
    assert.equal(againShift.status, 409);

    const sale = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: id,
      idempotencyKey: 'checkout-primary-01',
      redemptions: [],
      additionalDiscount: 0,
      payments: [
        { method: 'VISA', amount: 200, referenceNumber: 'visa-1' },
        { method: 'CASH', amount: 170, referenceNumber: '' },
      ],
      tips: [{ employeeId: shop.barberId, amount: 20, method: 'CASH', referenceNumber: '' }],
    });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    assert.equal(sale.body.data.transactionNumber, 'TXN-0001');
    assert.equal(sale.body.data.subtotal, 380);
    assert.equal(sale.body.data.manualDiscount, 10);
    assert.equal(sale.body.data.totalAmount, 370);
    assert.equal(sale.body.data.tipTotal, 20);
    assert.equal(sale.body.data.paidAmount, 370);
    assert.equal(sale.body.data.amountDue, 0);
    assert.equal(sale.body.data.status, 'PAID');
    assert.equal(sale.body.data.items[0].unitPrice, 150);
    const haircutCommission = sale.body.data.commissions.find((row: { serviceId: string }) => row.serviceId === shop.haircutId);
    const beardCommission = sale.body.data.commissions.find((row: { serviceId: string }) => row.serviceId === shop.beardId);
    assert.equal(haircutCommission.commissionAmount, 45);
    assert.equal(haircutCommission.source, 'SERVICE');
    assert.equal(beardCommission.commissionAmount, 12);
    assert.equal(beardCommission.commissionAmount + haircutCommission.commissionAmount, 57);

    const replay = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: id,
      idempotencyKey: 'checkout-primary-01',
      redemptions: [],
      additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 370, referenceNumber: '' }],
      tips: [],
    });
    assert.equal(replay.body.data.id, sale.body.data.id);
    const duplicate = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(id, 'checkout-second-key', 370));
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'duplicate_checkout');

    const hidden = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(other.ownerToken));
    assert.equal(hidden.status, 404);
    const stats = await request(app).get(`/api/v1/customers/${shop.customerId}/stats`).set(auth(shop.ownerToken));
    assert.equal(stats.body.data.totalPaid, 370);
    assert.equal(stats.body.data.totalSpending, 370);
    assert.equal(stats.body.data.netSpending, 370);
    assert.equal(stats.body.data.totalRefunds, 0);
    assert.equal(stats.body.data.totalTransactions, 1);
    const payments = await request(app).get(`/api/v1/customers/${shop.customerId}/payments`).set(auth(shop.ownerToken));
    assert.equal(payments.body.source, 'transactions');
    assert.equal(payments.body.data.length, 1);

    const second = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, {
      discount: 0,
      services: [{ serviceId: shop.haircutId, quantity: 1 }],
    }));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    await finish(shop.ownerToken, second.body.data.id);

    await request(app).put(`/api/v1/services/${shop.haircutId}`).set(auth(shop.ownerToken)).send(serviceBody(shop.categoryId, 'Haircut', 240));
    const frozen = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(frozen.body.data.items[0].unitPrice, 150);
    assert.equal(frozen.body.data.commissions[0].commissionAmount, sale.body.data.commissions[0].commissionAmount);

    const open = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(open.body.data.cashSales, 170);
    assert.equal(open.body.data.cashTips, 20);
    assert.equal(open.body.data.expectedCash, 290);

    const override = await request(app).put(`/api/v1/employees/${shop.barberId}/commissions`).set(auth(shop.ownerToken)).send({
      serviceCode: shop.haircutId.toUpperCase(),
      kind: 'FIXED',
      value: 25,
    });
    assert.equal(override.status, 200, JSON.stringify(override.body));
    const visaOnly = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(second.body.data.id, 'visa-only-checkout', 150));
    assert.equal(visaOnly.status, 201, JSON.stringify(visaOnly.body));
    assert.equal(visaOnly.body.data.totalAmount, 150);
    assert.equal(visaOnly.body.data.commissions[0].commissionAmount, 25);
    assert.equal(visaOnly.body.data.commissions[0].source, 'EMPLOYEE_SERVICE');
    const still = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(still.body.data.commissions.find((row: { serviceId: string }) => row.serviceId === shop.haircutId).commissionAmount, 45);
    const unchangedCash = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(unchangedCash.body.data.expectedCash, 290);
    assert.equal(unchangedCash.body.data.cashSales, 170);

    const closed = await request(app).post(`/api/v1/cashier-shifts/${shift.body.data.id}/close`).set(auth(shop.ownerToken)).send({ actualCash: 280 });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.data.expectedCash, 290);
    assert.equal(closed.body.data.actualCash, 280);
    assert.equal(closed.body.data.difference, -10);
    assert.equal(closed.body.data.status, 'CLOSED');

    const cashPayment = sale.body.data.payments.find((row: { method: string }) => row.method === 'CASH');
    const blockedRefund = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: cashPayment.id,
      amount: 40,
      reason: 'Service adjustment',
      method: 'CASH',
      referenceNumber: 'rf-1',
    });
    assert.equal(blockedRefund.status, 201, JSON.stringify(blockedRefund.body));
    const needsShift = await request(app).post(`/api/v1/refunds/${blockedRefund.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    assert.equal(needsShift.status, 409);
    assert.equal(needsShift.body.error.code, 'shift_required');
    const evening = await request(app).post('/api/v1/cashier-shifts').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, shiftType: 'EVENING', openingBalance: 100 });
    assert.equal(evening.status, 201, JSON.stringify(evening.body));
    const approved = await request(app).post(`/api/v1/refunds/${blockedRefund.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const partial = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(partial.body.data.status, 'PARTIALLY_REFUNDED');
    assert.equal(partial.body.data.refundedAmount, 40);
    const tooMuch = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: cashPayment.id,
      amount: 200,
      reason: 'Too much',
      method: 'CASH',
      referenceNumber: '',
    });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.error.code, 'refund_limit');
    const rest = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: cashPayment.id,
      amount: 130,
      reason: 'Remainder of cash',
      method: 'VISA',
      referenceNumber: 'rf-2',
    });
    assert.equal(rest.status, 201, JSON.stringify(rest.body));
    const restApproved = await request(app).post(`/api/v1/refunds/${rest.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    assert.equal(restApproved.status, 200, JSON.stringify(restApproved.body));
    const afterCash = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(afterCash.body.data.refundedAmount, 170);
    assert.equal(afterCash.body.data.status, 'PARTIALLY_REFUNDED');
    const visaPayment = sale.body.data.payments.find((row: { method: string }) => row.method === 'VISA');
    const full = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: visaPayment.id,
      amount: 200,
      reason: 'Full remaining refund',
      method: 'VISA',
      referenceNumber: 'rf-3',
    });
    await request(app).post(`/api/v1/refunds/${full.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    const refunded = await request(app).get(`/api/v1/transactions/${sale.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(refunded.body.data.status, 'REFUNDED');
    assert.equal(refunded.body.data.refundedAmount, 370);
    const shiftAfter = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(shiftAfter.body.data.cashRefunds, 40);
    assert.equal(shiftAfter.body.data.expectedCash, 60);
    const net = await request(app).get(`/api/v1/customers/${shop.customerId}/stats`).set(auth(shop.ownerToken));
    assert.equal(net.body.data.totalPaid, 520);
    assert.equal(net.body.data.totalRefunds, 370);
    assert.equal(net.body.data.netSpending, 150);
    assert.equal(net.body.data.totalSpending, 150);

    const summary = await request(app).get(`/api/v1/commission-reports/summary?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    const omar = summary.body.data.find((row: { employeeId: string }) => row.employeeId === shop.barberId);
    assert.equal(omar.commissionAmount, 82);
  });

  it('redeems packages atomically and isolates checkout by tenant and branch', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pack');
    const outsider = await createShop(admin, 'outsider');
    const template = await request(app).post('/api/v1/packages').set(auth(shop.ownerToken)).send({
      name: { en: 'VIP', ar: 'كبار' },
      description: { en: '', ar: '' },
      image: '',
      items: [{ serviceId: shop.haircutId, quantity: 2 }],
      price: 200,
      validityType: 'VALIDITY_DAYS',
      validityDays: 30,
      fixedExpiryDate: '',
    });
    assert.equal(template.status, 201, JSON.stringify(template.body));
    const assigned = await request(app).post(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken)).send({ packageTemplateId: template.body.data.id });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    const packageId = assigned.body.data.id as string;

    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, {
      discount: 0,
      services: [{ serviceId: shop.haircutId, quantity: 2 }],
    }));
    await finish(shop.ownerToken, created.body.data.id);
    const badPay = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(created.body.data.id, 'bad-redeem-pay-01', 1, 'VISA', {
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 1 }],
    }));
    assert.equal(badPay.status, 400);
    const untouched = await request(app).get(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken));
    assert.equal(untouched.body.data[0].items[0].remainingQuantity, 2);

    const redeemed = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(created.body.data.id, 'redeem-one-visit-1', 150, 'VISA', {
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 1 }],
    }));
    assert.equal(redeemed.status, 201, JSON.stringify(redeemed.body));
    assert.equal(redeemed.body.data.packageDiscount, 150);
    assert.equal(redeemed.body.data.totalAmount, 150);
    assert.equal(redeemed.body.data.items.find((item: { itemType: string }) => item.itemType === 'SERVICE').unitPrice, 150);
    const used = await request(app).get(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken));
    assert.equal(used.body.data[0].items[0].remainingQuantity, 1);
    const commission = redeemed.body.data.commissions[0];
    assert.equal(commission.commissionAmount, 22.5);

    const next = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, {
      discount: 0,
      services: [{ serviceId: shop.haircutId, quantity: 2 }],
    }));
    await finish(shop.ownerToken, next.body.data.id);
    const short = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(next.body.data.id, 'redeem-too-many-01', 0, 'VISA', {
      payments: [],
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 2 }],
    }));
    assert.equal(short.status, 409);
    assert.equal(short.body.error.code, 'insufficient_quantity');
    const still = await request(app).get(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken));
    assert.equal(still.body.data[0].items[0].remainingQuantity, 1);

    const stranger = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
      fullName: 'Nader Adel', phone: '01055554444', email: '', dateOfBirth: '', gender: '', address: '', notes: '',
    });
    const foreign = await request(app).post(`/api/v1/customers/${stranger.body.data.id}/packages`).set(auth(shop.ownerToken)).send({ packageTemplateId: template.body.data.id });
    const crossed = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(next.body.data.id, 'foreign-package-01', 300, 'VISA', {
      redemptions: [{ customerPackageId: foreign.body.data.id, serviceId: shop.haircutId, quantity: 1 }],
    }));
    assert.equal(crossed.status, 404);

    await CustomerPackage.updateOne({ _id: packageId }, { $set: { expiresAt: new Date(Date.now() - 60_000), status: 'ACTIVE' } });
    const expired = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(next.body.data.id, 'expired-package-01', 150, 'VISA', {
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 1 }],
    }));
    assert.equal(expired.status, 409);
    assert.equal(expired.body.error.code, 'package_expired');

    const hairOnly = await request(app).post(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken)).send({ packageTemplateId: template.body.data.id });
    assert.equal(hairOnly.status, 201, JSON.stringify(hairOnly.body));
    const beardVisit = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, {
      discount: 0,
      services: [{ serviceId: shop.beardId, quantity: 1 }],
    }));
    await finish(shop.ownerToken, beardVisit.body.data.id);
    const wrongService = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(beardVisit.body.data.id, 'wrong-service-pack', 80, 'VISA', {
      redemptions: [{ customerPackageId: hairOnly.body.data.id, serviceId: shop.beardId, quantity: 1 }],
    }));
    assert.equal(wrongService.status, 400);

    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Giza Cashier',
      description: '',
      permissions: ['pos.view', 'pos.checkout', 'transactions.view'],
    });
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Giza Desk', email: 'giza-cash@enzo.test', phone: '', password: 'DeskPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [shop.otherBranchId] }],
    });
    const giza = await tokenFor('giza-cash@enzo.test', 'DeskPass1');
    const forbidden = await request(app).post('/api/v1/pos/checkout').set(auth(giza)).send(pay(next.body.data.id, 'giza-cannot-cairo', 300));
    assert.equal(forbidden.status, 403);
    const outside = await request(app).post('/api/v1/pos/checkout').set(auth(outsider.ownerToken)).send(pay(next.body.data.id, 'other-tenant-key', 300));
    assert.equal(outside.status, 404);

    const [first, second] = await Promise.all([
      request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(next.body.data.id, 'concurrent-key-aaa', 300)),
      request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send(pay(next.body.data.id, 'concurrent-key-bbb', 300)),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const winner = first.status === 201 ? first : second;
    assert.equal(winner.body.data.totalAmount, 300);
    const listed = await request(app).get('/api/v1/transactions').set(auth(shop.ownerToken));
    const matches = listed.body.data.filter((row: { id: string }) => row.id === winner.body.data.id);
    assert.equal(matches.length, 1);
  });
});
