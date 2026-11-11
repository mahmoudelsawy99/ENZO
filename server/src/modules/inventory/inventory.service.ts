import { Types, type ClientSession } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { addMinor, fromMinor, toMinor } from '../../shared/money.js';
import { hasDuplicateKey, runInTransaction } from '../../shared/mongo.js';
import { saveDoc } from '../../shared/persist.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import { assertBranchInScope } from '../access/access.middleware.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import type { PermissionKey } from '../access/permissions.js';
import { Branch } from '../branches/branch.model.js';
import {
  Product,
  ProductCategory,
  Purchase,
  PurchasePayment,
  Stock,
  StockAlert,
  StockMovement,
  StockTransfer,
  Supplier,
} from './inventory.model.js';

const imagePattern = /^\/api\/v1\/media\/catalog\/[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/;
type MovementType = 'PURCHASE' | 'SALE' | 'SALE_RETURN' | 'PURCHASE_RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
type Ref = string | Types.ObjectId;

function assertCan(access: TenantAccess, key: PermissionKey): void {
  if (!access.isOwner && !access.permissions.has(key)) {
    throw new HttpError(403, 'forbidden', 'You do not have access to this action.');
  }
}

function names(value: { en: string; ar?: string | null }) {
  return { en: value.en, ar: value.ar ?? '' };
}

function assertImage(image: string): void {
  if (image && !imagePattern.test(image)) {
    throw new HttpError(400, 'invalid_upload', 'Use an image uploaded for this barbershop.');
  }
}

async function requireBranch(access: TenantAccess, branchId: string, session: ClientSession | null) {
  assertBranchInScope(access, branchId);
  const query = Branch.findOne({ _id: branchId, tenantId: access.tenantId });
  const branch = session ? await query.session(session) : await query;
  if (!branch) {
    throw new HttpError(404, 'not_found', 'Branch was not found.');
  }
  if (branch.status !== 'ACTIVE') {
    throw new HttpError(409, 'branch_disabled', 'This branch is not active.');
  }
  return branch;
}

async function nextPurchaseNumber(tenantId: string) {
  const count = await Purchase.countDocuments({ tenantId });
  return `PO-${String(count + 1).padStart(4, '0')}`;
}

async function nextTransferNumber(tenantId: string) {
  const count = await StockTransfer.countDocuments({ tenantId });
  return `TR-${String(count + 1).padStart(4, '0')}`;
}

async function syncAlert(
  tenantId: string,
  branchId: Ref,
  productId: Ref,
  quantity: number,
  minimum: number,
  session: ClientSession | null,
) {
  const kind = quantity <= 0 ? 'OUT' : quantity <= minimum ? 'LOW' : null;
  if (!kind) {
    const finish = StockAlert.updateMany(
      { tenantId, branchId, productId, status: 'ACTIVE' },
      { $set: { status: 'RESOLVED', quantityOnHand: quantity, minimumStock: minimum } },
    );
    if (session) {
      await finish.session(session);
    } else {
      await finish;
    }
    return;
  }
  const lookup = StockAlert.findOne({ tenantId, branchId, productId, status: 'ACTIVE' });
  const existing = session ? await lookup.session(session) : await lookup;
  if (existing) {
    existing.kind = kind;
    existing.quantityOnHand = quantity;
    existing.minimumStock = minimum;
    await saveDoc(existing, session);
    return;
  }
  try {
    await saveDoc(new StockAlert({
      tenantId,
      branchId,
      productId,
      kind,
      status: 'ACTIVE',
      quantityOnHand: quantity,
      minimumStock: minimum,
    }), session);
  } catch (error) {
    if (!hasDuplicateKey(error, 'productId')) {
      throw error;
    }
  }
}

async function ensureStock(tenantId: string, branchId: Ref, productId: Ref, minimum: number, session: ClientSession | null) {
  const lookup = Stock.findOne({ tenantId, branchId, productId });
  const existing = session ? await lookup.session(session) : await lookup;
  if (existing) {
    return existing;
  }
  try {
    const created = new Stock({
      tenantId,
      branchId,
      productId,
      quantityOnHand: 0,
      averageCost: 0,
      minimumStock: minimum,
      lastStockMovementAt: null,
    });
    await saveDoc(created, session);
    return created;
  } catch (error) {
    if (!hasDuplicateKey(error, 'productId')) {
      throw error;
    }
    const again = Stock.findOne({ tenantId, branchId, productId });
    const found = session ? await again.session(session) : await again;
    if (!found) {
      throw error;
    }
    return found;
  }
}

async function recordMovement(
  input: {
    tenantId: string;
    branchId: Ref;
    productId: Ref;
    movementType: MovementType;
    quantity: number;
    unitCost: number;
    referenceType: string;
    referenceId: Ref | null;
    notes: string;
    performedBy: string;
  },
  session: ClientSession | null,
) {
  await saveDoc(new StockMovement({ ...input, unitCost: fromMinor(toMinor(input.unitCost)) }), session);
}

async function removeQuantity(
  tenantId: string,
  branchId: Ref,
  productId: Ref,
  quantity: number,
  session: ClientSession | null,
) {
  const query = Stock.findOneAndUpdate(
    { tenantId, branchId, productId, quantityOnHand: { $gte: quantity } },
    { $inc: { quantityOnHand: -quantity }, $set: { lastStockMovementAt: new Date() } },
    session ? { returnDocument: 'before', session } : { returnDocument: 'before' },
  );
  const before = await query;
  if (!before) {
    throw new HttpError(409, 'insufficient_stock', 'There is not enough stock at this branch.');
  }
  const after = new Stock(before);
  after.quantityOnHand = before.quantityOnHand - quantity;
  await syncAlert(tenantId, branchId, productId, after.quantityOnHand, before.minimumStock, session);
  return before;
}

async function addQuantity(
  tenantId: string,
  branchId: Ref,
  productId: Ref,
  quantity: number,
  unitCost: number,
  minimum: number,
  recalculate: boolean,
  session: ClientSession | null,
) {
  const stock = await ensureStock(tenantId, String(branchId), productId, minimum, session);
  const existingQty = stock.quantityOnHand;
  const existingAvg = toMinor(stock.averageCost);
  const incoming = toMinor(unitCost);
  const newQty = existingQty + quantity;
  const average = recalculate ? Math.round((existingQty * existingAvg + quantity * incoming) / newQty) : existingAvg;
  const updated = await Stock.findOneAndUpdate(
    { _id: stock._id, quantityOnHand: existingQty },
    { $set: { quantityOnHand: newQty, averageCost: fromMinor(average), lastStockMovementAt: new Date() } },
    session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
  );
  if (!updated) {
    throw new HttpError(409, 'stock_conflict', 'Stock changed while this update was saved. Try again.');
  }
  await syncAlert(tenantId, branchId, productId, updated.quantityOnHand, updated.minimumStock, session);
  return updated;
}

export async function consumeSaleStock(
  access: TenantAccess,
  branchId: string,
  saleId: Ref,
  lines: Array<{ productId: string; quantity: number }>,
  session: ClientSession | null,
) {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }
  const items = [];
  for (const [productId, quantity] of merged) {
    const lookup = Product.findOne({ _id: productId, tenantId: access.tenantId, status: 'ACTIVE' });
    const product = session ? await lookup.session(session) : await lookup;
    if (!product) {
      throw new HttpError(404, 'not_found', 'Product was not found.');
    }
    const before = await removeQuantity(access.tenantId, branchId, product._id, quantity, session);
    await recordMovement({
      tenantId: access.tenantId,
      branchId,
      productId: product._id,
      movementType: 'SALE',
      quantity,
      unitCost: before.averageCost,
      referenceType: 'SALE',
      referenceId: saleId,
      notes: '',
      performedBy: access.userId,
    }, session);
    const lineMinor = toMinor(product.sellingPrice) * quantity;
    items.push({
      itemType: 'PRODUCT' as const,
      serviceId: null,
      productId: product._id,
      customerPackageId: null,
      serviceNameSnapshot: names(product.name),
      skuSnapshot: product.sku,
      quantity,
      unitPriceSnapshot: product.sellingPrice,
      discount: 0,
      lineTotal: fromMinor(lineMinor),
    });
  }
  return items;
}

