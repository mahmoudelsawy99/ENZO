import { Schema, model, type InferSchemaType } from 'mongoose';
import { CHECKOUT_STATUSES } from '../pos/sale.model.js';
import { COMMISSION_TYPES } from '../services/service.model.js';

export const APPOINTMENT_TYPES = ['BOOKING', 'WALK_IN'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'WAITING',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Statuses an appointment is allowed to enter from its current status.
 * Walk-ins are created directly as WAITING. Every other move goes through this map.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['WAITING', 'CANCELLED'],
  WAITING: ['IN_SERVICE', 'CANCELLED'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const nameSchema = new Schema(
  {
    en: { type: String, required: true, trim: true, maxlength: 120 },
    ar: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { _id: false },
);

/**
 * Prices and commission are copied from the service at the time the line is added.
 * Later catalog edits must not rewrite these values.
 */
const serviceLineSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceNameSnapshot: { type: nameSchema, required: true },
    unitPriceSnapshot: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    commissionTypeSnapshot: { type: String, required: true, enum: COMMISSION_TYPES },
    commissionValueSnapshot: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const companionSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
  },
  { _id: false },
);

const appointmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    appointmentNumber: { type: String, required: true, trim: true, maxlength: 32 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    companions: { type: [companionSchema], default: [] },
    barberEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    extraBarberIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], default: [] },
    type: { type: String, required: true, enum: APPOINTMENT_TYPES },
    scheduledAt: { type: Date, required: true },
    services: { type: [serviceLineSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: APPOINTMENT_STATUSES, default: 'PENDING' },
    checkoutStatus: { type: String, required: true, enum: CHECKOUT_STATUSES, default: 'NOT_CHECKED_OUT' },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    cancellationReason: { type: String, default: '', trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    checkedInAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

appointmentSchema.index({ tenantId: 1, appointmentNumber: 1 }, { unique: true });
appointmentSchema.index({ tenantId: 1, branchId: 1, scheduledAt: -1 });
appointmentSchema.index({ tenantId: 1, branchId: 1, status: 1, scheduledAt: -1 });
appointmentSchema.index({ tenantId: 1, customerId: 1, scheduledAt: -1 });
appointmentSchema.index({ tenantId: 1, barberEmployeeId: 1, scheduledAt: -1 });

export type AppointmentDocument = InferSchemaType<typeof appointmentSchema> & { _id: Schema.Types.ObjectId };
export const Appointment = model('Appointment', appointmentSchema);
