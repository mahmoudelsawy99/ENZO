import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { WorkforceApi } from './workforce.api';
import type { DeviceSyncLog } from './workforce.models';

@Component({
  selector: 'app-device-logs-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.logs' | t" [description]="'work.logsDescription' | t" [breadcrumbs]="[{ labelKey: 'work.devices', link: '/attendance/devices' }]">
      <a enzoButton variant="secondary" routerLink="/attendance/devices">{{ 'work.devices' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="clock" [title]="'work.emptyLogs' | t" [description]="'work.emptyLogsBody' | t" /></div>
    } @else {
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'work.logs' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.status' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.events' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.message' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.finished' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3"><enzo-badge [tone]="row.status === 'SUCCESS' ? 'success' : 'danger'">{{ row.status }}</enzo-badge></td>
                <td class="px-4 py-3">{{ row.eventCount }}</td>
                <td class="px-4 py-3">{{ row.message }}</td>
                <td class="px-4 py-3">{{ row.finishedAt }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class DeviceLogsPage {
  private readonly api = inject(WorkforceApi);
  private readonly i18n = inject(LanguageService);
  protected readonly rows = signal<DeviceSyncLog[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.syncLogs().subscribe({
      next: (result) => {
        this.rows.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
