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
let PasswordReset: typeof import('../src/modules/auth/password-reset.model.js').PasswordReset;
let hashPassword: typeof import('../src/shared/password.js').hashPassword;
let takeResetTokenForDelivery: typeof import('../src/modules/auth/auth.service.js').takeResetTokenForDelivery;
const adminEmail = 'admin@enzo.test';
const adminPassword = 'ValidPass1';

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((entry) => entry.length > 0)
    .join('; ');
}

function tenantBody(suffix: string, ownerEmail = `owner-${suffix}@enzo.test`) {
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
      email: ownerEmail,
      phone: '01111111111',
      password: 'OwnerPass1',
    },
  };
}

async function login(email: string, password: string, rememberMe = true) {
  return request(app).post('/api/v1/auth/login').send({ email, password, rememberMe, userType: 'SUPER_ADMIN', tenantId: 'client-supplied' });
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  const created = await import('../src/app.js');
  User = (await import('../src/modules/users/user.model.js')).User;
  Tenant = (await import('../src/modules/tenants/tenant.model.js')).Tenant;
  Session = (await import('../src/modules/sessions/session.model.js')).Session;
  PasswordReset = (await import('../src/modules/auth/password-reset.model.js')).PasswordReset;
  hashPassword = (await import('../src/shared/password.js')).hashPassword;
  takeResetTokenForDelivery = (await import('../src/modules/auth/auth.service.js')).takeResetTokenForDelivery;
  app = created.createApp();
  await db.connect(replSet.getUri());
  await Promise.all([User.init(), Tenant.init(), Session.init(), PasswordReset.init()]);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Tenant.deleteMany({}), Session.deleteMany({}), PasswordReset.deleteMany({})]);
  await User.create({
    fullName: 'Platform Admin',
    email: adminEmail,
    passwordHash: await hashPassword(adminPassword),
    phone: '',
    userType: 'SUPER_ADMIN',
    tenantId: null,
    status: 'ACTIVE',
    isEmailVerified: true,
  });
});

after(async () => {
  await db.disconnect();
  await replSet.stop();
});

describe('authentication', () => {
  it('signs in with a hashed password and an HttpOnly refresh cookie', async () => {
    const response = await login(adminEmail, adminPassword);
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.data.accessToken, 'string');
    assert.equal(response.body.data.user.userType, 'SUPER_ADMIN');
    assert.equal(response.body.data.user.tenantId, null);
    assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(response.body).includes(adminPassword), false);
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    assert.match(cookie, /enzo_refresh=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  it('rejects invalid credentials', async () => {
    const response = await login(adminEmail, 'WrongPass1');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'invalid_credentials');
  });

  it('rejects a disabled user after the password matches', async () => {
    await User.updateOne({ email: adminEmail }, { status: 'INACTIVE' });
    const response = await login(adminEmail, adminPassword);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'account_unavailable');
  });

  it('rejects a user whose tenant is suspended', async () => {
    const admin = await login(adminEmail, adminPassword);
    const created = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${admin.body.data.accessToken}`)
      .send(tenantBody('suspended'));
    assert.equal(created.status, 201);
    await request(app)
      .patch(`/api/v1/platform/tenants/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${admin.body.data.accessToken}`)
      .send({ status: 'SUSPENDED' });
    const ownerLogin = await login('owner-suspended@enzo.test', 'OwnerPass1');
    assert.equal(ownerLogin.status, 403);
    assert.equal(ownerLogin.body.error.code, 'tenant_unavailable');
  });

  it('rotates refresh tokens and revokes the family when a used token is replayed', async () => {
    const first = await login(adminEmail, adminPassword);
    const firstCookie = cookieHeader(first);
    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie);
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.body.data.accessToken, first.body.data.accessToken);
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie);
    assert.equal(replay.status, 401);
    const revokedNext = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader(rotated));
    assert.equal(revokedNext.status, 401);
  });

  it('revokes the current session and every session', async () => {
    const current = await login(adminEmail, adminPassword, true);
    const loggedOut = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${current.body.data.accessToken}`)
      .set('Cookie', cookieHeader(current));
    assert.equal(loggedOut.status, 204);
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader(current));
    assert.equal(refreshed.status, 401);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${current.body.data.accessToken}`);
    assert.equal(me.status, 401);

    const first = await login(adminEmail, adminPassword, false);
    const second = await login(adminEmail, adminPassword, true);
    const ended = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${second.body.data.accessToken}`)
      .set('Cookie', cookieHeader(second));
    assert.equal(ended.status, 204);
    const firstAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader(first));
    const secondAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieHeader(second));
    assert.equal(firstAfter.status, 401);
    assert.equal(secondAfter.status, 401);
  });

  it('stores only a hash for password reset and does not return the token', async () => {
    const response = await request(app).post('/api/v1/auth/forgot-password').send({ email: adminEmail });
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(response.body).includes('token'), false);
    const user = await User.findOne({ email: adminEmail });
    assert.ok(user);
    const token = takeResetTokenForDelivery(user.id);
    assert.ok(token);
    const stored = await PasswordReset.findOne({ userId: user._id });
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, token);
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'ChangedPass1' });
    assert.equal(reset.status, 200);
    const oldLogin = await login(adminEmail, adminPassword);
    assert.equal(oldLogin.status, 401);
    const newLogin = await login(adminEmail, 'ChangedPass1');
    assert.equal(newLogin.status, 200);
  });
});

