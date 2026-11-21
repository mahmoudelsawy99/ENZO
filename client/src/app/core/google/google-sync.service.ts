import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { ServiceRecord } from '../../features/catalog/catalog.models';
import { nileDb, openNileDatabase } from '../local/local-database';
import { all, asDoc, asPayload, one, save, type Payload } from '../local/local-repo';
import type { DataSyncProvider } from './data-provider.interface';
import { GoogleAuthService } from './google-auth.service';
import { emptyServiceMeta, parseSheetMatrix, rowMeta, rowToService, rowValues, serviceToRow } from './google-services.mapper';
import { GoogleSheetsService } from './google-sheets.service';
import type { GoogleSyncSnapshot, ServiceConflict, ServiceSyncMeta } from './google-sheet.models';
import { userToRow } from './google-users.mapper';

const META_DEVICE = 'google-device-id';
const META_STATE = 'google-services-sync';
const META_QUEUE = 'google-services-queue';
const META_VERSIONS = 'google-services-versions';
const META_CONFLICTS = 'google-services-conflicts';
const POLL_MS = 45_000;

interface SyncStateDoc {
  id: string;
  sheetReady: boolean;
  lastPullAt: string;
  lastPushAt: string;
  lastError: string;
}

interface QueueDoc {
  id: string;
  serviceIds: string[];
  userIds: string[];
}

interface VersionsDoc {
  id: string;
  byId: Record<string, ServiceSyncMeta>;
}

interface ConflictsDoc {
  id: string;
  items: ServiceConflict[];
}

