import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { readPolicy, saveCommissionCap } from '../catalog/policy.js';
import { CommissionRule } from '../commissions/commission.model.js';
import { ServiceCategory, type CategoryStatus } from './service-category.model.js';
import { Service, type ServiceCommissionType, type ServiceStatus } from './service.model.js';
import type { CategoryBody, ListServicesQuery, ServiceBody } from './service.validation.js';

interface Localized {
  en: string;
  ar: string;
}

export interface PublicCategory {
  id: string;
  name: Localized;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicService {
  id: string;
  name: Localized;
  description: Localized;
  categoryId: string;
  categoryName: Localized;
  image: string;
  price: number;
  commissionType: ServiceCommissionType;
  commissionValue: number;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

const imagePattern = /^\/api\/v1\/media\/catalog\/[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/;

function localized(value: unknown, fallback = ''): Localized {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    en: typeof record['en'] === 'string' ? record['en'] : fallback,
    ar: typeof record['ar'] === 'string' ? record['ar'] : '',
  };
}

function nameKeys(name: Localized) {
  return {
    nameKeyEn: name.en.trim().toLowerCase(),
    nameKeyAr: name.ar.trim().toLowerCase(),
  };
}

function assertImage(image: string): void {
  if (image && !imagePattern.test(image)) {
    throw new HttpError(400, 'invalid_upload', 'Use an image uploaded for this barbershop.');
  }
}

function duplicateName(error: unknown): boolean {
  return hasDuplicateKey(error, 'nameKeyEn') || hasDuplicateKey(error, 'nameKeyAr');
}

function presentCategory(category: {
  _id: unknown;
  name: unknown;
  status: CategoryStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}): PublicCategory {
  return {
    id: String(category._id),
    name: localized(category.name),
    status: category.status,
    createdAt: timestamp(category.createdAt),
    updatedAt: timestamp(category.updatedAt),
  };
}

function presentService(
  service: {
    _id: unknown;
    name: unknown;
    description: unknown;
    categoryId: unknown;
    image?: string | null;
    price: number;
    commissionType: ServiceCommissionType;
    commissionValue: number;
    status: ServiceStatus;
    createdAt?: unknown;
    updatedAt?: unknown;
    createdBy?: unknown;
    updatedBy?: unknown;
  },
  categoryName: Localized,
): PublicService {
  return {
    id: String(service._id),
    name: localized(service.name),
    description: localized(service.description),
    categoryId: String(service.categoryId),
    categoryName,
    image: service.image ?? '',
    price: service.price,
    commissionType: service.commissionType,
    commissionValue: service.commissionValue,
    status: service.status,
    createdAt: timestamp(service.createdAt),
    updatedAt: timestamp(service.updatedAt),
    createdBy: service.createdBy ? String(service.createdBy) : null,
    updatedBy: service.updatedBy ? String(service.updatedBy) : null,
  };
}

async function categoryMap(tenantId: string, ids: string[]) {
  const rows = await ServiceCategory.find({ tenantId, _id: { $in: ids } }).select('name');
  return new Map(rows.map((row) => [String(row._id), localized(row.name)]));
}

async function requireCategory(tenantId: string, categoryId: string) {
  const category = await ServiceCategory.findOne({ _id: categoryId, tenantId, status: 'ACTIVE' });
  if (!category) {
    throw new HttpError(400, 'validation_error', 'Choose an active category from this barbershop.');
  }
  return category;
}

async function assertCommission(tenantId: string, type: ServiceCommissionType, value: number) {
  if (type !== 'PERCENTAGE') {
    return;
  }
  const policy = await readPolicy(tenantId);
  if (value > policy.maxCommissionPercent) {
    throw new HttpError(400, 'validation_error', `Percentage commission cannot exceed ${policy.maxCommissionPercent}.`);
  }
}

async function syncCommission(service: InstanceType<typeof Service>) {
  const serviceCode = String(service._id).toUpperCase();
  const serviceName = localized(service.name).en;
  const status = service.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const existing = await CommissionRule.findOne({ tenantId: service.tenantId, scope: 'SERVICE', serviceCode });
  if (existing) {
    existing.serviceName = serviceName;
    existing.kind = service.commissionType;
    existing.value = service.commissionValue;
    existing.status = status;
    await existing.save();
    return;
  }
  await CommissionRule.create({
    tenantId: service.tenantId,
    scope: 'SERVICE',
    serviceCode,
    serviceName,
    employeeId: null,
    kind: service.commissionType,
    value: service.commissionValue,
    status,
  });
}

async function loadService(tenantId: string, id: string) {
  const service = await Service.findOne({ _id: id, tenantId });
  if (!service) {
    throw new HttpError(404, 'not_found', 'Service was not found.');
  }
  return service;
}

export async function listCategories(tenantId: string): Promise<PublicCategory[]> {
  const rows = await ServiceCategory.find({ tenantId }).sort({ nameKeyEn: 1 }).limit(200);
  return rows.map((row) => presentCategory(row));
}

export async function createCategory(access: TenantAccess, input: CategoryBody): Promise<PublicCategory> {
  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  try {
    const category = await ServiceCategory.create({
      tenantId: access.tenantId,
      name,
      ...nameKeys(name),
      status: input.status,
      createdBy: access.userId,
      updatedBy: access.userId,
    });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'service-category.created',
      entityType: 'service-category',
      entityId: String(category._id),
      summary: `Category ${name.en} created.`,
    });
    return presentCategory(category);
  } catch (error) {
    if (duplicateName(error)) {
      throw new HttpError(409, 'duplicate_name', 'A category with this name already exists.');
    }
    throw error;
  }
}

