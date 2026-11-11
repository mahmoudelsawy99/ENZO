import { hasDuplicateKey } from '../../shared/mongo.js';
import { HttpError } from '../../shared/http-error.js';
import { normalizePhone } from '../../shared/phone.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { Customer } from '../customers/customer.model.js';
import { decryptSecret, encryptSecret, hashToken, signaturesMatch } from './whatsapp.crypto.js';
import {
  LIVE_MESSAGING_TESTED,
  MESSAGE_KINDS,
  NotificationPreference,
  WhatsAppConfig,
  WhatsAppEvent,
  WhatsAppMessage,
  WhatsAppTemplate,
} from './whatsapp.model.js';

const SETTING_FOR = {
  APPOINTMENT_CONFIRMATION: 'appointmentConfirmation',
  APPOINTMENT_REMINDER: 'appointmentReminder',
  APPOINTMENT_CANCELLATION: 'appointmentCancellation',
  APPOINTMENT_RESCHEDULE: 'appointmentReschedule',
  PACKAGE_PURCHASE: 'packagePurchase',
  PACKAGE_EXPIRY: 'packageExpiry',
  PAYMENT_RECEIPT: 'paymentReceipt',
  PROMOTION: 'promotional',
} as const;

const DEFAULT_TEMPLATES: Array<{ kind: (typeof MESSAGE_KINDS)[number]; language: 'en' | 'ar'; templateName: string; body: string }> = [
  { kind: 'APPOINTMENT_CONFIRMATION', language: 'en', templateName: 'appointment_confirmation', body: 'Your appointment is confirmed for {{1}}.' },
  { kind: 'APPOINTMENT_CONFIRMATION', language: 'ar', templateName: 'appointment_confirmation_ar', body: 'تم تأكيد موعدك في {{1}}.' },
  { kind: 'APPOINTMENT_REMINDER', language: 'en', templateName: 'appointment_reminder', body: 'Reminder: your appointment is on {{1}}.' },
  { kind: 'APPOINTMENT_REMINDER', language: 'ar', templateName: 'appointment_reminder_ar', body: 'تذكير: موعدك في {{1}}.' },
  { kind: 'APPOINTMENT_CANCELLATION', language: 'en', templateName: 'appointment_cancellation', body: 'Your appointment on {{1}} was cancelled.' },
  { kind: 'APPOINTMENT_CANCELLATION', language: 'ar', templateName: 'appointment_cancellation_ar', body: 'تم إلغاء موعدك في {{1}}.' },
  { kind: 'APPOINTMENT_RESCHEDULE', language: 'en', templateName: 'appointment_reschedule', body: 'Your appointment moved to {{1}}.' },
  { kind: 'APPOINTMENT_RESCHEDULE', language: 'ar', templateName: 'appointment_reschedule_ar', body: 'تم تغيير موعدك إلى {{1}}.' },
  { kind: 'PACKAGE_PURCHASE', language: 'en', templateName: 'package_purchase', body: 'Your package {{1}} is active.' },
  { kind: 'PACKAGE_PURCHASE', language: 'ar', templateName: 'package_purchase_ar', body: 'باقتك {{1}} أصبحت فعالة.' },
  { kind: 'PACKAGE_EXPIRY', language: 'en', templateName: 'package_expiry', body: 'Your package {{1}} expires on {{2}}.' },
  { kind: 'PACKAGE_EXPIRY', language: 'ar', templateName: 'package_expiry_ar', body: 'تنتهي باقتك {{1}} في {{2}}.' },
  { kind: 'PAYMENT_RECEIPT', language: 'en', templateName: 'payment_receipt', body: 'Receipt {{1}} for {{2}}.' },
  { kind: 'PAYMENT_RECEIPT', language: 'ar', templateName: 'payment_receipt_ar', body: 'إيصال {{1}} بمبلغ {{2}}.' },
  { kind: 'PROMOTION', language: 'en', templateName: 'promotion', body: '{{1}}' },
  { kind: 'PROMOTION', language: 'ar', templateName: 'promotion_ar', body: '{{1}}' },
];