/**
 * Phase 1: Services + Users.
 * IndexedDB stays the working copy. Sheets is the shared mirror.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSyncService implements DataSyncProvider {
  private readonly auth = inject(GoogleAuthService);
  private readonly sheets = inject(GoogleSheetsService);
  private readonly snapshotSubject = new BehaviorSubject<GoogleSyncSnapshot>(this.emptySnapshot());
  private pollTimer: number | null = null;
  private pushTimer: number | null = null;
  private busy = false;

  readonly snapshot = this.snapshotSubject.asObservable();
  readonly status = signal<GoogleSyncSnapshot>(this.emptySnapshot());
  readonly working = signal(false);

  constructor() {
    void this.refreshSnapshot();
  }

  async connect(): Promise<void> {
    await this.auth.connect(false);
    await this.refreshSnapshot();
    this.startPolling();
    const queue = await this.readQueue();
    if (queue.serviceIds.length > 0 || (queue.userIds?.length ?? 0) > 0) {
      void this.flushPendingWrites().catch(async (error) => {
        const state = await this.readState();
        state.lastError = error instanceof Error ? error.message : 'Google push failed.';
        await this.writeState(state);
        await this.refreshSnapshot();
      });
    }
  }

  disconnect(): void {
    this.stopPolling();
    this.auth.disconnect();
    void this.refreshSnapshot();
  }

  async prepareServicesSheet(): Promise<void> {
    await this.withBusy(async () => {
      await this.sheets.ensureServicesSheet();
      await this.sheets.ensureUsersSheet();
      const state = await this.readState();
      state.sheetReady = true;
      state.lastError = '';
      await this.writeState(state);
    });
    // Outside withBusy — nested busy would no-op the push and leave headers only.
    await this.pushServices();
    await this.pushUsers();
  }

  /** One-time upload of a Nile Excel backup into the configured Google Spreadsheet. */
  async uploadExcelWorkbook(file: ArrayBuffer | File): Promise<{ sheets: number; rows: number }> {
    let sheets = 0;
    let rows = 0;
    await this.withBusy(async () => {
      if (!this.auth.isConnected()) {
        await this.auth.connect(false);
      }
      const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const book = XLSX.read(buffer, { type: 'array' });
      const payload: Array<{ title: string; values: string[][] }> = [];
      for (const name of book.SheetNames) {
        const sheet = book.Sheets[name];
        const matrix = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as unknown as Array<Array<unknown>>;
        if (matrix.length === 0) {
          continue;
        }
        if (matrix.length === 1 && String(matrix[0]?.[0] ?? '') === 'info') {
          continue;
        }
        const values = matrix.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
        payload.push({ title: name.slice(0, 100), values });
        rows += Math.max(0, values.length - 1);
      }
      sheets = await this.sheets.replaceWorkbookSheets(payload);
      const state = await this.readState();
      state.lastPushAt = new Date().toISOString();
      state.lastError = '';
      await this.writeState(state);
    });
    return { sheets, rows };
  }

  async uploadBundledExcelBackup(): Promise<{ sheets: number; rows: number }> {
    const response = await fetch('nile-data-upload.xlsx');
    if (!response.ok) {
      throw new Error('The Excel backup file is missing from the app build.');
    }
    return this.uploadExcelWorkbook(await response.arrayBuffer());
  }

  /** Mark local service writes for a later push. Does not call Google immediately. */
  noteLocalServicesWrite(serviceIds: string[] = []): void {
    void this.enqueue(serviceIds, true).then(() => {
      this.schedulePush();
      return this.refreshSnapshot();
    });
  }

  /** Queue a user write; push immediately when Google is already connected. */
  noteLocalUsersWrite(userIds: string[] = []): void {
    void this.enqueueUsers(userIds)
      .then(() => this.refreshSnapshot())
      .then(() => {
        if (this.auth.isConnected()) {
          return this.pushUsers();
        }
        this.schedulePush();
        return undefined;
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : 'Users push failed.';
        if (/already running/i.test(message)) {
          this.schedulePush();
          return;
        }
        const state = await this.readState();
        state.lastError = message;
        await this.writeState(state);
        await this.refreshSnapshot();
      });
  }

  async pushUsers(): Promise<void> {
    await this.withBusy(async () => {
      await this.ensureReady();
      await this.sheets.ensureUsersSheet();
      const queue = await this.readQueue();
      const users = await all(nileDb, 'users');
      const queued = [...new Set((queue.userIds ?? []).map(String).filter(Boolean))];
      // Prefer updating only saved users so Excel-uploaded rows stay on the sheet.
      const targets =
        queued.length > 0
          ? users.filter((row) => queued.includes(String(row.id)))
          : users;
      const rows = targets.map((row) => userToRow(row));
      await this.sheets.upsertUserRows(rows);
      queue.userIds = [];
      await this.writeQueue(queue);
      const state = await this.readState();
      state.lastPushAt = new Date().toISOString();
      state.lastError = '';
      await this.writeState(state);
    });
  }

  async pushServices(): Promise<void> {
    await this.withBusy(async () => {
      await this.ensureReady();
      const deviceId = await this.deviceId();
      const queue = await this.readQueue();
      const versions = await this.readVersions();
      const services = await all(nileDb, 'services');
      // Full snapshot by default. Only limit to the queue when it has ids AND those
      // rows still exist locally — otherwise a stale 1-id queue wrote headers-only.
      const queued = [...new Set(queue.serviceIds.map(String).filter(Boolean))];
      const fullIds = services.map((row) => String(row.id)).filter(Boolean);
      const useQueue = queued.length > 0 && queued.some((id) => services.some((row) => String(row.id) === id));
      const uniqueIds = useQueue ? queued : fullIds;
      const rows: string[][] = [];
      const now = new Date().toISOString();
      for (const id of uniqueIds) {
        const local = services.find((row) => String(row.id) === id) as ServiceRecord | undefined;
        const previous = versions.byId[id] ?? emptyServiceMeta(deviceId);
        if (!local) {
          if (!useQueue) {
            continue;
          }
          const meta: ServiceSyncMeta = {
            ...previous,
            version: previous.version + 1,
            deleted: true,
            syncStatus: 'pending',
            lastSyncedAt: now,
            deviceId,
          };
          rows.push(rowValues(serviceToRow(deletedStub(id, previous), meta)));
          versions.byId[id] = { ...meta, syncStatus: 'synced' };
          continue;
        }
        const meta: ServiceSyncMeta = {
          version: Math.max(1, previous.version || 1),
          syncStatus: 'pending',
          lastSyncedAt: now,
          deviceId,
          deleted: false,
        };
        rows.push(rowValues(serviceToRow(local, meta)));
        versions.byId[id] = { ...meta, syncStatus: 'synced', lastSyncedAt: now };
      }
      if (!useQueue) {
        await this.sheets.replaceServicesRows(rows);
      } else {
        await this.sheets.upsertServiceRows(rows);
      }
      queue.serviceIds = [];
      await this.writeQueue(queue);
      await this.writeVersions(versions);
      const state = await this.readState();
      state.lastPushAt = now;
      state.lastError = '';
      await this.writeState(state);
    });
  }

  async pullServices(): Promise<void> {
    await this.withBusy(async () => {
      await this.ensureReady();
      const deviceId = await this.deviceId();
      const matrix = await this.sheets.readServicesMatrix();
      const remoteRows = parseSheetMatrix(matrix);
      const versions = await this.readVersions();
      const conflicts = await this.readConflicts();
      const locals = await all(nileDb, 'services');
      const localById = new Map(locals.map((row) => [row.id, row as unknown as ServiceRecord]));
      let changed = false;
      for (const row of remoteRows) {
        const remote = rowToService(row);
        if (!remote) {
          continue;
        }
        const remoteMeta = rowMeta(row);
        const local = localById.get(remote.id);
        const localMeta = versions.byId[remote.id] ?? emptyServiceMeta(deviceId);
        if (remoteMeta.deleted) {
          if (local) {
            await save(nileDb, 'services', asDoc(remote.id, { ...asPayload(local), status: 'INACTIVE' }));
            changed = true;
          }
          versions.byId[remote.id] = { ...remoteMeta, syncStatus: 'synced', deviceId };
          continue;
        }
        if (!local) {
          await save(nileDb, 'services', asDoc(remote.id, servicePayload(remote)), true);
          versions.byId[remote.id] = { ...remoteMeta, syncStatus: 'synced', deviceId };
          changed = true;
          continue;
        }
        const sameContent = JSON.stringify(normalizeService(local)) === JSON.stringify(normalizeService(remote));
        if (sameContent) {
          versions.byId[remote.id] = { ...remoteMeta, syncStatus: 'synced', deviceId };
          continue;
        }
        const localDirty = localMeta.syncStatus === 'pending' || localMeta.syncStatus === 'failed';
        const remoteNewer =
          (remote.updatedAt || '') > (local.updatedAt || '') ||
          remoteMeta.version > localMeta.version;
        if (localDirty && remoteNewer && localMeta.deviceId && remoteMeta.deviceId && localMeta.deviceId !== remoteMeta.deviceId) {
          const item: ServiceConflict = {
            id: remote.id,
            detectedAt: new Date().toISOString(),
            local,
            remote,
            localVersion: localMeta.version,
            remoteVersion: remoteMeta.version,
          };
          conflicts.items = [...conflicts.items.filter((entry) => entry.id !== remote.id), item];
          versions.byId[remote.id] = { ...localMeta, syncStatus: 'conflict' };
          continue;
        }
        if (remoteNewer || !localDirty) {
          await save(nileDb, 'services', asDoc(remote.id, servicePayload(remote)), true);
          versions.byId[remote.id] = { ...remoteMeta, syncStatus: 'synced', deviceId };
          changed = true;
        }
      }
      await this.writeVersions(versions);
      await this.writeConflicts(conflicts);
      const state = await this.readState();
      state.lastPullAt = new Date().toISOString();
      state.lastError = '';
      await this.writeState(state);
      if (changed) {
        // Local POS caches pick up services on next catalog load.
      }
    });
  }

  async syncServicesNow(): Promise<void> {
    await this.pushServices();
    await this.pushUsers();
    await this.pullServices();
  }

  async conflicts(): Promise<ServiceConflict[]> {
    return (await this.readConflicts()).items;
  }

  async resolveConflictKeepLocal(id: string): Promise<void> {
    const conflicts = await this.readConflicts();
    const item = conflicts.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    await this.enqueue([id]);
    conflicts.items = conflicts.items.filter((entry) => entry.id !== id);
    await this.writeConflicts(conflicts);
    const versions = await this.readVersions();
    const current = versions.byId[id] ?? emptyServiceMeta(await this.deviceId());
    versions.byId[id] = { ...current, syncStatus: 'pending', version: Math.max(current.version, item.remoteVersion) + 1 };
    await this.writeVersions(versions);
    await this.pushServices();
    await this.refreshSnapshot();
  }

  async resolveConflictKeepRemote(id: string): Promise<ServiceRecord> {
    const conflicts = await this.readConflicts();
    const item = conflicts.items.find((entry) => entry.id === id);
    if (!item) {
      throw new Error('That conflict is no longer listed.');
    }
    await save(nileDb, 'services', asDoc(id, servicePayload(item.remote)), true);
    conflicts.items = conflicts.items.filter((entry) => entry.id !== id);
    await this.writeConflicts(conflicts);
    const versions = await this.readVersions();
    versions.byId[id] = {
      version: item.remoteVersion,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
      deviceId: await this.deviceId(),
      deleted: false,
    };
    await this.writeVersions(versions);
    await this.refreshSnapshot();
    return item.remote;
  }

  private async ensureReady(): Promise<void> {
    if (!this.auth.isConnected()) {
      await this.auth.connect(false);
    }
    const state = await this.readState();
    if (!state.sheetReady) {
      await this.sheets.ensureServicesSheet();
      await this.sheets.ensureUsersSheet();
      state.sheetReady = true;
      state.lastError = '';
      await this.writeState(state);
    }
  }

  private async flushPendingWrites(): Promise<void> {
    if (!this.auth.isConnected()) {
      return;
    }
    const queue = await this.readQueue();
    if (queue.serviceIds.length > 0) {
      await this.pushServices();
    }
    if ((queue.userIds?.length ?? 0) > 0) {
      await this.pushUsers();
    }
  }

  private schedulePush(): void {
    if (this.pushTimer !== null) {
      window.clearTimeout(this.pushTimer);
    }
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null;
      void this.flushPendingWrites().catch(async (error) => {
        const state = await this.readState();
        state.lastError = error instanceof Error ? error.message : 'Google push failed.';
        await this.writeState(state);
        await this.refreshSnapshot();
      });
    }, 800);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      if (!this.auth.isConnected() || this.busy) {
        return;
      }
      void this.pullServices().catch(async (error) => {
        const state = await this.readState();
        state.lastError = error instanceof Error ? error.message : 'Services pull failed.';
        await this.writeState(state);
        await this.refreshSnapshot();
      });
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async enqueue(serviceIds: string[], bumpVersion = false): Promise<void> {
    await openNileDatabase();
    const queue = await this.readQueue();
    const merged = new Set([...queue.serviceIds, ...serviceIds.filter(Boolean)]);
    if (serviceIds.length === 0) {
      const allIds = (await all(nileDb, 'services')).map((row) => String(row.id));
      for (const id of allIds) {
        merged.add(id);
      }
    }
    const touched = serviceIds.length > 0 ? serviceIds.filter(Boolean) : [...merged];
    queue.serviceIds = [...merged];
    queue.userIds = queue.userIds ?? [];
    await this.writeQueue(queue);
    const versions = await this.readVersions();
    const deviceId = await this.deviceId();
    for (const id of touched) {
      const current = versions.byId[id] ?? emptyServiceMeta(deviceId);
      if (current.syncStatus === 'conflict') {
        versions.byId[id] = { ...current, deviceId };
        continue;
      }
      let version = Math.max(1, current.version || 1);
      if (bumpVersion && current.syncStatus === 'synced') {
        version = current.version + 1;
      }
      versions.byId[id] = {
        ...current,
        version,
        syncStatus: 'pending',
        deviceId,
        deleted: false,
      };
    }
    await this.writeVersions(versions);
  }

  private async enqueueUsers(userIds: string[]): Promise<void> {
    await openNileDatabase();
    const queue = await this.readQueue();
    const merged = new Set([...(queue.userIds ?? []), ...userIds.filter(Boolean)]);
    if (userIds.length === 0) {
      for (const id of (await all(nileDb, 'users')).map((row) => String(row.id))) {
        merged.add(id);
      }
    }
    queue.userIds = [...merged];
    queue.serviceIds = queue.serviceIds ?? [];
    await this.writeQueue(queue);
  }

  private async withBusy(work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      throw new Error('A Google sync is already running.');
    }
    this.busy = true;
    this.working.set(true);
    try {
      await openNileDatabase();
      await work();
    } catch (error) {
      const state = await this.readState();
      state.lastError = error instanceof Error ? error.message : 'Google sync failed.';
      await this.writeState(state);
      throw error;
    } finally {
      this.busy = false;
      this.working.set(false);
      await this.refreshSnapshot();
    }
  }

  private async refreshSnapshot(): Promise<void> {
    await openNileDatabase();
    const state = await this.readState();
    const queue = await this.readQueue();
    const conflicts = await this.readConflicts();
    const snapshot: GoogleSyncSnapshot = {
      connected: this.auth.isConnected(),
      sheetReady: state.sheetReady,
      lastPullAt: state.lastPullAt,
      lastPushAt: state.lastPushAt,
      lastError: state.lastError || this.auth.lastError(),
      pendingCount: queue.serviceIds.length + (queue.userIds?.length ?? 0),
      conflictCount: conflicts.items.length,
      deviceId: await this.deviceId(),
    };
    this.status.set(snapshot);
    this.snapshotSubject.next(snapshot);
  }

  private emptySnapshot(): GoogleSyncSnapshot {
    return {
      connected: false,
      sheetReady: false,
      lastPullAt: '',
      lastPushAt: '',
      lastError: '',
      pendingCount: 0,
      conflictCount: 0,
      deviceId: '',
    };
  }

  private async deviceId(): Promise<string> {
    const existing = await one(nileDb, 'meta', META_DEVICE);
    if (existing && typeof existing['value'] === 'string' && existing['value']) {
      return String(existing['value']);
    }
    const value = crypto.randomUUID();
    await save(nileDb, 'meta', asDoc(META_DEVICE, { value }), true);
    return value;
  }

  private async readState(): Promise<SyncStateDoc> {
    const row = await one(nileDb, 'meta', META_STATE);
    return {
      id: META_STATE,
      sheetReady: row?.['sheetReady'] === true,
      lastPullAt: typeof row?.['lastPullAt'] === 'string' ? row['lastPullAt'] : '',
      lastPushAt: typeof row?.['lastPushAt'] === 'string' ? row['lastPushAt'] : '',
      lastError: typeof row?.['lastError'] === 'string' ? row['lastError'] : '',
    };
  }

  private async writeState(state: SyncStateDoc): Promise<void> {
    await save(nileDb, 'meta', asDoc(META_STATE, asPayload(state)), true);
  }

  private async readQueue(): Promise<QueueDoc> {
    const row = await one(nileDb, 'meta', META_QUEUE);
    const serviceIds = Array.isArray(row?.['serviceIds']) ? row['serviceIds'].map(String) : [];
    const userIds = Array.isArray(row?.['userIds']) ? row['userIds'].map(String) : [];
    return { id: META_QUEUE, serviceIds, userIds };
  }

  private async writeQueue(queue: QueueDoc): Promise<void> {
    await save(nileDb, 'meta', asDoc(META_QUEUE, asPayload(queue)), true);
  }

  private async readVersions(): Promise<VersionsDoc> {
    const row = await one(nileDb, 'meta', META_VERSIONS);
    const byId = row && typeof row['byId'] === 'object' && row['byId'] ? (row['byId'] as Record<string, ServiceSyncMeta>) : {};
    return { id: META_VERSIONS, byId };
  }

  private async writeVersions(doc: VersionsDoc): Promise<void> {
    await save(nileDb, 'meta', asDoc(META_VERSIONS, asPayload(doc)), true);
  }

  private async readConflicts(): Promise<ConflictsDoc> {
    const row = await one(nileDb, 'meta', META_CONFLICTS);
    const items = Array.isArray(row?.['items']) ? (row['items'] as ServiceConflict[]) : [];
    return { id: META_CONFLICTS, items };
  }

  private async writeConflicts(doc: ConflictsDoc): Promise<void> {
    await save(nileDb, 'meta', asDoc(META_CONFLICTS, asPayload(doc)), true);
  }
}

