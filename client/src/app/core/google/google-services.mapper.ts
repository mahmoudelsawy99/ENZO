import type { ServiceRecord } from '../../features/catalog/catalog.models';
import { SERVICE_SHEET_HEADERS, type ServiceSheetRow, type ServiceSyncMeta } from './google-sheet.models';

export function emptyServiceMeta(deviceId: string): ServiceSyncMeta {
  return {
    version: 1,
    syncStatus: 'pending',
    lastSyncedAt: '',
    deviceId,
    deleted: false,
  };
}

export function serviceToRow(service: ServiceRecord, meta: ServiceSyncMeta): ServiceSheetRow {
  return {
    id: service.id,
    nameEn: service.name?.en ?? '',
    nameAr: service.name?.ar ?? '',
    descriptionEn: service.description?.en ?? '',
    descriptionAr: service.description?.ar ?? '',
    categoryId: service.categoryId ?? '',
    categoryNameEn: service.categoryName?.en ?? '',
    categoryNameAr: service.categoryName?.ar ?? '',
    image: service.image ?? '',
    price: String(service.price ?? 0),
    commissionType: service.commissionType ?? 'PERCENTAGE',
    commissionValue: String(service.commissionValue ?? 0),
    status: service.status ?? 'ACTIVE',
    createdAt: service.createdAt ?? '',
    updatedAt: service.updatedAt ?? '',
    version: String(meta.version || 1),
    deleted: meta.deleted ? 'true' : 'false',
    lastSyncedAt: meta.lastSyncedAt || '',
    deviceId: meta.deviceId || '',
    payloadJson: JSON.stringify(service),
  };
}

export function rowToService(row: ServiceSheetRow): ServiceRecord | null {
  if (!row.id) {
    return null;
  }
  const fromJson = parsePayload(row.payloadJson);
  if (fromJson && fromJson.id === row.id) {
    return fromJson;
  }
  return {
    id: row.id,
    name: { en: row.nameEn || '', ar: row.nameAr || '' },
    description: { en: row.descriptionEn || '', ar: row.descriptionAr || '' },
    categoryId: row.categoryId || '',
    categoryName: { en: row.categoryNameEn || '', ar: row.categoryNameAr || '' },
    image: row.image || '',
    price: Number(row.price) || 0,
    commissionType: row.commissionType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
    commissionValue: Number(row.commissionValue) || 0,
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || new Date().toISOString(),
  };
}

export function rowMeta(row: ServiceSheetRow): ServiceSyncMeta {
  return {
    version: Math.max(1, Number(row.version) || 1),
    syncStatus: 'synced',
    lastSyncedAt: row.lastSyncedAt || '',
    deviceId: row.deviceId || '',
    deleted: row.deleted === 'true',
  };
}

export function headerRow(): string[] {
  return [...SERVICE_SHEET_HEADERS];
}

export function rowValues(row: ServiceSheetRow): string[] {
  return SERVICE_SHEET_HEADERS.map((key) => row[key] ?? '');
}

export function parseSheetMatrix(values: string[][]): ServiceSheetRow[] {
  if (values.length < 2) {
    return [];
  }
  const headers = values[0].map((cell) => cell.trim());
  const index = new Map(headers.map((name, i) => [name, i]));
  const rows: ServiceSheetRow[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const cells = values[i] ?? [];
    const get = (key: keyof ServiceSheetRow) => String(cells[index.get(key) ?? -1] ?? '');
    const id = get('id');
    if (!id) {
      continue;
    }
    rows.push({
      id,
      nameEn: get('nameEn'),
      nameAr: get('nameAr'),
      descriptionEn: get('descriptionEn'),
      descriptionAr: get('descriptionAr'),
      categoryId: get('categoryId'),
      categoryNameEn: get('categoryNameEn'),
      categoryNameAr: get('categoryNameAr'),
      image: get('image'),
      price: get('price'),
      commissionType: get('commissionType'),
      commissionValue: get('commissionValue'),
      status: get('status'),
      createdAt: get('createdAt'),
      updatedAt: get('updatedAt'),
      version: get('version'),
      deleted: get('deleted'),
      lastSyncedAt: get('lastSyncedAt'),
      deviceId: get('deviceId'),
      payloadJson: get('payloadJson'),
    });
  }
  return rows;
}

function parsePayload(raw: string): ServiceRecord | null {
  if (!raw.trim()) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as ServiceRecord;
    if (!value || typeof value !== 'object' || typeof value.id !== 'string') {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
