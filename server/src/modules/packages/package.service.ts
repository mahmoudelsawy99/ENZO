import type { ClientSession } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { Customer } from '../customers/customer.model.js';
import { Service } from '../services/service.model.js';
import {
  CustomerPackage,
  PackageTemplate,
  type CustomerPackageStatus,
  type PackageStatus,
  type ValidityType,
} from './package.model.js';
import type { ListPackagesQuery, PackageBody } from './package.validation.js';

interface Localized {
  en: string;
  ar: string;
}

export interface PublicPackageItem {
  serviceId: string;
  serviceName: Localized;
  quantity: number;
  unitPrice: number;
}

export interface PublicPackage {
  id: string;
  name: Localized;
  description: Localized;
  image: string;
  items: PublicPackageItem[];
  price: number;
  validityType: ValidityType;
  validityDays: number | null;
  fixedExpiryDate: string;
  status: PackageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCustomerPackageItem {
  serviceId: string;
  serviceName: Localized;
  purchasedQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
}

export interface PublicCustomerPackage {
  id: string;
  customerId: string;
  packageTemplateId: string;
  name: Localized;
  purchasedAt: string;
  expiresAt: string | null;
  purchasePrice: number;
  status: CustomerPackageStatus;
  items: PublicCustomerPackageItem[];
  transactionId: string | null;
  createdAt: string;
}

const imagePattern = /^\/api\/v1\/media\/catalog\/[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/;

function localized(value: unknown): Localized {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    en: typeof record['en'] === 'string' ? record['en'] : '',
    ar: typeof record['ar'] === 'string' ? record['ar'] : '',
  };
}

function nameKeys(name: Localized) {
  return { nameKeyEn: name.en.trim().toLowerCase(), nameKeyAr: name.ar.trim().toLowerCase() };
}

function dateOnly(value: Date | null | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }
  return value.toISOString().slice(0, 10);
}

function assertImage(image: string): void {
  if (image && !imagePattern.test(image)) {
    throw new HttpError(400, 'invalid_upload', 'Use an image uploaded for this barbershop.');
  }
}

function duplicateName(error: unknown): boolean {
  return hasDuplicateKey(error, 'nameKeyEn') || hasDuplicateKey(error, 'nameKeyAr');
}

function presentTemplate(template: {
  _id: unknown;
  name: unknown;
  description: unknown;
  image?: string | null;
  items: Array<{ serviceId: unknown; serviceNameSnapshot: unknown; quantity: number; unitPriceSnapshot: number }>;
  price: number;
  validityType: ValidityType;
  validityDays?: number | null;
  fixedExpiryDate?: Date | null;
  status: PackageStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}): PublicPackage {
  return {
    id: String(template._id),
    name: localized(template.name),
    description: localized(template.description),
    image: template.image ?? '',
    items: template.items.map((item) => ({
      serviceId: String(item.serviceId),
      serviceName: localized(item.serviceNameSnapshot),
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
    })),
    price: template.price,
    validityType: template.validityType,
    validityDays: template.validityDays ?? null,
    fixedExpiryDate: dateOnly(template.fixedExpiryDate),
    status: template.status,
    createdAt: timestamp(template.createdAt),
    updatedAt: timestamp(template.updatedAt),
  };
}

function presentPurchase(record: {
  _id: unknown;
  customerId: unknown;
  packageTemplateId: unknown;
  packageNameSnapshot: unknown;
  purchasedAt?: Date | null;
  expiresAt?: Date | null;
  purchasePrice: number;
  status: CustomerPackageStatus;
  items: Array<{
    serviceId: unknown;
    serviceNameSnapshot: unknown;
    purchasedQuantity: number;
    usedQuantity: number;
    remainingQuantity: number;
  }>;
  transactionId?: unknown;
  createdAt?: unknown;
}): PublicCustomerPackage {
  return {
    id: String(record._id),
    customerId: String(record.customerId),
    packageTemplateId: String(record.packageTemplateId),
    name: localized(record.packageNameSnapshot),
    purchasedAt: timestamp(record.purchasedAt),
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt.toISOString() : null,
    purchasePrice: record.purchasePrice,
    status: record.status,
    items: record.items.map((item) => ({
      serviceId: String(item.serviceId),
      serviceName: localized(item.serviceNameSnapshot),
      purchasedQuantity: item.purchasedQuantity,
      usedQuantity: item.usedQuantity,
      remainingQuantity: item.remainingQuantity,
    })),
    transactionId: record.transactionId ? String(record.transactionId) : null,
    createdAt: timestamp(record.createdAt),
  };
}

