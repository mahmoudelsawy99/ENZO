import Dexie, { type Table } from 'dexie';

export interface Doc {
  id: string;
  [key: string]: unknown;
}

export interface StoredRecord {
  pk: string;
  collection: string;
  id: string;
  branchId: string;
  status: string;
  updatedAt: string;
  data: Doc;
}

export const DATA_COLLECTIONS = [
  'branches',
  'users',
  'roles',
  'employees',
  'employmentTypes',
  'jobTitles',
  'customers',
  'customerNotes',
  'customerPackages',
  'serviceCategories',
  'services',
  'packages',
  'appointments',
  'appointmentHistory',
  'queue',
  'sales',
  'refunds',
  'shifts',
  'products',
  'productCategories',
  'suppliers',
  'purchases',
  'stock',
  'movements',
  'transfers',
  'alerts',
  'attendance',
  'schedules',
  'policies',
  'devices',
  'deviceMaps',
  'deviceLogs',
  'leaveTypes',
  'leaveRequests',
  'leaveBalances',
  'payroll',
  'activity',
  'messages',
  'templates',
  'settings',
  'sequences',
  'sessions',
  'passwordResets',
  'meta',
  'backupHistory',
] as const;

export type DataCollection = (typeof DATA_COLLECTIONS)[number];

/**
 * IndexedDB schema for one shop on one computer.
 * Version 1 is the local-first baseline. Later versions should add stores in `version(n)`
 * without rewriting callers.
 */
export interface HandleRecord {
  id: string;
  handle: unknown;
}

export class NileDatabase extends Dexie {
  records!: Table<StoredRecord, string>;
  handles!: Table<HandleRecord, string>;

  constructor(name = 'nile-barbers') {
    super(name);
    this.version(1).stores({
      records: 'pk, collection, id, branchId, status, updatedAt, [collection+branchId], [collection+status]',
      handles: 'id',
    });
  }
}

export const nileDb = new NileDatabase();

let opening: Promise<NileDatabase> | null = null;

export function openNileDatabase(): Promise<NileDatabase> {
  opening ??= nileDb.open().then(() => nileDb);
  return opening;
}
