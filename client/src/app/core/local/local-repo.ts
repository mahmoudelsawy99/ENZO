import { ApiError } from '../api/api-error';
import { type Doc, type NileDatabase, type StoredRecord } from './local-database';

export type Payload = Record<string, unknown>;

export function str(doc: Payload | Doc | null | undefined, key: string): string {
  const value = doc?.[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function num(doc: Payload | Doc | null | undefined, key: string): number {
  const value = doc?.[key];
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function bool(doc: Payload | Doc | null | undefined, key: string): boolean {
  return doc?.[key] === true;
}

export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asPayload(body: unknown): Payload {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Payload) : {};
}

export function asDoc(id: string, fields: Payload): Doc {
  return { ...fields, id };
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export function dataOf<T>(value: T): { data: T } {
  return { data: value };
}

export async function all(db: NileDatabase, collection: string): Promise<Doc[]> {
  const rows = await db.records.where('collection').equals(collection).toArray();
  return rows.map((row) => row.data);
}

export async function one(db: NileDatabase, collection: string, id: string): Promise<Doc | undefined> {
  const row = await db.records.get(`${collection}:${id}`);
  return row?.data;
}

export async function requireOne(db: NileDatabase, collection: string, id: string): Promise<Doc> {
  const row = await one(db, collection, id);
  if (!row) {
    fail(404, 'not_found', 'That record is not in the local database.');
  }
  return row;
}

export async function save(db: NileDatabase, collection: string, data: Doc, preserveTimestamps = false): Promise<Doc> {
  const now = new Date().toISOString();
  const existing = await db.records.get(`${collection}:${data.id}`);
  const next: Doc = preserveTimestamps
    ? data
    : {
        ...data,
        createdAt: existing?.data['createdAt'] ?? data['createdAt'] ?? now,
        updatedAt: now,
      };
  const record: StoredRecord = {
    pk: `${collection}:${next.id}`,
    collection,
    id: next.id,
    branchId: str(next, 'branchId'),
    status: str(next, 'status'),
    updatedAt: str(next, 'updatedAt') || now,
    data: next,
  };
  await db.records.put(record);
  return next;
}

export async function bulkSave(db: NileDatabase, collection: string, docs: Doc[]): Promise<void> {
  const now = new Date().toISOString();
  await db.records.bulkPut(
    docs.map((data) => ({
      pk: `${collection}:${data.id}`,
      collection,
      id: data.id,
      branchId: str(data, 'branchId'),
      status: str(data, 'status'),
      updatedAt: str(data, 'updatedAt') || now,
      data,
    })),
  );
}

export async function remove(db: NileDatabase, collection: string, id: string): Promise<void> {
  await db.records.delete(`${collection}:${id}`);
}

export function uid(prefix = ''): string {
  const value = crypto.randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}_${value.slice(0, 12)}` : value;
}

export function pageOf<T>(rows: T[], query: Record<string, string>): { data: T[]; meta: { page: number; pageSize: number; total: number } } {
  const page = Math.max(1, Number(query['page'] || 1));
  const pageSize = Math.max(1, Number(query['pageSize'] || 20));
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), meta: { page, pageSize, total: rows.length } };
}

export function matches(doc: Doc, query: Record<string, string>, fields: string[] = []): boolean {
  const search = (query['search'] ?? '').trim().toLowerCase();
  if (query['status'] && str(doc, 'status') !== query['status']) {
    return false;
  }
  if (query['branchId'] && str(doc, 'branchId') && str(doc, 'branchId') !== query['branchId']) {
    return false;
  }
  if (query['categoryId'] && str(doc, 'categoryId') !== query['categoryId']) {
    return false;
  }
  if (query['employeeId'] && str(doc, 'employeeId') !== query['employeeId']) {
    return false;
  }
  if (query['supplierId'] && str(doc, 'supplierId') !== query['supplierId']) {
    return false;
  }
  if (!search) {
    return true;
  }
  const haystack = fields.length > 0 ? fields.map((field) => JSON.stringify(doc[field] ?? '')).join(' ') : JSON.stringify(doc);
  return haystack.toLowerCase().includes(search);
}

export async function nextNumber(db: NileDatabase, name: string, prefix: string): Promise<string> {
  const current = (await one(db, 'sequences', 'main')) ?? asDoc('main', {});
  const value = num(current, name) + 1;
  await save(db, 'sequences', asDoc('main', { ...current, [name]: value }), true);
  return `${prefix}-${String(value).padStart(4, '0')}`;
}

export function within(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  if (from && day < from) {
    return false;
  }
  if (to && day > to) {
    return false;
  }
  return true;
}