export async function updateCategory(access: TenantAccess, id: string, input: CategoryBody): Promise<PublicCategory> {
  const category = await ServiceCategory.findOne({ _id: id, tenantId: access.tenantId });
  if (!category) {
    throw new HttpError(404, 'not_found', 'Category was not found.');
  }
  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  const before = { name: localized(category.name), status: category.status };
  category.set('name', name);
  category.nameKeyEn = nameKeys(name).nameKeyEn;
  category.nameKeyAr = nameKeys(name).nameKeyAr;
  category.status = input.status;
  category.set('updatedBy', access.userId);
  try {
    await category.save();
  } catch (error) {
    if (duplicateName(error)) {
      throw new HttpError(409, 'duplicate_name', 'A category with this name already exists.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'service-category.updated',
    entityType: 'service-category',
    entityId: String(category._id),
    summary: `Category ${name.en} updated.`,
    changes: { before, after: { name, status: category.status } },
  });
  return presentCategory(category);
}

export async function serviceSettings(tenantId: string) {
  const policy = await readPolicy(tenantId);
  return { maxCommissionPercent: policy.maxCommissionPercent };
}

export async function updateServiceSettings(access: TenantAccess, maxCommissionPercent: number) {
  const policy = await saveCommissionCap(access, maxCommissionPercent);
  return { maxCommissionPercent: policy.maxCommissionPercent };
}

export async function listServices(access: TenantAccess, query: ListServicesQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.categoryId) {
    filter['categoryId'] = query.categoryId;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ 'name.en': pattern }, { 'name.ar': pattern }, { 'description.en': pattern }, { 'description.ar': pattern }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Service.find(filter).sort({ nameKeyEn: 1 }).skip(skip).limit(query.pageSize),
    Service.countDocuments(filter),
  ]);
  const names = await categoryMap(access.tenantId, items.map((item) => String(item.categoryId)));
  return {
    data: items.map((item) => presentService(item, names.get(String(item.categoryId)) ?? { en: '', ar: '' })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getService(access: TenantAccess, id: string): Promise<PublicService> {
  const service = await loadService(access.tenantId, id);
  const names = await categoryMap(access.tenantId, [String(service.categoryId)]);
  return presentService(service, names.get(String(service.categoryId)) ?? { en: '', ar: '' });
}

export async function createService(access: TenantAccess, input: ServiceBody): Promise<PublicService> {
  assertImage(input.image);
  await requireCategory(access.tenantId, input.categoryId);
  await assertCommission(access.tenantId, input.commissionType, input.commissionValue);
  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  try {
    const service = await Service.create({
      tenantId: access.tenantId,
      name,
      ...nameKeys(name),
      description: { en: input.description.en.trim(), ar: input.description.ar.trim() },
      categoryId: input.categoryId,
      image: input.image,
      price: input.price,
      commissionType: input.commissionType,
      commissionValue: input.commissionValue,
      status: 'ACTIVE',
      createdBy: access.userId,
      updatedBy: access.userId,
    });
    await syncCommission(service);
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'service.created',
      entityType: 'service',
      entityId: String(service._id),
      summary: `Service ${name.en} created.`,
      changes: { price: input.price, commissionType: input.commissionType, commissionValue: input.commissionValue },
    });
    return getService(access, String(service._id));
  } catch (error) {
    if (duplicateName(error)) {
      throw new HttpError(409, 'duplicate_name', 'A service with this name already exists.');
    }
    throw error;
  }
}

export async function updateService(access: TenantAccess, id: string, input: ServiceBody): Promise<PublicService> {
  assertImage(input.image);
  await requireCategory(access.tenantId, input.categoryId);
  await assertCommission(access.tenantId, input.commissionType, input.commissionValue);
  const service = await loadService(access.tenantId, id);
  const before = {
    price: service.price,
    commissionType: service.commissionType,
    commissionValue: service.commissionValue,
    name: localized(service.name),
  };
  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  service.set('name', name);
  service.nameKeyEn = nameKeys(name).nameKeyEn;
  service.nameKeyAr = nameKeys(name).nameKeyAr;
  service.set('description', { en: input.description.en.trim(), ar: input.description.ar.trim() });
  service.set('categoryId', input.categoryId);
  service.image = input.image;
  service.price = input.price;
  service.commissionType = input.commissionType;
  service.commissionValue = input.commissionValue;
  service.set('updatedBy', access.userId);
  try {
    await service.save();
  } catch (error) {
    if (duplicateName(error)) {
      throw new HttpError(409, 'duplicate_name', 'A service with this name already exists.');
    }
    throw error;
  }
  await syncCommission(service);
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'service.updated',
    entityType: 'service',
    entityId: String(service._id),
    summary: `Service ${name.en} updated.`,
    changes: {
      before,
      after: { price: service.price, commissionType: service.commissionType, commissionValue: service.commissionValue, name },
    },
  });
  return getService(access, id);
}

export async function setServiceStatus(access: TenantAccess, id: string, status: ServiceStatus): Promise<PublicService> {
  const service = await loadService(access.tenantId, id);
  const before = service.status;
  service.status = status;
  service.set('updatedBy', access.userId);
  await service.save();
  await syncCommission(service);
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'service.status',
    entityType: 'service',
    entityId: String(service._id),
    summary: `Service ${localized(service.name).en} is ${status}.`,
    changes: { before, after: status },
  });
  return getService(access, id);
}
