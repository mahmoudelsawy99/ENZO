import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ReceiptView } from '../pos/receipt-view';
import { FinanceApi } from '../pos/finance.api';
import type { SaleRecord } from '../pos/finance.models';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';

const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];

@Component({
  selector: 'app-transaction-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, TextInput, Select, LoadingState, ErrorState, ReceiptView],
  template: `
    <enzo-page-header [title]="'finance.receipt' | t" [description]="'finance.transactionsDescription' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton variant="secondary" routerLink="/transactions">{{ 'finance.transactionsTitle' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error() && !sale()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (sale(); as current) {
      <div class="grid gap-4 xl:grid-cols-2">
        <app-receipt-view [sale]="current" />
        @if (access.can('refunds.create') && current.payments.length > 0 && current.status !== 'REFUNDED') {
          <enzo-card [title]="'finance.requestRefund' | t">
            <p class="mb-3 text-sm text-text-secondary">{{ 'finance.refundHint' | t }}</p>
            <form class="grid gap-3" [formGroup]="form" (ngSubmit)="request()">
              <enzo-select formControlName="paymentId" [label]="'finance.payments' | t" [options]="paymentOptions()" />
              <enzo-text-input formControlName="amount" type="number" [label]="'finance.amount' | t" />
              <enzo-select formControlName="method" [label]="'finance.method' | t" [options]="methodOptions()" />
              <enzo-text-input formControlName="referenceNumber" [label]="'finance.reference' | t" />
              <enzo-text-input formControlName="reason" [label]="'finance.reason' | t" />
              @if (hasProducts()) {
                <label class="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" formControlName="restock" />
                  {{ 'stock.restock' | t }}
                </label>
              }
              @if (error()) { <p class="text-sm text-danger" role="alert">{{ error() }}</p> }
              <button enzoButton type="submit" [loading]="saving()">{{ 'finance.requestRefund' | t }}</button>
            </form>
          </enzo-card>
        }
      </div>
    }
  `,
})
export class TransactionDetailPage {
  private readonly api = inject(FinanceApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.transactions', link: '/transactions' }, { labelKey: 'finance.receipt' }];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly sale = signal<SaleRecord | null>(null);
  readonly form = this.formBuilder.nonNullable.group({ paymentId: '', amount: '', method: 'CASH', referenceNumber: '', reason: '', restock: false });
  private readonly saleId = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    this.load();
  }

  protected methodOptions(): SelectOption[] {
    return METHODS.map((method) => ({ value: method, label: this.i18n.translate(`finance.methods.${method}`) }));
  }

  protected hasProducts(): boolean {
    return (this.sale()?.items ?? []).some((item) => item.itemType === 'PRODUCT');
  }

  protected paymentOptions(): SelectOption[] {
    return (this.sale()?.payments ?? []).map((payment) => ({
      value: payment.id,
      label: `${this.i18n.translate(`finance.methods.${payment.method}`)} · ${this.i18n.formatNumber(payment.amount - payment.refundedAmount)}`,
    }));
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.transaction(this.saleId).subscribe({
      next: (result) => {
        this.sale.set(result.data);
        const first = result.data.payments[0];
        if (first) {
          this.form.controls.paymentId.setValue(first.id);
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected request(): void {
    const current = this.sale();
    const raw = this.form.getRawValue();
    if (!current || !raw.paymentId) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.requestRefund({
      transactionId: current.id,
      paymentId: raw.paymentId,
      amount: Number(raw.amount),
      reason: raw.reason,
      method: raw.method,
      referenceNumber: raw.referenceNumber,
      restock: raw.restock,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('finance.refundRequested'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