async function snapshotItems(tenantId: string, items: PackageBody['items'], activeOnly: boolean) {
  const ids = items.map((item) => item.serviceId);
  const services = await Service.find({ _id: { $in: ids }, tenantId });
  const byId = new Map(services.map((service) => [String(service._id), service]));
  return items.map((item) => {
    const service = byId.get(item.serviceId);
    if (!service || (activeOnly && service.status !== 'ACTIVE')) {
      throw new HttpError(400, 'validation_error', 'Choose active services from this barbershop.');
    }
    return {
      serviceId: service._id,
      serviceNameSnapshot: localized(service.name),
      quantity: item.quantity,
      unitPriceSnapshot: service.price,
    };
  });
}

function expiryFields(input: PackageBody): { validityDays: number | null; fixedExpiryDate: Date | null } {
  if (input.validityType === 'VALIDITY_DAYS') {
    return { validityDays: input.validityDays, fixedExpiryDate: null };
  }
  if (input.validityType === 'FIXED_EXPIRY') {
    return { validityDays: null, fixedExpiryDate: new Date(`${input.fixedExpiryDate}T23:59:59.999Z`) };
  }
  return { validityDays: null, fixedExpiryDate: null };
}

function purchaseExpiry(template: {
  validityType: ValidityType;
  validityDays?: number | null;
  fixedExpiryDate?: Date | null;
}, purchasedAt: Date): Date | null {
  if (template.validityType === 'NO_EXPIRY') {
    return null;
  }
  if (template.validityType === 'FIXED_EXPIRY') {
    const expiry = template.fixedExpiryDate;
    if (!(expiry instanceof Date) || expiry.getTime() <= purchasedAt.getTime()) {
      throw new HttpError(409, 'package_expired', 'This package template has already expired.');
    }
    return expiry;
  }
  const days = template.validityDays ?? 0;
  if (days < 1) {
    throw new HttpError(400, 'validation_error', 'This package is missing its validity period.');
  }
  const expiry = new Date(purchasedAt);
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry;
}

async function loadTemplate(tenantId: string, id: string) {
  const template = await PackageTemplate.findOne({ _id: id, tenantId });
  if (!template) {
    throw new HttpError(404, 'not_found', 'Package was not found.');
  }
  return template;
}

