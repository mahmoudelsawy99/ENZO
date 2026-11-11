import { z } from 'zod';
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from './appointment.model.js';
import { QUEUE_STATUSES } from './queue.model.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');

const when = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid date and time.');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');

const serviceLine = z.object({
  serviceId: objectId,
  quantity: z.number().int().min(1).max(99),
});

const serviceLines = z.array(serviceLine).min(1).max(20).superRefine((items, context) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.serviceId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each service can be added once.', path: ['serviceId'] });
      return;
    }
    seen.add(item.serviceId);
  }
});

const extraBarberIds = z.array(objectId).max(10).optional().default([]);

const bookingBody = z.object({
  branchId: objectId,
  customerId: objectId,
  barberEmployeeId: objectId,
  extraBarberIds,
  scheduledAt: when,
  services: serviceLines,
  discount: z.number().min(0).max(1_000_000).optional().default(0),
  notes: z.string().trim().max(1000).optional().default(''),
});

const walkInCustomer = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional().default(''),
  email: z.union([z.string().trim().email().max(160), z.literal('')]).optional().default(''),
  dateOfBirth: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().default(''),
  gender: z.enum(['', 'MALE', 'FEMALE']).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
});

const listQuery = {
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(80).optional().default(''),
};

export const listAppointmentsSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    ...listQuery,
    branchId: z.union([objectId, z.literal('')]).optional().default(''),
    status: z.union([z.enum(APPOINTMENT_STATUSES), z.literal('')]).optional().default(''),
    type: z.union([z.enum(APPOINTMENT_TYPES), z.literal('')]).optional().default(''),
    barberEmployeeId: z.union([objectId, z.literal('')]).optional().default(''),
    customerId: z.union([objectId, z.literal('')]).optional().default(''),
    from: z.union([when, z.literal('')]).optional().default(''),
    to: z.union([when, z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const createAppointmentSchema = z.object({
  body: bookingBody,
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const updateAppointmentSchema = z.object({
  body: bookingBody.omit({ branchId: true, scheduledAt: true }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const appointmentIdSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const rescheduleSchema = z.object({
  body: z.object({
    scheduledAt: when,
    reason: z.string().trim().max(500).optional().default(''),
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const reasonSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(2).max(500),
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: objectId }),
});

export const walkInSchema = z.object({
  body: z
    .object({
      branchId: objectId,
      customerId: objectId.optional(),
      customer: walkInCustomer.optional(),
      barberEmployeeId: objectId,
      extraBarberIds,
      services: serviceLines,
      notes: z.string().trim().max(1000).optional().default(''),
    })
    .superRefine((value, context) => {
      if (!value.customerId && !value.customer) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose or create a customer.', path: ['customerId'] });
      }
    }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export const barberQuerySchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({ branchId: objectId }),
  params: z.object({}).passthrough(),
});

export const listQueueSchema = z.object({
  body: z.object({}).passthrough(),
  query: z.object({
    branchId: objectId,
    queueDate: dateKey,
    barberEmployeeId: z.union([objectId, z.literal('')]).optional().default(''),
    status: z.union([z.enum(QUEUE_STATUSES), z.literal('')]).optional().default(''),
  }),
  params: z.object({}).passthrough(),
});

export const reorderQueueSchema = z.object({
  body: z.object({
    branchId: objectId,
    queueDate: dateKey,
    entryIds: z.array(objectId).min(1).max(500),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export type BookingBody = z.infer<typeof bookingBody>;
export type UpdateAppointmentBody = z.infer<typeof updateAppointmentSchema>['body'];
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsSchema>['query'];
export type WalkInBody = z.infer<typeof walkInSchema>['body'];
export type ListQueueQuery = z.infer<typeof listQueueSchema>['query'];
export type ReorderQueueBody = z.infer<typeof reorderQueueSchema>['body'];