function servicePayload(service: ServiceRecord): Payload {
  return asPayload(service);
}

function normalizeService(service: ServiceRecord): ServiceRecord {
  return {
    id: service.id,
    name: { en: service.name?.en ?? '', ar: service.name?.ar ?? '' },
    description: { en: service.description?.en ?? '', ar: service.description?.ar ?? '' },
    categoryId: service.categoryId ?? '',
    categoryName: { en: service.categoryName?.en ?? '', ar: service.categoryName?.ar ?? '' },
    image: service.image ?? '',
    price: Number(service.price) || 0,
    commissionType: service.commissionType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
    commissionValue: Number(service.commissionValue) || 0,
    status: service.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    createdAt: service.createdAt ?? '',
    updatedAt: service.updatedAt ?? '',
  };
}

function deletedStub(id: string, meta: ServiceSyncMeta): ServiceRecord {
  return {
    id,
    name: { en: '', ar: '' },
    description: { en: '', ar: '' },
    categoryId: '',
    categoryName: { en: '', ar: '' },
    image: '',
    price: 0,
    commissionType: 'PERCENTAGE',
    commissionValue: 0,
    status: 'INACTIVE',
    createdAt: '',
    updatedAt: meta.lastSyncedAt || new Date().toISOString(),
  };
}
