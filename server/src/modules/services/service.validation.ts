import { z } from 'zod';
import { CATEGORY_STATUSES } from './service-category.model.js';
import { COMMISSION_TYPES, SERVICE_STATUSES } from './service.model.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');

const localizedName = z.object({
  en: z.string().trim().min(2).max(120),
  ar: z.string().trim().max(120).optional().default(''),
});

const localizedText = z.object({
  en: z.string().trim().max(500).optional().default(''),
  ar: z.string().trim().max(500).optional().default(''),
});

const money = z.number().min(0).max(1_000_000);
const listQuery = {
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(80).optional().default(''),
};

export const listServicesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...listQuery,
    status: z.union([z.enum(SERVICE_STATUSES), z.literal('')]).optional().default(''),
    categoryId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

const serviceBody = z.object({
  name: localizedName,
  description: localizedText.optional().default({ en: '', ar: '' }),
  categoryId: objectId,
  image: z.string().trim().max(240).optional().default(''),
  price: money,
  commissionType: z.enum(COMMISSION_TYPES),
  commissionValue: z.number().min(0).max(1_000_000),
});

export const createServiceSchema = z.object({
  body: serviceBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateServiceSchema = z.object({
  body: serviceBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const serviceIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const serviceStatusSchema = z.object({
  body: z.object({ status: z.enum(SERVICE_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const serviceSettingsSchema = z.object({
  body: z.object({ maxCommissionPercent: z.number().min(0).max(100) }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const categoryBody = z.object({
  name: localizedName,
  status: z.enum(CATEGORY_STATUSES).optional().default('ACTIVE'),
});

export const createCategorySchema = z.object({
  body: categoryBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateCategorySchema = z.object({
  body: categoryBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export type ServiceBody = z.infer<typeof serviceBody>;
export type CategoryBody = z.infer<typeof categoryBody>;
export type ListServicesQuery = z.infer<typeof listServicesSchema>['query'];