export async function restockSale(
  access: TenantAccess,
  branchId: string,
  saleId: Ref,
  lines: Array<{ productId: Ref; quantity: number }>,
  session: ClientSession | null,
) {
  for (const line of lines) {
    const product = await Product.findOne({ _id: line.productId, tenantId: access.tenantId });
    if (!product) {
      throw new HttpError(404, 'not_found', 'Product was not found.');
    }
    const stock = await addQuantity(access.tenantId, branchId, product._id, line.quantity, 0, product.minimumStock, false, session);
    await recordMovement({
      tenantId: access.tenantId,
      branchId,
      productId: product._id,
      movementType: 'SALE_RETURN',
      quantity: line.quantity,
      unitCost: stock.averageCost,
      referenceType: 'REFUND',
      referenceId: saleId,
      notes: 'Restocked from refund',
      performedBy: access.userId,
    }, session);
  }
}

function presentProduct(product: {
  _id: unknown;
  name: { en: string; ar?: string | null };
  sku: string;
  barcode?: string | null;
  description: { en: string; ar?: string | null };
  categoryId: unknown;
  brand?: string | null;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock: number;
  image?: string | null;
  status: string;
}) {
  return {
    id: String(product._id),
    name: names(product.name),
    sku: product.sku,
    barcode: product.barcode ?? '',
    description: names(product.description),
    categoryId: String(product.categoryId),
    brand: product.brand ?? '',
    unit: product.unit,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    minimumStock: product.minimumStock,
    image: product.image ?? '',
    status: product.status,
  };
}

export async function listCategories(access: TenantAccess) {
  assertCan(access, 'products.view');
  const rows = await ProductCategory.find({ tenantId: access.tenantId }).sort({ 'name.en': 1 });
  return rows.map((row) => ({ id: String(row._id), name: names(row.name), status: row.status }));
}

export async function saveCategory(access: TenantAccess, input: { name: { en: string; ar: string }; status: 'ACTIVE' | 'INACTIVE' }, id?: string) {
  assertCan(access, id ? 'products.update' : 'products.create');
  const keys = { nameKeyEn: input.name.en.trim().toLowerCase(), nameKeyAr: input.name.ar.trim().toLowerCase() };
  try {
    if (!id) {
      const created = await ProductCategory.create({ tenantId: access.tenantId, name: names(input.name), ...keys, status: input.status });
      return { id: String(created._id), name: names(created.name), status: created.status };
    }
    const current = await ProductCategory.findOne({ _id: id, tenantId: access.tenantId });
    if (!current) {
      throw new HttpError(404, 'not_found', 'Category was not found.');
    }
    current.name = names(input.name);
    current.nameKeyEn = keys.nameKeyEn;
    current.nameKeyAr = keys.nameKeyAr;
    current.status = input.status;
    await current.save();
    return { id: String(current._id), name: names(current.name), status: current.status };
  } catch (error) {
    if (hasDuplicateKey(error, 'nameKeyEn') || hasDuplicateKey(error, 'nameKeyAr')) {
      throw new HttpError(409, 'duplicate_name', 'A category with this name already exists.');
    }
    throw error;
  }
}

