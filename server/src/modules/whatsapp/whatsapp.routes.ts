import { Router } from 'express';
import { z } from 'zod';
import { messagingRateLimit } from '../../middleware/rate-limit.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { readAccess, requireAnyPermission, requirePermission } from '../access/access.middleware.js';
import { MESSAGE_KINDS } from './whatsapp.model.js';
import {
  getNotificationSettings,
  getWhatsAppConfig,
  listMessages,
  listTemplates,
  processDueRetries,
  receiveWebhook,
  saveNotificationSettings,
  saveTemplate,
  saveWhatsAppConfig,
  sendMessage,
  setCustomerMessagingPreference,
  verifyWebhook,
} from './whatsapp.service.js';

const empty = z.object({}).passthrough();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const configSchema = z.object({
  body: z.object({
    phoneNumberId: z.string().trim().max(40).optional().default(''),
    businessAccountId: z.string().trim().max(40).optional().default(''),
    accessToken: z.string().trim().max(500).optional().default(''),
    appSecret: z.string().trim().max(200).optional().default(''),
    verifyToken: z.string().trim().max(120).optional().default(''),
    enabled: z.boolean().optional().default(false),
  }),
  query: empty,
  params: empty,
});

const settingsSchema = z.object({
  body: z.object({
    appointmentConfirmation: z.boolean(),
    appointmentReminder: z.boolean(),
    appointmentCancellation: z.boolean(),
    appointmentReschedule: z.boolean(),
    packagePurchase: z.boolean(),
    packageExpiry: z.boolean(),
    paymentReceipt: z.boolean(),
    promotional: z.boolean(),
  }),
  query: empty,
  params: empty,
});

const preferenceSchema = z.object({
  body: z.object({ promotionalOptIn: z.boolean(), whatsappOptOut: z.boolean() }),
  query: empty,
  params: z.object({ id: objectId }),
});

const templateSchema = z.object({
  body: z.object({
    templateName: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(1000),
    status: z.enum(['LOCAL', 'APPROVED']),
  }),
  query: empty,
  params: z.object({ id: objectId }),
});

const sendSchema = z.object({
  body: z.object({
    customerId: objectId,
    kind: z.enum(MESSAGE_KINDS),
    language: z.enum(['en', 'ar']),
    idempotencyKey: z.string().trim().min(8).max(80),
    parameters: z.array(z.string().trim().max(80)).max(8).optional().default([]),
  }),
  query: empty,
  params: empty,
});

const noneSchema = z.object({ body: empty, query: empty, params: empty });

export const whatsappRouter = Router();

whatsappRouter.get('/config', requirePermission('whatsapp.settings.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await getWhatsAppConfig(readAccess(req)) });
}));

whatsappRouter.put('/config', requirePermission('whatsapp.settings.manage'), validateBody(configSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof configSchema>>(req);
  res.json({ data: await saveWhatsAppConfig(readAccess(req), body) });
}));

whatsappRouter.get('/notification-settings', requirePermission('notifications.settings.manage'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await getNotificationSettings(readAccess(req)) });
}));

whatsappRouter.put('/notification-settings', requirePermission('notifications.settings.manage'), validateBody(settingsSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof settingsSchema>>(req);
  res.json({ data: await saveNotificationSettings(readAccess(req), body) });
}));

whatsappRouter.patch('/customers/:id/preferences', requireAnyPermission('notifications.settings.manage', 'customers.update'), validateBody(preferenceSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof preferenceSchema>>(req);
  res.json({ data: await setCustomerMessagingPreference(readAccess(req), params.id, body) });
}));

whatsappRouter.get('/templates', requirePermission('whatsapp.settings.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  res.json({ data: await listTemplates(readAccess(req)) });
}));

whatsappRouter.put('/templates/:id', requirePermission('whatsapp.templates.manage'), validateBody(templateSchema), asyncHandler(async (req, res) => {
  const { params, body } = readValidated<z.infer<typeof templateSchema>>(req);
  res.json({ data: await saveTemplate(readAccess(req), params.id, body) });
}));

whatsappRouter.get('/messages', requirePermission('whatsapp.messages.view'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  await processDueRetries(readAccess(req).tenantId);
  res.json({ data: await listMessages(readAccess(req)) });
}));

whatsappRouter.post('/messages', messagingRateLimit, requirePermission('whatsapp.messages.send'), validateBody(sendSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof sendSchema>>(req);
  res.status(201).json({ data: await sendMessage(readAccess(req), body) });
}));

whatsappRouter.post('/retries', requirePermission('whatsapp.messages.send'), validateBody(noneSchema), asyncHandler(async (req, res) => {
  const processed = await processDueRetries(readAccess(req).tenantId);
  res.json({ data: { processed } });
}));

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get('/', asyncHandler(async (req, res) => {
  const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : '';
  const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : '';
  const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : '';
  const value = await verifyWebhook(mode, token, challenge);
  res.type('text/plain').send(value);
}));

whatsappWebhookRouter.post('/', asyncHandler(async (req, res) => {
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!raw) {
    res.status(401).json({ error: { code: 'webhook_forbidden', message: 'Webhook signature could not be checked.' } });
    return;
  }
  const signature = req.get('x-hub-signature-256') ?? '';
  res.json(await receiveWebhook(raw, signature, req.body as never));
}));
