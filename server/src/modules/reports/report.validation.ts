import { z } from 'zod';
import { objectId } from '../branches/branch.validation.js';

const optionalId = z.union([objectId, z.literal('')]).optional().default('');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default('');

export const reportQuerySchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({ kind: z.string().trim().min(2).max(40) }),
  query: z.object({
    from: date,
    to: date,
    branchId: optionalId,
    employeeId: optionalId,
    categoryId: optionalId,
    paymentMethod: z.enum(['', 'CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER']).optional().default(''),
    status: z.enum(['', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional().default(''),
    section: z.string().trim().max(40).optional().default(''),
    payrollStatus: z.enum(['', 'DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED']).optional().default(''),
    lang: z.enum(['en', 'ar']).optional().default('en'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  }),
});

export const homeSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const exportSchema = reportQuerySchema.extend({
  query: reportQuerySchema.shape.query.extend({
    format: z.enum(['csv', 'xlsx', 'pdf', 'html']),
  }),
});
