import { Injectable, signal } from '@angular/core';
import { nileDb } from './local-database';
import { workbookBlob } from './local-excel';
import { asDoc, save } from './local-repo';
import { localUserId, readPersistedSession } from './local-session';
import { exportSnapshot, importSnapshot, validateBackup, type NileBackup } from './local-snapshot';
import { one } from './local-repo';

interface DirectoryHandle {
  name: string;
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<FileHandle>;
}

interface FileHandle {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

interface HistoryRow {
  id: string;
  at: string;
  kind: string;
  json: string;
  excel: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LocalBackupService {
  readonly status = signal<'idle' | 'saving' | 'saved' | 'error' | 'needs-folder'>('needs-folder');
  readonly folderName = signal('');
  readonly lastJsonAt = signal('');
  readonly lastExcelAt = signal('');
  readonly jsonStatus = signal('waiting');
  readonly excelStatus = signal('waiting');
  readonly lastError = signal('');
  readonly history = signal<HistoryRow[]>([]);
  private directory: DirectoryHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  markDirty(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run('auto');
    }, 1200);
  }

  async hydrate(): Promise<void> {
    const stored = await nileDb.handles.get('backup-directory');
    const handle = stored?.handle as DirectoryHandle | undefined;
    if (handle?.getFileHandle) {
      this.folderName.set(handle.name || 'Backup');
      const permission = await handle.queryPermission?.({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.directory = handle;
        this.status.set('idle');
      } else {
        this.lastError.set('Choose D:\\NileBarbers\\Backup again so Chrome can write the backup files.');
        this.status.set('needs-folder');
      }
    }
    await this.loadHistory();
  }

  async chooseFolder(): Promise<void> {
    const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      this.lastError.set('This browser cannot remember a folder. Use Download backup instead.');
      this.status.set('error');
      return;
    }
    this.directory = await picker({ mode: 'readwrite' });
    await nileDb.handles.put({ id: 'backup-directory', handle: this.directory });
    this.folderName.set(this.directory.name);
    this.lastError.set('');
    await this.run('manual');
  }

  run(kind: 'auto' | 'manual'): Promise<void> {
    const job = this.chain.then(() => this.write(kind));
    this.chain = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  async restore(file: File): Promise<void> {
    const parsed = validateBackup(JSON.parse(await file.text()) as unknown);
    const safety = await exportSnapshot(nileDb);
    const safetyName = `nile-data-safety-${stamp()}.json`;
    const safetyBlob = new Blob([JSON.stringify(safety)], { type: 'application/json' });
    if (this.directory) {
      await this.writeNamed(this.directory, safetyName, safetyBlob);
    } else {
      download(safetyName, safetyBlob);
    }
    await importSnapshot(nileDb, parsed);
    await this.keepSession();
    await this.loadHistory();
    await this.run('manual');
  }

  private async write(kind: 'auto' | 'manual'): Promise<void> {
    const snapshot = await exportSnapshot(nileDb);
    const jsonBlob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    const excelBlob = await workbookBlob(snapshot.collections);
    if (!this.directory && kind === 'auto') {
      this.status.set('needs-folder');
      this.jsonStatus.set('waiting');
      this.excelStatus.set('waiting');
      this.lastError.set('Automatic backup is waiting for D:\\NileBarbers\\Backup. Nothing was marked saved.');
      return;
    }
    this.status.set('saving');
    let jsonState = 'error';
    let excelState = 'error';
    try {
      if (this.directory) {
        await this.writeNamed(this.directory, 'nile-data.json', jsonBlob);
        jsonState = 'saved';
        this.lastJsonAt.set(new Date().toISOString());
        this.jsonStatus.set('saved');
        await this.writeNamed(this.directory, 'nile-data.xlsx', excelBlob);
        excelState = 'saved';
        this.lastExcelAt.set(new Date().toISOString());
        this.excelStatus.set('saved');
      } else {
        download('nile-data.json', jsonBlob);
        jsonState = 'downloaded';
        this.lastJsonAt.set(new Date().toISOString());
        this.jsonStatus.set('downloaded');
        download('nile-data.xlsx', excelBlob);
        excelState = 'downloaded';
        this.lastExcelAt.set(new Date().toISOString());
        this.excelStatus.set('downloaded');
      }
      this.status.set('saved');
      this.lastError.set('');
    } catch (error) {
      this.status.set('error');
      this.lastError.set(error instanceof Error ? error.message : 'The backup file could not be written.');
      this.jsonStatus.set(jsonState);
      this.excelStatus.set(excelState);
    }
    await this.remember(kind, jsonState, excelState, this.lastError());
  }

  private async writeNamed(directory: DirectoryHandle, name: string, blob: Blob): Promise<void> {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  private async remember(kind: string, json: string, excel: string, message: string): Promise<void> {
    const row = asDoc(`backup-${Date.now()}`, { at: new Date().toISOString(), kind, json, excel, message });
    await save(nileDb, 'backupHistory', row, true);
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const { all } = await import('./local-repo');
    const rows = (await all(nileDb, 'backupHistory'))
      .map((row) => ({ id: row.id, at: String(row['at'] ?? ''), kind: String(row['kind'] ?? ''), json: String(row['json'] ?? ''), excel: String(row['excel'] ?? ''), message: String(row['message'] ?? '') }))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
    this.history.set(rows);
  }

  private async keepSession(): Promise<void> {
    const persisted = readPersistedSession();
    const userId = localUserId() ?? persisted?.userId ?? '';
    if (!userId || !(await one(nileDb, 'users', userId)) || !persisted) {
      return;
    }
    await save(nileDb, 'sessions', asDoc(persisted.token, { userId, expiresAt: persisted.expiresAt }), true);
  }
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export type { NileBackup };
