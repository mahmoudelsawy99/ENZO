import { averageCost, commissionAmount, payrollNet, roundMoney, saleTotals } from './local-calc';
import type { Doc, NileDatabase } from './local-database';
import { permissionCatalog } from './local-permissions';
import {
  all,
  asDoc,
  asList,
  asPayload,
  dataOf,
  fail,
  matches,
  nextNumber,
  num,
  one,
  pageOf,
  type Payload,
  remove,
  requireOne,
  save,
  str,
  uid,
  within,
} from './local-repo';
import { resetUserPassword } from './local-auth';

export interface LocalCall {
  db: NileDatabase;
  method: string;
  path: string;
  body: unknown;
  userId: string | null;
}

interface Ctx {
  db: NileDatabase;
  method: string;
  resource: string;
  id: string;
  action: string;
  extra: string;
  query: Record<string, string>;
  body: Payload;
  userId: string | null;
}

export async function dispatchLocal(call: LocalCall): Promise<unknown> {
  const url = new URL(call.path, 'http://nile.local');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1') {
    fail(404, 'not_found', `Local mode has no handler for ${call.path}.`);
  }
  const ctx: Ctx = {
    db: call.db,
    method: call.method.toUpperCase(),
    resource: parts[1] ?? '',
    id: parts[2] ?? '',
    action: parts[3] ?? '',
    extra: parts[4] ?? '',
    query: Object.fromEntries(url.searchParams.entries()),
    body: asPayload(call.body),
    userId: call.userId,
  };
  if (ctx.resource === 'platform') {
    fail(403, 'platform_requires_server', 'Platform administration stays on server mode. This computer runs one shop locally.');
  }
  const result = await route(ctx);
  if (result === undefined) {
    fail(404, 'not_found', `Local mode has no handler for ${ctx.method} /v1/${ctx.resource}${ctx.id ? `/${ctx.id}` : ''}${ctx.action ? `/${ctx.action}` : ''}.`);
  }
  return result;
}

async function route(ctx: Ctx): Promise<unknown> {
  switch (ctx.resource) {
    case 'access':
      return dataOf(await accessSnapshot(ctx.db, ctx.userId));
    case 'billing':
      return billing(ctx);
    case 'permissions':
      return dataOf(permissionCatalog());
    case 'branches':
      return branches(ctx);
    case 'employees':
      return employees(ctx);
    case 'roles':
      return roles(ctx);
    case 'users':
      return users(ctx);
    case 'commissions':
      return commissions(ctx);
    case 'service-categories':
      return namedCatalog(ctx, 'serviceCategories');
    case 'services':
      return services(ctx);
    case 'customers':
      return customers(ctx);
    case 'packages':
      return packages(ctx);
    case 'appointments':
      return appointments(ctx);
    case 'queue':
      return queue(ctx);
    case 'pos':
      return pos(ctx);
    case 'transactions':
      return transactions(ctx);
    case 'refunds':
      return refunds(ctx);
    case 'cashier-shifts':
      return shifts(ctx);
    case 'commission-reports':
      return dataOf(await commissionSummary(ctx.db, ctx.query['branchId'] ?? ''));
    case 'product-categories':
      return namedCatalog(ctx, 'productCategories');
    case 'products':
      return products(ctx);
    case 'inventory':
      return inventory(ctx);
    case 'suppliers':
      return suppliers(ctx);
    case 'purchases':
      return purchases(ctx);
    case 'transfers':
      return transfers(ctx);
    case 'stock-alerts':
      return alerts(ctx);
    case 'attendance':
      return attendance(ctx);
    case 'schedules':
      return schedules(ctx);
    case 'fingerprint-devices':
      return devices(ctx);
    case 'leave-types':
      return leaveTypes(ctx);
    case 'leave-requests':
      return leaveRequests(ctx);
    case 'leave-balances':
      return leaveBalances(ctx);
    case 'payroll':
      return payroll(ctx);
    case 'reports':
      return reports(ctx);
    case 'whatsapp':
      return whatsapp(ctx);
    default:
      return undefined;
  }
}

async function accessSnapshot(db: NileDatabase, userId: string | null) {
  const user = userId ? await one(db, 'users', userId) : undefined;
  const branches = await all(db, 'branches');
  const owner = user?.['isOwner'] === true;
  const scope = str(user, 'branchScope') === 'SELECTED' ? 'SELECTED' : 'ALL';
  return {
    isOwner: owner,
    permissions: owner ? permissionCatalog().flatMap((item) => item.permissions) : asList<string>(user?.['permissions']),
    branchScope: scope,
    branches: branches.map((branch) => ({ id: branch.id, name: str(branch, 'name'), code: str(branch, 'code'), status: str(branch, 'status') })),
  };
}

async function billing(ctx: Ctx) {
  if (ctx.id === 'entitlements') {
    const current = (await one(ctx.db, 'settings', 'entitlements')) ?? asDoc('entitlements', { unrestricted: true, status: 'ACTIVE', features: [], limits: { branches: 1, users: 10, employees: 20, storageMb: 512 }, usage: { branches: 1, users: 1, employees: 0, storageMb: null }, subscriptionId: null, planCode: 'LOCAL' });
    return dataOf(current);
  }
  if (ctx.id === 'invoices' && !ctx.action) {
    return dataOf([]);
  }
  if (ctx.id === 'invoices' && ctx.action && ctx.extra === 'download') {
    return simplePdf([`Invoice ${ctx.action}`, 'Local mode does not bill a cloud subscription.']);
  }
  return undefined;
}

