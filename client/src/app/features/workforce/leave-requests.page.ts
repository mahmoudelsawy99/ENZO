import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { OrganizationApi } from '../organization/organization.api';
import { Badge } from '../../shared/ui/badge';
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
import type { LeaveRequest, LeaveType } from './workforce.models';

@Component({
  selector: 'app-leave-requests-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Select, DateField, TextInput, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.leaveRequests' | t" [description]="'work.leaveRequestsDescription' | t">
      <a enzoButton variant="secondary" routerLink="/leaves/types">{{ 'work.leaveTypes' | t }}</a>
      <a enzoButton variant="secondary" routerLink="/leaves/balances">{{ 'work.balances' | t }}</a>
    </enzo-page-header>
    @if (access.can('leave-requests.create')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="form" (ngSubmit)="create()">
        <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
        <enzo-select formControlName="leaveTypeId" [label]="'work.leaveType' | t" [options]="typeOptions()" />
        <enzo-select formControlName="portion" [label]="'work.portion' | t" [options]="portionOptions()" />
        <enzo-date-field formControlName="startDate" [label]="'work.from' | t" />
        <enzo-date-field formControlName="endDate" [label]="'work.to' | t" />
        <enzo-text-input formControlName="reason" [label]="'work.reason' | t" />
        <div class="md:col-span-3"><button enzoButton type="submit" [loading]="saving()">{{ 'work.submitRequest' | t }}</button></div>
      </form>
    }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="leave" [title]="'work.emptyRequests' | t" [description]="'work.emptyRequestsBody' | t" /></div>
    } @else {
      <div class="grid gap-3">
        @for (row of rows(); track row.id) {
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium">{{ employeeName(row.employeeId) }} · {{ typeName(row.leaveTypeId) }}</p>
              <enzo-badge>{{ 'work.leaveStatus.' + row.status | t }}</enzo-badge>
            </div>
            <p class="mt-1 text-sm text-text-secondary">{{ row.startDate }} – {{ row.endDate }} · {{ row.totalDays }} {{ 'work.days' | t }} · {{ row.portion }}</p>
            <p class="mt-1 text-sm">{{ row.reason }}</p>
            @if (row.rejectionReason) { <p class="mt-1 text-sm text-danger">{{ row.rejectionReason }}</p> }
            @if (row.status === 'PENDING' && access.can('leave-requests.approve')) {
              <div class="mt-3 flex flex-wrap gap-2">
                <button enzoButton size="sm" type="button" (click)="decide(row, 'APPROVED')">{{ 'work.approve' | t }}</button>
                <button enzoButton size="sm" variant="danger" type="button" (click)="decide(row, 'REJECTED')">{{ 'work.reject' | t }}</button>
              </div>
            }
            @if ((row.status === 'PENDING' || row.status === 'APPROVED') && access.can('leave-requests.create')) {
              <button enzoButton class="mt-3" size="sm" variant="ghost" type="button" (click)="cancel(row)">{{ 'work.cancelRequest' | t }}</button>
            }
          </article>
        }
      </div>
    }
  `,
})
export class LeaveRequestsPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<LeaveRequest[]>([]);
  protected readonly types = signal<LeaveType[]>([]);
  protected readonly employees = signal<SelectOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    employeeId: '',
    leaveTypeId: ['', Validators.required],
    portion: 'FULL',
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    reason: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.employees.set(result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))),
    });
    this.api.leaveTypes().subscribe({ next: (result) => this.types.set(result.data) });
    this.load();
  }

  protected employeeOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('work.self') }, ...this.employees()];
  }

  protected typeOptions(): SelectOption[] {
    return this.types().filter((type) => type.status === 'ACTIVE').map((type) => ({ value: type.id, label: localizedLabel(type.name, this.i18n.language()) }));
  }

  protected portionOptions(): SelectOption[] {
    return [
      { value: 'FULL', label: this.i18n.translate('work.fullDay') },
      { value: 'HALF', label: this.i18n.translate('work.halfDayLeave') },
    ];
  }

  protected employeeName(id: string): string {
    return this.employees().find((employee) => employee.value === id)?.label ?? id;
  }

  protected typeName(id: string): string {
    const type = this.types().find((item) => item.id === id);
    return type ? localizedLabel(type.name, this.i18n.language()) : id;
  }

  protected load(): void {
    this.loading.set(true);
    this.api.leaveRequests().subscribe({
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

  protected create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api.createLeave({ ...value, portion: value.portion, override: false }).subscribe({
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

  protected decide(row: LeaveRequest, status: 'APPROVED' | 'REJECTED'): void {
    const rejectionReason = status === 'REJECTED' ? this.i18n.translate('work.rejectedReason') : '';
    this.api.decideLeave(row.id, status, rejectionReason, false).subscribe({
      next: () => {
        this.toast.success(this.i18n.translate('work.saved'));
        this.load();
      },
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected cancel(row: LeaveRequest): void {
    this.api.cancelLeave(row.id).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
