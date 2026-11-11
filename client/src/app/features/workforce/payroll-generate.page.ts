import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { PayrollRecord } from './workforce.models';

@Component({
  selector: 'app-payroll-generate-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, DateField, EmptyState],
  template: `
    <enzo-page-header [title]="'work.generate' | t" [description]="'work.generateDescription' | t" [breadcrumbs]="[{ labelKey: 'work.payroll', link: '/payroll' }]" />
    @if (!access.can('payroll.generate')) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="shield" [title]="'work.noAccess' | t" [description]="'work.noAccessBody' | t" /></div>
    } @else {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="form" (ngSubmit)="generate()">
        <enzo-date-field formControlName="periodStart" [label]="'work.from' | t" />
        <enzo-date-field formControlName="periodEnd" [label]="'work.to' | t" />
        <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'work.generate' | t }}</button></div>
      </form>
      @if (rows().length > 0) {
        <div class="grid gap-3">
          @for (row of rows(); track row.id) {
            <a class="rounded-lg border border-border bg-surface px-4 py-3" [routerLink]="['/payroll', row.id]">
              <p class="font-medium">{{ row.employeeName }}</p>
              <p class="text-sm text-text-secondary">{{ 'work.net' | t }} {{ row.netSalary }}</p>
            </a>
          }
        </div>
      }
    }
  `,
})
export class PayrollGeneratePage {
  private readonly api = inject(WorkforceApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<PayrollRecord[]>([]);
  protected readonly saving = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    periodStart: [monthStart(), Validators.required],
    periodEnd: [monthEnd(), Validators.required],
  });

  protected generate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api.generatePayroll({ ...value, branchId, employeeIds: [] }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.rows.set(result.data);
        this.toast.success(this.i18n.translate('work.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}
