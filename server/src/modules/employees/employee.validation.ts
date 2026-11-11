import { z } from 'zod';
import { objectId } from '../branches/branch.validation.js';
import { EMPLOYEE_STATUSES, SALARY_PERIODS } from './employee.model.js';
import { COMMISSION_KINDS } from '../commissions/commission.model.js';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
const money = z.number().min(0).max(10_000_000);
const photo = z
  .string()
  .max(240)
  .refine((value) => value === '' || /^\/api\/v1\/media\/employees\/[a-zA-Z0-9.-]+$/.test(value), 'Upload the photo through the barbershop.');

const salary = z.object({
  period: z.enum(SALARY_PERIODS).optional().default('MONTHLY'),
  basicSalary: money.optional().default(0),
  allowances: money.optional().default(0),
  tips: money.optional().default(0),
  deductions: money.optional().default(0),
});

const branchLink = z.object({
  branchId: objectId,
  isPrimary: z.boolean(),
});

const employeeBody = z.object({
  employeeNumber: z.string().trim().max(32).optional().default(''),
  fullName: z.string().trim().min(2).max(120),
  email: z.union([z.string().trim().email().max(160), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  profileImage: photo.optional().default(''),
  nationalId: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  dateOfBirth: z.union([dateOnly, z.literal('')]).optional().default(''),
  joiningDate: dateOnly,
  employmentTypeId: objectId,
  jobTitleId: objectId,
  salary: salary.optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  branches: z.array(branchLink).max(30).optional().default([]),
});

export const createEmployeeSchema = z.object({
  body: employeeBody.superRefine((value, context) => {
    const primary = value.branches.filter((branch) => branch.isPrimary);
    if (value.branches.length > 0 && primary.length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose one primary branch.', path: ['branches'] });
    }
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateEmployeeSchema = z.object({
  body: employeeBody.superRefine((value, context) => {
    const primary = value.branches.filter((branch) => branch.isPrimary);
    if (value.branches.length > 0 && primary.length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose one primary branch.', path: ['branches'] });
    }
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const employeeIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const employeeStatusSchema = z.object({
  body: z.object({ status: z.enum(EMPLOYEE_STATUSES) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const listEmployeesSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(80).optional().default(''),
    status: z.union([z.enum(EMPLOYEE_STATUSES), z.literal('')]).optional().default(''),
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const assignBranchSchema = z.object({
  body: z.object({ branchId: objectId, isPrimary: z.boolean().optional().default(false) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const primaryBranchSchema = z.object({
  body: z.object({ branchId: objectId }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const removeBranchSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId, branchId: objectId }),
});

export const employeeCommissionSchema = z.object({
  body: z.object({
    serviceCode: z.string().trim().min(1).max(40),
    kind: z.enum(COMMISSION_KINDS),
    value: money,
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const employeeCommissionIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId, ruleId: objectId }),
});

export const catalogSchema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(80) }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const catalogStatusSchema = z.object({
  body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export type EmployeeBody = z.infer<typeof employeeBody>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesSchema>['query'];