export async function listProducts(access: TenantAccess, query: { page: number; pageSize: number; search: string; status: string; categoryId: string; sort: string; direction: string }) {
  assertCan(access, 'products.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.categoryId) {
    filter['categoryId'] = query.categoryId;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ 'name.en': pattern }, { 'name.ar': pattern }, { sku: pattern }, { barcode: pattern }];
  }
  const sortField = query.sort === 'sku' ? 'sku' : query.sort === 'price' ? 'sellingPrice' : 'name.en';
  const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ [sortField]: query.direction === 'desc' ? -1 : 1 }).skip(skip).limit(query.pageSize),
    Product.countDocuments(filter),
  ]);
  return { data: rows.map((row) => presentProduct(row)), meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getProduct(access: TenantAccess, id: string) {
  assertCan(access, 'products.view');
  const product = await Product.findOne({ _id: id, tenantId: access.tenantId });
  if (!product) {
    throw new HttpError(404, 'not_found', 'Product was not found.');
  }
  return presentProduct(product);
}

export async function saveProduct(access: TenantAccess, input: {
  name: { en: string; ar: string };
  sku: string;
  barcode: string;
  description: { en: string; ar: string };
  categoryId: string;
  brand: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock: number;
  image: string;
  status: 'ACTIVE' | 'INACTIVE';
}, id?: string) {
  assertCan(access, id ? 'products.update' : 'products.create');
  assertImage(input.image);
  const category = await ProductCategory.findOne({ _id: input.categoryId, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!category) {
    throw new HttpError(404, 'not_found', 'Category was not found.');
  }
  const payload = {
    name: names(input.name),
    sku: input.sku.trim().toUpperCase(),
    barcode: input.barcode.trim(),
    description: names(input.description),
    categoryId: category._id,
    brand: input.brand,
    unit: input.unit,
    costPrice: fromMinor(toMinor(input.costPrice)),
    sellingPrice: fromMinor(toMinor(input.sellingPrice)),
    minimumStock: input.minimumStock,
    image: input.image,
    status: input.status,
  };
  try {
    if (!id) {
      const created = await Product.create({ tenantId: access.tenantId, ...payload });
      await writeAudit({ tenantId: access.tenantId, actorUserId: access.userId, action: 'product.created', entityType: 'product', entityId: String(created._id), summary: `Product ${created.sku} created.`, changes: { sku: created.sku } });
      return presentProduct(created);
    }
    const current = await Product.findOne({ _id: id, tenantId: access.tenantId });
    if (!current) {
      throw new HttpError(404, 'not_found', 'Product was not found.');
    }
    Object.assign(current, payload);
    await current.save();
    return presentProduct(current);
  } catch (error) {
    if (hasDuplicateKey(error, 'sku')) {
      throw new HttpError(409, 'duplicate_sku', 'This SKU is already used.');
    }
    if (hasDuplicateKey(error, 'barcode')) {
      throw new HttpError(409, 'duplicate_barcode', 'This barcode is already used.');
    }
    throw error;
  }
}

export async function deactivateProduct(access: TenantAccess, id: string) {
  assertCan(access, 'products.deactivate');
  const product = await Product.findOne({ _id: id, tenantId: access.tenantId });
  if (!product) {
    throw new HttpError(404, 'not_found', 'Product was not found.');
  }
  product.status = 'INACTIVE';
  await product.save();
  await writeAudit({ tenantId: access.tenantId, actorUserId: access.userId, action: 'product.deactivated', entityType: 'product', entityId: id, summary: `Product ${product.sku} deactivated.` });
  return presentProduct(product);
}

export async function listStock(access: TenantAccess, query: { branchId: string; search: string; page: number; pageSize: number; alert: string }) {
  assertCan(access, 'inventory.view');
  await requireBranch(access, query.branchId, null);
  const filter: Record<string, unknown> = { tenantId: access.tenantId, branchId: query.branchId };
  if (query.alert === 'out') {
    filter['quantityOnHand'] = 0;
  } else if (query.alert === 'low') {
    filter['$expr'] = { $and: [{ $gt: ['$quantityOnHand', 0] }, { $lte: ['$quantityOnHand', '$minimumStock'] }] };
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const matches = await Product.find({
      tenantId: access.tenantId,
      $or: [{ 'name.en': pattern }, { 'name.ar': pattern }, { sku: pattern }],
    }).select('_id');
    filter['productId'] = { $in: matches.map((product) => product._id) };
  }
  const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    Stock.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(query.pageSize),
    Stock.countDocuments(filter),
  ]);
  const products = await Product.find({ tenantId: access.tenantId, _id: { $in: rows.map((row) => row.productId) } });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const data = rows.map((row) => {
    const product = byId.get(String(row.productId));
    return {
      id: String(row._id),
      productId: String(row.productId),
      productName: product ? names(product.name) : { en: '', ar: '' },
      sku: product?.sku ?? '',
      quantityOnHand: row.quantityOnHand,
      averageCost: row.averageCost,
      minimumStock: row.minimumStock,
      sellingPrice: product?.sellingPrice ?? 0,
      status: product?.status ?? 'INACTIVE',
      lastStockMovementAt: timestamp(row.lastStockMovementAt),
    };
  });
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function stockDetail(access: TenantAccess, productId: string, branchId: string) {
  assertCan(access, 'inventory.view');
  await requireBranch(access, branchId, null);
  const found = await Product.findOne({ _id: productId, tenantId: access.tenantId });
  if (!found) {
    throw new HttpError(404, 'not_found', 'Product was not found.');
  }
  const product = presentProduct(found);
  const stock = await Stock.findOne({ tenantId: access.tenantId, branchId, productId });
  const movements = await StockMovement.find({ tenantId: access.tenantId, branchId, productId }).sort({ createdAt: -1 }).limit(50);
  return {
    product,
    stock: stock ? {
      quantityOnHand: stock.quantityOnHand,
      averageCost: stock.averageCost,
      minimumStock: stock.minimumStock,
      lastStockMovementAt: timestamp(stock.lastStockMovementAt),
    } : { quantityOnHand: 0, averageCost: 0, minimumStock: product.minimumStock, lastStockMovementAt: '' },
    movements: movements.map((row) => ({
      id: String(row._id),
      movementType: row.movementType,
      quantity: row.quantity,
      unitCost: row.unitCost,
      referenceType: row.referenceType,
      referenceId: row.referenceId ? String(row.referenceId) : null,
      notes: row.notes,
      createdAt: timestamp(row.createdAt),
    })),
  };
}

export async function adjustStock(access: TenantAccess, input: { branchId: string; productId: string; direction: 'IN' | 'OUT'; quantity: number; notes: string }) {
  assertCan(access, 'inventory.adjust');
  const product = await Product.findOne({ _id: input.productId, tenantId: access.tenantId });
  if (!product) {
    throw new HttpError(404, 'not_found', 'Product was not found.');
  }
  await runInTransaction(async (session) => {
    await requireBranch(access, input.branchId, session);
    if (input.direction === 'OUT') {
      const before = await removeQuantity(access.tenantId, input.branchId, product._id, input.quantity, session);
      await recordMovement({
        tenantId: access.tenantId,
        branchId: input.branchId,
        productId: product._id,
        movementType: 'ADJUSTMENT_OUT',
        quantity: input.quantity,
        unitCost: before.averageCost,
        referenceType: 'ADJUSTMENT',
        referenceId: null,
        notes: input.notes,
        performedBy: access.userId,
      }, session);
    } else {
      await addQuantity(access.tenantId, input.branchId, product._id, input.quantity, product.costPrice, product.minimumStock, true, session);
      await recordMovement({
        tenantId: access.tenantId,
        branchId: input.branchId,
        productId: product._id,
        movementType: 'ADJUSTMENT_IN',
        quantity: input.quantity,
        unitCost: product.costPrice,
        referenceType: 'ADJUSTMENT',
        referenceId: null,
        notes: input.notes,
        performedBy: access.userId,
      }, session);
    }
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'stock.adjusted',
      entityType: 'stock',
      entityId: String(product._id),
      summary: `Stock ${input.direction === 'IN' ? 'increased' : 'decreased'} for ${product.sku}.`,
      changes: { branchId: input.branchId, quantity: input.quantity, direction: input.direction },
    }, session);
    return true;
  });
  return stockDetail(access, input.productId, input.branchId);
}

