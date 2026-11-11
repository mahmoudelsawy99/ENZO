import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { catalogDir } from '../../config/paths.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { verifyUploadedImage } from '../../shared/uploads.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requireAnyPermission, requirePermission } from '../access/access.middleware.js';
import {
  createCategory,
  createService,
  getService,
  listCategories,
  listServices,
  serviceSettings,
  setServiceStatus,
  updateCategory,
  updateService,
  updateServiceSettings,
} from './service.service.js';
import {
  createCategorySchema,
  createServiceSchema,
  listServicesSchema,
  serviceIdSchema,
  serviceSettingsSchema,
  serviceStatusSchema,
  updateCategorySchema,
  updateServiceSchema,
} from './service.validation.js';

const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, catalogDir),
    filename: (_req, file, callback) => {
      const extension = allowed.get(file.mimetype) ?? '';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) {
      callback(new HttpError(400, 'invalid_upload', 'Upload a PNG, JPEG, WEBP, or GIF image.'));
      return;
    }
    callback(null, true);
  },
});

export const serviceRouter = Router();

serviceRouter.get('/settings', requirePermission('services.view'), asyncHandler(async (req, res) => {
  res.json({ data: await serviceSettings(readAccess(req).tenantId) });
}));

serviceRouter.put('/settings', requirePermission('services.update'), validateBody(serviceSettingsSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof serviceSettingsSchema>>(req);
  res.json({ data: await updateServiceSettings(readAccess(req), body.maxCommissionPercent) });
}));

serviceRouter.post('/image', requireAnyPermission('services.create', 'services.update'), upload.single('image'), verifyUploadedImage, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'invalid_upload', 'Choose an image to upload.');
  }
  res.status(201).json({ data: { image: `/api/v1/media/catalog/${req.file.filename}` } });
}));

serviceRouter.get('/', requirePermission('services.view'), validateBody(listServicesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listServicesSchema>>(req);
  res.json(await listServices(readAccess(req), query));
}));

serviceRouter.post('/', requirePermission('services.create'), validateBody(createServiceSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createServiceSchema>>(req);
  res.status(201).json({ data: await createService(readAccess(req), body) });
}));

serviceRouter.get('/:id', requirePermission('services.view'), validateBody(serviceIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof serviceIdSchema>>(req);
  res.json({ data: await getService(readAccess(req), params.id) });
}));

serviceRouter.put('/:id', requirePermission('services.update'), validateBody(updateServiceSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateServiceSchema>>(req);
  res.json({ data: await updateService(readAccess(req), params.id, body) });
}));

serviceRouter.patch('/:id/status', requirePermission('services.disable'), validateBody(serviceStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof serviceStatusSchema>>(req);
  res.json({ data: await setServiceStatus(readAccess(req), params.id, body.status) });
}));

export const serviceCategoryRouter = Router();

serviceCategoryRouter.get('/', requirePermission('service-categories.view'), asyncHandler(async (req, res) => {
  res.json({ data: await listCategories(readAccess(req).tenantId) });
}));

serviceCategoryRouter.post('/', requirePermission('service-categories.create'), validateBody(createCategorySchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createCategorySchema>>(req);
  res.status(201).json({ data: await createCategory(readAccess(req), body) });
}));

serviceCategoryRouter.put('/:id', requirePermission('service-categories.update'), validateBody(updateCategorySchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateCategorySchema>>(req);
  res.json({ data: await updateCategory(readAccess(req), params.id, body) });
}));
