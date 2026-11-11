import mongoose, { Schema } from 'mongoose';

const jobSchema = new Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    type: { type: String, required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRunAt: { type: Date, default: () => new Date(), index: true },
    lastError: { type: String, default: '', maxlength: 160 },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const BackgroundJob = mongoose.model('BackgroundJob', jobSchema);
