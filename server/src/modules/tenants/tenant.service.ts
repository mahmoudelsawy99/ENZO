import { hashPassword } from '../../shared/password.js';
import { HttpError } from '../../shared/http-error.js';
import { duplicateField, runInTransaction } from '../../shared/mongo.js';
import { cleanupTenantDefaults, seedTenantDefaults } from '../access/seed.js';
import { User } from '../users/user.model.js';
import { subscriptionOverview } from '../billing/billing.service.js';
import { normalizeEmail } from '../users/user.service.js';
import { Tenant, type TenantStatus } from './tenant.model.js';
import type { CreateTenantInput, ListTenantsInput, UpdateTenantInput } from './tenant.validation.js';

export interface PublicOwner {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface PublicTenant {
  id: string;
  businessName: string;
  slug: string;
  logo: string;
  ownerUserId: string | null;
  owner: PublicOwner | null;
  contactEmail: string;
  contactPhone: string;
  address: string;
  currency: string;
  timezone: string;
  defaultLanguage: 'en' | 'ar';
  theme: 'dark' | 'light';
  status: TenantStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function conflict(field: string): HttpError {
  if (field === 'slug') {
    return new HttpError(409, 'slug_taken', 'This business slug is already in use.');
  }
  if (field === 'email') {
    return new HttpError(409, 'email_taken', 'This email is already in use.');
  }
  return new HttpError(409, 'conflict', 'This record conflicts with an existing one.');
}

function readOwner(value: unknown): PublicOwner | null {
  if (!value || typeof value !== 'object' || !('email' in value) || !('fullName' in value)) {
    return null;
  }
  const owner = value as { id?: string; _id?: { toString(): string }; fullName: string; email: string; phone?: string };
  const id = owner.id ?? (owner._id ? String(owner._id) : '');
  if (!id) {
    return null;
  }
  return { id, fullName: owner.fullName, email: owner.email, phone: owner.phone ?? '' };
}

function serialize(tenant: {
  id: string;
  businessName: string;
  slug: string;
  logo?: string | null;
  ownerUserId?: unknown;
  contactEmail: string;
  contactPhone: string;
  address?: string | null;
  currency: string;
  timezone: string;
  defaultLanguage: 'en' | 'ar';
  theme: 'dark' | 'light';
  status: TenantStatus;
  settings?: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PublicTenant {
  const owner = readOwner(tenant.ownerUserId);
  return {
    id: tenant.id,
    businessName: tenant.businessName,
    slug: tenant.slug,
    logo: tenant.logo ?? '',
    ownerUserId: owner?.id ?? null,
    owner,
    contactEmail: tenant.contactEmail,
    contactPhone: tenant.contactPhone,
    address: tenant.address ?? '',
    currency: tenant.currency,
    timezone: tenant.timezone,
    defaultLanguage: tenant.defaultLanguage,
    theme: tenant.theme,
    status: tenant.status,
    settings: tenant.settings && typeof tenant.settings === 'object' ? (tenant.settings as Record<string, unknown>) : {},
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

async function present(id: string): Promise<PublicTenant> {
  const tenant = await Tenant.findById(id).populate('ownerUserId', 'fullName email phone');
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Tenant was not found.');
  }
  return serialize(tenant);
}

export async function createTenant(
  input: CreateTenantInput,
  idempotencyKey: string | undefined,
): Promise<{ tenant: PublicTenant; replayed: boolean }> {
  const key = idempotencyKey?.trim() ?? '';
  if (key) {
    const existing = await Tenant.findOne({ idempotencyKey: key });
    if (existing) {
      return { tenant: await present(existing.id), replayed: true };
    }
  }

  const ownerEmail = normalizeEmail(input.owner.email);
  const passwordHash = await hashPassword(input.owner.password);

  try {
    const tenantId = await runInTransaction(async (session) => {
      const tenant = new Tenant({
        businessName: input.businessName.trim(),
        slug: input.slug,
        logo: input.logo,
        contactEmail: normalizeEmail(input.contactEmail),
        contactPhone: input.contactPhone.trim(),
        address: input.address,
        currency: input.currency,
        timezone: input.timezone,
        defaultLanguage: input.defaultLanguage,
        theme: input.theme,
        status: 'ACTIVE',
        settings: {},
        ...(key ? { idempotencyKey: key } : {}),
      });
      if (session) {
        await tenant.save({ session });
      } else {
        await tenant.save();
      }

      try {
        const owner = new User({
          fullName: input.owner.fullName.trim(),
          email: ownerEmail,
          passwordHash,
          phone: input.owner.phone,
          userType: 'TENANT_USER',
          tenantId: tenant._id,
          status: 'ACTIVE',
          isEmailVerified: true,
        });
        if (session) {
          await owner.save({ session });
        } else {
          await owner.save();
        }
        tenant.ownerUserId = owner._id;
        if (session) {
          await tenant.save({ session });
        } else {
          await tenant.save();
        }
        await seedTenantDefaults(String(tenant._id), String(owner._id), session);
        return tenant.id as string;
      } catch (error) {
        if (!session) {
          await cleanupTenantDefaults(String(tenant._id));
          await User.deleteOne({ email: ownerEmail });
          await Tenant.deleteOne({ _id: tenant._id });
        }
        throw error;
      }
    });
    return { tenant: await present(tenantId), replayed: false };
  } catch (error) {
    const field = duplicateField(error);
    if (field === 'idempotencyKey' && key) {
      const existing = await Tenant.findOne({ idempotencyKey: key });
      if (existing) {
        return { tenant: await present(existing.id), replayed: true };
      }
    }
    if (field) {
      throw conflict(field);
    }
    throw error;
  }
}

export async function listTenants(query: ListTenantsInput): Promise<{ data: PublicTenant[]; meta: { page: number; pageSize: number; total: number } }> {
  const filter: { status?: TenantStatus; $or?: Array<Record<string, RegExp>> } = {};
  if (query.status) {
    filter.status = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ businessName: pattern }, { slug: pattern }, { contactEmail: pattern }, { contactPhone: pattern }];
  }
  const direction = query.order === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Tenant.find(filter)
      .sort({ [query.sort]: direction })
      .skip(skip)
      .limit(query.pageSize)
      .populate('ownerUserId', 'fullName email phone'),
    Tenant.countDocuments(filter),
  ]);
  return {
    data: items.map((item) => serialize(item)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getTenant(id: string): Promise<PublicTenant> {
  return present(id);
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<PublicTenant> {
  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Tenant was not found.');
  }
  const owner = tenant.ownerUserId ? await User.findById(tenant.ownerUserId) : null;
  if (!owner) {
    throw new HttpError(409, 'owner_missing', 'This tenant has no owner account.');
  }

  const nextEmail = normalizeEmail(input.owner.email);
  const emailTaken = await User.findOne({ email: nextEmail, _id: { $ne: owner._id } });
  if (emailTaken) {
    throw new HttpError(409, 'email_taken', 'This email is already in use.');
  }
  const slugTaken = await Tenant.findOne({ slug: input.slug, _id: { $ne: tenant._id } });
  if (slugTaken) {
    throw new HttpError(409, 'slug_taken', 'This business slug is already in use.');
  }

  await runInTransaction(async (session) => {
    tenant.businessName = input.businessName.trim();
    tenant.slug = input.slug;
    tenant.logo = input.logo;
    tenant.contactEmail = normalizeEmail(input.contactEmail);
    tenant.contactPhone = input.contactPhone.trim();
    tenant.address = input.address;
    tenant.currency = input.currency;
    tenant.timezone = input.timezone;
    tenant.defaultLanguage = input.defaultLanguage;
    tenant.theme = input.theme;
    owner.fullName = input.owner.fullName.trim();
    owner.email = nextEmail;
    owner.phone = input.owner.phone;
    if (session) {
      await owner.save({ session });
      await tenant.save({ session });
    } else {
      await owner.save();
      await tenant.save();
    }
  });

  return present(tenant.id);
}

export async function setTenantStatus(id: string, status: TenantStatus): Promise<PublicTenant> {
  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Tenant was not found.');
  }
  tenant.status = status;
  await tenant.save();
  return present(tenant.id);
}

export async function tenantForAuthenticatedUser(tenantId: string | null): Promise<PublicTenant> {
  if (!tenantId) {
    throw new HttpError(403, 'forbidden', 'This account is not inside a tenant.');
  }
  return present(tenantId);
}

export async function platformDashboard(): Promise<{
  totals: { tenants: number; active: number; suspended: number; inactive: number; users: number };
  statusDistribution: Array<{ status: TenantStatus; count: number }>;
  createdOverTime: Array<{ date: string; count: number }>;
  recentTenants: PublicTenant[];
  subscriptions: Awaited<ReturnType<typeof subscriptionOverview>>;
}> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [grouped, users, recent, created, subscriptions] = await Promise.all([
    Tenant.aggregate<{ _id: TenantStatus; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments(),
    Tenant.find().sort({ createdAt: -1 }).limit(5).populate('ownerUserId', 'fullName email phone'),
    Tenant.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Cairo' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    subscriptionOverview(),
  ]);
  const countOf = (status: TenantStatus) => grouped.find((item) => item._id === status)?.count ?? 0;
  const active = countOf('ACTIVE');
  const suspended = countOf('SUSPENDED');
  const inactive = countOf('INACTIVE');
  return {
    totals: { tenants: active + suspended + inactive, active, suspended, inactive, users },
    statusDistribution: [
      { status: 'ACTIVE', count: active },
      { status: 'SUSPENDED', count: suspended },
      { status: 'INACTIVE', count: inactive },
    ],
    createdOverTime: created.map((item) => ({ date: item._id, count: item.count })),
    recentTenants: recent.map((item) => serialize(item)),
    subscriptions,
  };
}
