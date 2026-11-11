import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { EnzoDatePipe } from '../../core/i18n/locale.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DialogService } from '../../shared/ui/dialog';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import type { ActivityEntry, BranchRecord, EmployeeRecord } from '../organization/organization.models';

@Component({
  selector: 'app-employee-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, EnzoDatePipe, PageHeader, Badge, Button, Card, LoadingState, ErrorState, TextInput, Select],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else if (employee(); as item) {
      <enzo-page-header [title]="item.fullName" [description]="item.employeeNumber" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="tone(item.status)">{{ 'status.' + item.status | t }}</enzo-badge>
        <a enzoButton variant="secondary" [routerLink]="['/employees', item.id, 'edit']">{{ 'employees.edit' | t }}</a>
      </enzo-page-header>
      <div class="mb-4 flex flex-wrap gap-2" role="tablist">
        @for (tab of tabs; track tab) {
          <button enzoButton type="button" [variant]="active() === tab ? 'primary' : 'secondary'" (click)="active.set(tab)">{{ 'employees.' + tab | t }}</button>
        }
      </div>
      @if (active() === 'personal') {
        <enzo-card [title]="'employees.personal' | t">
          <dl class="grid gap-3 text-sm md:grid-cols-2">
            <div><dt class="text-text-secondary">{{ 'employees.email' | t }}</dt><dd>{{ item.email || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.phone' | t }}</dt><dd>{{ item.phone || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.nationalId' | t }}</dt><dd>{{ item.nationalIdMasked || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.birthDate' | t }}</dt><dd>{{ item.dateOfBirth || '—' }}</dd></div>
            <div class="md:col-span-2"><dt class="text-text-secondary">{{ 'employees.address' | t }}</dt><dd>{{ item.address || '—' }}</dd></div>
          </dl>
        </enzo-card>
      }
      @if (active() === 'employment') {
        <enzo-card [title]="'employees.employment' | t">
          <dl class="grid gap-3 text-sm md:grid-cols-2">
            <div><dt class="text-text-secondary">{{ 'employees.jobTitle' | t }}</dt><dd>{{ item.jobTitleName }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.employmentType' | t }}</dt><dd>{{ item.employmentTypeName }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.joiningDate' | t }}</dt><dd>{{ item.joiningDate }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.login' | t }}</dt><dd>{{ item.user?.fullName || ('employees.noLogin' | t) }}</dd></div>
            <div class="md:col-span-2"><dt class="text-text-secondary">{{ 'employees.notes' | t }}</dt><dd>{{ item.notes || '—' }}</dd></div>
          </dl>
          <div class="mt-4 flex flex-wrap gap-2">
            @if (item.status !== 'ACTIVE') {
              <button enzoButton type="button" variant="secondary" (click)="setStatus('ACTIVE')">{{ 'employees.activate' | t }}</button>
            }
            @if (item.status === 'ACTIVE') {
              <button enzoButton type="button" variant="secondary" (click)="setStatus('INACTIVE')">{{ 'employees.deactivate' | t }}</button>
              <button enzoButton type="button" variant="danger" (click)="setStatus('TERMINATED')">{{ 'employees.terminate' | t }}</button>
            }
          </div>
        </enzo-card>
      }
      @if (active() === 'branches') {
        <enzo-card [title]="'employees.branches' | t" [description]="'employees.branchesHint' | t">
          <ul class="grid gap-2 text-sm">
            @for (branch of item.branches; track branch.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                <span>{{ branch.branchName }} <span class="text-text-secondary">{{ branch.branchCode }}</span></span>
                <span class="flex flex-wrap items-center gap-2">
                  @if (branch.isPrimary) { <enzo-badge tone="info">{{ 'employees.primary' | t }}</enzo-badge> }
                  <enzo-badge [tone]="tone(branch.status)">{{ 'status.' + branch.status | t }}</enzo-badge>
                  @if (branch.status === 'ACTIVE' && !branch.isPrimary) {
                    <button enzoButton size="sm" variant="ghost" type="button" (click)="makePrimary(branch.branchId)">{{ 'employees.makePrimary' | t }}</button>
                  }
                  @if (branch.status === 'ACTIVE') {
                    <button enzoButton size="sm" variant="danger" type="button" (click)="remove(branch.branchId)">{{ 'employees.removeBranch' | t }}</button>
                  }
                </span>
              </li>
            }
          </ul>
          <form class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" [formGroup]="assignForm" (ngSubmit)="assign()">
            <enzo-select formControlName="branchId" [label]="'employees.assignBranch' | t" [options]="branchOptions()" />
            <div class="flex items-end">
              <button enzoButton type="submit" variant="secondary">{{ 'employees.assign' | t }}</button>
            </div>
          </form>
        </enzo-card>
      }
      @if (active() === 'salary') {
        <enzo-card [title]="'employees.salary' | t" [description]="'employees.formula' | t">
          <dl class="grid gap-3 text-sm md:grid-cols-2">
            <div><dt class="text-text-secondary">{{ 'employees.period' | t }}</dt><dd>{{ 'employees.period_' + item.salary.period | t }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.basic' | t }}</dt><dd>{{ item.salary.basicSalary }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.allowances' | t }}</dt><dd>{{ item.salary.allowances }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.tips' | t }}</dt><dd>{{ item.salary.tips }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'employees.deductions' | t }}</dt><dd>{{ item.salary.deductions }}</dd></div>
          </dl>
          <h3 class="mt-6 text-sm font-semibold">{{ 'employees.commissionOverrides' | t }}</h3>
          <ul class="mt-2 grid gap-2 text-sm">
            @for (rule of item.commissionRules; track rule.id) {
              <li>{{ rule.serviceCode }} · {{ rule.kind === 'PERCENTAGE' ? rule.value + '%' : rule.value }}</li>
            } @empty {
              <li class="text-text-secondary">{{ 'employees.noOverrides' | t }}</li>
            }
          </ul>
          <form class="mt-4 grid gap-3 md:grid-cols-4" [formGroup]="commissionForm" (ngSubmit)="saveCommission()">
            <enzo-text-input formControlName="serviceCode" [label]="'workforce.serviceCode' | t" />
            <enzo-select formControlName="kind" [label]="'workforce.kind' | t" [options]="kindOptions()" />
            <enzo-text-input formControlName="value" type="number" [label]="'workforce.value' | t" />
            <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.save' | t }}</button></div>
          </form>
        </enzo-card>
      }
      @if (active() === 'activity') {
        <enzo-card [title]="'employees.activity' | t">
          <ul class="grid gap-3 text-sm">
            @for (entry of activity(); track entry.id) {
              <li class="border-b border-border pb-3">
                <p>{{ entry.summary }}</p>
                <p class="text-text-secondary">{{ entry.createdAt | enzoDate }}</p>
              </li>
            } @empty {
              <li class="text-text-secondary">{{ 'employees.noActivity' | t }}</li>
            }
          </ul>
        </enzo-card>
      }
    }
  `,
})
export class EmployeeDetailPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly tabs = ['personal', 'employment', 'branches', 'salary', 'activity'] as const;
  readonly active = signal<(typeof this.tabs)[number]>('personal');
  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.employees', link: '/employees' },
    { labelKey: 'employees.view' },
  ];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly employee = signal<EmployeeRecord | null>(null);
  readonly activity = signal<ActivityEntry[]>([]);
  readonly branches = signal<BranchRecord[]>([]);
  readonly assignForm = this.formBuilder.nonNullable.group({ branchId: '' });
  readonly commissionForm = this.formBuilder.nonNullable.group({
    serviceCode: '',
    kind: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    value: 0,
  });

  constructor() {
    this.load();
    this.api.branches({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.branches.set(result.data),
      error: () => this.branches.set([]),
    });
  }

  protected tone(status: string): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'INACTIVE' || status === 'REMOVED') return 'warning';
    return 'danger';
  }

  protected branchOptions(): SelectOption[] {
    const assigned = new Set((this.employee()?.branches ?? []).filter((branch) => branch.status === 'ACTIVE').map((branch) => branch.branchId));
    return this.branches()
      .filter((branch) => !assigned.has(branch.id))
      .map((branch) => ({ value: branch.id, label: branch.name }));
  }

  protected kindOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'PERCENTAGE', label: this.i18n.translate('workforce.percentage') },
      { value: 'FIXED', label: this.i18n.translate('workforce.fixed') },
    ];
  }

  protected async setStatus(status: EmployeeRecord['status']): Promise<void> {
    const current = this.employee();
    if (!current) return;
    const confirmed = await this.dialogs.confirm({
      titleKey: 'employees.statusTitle',
      messageKey: 'employees.statusBody',
      danger: status !== 'ACTIVE',
    });
    if (!confirmed) return;
    this.api.employeeStatus(current.id, status).subscribe({
      next: (response) => {
        this.employee.set(response.data);
        this.toasts.success(this.i18n.translate('employees.saved'));
      },
      error: (error: unknown) => this.warn(error),
    });
  }

  protected assign(): void {
    const current = this.employee();
    const branchId = this.assignForm.controls.branchId.value;
    if (!current || !branchId) return;
    const primary = !current.branches.some((branch) => branch.status === 'ACTIVE');
    this.api.assignBranch(current.id, branchId, primary).subscribe({
      next: (response) => {
        this.employee.set(response.data);
        this.assignForm.reset({ branchId: '' });
        this.toasts.success(this.i18n.translate('employees.saved'));
      },
      error: (error: unknown) => this.warn(error),
    });
  }

  protected makePrimary(branchId: string): void {
    const current = this.employee();
    if (!current) return;
    this.api.primaryBranch(current.id, branchId).subscribe({
      next: (response) => this.employee.set(response.data),
      error: (error: unknown) => this.warn(error),
    });
  }

  protected async remove(branchId: string): Promise<void> {
    const current = this.employee();
    if (!current) return;
    const confirmed = await this.dialogs.confirm({
      titleKey: 'employees.removeTitle',
      messageKey: 'employees.removeBody',
      danger: true,
    });
    if (!confirmed) return;
    this.api.removeBranch(current.id, branchId).subscribe({
      next: (response) => this.employee.set(response.data),
      error: (error: unknown) => this.warn(error),
    });
  }

  protected saveCommission(): void {
    const current = this.employee();
    const value = this.commissionForm.getRawValue();
    if (!current || !value.serviceCode.trim()) return;
    this.api.saveEmployeeCommission(current.id, { serviceCode: value.serviceCode.trim(), kind: value.kind, value: Number(value.value) || 0 }).subscribe({
      next: (response) => {
        this.employee.update((employee) => (employee ? { ...employee, commissionRules: response.data } : employee));
        this.commissionForm.reset({ serviceCode: '', kind: 'PERCENTAGE', value: 0 });
        this.toasts.success(this.i18n.translate('employees.saved'));
      },
      error: (error: unknown) => this.warn(error),
    });
  }

  private load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.employee(id).subscribe({
      next: (response) => {
        this.employee.set(response.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
    this.api.activity(id).subscribe({
      next: (response) => this.activity.set(response.data),
      error: () => this.activity.set([]),
    });
  }

  private warn(error: unknown): void {
    this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
  }
}
