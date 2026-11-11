import { z } from 'zod';
import { TENANT_LANGUAGES, TENANT_STATUSES, TENANT_THEMES } from './tenant.model.js';
import { isStrongPassword } from '../../shared/password.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const email = z.string().trim().email().max(160);
const password = z
  .string()
  .min(8)
  .max(72)
  .refine(isStrongPassword, 'Use 8 to 72 characters with at least one letter and one number.');
const logo = z
  .string()
  .max(240)
  .refine((value) => value === '' || /^\/api\/v1\/media\/logos\/[a-zA-Z0-9.-]+$/.test(value), 'Upload the logo through the platform.');

const currencies = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;
const timezones = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC'] as const;

export const createTenantSchema = z.object({
  body: z.object({
    businessName: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens.')
      .max(60),
    contactEmail: email,
    contactPhone: z.string().trim().min(6).max(32),
    address: z.string().trim().max(240).optional().default(''),
    logo: logo.optional().default(''),
    currency: z.enum(currencies).optional().default('EGP'),
    timezone: z.enum(timezones).optional().default('Africa/Cairo'),
    defaultLanguage: z.enum(TENANT_LANGUAGES).optional().default('en'),
    theme: z.enum(TENANT_THEMES).optional().default('dark'),
    owner: z.object({
      fullName: z.string().trim().min(2).max(120),
      email,
      phone: z.string().trim().max(32).optional().default(''),
      password,
    }),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateTenantSchema = z.object({
  body: z.object({
    businessName: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60),
    contactEmail: email,
    contactPhone: z.string().trim().min(6).max(32),
    address: z.string().trim().max(240).optional().default(''),
    logo: logo.optional().default(''),
    currency: z.enum(currencies),
    timezone: z.enum(timezones),
    defaultLanguage: z.enum(TENANT_LANGUAGES),
    theme: z.enum(TENANT_THEMES),
    owner: z.object({
      fullName: z.string().trim().min(2).max(120),
      email,
      phone: z.string().trim().max(32).optional().default(''),
    }),
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const tenantIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const tenantStatusSchema = z.object({
  body: z.object({ status: z.enum(TENANT_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const listTenantsSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional().default(''),
    status: z.enum(TENANT_STATUSES).optional(),
    sort: z.enum(['createdAt', 'businessName', 'status']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
  params: z.object({}).passthrough(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>['body'];
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>['body'];
export type ListTenantsInput = z.infer<typeof listTenantsSchema>['query'];
