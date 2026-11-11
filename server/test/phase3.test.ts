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
let Tenant: typeof import('../src/modules/tenants/tenant.model.js').Tenant;
let Session: typeof import('../src/modules/sessions/session.model.js').Session;
let Employee: typeof import('../src/modules/employees/employee.model.js').Employee;
let quoteCommission: typeof import('../src/modules/commissions/commission.service.js').quoteCommission;

const adminEmail = 'admin@enzo.test';
const adminPassword = 'ValidPass1';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function hours() {
  const open = { isOpen: true, openingTime: '10:00', closingTime: '22:00' };
  const closed = { isOpen: false, openingTime: '10:00', closingTime: '22:00' };
  return {
    saturday: open,
    sunday: open,
    monday: open,
    tuesday: open,
    wednesday: open,
    thursday: open,
    friday: closed,
  };
}

function branchBody(code: string, name: string) {
  return { name, code, address: `${name} street`, phone: '01000000000', managerUserId: '', workingHours: hours() };
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
    owner: {
      fullName: `Owner ${suffix}`,
      email: `owner-${suffix}@enzo.test`,
      phone: '01111111111',
      password: 'OwnerPass1',
    },
  };
}

async function tokenFor(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password, rememberMe: true });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function createShop(adminToken: string, suffix: string) {
  const response = await request(app).post('/api/v1/platform/tenants').set(auth(adminToken)).send(tenantBody(suffix));
  assert.equal(response.status, 201);
  const ownerToken = await tokenFor(`owner-${suffix}@enzo.test`, 'OwnerPass1');
  return { ownerToken, tenantId: response.body.data.id as string };
}

async function createBranch(token: string, code: string, name: string) {
  const response = await request(app).post('/api/v1/branches').set(auth(token)).send(branchBody(code, name));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data as { id: string; status: string };
}

async function catalogs(token: string) {
  const [types, titles] = await Promise.all([
    request(app).get('/api/v1/employees/employment-types').set(auth(token)),
    request(app).get('/api/v1/employees/job-titles').set(auth(token)),
  ]);
  assert.equal(types.status, 200);
  assert.equal(titles.status, 200);
  return {
    employmentTypeId: types.body.data[0].id as string,
    jobTitleId: titles.body.data[0].id as string,
  };
}

