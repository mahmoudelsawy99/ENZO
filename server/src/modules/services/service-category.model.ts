import { Schema, model, type InferSchemaType } from 'mongoose';

export const CATEGORY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

const localizedSchema = new Schema(
  {
    en: { type: String, required: true, trim: true, maxlength: 120 },
    ar: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { _id: false },
);

const categorySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: localizedSchema, required: true },
    nameKeyEn: { type: String, required: true, trim: true, maxlength: 120 },
    nameKeyAr: { type: String, default: '', trim: true, maxlength: 120 },
    status: { type: String, required: true, enum: CATEGORY_STATUSES, default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

categorySchema.index({ tenantId: 1, nameKeyEn: 1 }, { unique: true });
categorySchema.index({ tenantId: 1, nameKeyAr: 1 }, { unique: true, partialFilterExpression: { nameKeyAr: { $gt: '' } } });

export type ServiceCategoryDocument = InferSchemaType<typeof categorySchema> & { _id: Schema.Types.ObjectId };
export const ServiceCategory = model('ServiceCategory', categorySchema);
