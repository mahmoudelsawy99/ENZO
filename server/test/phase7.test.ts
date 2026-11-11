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
    fullName: 'Omar Adel', email: '', phone: '01200000001', nationalId: '29901011234567', address: 'Cairo',
    dateOfBirth: '1999-01-01', joiningDate: '2026-01-01', employmentTypeId: types.body.data[0].id, jobTitleId: titles.body.data[0].id,
    salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 0, tips: 0, deductions: 0 }, notes: '',
    branches: [{ branchId: branch.body.data.id, isPrimary: true }],
  });
  const category = await request(app).post('/api/v1/service-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE' });
  const haircut = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send({
    name: { en: 'Haircut', ar: 'قص' }, description: { en: '', ar: '' }, categoryId: category.body.data.id, image: '', price: 150, commissionType: 'PERCENTAGE', commissionValue: 15,
  });
  const customer = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
    fullName: 'Mona Adel', phone: '01012345678', email: '', dateOfBirth: '', gender: '', address: '', notes: '',
  });
  assert.equal(barber.status, 201);
  assert.equal(customer.status, 201);
  return {
    ...shop,
    branchId: branch.body.data.id as string,
    otherBranchId: other.body.data.id as string,
    barberId: barber.body.data.id as string,
    haircutId: haircut.body.data.id as string,
    customerId: customer.body.data.id as string,
  };
}

function productBody(categoryId: string, sku: string, extra: Record<string, unknown> = {}) {
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
    minimumStock: 5,
    image: '',
    status: 'ACTIVE',
    ...extra,
  };
}

