import { Schema, model, type InferSchemaType } from 'mongoose';

export const PACKAGE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const VALIDITY_TYPES = ['NO_EXPIRY', 'FIXED_EXPIRY', 'VALIDITY_DAYS'] as const;
export type ValidityType = (typeof VALIDITY_TYPES)[number];

export const CUSTOMER_PACKAGE_STATUSES = ['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED'] as const;
export type CustomerPackageStatus = (typeof CUSTOMER_PACKAGE_STATUSES)[number];

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

const templateItemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceNameSnapshot: { type: nameSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceSnapshot: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const packageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: nameSchema, required: true },
    nameKeyEn: { type: String, required: true, trim: true, maxlength: 120 },
    nameKeyAr: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: textSchema, required: true },
    image: { type: String, default: '', trim: true, maxlength: 240 },
    items: { type: [templateItemSchema], required: true },
    price: { type: Number, required: true, min: 0 },
    validityType: { type: String, required: true, enum: VALIDITY_TYPES, default: 'NO_EXPIRY' },
    validityDays: { type: Number, default: null },
    fixedExpiryDate: { type: Date, default: null },
    status: { type: String, required: true, enum: PACKAGE_STATUSES, default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

packageSchema.index({ tenantId: 1, nameKeyEn: 1 }, { unique: true });
packageSchema.index({ tenantId: 1, nameKeyAr: 1 }, { unique: true, partialFilterExpression: { nameKeyAr: { $gt: '' } } });
packageSchema.index({ tenantId: 1, status: 1 });

const purchasedItemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceNameSnapshot: { type: nameSchema, required: true },
    purchasedQuantity: { type: Number, required: true, min: 1 },
    usedQuantity: { type: Number, required: true, min: 0, default: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * Purchased package. Template edits must not rewrite these snapshots.
 * Consumption uses an atomic update so remaining quantity cannot go below zero.
 * Appointments and POS should call that operation inside the sale transaction.
 */
const customerPackageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    packageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', required: true },
    packageNameSnapshot: { type: nameSchema, required: true },
    purchasedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    purchasePrice: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: CUSTOMER_PACKAGE_STATUSES, default: 'ACTIVE' },
    items: { type: [purchasedItemSchema], required: true },
    transactionId: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

customerPackageSchema.index({ tenantId: 1, customerId: 1, status: 1 });
customerPackageSchema.index({ tenantId: 1, packageTemplateId: 1 });

export type PackageTemplateDocument = InferSchemaType<typeof packageSchema> & { _id: Schema.Types.ObjectId };
export type CustomerPackageDocument = InferSchemaType<typeof customerPackageSchema> & { _id: Schema.Types.ObjectId };
export const PackageTemplate = model('PackageTemplate', packageSchema);
export const CustomerPackage = model('CustomerPackage', customerPackageSchema);