export async function setBranchMinimum(access: TenantAccess, input: { branchId: string; productId: string; minimumStock: number }) {
  assertCan(access, 'inventory.manage');
  const product = await Product.findOne({ _id: input.productId, tenantId: access.tenantId });
  if (!product) {
    throw new HttpError(404, 'not_found', 'Product was not found.');
  }
  await requireBranch(access, input.branchId, null);
  const stock = await ensureStock(access.tenantId, input.branchId, product._id, input.minimumStock, null);
  stock.minimumStock = input.minimumStock;
  await stock.save();
  await syncAlert(access.tenantId, input.branchId, product._id, stock.quantityOnHand, input.minimumStock, null);
  return { quantityOnHand: stock.quantityOnHand, averageCost: stock.averageCost, minimumStock: stock.minimumStock };
}

export async function inventorySummary(access: TenantAccess, branchId: string) {
  assertCan(access, 'stock-alerts.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId, status: 'ACTIVE' };
  if (branchId) {
    await requireBranch(access, branchId, null);
    filter['branchId'] = branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const [lowStock, outOfStock] = await Promise.all([
    StockAlert.countDocuments({ ...filter, kind: 'LOW' }),
    StockAlert.countDocuments({ ...filter, kind: 'OUT' }),
  ]);
  return { lowStock, outOfStock };
}

export async function listAlerts(access: TenantAccess, branchId: string, status: string) {
  assertCan(access, 'stock-alerts.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (status) {
    filter['status'] = status;
  }
  if (branchId) {
    await requireBranch(access, branchId, null);
    filter['branchId'] = branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const rows = await StockAlert.find(filter).sort({ updatedAt: -1 }).limit(100);
  const products = await Product.find({ tenantId: access.tenantId, _id: { $in: rows.map((row) => row.productId) } }).select('name sku');
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return rows.map((row) => ({
    id: String(row._id),
    branchId: String(row.branchId),
    productId: String(row.productId),
    productName: byId.get(String(row.productId)) ? names(byId.get(String(row.productId))!.name) : { en: '', ar: '' },
    sku: byId.get(String(row.productId))?.sku ?? '',
    kind: row.kind,
    status: row.status,
    quantityOnHand: row.quantityOnHand,
    minimumStock: row.minimumStock,
  }));
}

export async function setAlertStatus(access: TenantAccess, id: string, status: 'DISMISSED' | 'RESOLVED') {
  assertCan(access, 'stock-alerts.manage');
  const alert = await StockAlert.findOne({ _id: id, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!alert) {
    throw new HttpError(404, 'not_found', 'Alert was not found.');
  }
  assertBranchInScope(access, String(alert.branchId));
  alert.status = status;
  await alert.save();
  return { id, status };
}

function presentSupplier(supplier: { _id: unknown; name: string; phone?: string | null; email?: string | null; address?: string | null; taxNumber?: string | null; notes?: string | null; status: string }) {
  return {
    id: String(supplier._id),
    name: supplier.name,
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    taxNumber: supplier.taxNumber ?? '',
    notes: supplier.notes ?? '',
    status: supplier.status,
  };
}

export async function listSuppliers(access: TenantAccess, query: { page: number; pageSize: number; search: string; status: string }) {
  assertCan(access, 'suppliers.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    filter['name'] = new RegExp(escapeRegex(query.search), 'i');
  }
  const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(query.pageSize),
    Supplier.countDocuments(filter),
  ]);
  return { data: rows.map((row) => presentSupplier(row)), meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getSupplier(access: TenantAccess, id: string) {
  assertCan(access, 'suppliers.view');
  const supplier = await Supplier.findOne({ _id: id, tenantId: access.tenantId });
  if (!supplier) {
    throw new HttpError(404, 'not_found', 'Supplier was not found.');
  }
  const purchases = await Purchase.find({ tenantId: access.tenantId, supplierId: supplier._id }).sort({ purchaseDate: -1 }).limit(20);
  const outstanding = fromMinor(addMinor(purchases.map((row) => toMinor(row.remainingAmount))));
  const allOutstanding = await Purchase.find({ tenantId: access.tenantId, supplierId: supplier._id }).select('remainingAmount');
  return {
    ...presentSupplier(supplier),
    outstanding: fromMinor(addMinor(allOutstanding.map((row) => toMinor(row.remainingAmount)))),
    purchases: purchases.map((row) => ({
      id: String(row._id),
      purchaseNumber: row.purchaseNumber,
      totalAmount: row.totalAmount,
      remainingAmount: row.remainingAmount,
      paymentStatus: row.paymentStatus,
      receiveStatus: row.receiveStatus,
      purchaseDate: timestamp(row.purchaseDate),
    })),
    recentOutstanding: outstanding,
  };
}

export async function saveSupplier(access: TenantAccess, input: { name: string; phone: string; email: string; address: string; taxNumber: string; notes: string; status: 'ACTIVE' | 'INACTIVE' }, id?: string) {
  assertCan(access, 'suppliers.manage');
  if (!id) {
    const created = await Supplier.create({ tenantId: access.tenantId, ...input });
    return presentSupplier(created);
  }
  const current = await Supplier.findOne({ _id: id, tenantId: access.tenantId });
  if (!current) {
    throw new HttpError(404, 'not_found', 'Supplier was not found.');
  }
  Object.assign(current, input);
  await current.save();
  return presentSupplier(current);
}

async function presentPurchase(access: TenantAccess, id: string) {
  const purchase = await Purchase.findOne({ _id: id, tenantId: access.tenantId });
  if (!purchase) {
    throw new HttpError(404, 'not_found', 'Purchase was not found.');
  }
  assertBranchInScope(access, String(purchase.branchId));
  const [supplier, payments, returns] = await Promise.all([
    Supplier.findOne({ _id: purchase.supplierId, tenantId: access.tenantId }).select('name'),
    PurchasePayment.find({ tenantId: access.tenantId, purchaseId: purchase._id }).sort({ paidAt: 1 }),
    StockMovement.find({
      tenantId: access.tenantId,
      movementType: 'PURCHASE_RETURN',
      referenceType: 'PURCHASE',
      referenceId: purchase._id,
    }).sort({ createdAt: 1 }),
  ]);
  const returned = new Map<string, number>();
  for (const row of returns) {
    const productId = String(row.productId);
    returned.set(productId, (returned.get(productId) ?? 0) + row.quantity);
  }
  return {
    id: String(purchase._id),
    purchaseNumber: purchase.purchaseNumber,
    branchId: String(purchase.branchId),
    supplierId: String(purchase.supplierId),
    supplierName: supplier?.name ?? '',
    items: purchase.items.map((item) => ({
      productId: String(item.productId),
      productName: names(item.productNameSnapshot),
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.totalCost,
      returnedQuantity: returned.get(String(item.productId)) ?? 0,
    })),
    subtotal: purchase.subtotal,
    discount: purchase.discount,
    totalAmount: purchase.totalAmount,
    paidAmount: purchase.paidAmount,
    remainingAmount: purchase.remainingAmount,
    paymentStatus: purchase.paymentStatus,
    receiveStatus: purchase.receiveStatus,
    purchaseDate: timestamp(purchase.purchaseDate),
    notes: purchase.notes,
    payments: payments.map((payment) => ({
      id: String(payment._id),
      method: payment.method,
      amount: payment.amount,
      referenceNumber: payment.referenceNumber,
      paidAt: timestamp(payment.paidAt),
    })),
    returns: returns.map((row) => ({
      id: String(row._id),
      productId: String(row.productId),
      quantity: row.quantity,
      unitCost: row.unitCost,
      reason: row.notes,
      createdAt: timestamp(row.createdAt),
    })),
  };
}

export async function listPurchases(access: TenantAccess, query: { page: number; pageSize: number; branchId: string; supplierId: string }) {
  assertCan(access, 'purchases.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.branchId) {
    await requireBranch(access, query.branchId, null);
    filter['branchId'] = query.branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  if (query.supplierId) {
    filter['supplierId'] = query.supplierId;
  }
  const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    Purchase.find(filter).sort({ purchaseDate: -1 }).skip(skip).limit(query.pageSize),
    Purchase.countDocuments(filter),
  ]);
  return {
    data: rows.map((row) => ({
      id: String(row._id),
      purchaseNumber: row.purchaseNumber,
      branchId: String(row.branchId),
      totalAmount: row.totalAmount,
      remainingAmount: row.remainingAmount,
      paymentStatus: row.paymentStatus,
      receiveStatus: row.receiveStatus,
      purchaseDate: timestamp(row.purchaseDate),
    })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function createPurchase(access: TenantAccess, input: {
  branchId: string;
  supplierId: string;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
  discount: number;
  purchaseDate: string;
  notes: string;
}) {
  assertCan(access, 'purchases.create');
  await requireBranch(access, input.branchId, null);
  const supplier = await Supplier.findOne({ _id: input.supplierId, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!supplier) {
    throw new HttpError(404, 'not_found', 'Supplier was not found.');
  }
  const items = [];
  for (const line of input.items) {
    const product = await Product.findOne({ _id: line.productId, tenantId: access.tenantId, status: 'ACTIVE' });
    if (!product) {
      throw new HttpError(404, 'not_found', 'Product was not found.');
    }
    const total = fromMinor(toMinor(line.unitCost) * line.quantity);
    items.push({
      productId: product._id,
      productNameSnapshot: names(product.name),
      skuSnapshot: product.sku,
      quantity: line.quantity,
      unitCost: fromMinor(toMinor(line.unitCost)),
      totalCost: total,
    });
  }
  const subtotalMinor = addMinor(items.map((item) => toMinor(item.totalCost)));
  const discountMinor = toMinor(input.discount);
  if (discountMinor > subtotalMinor) {
    throw new HttpError(400, 'validation_error', 'The discount cannot be greater than the purchase total.');
  }
  const totalMinor = subtotalMinor - discountMinor;
  const purchase = await Purchase.create({
    tenantId: access.tenantId,
    branchId: input.branchId,
    supplierId: supplier._id,
    purchaseNumber: await nextPurchaseNumber(access.tenantId),
    items,
    subtotal: fromMinor(subtotalMinor),
    discount: fromMinor(discountMinor),
    totalAmount: fromMinor(totalMinor),
    paidAmount: 0,
    remainingAmount: fromMinor(totalMinor),
    paymentStatus: 'UNPAID',
    receiveStatus: 'NOT_RECEIVED',
    purchaseDate: new Date(input.purchaseDate),
    notes: input.notes,
    createdBy: access.userId,
  });
  return presentPurchase(access, String(purchase._id));
}

export async function getPurchase(access: TenantAccess, id: string) {
  assertCan(access, 'purchases.view');
  return presentPurchase(access, id);
}

export async function receivePurchase(access: TenantAccess, id: string) {
  assertCan(access, 'purchases.receive');
  await runInTransaction(async (session) => {
    const lookup = Purchase.findOneAndUpdate(
      { _id: id, tenantId: access.tenantId, receiveStatus: 'NOT_RECEIVED' },
      { $set: { receiveStatus: 'RECEIVED', receivedBy: access.userId, receivedAt: new Date() } },
      session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
    );
    const purchase = await lookup;
    if (!purchase) {
      const existing = await Purchase.findOne({ _id: id, tenantId: access.tenantId }).select('receiveStatus branchId');
      if (!existing) {
        throw new HttpError(404, 'not_found', 'Purchase was not found.');
      }
      assertBranchInScope(access, String(existing.branchId));
      throw new HttpError(409, 'already_received', 'This purchase was already received.');
    }
    await requireBranch(access, String(purchase.branchId), session);
    for (const item of purchase.items) {
      const product = await Product.findOne({ _id: item.productId, tenantId: access.tenantId });
      await addQuantity(access.tenantId, purchase.branchId, item.productId, item.quantity, item.unitCost, product?.minimumStock ?? 0, true, session);
      await recordMovement({
        tenantId: access.tenantId,
        branchId: purchase.branchId,
        productId: item.productId,
        movementType: 'PURCHASE',
        quantity: item.quantity,
        unitCost: item.unitCost,
        referenceType: 'PURCHASE',
        referenceId: purchase._id,
        notes: purchase.purchaseNumber,
        performedBy: access.userId,
      }, session);
    }
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'purchase.received',
      entityType: 'purchase',
      entityId: String(purchase._id),
      summary: `Purchase ${purchase.purchaseNumber} received.`,
      changes: { branchId: String(purchase.branchId) },
    }, session);
    return true;
  });
  return presentPurchase(access, id);
}

export async function payPurchase(access: TenantAccess, id: string, input: { method: 'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY' | 'OTHER'; amount: number; referenceNumber: string }) {
  assertCan(access, 'purchases.pay');
  const amount = toMinor(input.amount);
  await runInTransaction(async (session) => {
    const lookup = Purchase.findOne({ _id: id, tenantId: access.tenantId });
    const purchase = session ? await lookup.session(session) : await lookup;
    if (!purchase) {
      throw new HttpError(404, 'not_found', 'Purchase was not found.');
    }
    assertBranchInScope(access, String(purchase.branchId));
    if (amount > toMinor(purchase.remainingAmount)) {
      throw new HttpError(409, 'payment_limit', 'The payment is higher than the remaining balance.');
    }
    const paid = toMinor(purchase.paidAmount) + amount;
    const remaining = toMinor(purchase.totalAmount) - paid;
    purchase.paidAmount = fromMinor(paid);
    purchase.remainingAmount = fromMinor(remaining);
    purchase.paymentStatus = remaining <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    await saveDoc(purchase, session);
    await saveDoc(new PurchasePayment({
      tenantId: access.tenantId,
      branchId: purchase.branchId,
      purchaseId: purchase._id,
      supplierId: purchase.supplierId,
      method: input.method,
      amount: fromMinor(amount),
      referenceNumber: input.referenceNumber,
      paidBy: access.userId,
      paidAt: new Date(),
    }), session);
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'purchase.paid',
      entityType: 'purchase',
      entityId: String(purchase._id),
      summary: `Supplier payment recorded for ${purchase.purchaseNumber}.`,
      changes: { amount: fromMinor(amount), method: input.method },
    }, session);
    return true;
  });
  return presentPurchase(access, id);
}

export async function returnPurchase(access: TenantAccess, id: string, items: Array<{ productId: string; quantity: number }>, reason: string) {
  assertCan(access, 'purchases.receive');
  await runInTransaction(async (session) => {
    const lookup = Purchase.findOne({ _id: id, tenantId: access.tenantId, receiveStatus: 'RECEIVED' });
    const purchase = session ? await lookup.session(session) : await lookup;
    if (!purchase) {
      throw new HttpError(409, 'not_received', 'Only a received purchase can be returned.');
    }
    await requireBranch(access, String(purchase.branchId), session);
    const priorQuery = StockMovement.find({
      tenantId: access.tenantId,
      movementType: 'PURCHASE_RETURN',
      referenceType: 'PURCHASE',
      referenceId: purchase._id,
    });
    const prior = session ? await priorQuery.session(session) : await priorQuery;
    const returned = new Map<string, number>();
    for (const row of prior) {
      const productId = String(row.productId);
      returned.set(productId, (returned.get(productId) ?? 0) + row.quantity);
    }
    for (const line of items) {
      const bought = purchase.items
        .filter((item) => String(item.productId) === line.productId)
        .reduce((total, item) => total + item.quantity, 0);
      const already = returned.get(line.productId) ?? 0;
      if (bought < 1 || line.quantity > bought - already) {
        throw new HttpError(409, 'return_limit', 'The return is higher than the quantity still available to return.');
      }
      const productId = purchase.items.find((item) => String(item.productId) === line.productId)?.productId;
      if (!productId) {
        throw new HttpError(409, 'return_limit', 'The return is higher than the quantity still available to return.');
      }
      const before = await removeQuantity(access.tenantId, purchase.branchId, productId, line.quantity, session);
      await recordMovement({
        tenantId: access.tenantId,
        branchId: purchase.branchId,
        productId,
        movementType: 'PURCHASE_RETURN',
        quantity: line.quantity,
        unitCost: before.averageCost,
        referenceType: 'PURCHASE',
        referenceId: purchase._id,
        notes: reason,
        performedBy: access.userId,
      }, session);
      returned.set(line.productId, already + line.quantity);
    }
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'purchase.returned',
      entityType: 'purchase',
      entityId: String(purchase._id),
      summary: `Purchase ${purchase.purchaseNumber} returned to the supplier.`,
      changes: { reason, items },
    }, session);
    return true;
  });
  return presentPurchase(access, id);
}

function presentTransfer(transfer: {
  _id: unknown;
  transferNumber: string;
  sourceBranchId: unknown;
  destinationBranchId: unknown;
  items: Array<{ productId: unknown; productNameSnapshot: { en: string; ar?: string | null }; skuSnapshot: string; quantity: number; unitCost: number }>;
  status: string;
  notes?: string | null;
  sentAt?: Date | null;
  receivedAt?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: String(transfer._id),
    transferNumber: transfer.transferNumber,
    sourceBranchId: String(transfer.sourceBranchId),
    destinationBranchId: String(transfer.destinationBranchId),
    items: transfer.items.map((item) => ({
      productId: String(item.productId),
      productName: names(item.productNameSnapshot),
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitCost: item.unitCost,
    })),
    status: transfer.status,
    notes: transfer.notes ?? '',
    sentAt: timestamp(transfer.sentAt),
    receivedAt: timestamp(transfer.receivedAt),
    createdAt: timestamp(transfer.createdAt),
  };
}

export async function getTransfer(access: TenantAccess, id: string) {
  assertCan(access, 'transfers.view');
  const transfer = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId });
  if (!transfer) {
    throw new HttpError(404, 'not_found', 'Transfer was not found.');
  }
  const source = String(transfer.sourceBranchId);
  const destination = String(transfer.destinationBranchId);
  if (!access.isOwner && access.branchScope === 'SELECTED' && !access.branchIds.includes(source) && !access.branchIds.includes(destination)) {
    throw new HttpError(403, 'branch_forbidden', 'You do not have access to this branch.');
  }
  return presentTransfer(transfer);
}

