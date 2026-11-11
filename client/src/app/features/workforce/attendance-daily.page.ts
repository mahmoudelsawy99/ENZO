import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { AttendanceRow } from './workforce.models';

@Component({
  selector: 'app-attendance-daily-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, DateField, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.daily' | t" [description]="'work.dailyDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]">
      <a enzoButton variant="secondary" routerLink="/attendance/manual">{{ 'work.manual' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 flex flex-wrap items-end gap-3" [formGroup]="form" (ngSubmit)="load()">
      <enzo-date-field formControlName="date" [label]="'work.date' | t" />
      <button enzoButton type="submit">{{ 'common.search' | t }}</button>
      @if (access.can('attendance.manage')) {
        <button enzoButton type="button" variant="secondary" [loading]="closing()" (click)="closeDay()">{{ 'work.closeDay' | t }}</button>
      }
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="clock" [title]="'work.emptyAttendance' | t" [description]="'work.emptyAttendanceBody' | t" /></div>
    } @else {
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'work.daily' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.employee' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.checkIn' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.checkOut' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.status' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.late' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ row.employeeName }}</td>
                <td class="px-4 py-3">{{ row.checkInLabel || '—' }}</td>
                <td class="px-4 py-3">{{ row.checkOutLabel || '—' }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="tone(row.status)">{{ 'work.attendanceStatus.' + row.status | t }}</enzo-badge></td>
                <td class="px-4 py-3">{{ row.lateMinutes }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AttendanceDailyPage {
  private readonly api = inject(WorkforceApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly closing = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({ date: today() });

  constructor() {
    this.load();
  }

  protected tone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
    if (status === 'PRESENT' || status === 'ON_LEAVE') return 'success';
    if (status === 'LATE' || status === 'HALF_DAY') return 'warning';
    if (status === 'ABSENT') return 'danger';
    return 'neutral';
  }

  protected load(): void {
    const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    if (!branchId) {
      this.loading.set(false);
      this.error.set(this.i18n.translate('work.pickBranch'));
      return;
    }
    this.loading.set(true);
    this.api.attendance(branchId, this.form.controls.date.value, this.form.controls.date.value).subscribe({
      next: (result) => {
        this.rows.set(result.data);
        this.loading.set(false);
        this.error.set('');
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected closeDay(): void {
    const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    this.closing.set(true);
    this.api.closeDay(branchId, this.form.controls.date.value).subscribe({
      next: (result) => {
        this.closing.set(false);
        this.toast.success(this.i18n.translate('work.closed', { count: result.data.created }));
        this.load();
      },
      error: (error: unknown) => {
        this.closing.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
