import { Schema, model, type InferSchemaType } from 'mongoose';

const catalogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

catalogSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export type CatalogDocument = InferSchemaType<typeof catalogSchema> & { _id: Schema.Types.ObjectId };

export const EmploymentType = model('EmploymentType', catalogSchema.clone());
export const JobTitle = model('JobTitle', catalogSchema.clone());
