import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { catalogDir, employeePhotoDir, logoDir } from './config/paths.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { notFoundHandler } from './middleware/not-found.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { tenantAppRouter } from './modules/tenant-app/tenant-app.routes.js';
import { deviceIngestRouter } from './modules/workforce/device-ingest.routes.js';
import { whatsappWebhookRouter } from './modules/whatsapp/whatsapp.routes.js';
import { platformRouter, tenantContextRouter } from './modules/tenants/tenant.routes.js';

/**
 * Identity comes from verified credentials and stored records.
 * Tenant, user, and role values supplied by the client are not authorization proof.
 */
export function createApp() {
  fs.mkdirSync(logoDir, { recursive: true });
  fs.mkdirSync(employeePhotoDir, { recursive: true });
  fs.mkdirSync(catalogDir, { recursive: true });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.clientOrigin.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'Idempotency-Key', 'X-Device-Key'],
    }),
  );
  app.use(cookieParser());
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
  app.use('/api/v1/media/logos', express.static(logoDir, { index: false, fallthrough: true, dotfiles: 'deny' }));
  app.use('/api/v1/media/employees', express.static(employeePhotoDir, { index: false, fallthrough: true, dotfiles: 'deny' }));
  app.use('/api/v1/media/catalog', express.static(catalogDir, { index: false, fallthrough: true, dotfiles: 'deny' }));

  app.use('/api/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/platform', platformRouter);
  app.use('/api/v1/tenant', tenantContextRouter);
  app.use('/api/v1/device-events', deviceIngestRouter);
  app.use('/api/v1/whatsapp/webhook', whatsappWebhookRouter);
  app.use('/api/v1', tenantAppRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
