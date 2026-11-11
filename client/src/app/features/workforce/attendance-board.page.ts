import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { WorkforceApi } from './workforce.api';
import type { AttendanceCounts } from './workforce.models';

@Component({
  selector: 'app-attendance-board-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, KpiCard, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.attendance' | t" [description]="'work.attendanceDescription' | t">
      <a enzoButton variant="secondary" routerLink="/attendance/daily">{{ 'work.daily' | t }}</a>
      <a enzoButton variant="secondary" routerLink="/attendance/history">{{ 'work.history' | t }}</a>
      <a enzoButton variant="secondary" routerLink="/attendance/manual">{{ 'work.manual' | t }}</a>
    </enzo-page-header>
    <nav class="mb-4 flex flex-wrap gap-2">
      <a enzoButton size="sm" variant="ghost" routerLink="/attendance/schedules">{{ 'work.schedules' | t }}</a>
      <a enzoButton size="sm" variant="ghost" routerLink="/attendance/rules">{{ 'work.rules' | t }}</a>
      <a enzoButton size="sm" variant="ghost" routerLink="/attendance/devices">{{ 'work.devices' | t }}</a>
      <a enzoButton size="sm" variant="ghost" routerLink="/attendance/device-logs">{{ 'work.logs' | t }}</a>
    </nav>
    @if (!branchId()) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="building" [title]="'work.pickBranch' | t" [description]="'work.pickBranchBody' | t" /></div>
    } @else if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (item of cards(); track item.key) {
          <enzo-kpi-card [label]="item.label" [value]="item.value" />
        }
      </div>
    }
  `,
})
export class AttendanceBoardPage {
  private readonly api = inject(WorkforceApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly counts = signal<AttendanceCounts | null>(null);

  constructor() {
    this.load();
  }

  protected branchId(): string {
    return this.branches.selectedId() || this.branches.branches()[0]?.id || '';
  }

  protected cards(): Array<{ key: string; label: string; value: string }> {
    const counts = this.counts();
    if (!counts) {
      return [];
    }
    return (['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'DAY_OFF'] as const).map((key) => ({
      key,
      label: this.i18n.translate(`work.attendanceStatus.${key}`),
      value: String(counts[key] ?? 0),
    }));
  }

  protected load(): void {
    const branchId = this.branchId();
    if (!branchId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.summary(branchId, today()).subscribe({
      next: (result) => {
        this.counts.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
