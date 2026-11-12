import { HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { from, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../api/api-error';
import type { AuthUser } from '../auth/auth.models';

const SESSION_KEY = 'enzo.project-user';

interface ShopUser extends AuthUser {
  password: string;
  isOwner: boolean;
  branchScope: 'ALL' | 'SELECTED';
  permissions: string[];
  roleName: string;
}

interface ShopEmployee {
  id: string;
  employeeNumber: string;
  fullName: string;
  userId: string | null;
  status: string;
  branches: Array<{ branchId: string; status: string }>;
}

interface ShopFile {
  branch: { id: string; name: string; code: string; status: string };
  users: ShopUser[];
  employees: ShopEmployee[];
  entitlements: unknown;
  home: { owner: unknown; cashier: unknown };
  serviceCategories: unknown[];
  services: ShopService[];
}

interface ShopService {
  id: string;
  name: { en: string; ar: string };
  categoryId: string;
  price: number;
  status: string;
}

let shopFile: Promise<ShopFile> | null = null;

export const projectJsonInterceptor: HttpInterceptorFn = (request, next) => {
  if (!environment.useProjectJson || !request.url.includes('/api/')) {
    return next(request);
  }
  return from(answer(request)).pipe(switchMap((result) => result));
};

async function answer(request: HttpRequest<unknown>) {
  const shop = await loadShop();
  const path = pathOf(request.url);
  const method = request.method.toUpperCase();

  if (method === 'POST' && path.startsWith('/v1/auth/login')) {
    return login(shop, request.body);
  }
  if (method === 'POST' && path.startsWith('/v1/auth/refresh')) {
    return refresh(shop);
  }
  if (method === 'POST' && (path.startsWith('/v1/auth/logout') || path.startsWith('/v1/auth/change-password'))) {
    sessionStorage.removeItem(SESSION_KEY);
    return ok(null);
  }
  if (method === 'POST' && path.startsWith('/v1/auth/forgot-password')) {
    return ok({ data: { message: 'If an account exists for that email, the reset request has been saved.' } });
  }

  const user = currentUser(shop);
  if (!user) {
    return fail(401, 'unauthenticated', 'Sign in is required.');
  }
  if (method === 'GET' && path.startsWith('/v1/access')) {
    return ok({
      data: {
        isOwner: user.isOwner,
        permissions: user.permissions,
        branchScope: user.branchScope,
        branches: [shop.branch],
      },
    });
  }
  if (method === 'GET' && path.startsWith('/v1/billing/entitlements')) {
    return ok({ data: shop.entitlements });
  }
  if (method === 'GET' && path.startsWith('/v1/reports/home')) {
    return ok({ data: user.isOwner ? shop.home.owner : shop.home.cashier });
  }
  if (method === 'GET' && (path === '/v1/users' || path.startsWith('/v1/users?'))) {
    return ok(page(shop.users.map((user) => presentUser(user, shop))));
  }
  if (method === 'GET' && (path === '/v1/employees' || path.startsWith('/v1/employees?'))) {
    return ok(page(shop.employees));
  }
  if (method === 'GET' && path.startsWith('/v1/appointments/barbers')) {
    const branchId = new URLSearchParams(request.url.includes('?') ? request.url.slice(request.url.indexOf('?') + 1) : '').get('branchId') ?? '';
    const barbers = shop.employees.filter((employee) => employee.status === 'ACTIVE' && employee.branches.some((branch) => branch.status === 'ACTIVE' && branch.branchId === branchId));
    return ok({ data: barbers.map((employee) => ({ id: employee.id, fullName: employee.fullName })) });
  }
  if (method === 'GET' && (path === '/v1/service-categories' || path.startsWith('/v1/service-categories?'))) {
    return ok({ data: shop.serviceCategories });
  }
  if (method === 'GET' && (path === '/v1/services' || path.startsWith('/v1/services?'))) {
    return ok(servicePage(shop.services, request.url));
  }
  const service = path.match(/^\/v1\/services\/([a-f\d]{24})$/i);
  if (method === 'GET' && service) {
    return ok({ data: shop.services.find((item) => item.id === service[1]) ?? null });
  }
  if (method === 'GET') {
    return ok(page([]));
  }
  return ok({ data: request.body ?? {} });
}

function login(shop: ShopFile, body: unknown) {
  const input = body as { email?: string; password?: string } | null;
  const email = input?.email?.trim().toLowerCase() ?? '';
  const user = shop.users.find((item) => item.email.toLowerCase() === email && item.password === input?.password);
  if (!user || user.status !== 'ACTIVE') {
    return fail(401, 'invalid_credentials', 'The email or password is incorrect.');
  }
  sessionStorage.setItem(SESSION_KEY, user.id);
  return ok({
    data: {
      accessToken: 'project-json',
      expiresIn: 900,
      user: publicUser(user),
    },
  });
}

function refresh(shop: ShopFile) {
  const user = currentUser(shop);
  if (!user) {
    return fail(401, 'unauthenticated', 'Sign in is required.');
  }
  return ok({
    data: {
      accessToken: 'project-json',
      expiresIn: 900,
      user: publicUser(user),
    },
  });
}

function currentUser(shop: ShopFile): ShopUser | undefined {
  const id = sessionStorage.getItem(SESSION_KEY);
  return id ? shop.users.find((user) => user.id === id) : undefined;
}

function publicUser(user: ShopUser): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    userType: user.userType,
    tenantId: user.tenantId,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt,
  };
}

