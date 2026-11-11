import { z } from 'zod';
import { WEEK_DAYS } from './branch.model.js';
import { BRANCH_STATUSES } from './branch.model.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time.');
const day = z
  .object({
    isOpen: z.boolean(),
    openingTime: time,
    closingTime: time,
  })
  .superRefine((value, context) => {
    if (value.isOpen && value.openingTime >= value.closingTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Closing time must be after opening time.',
        path: ['closingTime'],
      });
    }
  });

const workingHours = z.object({
  saturday: day,
  sunday: day,
  monday: day,
  tuesday: day,
  wednesday: day,
  thursday: day,
  friday: day,
});

const branchBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,15}$/, 'Use 2 to 16 letters, numbers, or hyphens.'),
  address: z.string().trim().max(240).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  workingHours,
  managerUserId: z.union([objectId, z.literal('')]).optional().default(''),
});

export const createBranchSchema = z.object({
  body: branchBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateBranchSchema = z.object({
  body: branchBody,
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const branchIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const branchStatusSchema = z.object({
  body: z.object({ status: z.enum(BRANCH_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const listBranchesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([z.enum(BRANCH_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export type BranchBody = z.infer<typeof branchBody>;
export type ListBranchesQuery = z.infer<typeof listBranchesSchema>['query'];

void WEEK_DAYS;