function presentConfig(config: {
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  tokenCipher?: string | null;
  appSecretCipher?: string | null;
  verifyTokenHash?: string | null;
  enabled?: boolean | null;
} | null) {
  const tokenSet = Boolean(config?.tokenCipher);
  const secretSet = Boolean(config?.appSecretCipher);
  const verifySet = Boolean(config?.verifyTokenHash);
  return {
    phoneNumberId: config?.phoneNumberId ?? '',
    businessAccountId: config?.businessAccountId ?? '',
    enabled: config?.enabled === true,
    tokenSet,
    appSecretSet: secretSet,
    verifyTokenSet: verifySet,
    liveReady: Boolean(config?.phoneNumberId && tokenSet && secretSet),
    liveMessagingTested: LIVE_MESSAGING_TESTED,
  };
}

async function preferences(tenantId: string) {
  const found = await NotificationPreference.findOne({ tenantId });
  if (found) {
    return found;
  }
  return NotificationPreference.create({ tenantId });
}

async function ensureTemplates(tenantId: string) {
  const count = await WhatsAppTemplate.countDocuments({ tenantId });
  if (count > 0) {
    return;
  }
  await WhatsAppTemplate.insertMany(DEFAULT_TEMPLATES.map((template) => ({ ...template, tenantId, status: 'LOCAL' })));
}

export async function getWhatsAppConfig(access: TenantAccess) {
  const config = await WhatsAppConfig.findOne({ tenantId: access.tenantId });
  return presentConfig(config);
}

export async function saveWhatsAppConfig(access: TenantAccess, input: {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  enabled: boolean;
}) {
  const existing = await WhatsAppConfig.findOne({ tenantId: access.tenantId });
  const next = existing ?? new WhatsAppConfig({ tenantId: access.tenantId });
  next.phoneNumberId = input.phoneNumberId;
  next.businessAccountId = input.businessAccountId;
  next.enabled = input.enabled;
  if (input.accessToken) {
    next.tokenCipher = encryptSecret(input.accessToken);
  }
  if (input.appSecret) {
    next.appSecretCipher = encryptSecret(input.appSecret);
  }
  if (input.verifyToken) {
    next.verifyTokenHash = hashToken(input.verifyToken);
  }
  try {
    await next.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'phoneNumberId') || hasDuplicateKey(error, 'verifyTokenHash')) {
      throw new HttpError(409, 'whatsapp_conflict', 'That WhatsApp phone number or verify token is already in use.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'whatsapp.config.updated',
    entityType: 'WhatsAppConfig',
    entityId: String(next._id),
    summary: 'WhatsApp configuration updated.',
    changes: { phoneNumberId: input.phoneNumberId, tokenUpdated: Boolean(input.accessToken), secretUpdated: Boolean(input.appSecret) },
  });
  return presentConfig(next);
}

export async function getNotificationSettings(access: TenantAccess) {
  const found = await preferences(access.tenantId);
  return {
    appointmentConfirmation: found.appointmentConfirmation,
    appointmentReminder: found.appointmentReminder,
    appointmentCancellation: found.appointmentCancellation,
    appointmentReschedule: found.appointmentReschedule,
    packagePurchase: found.packagePurchase,
    packageExpiry: found.packageExpiry,
    paymentReceipt: found.paymentReceipt,
    promotional: found.promotional,
  };
}

export async function saveNotificationSettings(access: TenantAccess, input: Awaited<ReturnType<typeof getNotificationSettings>>) {
  const found = await preferences(access.tenantId);
  Object.assign(found, input);
  await found.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'notifications.settings.updated',
    entityType: 'NotificationPreference',
    entityId: String(found._id),
    summary: 'Notification settings updated.',
  });
  return getNotificationSettings(access);
}

export async function setCustomerMessagingPreference(access: TenantAccess, customerId: string, input: { promotionalOptIn: boolean; whatsappOptOut: boolean }) {
  const customer = await Customer.findOne({ _id: customerId, tenantId: access.tenantId });
  if (!customer) {
    throw new HttpError(404, 'not_found', 'Customer was not found.');
  }
  customer.promotionalOptIn = input.whatsappOptOut ? false : input.promotionalOptIn;
  customer.whatsappOptOut = input.whatsappOptOut;
  await customer.save();
  return { promotionalOptIn: customer.promotionalOptIn === true, whatsappOptOut: customer.whatsappOptOut === true };
}

export async function listTemplates(access: TenantAccess) {
  await ensureTemplates(access.tenantId);
  const rows = await WhatsAppTemplate.find({ tenantId: access.tenantId }).sort({ kind: 1, language: 1 });
  return rows.map((row) => ({
    id: String(row._id),
    kind: row.kind,
    language: row.language,
    templateName: row.templateName,
    body: row.body,
    status: row.status,
  }));
}

