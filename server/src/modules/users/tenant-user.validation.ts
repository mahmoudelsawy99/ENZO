import { z } from 'zod';
import { isStrongPassword } from '../../shared/password.js';
import { objectId } from '../branches/branch.validation.js';
import { USER_STATUSES } from './user.model.js';

const password = z
  .string()
  .min(8)
  .max(72)
  .refine(isStrongPassword, 'Use 8 to 72 characters with at least one letter and one number.');

const profile = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(32).optional().default(''),
});

export const createUserSchema = z.object({
  body: profile.extend({ password }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateUserSchema = z.object({
  body: profile,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const userIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const userStatusSchema = z.object({
  body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const resetUserPasswordSchema = z.object({
  body: z.object({ password }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const linkEmployeeSchema = z.object({
  body: z.object({ employeeId: z.union([objectId, z.null()]) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const listUsersSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([z.enum(USER_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export type UserProfile = z.infer<typeof profile>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