async function branches(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') {
    return pageOf((await all(ctx.db, 'branches')).filter((row) => matches(row, ctx.query, ['name', 'code'])), ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') {
    if ((await all(ctx.db, 'branches')).length >= 1) {
      fail(409, 'single_branch', 'This computer keeps one branch. Edit the existing branch instead of adding another.');
    }
    return dataOf(await writeBranch(ctx, uid('branch')));
  }
  if (ctx.id && ctx.method === 'GET') return dataOf(await requireOne(ctx.db, 'branches', ctx.id));
  if (ctx.id && ctx.method === 'PUT') return dataOf(await writeBranch(ctx, ctx.id));
  if (ctx.id && ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'branches', ctx.id);
    return dataOf(await save(ctx.db, 'branches', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  return undefined;
}

async function writeBranch(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'branches', id);
  const managerId = str(ctx.body, 'managerUserId');
  const manager = managerId ? await one(ctx.db, 'users', managerId) : undefined;
  const name = str(ctx.body, 'name') || str(existing, 'name');
  const code = str(ctx.body, 'code') || str(existing, 'code');
  if (!name || !code) fail(400, 'validation', 'Branch name and code are required.');
  return save(ctx.db, 'branches', asDoc(id, {
    name,
    code,
    address: str(ctx.body, 'address'),
    phone: str(ctx.body, 'phone'),
    workingHours: ctx.body['workingHours'] ?? existing?.['workingHours'] ?? {},
    managerUserId: managerId || null,
    managerName: manager ? str(manager, 'fullName') : str(existing, 'managerName'),
    status: str(existing, 'status') || 'ACTIVE',
    createdAt: existing?.['createdAt'],
  }));
}

async function employees(ctx: Ctx) {
  if (ctx.id === 'employment-types' || ctx.id === 'job-titles') return catalogs(ctx, ctx.id === 'job-titles' ? 'jobTitles' : 'employmentTypes');
  if (ctx.id === 'photo') return dataOf({ profileImage: '' });
  if (!ctx.id && ctx.method === 'GET') {
    const rows = (await all(ctx.db, 'employees')).filter((row) => matches(row, ctx.query, ['fullName', 'employeeNumber', 'phone']));
    return pageOf(rows, ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeEmployee(ctx, uid('emp')));
  if (ctx.method === 'GET' && ctx.id && !ctx.action) return dataOf(await requireOne(ctx.db, 'employees', ctx.id));
  if (ctx.method === 'PUT' && !ctx.action) return dataOf(await writeEmployee(ctx, ctx.id));
  if (ctx.action === 'status' && !ctx.extra) {
    const current = await requireOne(ctx.db, 'employees', ctx.id);
    return dataOf(await save(ctx.db, 'employees', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  if (ctx.action === 'branches' && ctx.method === 'POST') return dataOf(await assignBranch(ctx));
  if (ctx.action === 'branches' && ctx.extra === 'primary') return dataOf(await makePrimary(ctx));
  if (ctx.action === 'branches' && ctx.method === 'DELETE') return dataOf(await removeEmployeeBranch(ctx));
  if (ctx.action === 'activity') return dataOf(await activityFor(ctx.db, ctx.id));
  if (ctx.action === 'commissions') return dataOf(await saveEmployeeCommission(ctx));
  return undefined;
}

async function writeEmployee(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'employees', id);
  const fullName = str(ctx.body, 'fullName') || str(existing, 'fullName');
  if (!fullName) fail(400, 'validation', 'Employee name is required.');
  const types = await all(ctx.db, 'employmentTypes');
  const titles = await all(ctx.db, 'jobTitles');
  const branches = await all(ctx.db, 'branches');
  const type = types.find((item) => item.id === str(ctx.body, 'employmentTypeId'));
  const title = titles.find((item) => item.id === str(ctx.body, 'jobTitleId'));
  const salary = (ctx.body['salary'] ?? existing?.['salary'] ?? { period: 'MONTHLY', basicSalary: 0, allowances: 0, tips: 0, deductions: 0 }) as Payload;
  const gross = roundMoney(num(salary, 'basicSalary') + num(salary, 'allowances') + num(salary, 'tips'));
  const assignments = asList<Payload>(ctx.body['branches'] ?? existing?.['branches']).map((item) => {
    const branch = branches.find((row) => row.id === str(item, 'branchId'));
    return {
      id: str(item, 'id') || uid('asg'),
      branchId: str(item, 'branchId'),
      branchName: branch ? str(branch, 'name') : str(item, 'branchName'),
      branchCode: branch ? str(branch, 'code') : str(item, 'branchCode'),
      branchStatus: branch ? str(branch, 'status') : 'ACTIVE',
      status: str(item, 'status') || 'ACTIVE',
      isPrimary: item['isPrimary'] === true,
      assignedAt: str(item, 'assignedAt') || new Date().toISOString(),
      removedAt: item['removedAt'] ?? null,
    };
  });
  const nationalId = str(ctx.body, 'nationalId');
  return save(ctx.db, 'employees', asDoc(id, {
    employeeNumber: str(ctx.body, 'employeeNumber') || str(existing, 'employeeNumber') || (await nextNumber(ctx.db, 'employee', 'EMP')),
    fullName,
    email: str(ctx.body, 'email'),
    phone: str(ctx.body, 'phone'),
    profileImage: str(ctx.body, 'profileImage') || str(existing, 'profileImage'),
    nationalIdMasked: nationalId ? maskId(nationalId) : str(existing, 'nationalIdMasked'),
    address: str(ctx.body, 'address'),
    dateOfBirth: str(ctx.body, 'dateOfBirth'),
    joiningDate: str(ctx.body, 'joiningDate'),
    employmentTypeId: str(ctx.body, 'employmentTypeId'),
    employmentTypeName: type ? str(type, 'name') : str(existing, 'employmentTypeName'),
    jobTitleId: str(ctx.body, 'jobTitleId'),
    jobTitleName: title ? str(title, 'name') : str(existing, 'jobTitleName'),
    userId: existing?.['userId'] ?? null,
    user: existing?.['user'] ?? null,
    salary,
    salaryFormula: { gross: String(gross), net: String(roundMoney(gross - num(salary, 'deductions'))) },
    commissionRules: existing?.['commissionRules'] ?? [],
    branches: assignments,
    status: str(existing, 'status') || 'ACTIVE',
    notes: str(ctx.body, 'notes'),
    createdAt: existing?.['createdAt'],
  }));
}

async function assignBranch(ctx: Ctx): Promise<Doc> {
  const employee = await requireOne(ctx.db, 'employees', ctx.id);
  const branch = await requireOne(ctx.db, 'branches', str(ctx.body, 'branchId'));
  const branches = asList<Payload>(employee['branches']).map((item) => ({ ...item }));
  const primary = ctx.body['isPrimary'] === true;
  if (primary) {
    for (const item of branches) item['isPrimary'] = false;
  }
  const existing = branches.find((item) => str(item, 'branchId') === branch.id);
  if (existing) {
    existing['status'] = 'ACTIVE';
    existing['isPrimary'] = primary || existing['isPrimary'] === true;
    existing['removedAt'] = null;
  } else {
    branches.push({
      id: uid('asg'),
      branchId: branch.id,
      branchName: str(branch, 'name'),
      branchCode: str(branch, 'code'),
      branchStatus: str(branch, 'status'),
      status: 'ACTIVE',
      isPrimary: primary || branches.length === 0,
      assignedAt: new Date().toISOString(),
      removedAt: null,
    });
  }
  return save(ctx.db, 'employees', asDoc(employee.id, { ...employee, branches }));
}

async function makePrimary(ctx: Ctx): Promise<Doc> {
  const employee = await requireOne(ctx.db, 'employees', ctx.id);
  const branchId = str(ctx.body, 'branchId');
  const branches = asList<Payload>(employee['branches']).map((item) => ({ ...item, isPrimary: str(item, 'branchId') === branchId }));
  return save(ctx.db, 'employees', asDoc(employee.id, { ...employee, branches }));
}

async function removeEmployeeBranch(ctx: Ctx): Promise<Doc> {
  const employee = await requireOne(ctx.db, 'employees', ctx.id);
  const branches = asList<Payload>(employee['branches']).map((item) =>
    str(item, 'branchId') === ctx.extra ? { ...item, status: 'REMOVED', isPrimary: false, removedAt: new Date().toISOString() } : item,
  );
  if (!branches.some((item) => item['isPrimary'] === true && item['status'] === 'ACTIVE')) {
    const next = branches.find((item) => item['status'] === 'ACTIVE');
    if (next) next['isPrimary'] = true;
  }
  return save(ctx.db, 'employees', asDoc(employee.id, { ...employee, branches }));
}

async function catalogs(ctx: Ctx, collection: string) {
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await all(ctx.db, collection));
  if (ctx.method === 'POST' && !ctx.action) {
    const name = str(ctx.body, 'name');
    if (!name) fail(400, 'validation', 'Name is required.');
    return dataOf(await save(ctx.db, collection, asDoc(uid('cat'), { name, status: 'ACTIVE' })));
  }
  if (ctx.method === 'PATCH' && ctx.action) {
    const current = await requireOne(ctx.db, collection, ctx.action);
    return dataOf(await save(ctx.db, collection, asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  return undefined;
}

async function roles(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') return pageOf((await all(ctx.db, 'roles')).filter((row) => matches(row, ctx.query, ['name'])), ctx.query);
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeRole(ctx, uid('role'), false));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'roles', ctx.id));
  if (ctx.method === 'PUT') return dataOf(await writeRole(ctx, ctx.id, true));
  if (ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'roles', ctx.id);
    if (current['isOwner'] === true) fail(409, 'owner_role', 'The owner role stays active.');
    return dataOf(await save(ctx.db, 'roles', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  if (ctx.action === 'duplicate') {
    const current = await requireOne(ctx.db, 'roles', ctx.id);
    return dataOf(await save(ctx.db, 'roles', asDoc(uid('role'), { ...current, name: str(ctx.body, 'name') || `${str(current, 'name')} copy`, isOwner: false })));
  }
  return undefined;
}

async function writeRole(ctx: Ctx, id: string, existingOnly: boolean): Promise<Doc> {
  const existing = await one(ctx.db, 'roles', id);
  if (existingOnly && !existing) fail(404, 'not_found', 'That role is not in the local database.');
  const name = str(ctx.body, 'name') || str(existing, 'name');
  if (!name) fail(400, 'validation', 'Role name is required.');
  return save(ctx.db, 'roles', asDoc(id, {
    name,
    description: str(ctx.body, 'description'),
    permissions: asList<string>(ctx.body['permissions'] ?? existing?.['permissions']),
    status: str(existing, 'status') || 'ACTIVE',
    isOwner: existing?.['isOwner'] === true,
    createdAt: existing?.['createdAt'],
  }));
}

async function users(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') {
    const rows = await Promise.all((await all(ctx.db, 'users')).filter((row) => matches(row, ctx.query, ['fullName', 'email', 'phone'])).map((row) => presentUser(ctx.db, row)));
    return pageOf(rows, ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeUser(ctx, uid('user')));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await presentUser(ctx.db, await requireOne(ctx.db, 'users', ctx.id)));
  if (ctx.method === 'PUT' && !ctx.action) return dataOf(await writeUser(ctx, ctx.id));
  if (ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'users', ctx.id);
    return dataOf(await presentUser(ctx.db, await save(ctx.db, 'users', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' }))));
  }
  if (ctx.action === 'reset-password') {
    await resetUserPassword(ctx.db, ctx.id, str(ctx.body, 'password'));
    return { ok: true };
  }
  if (ctx.action === 'sessions') {
    const sessions = await ctx.db.records.where('collection').equals('sessions').toArray();
    await Promise.all(sessions.filter((row) => str(row.data, 'userId') === ctx.id).map((row) => remove(ctx.db, 'sessions', row.id)));
    return { ok: true };
  }
  if (ctx.action === 'employee') {
    const current = await requireOne(ctx.db, 'users', ctx.id);
    const employeeId = str(ctx.body, 'employeeId') || null;
    const employee = employeeId ? await one(ctx.db, 'employees', employeeId) : undefined;
    if (employee) await save(ctx.db, 'employees', asDoc(employee.id, { ...employee, userId: current.id, user: { id: current.id, fullName: str(current, 'fullName'), email: str(current, 'email'), status: str(current, 'status') } }));
    return dataOf(await presentUser(ctx.db, await save(ctx.db, 'users', asDoc(current.id, { ...current, employeeId }))));
  }
  if (ctx.action === 'roles') return dataOf(await assignRoles(ctx));
  return undefined;
}

async function writeUser(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'users', id);
  const email = str(ctx.body, 'email') || str(existing, 'email');
  const fullName = str(ctx.body, 'fullName') || str(existing, 'fullName');
  if (!email || !fullName) fail(400, 'validation', 'Name and email are required.');
  const users = await all(ctx.db, 'users');
  if (users.some((user) => user.id !== id && str(user, 'email').toLowerCase() === email.toLowerCase())) {
    fail(409, 'duplicate_email', 'Another user already uses that email.');
  }
  const password = str(ctx.body, 'password');
  if (!existing && password.length < 8) fail(400, 'weak_password', 'Use at least 8 characters.');
  let secret = existing;
  if (password) {
    const { hashPassword } = await import('./local-crypto');
    const hashed = await hashPassword(password);
    secret = asDoc(id, { ...(existing ?? {}), passwordHash: hashed.hash, passwordSalt: hashed.salt, passwordIterations: hashed.iterations });
  }
  return presentUser(ctx.db, await save(ctx.db, 'users', asDoc(id, {
    ...(secret ?? {}),
    fullName,
    email,
    phone: str(ctx.body, 'phone') || str(existing, 'phone'),
    userType: 'TENANT_USER',
    tenantId: str(existing, 'tenantId') || 'tenant-nile',
    status: str(existing, 'status') || 'ACTIVE',
    isEmailVerified: true,
    lastLoginAt: existing?.['lastLoginAt'] ?? null,
    isOwner: existing?.['isOwner'] === true,
    branchScope: str(existing, 'branchScope') || 'SELECTED',
    permissions: existing?.['permissions'] ?? [],
    roleIds: existing?.['roleIds'] ?? [],
    employeeId: existing?.['employeeId'] ?? null,
  })));
}

async function assignRoles(ctx: Ctx) {
  const current = await requireOne(ctx.db, 'users', ctx.id);
  const assignments = asList<Payload>(ctx.body['assignments']);
  const roles = await all(ctx.db, 'roles');
  const roleIds = assignments.map((item) => str(item, 'roleId')).filter(Boolean);
  const selected = roles.filter((role) => roleIds.includes(role.id));
  const permissions = [...new Set(selected.flatMap((role) => asList<string>(role['permissions'])))];
  const owner = selected.some((role) => role['isOwner'] === true) || current['isOwner'] === true;
  const scope = assignments.some((item) => str(item, 'branchScope') === 'ALL') || owner ? 'ALL' : 'SELECTED';
  const saved = await save(ctx.db, 'users', asDoc(current.id, { ...current, roleIds, permissions, isOwner: owner, branchScope: scope }));
  return (await presentUser(ctx.db, saved))['roles'];
}

async function presentUser(db: NileDatabase, user: Doc) {
  const roles = await all(db, 'roles');
  const roleIds = asList<string>(user['roleIds']);
  const employee = str(user, 'employeeId') ? await one(db, 'employees', str(user, 'employeeId')) : undefined;
  const branchIds = (await all(db, 'branches')).map((branch) => branch.id);
  return {
    id: user.id,
    fullName: str(user, 'fullName'),
    email: str(user, 'email'),
    phone: str(user, 'phone'),
    status: str(user, 'status') || 'ACTIVE',
    isOwner: user['isOwner'] === true,
    employee: employee ? { id: employee.id, fullName: str(employee, 'fullName'), employeeNumber: str(employee, 'employeeNumber') } : null,
    roles: roles.filter((role) => roleIds.includes(role.id)).map((role) => ({
      id: `${user.id}:${role.id}`,
      roleId: role.id,
      roleName: str(role, 'name'),
      roleStatus: str(role, 'status'),
      permissions: asList<string>(role['permissions']),
      branchScope: str(user, 'branchScope') === 'SELECTED' ? 'SELECTED' : 'ALL',
      branchIds: str(user, 'branchScope') === 'SELECTED' ? branchIds : [],
    })),
    lastLoginAt: str(user, 'lastLoginAt') || null,
  };
}

async function commissions(ctx: Ctx) {
  const current = (await one(ctx.db, 'settings', 'commission')) ?? asDoc('commission', { defaultRule: { id: null, kind: 'PERCENTAGE', value: 0 }, services: [] });
  if (ctx.method === 'GET') return dataOf(publicCommission(current));
  if (ctx.id === 'default') {
    const saved = await save(ctx.db, 'settings', asDoc('commission', { ...current, defaultRule: { id: 'default', kind: str(ctx.body, 'kind') || 'PERCENTAGE', value: num(ctx.body, 'value') } }), true);
    return dataOf(publicCommission(saved));
  }
  if (ctx.id === 'services' && !ctx.action) {
    const services = asList<Payload>(current['services']).filter((item) => str(item, 'serviceCode') !== str(ctx.body, 'serviceCode'));
    services.push({ id: uid('com'), serviceCode: str(ctx.body, 'serviceCode'), serviceName: str(ctx.body, 'serviceName'), kind: str(ctx.body, 'kind') || 'PERCENTAGE', value: num(ctx.body, 'value'), disabled: false });
    return dataOf(publicCommission(await save(ctx.db, 'settings', asDoc('commission', { ...current, services }), true)));
  }
  if (ctx.id === 'services' && ctx.extra === 'status') {
    const services = asList<Payload>(current['services']).map((item) => (str(item, 'id') === ctx.action ? { ...item, disabled: true } : item));
    return dataOf(publicCommission(await save(ctx.db, 'settings', asDoc('commission', { ...current, services }), true)));
  }
  return undefined;
}

function publicCommission(row: Doc) {
  return {
    defaultRule: row['defaultRule'],
    services: asList<Payload>(row['services']).filter((item) => item['disabled'] !== true),
  };
}

async function saveEmployeeCommission(ctx: Ctx) {
  const employee = await requireOne(ctx.db, 'employees', ctx.id);
  const rules = asList<Payload>(employee['commissionRules']).filter((item) => str(item, 'serviceCode') !== str(ctx.body, 'serviceCode'));
  rules.push({ id: uid('com'), serviceCode: str(ctx.body, 'serviceCode'), kind: str(ctx.body, 'kind') || 'PERCENTAGE', value: num(ctx.body, 'value') });
  const saved = await save(ctx.db, 'employees', asDoc(employee.id, { ...employee, commissionRules: rules }));
  return saved['commissionRules'];
}

async function namedCatalog(ctx: Ctx, collection: string) {
  if (!ctx.id && ctx.method === 'GET') return dataOf(await all(ctx.db, collection));
  if (!ctx.id && ctx.method === 'POST') return dataOf(await save(ctx.db, collection, asDoc(uid('cat'), { name: ctx.body['name'], status: str(ctx.body, 'status') || 'ACTIVE' })));
  if (ctx.method === 'PUT') {
    const current = await requireOne(ctx.db, collection, ctx.id);
    return dataOf(await save(ctx.db, collection, asDoc(current.id, { ...current, name: ctx.body['name'] ?? current['name'], status: str(ctx.body, 'status') || str(current, 'status') })));
  }
  return undefined;
}

async function services(ctx: Ctx) {
  if (ctx.id === 'settings') {
    const current = (await one(ctx.db, 'settings', 'serviceSettings')) ?? asDoc('serviceSettings', { maxCommissionPercent: 100 });
    if (ctx.method === 'PUT') {
      return dataOf(await save(ctx.db, 'settings', asDoc('serviceSettings', { maxCommissionPercent: num(ctx.body, 'maxCommissionPercent') }), true));
    }
    return dataOf({ maxCommissionPercent: num(current, 'maxCommissionPercent') || 100 });
  }
  if (ctx.id === 'image') return dataOf({ image: '' });
  if (!ctx.id && ctx.method === 'GET') {
    const status = str(ctx.query, 'status');
    const rows = (await all(ctx.db, 'services')).filter((row) => matches(row, ctx.query, ['name']) && (!status || str(row, 'status') === status));
    return pageOf(rows, ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeService(ctx, uid('svc')));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'services', ctx.id));
  if (ctx.method === 'PUT') return dataOf(await writeService(ctx, ctx.id));
  if (ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'services', ctx.id);
    return dataOf(await save(ctx.db, 'services', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  return undefined;
}

async function writeService(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'services', id);
  const category = await one(ctx.db, 'serviceCategories', str(ctx.body, 'categoryId'));
  const commissionValue = num(ctx.body, 'commissionValue');
  if (commissionValue < 0) fail(400, 'validation', 'Commission cannot be negative.');
  if (num(ctx.body, 'price') < 0) fail(400, 'validation', 'Price cannot be negative.');
  return save(ctx.db, 'services', asDoc(id, {
    name: ctx.body['name'] ?? existing?.['name'] ?? { en: '', ar: '' },
    description: ctx.body['description'] ?? existing?.['description'] ?? { en: '', ar: '' },
    categoryId: str(ctx.body, 'categoryId'),
    categoryName: category?.['name'] ?? existing?.['categoryName'] ?? { en: '', ar: '' },
    image: str(ctx.body, 'image'),
    price: num(ctx.body, 'price'),
    commissionType: str(ctx.body, 'commissionType') || 'PERCENTAGE',
    commissionValue,
    status: str(existing, 'status') || 'ACTIVE',
    createdAt: existing?.['createdAt'],
  }));
}

async function customers(ctx: Ctx) {
  if (ctx.id === 'settings') {
    const current = (await one(ctx.db, 'settings', 'customerSettings')) ?? asDoc('customerSettings', { uniquePhone: true });
    if (ctx.method === 'PUT') return dataOf(await save(ctx.db, 'settings', asDoc('customerSettings', { uniquePhone: ctx.body['uniquePhone'] !== false }), true));
    return dataOf({ uniquePhone: current['uniquePhone'] !== false });
  }
  if (!ctx.id && ctx.method === 'GET') {
    const status = str(ctx.query, 'status');
    const rows = (await all(ctx.db, 'customers')).filter(
      (row) => matches(row, ctx.query, ['fullName', 'phone', 'customerNumber']) && (!status || str(row, 'status') === status),
    );
    return pageOf(rows, ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeCustomer(ctx, uid('cus')));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'customers', ctx.id));
  if (ctx.method === 'PUT' && !ctx.action) return dataOf(await writeCustomer(ctx, ctx.id));
  if (ctx.action === 'status' && !ctx.extra) {
    const current = await requireOne(ctx.db, 'customers', ctx.id);
    return dataOf(await save(ctx.db, 'customers', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  if (ctx.action === 'stats') return dataOf(await customerStats(ctx.db, ctx.id));
  if (ctx.action === 'visits') return historyPage(await customerVisits(ctx.db, ctx.id), 'appointments');
  if (ctx.action === 'service-history') return historyPage(await customerServices(ctx.db, ctx.id), 'appointments');
  if (ctx.action === 'payments') return historyPage(await customerPayments(ctx.db, ctx.id), 'transactions');
  if (ctx.action === 'notes' && ctx.method === 'GET') return dataOf((await all(ctx.db, 'customerNotes')).filter((note) => str(note, 'customerId') === ctx.id));
  if (ctx.action === 'notes' && ctx.method === 'POST') {
    const actor = await actorName(ctx.db, ctx.userId);
    return dataOf(await save(ctx.db, 'customerNotes', asDoc(uid('note'), { customerId: ctx.id, content: str(ctx.body, 'content'), createdByName: actor })));
  }
  if (ctx.action === 'packages' && ctx.method === 'GET') return dataOf((await all(ctx.db, 'customerPackages')).filter((row) => str(row, 'customerId') === ctx.id));
  if (ctx.action === 'packages' && ctx.method === 'POST') return dataOf(await assignPackage(ctx));
  return undefined;
}

async function writeCustomer(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'customers', id);
  const fullName = str(ctx.body, 'fullName') || str(existing, 'fullName');
  const phone = str(ctx.body, 'phone') || str(existing, 'phone');
  if (!fullName) fail(400, 'validation', 'Customer name is required.');
  const settings = await one(ctx.db, 'settings', 'customerSettings');
  if (settings?.['uniquePhone'] !== false && phone) {
    const duplicate = (await all(ctx.db, 'customers')).find((row) => row.id !== id && str(row, 'phone') === phone);
    if (duplicate) fail(409, 'duplicate_phone', 'Another customer already uses that phone number.');
  }
  return save(ctx.db, 'customers', asDoc(id, {
    customerNumber: str(existing, 'customerNumber') || (await nextNumber(ctx.db, 'customer', 'CUS')),
    fullName,
    phone,
    email: str(ctx.body, 'email'),
    dateOfBirth: str(ctx.body, 'dateOfBirth'),
    gender: str(ctx.body, 'gender'),
    address: str(ctx.body, 'address'),
    notes: str(ctx.body, 'notes'),
    promotionalOptIn: ctx.body['promotionalOptIn'] === true,
    whatsappOptOut: ctx.body['whatsappOptOut'] === true,
    status: str(existing, 'status') || 'ACTIVE',
    createdAt: existing?.['createdAt'],
  }));
}

async function packages(ctx: Ctx) {
  if (ctx.id === 'image') return dataOf({ image: '' });
  if (!ctx.id && ctx.method === 'GET') return pageOf((await all(ctx.db, 'packages')).filter((row) => matches(row, ctx.query, ['name'])), ctx.query);
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writePackage(ctx, uid('pkg')));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'packages', ctx.id));
  if (ctx.method === 'PUT') return dataOf(await writePackage(ctx, ctx.id));
  if (ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'packages', ctx.id);
    return dataOf(await save(ctx.db, 'packages', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'ACTIVE' })));
  }
  return undefined;
}