export async function listTransfers(access: TenantAccess, branchId: string) {
  assertCan(access, 'transfers.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (branchId) {
    await requireBranch(access, branchId, null);
    filter['$or'] = [{ sourceBranchId: branchId }, { destinationBranchId: branchId }];
  } else if (access.branchScope === 'SELECTED') {
    filter['$or'] = [{ sourceBranchId: { $in: access.branchIds } }, { destinationBranchId: { $in: access.branchIds } }];
  }
  const rows = await StockTransfer.find(filter).sort({ createdAt: -1 }).limit(50);
  return rows.map((row) => presentTransfer(row));
}

export async function createTransfer(access: TenantAccess, input: { sourceBranchId: string; destinationBranchId: string; items: Array<{ productId: string; quantity: number }>; notes: string }) {
  assertCan(access, 'transfers.create');
  if (input.sourceBranchId === input.destinationBranchId) {
    throw new HttpError(400, 'validation_error', 'Choose two different branches.');
  }
  await requireBranch(access, input.sourceBranchId, null);
  await requireBranch(access, input.destinationBranchId, null);
  const items = [];
  for (const line of input.items) {
    const product = await Product.findOne({ _id: line.productId, tenantId: access.tenantId, status: 'ACTIVE' });
    if (!product) {
      throw new HttpError(404, 'not_found', 'Product was not found.');
    }
    items.push({
      productId: product._id,
      productNameSnapshot: names(product.name),
      skuSnapshot: product.sku,
      quantity: line.quantity,
      unitCost: 0,
    });
  }
  const transfer = await StockTransfer.create({
    tenantId: access.tenantId,
    transferNumber: await nextTransferNumber(access.tenantId),
    sourceBranchId: input.sourceBranchId,
    destinationBranchId: input.destinationBranchId,
    items,
    status: 'DRAFT',
    notes: input.notes,
    createdBy: access.userId,
  });
  return presentTransfer(transfer);
}

