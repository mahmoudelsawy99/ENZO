import { Schema, model, type InferSchemaType } from 'mongoose';
import { APPOINTMENT_STATUSES } from './appointment.model.js';

/**
 * One row per status change, including the row written when the appointment is created.
 * Rescheduling keeps the status and records the previous and next time in the reason.
 */
const historySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    previousStatus: { type: String, default: '', trim: true, maxlength: 20 },
    newStatus: { type: String, required: true, enum: APPOINTMENT_STATUSES },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

historySchema.index({ tenantId: 1, appointmentId: 1, createdAt: 1 });

export type AppointmentHistoryDocument = InferSchemaType<typeof historySchema> & { _id: Schema.Types.ObjectId };
export const AppointmentStatusHistory = model('AppointmentStatusHistory', historySchema);
