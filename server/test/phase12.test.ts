import assert from 'node:assert/strict';
import type { Express } from 'express';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type mongoose from 'mongoose';
import request from 'supertest';
import { assertIsolatedDatabase, databaseNameFromUri } from '../src/shared/database-guard.js';

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
let SaleTransaction: typeof import('../src/modules/pos/sale.model.js').SaleTransaction;
let Stock: typeof import('../src/modules/inventory/inventory.model.js').Stock;

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

function productBody(categoryId: string, sku: string, minimumStock: number) {
  return {
    name: { en: `Pomade ${sku}`, ar: `بوماد ${sku}` },
    sku,
    barcode: '',
    description: { en: 'Wax', ar: '' },
    categoryId,
    brand: 'Enzo',
    unit: 'piece',
    costPrice: 5,
    sellingPrice: 20,
    minimumStock,
    image: '',
    status: 'ACTIVE',
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
  };
}

async function finish(token: string, id: string) {
  for (const action of ['confirm', 'check-in', 'queue', 'start', 'complete']) {
    const response = await request(app).post(`/api/v1/appointments/${id}/${action}`).set(auth(token)).send({});
    assert.equal(response.status, 200, `${action} ${JSON.stringify(response.body)}`);
  }
}

describe('isolated database guard', () => {
  it('names the database from the URI path', () => {
    assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017/enzo_uat'), 'enzo_uat');
    assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017/enzo_uat_restore?authSource=admin'), 'enzo_uat_restore');
  });

  it('refuses the live shop database, empty names, and production', () => {
    process.env['NODE_ENV'] = 'development';
    try {
      assert.throws(() => assertIsolatedDatabase('mongodb://127.0.0.1:27017/enzo', 'UAT seed'), /enzo/);
      assert.throws(() => assertIsolatedDatabase('mongodb://127.0.0.1:27017/admin', 'UAT reset'), /admin/);
      assert.throws(() => assertIsolatedDatabase('', 'backup'), /UAT_MONGODB_URI/);
      process.env['NODE_ENV'] = 'production';
      assert.throws(() => assertIsolatedDatabase('mongodb://127.0.0.1:27017/enzo_uat', 'UAT seed'), /production/);
    } finally {
      process.env['NODE_ENV'] = 'test';
    }
  });

  it('allows only databases whose names start with enzo_uat', () => {
    process.env['NODE_ENV'] = 'development';
    try {
      assert.equal(assertIsolatedDatabase('mongodb://127.0.0.1:27017/enzo_uat', 'UAT seed'), 'mongodb://127.0.0.1:27017/enzo_uat');
      assert.equal(assertIsolatedDatabase('mongodb://127.0.0.1:27017/enzo_uat_restore', 'restore'), 'mongodb://127.0.0.1:27017/enzo_uat_restore');
    } finally {
      process.env['NODE_ENV'] = 'test';
    }
  });
});

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  SaleTransaction = (await import('../src/modules/pos/sale.model.js')).SaleTransaction;
  Stock = (await import('../src/modules/inventory/inventory.model.js')).Stock;
  const workforce = await import('../src/modules/workforce/workforce.model.js');
  const billing = await import('../src/modules/billing/billing.model.js');
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
    '../src/modules/inventory/inventory.model.js',
    '../src/modules/jobs/job.model.js',
  ];
  app = created.createApp();
  await db.connect(replSet.getUri());
  const imported = await Promise.all(models.map(async (path) => import(path)));
  const ready = [
    ...imported.flatMap((module) => Object.values(module)),
    ...Object.values(workforce),
    ...Object.values(billing),
  ];
  await Promise.all(ready.filter((value) => value && typeof value === 'object' && 'init' in value).map((model) => (model as { init: () => Promise<void> }).init()));
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