async function writePackage(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'packages', id);
  const services = await all(ctx.db, 'services');
  const items = asList<Payload>(ctx.body['items']).map((item) => {
    const service = services.find((row) => row.id === str(item, 'serviceId'));
    return {
      serviceId: str(item, 'serviceId'),
      serviceName: service?.['name'] ?? { en: str(item, 'serviceId'), ar: '' },
      quantity: num(item, 'quantity') || 1,
      unitPrice: service ? num(service, 'price') : 0,
    };
  });
  if (items.length === 0) fail(400, 'validation', 'Add at least one service to the package.');
  return save(ctx.db, 'packages', asDoc(id, {
    name: ctx.body['name'] ?? existing?.['name'],
    description: ctx.body['description'] ?? existing?.['description'] ?? { en: '', ar: '' },
    image: str(ctx.body, 'image'),
    items,
    price: num(ctx.body, 'price'),
    validityType: str(ctx.body, 'validityType') || 'NO_EXPIRY',
    validityDays: ctx.body['validityDays'] ?? null,
    fixedExpiryDate: str(ctx.body, 'fixedExpiryDate'),
    status: str(existing, 'status') || 'ACTIVE',
    createdAt: existing?.['createdAt'],
  }));
}

async function assignPackage(ctx: Ctx): Promise<Doc> {
  const template = await requireOne(ctx.db, 'packages', str(ctx.body, 'packageTemplateId'));
  const purchasedAt = new Date().toISOString();
  let expiresAt: string | null = null;
  if (str(template, 'validityType') === 'VALIDITY_DAYS' && num(template, 'validityDays') > 0) {
    expiresAt = new Date(Date.now() + num(template, 'validityDays') * 86400000).toISOString();
  }
  if (str(template, 'validityType') === 'FIXED_EXPIRY' && str(template, 'fixedExpiryDate')) expiresAt = str(template, 'fixedExpiryDate');
  return save(ctx.db, 'customerPackages', asDoc(uid('cpkg'), {
    customerId: ctx.id,
    packageTemplateId: template.id,
    name: template['name'],
    purchasedAt,
    expiresAt,
    purchasePrice: num(template, 'price'),
    status: 'ACTIVE',
    items: asList<Payload>(template['items']).map((item) => ({
      serviceId: str(item, 'serviceId'),
      serviceName: item['serviceName'],
      purchasedQuantity: num(item, 'quantity'),
      usedQuantity: 0,
      remainingQuantity: num(item, 'quantity'),
    })),
  }));
}

function historyPage(rows: unknown[], source: string) {
  return { data: rows, meta: { page: 1, pageSize: rows.length || 20, total: rows.length }, source };
}

async function customerStats(db: NileDatabase, customerId: string) {
  const sales = (await all(db, 'sales')).filter((sale) => str(sale, 'customerId') === customerId);
  const visits = (await all(db, 'appointments')).filter((row) => str(row, 'customerId') === customerId && str(row, 'status') === 'COMPLETED');
  const spent = sales.reduce((sum, sale) => sum + num(sale, 'totalAmount'), 0);
  const paid = sales.reduce((sum, sale) => sum + num(sale, 'paidAmount'), 0);
  const refunds = sales.reduce((sum, sale) => sum + num(sale, 'refundedAmount'), 0);
  return {
    totalVisits: visits.length,
    totalSpending: roundMoney(spent),
    totalPaid: roundMoney(paid),
    totalRefunds: roundMoney(refunds),
    netSpending: roundMoney(spent - refunds),
    totalTransactions: sales.length,
    lastPaidTransaction: sales.map((sale) => str(sale, 'createdAt')).sort().at(-1) ?? null,
    outstandingAmount: roundMoney(sales.reduce((sum, sale) => sum + num(sale, 'amountDue'), 0)),
    lastVisit: visits.map((row) => str(row, 'completedAt')).sort().at(-1) ?? null,
    firstVisit: visits.map((row) => str(row, 'completedAt')).sort()[0] ?? null,
    mostUsedServices: [],
    activePackages: (await all(db, 'customerPackages')).filter((row) => str(row, 'customerId') === customerId && str(row, 'status') === 'ACTIVE').length,
  };
}

async function customerVisits(db: NileDatabase, customerId: string) {
  return (await all(db, 'appointments')).filter((row) => str(row, 'customerId') === customerId);
}

async function customerServices(db: NileDatabase, customerId: string) {
  return (await customerVisits(db, customerId)).flatMap((row) => asList<Payload>(row['services']).map((service) => ({ ...service, appointmentId: row.id, at: str(row, 'scheduledAt') })));
}

async function customerPayments(db: NileDatabase, customerId: string) {
  return (await all(db, 'sales')).filter((sale) => str(sale, 'customerId') === customerId).flatMap((sale) => asList<Payload>(sale['payments']).map((payment) => ({ ...payment, transactionId: sale.id, transactionNumber: str(sale, 'transactionNumber') })));
}

async function appointments(ctx: Ctx) {
  if (ctx.id === 'barbers') {
    const employees = (await all(ctx.db, 'employees')).filter((row) => str(row, 'status') === 'ACTIVE' && str(row, 'jobTitleName') !== 'Cashier');
    const branchId = ctx.query['branchId'] ?? '';
    return dataOf(employees.filter((row) => !branchId || asList<Payload>(row['branches']).some((item) => str(item, 'branchId') === branchId && str(item, 'status') === 'ACTIVE')).map((row) => ({ id: row.id, fullName: str(row, 'fullName') })));
  }
  if (ctx.id === 'walk-in') return dataOf(await createWalkIn(ctx));
  if (!ctx.id && ctx.method === 'GET') {
    const rows = (await all(ctx.db, 'appointments')).filter((row) => matches(row, ctx.query, ['customerName', 'appointmentNumber', 'barberName']) && within(str(row, 'scheduledAt'), ctx.query['from'] ?? '', ctx.query['to'] ?? '') && (!ctx.query['type'] || str(row, 'type') === ctx.query['type']) && (!ctx.query['barberEmployeeId'] || str(row, 'barberEmployeeId') === ctx.query['barberEmployeeId']));
    return pageOf(rows.sort((a, b) => str(a, 'scheduledAt').localeCompare(str(b, 'scheduledAt'))), ctx.query);
  }
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeAppointment(ctx, uid('apt'), true));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'appointments', ctx.id));
  if (ctx.action === 'history') return dataOf((await all(ctx.db, 'appointmentHistory')).filter((row) => str(row, 'appointmentId') === ctx.id));
  if (ctx.method === 'PUT') return dataOf(await writeAppointment(ctx, ctx.id, false));
  if (ctx.action === 'reschedule') return dataOf(await transition(ctx, 'PENDING', str(ctx.body, 'reason'), { scheduledAt: str(ctx.body, 'scheduledAt') }));
  if (ctx.action === 'confirm') return dataOf(await transition(ctx, 'CONFIRMED', ''));
  if (ctx.action === 'check-in') return dataOf(await transition(ctx, 'CHECKED_IN', '', { checkedInAt: new Date().toISOString() }));
  if (ctx.action === 'queue') return dataOf(await enqueueAppointment(ctx));
  if (ctx.action === 'start') return dataOf(await transition(ctx, 'IN_SERVICE', '', { startedAt: new Date().toISOString() }));
  if (ctx.action === 'complete') return dataOf(await transition(ctx, 'COMPLETED', '', { completedAt: new Date().toISOString() }));
  if (ctx.action === 'cancel') return dataOf(await transition(ctx, 'CANCELLED', str(ctx.body, 'reason'), { cancelledAt: new Date().toISOString(), cancellationReason: str(ctx.body, 'reason') }));
  if (ctx.action === 'no-show') return dataOf(await transition(ctx, 'NO_SHOW', str(ctx.body, 'reason')));
  return undefined;
}

async function writeAppointment(ctx: Ctx, id: string, creating: boolean): Promise<Doc> {
  const existing = await one(ctx.db, 'appointments', id);
  const customer = await requireOne(ctx.db, 'customers', str(ctx.body, 'customerId') || str(existing, 'customerId'));
  const barber = await requireOne(ctx.db, 'employees', str(ctx.body, 'barberEmployeeId') || str(existing, 'barberEmployeeId'));
  const lines = await priceServiceLines(ctx.db, asList<{ serviceId: string; quantity: number }>(ctx.body['services'] ?? existing?.['services']));
  if (lines.length === 0) fail(400, 'validation', 'Choose at least one service.');
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = roundMoney(Math.min(Math.max(0, num(ctx.body, 'discount')), subtotal));
  const saved = await save(ctx.db, 'appointments', asDoc(id, {
    appointmentNumber: str(existing, 'appointmentNumber') || (await nextNumber(ctx.db, 'appointment', 'APT')),
    branchId: str(ctx.body, 'branchId') || str(existing, 'branchId'),
    customerId: customer.id,
    customerName: str(customer, 'fullName'),
    barberEmployeeId: barber.id,
    barberName: str(barber, 'fullName'),
    extraBarberIds: asList<string>(ctx.body['extraBarberIds']),
    type: str(existing, 'type') || 'BOOKING',
    scheduledAt: str(ctx.body, 'scheduledAt') || str(existing, 'scheduledAt'),
    services: lines.map(toAppointmentLine),
    subtotal,
    discount,
    total: roundMoney(subtotal - discount),
    status: str(existing, 'status') || 'PENDING',
    notes: str(ctx.body, 'notes'),
    cancellationReason: str(existing, 'cancellationReason'),
    checkedInAt: str(existing, 'checkedInAt'),
    startedAt: str(existing, 'startedAt'),
    completedAt: str(existing, 'completedAt'),
    cancelledAt: str(existing, 'cancelledAt'),
    checkoutStatus: str(existing, 'checkoutStatus') || 'OPEN',
    createdAt: existing?.['createdAt'],
  }));
  if (creating) await addHistory(ctx, saved.id, '', 'PENDING', 'Created');
  return saved;
}

async function transition(ctx: Ctx, status: string, reason: string, extra: Payload = {}): Promise<Doc> {
  const current = await requireOne(ctx.db, 'appointments', ctx.id);
  const saved = await save(ctx.db, 'appointments', asDoc(current.id, { ...current, ...extra, status }));
  await addHistory(ctx, current.id, str(current, 'status'), status, reason);
  if (status === 'IN_SERVICE' || status === 'COMPLETED') {
    const entries = (await all(ctx.db, 'queue')).filter((row) => str(row, 'appointmentId') === current.id);
    for (const entry of entries) {
      await save(ctx.db, 'queue', asDoc(entry.id, { ...entry, status: status === 'IN_SERVICE' ? 'IN_SERVICE' : 'COMPLETED', startedAt: status === 'IN_SERVICE' ? new Date().toISOString() : str(entry, 'startedAt'), completedAt: status === 'COMPLETED' ? new Date().toISOString() : '' }));
    }
  }
  return saved;
}

async function enqueueAppointment(ctx: Ctx): Promise<Doc> {
  const appointment = await transition(ctx, 'WAITING', '');
  await ensureQueueEntry(ctx.db, appointment, []);
  return appointment;
}

async function createWalkIn(ctx: Ctx): Promise<Doc> {
  let customerId = str(ctx.body, 'customerId');
  if (!customerId) {
    const customer = asPayload(ctx.body['customer']);
    const created = await writeCustomer({ ...ctx, body: customer }, uid('cus'));
    customerId = created.id;
  }
  const appointment = await writeAppointment({ ...ctx, body: { ...ctx.body, customerId, scheduledAt: new Date().toISOString(), discount: 0 } }, uid('apt'), true);
  const waiting = await save(ctx.db, 'appointments', asDoc(appointment.id, { ...appointment, type: 'WALK_IN', status: 'WAITING' }));
  await ensureQueueEntry(ctx.db, waiting, asList<Payload>(ctx.body['companions']).map((item) => str(item, 'fullName')).filter(Boolean));
  return waiting;
}

async function ensureQueueEntry(db: NileDatabase, appointment: Doc, companions: string[]) {
  const queueDate = str(appointment, 'scheduledAt').slice(0, 10);
  const existing = (await all(db, 'queue')).filter((row) => str(row, 'branchId') === str(appointment, 'branchId') && str(row, 'queueDate') === queueDate);
  await save(db, 'queue', asDoc(uid('que'), {
    appointmentId: appointment.id,
    appointmentNumber: str(appointment, 'appointmentNumber'),
    customerId: str(appointment, 'customerId'),
    customerName: str(appointment, 'customerName'),
    companions,
    barberEmployeeId: str(appointment, 'barberEmployeeId'),
    barberName: str(appointment, 'barberName'),
    branchId: str(appointment, 'branchId'),
    queueDate,
    position: existing.length + 1,
    status: 'WAITING',
    joinedAt: new Date().toISOString(),
    startedAt: '',
    completedAt: '',
    services: asList<Payload>(appointment['services']).map((service) => ({ serviceName: service['serviceName'], quantity: num(service, 'quantity') })),
  }));
}

async function queue(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') {
    const rows = (await all(ctx.db, 'queue')).filter((row) => (!ctx.query['branchId'] || str(row, 'branchId') === ctx.query['branchId']) && (!ctx.query['queueDate'] || str(row, 'queueDate') === ctx.query['queueDate']) && (!ctx.query['barberEmployeeId'] || str(row, 'barberEmployeeId') === ctx.query['barberEmployeeId']) && (!ctx.query['status'] || str(row, 'status') === ctx.query['status']));
    return dataOf(rows.sort((a, b) => num(a, 'position') - num(b, 'position')));
  }
  if (ctx.id === 'reorder') {
    const ids = asList<string>(ctx.body['entryIds']);
    const rows = await all(ctx.db, 'queue');
    for (let index = 0; index < ids.length; index += 1) {
      const row = rows.find((item) => item.id === ids[index]);
      if (row) await save(ctx.db, 'queue', asDoc(row.id, { ...row, position: index + 1 }));
    }
    return dataOf((await all(ctx.db, 'queue')).filter((row) => ids.includes(row.id)).sort((a, b) => num(a, 'position') - num(b, 'position')));
  }
  if (ctx.action === 'start' || ctx.action === 'complete') {
    const entry = await requireOne(ctx.db, 'queue', ctx.id);
    const appointmentId = str(entry, 'appointmentId');
    const status = ctx.action === 'start' ? 'IN_SERVICE' : 'COMPLETED';
    const appointment = await requireOne(ctx.db, 'appointments', appointmentId);
    const saved = await save(ctx.db, 'appointments', asDoc(appointment.id, { ...appointment, status, startedAt: ctx.action === 'start' ? new Date().toISOString() : str(appointment, 'startedAt'), completedAt: ctx.action === 'complete' ? new Date().toISOString() : str(appointment, 'completedAt') }));
    await save(ctx.db, 'queue', asDoc(entry.id, { ...entry, status: ctx.action === 'start' ? 'IN_SERVICE' : 'COMPLETED', startedAt: str(saved, 'startedAt'), completedAt: str(saved, 'completedAt') }));
    return dataOf(saved);
  }
  return undefined;
}

async function pos(ctx: Ctx) {
  if (ctx.id === 'appointments' && !ctx.action && ctx.method === 'GET') {
    const rows = (await all(ctx.db, 'appointments')).filter((row) => str(row, 'status') === 'COMPLETED' && str(row, 'checkoutStatus') !== 'PAID' && matches(row, ctx.query, ['customerName', 'appointmentNumber']));
    return pageOf(rows.map((row) => ({ id: row.id, appointmentNumber: str(row, 'appointmentNumber'), branchId: str(row, 'branchId'), customerId: str(row, 'customerId'), customerName: str(row, 'customerName'), customerPhone: '', total: num(row, 'total'), discount: num(row, 'discount'), completedAt: str(row, 'completedAt'), checkoutStatus: str(row, 'checkoutStatus') || 'OPEN' })), ctx.query);
  }
  if (ctx.id === 'appointments' && ctx.action && ctx.method === 'GET') return dataOf(await checkoutContext(ctx.db, ctx.action));
  if (ctx.id === 'orders') return dataOf(await createOrder(ctx));
  if (ctx.id === 'checkout') return dataOf(await checkout(ctx));
  return undefined;
}

