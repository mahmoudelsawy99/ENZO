import { Schema, model, type InferSchemaType } from 'mongoose';

export const SERVICE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const COMMISSION_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type ServiceCommissionType = (typeof COMMISSION_TYPES)[number];

const nameSchema = new Schema(
  {
    en: { type: String, required: true, trim: true, maxlength: 120 },
    ar: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { _id: false },
);

const textSchema = new Schema(
  {
    en: { type: String, default: '', trim: true, maxlength: 500 },
    ar: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
);

/**
 * A service belongs to the tenant and is available in every branch.
 * Commission stored here is configuration. A completed sale must copy the quoted rate.
 */
const serviceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: nameSchema, required: true },
    nameKeyEn: { type: String, required: true, trim: true, maxlength: 120 },
    nameKeyAr: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: textSchema, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    image: { type: String, default: '', trim: true, maxlength: 240 },
    price: { type: Number, required: true, min: 0 },
    commissionType: { type: String, required: true, enum: COMMISSION_TYPES, default: 'PERCENTAGE' },
    commissionValue: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: SERVICE_STATUSES, default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

serviceSchema.index({ tenantId: 1, nameKeyEn: 1 }, { unique: true });
serviceSchema.index({ tenantId: 1, nameKeyAr: 1 }, { unique: true, partialFilterExpression: { nameKeyAr: { $gt: '' } } });
serviceSchema.index({ tenantId: 1, categoryId: 1, status: 1 });

export type ServiceDocument = InferSchemaType<typeof serviceSchema> & { _id: Schema.Types.ObjectId };
export const Service = model('Service', serviceSchema);
