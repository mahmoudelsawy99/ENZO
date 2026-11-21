import type { Doc, NileDatabase } from './local-database';
import { hashPassword } from './local-crypto';
import { CASHIER_PERMISSIONS, EMPLOYEE_PERMISSIONS, MANAGER_PERMISSIONS, PERMISSION_KEYS } from './local-permissions';
import { all, asDoc, bulkSave, num, one, remove, save, str } from './local-repo';

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

/** Drop the duplicate Haircut (قص شعر / Hair / 150) from databases that already have it. */
export async function dropRetiredServices(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'drop-haircut-hair-150')) {
    return false;
  }
  await remove(db, 'services', '6aee09fb2579413970c8bca8');
  await save(db, 'meta', asDoc('drop-haircut-hair-150', { removedAt: new Date().toISOString() }), true);
  return true;
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

/** Keep the cashier role and cashier accounts on the short daily desk menu. */
export async function ensureCashierSlimMenu(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'cashier-slim-menu-2026-11-19')) {
    return false;
  }
  let changed = false;
  const role = await one(db, 'roles', 'role-cashier');
  if (role) {
    await save(db, 'roles', asDoc(role.id, { ...role, permissions: [...CASHIER_PERMISSIONS] }));
    changed = true;
  }
  for (const user of await all(db, 'users')) {
    if (user['isOwner'] === true) {
      continue;
    }
    const roleIds = asStringList(user['roleIds']);
    const permissions = asStringList(user['permissions']);
    const isCashier = roleIds.includes('role-cashier') || permissions.includes('reports.cashier') || permissions.includes('pos.checkout');
    if (!isCashier) {
      continue;
    }
    await save(
      db,
      'users',
      asDoc(user.id, {
        ...user,
        permissions: [...CASHIER_PERMISSIONS],
        roleIds: roleIds.includes('role-cashier') ? roleIds : [...roleIds, 'role-cashier'],
      }),
    );
    changed = true;
  }
  await save(db, 'meta', asDoc('cashier-slim-menu-2026-11-19', { appliedAt: new Date().toISOString() }), true);
  return changed;
}

/**
 * Barber rate list. Hydrofacial is 80% and protein / silver dye are 10%.
 * Every other rate on that list is a fixed amount in EGP, not a percent.
 * More specific names are checked first. Returns null when the service is not on the list.
 */
export function serviceCommissionRule(name: unknown): { type: 'PERCENTAGE' | 'FIXED'; value: number } | null {
  const record = name && typeof name === 'object' ? (name as { en?: unknown; ar?: unknown }) : undefined;
  const text = foldServiceName(`${typeof record?.ar === 'string' ? record.ar : ''} ${typeof record?.en === 'string' ? record.en : ''} ${typeof name === 'string' ? name : ''}`);
  if (text.includes('سلفر') || text.includes('سيلفر') || text.includes('silver')) return { type: 'PERCENTAGE', value: 10 };
  if (text.includes('هيدرو') || text.includes('هيدرا') || text.includes('hydro')) return { type: 'PERCENTAGE', value: 80 };
  if (text.includes('بروتين')) return { type: 'PERCENTAGE', value: 10 };
  if (text.includes('حمام زيت') || text.includes('حمام الزيت')) return { type: 'FIXED', value: 25 };
  if (text.includes('فرد') && text.includes('لايت')) return { type: 'FIXED', value: 20 };
  if (text.includes('فرد') && text.includes('شعر') && !text.includes('ذقن')) return { type: 'FIXED', value: 20 };
  if (text.includes('رينساج') && text.includes('شعر') && !text.includes('ذقن')) return { type: 'FIXED', value: 20 };
  if (text.includes('صبغ') && text.includes('شعر') && !text.includes('ذقن')) return { type: 'FIXED', value: 20 };
  if ((text.includes('باديكير') || text.includes('بادكير')) && (text.includes('يد') || text.includes('ايد') || text.includes('قدم') || text.includes('رجل'))) return { type: 'FIXED', value: 20 };
  if ((text.includes('تنظيف') || text.includes('تنضيف')) && text.includes('بشر')) return { type: 'FIXED', value: 30 };
  if (text.includes('واكس كامل')) return { type: 'FIXED', value: 20 };
  return null;
}

function foldServiceName(value: string): string {
  return value
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Apply the barber rate list once. Every other service has no commission. Prices, names, and existing tickets stay as they are. */
export async function ensureServiceCommissionRates(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'commission-rates-barber-zero-rest-2026-11-16')) {
    return false;
  }
  let changed = false;
  for (const service of await all(db, 'services')) {
    const rule = serviceCommissionRule(service['name']) ?? { type: 'PERCENTAGE' as const, value: 0 };
    if (str(service, 'commissionType') === rule.type && num(service, 'commissionValue') === rule.value) continue;
    await save(db, 'services', asDoc(service.id, { ...service, commissionType: rule.type, commissionValue: rule.value }));
    changed = true;
  }
  await save(db, 'meta', asDoc('commission-rates-barber-zero-rest-2026-11-16', { appliedAt: new Date().toISOString() }), true);
  return changed;
}