async function createOrder(ctx: Ctx): Promise<Doc> {
  const existing = (await all(ctx.db, 'sales')).find((sale) => str(sale, 'idempotencyKey') === str(ctx.body, 'idempotencyKey'));
  if (existing) return existing;
  const rawServices = asList<Payload>(ctx.body['services']).map((line) => ({
    serviceId: str(line, 'serviceId'),
    quantity: num(line, 'quantity') || 1,
    barberEmployeeId: str(line, 'barberEmployeeId') || str(ctx.body, 'barberEmployeeId'),
  }));
  const lines = await priceServiceLines(ctx.db, rawServices);
  if (lines.length === 0) fail(400, 'validation', 'Choose at least one service.');
  const customer = await findOrCreateCustomer(ctx, str(asPayload(ctx.body['customer']), 'fullName'), str(asPayload(ctx.body['customer']), 'phone'));
  const employees = await all(ctx.db, 'employees');
  const primaryBarberId = lines[0]?.barberEmployeeId || str(ctx.body, 'barberEmployeeId');
  const barberNames = [...new Set(lines.map((line) => {
    const employee = employees.find((row) => row.id === line.barberEmployeeId);
    return employee ? str(employee, 'fullName') : '';
  }).filter(Boolean))];
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const totals = saleTotals(subtotal, 0, num(ctx.body, 'additionalDiscount'), paymentSum(ctx.body));
  const sale = await persistSale(ctx, {
    branchId: str(ctx.body, 'branchId'),
    appointmentId: '',
    customerId: customer.id,
    customerName: str(customer, 'fullName'),
    customerPhone: str(customer, 'phone'),
    barberEmployeeId: primaryBarberId,
    barberName: barberNames.join('، '),
    items: lines.map((line) => {
      const employee = employees.find((row) => row.id === line.barberEmployeeId);
      return {
        itemType: 'SERVICE',
        serviceId: line.serviceId,
        productId: null,
        sku: '',
        serviceName: line.serviceName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: 0,
        lineTotal: line.lineTotal,
        barberEmployeeId: line.barberEmployeeId,
        barberName: employee ? str(employee, 'fullName') : '',
      };
    }),
    subtotal,
    totals,
    payments: asList<Payload>(ctx.body['payments']),
    tips: [],
    idempotencyKey: str(ctx.body, 'idempotencyKey'),
  }, lines.map((line) => ({ ...line, employeeId: line.barberEmployeeId })));
  return sale;
}

async function checkout(ctx: Ctx): Promise<Doc> {
  const existing = (await all(ctx.db, 'sales')).find((sale) => str(sale, 'idempotencyKey') === str(ctx.body, 'idempotencyKey'));
  if (existing) return existing;
  const appointment = await requireOne(ctx.db, 'appointments', str(ctx.body, 'appointmentId'));
  if (str(appointment, 'checkoutStatus') === 'PAID') fail(409, 'already_paid', 'This appointment is already paid.');
  const redemptions = asList<Payload>(ctx.body['redemptions']);
  const serviceLines = asList<Payload>(appointment['services']).map((line) => {
    const redeemed = redemptions.filter((item) => str(item, 'serviceId') === str(line, 'serviceId')).reduce((sum, item) => sum + num(item, 'quantity'), 0);
    const quantity = num(line, 'quantity');
    const chargeable = Math.max(0, quantity - redeemed);
    return {
      serviceId: str(line, 'serviceId'),
      serviceName: nameOf(line['serviceName']),
      quantity,
      unitPrice: num(line, 'unitPrice'),
      lineTotal: roundMoney(num(line, 'unitPrice') * chargeable),
      packageDiscount: roundMoney(num(line, 'unitPrice') * Math.min(redeemed, quantity)),
      commissionType: str(line, 'commissionType') || 'PERCENTAGE',
      commissionValue: num(line, 'commissionValue'),
      employeeId: str(appointment, 'barberEmployeeId'),
    };
  });
  const productLines = [];
  for (const item of asList<Payload>(ctx.body['products'])) {
    const product = await requireOne(ctx.db, 'products', str(item, 'productId'));
    const quantity = num(item, 'quantity') || 1;
    productLines.push({ product, quantity, lineTotal: roundMoney(num(product, 'sellingPrice') * quantity) });
  }
  const subtotal = roundMoney(serviceLines.reduce((sum, line) => sum + line.lineTotal + line.packageDiscount, 0) + productLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const packageDiscount = roundMoney(serviceLines.reduce((sum, line) => sum + line.packageDiscount, 0));
  const totals = saleTotals(subtotal, packageDiscount, num(ctx.body, 'additionalDiscount'), paymentSum(ctx.body));
  await applyRedemptions(ctx.db, redemptions);
  for (const line of productLines) await changeStock(ctx.db, str(appointment, 'branchId'), line.product.id, -line.quantity, num(line.product, 'costPrice'), 'SALE', '', 'Checkout');
  const sale = await persistSale(ctx, {
    branchId: str(appointment, 'branchId'),
    appointmentId: appointment.id,
    customerId: str(appointment, 'customerId'),
    customerName: str(appointment, 'customerName'),
    customerPhone: '',
    barberEmployeeId: str(appointment, 'barberEmployeeId'),
    barberName: str(appointment, 'barberName'),
    items: [
      ...serviceLines.map((line) => ({ itemType: 'SERVICE', serviceId: line.serviceId, productId: null, sku: '', serviceName: line.serviceName, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.packageDiscount, lineTotal: line.lineTotal })),
      ...productLines.map((line) => ({ itemType: 'PRODUCT', serviceId: null, productId: line.product.id, sku: str(line.product, 'sku'), serviceName: nameOf(line.product['name']), quantity: line.quantity, unitPrice: num(line.product, 'sellingPrice'), discount: 0, lineTotal: line.lineTotal })),
    ],
    subtotal,
    totals,
    payments: asList<Payload>(ctx.body['payments']),
    tips: asList<Payload>(ctx.body['tips']),
    idempotencyKey: str(ctx.body, 'idempotencyKey'),
  }, serviceLines);
  await save(ctx.db, 'appointments', asDoc(appointment.id, { ...appointment, checkoutStatus: totals.status === 'UNPAID' ? 'OPEN' : 'PAID' }));
  return sale;
}

async function persistSale(ctx: Ctx, input: {
  branchId: string;
  appointmentId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  barberEmployeeId: string;
  barberName: string;
  items: unknown[];
  subtotal: number;
  totals: ReturnType<typeof saleTotals>;
  payments: Payload[];
  tips: Payload[];
  idempotencyKey: string;
}, commissionLines: Array<{ serviceId: string; lineTotal: number; quantity: number; commissionType: string; commissionValue: number; employeeId: string }>): Promise<Doc> {
  const now = new Date().toISOString();
  const id = uid('sale');
  const employees = await all(ctx.db, 'employees');
  const config = await one(ctx.db, 'settings', 'commission');
  const defaultRule = asPayload(config?.['defaultRule']);
  const serviceRules = asList<Payload>(config?.['services']);
  const commissions = commissionLines.map((line) => {
    const employee = employees.find((item) => item.id === line.employeeId);
    const employeeRule = asList<Payload>(employee?.['commissionRules']).find((rule) => str(rule, 'serviceCode') === line.serviceId);
    const serviceRule = serviceRules.find((rule) => str(rule, 'serviceCode') === line.serviceId);
    const kind = str(employeeRule, 'kind') || str(serviceRule, 'kind') || line.commissionType || str(defaultRule, 'kind') || 'PERCENTAGE';
    const value = employeeRule ? num(employeeRule, 'value') : serviceRule ? num(serviceRule, 'value') : line.commissionValue || num(defaultRule, 'value');
    return { employeeId: line.employeeId, serviceId: line.serviceId, commissionType: kind, commissionRate: value, commissionAmount: commissionAmount(kind, value, line.lineTotal, line.quantity), source: employeeRule ? 'EMPLOYEE' : serviceRule ? 'SERVICE' : 'DEFAULT' };
  });
  const tips = [];
  for (const tip of input.tips) {
    const employee = employees.find((item) => item.id === str(tip, 'employeeId'));
    tips.push({ id: uid('tip'), employeeId: str(tip, 'employeeId'), employeeName: employee ? str(employee, 'fullName') : '', amount: num(tip, 'amount'), method: str(tip, 'method') });
  }
  return save(ctx.db, 'sales', asDoc(id, {
    transactionNumber: await nextNumber(ctx.db, 'sale', 'TX'),
    branchId: input.branchId,
    appointmentId: input.appointmentId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    cashierName: await actorName(ctx.db, ctx.userId),
    barberEmployeeId: input.barberEmployeeId,
    barberName: input.barberName,
    items: input.items,
    subtotal: input.subtotal,
    packageDiscount: input.totals.packageDiscount,
    manualDiscount: input.totals.manualDiscount,
    totalDiscount: input.totals.totalDiscount,
    totalAmount: input.totals.totalAmount,
    paidAmount: input.totals.paidAmount,
    refundedAmount: 0,
    amountDue: input.totals.amountDue,
    status: input.totals.status,
    tipTotal: roundMoney(tips.reduce((sum, tip) => sum + num(tip, 'amount'), 0)),
    createdAt: now,
    payments: input.payments.map((payment, index) => ({ id: `${id}-pay-${index + 1}`, method: str(payment, 'method'), amount: num(payment, 'amount'), refundedAmount: 0, referenceNumber: str(payment, 'referenceNumber'), status: 'CAPTURED', receivedAt: now })),
    refunds: [],
    tips,
    commissions,
    idempotencyKey: input.idempotencyKey,
  }));
}

async function transactions(ctx: Ctx) {
  if (!ctx.id) {
    const rows = (await all(ctx.db, 'sales')).filter((row) => matches(row, ctx.query, ['transactionNumber', 'customerName'])).sort((a, b) => str(b, 'createdAt').localeCompare(str(a, 'createdAt')));
    return pageOf(rows.map((row) => ({ id: row.id, transactionNumber: str(row, 'transactionNumber'), customerName: str(row, 'customerName'), totalAmount: num(row, 'totalAmount'), paidAmount: num(row, 'paidAmount'), refundedAmount: num(row, 'refundedAmount'), status: str(row, 'status'), createdAt: str(row, 'createdAt') })), ctx.query);
  }
  return dataOf(await requireOne(ctx.db, 'sales', ctx.id));
}

async function refunds(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') {
    const rows = (await all(ctx.db, 'refunds')).filter((row) => !ctx.query['branchId'] || str(row, 'branchId') === ctx.query['branchId']);
    return dataOf(rows);
  }
  if (!ctx.id && ctx.method === 'POST') {
    const sale = await requireOne(ctx.db, 'sales', str(ctx.body, 'transactionId'));
    const payments = asList<Payload>(sale['payments']);
    const payment = payments.find((item) => str(item, 'id') === str(ctx.body, 'paymentId'));
    if (!payment) fail(404, 'not_found', 'That payment is not on the sale.');
    const amount = num(ctx.body, 'amount');
    const remaining = roundMoney(num(payment, 'amount') - num(payment, 'refundedAmount'));
    if (amount <= 0 || amount > remaining) fail(400, 'validation', 'Refund amount must be within the remaining payment.');
    const refund = await save(ctx.db, 'refunds', asDoc(uid('refund'), { transactionId: sale.id, branchId: str(sale, 'branchId'), paymentId: str(payment, 'id'), amount, reason: str(ctx.body, 'reason'), method: str(ctx.body, 'method'), referenceNumber: str(ctx.body, 'referenceNumber'), restock: ctx.body['restock'] === true, status: 'PENDING', createdAt: new Date().toISOString() }));
    return dataOf({ id: refund.id, status: 'PENDING', amount });
  }
  if (ctx.action === 'approve') {
    const refund = await requireOne(ctx.db, 'refunds', ctx.id);
    if (str(refund, 'status') === 'APPROVED') return dataOf({ id: refund.id, status: 'APPROVED', amount: num(refund, 'amount') });
    const sale = await requireOne(ctx.db, 'sales', str(refund, 'transactionId'));
    const payments = asList<Payload>(sale['payments']).map((payment) => payment['id'] === refund['paymentId'] ? { ...payment, refundedAmount: roundMoney(num(payment, 'refundedAmount') + num(refund, 'amount')) } : payment);
    const refunds = [...asList<Payload>(sale['refunds']), { ...refund, status: 'APPROVED', processedAt: new Date().toISOString() }];
    const refundedAmount = roundMoney(num(sale, 'refundedAmount') + num(refund, 'amount'));
    await save(ctx.db, 'sales', asDoc(sale.id, { ...sale, payments, refunds, refundedAmount, status: refundedAmount >= num(sale, 'totalAmount') ? 'REFUNDED' : 'PARTIAL_REFUND' }));
    if (refund['restock'] === true) {
      for (const item of asList<Payload>(sale['items']).filter((row) => str(row, 'itemType') === 'PRODUCT')) {
        await changeStock(ctx.db, str(sale, 'branchId'), str(item, 'productId'), num(item, 'quantity'), 0, 'RETURN', sale.id, 'Refund restock');
      }
    }
    const saved = await save(ctx.db, 'refunds', asDoc(refund.id, { ...refund, status: 'APPROVED', processedAt: new Date().toISOString() }));
    return dataOf({ id: saved.id, status: 'APPROVED', amount: num(saved, 'amount') });
  }
  return undefined;
}

async function shifts(ctx: Ctx) {
  if (ctx.id === 'current') {
    const open = (await all(ctx.db, 'shifts')).find((row) => str(row, 'branchId') === (ctx.query['branchId'] ?? '') && str(row, 'status') === 'OPEN');
    return dataOf(open ? await withCash(ctx.db, open) : null);
  }
  if (!ctx.id && ctx.method === 'GET') return pageOf(await Promise.all((await all(ctx.db, 'shifts')).filter((row) => str(row, 'branchId') === (ctx.query['branchId'] ?? '')).map((row) => withCash(ctx.db, row))), ctx.query);
  if (!ctx.id && ctx.method === 'POST') {
    const branchId = str(ctx.body, 'branchId');
    if ((await all(ctx.db, 'shifts')).some((row) => str(row, 'branchId') === branchId && str(row, 'status') === 'OPEN')) {
      fail(409, 'shift_open', 'Close the open shift before opening another.');
    }
    return dataOf(await save(ctx.db, 'shifts', asDoc(uid('shift'), { branchId, shiftType: str(ctx.body, 'shiftType') || 'REGULAR', openingBalance: num(ctx.body, 'openingBalance'), openedAt: new Date().toISOString(), closedAt: '', cashSales: 0, cashTips: 0, cashRefunds: 0, expectedCash: null, actualCash: null, difference: null, status: 'OPEN' })));
  }
  if (ctx.action === 'close') {
    const current = await withCash(ctx.db, await requireOne(ctx.db, 'shifts', ctx.id));
    const actualCash = num(ctx.body, 'actualCash');
    const expected = num(current, 'expectedCash');
    return dataOf(await save(ctx.db, 'shifts', asDoc(current.id, { ...current, actualCash, expectedCash: expected, difference: roundMoney(actualCash - expected), closedAt: new Date().toISOString(), status: 'CLOSED' })));
  }
  return undefined;
}

