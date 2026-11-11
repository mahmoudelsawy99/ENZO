import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const PLAN_CODES = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'LEGACY'] as const;
export const PLAN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;
export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'] as const;
export const INVOICE_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export const FEATURES = ['inventory', 'payroll', 'reports.advanced', 'whatsapp', 'exports'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type FeatureKey = (typeof FEATURES)[number];

const planSchema = new Schema(
  {
    code: { type: String, enum: PLAN_CODES, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 400 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    yearlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    billingInterval: { type: String, enum: BILLING_INTERVALS, default: 'MONTHLY' },
    maximumBranches: { type: Number, required: true, min: 1 },
    maximumUsers: { type: Number, required: true, min: 1 },
    maximumEmployees: { type: Number, required: true, min: 1 },
    maximumStorage: { type: Number, required: true, min: 1 },
    enabledFeatures: { type: [String], default: [] },
    trialDays: { type: Number, default: 0, min: 0 },
    system: { type: Boolean, default: false },
    status: { type: String, enum: PLAN_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);

const limitSchema = new Schema(
  {
    maximumBranches: { type: Number, min: 1 },
    maximumUsers: { type: Number, min: 1 },
    maximumEmployees: { type: Number, min: 1 },
    maximumStorage: { type: Number, min: 1 },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, index: true },
    billingInterval: { type: String, enum: BILLING_INTERVALS, required: true },
    startDate: { type: Date, required: true },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    nextBillingDate: { type: Date, required: true },
    graceEndsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    limitOverrides: { type: limitSchema, default: () => ({}) },
    customFeatures: { type: [String], default: undefined },
    customFeaturesSet: { type: Boolean, default: false },
  },
  { timestamps: true },
);

subscriptionSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] } } },
);

const historySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'TenantSubscription', required: true, index: true },
    action: { type: String, required: true, maxlength: 40 },
    snapshot: { type: Schema.Types.Mixed, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'TenantSubscription', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    taxAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    dueDate: { type: String, required: true },
    paidAt: { type: Date, default: null },
    status: { type: String, enum: INVOICE_STATUSES, required: true, index: true },
  },
  { timestamps: true },
);

const paymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'TenantSubscription', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: { type: String, enum: INVOICE_STATUSES, required: true },
    method: { type: String, enum: ['MANUAL'], default: 'MANUAL' },
    reference: { type: String, default: '', maxlength: 80 },
    note: { type: String, default: '', maxlength: 240 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const noticeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    kind: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    message: { type: String, required: true, maxlength: 240 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true },
});

export type PlanDocument = InferSchemaType<typeof planSchema> & { _id: mongoose.Types.ObjectId };
export const SubscriptionPlan = mongoose.model('SubscriptionPlan', planSchema);
export const TenantSubscription = mongoose.model('TenantSubscription', subscriptionSchema);
export const SubscriptionHistory = mongoose.model('SubscriptionHistory', historySchema);
export const SubscriptionInvoice = mongoose.model('SubscriptionInvoice', invoiceSchema);
export const SubscriptionPayment = mongoose.model('SubscriptionPayment', paymentSchema);
export const SubscriptionNotice = mongoose.model('SubscriptionNotice', noticeSchema);
export const BillingCounter = mongoose.model('BillingCounter', counterSchema);