/** Keep this POS category tab last in the cashier menu. */
export const MABEAAT_CATEGORY_ID = 'cat-ziadat';
const MABEAAT_CATEGORY_NAME = { en: 'Sales', ar: 'مبيعات' } as const;
const MABEAAT_PRODUCT_CATEGORY_ID = 'pcat-ziadat';
const MABEAAT_BARBER_COMMISSION = { type: 'FIXED' as const, value: 30 };
/** Old single "زيادات" tile at 120 — replaced by the retail sales tab. */
const LEGACY_ZIADAT_SERVICE_ID = '6aefb706d5345916d38f5c34';

/** Retail items sold from the POS مبيعات tab. POS tiles show sell price only. Barber commission is fixed 30. */
export const ZIADAT_RETAIL_ITEMS: Array<{
  id: string;
  sku: string;
  brand: string;
  name: { en: string; ar: string };
  costPrice: number;
  sellingPrice: number;
}> = [
  { id: 'ziadat-onix-serum', sku: 'ONIX-SERUM', brand: 'Onix', name: { en: 'Onix serum', ar: 'سيرم Onix' }, costPrice: 250, sellingPrice: 500 },
  { id: 'ziadat-onix-oil', sku: 'ONIX-OIL', brand: 'Onix', name: { en: 'Onix oil bath', ar: 'حمام زيت Onix' }, costPrice: 230, sellingPrice: 600 },
  { id: 'ziadat-loreal-shampoo', sku: 'LOREAL-SHAMPOO', brand: 'Loreal', name: { en: 'Loreal shampoo', ar: 'شامبو لوريال' }, costPrice: 655, sellingPrice: 950 },
  { id: 'ziadat-loreal-conditioner', sku: 'LOREAL-COND', brand: 'Loreal', name: { en: 'Loreal conditioner', ar: 'بلسم لوريال' }, costPrice: 835, sellingPrice: 1150 },
  { id: 'ziadat-loreal-serum', sku: 'LOREAL-SERUM', brand: 'Loreal', name: { en: 'Loreal serum', ar: 'سيرم لوريال' }, costPrice: 1117, sellingPrice: 1450 },
  { id: 'ziadat-art-cream', sku: 'ART-CREAM', brand: 'Art', name: { en: 'Art cream', ar: 'كريم Art' }, costPrice: 619, sellingPrice: 950 },
  { id: 'ziadat-silver-shampoo', sku: 'SILVER-SHAMPOO', brand: 'Silver', name: { en: 'Silver shampoo', ar: 'شامبو سيلفر' }, costPrice: 655, sellingPrice: 900 },
  { id: 'ziadat-jean-francis', sku: 'JEAN-FRANCIS', brand: 'Silver', name: { en: 'Jean Francis', ar: 'جون فرانسيس' }, costPrice: 390, sellingPrice: 650 },
  { id: 'ziadat-asterle', sku: 'ASTERLE', brand: 'Silver', name: { en: 'Asterle', ar: 'استرله' }, costPrice: 120, sellingPrice: 350 },
];

/**
 * Add the مبيعات POS tab (services + inventory products).
 * Existing sales and other records are left alone. Safe to re-run.
 */
export async function ensureZiadatRetailMenu(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'ziadat-retail-menu-2026-11-21')) {
    return false;
  }
  const now = new Date().toISOString();
  let changed = false;

  const category = await one(db, 'serviceCategories', MABEAAT_CATEGORY_ID);
  if (!category) {
    await save(
      db,
      'serviceCategories',
      asDoc(MABEAAT_CATEGORY_ID, {
        name: { ...MABEAAT_CATEGORY_NAME },
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }),
      true,
    );
    changed = true;
  }

  const productCategory = await one(db, 'productCategories', MABEAAT_PRODUCT_CATEGORY_ID);
  if (!productCategory) {
    await save(
      db,
      'productCategories',
      asDoc(MABEAAT_PRODUCT_CATEGORY_ID, {
        name: { ...MABEAAT_CATEGORY_NAME },
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }),
      true,
    );
    changed = true;
  }

  for (const item of ZIADAT_RETAIL_ITEMS) {
    const serviceId = `svc-${item.id}`;
    const existingService = await one(db, 'services', serviceId);
    if (!existingService) {
      await save(
        db,
        'services',
        asDoc(serviceId, {
          name: { ...item.name },
          description: { en: '', ar: '' },
          categoryId: MABEAAT_CATEGORY_ID,
          categoryName: { ...MABEAAT_CATEGORY_NAME },
          image: '',
          price: item.sellingPrice,
          costPrice: item.costPrice,
          commissionType: MABEAAT_BARBER_COMMISSION.type,
          commissionValue: MABEAAT_BARBER_COMMISSION.value,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        }),
        true,
      );
      changed = true;
    }

    const productId = `prd-${item.id}`;
    const existingProduct = await one(db, 'products', productId);
    if (!existingProduct) {
      await save(
        db,
        'products',
        asDoc(productId, {
          name: { ...item.name },
          sku: item.sku,
          barcode: '',
          description: { en: '', ar: '' },
          categoryId: MABEAAT_PRODUCT_CATEGORY_ID,
          brand: item.brand,
          unit: 'piece',
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          minimumStock: 0,
          image: '',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        }),
        true,
      );
      changed = true;
    }
  }

  const legacy = await one(db, 'services', LEGACY_ZIADAT_SERVICE_ID);
  if (legacy && str(legacy, 'status') !== 'INACTIVE') {
    await save(db, 'services', asDoc(legacy.id, { ...legacy, status: 'INACTIVE', updatedAt: now }), true);
    changed = true;
  }

  await save(db, 'meta', asDoc('ziadat-retail-menu-2026-11-21', { appliedAt: now, count: ZIADAT_RETAIL_ITEMS.length }), true);
  return changed;
}