export async function listPackages(access: TenantAccess, query: ListPackagesQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ 'name.en': pattern }, { 'name.ar': pattern }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    PackageTemplate.find(filter).sort({ nameKeyEn: 1 }).skip(skip).limit(query.pageSize),
    PackageTemplate.countDocuments(filter),
  ]);
  return { data: items.map((item) => presentTemplate(item)), meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getPackage(access: TenantAccess, id: string): Promise<PublicPackage> {
  return presentTemplate(await loadTemplate(access.tenantId, id));
}

async function saveTemplate(access: TenantAccess, input: PackageBody, id?: string): Promise<PublicPackage> {
  assertImage(input.image);
  const items = await snapshotItems(access.tenantId, input.items, !id);
  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  const dates = expiryFields(input);
  const template = id ? await loadTemplate(access.tenantId, id) : new PackageTemplate({ tenantId: access.tenantId, createdBy: access.userId });
  const before = id ? { price: template.price, validityType: template.validityType, items: template.items.length } : null;
  template.set('name', name);
  template.nameKeyEn = nameKeys(name).nameKeyEn;
  template.nameKeyAr = nameKeys(name).nameKeyAr;
  template.set('description', { en: input.description.en.trim(), ar: input.description.ar.trim() });
  template.image = input.image;
  template.set('items', items);
  template.price = input.price;
  template.validityType = input.validityType;
  template.set('validityDays', dates.validityDays);
  template.set('fixedExpiryDate', dates.fixedExpiryDate);
  template.set('updatedBy', access.userId);
  if (!id) {
    template.status = 'ACTIVE';
  }
  try {
    await template.save();
  } catch (error) {
    if (duplicateName(error)) {
      throw new HttpError(409, 'duplicate_name', 'A package with this name already exists.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: id ? 'package.updated' : 'package.created',
    entityType: 'package',
    entityId: String(template._id),
    summary: `Package ${name.en} ${id ? 'updated' : 'created'}.`,
    changes: { before, after: { price: template.price, validityType: template.validityType, items: items.length } },
  });
  return presentTemplate(template);
}

export function createPackage(access: TenantAccess, input: PackageBody) {
  return saveTemplate(access, input);
}

export function updatePackage(access: TenantAccess, id: string, input: PackageBody) {
  return saveTemplate(access, input, id);
}

export async function setPackageStatus(access: TenantAccess, id: string, status: PackageStatus): Promise<PublicPackage> {
  const template = await loadTemplate(access.tenantId, id);
  const before = template.status;
  template.status = status;
  template.set('updatedBy', access.userId);
  await template.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'package.status',
    entityType: 'package',
    entityId: String(template._id),
    summary: `Package ${localized(template.name).en} is ${status}.`,
    changes: { before, after: status },
  });
  return presentTemplate(template);
}

export async function refreshPackageExpiry(tenantId: string, customerId?: string): Promise<void> {
  const filter: Record<string, unknown> = {
    tenantId,
    status: 'ACTIVE',
    expiresAt: { $ne: null, $lte: new Date() },
  };
  if (customerId) {
    filter['customerId'] = customerId;
  }
  await CustomerPackage.updateMany(filter, { $set: { status: 'EXPIRED' } });
}

export async function customerPackages(access: TenantAccess, customerId: string): Promise<PublicCustomerPackage[]> {
  const customer = await Customer.findOne({ _id: customerId, tenantId: access.tenantId }).select('_id');
  if (!customer) {
    throw new HttpError(404, 'not_found', 'Customer was not found.');
  }
  await refreshPackageExpiry(access.tenantId, customerId);
  const rows = await CustomerPackage.find({ tenantId: access.tenantId, customerId }).sort({ purchasedAt: -1 });
  return rows.map((row) => presentPurchase(row));
}

export async function getCustomerPackage(access: TenantAccess, id: string): Promise<PublicCustomerPackage> {
  const record = await CustomerPackage.findOne({ _id: id, tenantId: access.tenantId });
  if (!record) {
    throw new HttpError(404, 'not_found', 'Customer package was not found.');
  }
  await refreshPackageExpiry(access.tenantId, String(record.customerId));
  const fresh = await CustomerPackage.findOne({ _id: id, tenantId: access.tenantId });
  if (!fresh) {
    throw new HttpError(404, 'not_found', 'Customer package was not found.');
  }
  return presentPurchase(fresh);
}

