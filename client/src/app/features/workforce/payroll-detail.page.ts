import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { PayrollRecord } from './workforce.models';

@Component({
  selector: 'app-payroll-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Badge, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'work.review' | t" [description]="'work.reviewDescription' | t" [breadcrumbs]="[{ labelKey: 'work.payroll', link: '/payroll' }]">
      @if (row(); as item) {
        <a enzoButton variant="secondary" [routerLink]="['/payroll', item.id, 'payslip']">{{ 'work.payslip' | t }}</a>
      }
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (row(); as item) {
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <enzo-badge>{{ 'work.payrollStatus.' + item.status | t }}</enzo-badge>
        <span class="text-sm text-text-secondary">{{ item.employeeName }} · {{ item.periodStart }} – {{ item.periodEnd }}</span>
      </div>
      <dl class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        @for (line of lines(item); track line.label) {
          <div>
            <dt class="text-xs text-text-secondary">{{ line.label }}</dt>
            <dd class="text-lg">{{ line.value }}</dd>
          </div>
        }
      </dl>
      <div class="mb-4 flex flex-wrap gap-2">
        @if (item.status === 'DRAFT' && access.can('payroll.review')) {
          <button enzoButton type="button" (click)="submit(item)">{{ 'work.submitReview' | t }}</button>
        }
        @if (item.status === 'REVIEW' && access.can('payroll.approve')) {
          <button enzoButton type="button" (click)="approve(item)">{{ 'work.approve' | t }}</button>
        }
        @if (item.status === 'PAID' && access.can('payroll.adjust')) {
          <button enzoButton type="button" variant="secondary" (click)="correct(item)">{{ 'work.correction' | t }}</button>
        }
      </div>
      @if ((item.status === 'DRAFT' || item.status === 'REVIEW') && access.can('payroll.adjust')) {
        <form class="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-4" [formGroup]="form" (ngSubmit)="adjust(item)">
          <enzo-select formControlName="kind" [label]="'work.kind' | t" [options]="kindOptions()" />
          <enzo-text-input formControlName="label" [label]="'work.label' | t" />
          <enzo-text-input formControlName="amount" type="number" [label]="'work.amount' | t" />
          <enzo-text-input formControlName="reason" [label]="'work.reason' | t" />
          <div class="md:col-span-4"><button enzoButton type="submit" [loading]="saving()">{{ 'work.adjust' | t }}</button></div>
        </form>
      }
      @if (item.status === 'APPROVED' && access.can('payroll.pay')) {
        <form class="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="payForm" (ngSubmit)="pay(item)">
          <enzo-select formControlName="method" [label]="'work.method' | t" [options]="methodOptions()" />
          <enzo-text-input formControlName="reference" [label]="'work.reference' | t" />
          <div class="flex items-end"><button enzoButton type="submit">{{ 'work.markPaid' | t }}</button></div>
        </form>
      }
    }
  `,
})
export class PayrollDetailPage {
  private readonly api = inject(WorkforceApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly row = signal<PayrollRecord | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    kind: 'BONUS',
    label: ['', Validators.required],
    amount: ['1', Validators.required],
    reason: ['', [Validators.required, Validators.minLength(2)]],
  });
  protected readonly payForm = this.formBuilder.nonNullable.group({
    method: 'CASH',
    reference: '',
  });

  constructor() {
    this.load();
  }

  protected lines(item: PayrollRecord): Array<{ label: string; value: number }> {
    return [
      { label: this.i18n.translate('work.basic'), value: item.basicSalary },
      { label: this.i18n.translate('work.commission'), value: item.commission },
      { label: this.i18n.translate('work.tips'), value: item.tips },
      { label: this.i18n.translate('work.allowances'), value: item.allowances },
      { label: this.i18n.translate('work.overtime'), value: item.overtime },
      { label: this.i18n.translate('work.bonus'), value: item.bonuses },
      { label: this.i18n.translate('work.attendanceDeductions'), value: item.attendanceDeductions },
      { label: this.i18n.translate('work.otherDeductions'), value: item.otherDeductions },
      { label: this.i18n.translate('work.net'), value: item.netSalary },
    ];
  }

  protected kindOptions(): SelectOption[] {
    return [
      { value: 'BONUS', label: this.i18n.translate('work.bonus') },
      { value: 'DEDUCTION', label: this.i18n.translate('work.deduction') },
    ];
  }

  protected methodOptions(): SelectOption[] {
    return ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'].map((value) => ({ value, label: this.i18n.translate(`finance.methods.${value}`) }));
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.api.payrollOne(id).subscribe({
      next: (result) => {
        this.row.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected adjust(item: PayrollRecord): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api.adjustPayroll(item.id, {
      kind: value.kind === 'DEDUCTION' ? 'DEDUCTION' : 'BONUS',
      label: value.label,
      amount: Number(value.amount),
      reason: value.reason,
    }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.row.set(result.data);
        this.toast.success(this.i18n.translate('work.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected submit(item: PayrollRecord): void {
    this.api.submitPayroll(item.id).subscribe({
      next: (result) => this.row.set(result.data),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected approve(item: PayrollRecord): void {
    this.api.approvePayroll(item.id).subscribe({
      next: (result) => this.row.set(result.data),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected pay(item: PayrollRecord): void {
    const value = this.payForm.getRawValue();
    this.api.payPayroll(item.id, value.method, value.reference).subscribe({
      next: (result) => this.row.set(result.data),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected correct(item: PayrollRecord): void {
    this.api.correctPayroll(item.id).subscribe({
      next: (result) => void this.router.navigate(['/payroll', result.data.id]),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
