import { z } from 'zod';
import { objectId } from '../branches/branch.validation.js';
import { PERMISSION_KEYS } from '../access/permissions.js';
import { ROLE_STATUSES } from './role.model.js';
import { BRANCH_SCOPES } from './user-role.model.js';

const permission = z.string().refine((value): value is (typeof PERMISSION_KEYS)[number] => {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}, 'Choose a permission from the catalog.');

const roleBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().default(''),
  permissions: z.array(permission).min(1).max(PERMISSION_KEYS.length),
});

export const createRoleSchema = z.object({
  body: roleBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateRoleSchema = z.object({
  body: roleBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const roleIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const roleStatusSchema = z.object({
  body: z.object({ status: z.enum(ROLE_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const duplicateRoleSchema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(80) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const listRolesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([z.enum(ROLE_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

const assignment = z.object({
  roleId: objectId,
  branchScope: z.enum(BRANCH_SCOPES),
  branchIds: z.array(objectId).max(50),
});

export const assignRolesSchema = z.object({
  body: z.object({ assignments: z.array(assignment).max(20) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export type RoleBody = z.infer<typeof roleBody>;
export type ListRolesQuery = z.infer<typeof listRolesSchema>['query'];
export type RoleAssignmentInput = z.infer<typeof assignment>;
