import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { LeaveType } from './workforce.models';

@Component({
  selector: 'app-leave-types-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.leaveTypes' | t" [description]="'work.leaveTypesDescription' | t" [breadcrumbs]="[{ labelKey: 'nav.leaves', link: '/leaves' }]">
      <a enzoButton variant="secondary" routerLink="/leaves">{{ 'work.leaveRequests' | t }}</a>
    </enzo-page-header>
    @if (access.can('leave-types.manage')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="form" (ngSubmit)="save()">
        <enzo-text-input formControlName="nameEn" [label]="'work.nameEn' | t" />
        <enzo-text-input formControlName="nameAr" [label]="'work.nameAr' | t" />
        <enzo-text-input formControlName="annualAllowance" type="number" [label]="'work.allowance' | t" />
        <enzo-select formControlName="paid" [label]="'work.paid' | t" [options]="yesNo()" />
        <enzo-select formControlName="requiresApproval" [label]="'work.approval' | t" [options]="yesNo()" />
        <enzo-select formControlName="allowPartialDay" [label]="'work.partial' | t" [options]="yesNo()" />
        <enzo-select formControlName="carryForward" [label]="'work.carry' | t" [options]="carryOptions()" />
        <enzo-text-input formControlName="carryForwardLimit" type="number" [label]="'work.carryLimit' | t" />
        <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
        <div class="md:col-span-3"><button enzoButton type="submit" [loading]="saving()">{{ (editing() ? 'common.save' : 'work.addType') | t }}</button></div>
      </form>
    }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="leave" [title]="'work.emptyTypes' | t" [description]="'work.emptyTypesBody' | t" /></div>
    } @else {
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'work.leaveTypes' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.nameEn' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.allowance' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.paid' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'branches.status' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ label(row) }}</td>
                <td class="px-4 py-3">{{ row.annualAllowance }}</td>
                <td class="px-4 py-3">{{ row.paid ? ('work.yes' | t) : ('work.no' | t) }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="row.status === 'ACTIVE' ? 'success' : 'neutral'">{{ 'status.' + row.status | t }}</enzo-badge></td>
                <td class="px-4 py-3">@if (access.can('leave-types.manage')) { <button enzoButton size="sm" variant="ghost" type="button" (click)="edit(row)">{{ 'work.edit' | t }}</button> }</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LeaveTypesPage {
  private readonly api = inject(WorkforceApi);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<LeaveType[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly editing = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', Validators.required],
    nameAr: '',
    annualAllowance: ['0', Validators.required],
    paid: 'true',
    requiresApproval: 'true',
    allowPartialDay: 'true',
    carryForward: 'NONE',
    carryForwardLimit: '0',
    status: 'ACTIVE',
  });

  constructor() {
    this.load();
  }

  protected yesNo(): SelectOption[] {
    return [
      { value: 'true', label: this.i18n.translate('work.yes') },
      { value: 'false', label: this.i18n.translate('work.no') },
    ];
  }

  protected carryOptions(): SelectOption[] {
    return ['NONE', 'LIMITED', 'UNLIMITED'].map((value) => ({ value, label: this.i18n.translate(`work.carryMode.${value}`) }));
  }

  protected statusOptions(): SelectOption[] {
    return [
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected label(row: LeaveType): string {
    return localizedLabel(row.name, this.i18n.language());
  }

  protected edit(row: LeaveType): void {
    this.editing.set(row.id);
    this.form.patchValue({
      nameEn: row.name.en,
      nameAr: row.name.ar,
      annualAllowance: String(row.annualAllowance),
      paid: String(row.paid),
      requiresApproval: String(row.requiresApproval),
      allowPartialDay: String(row.allowPartialDay),
      carryForward: row.carryForward,
      carryForwardLimit: String(row.carryForwardLimit),
      status: row.status,
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.api.leaveTypes().subscribe({
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
    const value = this.form.getRawValue();
    const carry = value.carryForward === 'LIMITED' || value.carryForward === 'UNLIMITED' ? value.carryForward : 'NONE';
    this.saving.set(true);
    this.api.saveLeaveType({
      name: { en: value.nameEn, ar: value.nameAr },
      paid: value.paid === 'true',
      annualAllowance: Number(value.annualAllowance),
      requiresApproval: value.requiresApproval === 'true',
      allowPartialDay: value.allowPartialDay === 'true',
      carryForward: carry,
      carryForwardLimit: Number(value.carryForwardLimit),
      status: value.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }, this.editing() || undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set('');
        this.form.reset({ annualAllowance: '0', paid: 'true', requiresApproval: 'true', allowPartialDay: 'true', carryForward: 'NONE', carryForwardLimit: '0', status: 'ACTIVE' });
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
