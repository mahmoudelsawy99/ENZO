import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { OrganizationApi } from '../organization/organization.api';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { LeaveBalance, LeaveType } from './workforce.models';

@Component({
  selector: 'app-leave-balances-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Button, Select, TextInput, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.balances' | t" [description]="'work.balancesDescription' | t" [breadcrumbs]="[{ labelKey: 'nav.leaves', link: '/leaves' }]" />
    <form class="mb-4 flex flex-wrap items-end gap-3" [formGroup]="filter" (ngSubmit)="load()">
      <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
      <enzo-text-input formControlName="year" type="number" [label]="'work.year' | t" />
      <button enzoButton type="submit">{{ 'common.search' | t }}</button>
    </form>
    @if (access.can('leave-balances.manage')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-4" [formGroup]="adjust" (ngSubmit)="save()">
        <enzo-select formControlName="leaveTypeId" [label]="'work.leaveType' | t" [options]="typeOptions()" />
        <enzo-text-input formControlName="days" type="number" [label]="'work.days' | t" />
        <enzo-text-input formControlName="reason" [label]="'work.reason' | t" />
        <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'work.adjust' | t }}</button></div>
      </form>
    }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="leave" [title]="'work.emptyBalances' | t" [description]="'work.emptyBalancesBody' | t" /></div>
    } @else {
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'work.balances' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.leaveType' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.entitled' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.used' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.pending' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.remaining' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ typeName(row.leaveTypeId) }}</td>
                <td class="px-4 py-3">{{ row.entitled }}</td>
                <td class="px-4 py-3">{{ row.used }}</td>
                <td class="px-4 py-3">{{ row.pending }}</td>
                <td class="px-4 py-3">{{ row.remaining }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LeaveBalancesPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<LeaveBalance[]>([]);
  protected readonly types = signal<LeaveType[]>([]);
  protected readonly employees = signal<SelectOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly filter = this.formBuilder.nonNullable.group({
    employeeId: ['', Validators.required],
    year: [String(new Date().getFullYear()), Validators.required],
  });
  protected readonly adjust = this.formBuilder.nonNullable.group({
    leaveTypeId: ['', Validators.required],
    days: ['1', Validators.required],
    reason: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.employees.set(result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))),
    });
    this.api.leaveTypes().subscribe({ next: (result) => this.types.set(result.data) });
  }

  protected employeeOptions(): SelectOption[] {
    return this.employees();
  }

  protected typeOptions(): SelectOption[] {
    return this.types().map((type) => ({ value: type.id, label: localizedLabel(type.name, this.i18n.language()) }));
  }

  protected typeName(id: string): string {
    const type = this.types().find((item) => item.id === id);
    return type ? localizedLabel(type.name, this.i18n.language()) : id;
  }

  protected load(): void {
    if (this.filter.invalid) {
      this.filter.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const value = this.filter.getRawValue();
    this.api.balances(value.employeeId, Number(value.year)).subscribe({
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

  protected save(): void {
    if (this.filter.invalid || this.adjust.invalid) {
      this.filter.markAllAsTouched();
      this.adjust.markAllAsTouched();
      return;
    }
    const filter = this.filter.getRawValue();
    const value = this.adjust.getRawValue();
    this.saving.set(true);
    this.api.adjustBalance({
      employeeId: filter.employeeId,
      leaveTypeId: value.leaveTypeId,
      year: Number(filter.year),
      days: Number(value.days),
      reason: value.reason,
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
}
