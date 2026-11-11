import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { OrganizationApi } from '../organization/organization.api';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { WorkforceApi } from './workforce.api';
import type { AttendanceRow } from './workforce.models';

@Component({
  selector: 'app-attendance-history-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, DateField, Select, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.history' | t" [description]="'work.historyDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]">
      <a enzoButton variant="secondary" routerLink="/attendance/daily">{{ 'work.daily' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-4" [formGroup]="form" (ngSubmit)="load()">
      <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
      <enzo-date-field formControlName="from" [label]="'work.from' | t" />
      <enzo-date-field formControlName="to" [label]="'work.to' | t" />
      <div class="flex items-end"><button enzoButton type="submit">{{ 'common.search' | t }}</button></div>
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
          <caption class="sr-only">{{ 'work.history' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.date' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.employee' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.checkIn' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.checkOut' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.status' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.source' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ row.attendanceDate }}</td>
                <td class="px-4 py-3">{{ row.employeeName }}</td>
                <td class="px-4 py-3">{{ row.checkInLabel || '—' }}</td>
                <td class="px-4 py-3">{{ row.checkOutLabel || '—' }}</td>
                <td class="px-4 py-3"><enzo-badge>{{ 'work.attendanceStatus.' + row.status | t }}</enzo-badge></td>
                <td class="px-4 py-3">{{ row.checkInSource }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AttendanceHistoryPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly employees = signal<SelectOption[]>([{ value: '', label: '' }]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    employeeId: '',
    from: [monthStart(), Validators.required],
    to: [today(), Validators.required],
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => {
        this.employees.set([{ value: '', label: this.i18n.translate('work.allEmployees') }, ...result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))]);
      },
    });
    this.load();
  }

  protected employeeOptions(): SelectOption[] {
    return this.employees();
  }

  protected load(): void {
    const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    if (!branchId) {
      this.loading.set(false);
      this.error.set(this.i18n.translate('work.pickBranch'));
      return;
    }
    this.loading.set(true);
    this.api.attendance(branchId, this.form.controls.from.value, this.form.controls.to.value, this.form.controls.employeeId.value).subscribe({
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
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
