import dotenv from 'dotenv';
import request from 'supertest';
import { assertIsolatedDatabase } from '../src/shared/database-guard.js';

dotenv.config();
const uri = assertIsolatedDatabase(process.env['UAT_MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/enzo_uat', 'UAT seed');
process.env['MONGODB_URI'] = uri;
process.env['NODE_ENV'] = 'development';

const staffPassword = 'UatPass1';
const ownerPassword = 'OwnerPass1';

function hours() {
  const open = { isOpen: true, openingTime: '10:00', closingTime: '22:00' };
  const closed = { isOpen: false, openingTime: '10:00', closingTime: '22:00' };
  return { saturday: open, sunday: open, monday: open, tuesday: open, wednesday: open, thursday: open, friday: closed };
}

async function main() {
  const mongoose = (await import('mongoose')).default;
  const { createApp } = await import('../src/app.js');
  const { env } = await import('../src/config/env.js');
  const { hashPassword } = await import('../src/shared/password.js');
  const { User } = await import('../src/modules/users/user.model.js');
  const { Tenant } = await import('../src/modules/tenants/tenant.model.js');
  await mongoose.connect(uri);
  if (!mongoose.connection.db?.databaseName.startsWith('enzo_uat')) {
    throw new Error('Refusing to seed because the connected database is not an enzo_uat database.');
  }
  const existing = await Tenant.findOne({ slug: 'uat-barbers' });
  if (existing) {
    console.info('[enzo] UAT tenant uat-barbers already exists. Nothing was changed.');
    await mongoose.disconnect();
    return;
  }

  const adminEmail = env.superAdminEmail ?? 'uat-admin@enzo.test';
  const adminPassword = env.superAdminPassword ?? staffPassword;
  if (!await User.exists({ email: adminEmail })) {
    await User.create({
      fullName: env.superAdminName,
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      phone: '',
      userType: 'SUPER_ADMIN',
      tenantId: null,
      status: 'ACTIVE',
      isEmailVerified: true,
    });
  }

  const app = createApp();
  const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: adminPassword, rememberMe: true });
  if (login.status !== 200) {
    throw new Error(`Platform login failed (${login.status}).`);
  }
  const adminToken = login.body.data.accessToken as string;
  const created = await request(app).post('/api/v1/platform/tenants').set('Authorization', `Bearer ${adminToken}`).send({
    businessName: 'UAT Barbers',
    slug: 'uat-barbers',
    contactEmail: 'uat@enzo.test',
    contactPhone: '01000000000',
    address: 'Synthetic street',
    logo: '',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    defaultLanguage: 'en',
    theme: 'dark',
    owner: { fullName: 'UAT Owner', email: 'owner.uat@enzo.test', phone: '01110000001', password: ownerPassword },
  });
  if (created.status !== 201) {
    throw new Error(`Tenant create failed (${created.status}): ${JSON.stringify(created.body)}`);
  }
  const ownerLogin = await request(app).post('/api/v1/auth/login').send({ email: 'owner.uat@enzo.test', password: ownerPassword, rememberMe: true });
  const token = ownerLogin.body.data.accessToken as string;
  const bearer = { Authorization: `Bearer ${token}` };

  const cairo = await request(app).post('/api/v1/branches').set(bearer).send({ name: 'Cairo', code: 'CAI', address: 'Cairo street', phone: '01000000001', managerUserId: '', workingHours: hours() });
  const giza = await request(app).post('/api/v1/branches').set(bearer).send({ name: 'Giza', code: 'GIZ', address: 'Giza street', phone: '01000000002', managerUserId: '', workingHours: hours() });
  if (cairo.status !== 201 || giza.status !== 201) {
    throw new Error('Branch create failed.');
  }

  const roles = await request(app).get('/api/v1/roles?page=1&pageSize=50').set(bearer);
  const roleId = (name: string) => {
    const role = (roles.body.data as { id: string; name: string }[]).find((row) => row.name === name);
    if (!role) {
      throw new Error(`Role ${name} was not seeded.`);
    }
    return role.id;
  };
  const staff = [
    ['Branch Manager', 'UAT Manager', 'manager.uat@enzo.test', '01110000002'],
    ['Cashier', 'UAT Cashier', 'cashier.uat@enzo.test', '01110000003'],
    ['Receptionist', 'UAT Receptionist', 'receptionist.uat@enzo.test', '01110000004'],
    ['HR', 'UAT HR', 'hr.uat@enzo.test', '01110000005'],
    ['Accountant', 'UAT Accountant', 'accountant.uat@enzo.test', '01110000006'],
  ] as const;
  for (const [roleName, fullName, email, phone] of staff) {
    const user = await request(app).post('/api/v1/users').set(bearer).send({ fullName, email, phone, password: staffPassword });
    if (user.status !== 201) {
      throw new Error(`User ${email} failed (${user.status}): ${JSON.stringify(user.body)}`);
    }
    const assigned = await request(app).post(`/api/v1/users/${user.body.data.id}/roles`).set(bearer).send({
      assignments: [{ roleId: roleId(roleName), branchScope: 'SELECTED', branchIds: [cairo.body.data.id, giza.body.data.id] }],
    });
    if (assigned.status !== 200) {
      throw new Error(`Role ${roleName} failed (${assigned.status}): ${JSON.stringify(assigned.body)}`);
    }
  }

  const [types, titles] = await Promise.all([
    request(app).get('/api/v1/employees/employment-types').set(bearer),
    request(app).get('/api/v1/employees/job-titles').set(bearer),
  ]);
  const titleId = (titles.body.data as { id: string; name: string }[]).find((row) => row.name === 'Barber')?.id;
  const typeId = (types.body.data as { id: string; name: string }[])[0]?.id;
  if (!titleId || !typeId) {
    throw new Error('Employment catalogs were not seeded.');
  }
  for (const [fullName, phone, nationalId] of [
    ['UAT Barber One', '01220000001', '29901011234561'],
    ['UAT Barber Two', '01220000002', '29901011234562'],
  ] as const) {
    const employee = await request(app).post('/api/v1/employees').set(bearer).send({
      fullName, email: '', phone, nationalId, address: 'Synthetic street', dateOfBirth: '1999-01-01', joiningDate: '2026-01-01',
      employmentTypeId: typeId, jobTitleId: titleId,
      salary: { period: 'MONTHLY', basicSalary: 8000, allowances: 0, tips: 0, deductions: 0 },
      notes: '',
      branches: [{ branchId: cairo.body.data.id, isPrimary: true }, { branchId: giza.body.data.id, isPrimary: false }],
    });
    if (employee.status !== 201) {
      throw new Error(`Employee ${fullName} failed (${employee.status}): ${JSON.stringify(employee.body)}`);
    }
  }

  const serviceCategory = await request(app).post('/api/v1/service-categories').set(bearer).send({ name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE' });
  const services = [];
  for (const [name, price] of [['Haircut', 150], ['Beard', 80], ['Kids cut', 100]] as const) {
    const service = await request(app).post('/api/v1/services').set(bearer).send({
      name: { en: name, ar: name }, description: { en: '', ar: '' }, categoryId: serviceCategory.body.data.id, image: '', price,
      commissionType: 'PERCENTAGE', commissionValue: 15,
    });
    if (service.status !== 201) {
      throw new Error(`Service ${name} failed.`);
    }
    services.push(service.body.data.id as string);
  }
  for (const [fullName, phone] of [['Mona Adel', '01030000001'], ['Sara Nabil', '01030000002'], ['Youssef Kamal', '01030000003']] as const) {
    const customer = await request(app).post('/api/v1/customers').set(bearer).send({
      fullName, phone, email: '', dateOfBirth: '', gender: '', address: '', notes: '',
    });
    if (customer.status !== 201) {
      throw new Error(`Customer ${fullName} failed (${customer.status}).`);
    }
  }
  const haircutId = services[0];
  const pack = await request(app).post('/api/v1/packages').set(bearer).send({
    name: { en: 'VIP', ar: 'كبار' }, description: { en: '', ar: '' }, image: '',
    items: [{ serviceId: haircutId, quantity: 2 }],
    price: 200, validityType: 'VALIDITY_DAYS', validityDays: 30, fixedExpiryDate: '',
  });
  if (pack.status !== 201) {
    throw new Error(`Package failed (${pack.status}): ${JSON.stringify(pack.body)}`);
  }

  const productCategory = await request(app).post('/api/v1/product-categories').set(bearer).send({ name: { en: 'Care', ar: 'عناية' }, status: 'ACTIVE' });
  for (const sku of ['POM-1', 'POM-2', 'OIL-1']) {
    const product = await request(app).post('/api/v1/products').set(bearer).send({
      name: { en: `Product ${sku}`, ar: sku }, sku, barcode: '', description: { en: '', ar: '' },
      categoryId: productCategory.body.data.id, brand: 'Enzo', unit: 'piece', costPrice: 5, sellingPrice: 20, minimumStock: 2, image: '', status: 'ACTIVE',
    });
    if (product.status !== 201) {
      throw new Error(`Product ${sku} failed (${product.status}).`);
    }
  }
  const supplier = await request(app).post('/api/v1/suppliers').set(bearer).send({
    name: 'UAT Supply', phone: '01099990000', email: '', address: 'Cairo', taxNumber: '', notes: '', status: 'ACTIVE',
  });
  if (supplier.status !== 201) {
    throw new Error(`Supplier failed (${supplier.status}).`);
  }

  console.info('[enzo] Seeded tenant uat-barbers in the isolated UAT database. No sales, shifts, payroll, or subscription invoices were created.');
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
