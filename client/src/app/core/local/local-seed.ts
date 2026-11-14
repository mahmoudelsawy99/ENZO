import type { Doc, NileDatabase } from './local-database';
import { hashPassword } from './local-crypto';
import { CASHIER_PERMISSIONS, EMPLOYEE_PERMISSIONS, MANAGER_PERMISSIONS, PERMISSION_KEYS } from './local-permissions';
import { all, asDoc, bulkSave, one, remove, save, str } from './local-repo';

export interface ShopSeed {
  branch: { id: string; name: string; code: string; status: string };
  users: Array<Record<string, unknown> & { id: string; email: string; password?: string }>;
  employees?: Doc[];
  serviceCategories?: Doc[];
  services?: Doc[];
  entitlements?: Record<string, unknown>;
}

const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

function hours(): Record<string, { isOpen: boolean; openingTime: string; closingTime: string }> {
  return Object.fromEntries(DAYS.map((day) => [day, { isOpen: true, openingTime: '10:00', closingTime: '22:00' }]));
}

function fallbackShop(): ShopSeed {
  return {
    branch: { id: 'branch-cairo', name: 'Cairo', code: 'CAI', status: 'ACTIVE' },
    users: [
      {
        id: 'user-owner',
        fullName: 'Admin',
        email: 'admin.nile@enzo.test',
        phone: '01000000001',
        password: 'AdminPass1',
        userType: 'TENANT_USER',
        tenantId: 'tenant-nile',
        status: 'ACTIVE',
        isEmailVerified: true,
        isOwner: true,
        branchScope: 'ALL',
        roleName: 'Owner',
      },
    ],
    employees: [],
    serviceCategories: [asDoc('category-hair', { name: { en: 'Hair', ar: 'شعر' }, status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })],
    services: [
      asDoc('service-haircut', {
        name: { en: 'Haircut', ar: 'قص شعر' },
        description: { en: '', ar: '' },
        categoryId: 'category-hair',
        categoryName: { en: 'Hair', ar: 'شعر' },
        image: '',
        price: 100,
        commissionType: 'PERCENTAGE',
        commissionValue: 10,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ],
    entitlements: { unrestricted: true, status: 'ACTIVE', features: [], limits: { branches: 1, users: 10, employees: 20, storageMb: 512 }, usage: { branches: 1, users: 1, employees: 0, storageMb: null }, subscriptionId: null, planCode: 'LOCAL' },
  };
}

export async function loadShopSeed(): Promise<ShopSeed> {
  if (typeof fetch !== 'function') {
    return fallbackShop();
  }
  try {
    const response = await fetch('assets/shop.json');
    if (!response.ok) {
      return fallbackShop();
    }
    const shop = (await response.json()) as ShopSeed;
    if (!shop.branch?.id || !Array.isArray(shop.users)) {
      return fallbackShop();
    }
    return shop;
  } catch {
    return fallbackShop();
  }
}

async function role(id: string, name: string, description: string, permissions: string[], isOwner: boolean): Promise<Doc> {
  const now = new Date().toISOString();
  return asDoc(id, { name, description, permissions, status: 'ACTIVE', isOwner, createdAt: now, updatedAt: now });
}

/** Mahmoud Elsawy was removed from the shop. Drop him from a database that was already seeded. */
export async function dropRetiredStaff(db: NileDatabase): Promise<void> {
  if (await one(db, 'meta', 'drop-mahmoud-elsawy')) {
    return;
  }
  await remove(db, 'employees', '6af0f4edd5345916d38f5c87');
  await save(db, 'meta', asDoc('drop-mahmoud-elsawy', { removedAt: new Date().toISOString() }), true);
}

/** Add the Sawy owner on databases that were opened before this account existed. */
export async function ensureSawyAdmin(db: NileDatabase): Promise<void> {
  const users = await all(db, 'users');
  if (users.some((user) => str(user, 'email').toLowerCase() === 'sawy@enzo.com')) {
    return;
  }
  const hashed = await hashPassword('sawy12345');
  await save(
    db,
    'users',
    asDoc('user-sawy', {
      fullName: 'Sawy',
      email: 'sawy@enzo.com',
      phone: '',
      userType: 'TENANT_USER',
      tenantId: '6aedefa6bc1fcc79a33c33b3',
      status: 'ACTIVE',
      isEmailVerified: true,
      lastLoginAt: null,
      isOwner: true,
      branchScope: 'ALL',
      permissions: [...PERMISSION_KEYS],
      roleIds: ['role-owner'],
      employeeId: null,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordIterations: hashed.iterations,
    }),
  );
}

/** Cashiers can download the day report. Add the export permission to accounts that already exist. */
export async function ensureCashierExport(db: NileDatabase): Promise<boolean> {
  let changed = false;
  for (const user of await all(db, 'users')) {
    const permissions = asStringList(user['permissions']);
    if (!permissions.includes('reports.cashier') || permissions.includes('reports.export')) {
      continue;
    }
    await save(db, 'users', asDoc(user.id, { ...user, permissions: [...permissions, 'reports.export'] }));
    changed = true;
  }
  const role = await one(db, 'roles', 'role-cashier');
  if (role) {
    const permissions = asStringList(role['permissions']);
    if (!permissions.includes('reports.export')) {
      await save(db, 'roles', asDoc(role.id, { ...role, permissions: [...permissions, 'reports.export'] }));
      changed = true;
    }
  }
  return changed;
}

/** The haircut named قص moved from 220 to 320. Apply it once on an existing database. */
export async function ensureHaircutPrice(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'price-qass-320')) {
    return false;
  }
  const service = await one(db, 'services', '6aefb704d5345916d38f5bfe');
  if (service) {
    await save(db, 'services', asDoc(service.id, { ...service, price: 320 }));
  }
  await save(db, 'meta', asDoc('price-qass-320', { price: 320 }), true);
  return service != null;
}

