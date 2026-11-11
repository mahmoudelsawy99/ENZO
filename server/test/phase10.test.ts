import assert from 'node:assert/strict';
import type { Express } from 'express';
import { after, before, describe, it } from 'node:test';
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
let SaleTransaction: typeof import('../src/modules/pos/sale.model.js').SaleTransaction;
let hashPassword: typeof import('../src/shared/password.js').hashPassword;

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

async function tokenFor(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password, rememberMe: true, tenantId: 'client-supplied' });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  db = (await import('mongoose')).default;
  app = (await import('../src/app.js')).createApp();
  User = (await import('../src/modules/users/user.model.js')).User;
  SaleTransaction = (await import('../src/modules/pos/sale.model.js')).SaleTransaction;
  hashPassword = (await import('../src/shared/password.js')).hashPassword;
  const billing = await import('../src/modules/billing/billing.model.js');
  const jobs = await import('../src/modules/jobs/job.model.js');
  await db.connect(replSet.getUri());
  await Promise.all([
    User.init(),
    (await import('../src/modules/tenants/tenant.model.js')).Tenant.init(),
    (await import('../src/modules/sessions/session.model.js')).Session.init(),
    (await import('../src/modules/branches/branch.model.js')).Branch.init(),
    billing.SubscriptionPlan.init(),
    billing.TenantSubscription.init(),
    billing.SubscriptionInvoice.init(),
    billing.SubscriptionPayment.init(),
    billing.SubscriptionNotice.init(),
    jobs.BackgroundJob.init(),
    SaleTransaction.init(),
  ]);
  await User.create({
    fullName: 'Platform Admin',
    email: 'admin@enzo.test',
    passwordHash: await hashPassword('ValidPass1'),
    phone: '01000000000',
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

describe('phase 10 subscriptions and readiness', () => {
  it('keeps billing separate from sales and enforces plan limits without deleting data', async () => {
    const live = await request(app).get('/api/health/live');
    assert.equal(live.status, 200);
    assert.match(String(live.headers['x-request-id']), /[\w-]{8,}/);
    const ready = await request(app).get('/api/health/ready');
    assert.equal(ready.status, 200);

    const admin = await tokenFor('admin@enzo.test', 'ValidPass1');
    const plans = await request(app).get('/api/v1/platform/billing/plans').set(auth(admin));
    assert.equal(plans.status, 200);
    const starter = plans.body.data.find((plan: { code: string }) => plan.code === 'STARTER');
    const enterprise = plans.body.data.find((plan: { code: string }) => plan.code === 'ENTERPRISE');
    assert.ok(starter);
    assert.equal(starter.monthlyPrice, 499);

    const shop = await request(app).post('/api/v1/platform/tenants').set(auth(admin)).send(tenantBody('limit'));
    assert.equal(shop.status, 201);
    const owner = await tokenFor('owner-limit@enzo.test', 'OwnerPass1');
    const deniedPlan = await request(app).get('/api/v1/platform/billing/plans').set(auth(owner));
    assert.equal(deniedPlan.status, 403);

    const first = await request(app).post('/api/v1/branches').set(auth(owner)).send({ name: 'Cairo', code: 'CAI', address: 'Street', phone: '01000000000', managerUserId: '', workingHours: hours() });
    const second = await request(app).post('/api/v1/branches').set(auth(owner)).send({ name: 'Giza', code: 'GIZ', address: 'Street', phone: '01000000000', managerUserId: '', workingHours: hours() });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const assigned = await request(app).post('/api/v1/platform/billing/subscriptions').set(auth(admin)).send({
      tenantId: shop.body.data.id,
      planId: starter.id,
      billingInterval: 'MONTHLY',
    });
    assert.equal(assigned.status, 201);
    assert.equal(assigned.body.data.status, 'TRIALING');
    const kept = await request(app).get('/api/v1/branches').set(auth(owner));
    assert.equal(kept.body.data.length, 2);
    const blocked = await request(app).post('/api/v1/branches').set(auth(owner)).send({ name: 'Alex', code: 'ALX', address: 'Street', phone: '01000000000', managerUserId: '', workingHours: hours() });
    assert.equal(blocked.status, 402);
    const payroll = await request(app).get('/api/v1/payroll').set(auth(owner));
    assert.equal(payroll.status, 403);
    const whatsapp = await request(app).get('/api/v1/whatsapp/config').set(auth(owner));
    assert.equal(whatsapp.status, 403);

    const custom = await request(app).patch(`/api/v1/platform/billing/subscriptions/${assigned.body.data.id}`).set(auth(admin)).send({
      enabledFeatures: ['inventory', 'whatsapp'],
      maximumBranches: 3,
    });
    assert.equal(custom.status, 200);
    const allowedBranch = await request(app).post('/api/v1/branches').set(auth(owner)).send({ name: 'Alex', code: 'ALX', address: 'Street', phone: '01000000000', managerUserId: '', workingHours: hours() });
    assert.equal(allowedBranch.status, 201);
    const whatsappAfter = await request(app).get('/api/v1/whatsapp/config').set(auth(owner));
    assert.equal(whatsappAfter.status, 200);

    const salesBefore = await SaleTransaction.countDocuments();
    const invoice = await request(app).post('/api/v1/platform/billing/invoices').set(auth(admin)).send({
      tenantId: shop.body.data.id,
      subscriptionId: assigned.body.data.id,
      amount: 499,
      taxAmount: 0,
      currency: 'EGP',
      dueDate: '2026-12-01',
    });
    assert.equal(invoice.status, 201);
    assert.equal(invoice.body.data.totalAmount, 499);
    const otherShop = await request(app).post('/api/v1/platform/tenants').set(auth(admin)).send(tenantBody('other'));
    const otherOwner = await tokenFor('owner-other@enzo.test', 'OwnerPass1');
    const hidden = await request(app).get(`/api/v1/billing/invoices/${invoice.body.data.id}/download?format=html`).set(auth(otherOwner));
    assert.equal(hidden.status, 404);
    const paid = await request(app).post(`/api/v1/platform/billing/invoices/${invoice.body.data.id}/payments`).set(auth(admin)).send({
      amount: 499,
      status: 'PAID',
      reference: 'manual-1',
      note: 'Bank transfer',
    });
    assert.equal(paid.status, 201);
    assert.equal(paid.body.data.invoice.amount, 499);
    assert.equal(paid.body.data.invoice.totalAmount, 499);
    assert.equal(paid.body.data.invoice.status, 'PAID');
    assert.equal(paid.body.data.gateway, 'MANUAL');
    assert.equal(await SaleTransaction.countDocuments(), salesBefore);

    const changed = await request(app).post('/api/v1/platform/billing/subscriptions').set(auth(admin)).send({
      tenantId: shop.body.data.id,
      planId: enterprise.id,
      billingInterval: 'YEARLY',
    });
    assert.equal(changed.status, 201);
    const dashboard = await request(app).get('/api/v1/platform/dashboard').set(auth(admin));
    assert.equal(dashboard.body.data.subscriptions.collectedThisMonth, 499);
    assert.ok(dashboard.body.data.subscriptions.mrr >= 0);

    const upload = await request(app).post('/api/v1/platform/uploads/logo').set(auth(admin)).attach('logo', Buffer.from('not-an-image'), { filename: 'logo.png', contentType: 'image/png' });
    assert.equal(upload.status, 400);

    const job = await request(app).post('/api/v1/platform/billing/jobs').set(auth(admin)).send({ type: 'subscription.reminders', idempotencyKey: 'reminders-phase10', tenantId: '' });
    const again = await request(app).post('/api/v1/platform/billing/jobs').set(auth(admin)).send({ type: 'subscription.reminders', idempotencyKey: 'reminders-phase10', tenantId: '' });
    assert.equal(job.status, 201);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.created, false);
  });
});