describe('platform tenants', () => {
  it('allows only a super admin to read platform data', async () => {
    const admin = await login(adminEmail, adminPassword);
    const dashboard = await request(app).get('/api/v1/platform/dashboard').set('Authorization', `Bearer ${admin.body.data.accessToken}`);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.totals.tenants, 0);
    assert.equal(dashboard.body.data.totals.users, 1);

    const created = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${admin.body.data.accessToken}`)
      .send(tenantBody('authz'));
    const owner = await login('owner-authz@enzo.test', 'OwnerPass1');
    assert.equal(owner.status, 200);
    assert.equal(owner.body.data.user.userType, 'TENANT_USER');
    const forbidden = await request(app).get('/api/v1/platform/tenants').set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal(created.body.data.owner.email, 'owner-authz@enzo.test');
  });

  it('creates a tenant and its owner once, and rejects duplicate email or slug', async () => {
    const admin = await login(adminEmail, adminPassword);
    const token = admin.body.data.accessToken as string;
    const created = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'tenant-create-key')
      .send(tenantBody('once'));
    assert.equal(created.status, 201);
    assert.equal(JSON.stringify(created.body).includes('OwnerPass1'), false);
    const replay = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'tenant-create-key')
      .send(tenantBody('once'));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.id, created.body.data.id);
    assert.equal(await Tenant.countDocuments({ slug: 'shop-once' }), 1);
    assert.equal(await User.countDocuments({ email: 'owner-once@enzo.test' }), 1);

    const duplicateEmail = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(tenantBody('other', 'owner-once@enzo.test'));
    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.body.error.code, 'email_taken');

    const duplicateSlug = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...tenantBody('slug'), slug: 'shop-once', owner: { ...tenantBody('slug').owner, email: 'fresh@enzo.test' } });
    assert.equal(duplicateSlug.status, 409);
    assert.equal(duplicateSlug.body.error.code, 'slug_taken');
  });

  it('keeps tenant data isolated and changes status without deleting the record', async () => {
    const admin = await login(adminEmail, adminPassword);
    const token = admin.body.data.accessToken as string;
    const first = await request(app).post('/api/v1/platform/tenants').set('Authorization', `Bearer ${token}`).send(tenantBody('a'));
    const second = await request(app).post('/api/v1/platform/tenants').set('Authorization', `Bearer ${token}`).send(tenantBody('b'));
    const owner = await login('owner-a@enzo.test', 'OwnerPass1');
    const mine = await request(app)
      .get('/api/v1/tenant/me')
      .query({ tenantId: second.body.data.id })
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.id, first.body.data.id);
    assert.notEqual(mine.body.data.id, second.body.data.id);

    const suspended = await request(app)
      .patch(`/api/v1/platform/tenants/${first.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SUSPENDED' });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.body.data.status, 'SUSPENDED');
    assert.ok(await Tenant.findById(first.body.data.id));
    const blocked = await request(app).get('/api/v1/tenant/me').set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'tenant_unavailable');
  });
});
