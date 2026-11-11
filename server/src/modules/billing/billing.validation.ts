import { z } from 'zod';
import { BILLING_INTERVALS, FEATURES, SUBSCRIPTION_STATUSES } from './billing.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const empty = z.object({}).passthrough();

export const planUpdateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(400).optional().default(''),
    monthlyPrice: z.number().min(0).max(1000000),
    yearlyPrice: z.number().min(0).max(10000000),
    currency: z.string().trim().length(3),
    maximumBranches: z.number().int().min(1).max(100000),
    maximumUsers: z.number().int().min(1).max(100000),
    maximumEmployees: z.number().int().min(1).max(100000),
    maximumStorage: z.number().int().min(1).max(10000000),
    enabledFeatures: z.array(z.enum(FEATURES)).max(FEATURES.length),
    trialDays: z.number().int().min(0).max(90),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const assignSchema = z.object({
  body: z.object({
    tenantId: objectId,
    planId: objectId,
    billingInterval: z.enum(BILLING_INTERVALS),
  }),
  params: empty,
  query: empty,
});

export const subscriptionUpdateSchema = z.object({
  body: z.object({
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    billingInterval: z.enum(BILLING_INTERVALS).optional(),
    maximumBranches: z.number().int().min(1).max(100000).optional(),
    maximumUsers: z.number().int().min(1).max(100000).optional(),
    maximumEmployees: z.number().int().min(1).max(100000).optional(),
    enabledFeatures: z.array(z.enum(FEATURES)).max(FEATURES.length).optional(),
  }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const invoiceSchema = z.object({
  body: z.object({
    tenantId: objectId,
    subscriptionId: objectId,
    amount: z.number().min(0).max(10000000),
    taxAmount: z.number().min(0).max(10000000).optional().default(0),
    currency: z.string().trim().length(3).optional().default('EGP'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  params: empty,
  query: empty,
});

export const paymentSchema = z.object({
  body: z.object({
    amount: z.number().min(0).max(10000000),
    status: z.enum(['PAID', 'FAILED', 'REFUNDED', 'CANCELLED']),
    reference: z.string().trim().max(80).optional().default(''),
    note: z.string().trim().max(240).optional().default(''),
  }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const listSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({ status: z.enum(['', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']).optional().default('') }),
});

export const idSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({ format: z.enum(['pdf', 'html']).optional() }),
});

export const jobSchema = z.object({
  body: z.object({
    type: z.enum(['whatsapp.retry', 'subscription.reminders']),
    idempotencyKey: z.string().trim().min(8).max(80),
    tenantId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: empty,
  query: empty,
});