export async function sendTransfer(access: TenantAccess, id: string) {
  assertCan(access, 'transfers.send');
  await runInTransaction(async (session) => {
    const lookup = StockTransfer.findOne({ _id: id, tenantId: access.tenantId, status: 'DRAFT' });
    const transfer = session ? await lookup.session(session) : await lookup;
    if (!transfer) {
      throw new HttpError(409, 'transfer_not_ready', 'Only a draft transfer can be sent.');
    }
    await requireBranch(access, String(transfer.sourceBranchId), session);
    for (const item of transfer.items) {
      const before = await removeQuantity(access.tenantId, transfer.sourceBranchId, item.productId, item.quantity, session);
      item.unitCost = before.averageCost;
      await recordMovement({
        tenantId: access.tenantId,
        branchId: transfer.sourceBranchId,
        productId: item.productId,
        movementType: 'TRANSFER_OUT',
        quantity: item.quantity,
        unitCost: before.averageCost,
        referenceType: 'TRANSFER',
        referenceId: transfer._id,
        notes: transfer.transferNumber,
        performedBy: access.userId,
      }, session);
    }
    transfer.status = 'SENT';
    transfer.sentAt = new Date();
    await saveDoc(transfer, session);
    await writeAudit({ tenantId: access.tenantId, actorUserId: access.userId, action: 'transfer.sent', entityType: 'transfer', entityId: String(transfer._id), summary: `Transfer ${transfer.transferNumber} sent.` }, session);
    return true;
  });
  const transfer = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId });
  if (!transfer) {
    throw new HttpError(404, 'not_found', 'Transfer was not found.');
  }
  return presentTransfer(transfer);
}