/** Add the Hanan cashier on databases that were opened before this account existed. */
export async function ensureHananCashier(db: NileDatabase): Promise<void> {
  const users = await all(db, 'users');
  if (users.some((user) => str(user, 'email').toLowerCase() === 'hanan@enzo.com')) {
    return;
  }
  const hashed = await hashPassword('Hanan@2026');
  await save(
    db,
    'users',
    asDoc('user-hanan', {
      fullName: 'Hanan',
      email: 'hanan@enzo.com',
      phone: '',
      userType: 'TENANT_USER',
      tenantId: '6aedefa6bc1fcc79a33c33b3',
      status: 'ACTIVE',
      isEmailVerified: true,
      lastLoginAt: null,
      isOwner: false,
      branchScope: 'SELECTED',
      permissions: [...CASHIER_PERMISSIONS],
      roleIds: ['role-cashier'],
      employeeId: null,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordIterations: hashed.iterations,
    }),
  );
}

export async function ensureSeed(db: NileDatabase, shop?: ShopSeed): Promise<void> {
  if (await one(db, 'meta', 'seed')) {
    return;
  }
  const source = shop ?? (await loadShopSeed());
  const now = new Date().toISOString();
  const roles = [
    await role('role-owner', 'Owner', 'Full access to this barbershop.', [...PERMISSION_KEYS], true),
    await role('role-manager', 'Branch Manager', 'Runs the single branch.', [...MANAGER_PERMISSIONS], false),
    await role('role-cashier', 'Cashier', 'Takes payments at the branch.', [...CASHIER_PERMISSIONS], false),
    await role('role-employee', 'Employee', 'Sees own queue, appointments, and attendance.', [...EMPLOYEE_PERMISSIONS], false),
  ];
  const users: Doc[] = [];
  for (const raw of source.users) {
    const owner = raw['isOwner'] === true || raw['roleName'] === 'Owner';
    const cashier = raw['roleName'] === 'Cashier';
    const hashed = await hashPassword(String(raw.password ?? 'ChangeMe1'));
    const permissions = owner ? [...PERMISSION_KEYS] : cashier ? [...CASHIER_PERMISSIONS] : asStringList(raw['permissions']);
    users.push(
      asDoc(raw.id, {
        fullName: raw['fullName'] ?? '',
        email: raw.email,
        phone: raw['phone'] ?? '',
        userType: raw['userType'] ?? 'TENANT_USER',
        tenantId: raw['tenantId'] ?? 'tenant-nile',
        status: raw['status'] ?? 'ACTIVE',
        isEmailVerified: raw['isEmailVerified'] !== false,
        lastLoginAt: null,
        isOwner: owner,
        branchScope: raw['branchScope'] ?? (owner ? 'ALL' : 'SELECTED'),
        permissions,
        roleIds: owner ? ['role-owner'] : cashier ? ['role-cashier'] : ['role-employee'],
        employeeId: null,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordIterations: hashed.iterations,
      }),
    );
  }
  const owner = users.find((user) => user['isOwner'] === true) ?? users[0];
  const branch = asDoc(source.branch.id, {
    name: source.branch.name,
    code: source.branch.code,
    address: '',
    phone: '',
    workingHours: hours(),
    managerUserId: owner?.id ?? null,
    managerName: owner ? str(owner, 'fullName') : '',
    status: source.branch.status || 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  const employees = (source.employees ?? []).map((employee) =>
    asDoc(employee.id, {
      ...employee,
      branches: Array.isArray(employee['branches'])
        ? (employee['branches'] as Array<Record<string, unknown>>).map((item) => ({ removedAt: null, ...item }))
        : [],
    }),
  );
  for (const employee of employees) {
    const linked = users.find((user) => str(user, 'email') && str(user, 'email') === str(employee, 'email'));
    if (linked) {
      linked['employeeId'] = employee.id;
    }
  }
  const types = uniqueCatalog(employees, 'employmentTypeId', 'employmentTypeName', [
    ['type-full', 'Full-time'],
    ['type-part', 'Part-time'],
    ['type-contract', 'Contract'],
  ]);
  const titles = uniqueCatalog(employees, 'jobTitleId', 'jobTitleName', [
    ['title-barber', 'Barber'],
    ['title-reception', 'Receptionist'],
    ['title-cashier', 'Cashier'],
    ['title-manager', 'Branch Manager'],
  ]);
  await bulkSave(db, 'roles', roles);
  await bulkSave(db, 'users', users);
  await bulkSave(db, 'branches', [branch]);
  await bulkSave(db, 'employees', employees);
  await bulkSave(db, 'employmentTypes', types);
  await bulkSave(db, 'jobTitles', titles);
  await bulkSave(db, 'serviceCategories', source.serviceCategories ?? []);
  await bulkSave(db, 'services', source.services ?? []);
  await save(
    db,
    'settings',
    asDoc('entitlements', source.entitlements ?? { unrestricted: true, status: 'ACTIVE', features: [], limits: { branches: 1, users: 10, employees: 20, storageMb: 512 }, usage: { branches: 1, users: users.length, employees: employees.length, storageMb: null }, subscriptionId: null, planCode: 'LOCAL' }),
    true,
  );
  await save(db, 'settings', asDoc('customerSettings', { uniquePhone: true }), true);
  await save(db, 'settings', asDoc('serviceSettings', { maxCommissionPercent: 100 }), true);
  await save(db, 'settings', asDoc('commission', { defaultRule: { id: null, kind: 'PERCENTAGE', value: 0 }, services: [] }), true);
  await save(
    db,
    'settings',
    asDoc('whatsappConfig', {
      phoneNumberId: '',
      businessAccountId: '',
      enabled: false,
      tokenSet: false,
      appSecretSet: false,
      verifyTokenSet: false,
      liveReady: false,
      liveMessagingTested: false,
    }),
    true,
  );
  await save(
    db,
    'settings',
    asDoc('whatsappSettings', {
      appointmentConfirmation: false,
      appointmentReminder: false,
      appointmentCancellation: false,
      appointmentReschedule: false,
      packagePurchase: false,
      packageExpiry: false,
      paymentReceipt: false,
      promotional: false,
    }),
    true,
  );
  await save(
    db,
    'policies',
    asDoc('policy-default', {
      branchId: branch.id,
      graceMinutes: 10,
      earlyLeaveGraceMinutes: 10,
      halfDayRatio: 0.5,
      overtimeRoundingMinutes: 15,
      weeklyDaysOff: [],
      publicHolidays: [],
      lateDeductionPerMinute: 0,
      earlyLeaveDeductionPerMinute: 0,
      absenceDeductionMode: 'NONE',
      dailyRateDays: 30,
      halfDayFactor: 0.5,
      overtimeMultiplier: 1.5,
      monthlyHours: 208,
    }),
    true,
  );
  await save(db, 'meta', asDoc('seed', { seededAt: now, source: 'shop-seed' }), true);
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueCatalog(employees: Doc[], idKey: string, nameKey: string, defaults: Array<[string, string]>): Doc[] {
  const rows = new Map<string, Doc>(defaults.map(([id, name]) => [id, asDoc(id, { name, status: 'ACTIVE' })]));
  for (const employee of employees) {
    const id = str(employee, idKey);
    const name = str(employee, nameKey);
    if (id && name) {
      rows.set(id, asDoc(id, { name, status: 'ACTIVE' }));
    }
  }
  return [...rows.values()];
}
