import { Schema, model, type InferSchemaType } from 'mongoose';

export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_GENDERS = ['', 'MALE', 'FEMALE'] as const;

/**
 * A customer belongs to the tenant and can be served in any branch.
 * phoneUniqueKey is set only while the tenant requires one customer per phone.
 */
const customerSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    customerNumber: { type: String, required: true, trim: true, maxlength: 32 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    normalizedPhone: { type: String, default: '', trim: true, maxlength: 20 },
    phoneUniqueKey: { type: String, default: null },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    dateOfBirth: { type: String, default: '', trim: true, maxlength: 10 },
    gender: { type: String, enum: CUSTOMER_GENDERS, default: '' },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    /** Promotional WhatsApp requires this flag. Existing customers stay opted out. */
    promotionalOptIn: { type: Boolean, default: false },
    /** Customer opt-out wins over tenant promotional settings. */
    whatsappOptOut: { type: Boolean, default: false },
    status: { type: String, required: true, enum: CUSTOMER_STATUSES, default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

customerSchema.index({ tenantId: 1, customerNumber: 1 }, { unique: true });
customerSchema.index(
  { tenantId: 1, phoneUniqueKey: 1 },
  { unique: true, partialFilterExpression: { phoneUniqueKey: { $type: 'string' } } },
);
customerSchema.index({ tenantId: 1, status: 1, fullName: 1 });
customerSchema.index({ tenantId: 1, normalizedPhone: 1 });

export type CustomerDocument = InferSchemaType<typeof customerSchema> & { _id: Schema.Types.ObjectId };
export const Customer = model('Customer', customerSchema);
