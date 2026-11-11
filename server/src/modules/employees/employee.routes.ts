import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { employeePhotoDir } from '../../config/paths.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { verifyUploadedImage } from '../../shared/uploads.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requireAnyPermission, requirePermission } from '../access/access.middleware.js';
import {
  deactivateEmployeeCommission,
  saveEmployeeCommission,
} from '../commissions/commission.service.js';
import { EmploymentType, JobTitle } from './catalog.model.js';
import {
  assignEmployeeBranch,
  createCatalog,
  createEmployee,
  employeeActivity,
  listCatalog,
  listEmployees,
  presentEmployee,
  removeEmployeeBranch,
  setCatalogStatus,
  setEmployeeStatus,
  setPrimaryBranch,
  updateEmployee,
} from './employee.service.js';
import {
  assignBranchSchema,
  catalogSchema,
  catalogStatusSchema,
  createEmployeeSchema,
  employeeCommissionIdSchema,
  employeeCommissionSchema,
  employeeIdSchema,
  employeeStatusSchema,
  listEmployeesSchema,
  primaryBranchSchema,
  removeBranchSchema,
  updateEmployeeSchema,
} from './employee.validation.js';

const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, employeePhotoDir),
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

export const employeeRouter = Router();
const catalogRead = requireAnyPermission('employees.view', 'employees.create', 'workforce.manage');

employeeRouter.get('/employment-types', catalogRead, asyncHandler(async (req, res) => {
  res.json({ data: await listCatalog(EmploymentType, readAccess(req).tenantId) });
}));

employeeRouter.post('/employment-types', requirePermission('workforce.manage'), validateBody(catalogSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof catalogSchema>>(req);
  res.status(201).json({ data: await createCatalog(EmploymentType, readAccess(req), body.name, 'employment-type') });
}));

employeeRouter.patch('/employment-types/:id', requirePermission('workforce.manage'), validateBody(catalogStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof catalogStatusSchema>>(req);
  res.json({ data: await setCatalogStatus(EmploymentType, readAccess(req), params.id, body.status, 'employment-type') });
}));

employeeRouter.get('/job-titles', catalogRead, asyncHandler(async (req, res) => {
  res.json({ data: await listCatalog(JobTitle, readAccess(req).tenantId) });
}));

employeeRouter.post('/job-titles', requirePermission('workforce.manage'), validateBody(catalogSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof catalogSchema>>(req);
  res.status(201).json({ data: await createCatalog(JobTitle, readAccess(req), body.name, 'job-title') });
}));

employeeRouter.patch('/job-titles/:id', requirePermission('workforce.manage'), validateBody(catalogStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof catalogStatusSchema>>(req);
  res.json({ data: await setCatalogStatus(JobTitle, readAccess(req), params.id, body.status, 'job-title') });
}));

employeeRouter.post('/photo', requireAnyPermission('employees.create', 'employees.update'), upload.single('photo'), verifyUploadedImage, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'invalid_upload', 'Choose a photo to upload.');
  }
  const extension = path.extname(req.file.filename);
  if (!['.png', '.jpg', '.webp', '.gif'].includes(extension)) {
    throw new HttpError(400, 'invalid_upload', 'Upload a PNG, JPEG, WEBP, or GIF image.');
  }
  res.status(201).json({ data: { profileImage: `/api/v1/media/employees/${req.file.filename}` } });
}));

employeeRouter.get('/', requirePermission('employees.view'), validateBody(listEmployeesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listEmployeesSchema>>(req);
  res.json(await listEmployees(readAccess(req), query));
}));

employeeRouter.post('/', requirePermission('employees.create'), validateBody(createEmployeeSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof createEmployeeSchema>>(req);
  res.status(201).json({ data: await createEmployee(readAccess(req), body) });
}));

employeeRouter.get('/:id/activity', requirePermission('employees.view'), validateBody(employeeIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof employeeIdSchema>>(req);
  res.json({ data: await employeeActivity(readAccess(req), params.id) });
}));

employeeRouter.get('/:id/branches', requirePermission('employees.view'), validateBody(employeeIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof employeeIdSchema>>(req);
  const employee = await presentEmployee(readAccess(req), params.id, false);
  res.json({ data: employee.branches });
}));

employeeRouter.post('/:id/branches', requirePermission('employees.assign-branches'), validateBody(assignBranchSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof assignBranchSchema>>(req);
  res.status(201).json({ data: await assignEmployeeBranch(readAccess(req), params.id, body.branchId, body.isPrimary) });
}));

employeeRouter.patch('/:id/branches/primary', requirePermission('employees.assign-branches'), validateBody(primaryBranchSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof primaryBranchSchema>>(req);
  res.json({ data: await setPrimaryBranch(readAccess(req), params.id, body.branchId) });
}));

employeeRouter.delete('/:id/branches/:branchId', requirePermission('employees.assign-branches'), validateBody(removeBranchSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof removeBranchSchema>>(req);
  res.json({ data: await removeEmployeeBranch(readAccess(req), params.id, params.branchId) });
}));

employeeRouter.put('/:id/commissions', requirePermission('employees.update'), validateBody(employeeCommissionSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof employeeCommissionSchema>>(req);
  res.json({ data: await saveEmployeeCommission(readAccess(req), params.id, body) });
}));

employeeRouter.patch('/:id/commissions/:ruleId/status', requirePermission('employees.update'), validateBody(employeeCommissionIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof employeeCommissionIdSchema>>(req);
  res.json({ data: await deactivateEmployeeCommission(readAccess(req), params.id, params.ruleId) });
}));

employeeRouter.get('/:id', requirePermission('employees.view'), validateBody(employeeIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof employeeIdSchema>>(req);
  res.json({ data: await presentEmployee(readAccess(req), params.id, true) });
}));

employeeRouter.put('/:id', requirePermission('employees.update'), validateBody(updateEmployeeSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateEmployeeSchema>>(req);
  res.json({ data: await updateEmployee(readAccess(req), params.id, body) });
}));

employeeRouter.patch('/:id/status', requirePermission('employees.disable'), validateBody(employeeStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof employeeStatusSchema>>(req);
  res.json({ data: await setEmployeeStatus(readAccess(req), params.id, body.status) });
}));
