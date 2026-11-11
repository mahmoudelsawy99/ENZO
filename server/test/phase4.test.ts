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
let consumeCustomerPackageItem: typeof import('../src/modules/packages/package.service.js').consumeCustomerPackageItem;

const adminEmail = 'admin@enzo.test';
const adminPassword = 'ValidPass1';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
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

async function createShop(adminToken: string, suffix: string) {
  const response = await request(app).post('/api/v1/platform/tenants').set(auth(adminToken)).send(tenantBody(suffix));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const ownerToken = await tokenFor(`owner-${suffix}@enzo.test`, 'OwnerPass1');
  return { ownerToken, tenantId: response.body.data.id as string };
}

function serviceBody(categoryId: string, name: string, price: number, commissionValue = 10) {
  return {
    name: { en: name, ar: `${name} عربي` },
    description: { en: `${name} description`, ar: '' },
    categoryId,
    image: '',
    price,
    commissionType: 'PERCENTAGE',
    commissionValue,
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  consumeCustomerPackageItem = (await import('../src/modules/packages/package.service.js')).consumeCustomerPackageItem;
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
    '../src/modules/customers/customer-note.model.js',
    '../src/modules/packages/package.model.js',
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

describe('services, customers, and packages', () => {
  it('isolates services, validates categories, and caps commission', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shopA = await createShop(admin, 'alpha');
    const shopB = await createShop(admin, 'beta');
    const category = await request(app).post('/api/v1/service-categories').set(auth(shopA.ownerToken)).send({ name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE' });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    const foreign = await request(app).post('/api/v1/services').set(auth(shopB.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 150));
    assert.equal(foreign.status, 400);

    const created = await request(app).post('/api/v1/services').set(auth(shopA.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 150, 20));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.price, 150);
    const duplicate = await request(app).post('/api/v1/services').set(auth(shopA.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 80));
    assert.equal(duplicate.status, 409);

    const hidden = await request(app).get(`/api/v1/services/${created.body.data.id}?tenantId=${shopB.tenantId}`).set(auth(shopB.ownerToken));
    assert.equal(hidden.status, 404);
    const own = await request(app).get(`/api/v1/services?tenantId=${shopB.tenantId}`).set(auth(shopA.ownerToken));
    assert.equal(own.body.data.length, 1);

    const limited = await request(app).put('/api/v1/services/settings').set(auth(shopA.ownerToken)).send({ maxCommissionPercent: 10 });
    assert.equal(limited.status, 200);
    const tooHigh = await request(app).put(`/api/v1/services/${created.body.data.id}`).set(auth(shopA.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 180, 25));
    assert.equal(tooHigh.status, 400);
    const updated = await request(app).put(`/api/v1/services/${created.body.data.id}`).set(auth(shopA.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 180, 10));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.price, 180);

    const paused = await request(app).patch(`/api/v1/services/${created.body.data.id}/status`).set(auth(shopA.ownerToken)).send({ status: 'INACTIVE' });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.status, 'INACTIVE');
    const filtered = await request(app).get('/api/v1/services?status=ACTIVE&categoryId=' + category.body.data.id).set(auth(shopA.ownerToken));
    assert.equal(filtered.body.data.length, 0);
  });

  it('normalizes customer phones and keeps history empty until visits exist', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'people');
    const other = await createShop(admin, 'other');
    const created = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
      fullName: 'Mona Adel',
      phone: '+20 10 1234 5678',
      email: 'mona@enzo.test',
      dateOfBirth: '1995-04-01',
      gender: 'FEMALE',
      address: 'Cairo',
      notes: 'Prefers morning visits',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const duplicate = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
      fullName: 'Another Mona',
      phone: '01012345678',
      email: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      notes: '',
    });
    assert.equal(duplicate.status, 409);
    const found = await request(app).get('/api/v1/customers?search=01012345678').set(auth(shop.ownerToken));
    assert.equal(found.body.data.length, 1);
    const crossed = await request(app).get(`/api/v1/customers/${created.body.data.id}`).set(auth(other.ownerToken));
    assert.equal(crossed.status, 404);

    const note = await request(app).post(`/api/v1/customers/${created.body.data.id}/notes`).set(auth(shop.ownerToken)).send({ content: 'Asked about a package.' });
    assert.equal(note.status, 201);
    const notes = await request(app).get(`/api/v1/customers/${created.body.data.id}/notes`).set(auth(shop.ownerToken));
    assert.equal(notes.body.data.length, 1);
    assert.equal(notes.body.data[0].content, 'Asked about a package.');

    const visits = await request(app).get(`/api/v1/customers/${created.body.data.id}/visits`).set(auth(shop.ownerToken));
    const services = await request(app).get(`/api/v1/customers/${created.body.data.id}/service-history`).set(auth(shop.ownerToken));
    const payments = await request(app).get(`/api/v1/customers/${created.body.data.id}/payments`).set(auth(shop.ownerToken));
    const stats = await request(app).get(`/api/v1/customers/${created.body.data.id}/stats`).set(auth(shop.ownerToken));
    assert.equal(visits.body.source, 'appointments');
    assert.equal(visits.body.meta.total, 0);
    assert.equal(services.body.data.length, 0);
    assert.equal(payments.body.data.length, 0);
    assert.equal(stats.body.data.totalVisits, 0);
    assert.equal(stats.body.data.totalSpending, 0);
    assert.equal(stats.body.data.lastVisit, null);
    assert.deepEqual(stats.body.data.mostUsedServices, []);
  });

  it('snapshots package prices, applies expiry, and protects remaining quantity', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'packs');
    const category = await request(app).post('/api/v1/service-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Care', ar: '' }, status: 'ACTIVE' });
    const haircut = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 200, 5));
    const beard = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Beard', 100, 5));
    assert.equal(haircut.status, 201);
    assert.equal(beard.status, 201);
    const template = await request(app).post('/api/v1/packages').set(auth(shop.ownerToken)).send({
      name: { en: 'VIP', ar: 'كبار الزوار' },
      description: { en: 'Five visits', ar: '' },
      image: '',
      items: [
        { serviceId: haircut.body.data.id, quantity: 2 },
        { serviceId: beard.body.data.id, quantity: 1 },
      ],
      price: 500,
      validityType: 'VALIDITY_DAYS',
      validityDays: 30,
      fixedExpiryDate: '',
    });
    assert.equal(template.status, 201, JSON.stringify(template.body));
    assert.equal(template.body.data.items[0].unitPrice, 200);
    assert.equal(template.body.data.items[0].serviceName.en, 'Haircut');

    const customer = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
      fullName: 'Youssef Nabil', phone: '01200000000', email: '', dateOfBirth: '', gender: '', address: '', notes: '',
    });
    const assigned = await request(app).post(`/api/v1/customers/${customer.body.data.id}/packages`).set(auth(shop.ownerToken)).send({ packageTemplateId: template.body.data.id });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    assert.equal(assigned.body.data.purchasePrice, 500);
    assert.equal(assigned.body.data.items[0].remainingQuantity, 2);
    assert.ok(assigned.body.data.expiresAt);

    await request(app).put(`/api/v1/services/${haircut.body.data.id}`).set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 350, 5));
    await request(app).put(`/api/v1/packages/${template.body.data.id}`).set(auth(shop.ownerToken)).send({
      name: { en: 'VIP', ar: 'كبار الزوار' },
      description: { en: 'Updated', ar: '' },
      image: '',
      items: [
        { serviceId: haircut.body.data.id, quantity: 2 },
        { serviceId: beard.body.data.id, quantity: 1 },
      ],
      price: 900,
      validityType: 'NO_EXPIRY',
      validityDays: null,
      fixedExpiryDate: '',
    });
    const preserved = await request(app).get(`/api/v1/customer-packages/${assigned.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(preserved.body.data.purchasePrice, 500);
    assert.equal(preserved.body.data.items[0].remainingQuantity, 2);
    assert.equal(preserved.body.data.name.en, 'VIP');

    const once = await consumeCustomerPackageItem(shop.tenantId, assigned.body.data.id, haircut.body.data.id, 1);
    assert.equal(once.items[0]?.remainingQuantity, 1);
    assert.equal(once.status, 'ACTIVE');
    const rest = await consumeCustomerPackageItem(shop.tenantId, assigned.body.data.id, haircut.body.data.id, 1);
    assert.equal(rest.items.find((item) => item.serviceId === haircut.body.data.id)?.remainingQuantity, 0);
    await assert.rejects(() => consumeCustomerPackageItem(shop.tenantId, assigned.body.data.id, haircut.body.data.id, 1), (error: { status?: number; code?: string }) => error.code === 'insufficient_quantity' || error.code === 'package_unavailable');

    const expiredTemplate = await request(app).post('/api/v1/packages').set(auth(shop.ownerToken)).send({
      name: { en: 'Old offer', ar: '' },
      description: { en: '', ar: '' },
      image: '',
      items: [{ serviceId: beard.body.data.id, quantity: 1 }],
      price: 50,
      validityType: 'FIXED_EXPIRY',
      validityDays: null,
      fixedExpiryDate: '2020-01-01',
    });
    assert.equal(expiredTemplate.status, 201);
    const blocked = await request(app).post(`/api/v1/customers/${customer.body.data.id}/packages`).set(auth(shop.ownerToken)).send({ packageTemplateId: expiredTemplate.body.data.id });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'package_expired');

    const stats = await request(app).get(`/api/v1/customers/${customer.body.data.id}/stats`).set(auth(shop.ownerToken));
    assert.equal(stats.body.data.totalSpending, 0);
    assert.ok(stats.body.data.activePackages >= 1);
  });

  it('enforces catalog permissions', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'guard');
    const branch = await request(app).post('/api/v1/branches').set(auth(shop.ownerToken)).send({
      name: 'Cairo', code: 'CAI', address: '', phone: '', managerUserId: '', workingHours: hours(),
    });
    assert.equal(branch.status, 201, JSON.stringify(branch.body));
    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Catalog Reader',
      description: '',
      permissions: ['services.view', 'customers.view'],
    });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Reader', email: 'reader@enzo.test', phone: '', password: 'ReaderPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [branch.body.data.id] }],
    });
    const reader = await tokenFor('reader@enzo.test', 'ReaderPass1');
    const category = await request(app).post('/api/v1/service-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Hair', ar: '' }, status: 'ACTIVE' });
    const denied = await request(app).post('/api/v1/services').set(auth(reader)).send(serviceBody(category.body.data.id, 'Haircut', 100));
    assert.equal(denied.status, 403);
    const created = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 100));
    const allowed = await request(app).get(`/api/v1/services/${created.body.data.id}`).set(auth(reader));
    assert.equal(allowed.status, 200);
    const noteDenied = await request(app).post('/api/v1/customers').set(auth(reader)).send({
      fullName: 'No Access', phone: '01500000000', email: '', dateOfBirth: '', gender: '', address: '', notes: '',
    });
    assert.equal(noteDenied.status, 403);
  });
});
