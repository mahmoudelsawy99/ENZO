import { Component, inject, signal } from '@angular/core';
import { ApiError } from '../../core/api/api-error';
import { GoogleSyncService } from '../../core/google/google-sync.service';
import type { ServiceConflict } from '../../core/google/google-sheet.models';
import { nileDb } from '../../core/local/local-database';
import { LocalBackupService } from '../../core/local/local-backup.service';
import { LocalGateway } from '../../core/local/local-gateway.service';
import { collectionCounts } from '../../core/local/local-snapshot';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-local-data-page',
  imports: [TranslatePipe, PageHeader, Button],
  template: `
    <enzo-page-header [title]="'nav.localData' | t" [description]="'pages.localData' | t">
      <button enzoButton type="button" variant="secondary" (click)="chooseFolder()">{{ 'localData.choose' | t }}</button>
      <button enzoButton type="button" [loading]="working()" (click)="backupNow()">{{ 'localData.backup' | t }}</button>
    </enzo-page-header>

    <p class="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm leading-6 text-text-secondary">{{ 'localData.security' | t }}</p>
    <p class="mb-4 text-sm text-text-secondary">{{ 'localData.accounts' | t }}</p>

    <section class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
      <p><span class="block text-xs text-text-secondary">{{ 'localData.database' | t }}</span> IndexedDB · nile-barbers</p>
      <p><span class="block text-xs text-text-secondary">{{ 'localData.folder' | t }}</span> {{ backup.folderName() || 'D:\\\\NileBarbers\\\\Backup' }}</p>
      <p><span class="block text-xs text-text-secondary">{{ 'localData.json' | t }}</span> {{ backup.jsonStatus() }} · {{ backup.lastJsonAt() || '—' }}</p>
      <p><span class="block text-xs text-text-secondary">{{ 'localData.excel' | t }}</span> {{ backup.excelStatus() }} · {{ backup.lastExcelAt() || '—' }}</p>
    </section>

    <section class="mb-4 rounded-lg border border-border bg-surface p-4">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-medium">{{ 'localData.googleTitle' | t }}</h2>
          <p class="mt-1 max-w-3xl text-sm text-text-secondary">{{ 'localData.googleHint' | t }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (google.status().connected) {
            <button enzoButton type="button" variant="secondary" (click)="disconnectGoogle()">{{ 'localData.googleDisconnect' | t }}</button>
          } @else {
            <button enzoButton type="button" [loading]="google.working()" (click)="connectGoogle()">{{ 'localData.googleConnect' | t }}</button>
          }
        </div>
      </div>
      <div class="mb-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <p>{{ google.status().connected ? ('localData.googleConnected' | t) : ('localData.googleDisconnected' | t) }}</p>
        <p>{{ google.status().sheetReady ? ('localData.googleSheetReady' | t) : ('localData.googleSheetMissing' | t) }}</p>
        <p>{{ 'localData.googlePending' | t }}: {{ google.status().pendingCount }}</p>
        <p>{{ 'localData.googleConflicts' | t }}: {{ google.status().conflictCount }}</p>
        <p>{{ 'localData.googleDevice' | t }}: {{ google.status().deviceId || '—' }}</p>
        <p>{{ 'localData.googleLastPush' | t }}: {{ google.status().lastPushAt || '—' }}</p>
        <p>{{ 'localData.googleLastPull' | t }}: {{ google.status().lastPullAt || '—' }}</p>
      </div>
      <div class="mb-3 flex flex-wrap gap-2">
        <button enzoButton type="button" variant="secondary" [loading]="google.working()" [disabled]="!google.status().connected" (click)="prepareSheet()">{{ 'localData.googlePrepare' | t }}</button>
        <button enzoButton type="button" variant="secondary" [loading]="google.working()" [disabled]="!google.status().connected || !google.status().sheetReady" (click)="pushServices()">{{ 'localData.googlePush' | t }}</button>
        <button enzoButton type="button" variant="secondary" [loading]="google.working()" [disabled]="!google.status().connected || !google.status().sheetReady" (click)="pullServices()">{{ 'localData.googlePull' | t }}</button>
        <button enzoButton type="button" [loading]="google.working()" [disabled]="!google.status().connected || !google.status().sheetReady" (click)="syncServices()">{{ 'localData.googleSync' | t }}</button>
        <button enzoButton type="button" variant="secondary" [loading]="google.working()" [disabled]="!google.status().connected" (click)="uploadExcel()">{{ 'localData.googleUploadExcel' | t }}</button>
        <label class="inline-flex items-center">
          <span class="sr-only">{{ 'localData.googleUploadExcelFile' | t }}</span>
          <input class="text-sm" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" [disabled]="!google.status().connected || google.working()" (change)="uploadExcelFile($event)" />
        </label>
      </div>
      @if (google.status().lastError) {
        <p class="mb-3 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ google.status().lastError }}</p>
      }
      @if (conflicts().length === 0) {
        <p class="text-sm text-text-secondary">{{ 'localData.googleNoConflicts' | t }}</p>
      } @else {
        <ul class="grid gap-2">
          @for (item of conflicts(); track item.id) {
            <li class="rounded-md border border-border p-3 text-sm">
              <p class="font-medium">{{ item.id }}</p>
              <p class="text-text-secondary">local v{{ item.localVersion }} · sheet v{{ item.remoteVersion }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button enzoButton type="button" size="sm" variant="secondary" (click)="keepLocal(item.id)">{{ 'localData.googleKeepLocal' | t }}</button>
                <button enzoButton type="button" size="sm" variant="secondary" (click)="keepRemote(item.id)">{{ 'localData.googleKeepRemote' | t }}</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    @if (backup.lastError()) {
      <p class="mb-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ backup.lastError() }}</p>
    }
    @if (message()) {
      <p class="mb-4 rounded-md border border-border px-3 py-2 text-sm" role="status">{{ message() }}</p>
    }

    <section class="mb-4 rounded-lg border border-border bg-surface p-4">
      <h2 class="mb-3 text-sm font-medium">{{ 'localData.records' | t }}</h2>
      <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        @for (row of counts(); track row.collection) {
          <li class="flex items-center justify-between text-sm"><span>{{ row.collection }}</span><span>{{ row.count }}</span></li>
        }
      </ul>
    </section>

    <section class="rounded-lg border border-border bg-surface p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-medium">{{ 'localData.history' | t }}</h2>
        <label class="text-sm">
          <span class="sr-only">{{ 'localData.restore' | t }}</span>
          <input class="text-sm" type="file" accept="application/json,.json" (change)="restore($event)" />
        </label>
      </div>
      @if (backup.history().length === 0) {
        <p class="text-sm text-text-secondary">{{ 'localData.emptyHistory' | t }}</p>
      } @else {
        <ul class="grid gap-2 text-sm">
          @for (row of backup.history(); track row.id) {
            <li>{{ row.at }} · {{ row.kind }} · JSON {{ row.json }} · Excel {{ row.excel }}</li>
          }
        </ul>
      }
    </section>
  `,
})
export class LocalDataPage {
  private readonly gateway = inject(LocalGateway);
  protected readonly backup = inject(LocalBackupService);
  protected readonly google = inject(GoogleSyncService);
  protected readonly counts = signal<Array<{ collection: string; count: number }>>([]);
  protected readonly conflicts = signal<ServiceConflict[]>([]);
  protected readonly working = signal(false);
  protected readonly message = signal('');