async function withCash(db: NileDatabase, shift: Doc): Promise<Doc> {
  const sales = (await all(db, 'sales')).filter((sale) => str(sale, 'branchId') === str(shift, 'branchId') && str(sale, 'createdAt') >= str(shift, 'openedAt') && (!str(shift, 'closedAt') || str(sale, 'createdAt') <= str(shift, 'closedAt')));
  const cashSales = roundMoney(sales.flatMap((sale) => asList<Payload>(sale['payments'])).filter((payment) => isCash(str(payment, 'method'))).reduce((sum, payment) => sum + num(payment, 'amount'), 0));
  const cashTips = roundMoney(sales.flatMap((sale) => asList<Payload>(sale['tips'])).filter((tip) => isCash(str(tip, 'method'))).reduce((sum, tip) => sum + num(tip, 'amount'), 0));
  const cashRefunds = roundMoney(sales.flatMap((sale) => asList<Payload>(sale['refunds'])).filter((refund) => isCash(str(refund, 'method')) && str(refund, 'status') === 'APPROVED').reduce((sum, refund) => sum + num(refund, 'amount'), 0));
  const expectedCash = roundMoney(num(shift, 'openingBalance') + cashSales + cashTips - cashRefunds);
  return asDoc(shift.id, { ...shift, cashSales, cashTips, cashRefunds, expectedCash: str(shift, 'status') === 'OPEN' ? expectedCash : num(shift, 'expectedCash') || expectedCash });
}

async function products(ctx: Ctx) {
  if (ctx.id === 'image') return dataOf({ image: '' });
  if (!ctx.id && ctx.method === 'GET') return pageOf((await all(ctx.db, 'products')).filter((row) => matches(row, ctx.query, ['name', 'sku', 'barcode'])), ctx.query);
  if (!ctx.id && ctx.method === 'POST') return dataOf(await writeProduct(ctx, uid('prd')));
  if (ctx.action === 'deactivate') {
    const current = await requireOne(ctx.db, 'products', ctx.id);
    return dataOf(await save(ctx.db, 'products', asDoc(current.id, { ...current, status: 'INACTIVE' })));
  }
  if (ctx.method === 'GET') return dataOf(await requireOne(ctx.db, 'products', ctx.id));
  if (ctx.method === 'PUT') return dataOf(await writeProduct(ctx, ctx.id));
  return undefined;
}

async function writeProduct(ctx: Ctx, id: string): Promise<Doc> {
  const existing = await one(ctx.db, 'products', id);
  const sku = str(ctx.body, 'sku') || str(existing, 'sku');
  if (!sku) fail(400, 'validation', 'SKU is required.');
  const duplicate = (await all(ctx.db, 'products')).find((row) => row.id !== id && str(row, 'sku').toLowerCase() === sku.toLowerCase());
  if (duplicate) fail(409, 'duplicate_sku', 'Another product already uses that SKU.');
  return save(ctx.db, 'products', asDoc(id, {
    name: ctx.body['name'] ?? existing?.['name'] ?? { en: sku, ar: '' },
    sku,
    barcode: str(ctx.body, 'barcode'),
    description: ctx.body['description'] ?? { en: '', ar: '' },
    categoryId: str(ctx.body, 'categoryId'),
    brand: str(ctx.body, 'brand'),
    unit: str(ctx.body, 'unit') || 'piece',
    costPrice: num(ctx.body, 'costPrice'),
    sellingPrice: num(ctx.body, 'sellingPrice'),
    minimumStock: num(ctx.body, 'minimumStock'),
    image: str(ctx.body, 'image'),
    status: str(existing, 'status') || 'ACTIVE',
  }));
}

async function inventory(ctx: Ctx) {
  if (ctx.id === 'summary') {
    const rows = await stockRows(ctx.db, ctx.query['branchId'] ?? '');
    return dataOf({ lowStock: rows.filter((row) => row['quantityOnHand'] as number > 0 && (row['quantityOnHand'] as number) <= (row['minimumStock'] as number)).length, outOfStock: rows.filter((row) => (row['quantityOnHand'] as number) <= 0).length });
  }
  if (ctx.id === 'adjustments') {
    const direction = str(ctx.body, 'direction') === 'OUT' ? -1 : 1;
    await changeStock(ctx.db, str(ctx.body, 'branchId'), str(ctx.body, 'productId'), direction * num(ctx.body, 'quantity'), 0, 'ADJUSTMENT', '', str(ctx.body, 'notes'));
    return dataOf({ ok: true });
  }
  if (ctx.id === 'minimum') {
    const stock = await ensureStock(ctx.db, str(ctx.body, 'branchId'), str(ctx.body, 'productId'));
    const saved = await save(ctx.db, 'stock', asDoc(stock.id, { ...stock, minimumStock: num(ctx.body, 'minimumStock') }));
    await refreshAlert(ctx.db, saved);
    return dataOf({ quantityOnHand: num(saved, 'quantityOnHand'), averageCost: num(saved, 'averageCost'), minimumStock: num(saved, 'minimumStock') });
  }
  if (ctx.id && ctx.method === 'GET') {
    const product = await requireOne(ctx.db, 'products', ctx.id);
    const stock = await ensureStock(ctx.db, ctx.query['branchId'] ?? '', product.id);
    const movements = (await all(ctx.db, 'movements')).filter((row) => str(row, 'stockId') === stock.id).sort((a, b) => str(b, 'createdAt').localeCompare(str(a, 'createdAt')));
    return dataOf({ product, stock: { quantityOnHand: num(stock, 'quantityOnHand'), averageCost: num(stock, 'averageCost'), minimumStock: num(stock, 'minimumStock'), lastStockMovementAt: str(stock, 'lastStockMovementAt') }, movements });
  }
  return pageOf(await stockRows(ctx.db, ctx.query['branchId'] ?? '', ctx.query['search'] ?? '', ctx.query['alert'] ?? ''), ctx.query);
}

async function stockRows(db: NileDatabase, branchId: string, search = '', alert = ''): Promise<Doc[]> {
  const products = (await all(db, 'products')).filter((product) => str(product, 'status') !== 'INACTIVE');
  const rows: Doc[] = [];
  for (const product of products) {
    const stock = await ensureStock(db, branchId, product.id);
    const quantityOnHand = num(stock, 'quantityOnHand');
    const minimumStock = num(stock, 'minimumStock') || num(product, 'minimumStock');
    if (search && !`${str(product, 'sku')} ${JSON.stringify(product['name'])}`.toLowerCase().includes(search.toLowerCase())) continue;
    if (alert === 'OUT' && quantityOnHand > 0) continue;
    if (alert === 'LOW' && (quantityOnHand <= 0 || quantityOnHand > minimumStock)) continue;
    rows.push(asDoc(stock.id, { productId: product.id, productName: product['name'], sku: str(product, 'sku'), quantityOnHand, averageCost: num(stock, 'averageCost'), minimumStock, sellingPrice: num(product, 'sellingPrice'), status: quantityOnHand <= 0 ? 'OUT' : quantityOnHand <= minimumStock ? 'LOW' : 'OK', lastStockMovementAt: str(stock, 'lastStockMovementAt') }));
  }
  return rows;
}

async function suppliers(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') return pageOf((await all(ctx.db, 'suppliers')).filter((row) => matches(row, ctx.query, ['name', 'phone'])), ctx.query);
  if (!ctx.id && ctx.method === 'POST') return dataOf(await save(ctx.db, 'suppliers', asDoc(uid('sup'), { ...ctx.body, status: 'ACTIVE', outstanding: 0 })));
  if (ctx.method === 'GET') {
    const supplier = await requireOne(ctx.db, 'suppliers', ctx.id);
    const purchases = (await all(ctx.db, 'purchases')).filter((row) => str(row, 'supplierId') === supplier.id);
    const outstanding = roundMoney(purchases.reduce((sum, row) => sum + num(row, 'remainingAmount'), 0));
    return dataOf({ ...supplier, outstanding, purchases });
  }
  if (ctx.method === 'PUT') {
    const current = await requireOne(ctx.db, 'suppliers', ctx.id);
    return dataOf(await save(ctx.db, 'suppliers', asDoc(current.id, { ...current, ...ctx.body, id: current.id })));
  }
  return undefined;
}

async function purchases(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') return pageOf((await all(ctx.db, 'purchases')).filter((row) => matches(row, ctx.query)), ctx.query);
  if (!ctx.id && ctx.method === 'POST') return dataOf(await createPurchase(ctx));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'purchases', ctx.id));
  if (ctx.action === 'receive') return dataOf(await receivePurchase(ctx));
  if (ctx.action === 'payments') return dataOf(await payPurchase(ctx));
  if (ctx.action === 'return') return dataOf(await returnPurchase(ctx));
  return undefined;
}

async function createPurchase(ctx: Ctx): Promise<Doc> {
  const supplier = await requireOne(ctx.db, 'suppliers', str(ctx.body, 'supplierId'));
  const products = await all(ctx.db, 'products');
  const items = asList<Payload>(ctx.body['items']).map((item) => {
    const product = products.find((row) => row.id === str(item, 'productId'));
    const quantity = num(item, 'quantity');
    const unitCost = num(item, 'unitCost');
    return { productId: str(item, 'productId'), productName: product?.['name'] ?? { en: '', ar: '' }, sku: product ? str(product, 'sku') : '', quantity, unitCost, totalCost: roundMoney(quantity * unitCost), returnedQuantity: 0 };
  });
  if (items.length === 0) fail(400, 'validation', 'Add at least one product.');
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.totalCost, 0));
  const discount = roundMoney(Math.min(num(ctx.body, 'discount'), subtotal));
  const totalAmount = roundMoney(subtotal - discount);
  return save(ctx.db, 'purchases', asDoc(uid('pur'), {
    purchaseNumber: await nextNumber(ctx.db, 'purchase', 'PO'),
    branchId: str(ctx.body, 'branchId'),
    supplierId: supplier.id,
    supplierName: str(supplier, 'name'),
    items,
    subtotal,
    discount,
    totalAmount,
    paidAmount: 0,
    remainingAmount: totalAmount,
    paymentStatus: 'UNPAID',
    receiveStatus: 'PENDING',
    purchaseDate: str(ctx.body, 'purchaseDate') || new Date().toISOString(),
    notes: str(ctx.body, 'notes'),
    payments: [],
    returns: [],
  }));
}

async function receivePurchase(ctx: Ctx): Promise<Doc> {
  const purchase = await requireOne(ctx.db, 'purchases', ctx.id);
  if (str(purchase, 'receiveStatus') === 'RECEIVED') return purchase;
  for (const item of asList<Payload>(purchase['items'])) {
    await changeStock(ctx.db, str(purchase, 'branchId'), str(item, 'productId'), num(item, 'quantity') - num(item, 'returnedQuantity'), num(item, 'unitCost'), 'PURCHASE', purchase.id, str(purchase, 'purchaseNumber'));
  }
  return save(ctx.db, 'purchases', asDoc(purchase.id, { ...purchase, receiveStatus: 'RECEIVED' }));
}

async function payPurchase(ctx: Ctx): Promise<Doc> {
  const purchase = await requireOne(ctx.db, 'purchases', ctx.id);
  const amount = num(ctx.body, 'amount');
  if (amount <= 0 || amount > num(purchase, 'remainingAmount') + 0.001) fail(400, 'validation', 'Payment exceeds the remaining purchase amount.');
  const paidAmount = roundMoney(num(purchase, 'paidAmount') + amount);
  const remainingAmount = roundMoney(num(purchase, 'totalAmount') - paidAmount);
  const payments = [...asList<Payload>(purchase['payments']), { id: uid('pay'), method: str(ctx.body, 'method'), amount, referenceNumber: str(ctx.body, 'referenceNumber'), paidAt: new Date().toISOString() }];
  return save(ctx.db, 'purchases', asDoc(purchase.id, { ...purchase, payments, paidAmount, remainingAmount, paymentStatus: remainingAmount === 0 ? 'PAID' : 'PARTIAL' }));
}

async function returnPurchase(ctx: Ctx): Promise<Doc> {
  const purchase = await requireOne(ctx.db, 'purchases', ctx.id);
  if (str(purchase, 'receiveStatus') !== 'RECEIVED') fail(409, 'not_received', 'Receive the purchase before returning stock.');
  const items = asList<Payload>(purchase['items']).map((item) => ({ ...item }));
  const returns = asList<Payload>(purchase['returns']);
  for (const requested of asList<Payload>(ctx.body['items'])) {
    const item = items.find((row) => str(row, 'productId') === str(requested, 'productId'));
    if (!item) fail(404, 'not_found', 'That product is not on the purchase.');
    const quantity = num(requested, 'quantity');
    if (quantity <= 0 || num(item, 'returnedQuantity') + quantity > num(item, 'quantity')) fail(400, 'validation', 'Return quantity exceeds the received quantity.');
    item['returnedQuantity'] = num(item, 'returnedQuantity') + quantity;
    await changeStock(ctx.db, str(purchase, 'branchId'), str(item, 'productId'), -quantity, num(item, 'unitCost'), 'PURCHASE_RETURN', purchase.id, str(ctx.body, 'reason'));
    returns.push({ id: uid('ret'), productId: str(item, 'productId'), quantity, unitCost: num(item, 'unitCost'), reason: str(ctx.body, 'reason'), createdAt: new Date().toISOString() });
  }
  return save(ctx.db, 'purchases', asDoc(purchase.id, { ...purchase, items, returns }));
}

async function transfers(ctx: Ctx) {
  if ((await all(ctx.db, 'branches')).length < 2 && ctx.method === 'POST') {
    fail(409, 'single_branch', 'Transfers need two branches. This computer keeps one branch.');
  }
  if (!ctx.id && ctx.method === 'GET') return dataOf((await all(ctx.db, 'transfers')).filter((row) => !ctx.query['branchId'] || str(row, 'sourceBranchId') === ctx.query['branchId'] || str(row, 'destinationBranchId') === ctx.query['branchId']));
  if (!ctx.id && ctx.method === 'POST') {
    return dataOf(await save(ctx.db, 'transfers', asDoc(uid('tr'), { transferNumber: await nextNumber(ctx.db, 'transfer', 'TR'), ...ctx.body, status: 'DRAFT', sentAt: '', receivedAt: '', createdAt: new Date().toISOString() })));
  }
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'transfers', ctx.id));
  const current = await requireOne(ctx.db, 'transfers', ctx.id);
  if (ctx.action === 'send') return dataOf(await save(ctx.db, 'transfers', asDoc(current.id, { ...current, status: 'SENT', sentAt: new Date().toISOString() })));
  if (ctx.action === 'receive') return dataOf(await save(ctx.db, 'transfers', asDoc(current.id, { ...current, status: 'RECEIVED', receivedAt: new Date().toISOString() })));
  if (ctx.action === 'cancel') return dataOf(await save(ctx.db, 'transfers', asDoc(current.id, { ...current, status: 'CANCELLED' })));
  return undefined;
}

async function alerts(ctx: Ctx) {
  if (!ctx.id) {
    await rebuildAlerts(ctx.db, ctx.query['branchId'] ?? '');
    return dataOf((await all(ctx.db, 'alerts')).filter((row) => (!ctx.query['branchId'] || str(row, 'branchId') === ctx.query['branchId']) && (!ctx.query['status'] || str(row, 'status') === ctx.query['status'])));
  }
  const current = await requireOne(ctx.db, 'alerts', ctx.id);
  return dataOf(await save(ctx.db, 'alerts', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'RESOLVED' })));
}

async function attendance(ctx: Ctx) {
  if (ctx.id === 'summary') return dataOf(await attendanceCounts(ctx.db, ctx.query['branchId'] ?? '', ctx.query['date'] || today()));
  if (ctx.id === 'check-in' || ctx.id === 'check-out') return dataOf(await punch(ctx, ctx.id === 'check-in' ? 'in' : 'out'));
  if (ctx.id === 'close-day') return dataOf(await closeDay(ctx));
  if (ctx.id === 'policy') return policy(ctx);
  if (ctx.method === 'PATCH') return dataOf(await correctAttendance(ctx));
  const rows = (await all(ctx.db, 'attendance')).filter((row) => (!ctx.query['branchId'] || str(row, 'branchId') === ctx.query['branchId']) && (!ctx.query['employeeId'] || str(row, 'employeeId') === ctx.query['employeeId']) && within(str(row, 'attendanceDate'), ctx.query['from'] ?? '', ctx.query['to'] ?? ''));
  return { counts: countRows(rows), data: rows };
}