/** Rename زيادات → مبيعات and set fixed barber commission 30 on those retail items. */
export async function ensureMabeaatTabAndCommission(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'mabeaat-tab-commission-30-2026-11-21')) {
    return false;
  }
  const now = new Date().toISOString();
  let changed = false;

  for (const collection of ['serviceCategories', 'productCategories'] as const) {
    const category = await one(db, collection, collection === 'serviceCategories' ? MABEAAT_CATEGORY_ID : MABEAAT_PRODUCT_CATEGORY_ID);
    if (category) {
      await save(
        db,
        collection,
        asDoc(category.id, { ...category, name: { ...MABEAAT_CATEGORY_NAME }, updatedAt: now }),
        true,
      );
      changed = true;
    }
  }

  for (const item of ZIADAT_RETAIL_ITEMS) {
    const serviceId = `svc-${item.id}`;
    const service = await one(db, 'services', serviceId);
    if (!service) continue;
    await save(
      db,
      'services',
      asDoc(service.id, {
        ...service,
        categoryId: MABEAAT_CATEGORY_ID,
        categoryName: { ...MABEAAT_CATEGORY_NAME },
        commissionType: MABEAAT_BARBER_COMMISSION.type,
        commissionValue: MABEAAT_BARBER_COMMISSION.value,
        updatedAt: now,
      }),
      true,
    );
    changed = true;
  }

  await save(db, 'meta', asDoc('mabeaat-tab-commission-30-2026-11-21', { appliedAt: now }), true);
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

/** Add Ahmed the cashier, or set the given password once if the account is already there. */
export async function ensureAhmedCashier(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'user-ahmed-2026')) {
    return false;
  }
  const hashed = await hashPassword('Ahmed@2026');
  const existing = (await all(db, 'users')).find((user) => str(user, 'email').toLowerCase() === 'ahmed@enzo.com');
  if (existing) {
    await save(
      db,
      'users',
      asDoc(existing.id, {
        ...existing,
        status: 'ACTIVE',
        isEmailVerified: true,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordIterations: hashed.iterations,
      }),
    );
  } else {
    await save(
      db,
      'users',
      asDoc('user-ahmed', {
        fullName: 'Ahmed',
        email: 'ahmed@enzo.com',
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
  await save(db, 'meta', asDoc('user-ahmed-2026', { email: 'ahmed@enzo.com' }), true);
  return true;
}

/** Add Metawee the cashier, or set the given password once if the account is already there. */
export async function ensureMetaweeCashier(db: NileDatabase): Promise<boolean> {
  if (await one(db, 'meta', 'user-metawee-2026')) {
    return false;
  }
  const hashed = await hashPassword('Metawee@2026');
  const existing = (await all(db, 'users')).find((user) => str(user, 'email').toLowerCase() === 'metawee@enzo.com');
  if (existing) {
    await save(
      db,
      'users',
      asDoc(existing.id, {
        ...existing,
        status: 'ACTIVE',
        isEmailVerified: true,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordIterations: hashed.iterations,
        permissions: [...CASHIER_PERMISSIONS],
        roleIds: ['role-cashier'],
        isOwner: false,
        branchScope: 'SELECTED',
      }),
    );
  } else {
    await save(
      db,
      'users',
      asDoc('user-metawee', {
        fullName: 'Metawee',
        email: 'metawee@enzo.com',
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
  await save(db, 'meta', asDoc('user-metawee-2026', { email: 'metawee@enzo.com' }), true);
  return true;
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