export async function receiveTransfer(access: TenantAccess, id: string) {
  assertCan(access, 'transfers.receive');
  await runInTransaction(async (session) => {
    const lookup = StockTransfer.findOneAndUpdate(
      { _id: id, tenantId: access.tenantId, status: 'SENT' },
      { $set: { status: 'RECEIVED', receivedBy: access.userId, receivedAt: new Date() } },
      session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
    );
    const transfer = await lookup;
    if (!transfer) {
      const existing = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId }).select('status destinationBranchId');
      if (!existing) {
        throw new HttpError(404, 'not_found', 'Transfer was not found.');
      }
      assertBranchInScope(access, String(existing.destinationBranchId));
      throw new HttpError(409, 'already_received', 'This transfer was already received.');
    }
    await requireBranch(access, String(transfer.destinationBranchId), session);
    for (const item of transfer.items) {
      const product = await Product.findOne({ _id: item.productId, tenantId: access.tenantId });
      await addQuantity(access.tenantId, transfer.destinationBranchId, item.productId, item.quantity, item.unitCost, product?.minimumStock ?? 0, true, session);
      await recordMovement({
        tenantId: access.tenantId,
        branchId: transfer.destinationBranchId,
        productId: item.productId,
        movementType: 'TRANSFER_IN',
        quantity: item.quantity,
        unitCost: item.unitCost,
        referenceType: 'TRANSFER',
        referenceId: transfer._id,
        notes: transfer.transferNumber,
        performedBy: access.userId,
      }, session);
    }
    await writeAudit({ tenantId: access.tenantId, actorUserId: access.userId, action: 'transfer.received', entityType: 'transfer', entityId: String(transfer._id), summary: `Transfer ${transfer.transferNumber} received.` }, session);
    return true;
  });
  const transfer = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId });
  if (!transfer) {
    throw new HttpError(404, 'not_found', 'Transfer was not found.');
  }
  return presentTransfer(transfer);
}