async function punch(ctx: Ctx, direction: 'in' | 'out'): Promise<Doc> {
  const employee = await requireOne(ctx.db, 'employees', str(ctx.body, 'employeeId'));
  const branchId = str(ctx.body, 'branchId');
  const date = today();
  const existing = (await all(ctx.db, 'attendance')).find((row) => str(row, 'employeeId') === employee.id && str(row, 'attendanceDate') === date && str(row, 'branchId') === branchId);
  const now = new Date().toISOString();
  const policy = await branchPolicy(ctx.db, branchId);
  const lateMinutes = direction === 'in' ? lateFrom(now, policy) : num(existing, 'lateMinutes');
  const status = lateMinutes > num(policy, 'graceMinutes') ? 'LATE' : 'PRESENT';
  return save(ctx.db, 'attendance', asDoc(existing?.id ?? uid('att'), {
    employeeId: employee.id,
    employeeName: str(employee, 'fullName'),
    branchId,
    attendanceDate: date,
    checkInTime: direction === 'in' ? now : str(existing, 'checkInTime'),
    checkOutTime: direction === 'out' ? now : str(existing, 'checkOutTime'),
    checkInLabel: direction === 'in' ? now.slice(11, 16) : str(existing, 'checkInLabel'),
    checkOutLabel: direction === 'out' ? now.slice(11, 16) : str(existing, 'checkOutLabel'),
    checkInSource: direction === 'in' ? 'MANUAL' : str(existing, 'checkInSource'),
    checkOutSource: direction === 'out' ? 'MANUAL' : str(existing, 'checkOutSource'),
    status,
    lateMinutes,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    notes: str(ctx.body, 'notes') || str(existing, 'notes'),
    revisions: existing?.['revisions'] ?? [],
  }));
}

async function correctAttendance(ctx: Ctx): Promise<Doc> {
  const current = await requireOne(ctx.db, 'attendance', ctx.id);
  const revisions = [...asList<Payload>(current['revisions']), { at: new Date().toISOString(), by: await actorName(ctx.db, ctx.userId), summary: 'Manual correction' }];
  return save(ctx.db, 'attendance', asDoc(current.id, { ...current, ...ctx.body, id: current.id, revisions }));
}

async function closeDay(ctx: Ctx) {
  const branchId = str(ctx.body, 'branchId');
  const date = str(ctx.body, 'date') || today();
  const employees = (await all(ctx.db, 'employees')).filter((row) => str(row, 'status') === 'ACTIVE');
  let created = 0;
  for (const employee of employees) {
    const exists = (await all(ctx.db, 'attendance')).some((row) => str(row, 'employeeId') === employee.id && str(row, 'attendanceDate') === date);
    if (exists) continue;
    await save(ctx.db, 'attendance', asDoc(uid('att'), { employeeId: employee.id, employeeName: str(employee, 'fullName'), branchId, attendanceDate: date, checkInTime: '', checkOutTime: '', checkInLabel: '', checkOutLabel: '', checkInSource: 'CLOSE_DAY', checkOutSource: '', status: 'ABSENT', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, notes: '', revisions: [] }));
    created += 1;
  }
  return { created };
}

async function policy(ctx: Ctx) {
  if (ctx.method === 'GET') return dataOf(await branchPolicy(ctx.db, ctx.query['branchId'] ?? ''));
  const branchId = str(ctx.body, 'branchId');
  const id = branchId ? `policy:${branchId}` : 'policy-default';
  const existing = await one(ctx.db, 'policies', id);
  return dataOf(await save(ctx.db, 'policies', asDoc(id, { ...(existing ?? {}), ...ctx.body, id, branchId })));
}

async function schedules(ctx: Ctx) {
  if (ctx.method === 'GET') return dataOf((await all(ctx.db, 'schedules')).filter((row) => (!ctx.query['employeeId'] || str(row, 'employeeId') === ctx.query['employeeId']) && (!ctx.query['branchId'] || str(row, 'branchId') === ctx.query['branchId'])));
  const id = ctx.id || uid('sch');
  return dataOf(await save(ctx.db, 'schedules', asDoc(id, { ...(await one(ctx.db, 'schedules', id)), ...ctx.body, id })));
}

async function devices(ctx: Ctx) {
  if (ctx.id === 'logs') return dataOf(await all(ctx.db, 'deviceLogs'));
  if (!ctx.id && ctx.method === 'GET') return dataOf(await all(ctx.db, 'devices'));
  if (!ctx.id && ctx.method === 'POST') {
    const device = await save(ctx.db, 'devices', asDoc(uid('dev'), { ...ctx.body, status: 'ENABLED', connectionStatus: 'LOCAL_ONLY', lastSyncAt: '', hardwareReady: false, adapter: 'local-file' }));
    return dataOf({ device, apiKey: uid('key') });
  }
  if (ctx.action === 'status') {
    const current = await requireOne(ctx.db, 'devices', ctx.id);
    return dataOf(await save(ctx.db, 'devices', asDoc(current.id, { ...current, status: str(ctx.body, 'status') || 'DISABLED' })));
  }
  if (ctx.action === 'employees') {
    return dataOf(await save(ctx.db, 'deviceMaps', asDoc(uid('map'), { deviceId: ctx.id, employeeId: str(ctx.body, 'employeeId'), externalEmployeeId: str(ctx.body, 'externalEmployeeId') })));
  }
  if (ctx.action === 'sync') {
    const log = await save(ctx.db, 'deviceLogs', asDoc(uid('log'), { deviceId: ctx.id, status: 'SKIPPED', message: 'Fingerprint hardware is not connected in local-first mode.', eventCount: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }));
    return dataOf({ status: str(log, 'status'), eventCount: 0, failures: [str(log, 'message')] });
  }
  return undefined;
}

async function leaveTypes(ctx: Ctx) {
  if (ctx.method === 'GET') return dataOf(await all(ctx.db, 'leaveTypes'));
  const id = ctx.id || uid('leave');
  const existing = await one(ctx.db, 'leaveTypes', id);
  return dataOf(await save(ctx.db, 'leaveTypes', asDoc(id, { ...(existing ?? {}), ...ctx.body, id, status: str(ctx.body, 'status') || str(existing, 'status') || 'ACTIVE' })));
}

async function leaveRequests(ctx: Ctx) {
  if (!ctx.id && ctx.method === 'GET') return dataOf((await all(ctx.db, 'leaveRequests')).filter((row) => (!ctx.query['status'] || str(row, 'status') === ctx.query['status']) && (!ctx.query['employeeId'] || str(row, 'employeeId') === ctx.query['employeeId'])));
  if (!ctx.id && ctx.method === 'POST') return dataOf(await createLeave(ctx));
  if (ctx.action === 'decision') return dataOf(await decideLeave(ctx));
  if (ctx.action === 'cancel') {
    const current = await requireOne(ctx.db, 'leaveRequests', ctx.id);
    return dataOf(await save(ctx.db, 'leaveRequests', asDoc(current.id, { ...current, status: 'CANCELLED' })));
  }
  return undefined;
}

async function createLeave(ctx: Ctx): Promise<Doc> {
  const start = str(ctx.body, 'startDate');
  const end = str(ctx.body, 'endDate') || start;
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const portion = str(ctx.body, 'portion');
  const totalDays = portion.toLowerCase().includes('half') ? 0.5 : days;
  return save(ctx.db, 'leaveRequests', asDoc(uid('lr'), { ...ctx.body, totalDays, status: 'PENDING', requestedAt: new Date().toISOString(), approvedBy: '', approvedAt: '', rejectionReason: '' }));
}

async function decideLeave(ctx: Ctx): Promise<Doc> {
  const current = await requireOne(ctx.db, 'leaveRequests', ctx.id);
  const status = str(ctx.body, 'status') || 'APPROVED';
  return save(ctx.db, 'leaveRequests', asDoc(current.id, { ...current, status, approvedBy: await actorName(ctx.db, ctx.userId), approvedAt: new Date().toISOString(), rejectionReason: str(ctx.body, 'rejectionReason') }));
}

async function leaveBalances(ctx: Ctx) {
  if (ctx.id === 'adjustments') {
    const year = num(ctx.body, 'year') || new Date().getFullYear();
    const id = `${str(ctx.body, 'employeeId')}:${str(ctx.body, 'leaveTypeId')}:${year}`;
    const existing = await one(ctx.db, 'leaveBalances', id);
    const adjustmentDays = num(existing, 'adjustmentDays') + num(ctx.body, 'days');
    const remaining = roundMoney(num(existing, 'entitled') + num(existing, 'carriedDays') + adjustmentDays - num(existing, 'used') - num(existing, 'pending'));
    return dataOf(await save(ctx.db, 'leaveBalances', asDoc(id, { ...(existing ?? { employeeId: str(ctx.body, 'employeeId'), leaveTypeId: str(ctx.body, 'leaveTypeId'), year, entitled: 0, carriedDays: 0, used: 0, pending: 0 }), adjustmentDays, remaining })));
  }
  const rows = (await all(ctx.db, 'leaveBalances')).filter((row) => (!ctx.query['employeeId'] || str(row, 'employeeId') === ctx.query['employeeId']) && (!ctx.query['year'] || num(row, 'year') === Number(ctx.query['year'])));
  return dataOf(rows);
}

async function payroll(ctx: Ctx) {
  if (ctx.id === 'generate') return dataOf(await generatePayroll(ctx));
  if (!ctx.id && ctx.method === 'GET') return dataOf((await all(ctx.db, 'payroll')).filter((row) => (!ctx.query['status'] || str(row, 'status') === ctx.query['status']) && within(str(row, 'periodStart'), ctx.query['periodStart'] ?? '', ctx.query['periodEnd'] ?? '')));
  if (ctx.method === 'GET' && !ctx.action) return dataOf(await requireOne(ctx.db, 'payroll', ctx.id));
  const current = await requireOne(ctx.db, 'payroll', ctx.id);
  if (ctx.action === 'adjustments') {
    const adjustments = [...asList<Payload>(current['adjustments']), { id: uid('adj'), kind: str(ctx.body, 'kind'), label: str(ctx.body, 'label'), amount: num(ctx.body, 'amount'), reason: str(ctx.body, 'reason'), createdAt: new Date().toISOString() }];
    const bonuses = roundMoney(num(current, 'bonuses') + (str(ctx.body, 'kind') === 'DEDUCTION' ? 0 : num(ctx.body, 'amount')));
    const otherDeductions = roundMoney(num(current, 'otherDeductions') + (str(ctx.body, 'kind') === 'DEDUCTION' ? num(ctx.body, 'amount') : 0));
    return dataOf(await resavePayroll(ctx.db, current, { adjustments, bonuses, otherDeductions }));
  }
  if (ctx.action === 'submit') return dataOf(await save(ctx.db, 'payroll', asDoc(current.id, { ...current, status: 'SUBMITTED', submittedBy: await actorName(ctx.db, ctx.userId), submittedAt: new Date().toISOString() })));
  if (ctx.action === 'approve') return dataOf(await save(ctx.db, 'payroll', asDoc(current.id, { ...current, status: 'APPROVED', approvedBy: await actorName(ctx.db, ctx.userId), approvedAt: new Date().toISOString() })));
  if (ctx.action === 'pay') return dataOf(await save(ctx.db, 'payroll', asDoc(current.id, { ...current, status: 'PAID', paidBy: await actorName(ctx.db, ctx.userId), paidAt: new Date().toISOString(), paymentMethod: str(ctx.body, 'method'), paymentReference: str(ctx.body, 'reference') })));
  if (ctx.action === 'corrections') {
    return dataOf(await save(ctx.db, 'payroll', asDoc(uid('pay'), { ...current, status: 'DRAFT', correctsPayrollId: current.id, submittedBy: '', approvedBy: '', paidBy: '', submittedAt: '', approvedAt: '', paidAt: '', paymentMethod: '', paymentReference: '' })));
  }
  return undefined;
}

async function generatePayroll(ctx: Ctx): Promise<Doc[]> {
  const start = str(ctx.body, 'periodStart');
  const end = str(ctx.body, 'periodEnd');
  const branchId = str(ctx.body, 'branchId');
  if (!start || !end) fail(400, 'validation', 'Payroll period start and end are required.');
  const employees = (await all(ctx.db, 'employees')).filter((row) => str(row, 'status') === 'ACTIVE' && (!branchId || asList<Payload>(row['branches']).some((item) => str(item, 'branchId') === branchId && str(item, 'status') === 'ACTIVE')));
  const sales = (await all(ctx.db, 'sales')).filter((sale) => within(str(sale, 'createdAt'), start, end));
  const attendance = (await all(ctx.db, 'attendance')).filter((row) => within(str(row, 'attendanceDate'), start, end));
  const policy = await branchPolicy(ctx.db, branchId);
  const created: Doc[] = [];
  for (const employee of employees) {
    const salary = asPayload(employee['salary']);
    const ownSales = sales.filter((sale) => asList<Payload>(sale['commissions']).some((item) => str(item, 'employeeId') === employee.id) || asList<Payload>(sale['tips']).some((item) => str(item, 'employeeId') === employee.id));
    const commission = roundMoney(ownSales.flatMap((sale) => asList<Payload>(sale['commissions'])).filter((item) => str(item, 'employeeId') === employee.id).reduce((sum, item) => sum + num(item, 'commissionAmount'), 0));
    const tips = roundMoney(ownSales.flatMap((sale) => asList<Payload>(sale['tips'])).filter((item) => str(item, 'employeeId') === employee.id).reduce((sum, item) => sum + num(item, 'amount'), 0));
    const rows = attendance.filter((row) => str(row, 'employeeId') === employee.id);
    const summary = {
      present: rows.filter((row) => str(row, 'status') === 'PRESENT').length,
      late: rows.filter((row) => str(row, 'status') === 'LATE').length,
      absent: rows.filter((row) => str(row, 'status') === 'ABSENT').length,
      halfDay: rows.filter((row) => str(row, 'status') === 'HALF_DAY').length,
      onLeave: rows.filter((row) => str(row, 'status') === 'ON_LEAVE').length,
      unpaidLeaveDays: 0,
      lateMinutes: rows.reduce((sum, row) => sum + num(row, 'lateMinutes'), 0),
      earlyLeaveMinutes: rows.reduce((sum, row) => sum + num(row, 'earlyLeaveMinutes'), 0),
      overtimeMinutes: rows.reduce((sum, row) => sum + num(row, 'overtimeMinutes'), 0),
    };
    const dailyRate = num(policy, 'dailyRateDays') > 0 ? num(salary, 'basicSalary') / num(policy, 'dailyRateDays') : 0;
    const absenceDeduction = str(policy, 'absenceDeductionMode') === 'DAILY_RATE' ? dailyRate * summary.absent + dailyRate * (1 - num(policy, 'halfDayFactor')) * summary.halfDay : 0;
    const attendanceDeductions = roundMoney(absenceDeduction + summary.lateMinutes * num(policy, 'lateDeductionPerMinute') + summary.earlyLeaveMinutes * num(policy, 'earlyLeaveDeductionPerMinute'));
    const hourly = num(policy, 'monthlyHours') > 0 ? num(salary, 'basicSalary') / num(policy, 'monthlyHours') : 0;
    const overtime = roundMoney((summary.overtimeMinutes / 60) * hourly * (num(policy, 'overtimeMultiplier') || 1));
    const parts = { basicSalary: num(salary, 'basicSalary'), commission, tips, allowances: num(salary, 'allowances'), overtime, bonuses: 0, attendanceDeductions, fixedDeductions: num(salary, 'deductions'), otherDeductions: 0 };
    created.push(await save(ctx.db, 'payroll', asDoc(uid('pay'), {
      employeeId: employee.id,
      employeeName: str(employee, 'fullName'),
      branchId,
      periodStart: start,
      periodEnd: end,
      status: 'DRAFT',
      correctsPayrollId: '',
      ...parts,
      netSalary: payrollNet(parts),
      attendanceSummary: summary,
      adjustments: [],
      generatedBy: await actorName(ctx.db, ctx.userId),
      submittedBy: '',
      approvedBy: '',
      paidBy: '',
      submittedAt: '',
      approvedAt: '',
      paidAt: '',
      paymentMethod: '',
      paymentReference: '',
    })));
  }
  return created;
}

