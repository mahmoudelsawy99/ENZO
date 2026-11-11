import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { catalogDir } from '../../config/paths.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { verifyUploadedImage } from '../../shared/uploads.js';
import { HttpError } from '../../shared/http-error.js';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { readAccess, requireAnyPermission, requirePermission } from '../access/access.middleware.js';
import {
  adjustStock,
  cancelTransfer,
  createPurchase,
  createTransfer,
  deactivateProduct,
  getProduct,
  getPurchase,
  getSupplier,
  inventorySummary,
  listAlerts,
  listCategories,
  listProducts,
  listPurchases,
  listStock,
  listSuppliers,
  getTransfer,
  listTransfers,
  payPurchase,
  receivePurchase,
  receiveTransfer,
  returnPurchase,
  saveCategory,
  saveProduct,
  saveSupplier,
  sendTransfer,
  setAlertStatus,
  setBranchMinimum,
  stockDetail,
} from './inventory.service.js';
import {
  adjustmentSchema,
  alertListSchema,
  alertStatusSchema,
  categoryIdSchema,
  categorySchema,
  idSchema,
  listProductsSchema,
  listPurchasesSchema,
  listSuppliersSchema,
  listTransfersSchema,
  minimumSchema,
  paymentSchema,
  productIdSchema,
  productSchema,
  purchaseSchema,
  returnSchema,
  stockDetailSchema,
  stockListSchema,
  summarySchema,
  supplierSchema,
  transferSchema,
  updateProductSchema,
  updateSupplierSchema,
} from './inventory.validation.js';

