import { Schema, model, type InferSchemaType } from 'mongoose';

/** Append-only note. Updates do not replace earlier notes. */
const noteSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

noteSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

export type CustomerNoteDocument = InferSchemaType<typeof noteSchema> & { _id: Schema.Types.ObjectId };
export const CustomerNote = model('CustomerNote', noteSchema);