describe('inventory pagination', () => {
  it('pages stock in the database and keeps low and out filters exclusive', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pages');
    const other = await createShop(admin, 'pages-other');
    const category = await request(app).post('/api/v1/product-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: 'عناية' }, status: 'ACTIVE' });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    const categoryId = category.body.data.id as string;

    async function stocked(sku: string, minimum: number, quantity: number, branchId: string) {
      const product = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(categoryId, sku, minimum));
      assert.equal(product.status, 201, JSON.stringify(product.body));
      const added = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
        branchId, productId: product.body.data.id, direction: 'IN', quantity, notes: 'Opening count',
      });
      assert.equal(added.status, 200, JSON.stringify(added.body));
      return product.body.data.id as string;
    }

    for (let index = 1; index <= 10; index += 1) {
      await stocked(`UAT-OK-${String(index).padStart(2, '0')}`, 1, 8, shop.branchId);
    }
    for (let index = 1; index <= 8; index += 1) {
      await stocked(`UAT-LOW-${String(index).padStart(2, '0')}`, 5, 2, shop.branchId);
    }
    for (let index = 1; index <= 6; index += 1) {
      const productId = await stocked(`UAT-OUT-${String(index).padStart(2, '0')}`, 5, 1, shop.branchId);
      const removed = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
        branchId: shop.branchId, productId, direction: 'OUT', quantity: 1, notes: 'Sold out',
      });
      assert.equal(removed.status, 200, JSON.stringify(removed.body));
    }
    await stocked('UAT-GIZA-01', 1, 4, shop.otherBranchId);
    const foreignCategory = await request(app).post('/api/v1/product-categories').set(auth(other.ownerToken)).send({ name: { en: 'Care', ar: 'عناية' }, status: 'ACTIVE' });
    const foreignBranch = await request(app).post('/api/v1/branches').set(auth(other.ownerToken)).send(branchBody('CAI', 'Cairo'));
    const foreignProduct = await request(app).post('/api/v1/products').set(auth(other.ownerToken)).send(productBody(foreignCategory.body.data.id, 'UAT-OK-01', 1));
    await request(app).post('/api/v1/inventory/adjustments').set(auth(other.ownerToken)).send({
      branchId: foreignBranch.body.data.id, productId: foreignProduct.body.data.id, direction: 'IN', quantity: 8, notes: 'Other shop',
    });

    const page = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}&page=2&pageSize=10`).set(auth(shop.ownerToken));
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.body.meta.total, 24);
    assert.equal(page.body.meta.page, 2);
    assert.equal(page.body.meta.pageSize, 10);
    assert.equal(page.body.data.length, 10);
    const last = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}&page=3&pageSize=10`).set(auth(shop.ownerToken));
    assert.equal(last.body.data.length, 4);
    const found = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}&search=uat-low-03`).set(auth(shop.ownerToken));
    assert.equal(found.body.meta.total, 1);
    assert.equal(found.body.data[0].sku, 'UAT-LOW-03');
    const low = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}&alert=low&pageSize=50`).set(auth(shop.ownerToken));
    assert.equal(low.body.meta.total, 8);
    assert.ok(low.body.data.every((row: { quantityOnHand: number; minimumStock: number }) => row.quantityOnHand > 0 && row.quantityOnHand <= row.minimumStock));
    const out = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}&alert=out&pageSize=50`).set(auth(shop.ownerToken));
    assert.equal(out.body.meta.total, 6);
    assert.ok(out.body.data.every((row: { quantityOnHand: number }) => row.quantityOnHand === 0));
    const giza = await request(app).get(`/api/v1/inventory?branchId=${shop.otherBranchId}&pageSize=50`).set(auth(shop.ownerToken));
    assert.equal(giza.body.meta.total, 1);
    assert.equal(giza.body.data[0].sku, 'UAT-GIZA-01');
    const indexes = await Stock.collection.indexes();
    assert.ok(indexes.some((index) => index['name'] === 'tenantId_1_branchId_1_updatedAt_-1'));
  });
});

describe('financial reconciliation', () => {
  it('reconciles a split checkout, a cash refund, and the open shift', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'recon');
    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send({
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
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const early = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: created.body.data.id,
      idempotencyKey: 'recon-too-early',
      redemptions: [],
      additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 370, referenceNumber: '' }],
      tips: [],
    });
    assert.equal(early.status, 409);
    assert.equal(await SaleTransaction.countDocuments({ tenantId: shop.tenantId }), 0);
    await finish(shop.ownerToken, created.body.data.id);
    const shift = await request(app).post('/api/v1/cashier-shifts').set(auth(shop.ownerToken)).send({ branchId: shop.branchId, shiftType: 'MORNING', openingBalance: 100 });
    assert.equal(shift.status, 201, JSON.stringify(shift.body));
    const sale = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: created.body.data.id,
      idempotencyKey: 'recon-primary',
      redemptions: [],
      additionalDiscount: 0,
      payments: [
        { method: 'VISA', amount: 200, referenceNumber: 'visa-1' },
        { method: 'CASH', amount: 170, referenceNumber: '' },
      ],
      tips: [{ employeeId: shop.barberId, amount: 20, method: 'CASH', referenceNumber: '' }],
    });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const paid = sale.body.data.payments.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
    assert.equal(paid, sale.body.data.totalAmount);
    assert.equal(sale.body.data.subtotal, 380);
    assert.equal(sale.body.data.manualDiscount, 10);
    assert.equal(sale.body.data.totalAmount, 370);
    const commission = sale.body.data.commissions.reduce((sum: number, row: { commissionAmount: number }) => sum + row.commissionAmount, 0);
    assert.equal(commission, 57);

    const second = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      customerId: shop.customerId,
      barberEmployeeId: shop.barberId,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      services: [{ serviceId: shop.haircutId, quantity: 1 }],
      discount: 0,
      notes: '',
    });
    await finish(shop.ownerToken, second.body.data.id);
    const split = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: second.body.data.id,
      idempotencyKey: 'recon-split',
      redemptions: [],
      additionalDiscount: 0,
      payments: [
        { method: 'CASH', amount: 40, referenceNumber: '' },
        { method: 'VISA', amount: 40, referenceNumber: 'visa-2' },
        { method: 'WALLET', amount: 40, referenceNumber: 'wallet-1' },
        { method: 'INSTAPAY', amount: 30, referenceNumber: 'ip-1' },
      ],
      tips: [],
    });
    assert.equal(split.status, 201, JSON.stringify(split.body));
    assert.equal(split.body.data.payments.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0), 150);
    const replay = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: second.body.data.id,
      idempotencyKey: 'recon-split',
      redemptions: [],
      additionalDiscount: 0,
      payments: [{ method: 'CASH', amount: 150, referenceNumber: '' }],
      tips: [],
    });
    assert.equal(replay.body.data.id, split.body.data.id);
    assert.equal(await SaleTransaction.countDocuments({ tenantId: shop.tenantId }), 2);

    const open = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(open.body.data.openingBalance, 100);
    assert.equal(open.body.data.cashSales, 210);
    assert.equal(open.body.data.cashTips, 20);
    assert.equal(open.body.data.cashRefunds, 0);
    assert.equal(open.body.data.expectedCash, 330);

    const cashPayment = sale.body.data.payments.find((row: { method: string }) => row.method === 'CASH');
    const refund = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: cashPayment.id,
      amount: 40,
      reason: 'Partial cash refund',
      method: 'CASH',
      referenceNumber: 'rf-1',
    });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    const approved = await request(app).post(`/api/v1/refunds/${refund.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const again = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sale.body.data.id,
      paymentId: cashPayment.id,
      amount: 170,
      reason: 'Duplicate of the cash payment',
      method: 'CASH',
      referenceNumber: '',
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'refund_limit');

    const after = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(after.body.data.cashRefunds, 40);
    assert.equal(after.body.data.expectedCash, 290);
    const stats = await request(app).get(`/api/v1/customers/${shop.customerId}/stats`).set(auth(shop.ownerToken));
    assert.equal(stats.body.data.totalPaid, 520);
    assert.equal(stats.body.data.totalRefunds, 40);
    assert.equal(stats.body.data.netSpending, 480);
    assert.equal(stats.body.data.totalSpending, 480);
    const closed = await request(app).post(`/api/v1/cashier-shifts/${shift.body.data.id}/close`).set(auth(shop.ownerToken)).send({ actualCash: 290 });
    assert.equal(closed.body.data.expectedCash, 290);
    assert.equal(closed.body.data.difference, 0);
  });

  it('keeps package remaining quantities at zero or above', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pack');
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
    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      customerId: shop.customerId,
      barberEmployeeId: shop.barberId,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      services: [{ serviceId: shop.haircutId, quantity: 2 }],
      discount: 0,
      notes: '',
    });
    await finish(shop.ownerToken, created.body.data.id);
    const failed = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: created.body.data.id,
      idempotencyKey: 'pack-too-many',
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 3 }],
      additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 300, referenceNumber: '' }],
      tips: [],
    });
    assert.equal(failed.status, 409);
    assert.equal(failed.body.error.code, 'insufficient_quantity');
    const untouched = await request(app).get(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken));
    assert.equal(untouched.body.data[0].items[0].remainingQuantity, 2);
    const redeemed = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: created.body.data.id,
      idempotencyKey: 'pack-one',
      redemptions: [{ customerPackageId: packageId, serviceId: shop.haircutId, quantity: 1 }],
      additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 150, referenceNumber: '' }],
      tips: [],
    });
    assert.equal(redeemed.status, 201, JSON.stringify(redeemed.body));
    const used = await request(app).get(`/api/v1/customers/${shop.customerId}/packages`).set(auth(shop.ownerToken));
    assert.equal(used.body.data[0].items[0].remainingQuantity, 1);
    assert.ok(used.body.data[0].items.every((item: { remainingQuantity: number }) => item.remainingQuantity >= 0));
  });

  it('keeps a subscription invoice out of barbershop sales', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await request(app).post('/api/v1/platform/tenants').set(auth(admin)).send(tenantBody('bill'));
    const plans = await request(app).get('/api/v1/platform/billing/plans').set(auth(admin));
    const starter = plans.body.data.find((plan: { code: string }) => plan.code === 'STARTER');
    const salesBefore = await SaleTransaction.countDocuments();
    const assigned = await request(app).post('/api/v1/platform/billing/subscriptions').set(auth(admin)).send({
      tenantId: shop.body.data.id,
      planId: starter.id,
      billingInterval: 'MONTHLY',
    });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    assert.equal(assigned.body.data.status, 'TRIALING');
    const invoice = await request(app).post('/api/v1/platform/billing/invoices').set(auth(admin)).send({
      tenantId: shop.body.data.id,
      subscriptionId: assigned.body.data.id,
      amount: 499,
      taxAmount: 0,
      currency: 'EGP',
      dueDate: '2026-12-01',
    });
    assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
    const paid = await request(app).post(`/api/v1/platform/billing/invoices/${invoice.body.data.id}/payments`).set(auth(admin)).send({
      amount: 499,
      status: 'PAID',
      reference: 'manual-uat',
      note: 'Recorded by hand',
    });
    assert.equal(paid.status, 201, JSON.stringify(paid.body));
    assert.equal(paid.body.data.gateway, 'MANUAL');
    assert.equal(await SaleTransaction.countDocuments(), salesBefore);
  });

  it('does not treat days without an attendance record as absence', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'attend');
    const generated = await request(app).post('/api/v1/payroll/generate').set(auth(shop.ownerToken)).send({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      branchId: shop.branchId,
      employeeIds: [shop.barberId],
    });
    assert.equal(generated.status, 201, JSON.stringify(generated.body));
    const payroll = generated.body.data[0];
    assert.equal(payroll.attendanceSummary.absent, 0);
    assert.equal(payroll.attendanceSummary.present, 0);
    assert.equal(payroll.attendanceDeductions, 0);
    assert.equal(payroll.basicSalary, 8000);
    assert.equal(payroll.status, 'DRAFT');
  });
});
