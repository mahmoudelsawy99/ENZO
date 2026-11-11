import { Schema, model } from 'mongoose';

export const MESSAGE_KINDS = [
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLATION',
  'APPOINTMENT_RESCHEDULE',
  'PACKAGE_PURCHASE',
  'PACKAGE_EXPIRY',
  'PAYMENT_RECEIPT',
  'PROMOTION',
] as const;

export const MESSAGE_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED'] as const;

/**
 * Live Cloud API delivery has not been verified in this build.
 * Credentials can be stored and the send path is implemented, but there is no recorded Meta test.
 */
export const LIVE_MESSAGING_TESTED = false;

const configSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    phoneNumberId: { type: String, default: '', trim: true, maxlength: 40 },
    businessAccountId: { type: String, default: '', trim: true, maxlength: 40 },
    tokenCipher: { type: String, default: '', maxlength: 2000 },
    appSecretCipher: { type: String, default: '', maxlength: 2000 },
    verifyTokenHash: { type: String, default: '', maxlength: 128 },
    enabled: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);
configSchema.index({ phoneNumberId: 1 }, { unique: true, partialFilterExpression: { phoneNumberId: { $gt: '' } } });
configSchema.index({ verifyTokenHash: 1 }, { unique: true, partialFilterExpression: { verifyTokenHash: { $gt: '' } } });

const preferenceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    appointmentConfirmation: { type: Boolean, required: true, default: true },
    appointmentReminder: { type: Boolean, required: true, default: true },
    appointmentCancellation: { type: Boolean, required: true, default: true },
    appointmentReschedule: { type: Boolean, required: true, default: true },
    packagePurchase: { type: Boolean, required: true, default: true },
    packageExpiry: { type: Boolean, required: true, default: true },
    paymentReceipt: { type: Boolean, required: true, default: true },
    promotional: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

const templateSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    kind: { type: String, required: true, enum: MESSAGE_KINDS },
    language: { type: String, required: true, enum: ['en', 'ar'] },
    templateName: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, required: true, enum: ['LOCAL', 'APPROVED'], default: 'LOCAL' },
  },
  { timestamps: true },
);
templateSchema.index({ tenantId: 1, kind: 1, language: 1 }, { unique: true });

const messageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    kind: { type: String, required: true, enum: MESSAGE_KINDS },
    language: { type: String, required: true, enum: ['en', 'ar'] },
    templateName: { type: String, required: true, trim: true, maxlength: 80 },
    parameterCount: { type: Number, required: true, min: 0, default: 0 },
    parameters: { type: [String], default: [] },
    status: { type: String, required: true, enum: MESSAGE_STATUSES, default: 'QUEUED' },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    nextRetryAt: { type: Date, default: null },
    externalMessageId: { type: String, default: '', trim: true, maxlength: 160 },
    lastError: { type: String, default: '', trim: true, maxlength: 160 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);
messageSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
messageSchema.index({ tenantId: 1, createdAt: -1 });
messageSchema.index({ externalMessageId: 1 }, { unique: true, partialFilterExpression: { externalMessageId: { $gt: '' } } });

const eventSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    externalEventId: { type: String, required: true, trim: true, maxlength: 160 },
    eventType: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, default: '', trim: true, maxlength: 40 },
    optOut: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
eventSchema.index({ externalEventId: 1 }, { unique: true });

export const WhatsAppConfig = model('WhatsAppConfig', configSchema);
export const NotificationPreference = model('NotificationPreference', preferenceSchema);
export const WhatsAppTemplate = model('WhatsAppTemplate', templateSchema);
export const WhatsAppMessage = model('WhatsAppMessage', messageSchema);
export const WhatsAppEvent = model('WhatsAppEvent', eventSchema);
