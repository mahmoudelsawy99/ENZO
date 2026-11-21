import type { Observable } from 'rxjs';
import type { ServiceRecord } from '../../features/catalog/catalog.models';
import type { GoogleSyncSnapshot, ServiceConflict } from './google-sheet.models';

/**
 * Cloud sync contract used by Google Sheets.
 * Components depend on this shape, not on Sheets HTTP details.
 */
export interface DataSyncProvider {
  readonly snapshot: Observable<GoogleSyncSnapshot>;
  connect(): Promise<void>;
  disconnect(): void;
  prepareServicesSheet(): Promise<void>;
  pushServices(): Promise<void>;
  pullServices(): Promise<void>;
  syncServicesNow(): Promise<void>;
  conflicts(): Promise<ServiceConflict[]>;
  resolveConflictKeepLocal(id: string): Promise<void>;
  resolveConflictKeepRemote(id: string): Promise<ServiceRecord>;
}