function presentUser(user: ShopUser, shop: ShopFile) {
  const employee = shop.employees.find((item) => item.userId === user.id);
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    isOwner: user.isOwner,
    employee: employee ? { id: employee.id, fullName: employee.fullName, employeeNumber: employee.employeeNumber } : null,
    lastLoginAt: user.lastLoginAt,
    roles: [
      {
        id: user.id,
        roleId: user.id,
        roleName: user.roleName,
        roleStatus: 'ACTIVE',
        permissions: user.permissions,
        branchScope: user.branchScope,
        branchIds: user.branchScope === 'ALL' ? [] : ['6aedf5c7d4042507f6a49b05'],
      },
    ],
  };
}

function page(data: unknown[]) {
  return { data, meta: { page: 1, pageSize: 20, total: data.length } };
}

function servicePage(services: ShopService[], url: string) {
  const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
  const pageNumber = Math.max(1, Number(query.get('page') ?? 1) || 1);
  const pageSize = Math.max(1, Number(query.get('pageSize') ?? 20) || 20);
  const search = (query.get('search') ?? '').trim().toLowerCase();
  const status = query.get('status') ?? '';
  const categoryId = query.get('categoryId') ?? '';
  const filtered = services.filter((service) => {
    if (status && service.status !== status) return false;
    if (categoryId && service.categoryId !== categoryId) return false;
    if (!search) return true;
    return `${service.name.en} ${service.name.ar}`.toLowerCase().includes(search);
  });
  const start = (pageNumber - 1) * pageSize;
  return { data: filtered.slice(start, start + pageSize), meta: { page: pageNumber, pageSize, total: filtered.length } };
}

function ok(body: unknown) {
  return of(new HttpResponse({ status: 200, body }));
}

function fail(status: number, code: string, message: string) {
  return throwError(() => new ApiError(status, code, message));
}

function pathOf(url: string): string {
  const marker = '/v1/';
  const index = url.indexOf(marker);
  return index >= 0 ? url.slice(index).split('#')[0] : url;
}

async function loadShop(): Promise<ShopFile> {
  shopFile ??= fetch(new URL('assets/shop.json', document.baseURI))
    .then((response) => {
      if (!response.ok) {
        throw new ApiError(response.status, 'shop_file', 'The shop file could not be read.');
      }
      return response.json() as Promise<ShopFile>;
    })
    .catch((error: unknown) => {
      shopFile = null;
      throw error;
    });
  return shopFile;
}
