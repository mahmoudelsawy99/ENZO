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
  createPackage,
  getCustomerPackage,
  getPackage,
  listPackages,
  setPackageStatus,
  updatePackage,
} from './package.service.js';
import {
  createPackageSchema,
  listPackagesSchema,
  packageIdSchema,
  packageStatusSchema,
  updatePackageSchema,
} from './package.validation.js';

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

export const packageRouter = Router();

packageRouter.post('/image', requireAnyPermission('packages.create', 'packages.update'), upload.single('image'), verifyUploadedImage, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'invalid_upload', 'Choose an image to upload.');
  }
  res.status(201).json({ data: { image: `/api/v1/media/catalog/${req.file.filename}` } });
}));

packageRouter.get('/', requirePermission('packages.view'), validateBody(listPackagesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listPackagesSchema>>(req);
  res.json(await listPackages(readAccess(req), query));
}));

packageRouter.post('/', requirePermission('packages.create'), validateBody(createPackageSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createPackageSchema>>(req);
  res.status(201).json({ data: await createPackage(readAccess(req), body) });
}));

packageRouter.get('/:id', requirePermission('packages.view'), validateBody(packageIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof packageIdSchema>>(req);
  res.json({ data: await getPackage(readAccess(req), params.id) });
}));

packageRouter.put('/:id', requirePermission('packages.update'), validateBody(updatePackageSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updatePackageSchema>>(req);
  res.json({ data: await updatePackage(readAccess(req), params.id, body) });
}));

packageRouter.patch('/:id/status', requirePermission('packages.disable'), validateBody(packageStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof packageStatusSchema>>(req);
  res.json({ data: await setPackageStatus(readAccess(req), params.id, body.status) });
}));

export const customerPackageRouter = Router();

customerPackageRouter.get('/:id', requirePermission('customer-packages.view'), validateBody(packageIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof packageIdSchema>>(req);
  res.json({ data: await getCustomerPackage(readAccess(req), params.id) });
}));
