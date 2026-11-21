import type { ServiceRecord } from '../../features/catalog/catalog.models';

/** Sync lifecycle for a record mirrored to Google Sheets. */
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'conflict';

export interface GoogleSheetsConfig {
  clientId: string;
  spreadsheetId: string;
  servicesSheet: string;
  usersSheet: string;
}

/**
 * One row on the Services tab.
 * Flat columns are for humans; `payloadJson` is the round-trip source of truth.
 */
export interface ServiceSheetRow {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  categoryId: string;
  categoryNameEn: string;
  categoryNameAr: string;
  image: string;
  price: string;
  commissionType: string;
  commissionValue: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  deleted: string;
  lastSyncedAt: string;
  deviceId: string;
  payloadJson: string;
}

export const SERVICE_SHEET_HEADERS: readonly (keyof ServiceSheetRow)[] = [
  'id',
  'nameEn',
  'nameAr',
  'descriptionEn',
  'descriptionAr',
  'categoryId',
  'categoryNameEn',
  'categoryNameAr',
  'image',
  'price',
  'commissionType',
  'commissionValue',
  'status',
  'createdAt',
  'updatedAt',
  'version',
  'deleted',
  'lastSyncedAt',
  'deviceId',
  'payloadJson',
] as const;

export interface ServiceSyncMeta {
  version: number;
  syncStatus: SyncStatus;
  lastSyncedAt: string;
  deviceId: string;
  deleted: boolean;
}

export interface ServiceConflict {
  id: string;
  detectedAt: string;
  local: ServiceRecord;
  remote: ServiceRecord;
  localVersion: number;
  remoteVersion: number;
}

export interface GoogleSyncSnapshot {
  connected: boolean;
  sheetReady: boolean;
  lastPullAt: string;
  lastPushAt: string;
  lastError: string;
  pendingCount: number;
  conflictCount: number;
  deviceId: string;
}

export interface GoogleTokenState {
  accessToken: string;
  expiresAt: number;
}
