import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { OrganizationApi } from '../organization/organization.api';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { WorkSchedule } from './workforce.models';

@Component({
  selector: 'app-schedules-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Button, Select, TextInput, DateField, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.schedules' | t" [description]="'work.schedulesDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]" />
    @if (access.can('schedules.manage')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="form" (ngSubmit)="save()">
        <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
        <enzo-text-input formControlName="startTime" [label]="'work.start' | t" />
        <enzo-text-input formControlName="endTime" [label]="'work.end' | t" />
        <enzo-text-input formControlName="breakMinutes" type="number" [label]="'work.break' | t" />
        <enzo-text-input formControlName="daysOff" [label]="'work.daysOff' | t" [hint]="'work.daysOffHint' | t" />
        <enzo-date-field formControlName="effectiveFrom" [label]="'work.effectiveFrom' | t" />
        <enzo-date-field formControlName="effectiveTo" [label]="'work.effectiveTo' | t" />
        <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
      </form>
    }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="clock" [title]="'work.emptySchedules' | t" [description]="'work.emptySchedulesBody' | t" /></div>
    } @else {
      <div class="grid gap-3">
        @for (row of rows(); track row.id) {
          <article class="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <p class="font-medium">{{ name(row.employeeId) }}</p>
            <p class="text-text-secondary">{{ row.effectiveFrom }} – {{ row.effectiveTo || ('work.openEnded' | t) }}</p>
            <p>{{ summary(row) }}</p>
          </article>
        }
      </div>
    }
  `,
})
export class SchedulesPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<WorkSchedule[]>([]);
  protected readonly employees = signal<SelectOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    employeeId: ['', Validators.required],
    startTime: ['10:00', Validators.required],
    endTime: ['18:00', Validators.required],
    breakMinutes: ['0', Validators.required],
    daysOff: '5',
    effectiveFrom: ['', Validators.required],
    effectiveTo: '',
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.employees.set(result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))),
    });
    this.load();
  }

  protected employeeOptions(): SelectOption[] {
    return this.employees();
  }

  protected name(id: string): string {
    return this.employees().find((employee) => employee.value === id)?.label ?? id;
  }

  protected summary(row: WorkSchedule): string {
    const working = row.days.find((day) => day.working);
    const off = row.days.filter((day) => !day.working).map((day) => this.i18n.translate(`work.weekday.${day.weekday}`)).join(', ');
    return `${working?.startTime ?? ''}–${working?.endTime ?? ''} · ${this.i18n.translate('work.off')}: ${off}`;
  }

  protected load(): void {
    const branchId = this.branchId();
    this.loading.set(true);
    this.api.schedules('', branchId).subscribe({
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

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const branchId = this.branchId();
    if (!branchId) {
      this.toast.danger(this.i18n.translate('work.pickBranch'));
      return;
    }
    const value = this.form.getRawValue();
    const off = new Set(value.daysOff.split(',').map((item) => Number(item.trim())).filter((item) => item >= 0 && item <= 6));
    this.saving.set(true);
    this.api.saveSchedule({
      employeeId: value.employeeId,
      branchId,
      effectiveFrom: value.effectiveFrom,
      effectiveTo: value.effectiveTo,
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        working: !off.has(weekday),
        startTime: value.startTime,
        endTime: value.endTime,
        breakMinutes: Number(value.breakMinutes) || 0,
      })),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('work.saved'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private branchId(): string {
    return this.branches.selectedId() || this.branches.branches()[0]?.id || '';
  }
}
