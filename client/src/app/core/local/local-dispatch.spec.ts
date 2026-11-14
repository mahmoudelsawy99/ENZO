import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { averageCost, commissionAmount, payrollNet, saleTotals } from './local-calc';
import { NileDatabase } from './local-database';
import { loginLocal } from './local-auth';
import { dispatchLocal } from './local-route';
import { ensureSeed, type ShopSeed } from './local-seed';
import { exportSnapshot, importSnapshot, validateBackup } from './local-snapshot';
import { clearPersistedSession } from './local-session';

const shop: ShopSeed = {
  branch: { id: 'branch-cairo', name: 'Cairo', code: 'CAI', status: 'ACTIVE' },
  users: [
    {
      id: 'user-owner',
      fullName: 'Admin',
      email: 'admin.nile@enzo.test',
      password: 'AdminPass1',
      isOwner: true,
      roleName: 'Owner',
      userType: 'TENANT_USER',
      tenantId: 'tenant-nile',
      status: 'ACTIVE',
    },
  ],
  employees: [],
  serviceCategories: [],
  services: [
    {
      id: 'service-cut',
      name: { en: 'Haircut', ar: 'قص' },
      description: { en: '', ar: '' },
      categoryId: '',
      categoryName: { en: '', ar: '' },
      image: '',
      price: 100,
      commissionType: 'PERCENTAGE',
      commissionValue: 10,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const memory = memoryStorage();
Object.defineProperty(globalThis, 'sessionStorage', { value: memory, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });

after(() => clearPersistedSession());

test('money, commission, stock average, and payroll net stay exact', () => {
  assert.deepEqual(saleTotals(200, 50, 25, 100), {
    packageDiscount: 50,
    manualDiscount: 25,
    totalDiscount: 75,
    totalAmount: 125,
    paidAmount: 100,
    amountDue: 25,
    status: 'PARTIAL',
  });
  assert.equal(commissionAmount('PERCENTAGE', 10, 100, 1), 10);
  assert.equal(commissionAmount('FIXED', 15, 100, 2), 30);
  assert.equal(averageCost(10, 5, 10, 15), 10);
  assert.equal(payrollNet({ basicSalary: 1000, commission: 100, tips: 50, allowances: 20, overtime: 30, bonuses: 10, attendanceDeductions: 40, fixedDeductions: 15, otherDeductions: 5 }), 1150);
});

test('local shop logs in, sells, rejects a second branch, and restores ids', async () => {
  const db = new NileDatabase(`nile-test-${Date.now()}`);
  await db.open();
  await ensureSeed(db, shop);
  const session = await loginLocal(db, 'admin.nile@enzo.test', 'AdminPass1', false);
  assert.equal(session.user.email, 'admin.nile@enzo.test');

  await assert.rejects(
    () => dispatchLocal({ db, method: 'POST', path: '/v1/branches', body: { name: 'Giza', code: 'GIZ' }, userId: session.user.id }),
    (error: unknown) => (error as { code?: string }).code === 'single_branch',
  );

  const customer = await dispatchLocal({
    db,
    method: 'POST',
    path: '/v1/customers',
    body: { fullName: 'Omar', phone: '01011111111', email: '', dateOfBirth: '', gender: '', address: '', notes: '' },
    userId: session.user.id,
  });
  const customerId = (customer as { data: { id: string } }).data.id;

  const sale = await dispatchLocal({
    db,
    method: 'POST',
    path: '/v1/pos/orders',
    body: {
      branchId: 'branch-cairo',
      barberEmployeeId: '',
      customer: { fullName: 'Omar', phone: '01011111111' },
      services: [{ serviceId: 'service-cut', quantity: 2 }],
      idempotencyKey: 'order-1',
      additionalDiscount: 20,
      payments: [{ method: 'CASH', amount: 180, referenceNumber: '' }],
    },
    userId: session.user.id,
  });
  const saved = (sale as { data: { id: string; totalAmount: number; amountDue: number; customerId: string; commissions: Array<{ commissionAmount: number }> } }).data;
  assert.equal(saved.totalAmount, 180);
  assert.equal(saved.amountDue, 0);
  assert.equal(saved.customerId, customerId);
  assert.equal(saved.commissions[0]?.commissionAmount, 20);

  const before = await exportSnapshot(db);
  validateBackup(before);
  await dispatchLocal({
    db,
    method: 'POST',
    path: '/v1/customers',
    body: { fullName: 'Temporary', phone: '01022222222', email: '', dateOfBirth: '', gender: '', address: '', notes: '' },
    userId: session.user.id,
  });
  await importSnapshot(db, before);
  const restored = await dispatchLocal({ db, method: 'GET', path: `/v1/customers/${customerId}`, body: null, userId: session.user.id });
  assert.equal((restored as { data: { fullName: string } }).data.fullName, 'Omar');
  await assert.rejects(() => dispatchLocal({ db, method: 'GET', path: '/v1/customers/missing', body: null, userId: session.user.id }));
  await db.delete();
});
