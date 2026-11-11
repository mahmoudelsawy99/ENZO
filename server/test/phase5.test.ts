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
let onAppointmentEvent: typeof import('../src/modules/appointments/appointment.events.js').onAppointmentEvent;

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

function cairoDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${year}-${month}-${day}`;
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
  assert.equal(other.status, 201, JSON.stringify(other.body));
  const [types, titles] = await Promise.all([
    request(app).get('/api/v1/employees/employment-types').set(auth(shop.ownerToken)),
    request(app).get('/api/v1/employees/job-titles').set(auth(shop.ownerToken)),
  ]);
  const catalog = { employmentTypeId: types.body.data[0].id as string, jobTitleId: titles.body.data[0].id as string };
  const barber = await request(app).post('/api/v1/employees').set(auth(shop.ownerToken)).send({
    fullName: 'Omar Adel',
    email: '',
    phone: '01200000001',
    nationalId: '29901011234567',
    address: 'Cairo',
    dateOfBirth: '1999-01-01',
    joiningDate: '2026-01-01',
    employmentTypeId: catalog.employmentTypeId,
    jobTitleId: catalog.jobTitleId,
    salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 0, tips: 0, deductions: 0 },
    notes: '',
    branches: [{ branchId: branch.body.data.id, isPrimary: true }],
  });
  assert.equal(barber.status, 201, JSON.stringify(barber.body));
  const category = await request(app).post('/api/v1/service-categories').set(auth(shop.ownerToken)).send({ name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE' });
  const haircut = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Haircut', 150));
  const beard = await request(app).post('/api/v1/services').set(auth(shop.ownerToken)).send(serviceBody(category.body.data.id, 'Beard', 80));
  assert.equal(haircut.status, 201);
  assert.equal(beard.status, 201);
  const customer = await request(app).post('/api/v1/customers').set(auth(shop.ownerToken)).send({
    fullName: 'Mona Adel',
    phone: '01012345678',
    email: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    notes: '',
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
    notes: 'Window seat',
    ...extra,
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  onAppointmentEvent = (await import('../src/modules/appointments/appointment.events.js')).onAppointmentEvent;
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
    '../src/modules/appointments/appointment.model.js',
    '../src/modules/appointments/queue.model.js',
    '../src/modules/appointments/status-history.model.js',
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

describe('appointments and queue', () => {
  it('snapshots service prices and rejects cross-tenant and cross-branch access', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'alpha');
    const other = await createShop(admin, 'beta');
    const events: string[] = [];
    const stop = onAppointmentEvent((event) => events.push(event.name));
    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.appointmentNumber, 'APT-0001');
    assert.equal(created.body.data.status, 'PENDING');
    assert.equal(created.body.data.subtotal, 380);
    assert.equal(created.body.data.total, 370);
    assert.equal(created.body.data.services[0].unitPrice, 150);
    assert.equal(created.body.data.services[0].lineTotal, 300);
    assert.equal(created.body.data.services[1].commissionValue, 15);
    assert.ok(events.includes('appointment.created'));
    stop();

    const repriced = await request(app).put(`/api/v1/services/${shop.haircutId}`).set(auth(shop.ownerToken)).send(serviceBody(shop.categoryId, 'Haircut', 220));
    assert.equal(repriced.status, 200);
    const unchanged = await request(app).get(`/api/v1/appointments/${created.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(unchanged.body.data.services[0].unitPrice, 150);
    assert.equal(unchanged.body.data.total, 370);

    const hidden = await request(app).get(`/api/v1/appointments/${created.body.data.id}`).set(auth(other.ownerToken));
    assert.equal(hidden.status, 404);
    const unassigned = await request(app).post('/api/v1/employees').set(auth(shop.ownerToken)).send({
      fullName: 'No Branch',
      email: 'loose@enzo.test',
      phone: '01200000009',
      nationalId: '',
      address: '',
      dateOfBirth: '',
      joiningDate: '2026-01-01',
      employmentTypeId: (await request(app).get('/api/v1/employees/employment-types').set(auth(shop.ownerToken))).body.data[0].id,
      jobTitleId: (await request(app).get('/api/v1/employees/job-titles').set(auth(shop.ownerToken))).body.data[0].id,
      salary: { period: 'MONTHLY', basicSalary: 0, allowances: 0, tips: 0, deductions: 0 },
      notes: '',
      branches: [],
    });
    assert.equal(unassigned.status, 201, JSON.stringify(unassigned.body));
    const wrongBarber = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, { barberEmployeeId: unassigned.body.data.id }));
    assert.equal(wrongBarber.status, 409);
    assert.equal(wrongBarber.body.error.code, 'barber_not_assigned');

    const role = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Cairo Desk',
      description: '',
      permissions: ['appointments.view', 'appointments.create', 'services.view', 'customers.view'],
    });
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Desk',
      email: 'desk@enzo.test',
      phone: '',
      password: 'DeskPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: role.body.data.id, branchScope: 'SELECTED', branchIds: [shop.branchId] }],
    });
    const desk = await tokenFor('desk@enzo.test', 'DeskPass1');
    const outside = await request(app).post('/api/v1/appointments').set(auth(desk)).send(booking(shop, { branchId: shop.otherBranchId }));
    assert.equal(outside.status, 403);
    const allowed = await request(app).get(`/api/v1/appointments/${created.body.data.id}`).set(auth(desk));
    assert.equal(allowed.status, 200);
  });

  it('moves appointments through the queue and keeps history', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'flow');
    const created = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop, { discount: 0 }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    const tooSoon = await request(app).post(`/api/v1/appointments/${id}/complete`).set(auth(shop.ownerToken)).send({});
    assert.equal(tooSoon.status, 409);
    assert.equal(tooSoon.body.error.code, 'invalid_transition');

    const confirmed = await request(app).post(`/api/v1/appointments/${id}/confirm`).set(auth(shop.ownerToken)).send({});
    const checked = await request(app).post(`/api/v1/appointments/${id}/check-in`).set(auth(shop.ownerToken)).send({});
    const queued = await request(app).post(`/api/v1/appointments/${id}/queue`).set(auth(shop.ownerToken)).send({});
    assert.equal(confirmed.status, 200);
    assert.equal(checked.body.data.status, 'CHECKED_IN');
    assert.ok(checked.body.data.checkedInAt);
    assert.equal(queued.body.data.status, 'WAITING');
    const duplicate = await request(app).post(`/api/v1/appointments/${id}/queue`).set(auth(shop.ownerToken)).send({});
    assert.equal(duplicate.status, 409);

    const beforeStart = Date.now();
    const [firstStart, secondStart] = await Promise.all([
      request(app).post(`/api/v1/appointments/${id}/start`).set(auth(shop.ownerToken)).send({}),
      request(app).post(`/api/v1/appointments/${id}/start`).set(auth(shop.ownerToken)).send({}),
    ]);
    const startStatuses = [firstStart.status, secondStart.status].sort();
    assert.deepEqual(startStatuses, [200, 409]);
    const started = firstStart.status === 200 ? firstStart : secondStart;
    assert.equal(started.body.data.status, 'IN_SERVICE');
    assert.ok(Date.parse(started.body.data.startedAt) >= beforeStart - 2000);

    const queue = await request(app).get(`/api/v1/queue?branchId=${shop.branchId}&queueDate=${cairoDate()}`).set(auth(shop.ownerToken));
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    const active = queue.body.data.find((entry: { appointmentId: string }) => entry.appointmentId === id);
    assert.equal(active.status, 'IN_SERVICE');
    const finished = await request(app).post(`/api/v1/queue/${active.id}/complete`).set(auth(shop.ownerToken)).send({});
    assert.equal(finished.status, 200, JSON.stringify(finished.body));
    assert.equal(finished.body.data.status, 'COMPLETED');
    assert.ok(finished.body.data.completedAt);
    const again = await request(app).post(`/api/v1/appointments/${id}/complete`).set(auth(shop.ownerToken)).send({});
    assert.equal(again.status, 409);

    const history = await request(app).get(`/api/v1/appointments/${id}/history`).set(auth(shop.ownerToken));
    const statuses = history.body.data.map((row: { newStatus: string }) => row.newStatus);
    assert.deepEqual(statuses, ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_SERVICE', 'COMPLETED']);

    const cancelled = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop));
    const cancel = await request(app).post(`/api/v1/appointments/${cancelled.body.data.id}/cancel`).set(auth(shop.ownerToken)).send({ reason: 'Customer asked to stop.' });
    assert.equal(cancel.body.data.status, 'CANCELLED');
    assert.equal(cancel.body.data.cancellationReason, 'Customer asked to stop.');

    const missed = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop));
    await request(app).post(`/api/v1/appointments/${missed.body.data.id}/confirm`).set(auth(shop.ownerToken)).send({});
    const noShow = await request(app).post(`/api/v1/appointments/${missed.body.data.id}/no-show`).set(auth(shop.ownerToken)).send({ reason: 'Did not arrive.' });
    assert.equal(noShow.body.data.status, 'NO_SHOW');

    const moved = await request(app).post('/api/v1/appointments').set(auth(shop.ownerToken)).send(booking(shop));
    const nextTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const rescheduled = await request(app).post(`/api/v1/appointments/${moved.body.data.id}/reschedule`).set(auth(shop.ownerToken)).send({ scheduledAt: nextTime, reason: 'Later today' });
    assert.equal(rescheduled.status, 200, JSON.stringify(rescheduled.body));
    assert.equal(rescheduled.body.data.status, 'PENDING');
    assert.equal(Date.parse(rescheduled.body.data.scheduledAt), Date.parse(nextTime));
    const movedHistory = await request(app).get(`/api/v1/appointments/${moved.body.data.id}/history`).set(auth(shop.ownerToken));
    assert.match(movedHistory.body.data.at(-1).reason, /Rescheduled/);

    const stats = await request(app).get(`/api/v1/customers/${shop.customerId}/stats`).set(auth(shop.ownerToken));
    assert.equal(stats.body.data.totalVisits, 1);
    assert.equal(stats.body.data.totalSpending, 0);
    assert.equal(stats.body.data.mostUsedServices[0].count, 2);
  });

  it('adds walk-ins in FIFO order and protects concurrent reordering', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await setupShop(admin, 'walk');
    const first = await request(app).post('/api/v1/appointments/walk-in').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      customerId: shop.customerId,
      barberEmployeeId: shop.barberId,
      services: [{ serviceId: shop.haircutId, quantity: 1 }],
      notes: '',
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.type, 'WALK_IN');
    assert.equal(first.body.data.status, 'WAITING');
    const second = await request(app).post('/api/v1/appointments/walk-in').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      customer: { fullName: 'Mona Adel', phone: '01012345678', email: '', dateOfBirth: '', gender: '', address: '', notes: '' },
      barberEmployeeId: shop.barberId,
      services: [{ serviceId: shop.beardId, quantity: 1 }],
      notes: '',
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.data.customerId, shop.customerId);

    const queue = await request(app).get(`/api/v1/queue?branchId=${shop.branchId}&queueDate=${cairoDate()}&status=WAITING`).set(auth(shop.ownerToken));
    assert.equal(queue.body.data.length, 2);
    assert.ok(queue.body.data[0].position < queue.body.data[1].position);
    assert.equal(queue.body.data[0].appointmentId, first.body.data.id);

    const reversed = await request(app).post('/api/v1/queue/reorder').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      queueDate: cairoDate(),
      entryIds: [queue.body.data[1].id, queue.body.data[0].id],
    });
    assert.equal(reversed.status, 200, JSON.stringify(reversed.body));
    const waiting = reversed.body.data.filter((entry: { status: string }) => entry.status === 'WAITING');
    assert.equal(waiting[0].appointmentId, second.body.data.id);
    assert.equal(waiting[0].position, 1);
    assert.equal(waiting[1].position, 2);

    const stale = await request(app).post('/api/v1/queue/reorder').set(auth(shop.ownerToken)).send({
      branchId: shop.branchId,
      queueDate: cairoDate(),
      entryIds: [queue.body.data[0].id],
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'queue_changed');

    const readerRole = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Viewer',
      description: '',
      permissions: ['appointments.view', 'queue.view'],
    });
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Viewer',
      email: 'viewer@enzo.test',
      phone: '',
      password: 'ViewerPass1',
    });
    await request(app).post(`/api/v1/users/${account.body.data.id}/roles`).set(auth(shop.ownerToken)).send({
      assignments: [{ roleId: readerRole.body.data.id, branchScope: 'SELECTED', branchIds: [shop.branchId] }],
    });
    const viewer = await tokenFor('viewer@enzo.test', 'ViewerPass1');
    const denied = await request(app).post('/api/v1/appointments').set(auth(viewer)).send(booking(shop));
    assert.equal(denied.status, 403);
    const reorderDenied = await request(app).post('/api/v1/queue/reorder').set(auth(viewer)).send({
      branchId: shop.branchId,
      queueDate: cairoDate(),
      entryIds: waiting.map((entry: { id: string }) => entry.id),
    });
    assert.equal(reorderDenied.status, 403);
    const visible = await request(app).get(`/api/v1/queue?branchId=${shop.branchId}&queueDate=${cairoDate()}`).set(auth(viewer));
    assert.equal(visible.status, 200);
  });
});