async function resavePayroll(db: NileDatabase, current: Doc, patch: Payload): Promise<Doc> {
  const next = { ...current, ...patch };
  const netSalary = payrollNet({
    basicSalary: num(next, 'basicSalary'),
    commission: num(next, 'commission'),
    tips: num(next, 'tips'),
    allowances: num(next, 'allowances'),
    overtime: num(next, 'overtime'),
    bonuses: num(next, 'bonuses'),
    attendanceDeductions: num(next, 'attendanceDeductions'),
    fixedDeductions: num(next, 'fixedDeductions'),
    otherDeductions: num(next, 'otherDeductions'),
  });
  return save(db, 'payroll', asDoc(current.id, { ...next, netSalary }));
}

async function reports(ctx: Ctx) {
  if (ctx.id === 'home') return dataOf(await homeReport(ctx.db));
  const format = ctx.query['format'] ?? 'json';
  const payload = await buildReport(ctx, ctx.id, ctx.query);
  if (ctx.action === 'export') {
    if (format === 'xlsx') {
      const { rowsToXlsx } = await import('./local-excel');
      return rowsToXlsx(ctx.id || 'report', payload.rows);
    }
    if (format === 'pdf') return simplePdf([payload.kind, ...payload.rows.slice(0, 30).map((row) => payload.columns.map((column) => `${column}: ${row[column] ?? ''}`).join(' | '))]);
    return new Blob([`\uFEFF${toCsv(payload.columns, payload.rows)}`], { type: 'text/csv;charset=utf-8' });
  }
  return dataOf(payload);
}

async function whatsapp(ctx: Ctx) {
  if (ctx.id === 'config') {
    const current = (await one(ctx.db, 'settings', 'whatsappConfig')) ?? asDoc('whatsappConfig', {});
    if (ctx.method === 'PUT') {
      const saved = await save(ctx.db, 'settings', asDoc('whatsappConfig', {
        phoneNumberId: str(ctx.body, 'phoneNumberId'),
        businessAccountId: str(ctx.body, 'businessAccountId'),
        enabled: ctx.body['enabled'] === true,
        tokenSet: Boolean(str(ctx.body, 'accessToken')) || current['tokenSet'] === true,
        appSecretSet: Boolean(str(ctx.body, 'appSecret')) || current['appSecretSet'] === true,
        verifyTokenSet: Boolean(str(ctx.body, 'verifyToken')) || current['verifyTokenSet'] === true,
        liveReady: false,
        liveMessagingTested: false,
      }), true);
      return dataOf(saved);
    }
    return dataOf(current);
  }
  if (ctx.id === 'notification-settings') {
    const current = (await one(ctx.db, 'settings', 'whatsappSettings')) ?? asDoc('whatsappSettings', {});
    if (ctx.method === 'PUT') return dataOf(await save(ctx.db, 'settings', asDoc('whatsappSettings', { ...current, ...ctx.body, id: 'whatsappSettings' }), true));
    return dataOf(current);
  }
  if (ctx.id === 'templates') return dataOf(await all(ctx.db, 'templates'));
  if (ctx.id === 'messages') return dataOf(await all(ctx.db, 'messages'));
  if (ctx.id === 'customers' && ctx.extra === 'preferences') {
    const customer = await requireOne(ctx.db, 'customers', ctx.action);
    const saved = await save(ctx.db, 'customers', asDoc(customer.id, { ...customer, promotionalOptIn: ctx.body['promotionalOptIn'] === true, whatsappOptOut: ctx.body['whatsappOptOut'] === true }));
    return dataOf({ promotionalOptIn: saved['promotionalOptIn'] === true, whatsappOptOut: saved['whatsappOptOut'] === true });
  }
  return undefined;
}

async function homeReport(db: NileDatabase) {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = today();
  const sales = (await all(db, 'sales')).filter((sale) => within(str(sale, 'createdAt'), from, to));
  const gross = roundMoney(sales.reduce((sum, sale) => sum + num(sale, 'totalAmount'), 0));
  const refunds = roundMoney(sales.reduce((sum, sale) => sum + num(sale, 'refundedAmount'), 0));
  const branches = await all(db, 'branches');
  const stock = await stockRows(db, branches[0]?.id ?? '');
  const attendance = (await all(db, 'attendance')).filter((row) => str(row, 'attendanceDate') === to);
  const payrollRows = await all(db, 'payroll');
  const shifts = await all(db, 'shifts');
  return {
    generatedAt: new Date().toISOString(),
    from,
    to,
    currency: 'EGP',
    sales: { gross, refunds, net: roundMoney(gross - refunds), transactions: sales.length },
    branches: await Promise.all(branches.map(async (branch) => ({ label: str(branch, 'name'), net: roundMoney(sales.filter((sale) => str(sale, 'branchId') === branch.id).reduce((sum, sale) => sum + num(sale, 'totalAmount') - num(sale, 'refundedAmount'), 0)) }))),
    customers: { newCustomers: (await all(db, 'customers')).filter((row) => within(str(row, 'createdAt'), from, to)).length, returningCustomers: 0 },
    employees: [],
    inventory: { lowStock: stock.filter((row) => row['status'] === 'LOW').length, outOfStock: stock.filter((row) => row['status'] === 'OUT').length },
    payroll: { net: roundMoney(payrollRows.reduce((sum, row) => sum + num(row, 'netSalary'), 0)), count: payrollRows.length },
    attendance: { LATE: attendance.filter((row) => str(row, 'status') === 'LATE').length, ABSENT: attendance.filter((row) => str(row, 'status') === 'ABSENT').length },
    appointmentsToday: (await all(db, 'appointments')).filter((row) => str(row, 'scheduledAt').slice(0, 10) === to).length,
    supplierPayments: roundMoney((await all(db, 'purchases')).flatMap((row) => asList<Payload>(row['payments'])).reduce((sum, payment) => sum + num(payment, 'amount'), 0)),
    cashier: { metrics: { expectedCash: roundMoney(shifts.reduce((sum, shift) => sum + num(shift, 'expectedCash'), 0)) }, shifts: shifts.map((shift) => ({ status: str(shift, 'status'), expectedCash: num(shift, 'expectedCash') })) },
  };
}

async function buildReport(ctx: Ctx, kind: string, query: Record<string, string>) {
  const db = ctx.db;
  const sales = (await all(db, 'sales')).filter((sale) => within(str(sale, 'createdAt'), query['from'] ?? '', query['to'] ?? '') && (!query['branchId'] || str(sale, 'branchId') === query['branchId']));
  const gross = roundMoney(sales.reduce((sum, sale) => sum + num(sale, 'totalAmount'), 0));
  const refunds = roundMoney(sales.reduce((sum, sale) => sum + num(sale, 'refundedAmount'), 0));
  const columns = ['label', 'amount', 'count'];
  let rows: Array<Record<string, string | number>> = sales.map((sale) => ({ label: str(sale, 'transactionNumber'), amount: num(sale, 'totalAmount'), count: 1 }));
  if (kind === 'services' || kind === 'categories') {
    const counts = new Map<string, { amount: number; count: number }>();
    for (const sale of sales) {
      for (const item of asList<Payload>(sale['items']).filter((row) => str(row, 'itemType') !== 'PRODUCT')) {
        const label = nameOf(item['serviceName']).en || str(item, 'serviceId');
        const current = counts.get(label) ?? { amount: 0, count: 0 };
        current.amount = roundMoney(current.amount + num(item, 'lineTotal'));
        current.count += num(item, 'quantity');
        counts.set(label, current);
      }
    }
    rows = [...counts.entries()].map(([label, value]) => ({ label, amount: value.amount, count: value.count }));
  }
  if (kind === 'inventory') {
    rows = (await stockRows(db, query['branchId'] ?? '')).map((row) => ({ label: nameOf(row['productName']).en, amount: num(row, 'quantityOnHand'), count: num(row, 'minimumStock') }));
  }
  if (kind === 'attendance') {
    rows = (await all(db, 'attendance')).filter((row) => within(str(row, 'attendanceDate'), query['from'] ?? '', query['to'] ?? '')).map((row) => ({ label: str(row, 'employeeName'), amount: num(row, 'lateMinutes'), count: str(row, 'status') === 'PRESENT' ? 1 : 0, status: str(row, 'status') }));
  }
  if (kind === 'payroll') {
    rows = (await all(db, 'payroll')).map((row) => ({ label: str(row, 'employeeName'), amount: num(row, 'netSalary'), count: 1, status: str(row, 'status') }));
  }
  if (kind === 'customers') {
    rows = (await all(db, 'customers')).map((row) => ({ label: str(row, 'fullName'), amount: 0, count: 1 }));
  }
  const branch = (await all(db, 'branches'))[0];
  if (kind === 'cashier') {
    return cashierDayReport(db, query, sales, gross, refunds, branch);
  }
  if (kind === 'dashboard' || kind === 'daily' || kind === 'weekly' || kind === 'monthly' || kind === 'transactions') {
    return salesServiceReport(db, kind, query, sales, gross, refunds, branch);
  }
  return {
    kind,
    generatedAt: new Date().toISOString(),
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    tenantName: 'Nile Barbers',
    branchName: branch ? str(branch, 'name') : '',
    filters: query,
    metrics: { gross, refunds, net: roundMoney(gross - refunds), transactions: sales.length },
    columns: rows[0] ? Object.keys(rows[0]) : columns,
    rows,
    page: 1,
    pageSize: rows.length || 20,
    total: rows.length,
    notes: ['Calculated from IndexedDB on this computer.'],
  };
}

async function salesServiceReport(
  db: NileDatabase,
  kind: string,
  query: Record<string, string>,
  sales: Doc[],
  gross: number,
  refunds: number,
  branch: Doc | undefined,
) {
  const services = await all(db, 'services');
  const employees = await all(db, 'employees');
  const rows: Array<Record<string, string | number>> = [];
  let commissionTotal = 0;
  for (const sale of sales) {
    const saleGross = num(sale, 'totalAmount');
    const kept = Math.max(0, saleGross - num(sale, 'refundedAmount'));
    const scale = saleGross > 0 ? kept / saleGross : 1;
    const saleBarber = (() => {
      const employee = employees.find((row) => row.id === str(sale, 'barberEmployeeId'));
      return (employee ? str(employee, 'fullName') : '') || str(sale, 'barberName');
    })();
    const items = asList<Payload>(sale['items']).filter((item) => str(item, 'itemType') !== 'PRODUCT');
    const lines = items.length > 0 ? items : [sale];
    for (const item of lines) {
      const service = services.find((row) => row.id === str(item, 'serviceId'));
      const kindName = service ? str(service, 'commissionType') || 'PERCENTAGE' : 'PERCENTAGE';
      const rate = service ? num(service, 'commissionValue') : 0;
      const amount = items.length > 0 ? num(item, 'lineTotal') : saleGross;
      const quantity = num(item, 'quantity') || 1;
      const commission = roundMoney(commissionAmount(kindName, rate, amount, quantity) * scale);
      commissionTotal = roundMoney(commissionTotal + commission);
      const serviceName = service ? displayName(service['name']) : displayName(item['serviceName']);
      const itemBarberId = str(item, 'barberEmployeeId') || str(sale, 'barberEmployeeId');
      const itemEmployee = employees.find((row) => row.id === itemBarberId);
      const itemBarber = str(item, 'barberName') || (itemEmployee ? str(itemEmployee, 'fullName') : '') || saleBarber;
      rows.push({
        transaction: str(sale, 'transactionNumber'),
        service: serviceName || str(sale, 'transactionNumber'),
        barber: itemBarber,
        amount,
        commission,
        after: roundMoney(amount - commission),
      });
    }
  }
  const net = roundMoney(gross - refunds - commissionTotal);
  rows.push({
    transaction: 'الإجمالي',
    service: '',
    barber: '',
    amount: gross,
    commission: commissionTotal,
    after: net,
  });
  return {
    kind,
    generatedAt: new Date().toISOString(),
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    tenantName: 'Nile Barbers',
    branchName: branch ? str(branch, 'name') : '',
    filters: query,
    metrics: { gross, commission: commissionTotal, net, refunds, transactions: sales.length },
    columns: ['transaction', 'service', 'barber', 'amount', 'commission', 'after'],
    rows,
    page: 1,
    pageSize: rows.length || 20,
    total: rows.length,
    notes: [],
  };
}

