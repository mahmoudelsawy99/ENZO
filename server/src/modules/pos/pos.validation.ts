import { z } from 'zod';
import { PAYMENT_METHODS, SHIFT_TYPES } from './sale.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const money = z.number().min(0).max(1_000_000);

export const listPosSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    search: z.string().trim().max(80).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const posAppointmentSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const checkoutSchema = z.object({
  body: z.object({
    appointmentId: objectId,
    idempotencyKey: z.string().trim().min(8).max(80),
    redemptions: z
      .array(z.object({ customerPackageId: objectId, serviceId: objectId, quantity: z.number().int().min(1).max(99) }))
      .max(20)
      .optional()
      .default([]),
    additionalDiscount: money.optional().default(0),
    payments: z.array(z.object({
      method: z.enum(PAYMENT_METHODS),
      amount: money,
      referenceNumber: z.string().trim().max(80).optional().default(''),
    })).max(8),
    tips: z.array(z.object({
      employeeId: objectId,
      amount: z.number().min(0.01).max(1_000_000),
      method: z.enum(PAYMENT_METHODS),
      referenceNumber: z.string().trim().max(80).optional().default(''),
    })).max(8).optional().default([]),
    products: z.array(z.object({
      productId: objectId,
      quantity: z.number().int().min(1).max(999),
    })).max(30).optional().default([]),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const listTransactionsSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    search: z.string().trim().max(80).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const transactionIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const refundCreateSchema = z.object({
  body: z.object({
    transactionId: objectId,
    paymentId: objectId,
    amount: z.number().min(0.01).max(1_000_000),
    reason: z.string().trim().min(2).max(500),
    method: z.enum(PAYMENT_METHODS),
    referenceNumber: z.string().trim().max(80).optional().default(''),
    restock: z.boolean().optional().default(false),
    restockItems: z.array(z.object({
      productId: objectId,
      quantity: z.number().int().min(1).max(999),
    })).max(30).optional().default([]),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const refundListSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const refundIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const openShiftSchema = z.object({
  body: z.object({
    branchId: objectId,
    shiftType: z.enum(SHIFT_TYPES),
    openingBalance: money,
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const closeShiftSchema = z.object({
  body: z.object({ actualCash: money }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const shiftQuerySchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    branchId: objectId,
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
  params: z.object({}).passthrough(),
});

export const currentShiftSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({ branchId: objectId }),
  params: z.object({}).passthrough(),
});

export const commissionSummarySchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    from: z.string().optional().default(''),
    to: z.string().optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

const serviceLines = z
  .array(z.object({ serviceId: objectId, quantity: z.number().int().min(1).max(99) }))
  .min(1)
  .max(20)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.serviceId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each service can be added once.', path: ['serviceId'] });
        return;
      }
      seen.add(item.serviceId);
    }
  });

export const createOrderSchema = z.object({
  body: z.object({
    branchId: objectId,
    barberEmployeeId: objectId,
    extraBarberIds: z.array(objectId).max(10).optional().default([]),
    customer: z.object({
      fullName: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(8).max(32),
    }),
    services: serviceLines,
    idempotencyKey: z.string().trim().min(8).max(80),
    additionalDiscount: money.optional().default(0),
    payments: z.array(z.object({
      method: z.enum(PAYMENT_METHODS),
      amount: money,
      referenceNumber: z.string().trim().max(80).optional().default(''),
    })).min(1).max(8),
    tips: z.array(z.object({
      employeeId: objectId,
      amount: z.number().min(0.01).max(1_000_000),
      method: z.enum(PAYMENT_METHODS),
      referenceNumber: z.string().trim().max(80).optional().default(''),
    })).max(8).optional().default([]),
    products: z.array(z.object({
      productId: objectId,
      quantity: z.number().int().min(1).max(999),
    })).max(30).optional().default([]),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export type CheckoutBody = z.infer<typeof checkoutSchema>['body'];
export type CounterOrderBody = z.infer<typeof createOrderSchema>['body'];
export type RefundBody = z.infer<typeof refundCreateSchema>['body'];
