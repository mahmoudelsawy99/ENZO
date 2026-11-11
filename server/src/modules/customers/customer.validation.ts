import { z } from 'zod';
import { CUSTOMER_GENDERS, CUSTOMER_STATUSES } from './customer.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const dateText = z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');

const customerBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional().default(''),
  email: z.union([z.string().trim().email().max(160), z.literal('')]).optional().default(''),
  dateOfBirth: dateText.optional().default(''),
  gender: z.enum(CUSTOMER_GENDERS).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
});

const listQuery = {
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(80).optional().default(''),
};

export const listCustomersSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...listQuery,
    status: z.union([z.enum(CUSTOMER_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const createCustomerSchema = z.object({
  body: customerBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateCustomerSchema = z.object({
  body: customerBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const customerIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const customerStatusSchema = z.object({
  body: z.object({ status: z.enum(CUSTOMER_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const customerNoteSchema = z.object({
  body: z.object({ content: z.string().trim().min(1).max(1000) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const customerSettingsSchema = z.object({
  body: z.object({ uniquePhone: z.boolean() }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const assignPackageSchema = z.object({
  body: z.object({ packageTemplateId: objectId }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export type CustomerBody = z.infer<typeof customerBody>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>['query'];