async function readyAppointment(token: string, shop: Awaited<ReturnType<typeof setupShop>>) {
  const created = await request(app).post('/api/v1/appointments').set(auth(token)).send({
    branchId: shop.branchId,
    customerId: shop.customerId,
    barberEmployeeId: shop.barberId,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    services: [{ serviceId: shop.haircutId, quantity: 1 }],
    discount: 0,
    notes: '',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  for (const action of ['confirm', 'check-in', 'queue', 'start', 'complete']) {
    const response = await request(app).post(`/api/v1/appointments/${created.body.data.id}/${action}`).set(auth(token)).send({});
    assert.equal(response.status, 200, `${action} ${JSON.stringify(response.body)}`);
  }
  return created.body.data.id as string;
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
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

describe('phase 7 inventory', () => {
  it('keeps products, stock, purchases, transfers, and alerts inside the tenant and branch', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'stock');
    const other = await createShop(admin, 'other-stock');
    const category = await request(app).post('/api/v1/product-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: 'عناية' }, status: 'ACTIVE' });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    const duplicateCategory = await request(app).post('/api/v1/product-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: '' }, status: 'ACTIVE' });
    assert.equal(duplicateCategory.status, 409);

    const product = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'POM-1', { barcode: '111' }));
    assert.equal(product.status, 201, JSON.stringify(product.body));
    const duplicateSku = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'POM-1'));
    assert.equal(duplicateSku.status, 409);
    assert.equal(duplicateSku.body.error.code, 'duplicate_sku');
    const duplicateBarcode = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'POM-2', { barcode: '111' }));
    assert.equal(duplicateBarcode.status, 409);
    const hidden = await request(app).get(`/api/v1/products/${product.body.data.id}`).set(auth(other.ownerToken));
    assert.equal(hidden.status, 404);
    const listed = await request(app).get('/api/v1/products?search=pom&sort=sku&direction=asc').set(auth(shop.ownerToken));
    assert.equal(listed.body.meta.total, 1);

    const deactivated = await request(app).post(`/api/v1/products/${product.body.data.id}/deactivate`).set(auth(shop.ownerToken)).send({});
    assert.equal(deactivated.body.data.status, 'INACTIVE');
    await request(app).put(`/api/v1/products/${product.body.data.id}`).set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'POM-1', { barcode: '111', status: 'ACTIVE' }));

    const supplier = await request(app).post('/api/v1/suppliers').set(auth(shop.ownerToken)).send({
      name: 'Cairo Supply', phone: '01099998888', email: '', address: 'Cairo', taxNumber: '', notes: '', status: 'ACTIVE',
    });
    assert.equal(supplier.status, 201, JSON.stringify(supplier.body));
    const first = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 10, unitCost: 5 }],
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.receiveStatus, 'NOT_RECEIVED');
    assert.equal(first.body.data.paymentStatus, 'UNPAID');
    const before = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(before.body.data.stock.quantityOnHand, 0);
    const received = await request(app).post(`/api/v1/purchases/${first.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    assert.equal(received.status, 200, JSON.stringify(received.body));
    const again = await request(app).post(`/api/v1/purchases/${first.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'already_received');

    const second = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 10, unitCost: 15 }],
    });
    await request(app).post(`/api/v1/purchases/${second.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    const stock = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(stock.body.data.stock.quantityOnHand, 20);
    assert.equal(stock.body.data.stock.averageCost, 10);
    const giza = await request(app).get(`/api/v1/inventory?branchId=${shop.otherBranchId}`).set(auth(shop.ownerToken));
    assert.equal(giza.body.meta.total, 0);

    const partial = await request(app).post(`/api/v1/purchases/${second.body.data.id}/payments`).set(auth(shop.ownerToken)).send({ method: 'VISA', amount: 50, referenceNumber: 'v1' });
    assert.equal(partial.body.data.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(partial.body.data.remainingAmount, 100);
    const over = await request(app).post(`/api/v1/purchases/${second.body.data.id}/payments`).set(auth(shop.ownerToken)).send({ method: 'CASH', amount: 500, referenceNumber: '' });
    assert.equal(over.status, 409);
    const paid = await request(app).post(`/api/v1/purchases/${second.body.data.id}/payments`).set(auth(shop.ownerToken)).send({ method: 'CASH', amount: 100, referenceNumber: '' });
    assert.equal(paid.body.data.paymentStatus, 'PAID');
    assert.equal(paid.body.data.payments.length, 2);
    const firstPay = await request(app).post(`/api/v1/purchases/${first.body.data.id}/payments`).set(auth(shop.ownerToken)).send({ method: 'VISA', amount: 50, referenceNumber: '' });
    assert.equal(firstPay.body.data.paymentStatus, 'PAID');
    const supplierView = await request(app).get(`/api/v1/suppliers/${supplier.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(supplierView.body.data.outstanding, 0);
    assert.equal(supplierView.body.data.purchases.length, 2);

    const tooMuch = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, productId: product.body.data.id, direction: 'OUT', quantity: 100, notes: 'Count error',
    });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.error.code, 'insufficient_stock');
    const adjusted = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, productId: product.body.data.id, direction: 'OUT', quantity: 4, notes: 'Damaged jars',
    });
    assert.equal(adjusted.status, 200, JSON.stringify(adjusted.body));
    assert.equal(adjusted.body.data.stock.quantityOnHand, 16);

    const draft = await request(app).post('/api/v1/transfers').set(auth(shop.ownerToken)).send({
      sourceBranchId: shop.branchId, destinationBranchId: shop.otherBranchId, notes: '',
      items: [{ productId: product.body.data.id, quantity: 4 }],
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const sameBranch = await request(app).post('/api/v1/transfers').set(auth(shop.ownerToken)).send({
      sourceBranchId: shop.branchId, destinationBranchId: shop.branchId, notes: '',
      items: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(sameBranch.status, 400);
    const sent = await request(app).post(`/api/v1/transfers/${draft.body.data.id}/send`).set(auth(shop.ownerToken)).send({});
    assert.equal(sent.body.data.status, 'SENT');
    const afterSend = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(afterSend.body.data.stock.quantityOnHand, 12);
    const receivedTransfer = await request(app).post(`/api/v1/transfers/${draft.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    assert.equal(receivedTransfer.body.data.status, 'RECEIVED');
    const twice = await request(app).post(`/api/v1/transfers/${draft.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    assert.equal(twice.status, 409);
    const cancelReceived = await request(app).post(`/api/v1/transfers/${draft.body.data.id}/cancel`).set(auth(shop.ownerToken)).send({});
    assert.equal(cancelReceived.status, 409);
    const destination = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.otherBranchId}`).set(auth(shop.ownerToken));
    assert.equal(destination.body.data.stock.quantityOnHand, 4);
    assert.equal(destination.body.data.stock.averageCost, 10);

    const reversible = await request(app).post('/api/v1/transfers').set(auth(shop.ownerToken)).send({
      sourceBranchId: shop.branchId, destinationBranchId: shop.otherBranchId, notes: 'Hold',
      items: [{ productId: product.body.data.id, quantity: 2 }],
    });
    await request(app).post(`/api/v1/transfers/${reversible.body.data.id}/send`).set(auth(shop.ownerToken)).send({});
    const cancelled = await request(app).post(`/api/v1/transfers/${reversible.body.data.id}/cancel`).set(auth(shop.ownerToken)).send({});
    assert.equal(cancelled.body.data.status, 'CANCELLED');
    const restored = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(restored.body.data.stock.quantityOnHand, 12);
    const lowered = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, productId: product.body.data.id, direction: 'OUT', quantity: 8, notes: 'Bring it under the minimum',
    });
    assert.equal(lowered.status, 200, JSON.stringify(lowered.body));

    const alerts = await request(app).get(`/api/v1/stock-alerts?branchId=${shop.branchId}&status=ACTIVE`).set(auth(shop.ownerToken));
    assert.equal(alerts.body.data.length, 1);
    assert.equal(alerts.body.data[0].kind, 'LOW');
    const summary = await request(app).get(`/api/v1/inventory/summary?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(summary.body.data.lowStock, 1);
    const dismissed = await request(app).post(`/api/v1/stock-alerts/${alerts.body.data[0].id}/status`).set(auth(shop.ownerToken)).send({ status: 'DISMISSED' });
    assert.equal(dismissed.body.data.status, 'DISMISSED');
    const refill = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 1, unitCost: 10 }],
    });
    await request(app).post(`/api/v1/purchases/${refill.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    const activeAgain = await request(app).get(`/api/v1/stock-alerts?branchId=${shop.branchId}&status=ACTIVE`).set(auth(shop.ownerToken));
    assert.equal(activeAgain.body.data.length, 1);
    const purchaseReturn = await request(app).post(`/api/v1/purchases/${first.body.data.id}/return`).set(auth(shop.ownerToken)).send({
      reason: 'Damaged jar',
      items: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(purchaseReturn.status, 200, JSON.stringify(purchaseReturn.body));
    const emptied = await request(app).post('/api/v1/inventory/adjustments').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, productId: product.body.data.id, direction: 'OUT', quantity: 4, notes: 'Shelf is empty',
    });
    assert.equal(emptied.status, 200, JSON.stringify(emptied.body));
    const out = await request(app).get(`/api/v1/stock-alerts?branchId=${shop.branchId}&status=ACTIVE`).set(auth(shop.ownerToken));
    assert.equal(out.body.data.length, 1);
    assert.equal(out.body.data[0].kind, 'OUT');
    const outSummary = await request(app).get(`/api/v1/inventory/summary?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(outSummary.body.data.outOfStock, 1);

    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Giza Stock', description: '', permissions: ['inventory.view', 'inventory.adjust', 'products.view'],
    });
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Giza Stock', email: 'giza-stock@enzo.test', phone: '', password: 'DeskPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [shop.otherBranchId] }],
    });
    const limited = await tokenFor('giza-stock@enzo.test', 'DeskPass1');
    const denied = await request(app).get(`/api/v1/inventory?branchId=${shop.branchId}`).set(auth(limited));
    assert.equal(denied.status, 403);
    const allowed = await request(app).get(`/api/v1/inventory?branchId=${shop.otherBranchId}`).set(auth(limited));
    assert.equal(allowed.status, 200);
    const noCreate = await request(app).post('/api/v1/products').set(auth(limited)).send(productBody(category.body.data.id, 'NOPE'));
    assert.equal(noCreate.status, 403);
  });

  it('sells products only after a successful checkout and restocks only when asked', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'pos-stock');
    const category = await request(app).post('/api/v1/product-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: '' }, status: 'ACTIVE' });
    const product = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'POM-9', { minimumStock: 0, sellingPrice: 20 }));
    const supplier = await request(app).post('/api/v1/suppliers').set(auth(shop.ownerToken)).send({
      name: 'Cairo Supply', phone: '', email: '', address: '', taxNumber: '', notes: '', status: 'ACTIVE',
    });
    const purchase = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 3, unitCost: 8 }],
    });
    await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});

    const failedVisit = await readyAppointment(shop.ownerToken, shop);
    const failed = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: failedVisit, idempotencyKey: 'failed-product-01', redemptions: [], additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 1, referenceNumber: '' }], tips: [],
      products: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(failed.status, 400);
    assert.equal(failed.body.error.code, 'payment_mismatch');
    const untouched = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(untouched.body.data.stock.quantityOnHand, 3);

    const visit = await readyAppointment(shop.ownerToken, shop);
    const sold = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: visit, idempotencyKey: 'sold-product-01', redemptions: [], additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 170, referenceNumber: '' }], tips: [],
      products: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(sold.status, 201, JSON.stringify(sold.body));
    assert.equal(sold.body.data.totalAmount, 170);
    assert.equal(sold.body.data.items.some((item: { itemType: string }) => item.itemType === 'PRODUCT'), true);
    assert.equal(sold.body.data.items.some((item: { itemType: string }) => item.itemType === 'SERVICE'), true);
    const afterSale = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(afterSale.body.data.stock.quantityOnHand, 2);
    assert.equal(afterSale.body.data.movements.some((row: { movementType: string }) => row.movementType === 'SALE'), true);

    const moneyOnly = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: sold.body.data.id, paymentId: sold.body.data.payments[0].id, amount: 20, reason: 'Changed mind', method: 'VISA', referenceNumber: '', restock: false,
    });
    assert.equal(moneyOnly.status, 201, JSON.stringify(moneyOnly.body));
    await request(app).post(`/api/v1/refunds/${moneyOnly.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    const stillSold = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(stillSold.body.data.stock.quantityOnHand, 2);

    const restockVisit = await readyAppointment(shop.ownerToken, shop);
    const restockSale = await request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
      appointmentId: restockVisit, idempotencyKey: 'restock-product-1', redemptions: [], additionalDiscount: 0,
      payments: [{ method: 'VISA', amount: 170, referenceNumber: '' }], tips: [],
      products: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(restockSale.status, 201, JSON.stringify(restockSale.body));
    const restock = await request(app).post('/api/v1/refunds').set(auth(shop.ownerToken)).send({
      transactionId: restockSale.body.data.id, paymentId: restockSale.body.data.payments[0].id, amount: 20, reason: 'Unopened', method: 'VISA', referenceNumber: '', restock: true,
    });
    await request(app).post(`/api/v1/refunds/${restock.body.data.id}/approve`).set(auth(shop.ownerToken)).send({});
    const returned = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(returned.body.data.stock.quantityOnHand, 2);
    assert.equal(returned.body.data.movements.some((row: { movementType: string }) => row.movementType === 'SALE_RETURN'), true);

    const oversellA = await readyAppointment(shop.ownerToken, shop);
    const oversellB = await readyAppointment(shop.ownerToken, shop);
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
        appointmentId: oversellA, idempotencyKey: 'race-product-aaa', redemptions: [], additionalDiscount: 0,
        payments: [{ method: 'VISA', amount: 190, referenceNumber: '' }], tips: [],
        products: [{ productId: product.body.data.id, quantity: 2 }],
      }),
      request(app).post('/api/v1/pos/checkout').set(auth(shop.ownerToken)).send({
        appointmentId: oversellB, idempotencyKey: 'race-product-bbb', redemptions: [], additionalDiscount: 0,
        payments: [{ method: 'VISA', amount: 190, referenceNumber: '' }], tips: [],
        products: [{ productId: product.body.data.id, quantity: 2 }],
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const loser = first.status === 409 ? first : second;
    assert.equal(loser.body.error.code, 'insufficient_stock');
    const finalStock = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(finalStock.body.data.stock.quantityOnHand, 0);
  });

  it('limits repeated purchase returns, keeps each branch minimum, and leaves cashier cash unchanged', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'return-min');
    const category = await request(app).post('/api/v1/product-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: '' }, status: 'ACTIVE' });
    const product = await request(app).post('/api/v1/products').set(auth(shop.ownerToken)).send(productBody(category.body.data.id, 'RET-1', { minimumStock: 5, sellingPrice: 20 }));
    const supplier = await request(app).post('/api/v1/suppliers').set(auth(shop.ownerToken)).send({
      name: 'Cairo Supply', phone: '', email: '', address: '', taxNumber: '', notes: '', status: 'ACTIVE',
    });
    const purchase = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 10, unitCost: 5 }],
    });
    assert.equal(purchase.status, 201, JSON.stringify(purchase.body));
    await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    const missingReason = await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/return`).set(auth(shop.ownerToken)).send({
      items: [{ productId: product.body.data.id, quantity: 1 }],
    });
    assert.equal(missingReason.status, 400);

    const first = await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/return`).set(auth(shop.ownerToken)).send({
      reason: 'Broken lid', items: [{ productId: product.body.data.id, quantity: 4 }],
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.items[0].returnedQuantity, 4);
    assert.equal(first.body.data.returns[0].reason, 'Broken lid');
    assert.equal(first.body.data.remainingAmount, 50);
    const second = await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/return`).set(auth(shop.ownerToken)).send({
      reason: 'Wrong scent', items: [{ productId: product.body.data.id, quantity: 4 }],
    });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.items[0].returnedQuantity, 8);
    const tooMany = await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/return`).set(auth(shop.ownerToken)).send({
      reason: 'Too many', items: [{ productId: product.body.data.id, quantity: 4 }],
    });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.error.code, 'return_limit');
    const stock = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(stock.body.data.stock.quantityOnHand, 2);
    const returnMovements = stock.body.data.movements.filter((row: { movementType: string }) => row.movementType === 'PURCHASE_RETURN');
    assert.equal(returnMovements.length, 2);
    assert.equal(returnMovements.reduce((total: number, row: { quantity: number }) => total + row.quantity, 0), 8);
    const supplierView = await request(app).get(`/api/v1/suppliers/${supplier.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(supplierView.body.data.outstanding, 50);

    const otherPurchase = await request(app).post('/api/v1/purchases').set(auth(shop.ownerToken)).send({
      branchId: shop.otherBranchId, supplierId: supplier.body.data.id, discount: 0, purchaseDate: new Date().toISOString(), notes: '',
      items: [{ productId: product.body.data.id, quantity: 4, unitCost: 5 }],
    });
    await request(app).post(`/api/v1/purchases/${otherPurchase.body.data.id}/receive`).set(auth(shop.ownerToken)).send({});
    const lowered = await request(app).put('/api/v1/inventory/minimum').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, productId: product.body.data.id, minimumStock: 1,
    });
    assert.equal(lowered.status, 200, JSON.stringify(lowered.body));
    assert.equal(lowered.body.data.minimumStock, 1);
    const cairo = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    const giza = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.otherBranchId}`).set(auth(shop.ownerToken));
    assert.equal(cairo.body.data.stock.minimumStock, 1);
    assert.equal(giza.body.data.stock.minimumStock, 5);
    const saved = await request(app).get(`/api/v1/products/${product.body.data.id}`).set(auth(shop.ownerToken));
    const changed = await request(app).put(`/api/v1/products/${product.body.data.id}`).set(auth(shop.ownerToken)).send({
      ...productBody(category.body.data.id, 'RET-1', { minimumStock: 20, sellingPrice: 20 }),
      barcode: saved.body.data.barcode,
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const cairoAfter = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    const gizaAfter = await request(app).get(`/api/v1/inventory/${product.body.data.id}?branchId=${shop.otherBranchId}`).set(auth(shop.ownerToken));
    assert.equal(cairoAfter.body.data.stock.minimumStock, 1);
    assert.equal(gizaAfter.body.data.stock.minimumStock, 5);
    const cairoAlerts = await request(app).get(`/api/v1/stock-alerts?branchId=${shop.branchId}&status=ACTIVE`).set(auth(shop.ownerToken));
    assert.equal(cairoAlerts.body.data.find((row: { productId: string }) => row.productId === product.body.data.id), undefined);
    const gizaAlerts = await request(app).get(`/api/v1/stock-alerts?branchId=${shop.otherBranchId}&status=ACTIVE`).set(auth(shop.ownerToken));
    assert.equal(gizaAlerts.body.data[0].kind, 'LOW');
    assert.equal(gizaAlerts.body.data[0].minimumStock, 5);

    const opened = await request(app).post('/api/v1/cashier-shifts').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId, shiftType: 'MORNING', openingBalance: 100,
    });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const paid = await request(app).post(`/api/v1/purchases/${purchase.body.data.id}/payments`).set(auth(shop.ownerToken)).send({
      method: 'CASH', amount: 10, referenceNumber: 'supplier-cash',
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    const current = await request(app).get(`/api/v1/cashier-shifts/current?branchId=${shop.branchId}`).set(auth(shop.ownerToken));
    assert.equal(current.body.data.expectedCash, 100);
    assert.equal(current.body.data.cashSales, 0);
  });
});