  constructor() {
    void this.refresh();
  }

  protected async chooseFolder(): Promise<void> {
    this.message.set('');
    await this.backup.chooseFolder();
    await this.refresh();
  }

  protected async backupNow(): Promise<void> {
    this.working.set(true);
    this.message.set('');
    try {
      await this.gateway.prepare();
      await this.backup.run('manual');
    } catch (error) {
      this.message.set(error instanceof ApiError ? error.message : 'Backup failed.');
    } finally {
      this.working.set(false);
      await this.refresh();
    }
  }

  protected async connectGoogle(): Promise<void> {
    this.message.set('');
    try {
      await this.google.connect();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Google connect failed.');
    }
    await this.refresh();
  }

  protected disconnectGoogle(): void {
    this.google.disconnect();
    void this.refresh();
  }

  protected async prepareSheet(): Promise<void> {
    this.message.set('');
    try {
      await this.google.prepareServicesSheet();
      this.message.set('Services sheet is ready.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not prepare the Services sheet.');
    }
    await this.refresh();
  }

  protected async pushServices(): Promise<void> {
    this.message.set('');
    try {
      await this.google.pushServices();
      await this.google.pushUsers();
      this.message.set('Services and users were pushed to Google Sheets.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Push failed.');
    }
    await this.refresh();
  }

  protected async pullServices(): Promise<void> {
    this.message.set('');
    try {
      await this.google.pullServices();
      this.message.set('Services were pulled from Google Sheets.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Pull failed.');
    }
    await this.refresh();
  }

  protected async syncServices(): Promise<void> {
    this.message.set('');
    try {
      await this.google.syncServicesNow();
      this.message.set('Services sync finished.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Sync failed.');
    }
    await this.refresh();
  }

  protected async uploadExcel(): Promise<void> {
    this.message.set('');
    try {
      const result = await this.google.uploadBundledExcelBackup();
      this.message.set(`Uploaded ${result.sheets} sheets (${result.rows} data rows) to Google Sheets.`);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Excel upload failed.');
    }
    await this.refresh();
  }

  protected async uploadExcelFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      return;
    }
    this.message.set('');
    try {
      const result = await this.google.uploadExcelWorkbook(input.files[0]);
      this.message.set(`Uploaded ${result.sheets} sheets (${result.rows} data rows) to Google Sheets.`);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Excel upload failed.');
    } finally {
      input.value = '';
      await this.refresh();
    }
  }

  protected async keepLocal(id: string): Promise<void> {
    await this.google.resolveConflictKeepLocal(id);
    await this.refresh();
  }

  protected async keepRemote(id: string): Promise<void> {
    await this.google.resolveConflictKeepRemote(id);
    await this.refresh();
  }

  protected async restore(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.working.set(true);
    this.message.set('');
    try {
      await this.gateway.prepare();
      await this.backup.restore(input.files[0]);
      this.message.set('Restore finished. The previous data was saved as a safety file first.');
    } catch (error) {
      this.message.set(error instanceof ApiError ? error.message : 'Restore failed. Existing records were left in place if the safety file was not written.');
    } finally {
      input.value = '';
      this.working.set(false);
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    await this.gateway.prepare();
    this.counts.set(await collectionCounts(nileDb));
    this.conflicts.set(await this.google.conflicts());
  }
}
