import { Schema, model, type InferSchemaType } from 'mongoose';

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_LANGUAGES = ['en', 'ar'] as const;
export const TENANT_THEMES = ['dark', 'light'] as const;

const tenantSchema = new Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 60 },
    logo: { type: String, default: '', maxlength: 240 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 32 },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    currency: { type: String, required: true, default: 'EGP', uppercase: true, maxlength: 3 },
    timezone: { type: String, required: true, default: 'Africa/Cairo', maxlength: 64 },
    defaultLanguage: { type: String, required: true, enum: TENANT_LANGUAGES, default: 'en' },
    theme: { type: String, required: true, enum: TENANT_THEMES, default: 'dark' },
    status: { type: String, required: true, enum: TENANT_STATUSES, default: 'ACTIVE', index: true },
    settings: { type: Schema.Types.Mixed, default: () => ({}) },
    idempotencyKey: { type: String, maxlength: 80 },
  },
  { timestamps: true },
);

tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
tenantSchema.index({ createdAt: -1 });

export type TenantDocument = InferSchemaType<typeof tenantSchema> & { _id: Schema.Types.ObjectId };
export const Tenant = model('Tenant', tenantSchema);
