import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { logoDir } from '../../config/paths.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireSuperAdmin } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate-request.js';
import { verifyUploadedImage } from '../../shared/uploads.js';
import { HttpError } from '../../shared/http-error.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { platformBillingRouter } from '../billing/billing.routes.js';
import { createHandler, dashboardHandler, detailHandler, listHandler, ownTenantHandler, statusHandler, updateHandler } from './tenant.controller.js';
import { createTenantSchema, listTenantsSchema, tenantIdSchema, tenantStatusSchema, updateTenantSchema } from './tenant.validation.js';

const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, logoDir),
    filename: (_req, file, callback) => {
      const extension = allowed.get(file.mimetype) ?? '';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) {
      callback(new HttpError(400, 'invalid_logo', 'Upload a PNG, JPEG, WEBP, or GIF image.'));
      return;
    }
    callback(null, true);
  },
});

export const platformRouter = Router();

platformRouter.use(authenticate, requireSuperAdmin);
platformRouter.get('/dashboard', dashboardHandler);
platformRouter.use('/billing', platformBillingRouter);
platformRouter.get('/tenants', validateBody(listTenantsSchema), listHandler);
platformRouter.post('/tenants', validateBody(createTenantSchema), createHandler);
platformRouter.get('/tenants/:id', validateBody(tenantIdSchema), detailHandler);
platformRouter.put('/tenants/:id', validateBody(updateTenantSchema), updateHandler);
platformRouter.patch('/tenants/:id/status', validateBody(tenantStatusSchema), statusHandler);
platformRouter.post(
  '/uploads/logo',
  upload.single('logo'),
  verifyUploadedImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'invalid_logo', 'Choose a logo image to upload.');
    }
    const extension = path.extname(req.file.filename);
    if (!['.png', '.jpg', '.webp', '.gif'].includes(extension)) {
      throw new HttpError(400, 'invalid_logo', 'Upload a PNG, JPEG, WEBP, or GIF image.');
    }
    res.status(201).json({ data: { logo: `/api/v1/media/logos/${req.file.filename}` } });
  }),
);

export const tenantContextRouter = Router();
tenantContextRouter.get('/me', authenticate, ownTenantHandler);