async function cashierDayReport(
  db: NileDatabase,
  query: Record<string, string>,
  sales: Doc[],
  gross: number,
  refunds: number,
  branch: Doc | undefined,
) {
  const buckets = { CASH: 0, VISA: 0, WALLET: 0, INSTAPAY: 0, OTHER: 0 };
  for (const sale of sales) {
    for (const payment of asList<Payload>(sale['payments'])) {
      const method = str(payment, 'method').toUpperCase();
      const key = method === 'CASH' || method === 'VISA' || method === 'WALLET' || method === 'INSTAPAY' ? method : 'OTHER';
      buckets[key] = roundMoney(buckets[key] + num(payment, 'amount') - num(payment, 'refundedAmount'));
    }
  }
  const shifts = await Promise.all(
    (await all(db, 'shifts'))
      .filter((shift) => within(str(shift, 'openedAt'), query['from'] ?? '', query['to'] ?? ''))
      .map((shift) => withCash(db, shift)),
  );
  const services = await all(db, 'services');
  const employees = await all(db, 'employees');
  const byPerson = new Map<string, { name: string; before: number; commission: number }>();
  const rows: Array<Record<string, string | number>> = sales.map((sale) => {
    const saleGross = num(sale, 'totalAmount');
    const kept = Math.max(0, saleGross - num(sale, 'refundedAmount'));
    const scale = saleGross > 0 ? kept / saleGross : 1;
    const names = new Set<string>();
    let commission = 0;
    const before = num(sale, 'paidAmount') || num(sale, 'totalAmount');
    const serviceItems = asList<Payload>(sale['items']).filter((item) => str(item, 'itemType') !== 'PRODUCT');
    const lineBases = serviceItems.map((item) => num(item, 'lineTotal'));
    const lineSum = lineBases.reduce((sum, value) => sum + value, 0);
    for (const [index, item] of serviceItems.entries()) {
      const service = services.find((row) => row.id === str(item, 'serviceId'));
      const kind = service ? str(service, 'commissionType') || 'PERCENTAGE' : 'PERCENTAGE';
      const rate = service ? num(service, 'commissionValue') : 0;
      const lineCommission = roundMoney(commissionAmount(kind, rate, num(item, 'lineTotal'), num(item, 'quantity') || 1) * scale);
      commission = roundMoney(commission + lineCommission);
      const employeeId = str(item, 'barberEmployeeId') || str(sale, 'barberEmployeeId');
      const employee = employees.find((row) => row.id === employeeId);
      const name = str(item, 'barberName') || (employee ? str(employee, 'fullName') : '') || str(sale, 'barberName') || '—';
      names.add(name);
      const share = lineSum > 0 ? lineBases[index] / lineSum : 1 / Math.max(1, serviceItems.length);
      const lineBefore = roundMoney(before * share);
      const current = byPerson.get(employeeId || name) ?? { name, before: 0, commission: 0 };
      current.name = name;
      current.before = roundMoney(current.before + lineBefore);
      current.commission = roundMoney(current.commission + lineCommission);
      byPerson.set(employeeId || name, current);
    }
    if (serviceItems.length === 0) {
      const employeeId = str(sale, 'barberEmployeeId');
      const employee = employees.find((row) => row.id === employeeId);
      const name = (employee ? str(employee, 'fullName') : '') || str(sale, 'barberName') || '—';
      names.add(name);
      const current = byPerson.get(employeeId || name) ?? { name, before: 0, commission: 0 };
      current.name = name;
      current.before = roundMoney(current.before + before);
      byPerson.set(employeeId || name, current);
    }
    return {
      transaction: str(sale, 'transactionNumber'),
      customer: str(sale, 'customerName'),
      barber: names.size > 0 ? [...names].join('، ') : str(sale, 'barberName'),
      cashier: str(sale, 'cashierName'),
      method: asList<Payload>(sale['payments']).map((payment) => str(payment, 'method')).filter(Boolean).join(', '),
      cash: paidByMethod(sale, 'CASH'),
      visa: paidByMethod(sale, 'VISA'),
      amount: before,
      commission,
      after: roundMoney(before - commission),
    };
  });
  const commissionTotal = roundMoney([...byPerson.values()].reduce((sum, person) => sum + person.commission, 0));
  const net = roundMoney(gross - refunds);
  const total = roundMoney(buckets.CASH + buckets.VISA + buckets.WALLET + buckets.INSTAPAY + buckets.OTHER) || net;
  const afterCommission = roundMoney(total - commissionTotal);
  rows.push({
    transaction: 'TOTAL',
    customer: '',
    barber: '',
    cashier: '',
    method: '',
    cash: buckets.CASH,
    visa: buckets.VISA,
    amount: total,
    commission: commissionTotal,
    after: afterCommission,
  });
  const people = [...byPerson.values()].sort((a, b) => b.commission - a.commission || a.name.localeCompare(b.name));
  for (const person of people) {
    rows.push({
      transaction: 'عمولة',
      customer: person.name,
      barber: person.name,
      cashier: '',
      method: '',
      cash: 0,
      visa: 0,
      amount: person.before,
      commission: person.commission,
      after: roundMoney(person.before - person.commission),
    });
  }
  rows.push({
    transaction: 'بعد العمولة',
    customer: '',
    barber: '',
    cashier: '',
    method: '',
    cash: 0,
    visa: 0,
    amount: afterCommission,
    commission: commissionTotal,
    after: afterCommission,
  });
  return {
    kind: 'cashier',
    generatedAt: new Date().toISOString(),
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    tenantName: 'Nile Barbers',
    branchName: branch ? str(branch, 'name') : '',
    filters: query,
    metrics: {
      beforeCommission: total,
      commission: commissionTotal,
      afterCommission,
      total,
      cash: buckets.CASH,
      visa: buckets.VISA,
      wallet: buckets.WALLET,
      instapay: buckets.INSTAPAY,
      other: buckets.OTHER,
      transactions: sales.length,
      refunds,
      net,
      expectedCash: shifts.length ? roundMoney(shifts.reduce((sum, shift) => sum + num(shift, 'expectedCash'), 0)) : buckets.CASH,
      shifts: shifts.length,
    },
    columns: ['transaction', 'customer', 'barber', 'cashier', 'method', 'cash', 'visa', 'amount', 'commission', 'after'],
    rows,
    page: 1,
    pageSize: rows.length || 20,
    total: rows.length,
    notes: ['expected_cash_is_opening_plus_cash_sales_plus_cash_tips_minus_cash_refunds'],
  };
}

async function commissionSummary(db: NileDatabase, branchId: string) {
  const sales = (await all(db, 'sales')).filter((sale) => !branchId || str(sale, 'branchId') === branchId);
  const employees = await all(db, 'employees');
  const totals = new Map<string, { amount: number; services: number }>();
  for (const sale of sales) {
    for (const item of asList<Payload>(sale['commissions'])) {
      const current = totals.get(str(item, 'employeeId')) ?? { amount: 0, services: 0 };
      current.amount = roundMoney(current.amount + num(item, 'commissionAmount'));
      current.services += 1;
      totals.set(str(item, 'employeeId'), current);
    }
  }
  return [...totals.entries()].map(([employeeId, value]) => ({ employeeId, employeeName: str(employees.find((item) => item.id === employeeId), 'fullName'), commissionAmount: value.amount, services: value.services }));
}

async function checkoutContext(db: NileDatabase, appointmentId: string) {
  const appointment = await requireOne(db, 'appointments', appointmentId);
  const customer = await one(db, 'customers', str(appointment, 'customerId'));
  const packages = (await all(db, 'customerPackages')).filter((row) => str(row, 'customerId') === appointment['customerId'] && str(row, 'status') === 'ACTIVE');
  return {
    appointment: {
      id: appointment.id,
      appointmentNumber: str(appointment, 'appointmentNumber'),
      branchId: str(appointment, 'branchId'),
      customerId: str(appointment, 'customerId'),
      customerName: str(appointment, 'customerName'),
      customerPhone: customer ? str(customer, 'phone') : '',
      barberEmployeeId: str(appointment, 'barberEmployeeId'),
      barberName: str(appointment, 'barberName'),
      status: str(appointment, 'status'),
      checkoutStatus: str(appointment, 'checkoutStatus') || 'OPEN',
      subtotal: num(appointment, 'subtotal'),
      discount: num(appointment, 'discount'),
      total: num(appointment, 'total'),
      services: asList<Payload>(appointment['services']).map((line) => ({ serviceId: str(line, 'serviceId'), serviceName: nameOf(line['serviceName']), quantity: num(line, 'quantity'), unitPrice: num(line, 'unitPrice'), lineTotal: num(line, 'lineTotal') })),
    },
    packages: packages.map((row) => ({ id: row.id, name: nameOf(row['name']), status: str(row, 'status'), expiresAt: str(row, 'expiresAt') || null, items: asList<Payload>(row['items']).map((item) => ({ serviceId: str(item, 'serviceId'), serviceName: nameOf(item['serviceName']), remainingQuantity: num(item, 'remainingQuantity') })) })),
  };
}

async function priceServiceLines(db: NileDatabase, lines: Array<{ serviceId: string; quantity: number; barberEmployeeId?: string }>) {
  const catalog = await all(db, 'services');
  return lines.filter((line) => line.serviceId).map((line) => {
    const service = catalog.find((item) => item.id === line.serviceId);
    const quantity = line.quantity || 1;
    const unitPrice = service ? num(service, 'price') : 0;
    return {
      serviceId: line.serviceId,
      quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * quantity),
      serviceName: service ? nameOf(service['name']) : { en: line.serviceId, ar: line.serviceId },
      commissionType: service ? str(service, 'commissionType') || 'PERCENTAGE' : 'PERCENTAGE',
      commissionValue: service ? num(service, 'commissionValue') : 0,
      barberEmployeeId: line.barberEmployeeId ?? '',
    };
  });
}

function toAppointmentLine(line: { serviceId: string; quantity: number; unitPrice: number; lineTotal: number; serviceName: { en: string; ar: string }; commissionType: string; commissionValue: number }) {
  return { serviceId: line.serviceId, serviceName: line.serviceName, unitPrice: line.unitPrice, quantity: line.quantity, commissionType: line.commissionType, commissionValue: line.commissionValue, lineTotal: line.lineTotal };
}

async function findOrCreateCustomer(ctx: Ctx, fullName: string, phone: string): Promise<Doc> {
  const existing = phone ? (await all(ctx.db, 'customers')).find((row) => str(row, 'phone') === phone) : undefined;
  if (existing) return existing;
  const name = fullName.trim() || 'Walk-in';
  return writeCustomer({ ...ctx, body: { fullName: name, phone, email: '', dateOfBirth: '', gender: '', address: '', notes: '' } }, uid('cus'));
}

async function applyRedemptions(db: NileDatabase, redemptions: Payload[]) {
  for (const redemption of redemptions) {
    const pack = await one(db, 'customerPackages', str(redemption, 'customerPackageId'));
    if (!pack) fail(404, 'not_found', 'That customer package is not in the local database.');
    let remainingRequest = num(redemption, 'quantity');
    const items = asList<Payload>(pack['items']).map((item) => {
      if (str(item, 'serviceId') !== str(redemption, 'serviceId') || remainingRequest <= 0) return item;
      const used = Math.min(num(item, 'remainingQuantity'), remainingRequest);
      remainingRequest -= used;
      return { ...item, usedQuantity: num(item, 'usedQuantity') + used, remainingQuantity: num(item, 'remainingQuantity') - used };
    });
    if (remainingRequest > 0) fail(409, 'package_empty', 'The package does not have enough remaining services.');
    const status = items.every((item) => num(item, 'remainingQuantity') <= 0) ? 'EXHAUSTED' : 'ACTIVE';
    await save(db, 'customerPackages', asDoc(pack.id, { ...pack, items, status }));
  }
}

async function changeStock(db: NileDatabase, branchId: string, productId: string, delta: number, unitCost: number, movementType: string, referenceId: string, notes: string) {
  const stock = await ensureStock(db, branchId, productId);
  const onHand = num(stock, 'quantityOnHand');
  if (delta < 0 && onHand + delta < -0.0001) fail(409, 'insufficient_stock', 'There is not enough stock for that quantity.');
  const quantityOnHand = roundMoney(onHand + delta);
  const average = delta > 0 ? averageCost(onHand, num(stock, 'averageCost'), delta, unitCost) : num(stock, 'averageCost');
  const saved = await save(db, 'stock', asDoc(stock.id, { ...stock, quantityOnHand, averageCost: average, lastStockMovementAt: new Date().toISOString() }));
  await save(db, 'movements', asDoc(uid('mov'), { stockId: stock.id, branchId, productId, movementType, quantity: delta, unitCost, referenceType: movementType, referenceId: referenceId || null, notes, createdAt: new Date().toISOString() }));
  await refreshAlert(db, saved);
}

async function ensureStock(db: NileDatabase, branchId: string, productId: string): Promise<Doc> {
  const id = `${branchId}:${productId}`;
  const existing = await one(db, 'stock', id);
  if (existing) return existing;
  const product = await one(db, 'products', productId);
  return save(db, 'stock', asDoc(id, { branchId, productId, quantityOnHand: 0, averageCost: product ? num(product, 'costPrice') : 0, minimumStock: product ? num(product, 'minimumStock') : 0, lastStockMovementAt: '' }));
}

async function refreshAlert(db: NileDatabase, stock: Doc) {
  const product = await one(db, 'products', str(stock, 'productId'));
  const quantityOnHand = num(stock, 'quantityOnHand');
  const minimumStock = num(stock, 'minimumStock');
  const id = `alert:${stock.id}`;
  if (quantityOnHand > minimumStock) {
    const existing = await one(db, 'alerts', id);
    if (existing && str(existing, 'status') === 'ACTIVE') await save(db, 'alerts', asDoc(id, { ...existing, status: 'RESOLVED', quantityOnHand }));
    return;
  }
  await save(db, 'alerts', asDoc(id, { branchId: str(stock, 'branchId'), productId: str(stock, 'productId'), productName: product?.['name'] ?? { en: '', ar: '' }, sku: product ? str(product, 'sku') : '', kind: quantityOnHand <= 0 ? 'OUT' : 'LOW', status: 'ACTIVE', quantityOnHand, minimumStock }));
}

async function rebuildAlerts(db: NileDatabase, branchId: string) {
  const products = await all(db, 'products');
  for (const product of products) await refreshAlert(db, await ensureStock(db, branchId, product.id));
}

async function branchPolicy(db: NileDatabase, branchId: string): Promise<Doc> {
  if (branchId) {
    const specific = await one(db, 'policies', `policy:${branchId}`);
    if (specific) return specific;
  }
  const fallback = await one(db, 'policies', 'policy-default');
  if (fallback) return fallback;
  return asDoc('policy-default', { branchId, graceMinutes: 10, earlyLeaveGraceMinutes: 10, halfDayRatio: 0.5, overtimeRoundingMinutes: 15, weeklyDaysOff: [], publicHolidays: [], lateDeductionPerMinute: 0, earlyLeaveDeductionPerMinute: 0, absenceDeductionMode: 'NONE', dailyRateDays: 30, halfDayFactor: 0.5, overtimeMultiplier: 1.5, monthlyHours: 208 });
}

async function attendanceCounts(db: NileDatabase, branchId: string, date: string) {
  const rows = (await all(db, 'attendance')).filter((row) => str(row, 'attendanceDate') === date && (!branchId || str(row, 'branchId') === branchId));
  return countRows(rows);
}

function countRows(rows: Doc[]) {
  const count = (status: string) => rows.filter((row) => str(row, 'status') === status).length;
  return { PRESENT: count('PRESENT'), LATE: count('LATE'), ABSENT: count('ABSENT'), HALF_DAY: count('HALF_DAY'), ON_LEAVE: count('ON_LEAVE'), DAY_OFF: count('DAY_OFF'), total: rows.length };
}

async function activityFor(db: NileDatabase, employeeId: string) {
  return (await all(db, 'activity')).filter((row) => str(row, 'employeeId') === employeeId);
}

async function addHistory(ctx: Ctx, appointmentId: string, previousStatus: string, newStatus: string, reason: string) {
  await save(ctx.db, 'appointmentHistory', asDoc(uid('hist'), { appointmentId, previousStatus, newStatus, reason, changedBy: ctx.userId, changedByName: await actorName(ctx.db, ctx.userId), createdAt: new Date().toISOString() }));
}

async function actorName(db: NileDatabase, userId: string | null): Promise<string> {
  if (!userId) return 'Local user';
  const user = await one(db, 'users', userId);
  return user ? str(user, 'fullName') : 'Local user';
}

function paymentSum(body: Payload): number {
  return asList<Payload>(body['payments']).reduce((sum, payment) => sum + num(payment, 'amount'), 0);
}

function paidByMethod(sale: Doc, method: string): number {
  return roundMoney(
    asList<Payload>(sale['payments'])
      .filter((payment) => str(payment, 'method').toUpperCase() === method)
      .reduce((sum, payment) => sum + num(payment, 'amount') - num(payment, 'refundedAmount'), 0),
  );
}

function isCash(method: string): boolean {
  return method.toLowerCase().includes('cash');
}

function displayName(value: unknown): string {
  if (typeof value === 'string') return value;
  const name = nameOf(value);
  return name.ar || name.en;
}

function nameOf(value: unknown): { en: string; ar: string } {
  if (value && typeof value === 'object') {
    const record = value as Payload;
    return { en: str(record, 'en'), ar: str(record, 'ar') };
  }
  return { en: '', ar: '' };
}

function maskId(value: string): string {
  if (value.length <= 4) return value;
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function lateFrom(iso: string, policy: Doc): number {
  const opened = Date.parse(`${iso.slice(0, 10)}T10:00:00`);
  const actual = Date.parse(iso);
  if (!Number.isFinite(opened) || !Number.isFinite(actual)) return 0;
  return Math.max(0, Math.round((actual - opened) / 60000));
}

function toCsv(columns: string[], rows: Array<Record<string, string | number>>): string {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(','));
  return [header, ...body].join('\n');
}

function simplePdf(lines: string[]): Blob {
  const content = lines.slice(0, 40).map((line, index) => `BT /F1 11 Tf 48 ${800 - index * 16} Td (${pdfEscape(line)}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
}

function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