export async function saveTemplate(access: TenantAccess, id: string, input: { templateName: string; body: string; status: 'LOCAL' | 'APPROVED' }) {
  const row = await WhatsAppTemplate.findOne({ _id: id, tenantId: access.tenantId });
  if (!row) {
    throw new HttpError(404, 'not_found', 'Template was not found.');
  }
  row.templateName = input.templateName;
  row.body = input.body;
  row.status = input.status;
  await row.save();
  return { id: String(row._id), kind: row.kind, language: row.language, templateName: row.templateName, body: row.body, status: row.status };
}

function presentMessage(message: {
  _id: unknown;
  customerId: unknown;
  kind: string;
  language: string;
  templateName: string;
  parameterCount: number;
  status: string;
  attempts: number;
  lastError?: string | null;
  externalMessageId?: string | null;
  createdAt?: Date;
}) {
  return {
    id: String(message._id),
    customerId: String(message.customerId),
    kind: message.kind,
    language: message.language,
    templateName: message.templateName,
    parameterCount: message.parameterCount,
    status: message.status,
    attempts: message.attempts,
    lastError: message.lastError ?? '',
    externalMessageId: message.externalMessageId ?? '',
    createdAt: message.createdAt?.toISOString() ?? '',
  };
}

export async function listMessages(access: TenantAccess) {
  const rows = await WhatsAppMessage.find({ tenantId: access.tenantId }).sort({ createdAt: -1 }).limit(100);
  return rows.map(presentMessage);
}

async function deliver(messageId: string): Promise<void> {
  const message = await WhatsAppMessage.findById(messageId);
  if (!message || message.status === 'SKIPPED' || message.status === 'DELIVERED' || message.status === 'READ') {
    return;
  }
  const config = await WhatsAppConfig.findOne({ tenantId: message.tenantId });
  message.attempts += 1;
  if (!config?.enabled || !config.phoneNumberId || !config.tokenCipher) {
    message.status = 'FAILED';
    message.lastError = 'not_configured';
    message.nextRetryAt = null;
    await message.save();
    return;
  }
  const customer = await Customer.findOne({ _id: message.customerId, tenantId: message.tenantId });
  const phone = normalizePhone(customer?.phone ?? '');
  if (!phone) {
    message.status = 'FAILED';
    message.lastError = 'no_phone';
    message.nextRetryAt = null;
    await message.save();
    return;
  }
  const to = phone.startsWith('0') ? `20${phone.slice(1)}` : phone;
  try {
    const token = decryptSecret(config.tokenCipher);
    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: message.templateName,
          language: { code: message.language },
          components: message.parameters.length
            ? [{ type: 'body', parameters: message.parameters.map((text) => ({ type: 'text', text })) }]
            : [],
        },
      }),
    });
    if (!response.ok) {
      throw new Error('provider_rejected');
    }
    const body = (await response.json()) as { messages?: Array<{ id?: string }> };
    message.status = 'SENT';
    message.lastError = '';
    message.externalMessageId = body.messages?.[0]?.id ?? message.externalMessageId;
    message.nextRetryAt = null;
  } catch {
    message.lastError = 'provider_rejected';
    if (message.attempts >= 3) {
      message.status = 'FAILED';
      message.nextRetryAt = null;
    } else {
      message.status = 'QUEUED';
      message.nextRetryAt = new Date(Date.now() + (process.env['NODE_ENV'] === 'test' ? 0 : 60_000));
    }
  }
  await message.save();
}

export async function processDueRetries(tenantId?: string): Promise<number> {
  const filter: Record<string, unknown> = {
    status: { $in: ['QUEUED', 'FAILED'] },
    attempts: { $lt: 3 },
    $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date() } }],
  };
  if (tenantId) {
    filter['tenantId'] = tenantId;
  }
  const due = await WhatsAppMessage.find(filter).limit(20);
  for (const message of due) {
    if (message.status === 'FAILED' && !message.nextRetryAt) {
      continue;
    }
    await deliver(String(message._id));
  }
  return due.length;
}