export async function assignPackage(access: TenantAccess, customerId: string, packageTemplateId: string): Promise<PublicCustomerPackage> {
  const customer = await Customer.findOne({ _id: customerId, tenantId: access.tenantId });
  if (!customer) {
    throw new HttpError(404, 'not_found', 'Customer was not found.');
  }
  if (customer.status !== 'ACTIVE') {
    throw new HttpError(409, 'customer_inactive', 'An inactive customer cannot receive a new package.');
  }
  const template = await PackageTemplate.findOne({ _id: packageTemplateId, tenantId: access.tenantId, status: 'ACTIVE' });
  if (!template) {
    throw new HttpError(404, 'not_found', 'Package was not found.');
  }
  const purchasedAt = new Date();
  const expiresAt = purchaseExpiry(template, purchasedAt);
  const record = await CustomerPackage.create({
    tenantId: access.tenantId,
    customerId: customer._id,
    packageTemplateId: template._id,
    packageNameSnapshot: localized(template.name),
    purchasedAt,
    expiresAt,
    purchasePrice: template.price,
    status: 'ACTIVE',
    items: template.items.map((item) => ({
      serviceId: item.serviceId,
      serviceNameSnapshot: localized(item.serviceNameSnapshot),
      purchasedQuantity: item.quantity,
      usedQuantity: 0,
      remainingQuantity: item.quantity,
    })),
    transactionId: null,
    createdBy: access.userId,
  });
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'package.assigned',
    entityType: 'customer-package',
    entityId: String(record._id),
    summary: `${localized(template.name).en} assigned to ${customer.fullName}.`,
    changes: {
      customerId: String(customer._id),
      packageTemplateId: String(template._id),
      purchasePrice: template.price,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  });
  return presentPurchase(record);
}

/**
 * Consumes one service from a purchased package.
 * The update matches only while remaining quantity can cover the request.
 * A future sale should pass the same database session as the payment.
 */
export async function consumeCustomerPackageItem(
  tenantId: string,
  customerPackageId: string,
  serviceId: string,
  quantity = 1,
  session: ClientSession | null = null,
): Promise<PublicCustomerPackage> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, 'validation_error', 'Consumption quantity must be a positive whole number.');
  }
  const now = new Date();
  const query = CustomerPackage.findOneAndUpdate(
    {
      _id: customerPackageId,
      tenantId,
      status: 'ACTIVE',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      items: { $elemMatch: { serviceId, remainingQuantity: { $gte: quantity } } },
    },
    { $inc: { 'items.$.usedQuantity': quantity, 'items.$.remainingQuantity': -quantity } },
    { returnDocument: 'after' },
  );
  const updated = session ? await query.session(session) : await query;
  if (!updated) {
    await explainConsumptionFailure(tenantId, customerPackageId, serviceId, quantity);
    throw new HttpError(409, 'package_unavailable', 'This package cannot be used.');
  }
  const saved = updated;
  if (saved.items.every((item) => item.remainingQuantity === 0)) {
    const finish = CustomerPackage.updateOne({ _id: saved._id, tenantId, status: 'ACTIVE' }, { $set: { status: 'EXHAUSTED' } });
    if (session) {
      await finish.session(session);
    } else {
      await finish;
    }
    saved.status = 'EXHAUSTED';
  }
  return presentPurchase(saved);
}

async function explainConsumptionFailure(tenantId: string, customerPackageId: string, serviceId: string, quantity: number): Promise<never> {
  const record = await CustomerPackage.findOne({ _id: customerPackageId, tenantId });
  if (!record) {
    throw new HttpError(404, 'not_found', 'Customer package was not found.');
  }
  const expired = record.expiresAt instanceof Date && record.expiresAt.getTime() <= Date.now();
  if (record.status === 'ACTIVE' && expired) {
    record.status = 'EXPIRED';
    await record.save();
  }
  if (record.status === 'EXPIRED' || expired) {
    throw new HttpError(409, 'package_expired', 'This package has expired.');
  }
  if (record.status !== 'ACTIVE') {
    throw new HttpError(409, 'package_unavailable', 'This package cannot be used.');
  }
  const item = record.items.find((entry) => String(entry.serviceId) === serviceId);
  if (!item) {
    throw new HttpError(400, 'validation_error', 'That service is not part of this package.');
  }
  if (item.remainingQuantity < quantity) {
    throw new HttpError(409, 'insufficient_quantity', 'The remaining quantity is not enough.');
  }
  throw new HttpError(409, 'package_unavailable', 'This package cannot be used.');
}