const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, catalogDir),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${allowed.get(file.mimetype) ?? ''}`),
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

export const productRouter = Router();
export const productCategoryRouter = Router();
export const inventoryRouter = Router();
export const supplierRouter = Router();
export const purchaseRouter = Router();
export const transferRouter = Router();
export const stockAlertRouter = Router();

productCategoryRouter.get('/', requirePermission('products.view'), asyncHandler(async (req, res) => {
  res.json({ data: await listCategories(readAccess(req)) });
}));

productCategoryRouter.post('/', requirePermission('products.create'), validateBody(categorySchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof categorySchema>>(req);
  res.status(201).json({ data: await saveCategory(readAccess(req), body) });
}));

productCategoryRouter.put('/:id', requirePermission('products.update'), validateBody(categoryIdSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof categoryIdSchema>>(req);
  res.json({ data: await saveCategory(readAccess(req), body, params.id) });
}));

productRouter.post('/image', requireAnyPermission('products.create', 'products.update'), upload.single('image'), verifyUploadedImage, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'invalid_upload', 'Choose an image to upload.');
  }
  res.status(201).json({ data: { image: `/api/v1/media/catalog/${req.file.filename}` } });
}));

productRouter.get('/', requirePermission('products.view'), validateBody(listProductsSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listProductsSchema>>(req);
  res.json(await listProducts(readAccess(req), query));
}));

productRouter.post('/', requirePermission('products.create'), validateBody(productSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof productSchema>>(req);
  res.status(201).json({ data: await saveProduct(readAccess(req), body) });
}));

productRouter.get('/:id', requirePermission('products.view'), validateBody(productIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof productIdSchema>>(req);
  res.json({ data: await getProduct(readAccess(req), params.id) });
}));

productRouter.put('/:id', requirePermission('products.update'), validateBody(updateProductSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateProductSchema>>(req);
  res.json({ data: await saveProduct(readAccess(req), body, params.id) });
}));

productRouter.post('/:id/deactivate', requirePermission('products.deactivate'), validateBody(productIdSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof productIdSchema>>(req);
  res.json({ data: await deactivateProduct(readAccess(req), params.id) });
}));

inventoryRouter.get('/summary', requirePermission('stock-alerts.view'), validateBody(summarySchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof summarySchema>>(req);
  res.json({ data: await inventorySummary(readAccess(req), query.branchId) });
}));

inventoryRouter.get('/', requirePermission('inventory.view'), validateBody(stockListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof stockListSchema>>(req);
  res.json(await listStock(readAccess(req), query));
}));

inventoryRouter.post('/adjustments', requirePermission('inventory.adjust'), validateBody(adjustmentSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof adjustmentSchema>>(req);
  res.json({ data: await adjustStock(readAccess(req), body) });
}));

inventoryRouter.put('/minimum', requirePermission('inventory.manage'), validateBody(minimumSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof minimumSchema>>(req);
  res.json({ data: await setBranchMinimum(readAccess(req), body) });
}));

inventoryRouter.get('/:productId', requirePermission('inventory.view'), validateBody(stockDetailSchema), asyncHandler(async (req, res) => {
  const { query, params } = readValidated<z.infer<typeof stockDetailSchema>>(req);
  res.json({ data: await stockDetail(readAccess(req), params.productId, query.branchId) });
}));

supplierRouter.get('/', requirePermission('suppliers.view'), validateBody(listSuppliersSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listSuppliersSchema>>(req);
  res.json(await listSuppliers(readAccess(req), query));
}));

supplierRouter.post('/', requirePermission('suppliers.manage'), validateBody(supplierSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof supplierSchema>>(req);
  res.status(201).json({ data: await saveSupplier(readAccess(req), body) });
}));

supplierRouter.get('/:id', requirePermission('suppliers.view'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await getSupplier(readAccess(req), params.id) });
}));

supplierRouter.put('/:id', requirePermission('suppliers.manage'), validateBody(updateSupplierSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof updateSupplierSchema>>(req);
  res.json({ data: await saveSupplier(readAccess(req), body, params.id) });
}));

purchaseRouter.get('/', requirePermission('purchases.view'), validateBody(listPurchasesSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listPurchasesSchema>>(req);
  res.json(await listPurchases(readAccess(req), query));
}));

purchaseRouter.post('/', requirePermission('purchases.create'), validateBody(purchaseSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof purchaseSchema>>(req);
  res.status(201).json({ data: await createPurchase(readAccess(req), body) });
}));

purchaseRouter.get('/:id', requirePermission('purchases.view'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await getPurchase(readAccess(req), params.id) });
}));

purchaseRouter.post('/:id/receive', requirePermission('purchases.receive'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await receivePurchase(readAccess(req), params.id) });
}));

purchaseRouter.post('/:id/payments', requirePermission('purchases.pay'), validateBody(paymentSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof paymentSchema>>(req);
  res.json({ data: await payPurchase(readAccess(req), params.id, body) });
}));

purchaseRouter.post('/:id/return', requirePermission('purchases.receive'), validateBody(returnSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof returnSchema>>(req);
  res.json({ data: await returnPurchase(readAccess(req), params.id, body.items, body.reason) });
}));

transferRouter.get('/', requirePermission('transfers.view'), validateBody(listTransfersSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof listTransfersSchema>>(req);
  res.json({ data: await listTransfers(readAccess(req), query.branchId) });
}));

transferRouter.get('/:id', requirePermission('transfers.view'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await getTransfer(readAccess(req), params.id) });
}));

transferRouter.post('/', requirePermission('transfers.create'), validateBody(transferSchema), asyncHandler(async (req, res) => {
  const { body } = readValidated<z.infer<typeof transferSchema>>(req);
  res.status(201).json({ data: await createTransfer(readAccess(req), body) });
}));

transferRouter.post('/:id/send', requirePermission('transfers.send'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await sendTransfer(readAccess(req), params.id) });
}));

transferRouter.post('/:id/receive', requirePermission('transfers.receive'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await receiveTransfer(readAccess(req), params.id) });
}));

transferRouter.post('/:id/cancel', requirePermission('transfers.send'), validateBody(idSchema), asyncHandler(async (req, res) => {
  const { params } = readValidated<z.infer<typeof idSchema>>(req);
  res.json({ data: await cancelTransfer(readAccess(req), params.id) });
}));

stockAlertRouter.get('/', requirePermission('stock-alerts.view'), validateBody(alertListSchema), asyncHandler(async (req, res) => {
  const { query } = readValidated<z.infer<typeof alertListSchema>>(req);
  res.json({ data: await listAlerts(readAccess(req), query.branchId, query.status) });
}));

stockAlertRouter.post('/:id/status', requirePermission('stock-alerts.manage'), validateBody(alertStatusSchema), asyncHandler(async (req, res) => {
  const { body, params } = readValidated<z.infer<typeof alertStatusSchema>>(req);
  res.json({ data: await setAlertStatus(readAccess(req), params.id, body.status) });
}));