export async function sendMessage(access: TenantAccess, input: {
  customerId: string;
  kind: (typeof MESSAGE_KINDS)[number];
  language: 'en' | 'ar';
  idempotencyKey: string;
  parameters: string[];
}) {
  const existing = await WhatsAppMessage.findOne({ tenantId: access.tenantId, idempotencyKey: input.idempotencyKey });
  if (existing) {
    return presentMessage(existing);
  }
  const customer = await Customer.findOne({ _id: input.customerId, tenantId: access.tenantId });
  if (!customer) {
    throw new HttpError(404, 'not_found', 'Customer was not found.');
  }
  const settings = await preferences(access.tenantId);
  const settingKey = SETTING_FOR[input.kind];
  const enabled = settings[settingKey] === true;
  await ensureTemplates(access.tenantId);
  const template = await WhatsAppTemplate.findOne({ tenantId: access.tenantId, kind: input.kind, language: input.language });
  const promotionalBlocked = input.kind === 'PROMOTION' && (customer.whatsappOptOut === true || customer.promotionalOptIn !== true);
  const skipped = !enabled || promotionalBlocked;
  const message = new WhatsAppMessage({
    tenantId: access.tenantId,
    customerId: customer._id,
    kind: input.kind,
    language: input.language,
    templateName: template?.templateName || input.kind.toLowerCase(),
    parameterCount: input.parameters.length,
    parameters: input.parameters,
    status: skipped ? 'SKIPPED' : 'QUEUED',
    attempts: 0,
    lastError: !enabled ? 'disabled' : promotionalBlocked ? 'no_consent' : '',
    idempotencyKey: input.idempotencyKey,
  });
  try {
    await message.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'idempotencyKey')) {
      const raced = await WhatsAppMessage.findOne({ tenantId: access.tenantId, idempotencyKey: input.idempotencyKey });
      if (raced) {
        return presentMessage(raced);
      }
    }
    throw error;
  }
  if (!skipped) {
    await deliver(String(message._id));
  }
  const saved = await WhatsAppMessage.findById(message._id);
  return presentMessage(saved ?? message);
}

export async function verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
  if (mode !== 'subscribe' || !token || !challenge) {
    throw new HttpError(403, 'webhook_forbidden', 'Webhook verification failed.');
  }
  const config = await WhatsAppConfig.findOne({ verifyTokenHash: hashToken(token) });
  if (!config) {
    throw new HttpError(403, 'webhook_forbidden', 'Webhook verification failed.');
  }
  return challenge;
}

interface WebhookStatus {
  id?: string;
  status?: string;
}

interface WebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}

export async function receiveWebhook(raw: Buffer, signature: string, payload: { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: WebhookMessage[]; statuses?: WebhookStatus[] } }> }> }): Promise<{ received: boolean; duplicate: boolean }> {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const phoneNumberId = value?.metadata?.phone_number_id ?? '';
  const config = phoneNumberId ? await WhatsAppConfig.findOne({ phoneNumberId }) : null;
  if (!config?.appSecretCipher) {
    throw new HttpError(401, 'webhook_forbidden', 'Webhook signature could not be checked.');
  }
  const secret = decryptSecret(config.appSecretCipher);
  if (!signaturesMatch(secret, raw, signature)) {
    throw new HttpError(401, 'webhook_forbidden', 'Webhook signature could not be checked.');
  }
  const incoming = value?.messages?.[0];
  const status = value?.statuses?.[0];
  const externalEventId = incoming?.id || status?.id || '';
  if (!externalEventId) {
    throw new HttpError(400, 'validation_error', 'Webhook event id is missing.');
  }
  const text = incoming?.text?.body?.trim().toLowerCase() ?? '';
  const optOut = text === 'stop' || text === 'إيقاف';
  try {
    await WhatsAppEvent.create({
      tenantId: config.tenantId,
      externalEventId,
      eventType: incoming ? 'message' : 'status',
      status: status?.status ?? '',
      optOut,
    });
  } catch (error) {
    if (hasDuplicateKey(error, 'externalEventId')) {
      return { received: true, duplicate: true };
    }
    throw error;
  }
  if (optOut && incoming?.from) {
    const phone = normalizePhone(incoming.from);
    await Customer.updateMany({ tenantId: config.tenantId, normalizedPhone: phone }, { $set: { whatsappOptOut: true, promotionalOptIn: false } });
  }
  if (status?.id) {
    const rank: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
    const mapped = status.status === 'read' ? 'READ' : status.status === 'delivered' ? 'DELIVERED' : status.status === 'failed' ? 'FAILED' : 'SENT';
    const message = await WhatsAppMessage.findOne({ tenantId: config.tenantId, externalMessageId: status.id });
    if (message && (rank[mapped] ?? 0) >= (rank[message.status] ?? 0)) {
      message.status = mapped;
      await message.save();
    }
  }
  return { received: true, duplicate: false };
}