export async function cancelTransfer(access: TenantAccess, id: string) {
  assertCan(access, 'transfers.send');
  await runInTransaction(async (session) => {
    const lookup = StockTransfer.findOne({ _id: id, tenantId: access.tenantId, status: { $in: ['DRAFT', 'SENT'] } });
    const transfer = session ? await lookup.session(session) : await lookup;
    if (!transfer) {
      const existing = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId }).select('status');
      if (!existing) {
        throw new HttpError(404, 'not_found', 'Transfer was not found.');
      }
      throw new HttpError(409, 'transfer_closed', 'A received transfer cannot be cancelled.');
    }
    if (transfer.status === 'SENT') {
      await requireBranch(access, String(transfer.sourceBranchId), session);
      for (const item of transfer.items) {
        const product = await Product.findOne({ _id: item.productId, tenantId: access.tenantId });
        await addQuantity(access.tenantId, transfer.sourceBranchId, item.productId, item.quantity, item.unitCost, product?.minimumStock ?? 0, true, session);
        await recordMovement({
          tenantId: access.tenantId,
          branchId: transfer.sourceBranchId,
          productId: item.productId,
          movementType: 'ADJUSTMENT_IN',
          quantity: item.quantity,
          unitCost: item.unitCost,
          referenceType: 'TRANSFER_CANCEL',
          referenceId: transfer._id,
          notes: `Cancelled ${transfer.transferNumber}`,
          performedBy: access.userId,
        }, session);
      }
    }
    transfer.status = 'CANCELLED';
    await saveDoc(transfer, session);
    return true;
  });
  const transfer = await StockTransfer.findOne({ _id: id, tenantId: access.tenantId });
  if (!transfer) {
    throw new HttpError(404, 'not_found', 'Transfer was not found.');
  }
  return presentTransfer(transfer);
}