function employeeBody(catalog: { employmentTypeId: string; jobTitleId: string }, name: string, branches: Array<{ branchId: string; isPrimary: boolean }> = []) {
  return {
    fullName: name,
    email: '',
    phone: '01200000000',
    nationalId: '29901011234567',
    address: 'Cairo',
    dateOfBirth: '1999-01-01',
    joiningDate: '2026-01-01',
    employmentTypeId: catalog.employmentTypeId,
    jobTitleId: catalog.jobTitleId,
    salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 500, tips: 200, deductions: 100 },
    notes: '',
    branches,
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  Tenant = (await import('../src/modules/tenants/tenant.model.js')).Tenant;
  Session = (await import('../src/modules/sessions/session.model.js')).Session;
  Employee = (await import('../src/modules/employees/employee.model.js')).Employee;
  quoteCommission = (await import('../src/modules/commissions/commission.service.js')).quoteCommission;
  const Role = (await import('../src/modules/roles/role.model.js')).Role;
  const UserRole = (await import('../src/modules/roles/user-role.model.js')).UserRole;
  const Branch = (await import('../src/modules/branches/branch.model.js')).Branch;
  const EmployeeBranch = (await import('../src/modules/employees/assignment.model.js')).EmployeeBranch;
  const EmploymentType = (await import('../src/modules/employees/catalog.model.js')).EmploymentType;
  const JobTitle = (await import('../src/modules/employees/catalog.model.js')).JobTitle;
  const CommissionRule = (await import('../src/modules/commissions/commission.model.js')).CommissionRule;
  const AuditLog = (await import('../src/modules/access/audit.model.js')).AuditLog;
  app = created.createApp();
  await db.connect(replSet.getUri());
  await Promise.all([
    User.init(),
    Tenant.init(),
    Session.init(),
    Role.init(),
    UserRole.init(),
    Branch.init(),
    Employee.init(),
    EmployeeBranch.init(),
    EmploymentType.init(),
    JobTitle.init(),
    CommissionRule.init(),
    AuditLog.init(),
  ]);
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

describe('branch, employee, and role access', () => {
  it('keeps the owner as a user without an employee and blocks other tenants', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shopA = await createShop(admin, 'alpha');
    const shopB = await createShop(admin, 'beta');
    const branch = await createBranch(shopA.ownerToken, 'CAI', 'Cairo');

    const users = await request(app).get('/api/v1/users').set(auth(shopA.ownerToken));
    assert.equal(users.status, 200);
    assert.equal(users.body.data.length, 1);
    assert.equal(users.body.data[0].isOwner, true);
    assert.equal(users.body.data[0].employee, null);
    assert.equal(await Employee.countDocuments({ userId: users.body.data[0].id }), 0);

    const crossed = await request(app).get(`/api/v1/branches/${branch.id}?tenantId=${shopB.tenantId}`).set(auth(shopB.ownerToken));
    assert.equal(crossed.status, 404);

    const ownList = await request(app).get(`/api/v1/branches?tenantId=${shopB.tenantId}`).set(auth(shopA.ownerToken));
    assert.equal(ownList.status, 200);
    assert.equal(ownList.body.data.length, 1);
    assert.equal(ownList.body.data[0].id, branch.id);
  });

  it('enforces branch scope and blocks a disabled branch without deleting history', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'scope');
    const cairo = await createBranch(shop.ownerToken, 'CAI', 'Cairo');
    const giza = await createBranch(shop.ownerToken, 'GIZ', 'Giza');
    const catalog = await catalogs(shop.ownerToken);
    const created = await request(app)
      .post('/api/v1/employees')
      .set(auth(shop.ownerToken))
      .send(employeeBody(catalog, 'Mona Adel', [{ branchId: cairo.id, isPrimary: true }]));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.nationalIdMasked.endsWith('4567'), true);
    assert.equal(created.body.data.nationalId, undefined);

    const roles = await request(app).get('/api/v1/roles?pageSize=50').set(auth(shop.ownerToken));
    const manager = roles.body.data.find((role: { name: string }) => role.name === 'Branch Manager');
    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Branch Lead',
      email: 'lead@enzo.test',
      phone: '01012345678',
      password: 'LeadPass1',
    });
    assert.equal(account.status, 201);
    assert.equal(account.body.data.employee, null);
    const assigned = await request(app)
      .post(`/api/v1/users/${account.body.data.id}/roles`)
      .set(auth(shop.ownerToken))
      .send({ assignments: [{ roleId: manager.id, branchScope: 'SELECTED', branchIds: [cairo.id] }] });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));

    const lead = await tokenFor('lead@enzo.test', 'LeadPass1');
    const allowed = await request(app).get(`/api/v1/branches/${cairo.id}`).set(auth(lead));
    const denied = await request(app).get(`/api/v1/branches/${giza.id}`).set(auth(lead));
    const listed = await request(app).get('/api/v1/branches').set(auth(lead));
    assert.equal(allowed.status, 200);
    assert.equal(denied.status, 403);
    assert.deepEqual(listed.body.data.map((item: { id: string }) => item.id), [cairo.id]);

    const hiddenEmployee = await request(app)
      .post('/api/v1/employees')
      .set(auth(shop.ownerToken))
      .send(employeeBody(catalog, 'Giza Only', [{ branchId: giza.id, isPrimary: true }]));
    assert.equal(hiddenEmployee.status, 201);
    const employeeDenied = await request(app).get(`/api/v1/employees/${hiddenEmployee.body.data.id}`).set(auth(lead));
    assert.equal(employeeDenied.status, 403);

    const disabled = await request(app).patch(`/api/v1/branches/${cairo.id}/status`).set(auth(shop.ownerToken)).send({ status: 'DISABLED' });
    assert.equal(disabled.status, 200);
    const stillThere = await request(app).get(`/api/v1/employees/${created.body.data.id}`).set(auth(shop.ownerToken));
    assert.equal(stillThere.status, 200);
    assert.equal(stillThere.body.data.branches.some((item: { status: string }) => item.status === 'ACTIVE'), true);
    const blocked = await request(app)
      .post(`/api/v1/employees/${created.body.data.id}/branches`)
      .set(auth(shop.ownerToken))
      .send({ branchId: cairo.id, isPrimary: false });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'branch_disabled');
  });

  it('assigns an employee to several branches and keeps removed assignments', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'people');
    const cairo = await createBranch(shop.ownerToken, 'CAI', 'Cairo');
    const giza = await createBranch(shop.ownerToken, 'GIZ', 'Giza');
    const catalog = await catalogs(shop.ownerToken);
    const created = await request(app).post('/api/v1/employees').set(auth(shop.ownerToken)).send(employeeBody(catalog, 'Youssef Nabil'));
    assert.equal(created.status, 201);
    const employeeId = created.body.data.id as string;

    const first = await request(app).post(`/api/v1/employees/${employeeId}/branches`).set(auth(shop.ownerToken)).send({ branchId: cairo.id, isPrimary: true });
    const second = await request(app).post(`/api/v1/employees/${employeeId}/branches`).set(auth(shop.ownerToken)).send({ branchId: giza.id, isPrimary: false });
    const duplicate = await request(app).post(`/api/v1/employees/${employeeId}/branches`).set(auth(shop.ownerToken)).send({ branchId: cairo.id, isPrimary: false });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(duplicate.status, 409);
    const active = second.body.data.branches.filter((item: { status: string }) => item.status === 'ACTIVE');
    assert.equal(active.length, 2);
    assert.equal(active.filter((item: { isPrimary: boolean }) => item.isPrimary).length, 1);

    const removed = await request(app).delete(`/api/v1/employees/${employeeId}/branches/${giza.id}`).set(auth(shop.ownerToken));
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.branches.some((item: { branchId: string; status: string }) => item.branchId === giza.id && item.status === 'REMOVED'), true);
    const again = await request(app).post(`/api/v1/employees/${employeeId}/branches`).set(auth(shop.ownerToken)).send({ branchId: giza.id, isPrimary: false });
    assert.equal(again.status, 201);

    const ended = await request(app).patch(`/api/v1/employees/${employeeId}/status`).set(auth(shop.ownerToken)).send({ status: 'TERMINATED' });
    assert.equal(ended.status, 200);
    const blocked = await request(app)
      .post(`/api/v1/employees/${employeeId}/branches`)
      .set(auth(shop.ownerToken))
      .send({ branchId: cairo.id, isPrimary: false });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'employee_inactive');
    const history = await request(app).get(`/api/v1/employees/${employeeId}`).set(auth(shop.ownerToken));
    assert.equal(history.status, 200);
    assert.equal(history.body.data.status, 'TERMINATED');
  });

  it('creates and changes roles without letting a user grant more than they have', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'roles');
    const branch = await createBranch(shop.ownerToken, 'CAI', 'Cairo');
    const created = await request(app).post('/api/v1/roles').set(auth(shop.ownerToken)).send({
      name: 'Floor Lead',
      description: 'A custom role',
      permissions: ['branches.view', 'roles.view', 'roles.create'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const updated = await request(app).put(`/api/v1/roles/${created.body.data.id}`).set(auth(shop.ownerToken)).send({
      name: 'Floor Supervisor',
      description: 'Renamed',
      permissions: ['branches.view', 'roles.view', 'roles.create', 'roles.update'],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Floor Supervisor');

    const account = await request(app).post('/api/v1/users').set(auth(shop.ownerToken)).send({
      fullName: 'Role Editor',
      email: 'editor@enzo.test',
      phone: '',
      password: 'EditorPass1',
    });
    assert.equal(account.status, 201);
    await request(app)
      .post(`/api/v1/users/${account.body.data.id}/roles`)
      .set(auth(shop.ownerToken))
      .send({ assignments: [{ roleId: updated.body.data.id, branchScope: 'SELECTED', branchIds: [branch.id] }] });
    const editor = await tokenFor('editor@enzo.test', 'EditorPass1');
    const escalated = await request(app).post('/api/v1/roles').set(auth(editor)).send({
      name: 'Too Much',
      description: '',
      permissions: ['roles.view', 'payments.refund'],
    });
    assert.equal(escalated.status, 403);
    assert.equal(escalated.body.error.code, 'permission_escalation');
    const deniedBranch = await request(app).post('/api/v1/branches').set(auth(editor)).send(branchBody('ALX', 'Alexandria'));
    assert.equal(deniedBranch.status, 403);

    const disabled = await request(app).patch(`/api/v1/roles/${updated.body.data.id}/status`).set(auth(shop.ownerToken)).send({ status: 'INACTIVE' });
    assert.equal(disabled.status, 200);
    const afterDisable = await request(app).get('/api/v1/branches').set(auth(editor));
    assert.equal(afterDisable.status, 403);
  });

  it('resolves commission by employee, then service, then tenant default', async () => {
    const admin = await tokenFor(adminEmail, adminPassword);
    const shop = await createShop(admin, 'pay');
    const catalog = await catalogs(shop.ownerToken);
    const created = await request(app).post('/api/v1/employees').set(auth(shop.ownerToken)).send(employeeBody(catalog, 'Karim Fathy'));
    assert.equal(created.status, 201);
    const employeeId = created.body.data.id as string;
    const tenantRule = await request(app).put('/api/v1/commissions/default').set(auth(shop.ownerToken)).send({ kind: 'PERCENTAGE', value: 10 });
    const serviceRule = await request(app)
      .put('/api/v1/commissions/services')
      .set(auth(shop.ownerToken))
      .send({ serviceCode: 'haircut', serviceName: 'Haircut', kind: 'PERCENTAGE', value: 20 });
    const override = await request(app)
      .put(`/api/v1/employees/${employeeId}/commissions`)
      .set(auth(shop.ownerToken))
      .send({ serviceCode: 'haircut', kind: 'FIXED', value: 35 });
    assert.equal(tenantRule.status, 200);
    assert.equal(serviceRule.status, 200);
    assert.equal(override.status, 200);

    const employeeQuote = await quoteCommission(shop.tenantId, employeeId, 'haircut');
    const serviceQuote = await quoteCommission(shop.tenantId, null, 'haircut');
    const fallbackQuote = await quoteCommission(shop.tenantId, employeeId, 'beard');
    assert.equal(employeeQuote.source, 'EMPLOYEE_SERVICE');
    assert.equal(employeeQuote.kind, 'FIXED');
    assert.equal(employeeQuote.value, 35);
    assert.equal(serviceQuote.source, 'SERVICE');
    assert.equal(serviceQuote.value, 20);
    assert.equal(fallbackQuote.source, 'TENANT');
    assert.equal(fallbackQuote.value, 10);

    await request(app).put('/api/v1/commissions/default').set(auth(shop.ownerToken)).send({ kind: 'PERCENTAGE', value: 5 });
    assert.equal(fallbackQuote.value, 10);
    const later = await quoteCommission(shop.tenantId, null, 'color');
    assert.equal(later.value, 5);
  });
});
