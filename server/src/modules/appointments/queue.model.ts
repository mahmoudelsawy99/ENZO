import { Schema, model, type InferSchemaType } from 'mongoose';

export const QUEUE_STATUSES = ['WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/**
 * One branch has its own queue for each calendar date in the tenant timezone.
 * Position is assigned on the server. Cancelled rows stay so the day's history remains.
 */
const queueEntrySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    barberEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    queueDate: { type: String, required: true, trim: true, maxlength: 10 },
    position: { type: Number, required: true },
    status: { type: String, required: true, enum: QUEUE_STATUSES, default: 'WAITING' },
    joinedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

queueEntrySchema.index({ tenantId: 1, branchId: 1, queueDate: 1, position: 1 }, { unique: true });
queueEntrySchema.index(
  { tenantId: 1, appointmentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['WAITING', 'IN_SERVICE'] } } },
);
queueEntrySchema.index({ tenantId: 1, branchId: 1, queueDate: 1, status: 1, barberEmployeeId: 1 });

export type QueueEntryDocument = InferSchemaType<typeof queueEntrySchema> & { _id: Schema.Types.ObjectId };
export const QueueEntry = model('QueueEntry', queueEntrySchema);
