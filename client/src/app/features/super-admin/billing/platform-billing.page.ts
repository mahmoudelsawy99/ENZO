import { Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { ApiClient } from '../../../core/api/api-client';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PageHeader } from '../../../shared/ui/page-header';
import { ToastService } from '../../../shared/ui/toast.service';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  maximumBranches: number;
  status: string;
  system: boolean;
}

interface SubscriptionRow {
  id: string;
  tenantName: string;
  planName: string;
  status: string;
  billingInterval: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  totalAmount: number;
  currency: string;
  status: string;
}

@Component({
  selector: 'app-platform-billing',
  imports: [TranslatePipe, PageHeader, Button, Card, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'platform.billing' | t" [description]="'platform.billingDescription' | t" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <div class="grid gap-4">
        <enzo-card [title]="'billing.plans' | t">
          <ul class="grid gap-2 text-sm">
            @for (plan of plans(); track plan.id) {
              <li class="flex flex-wrap justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>{{ plan.name }} · {{ plan.code }}</span>
                <span>{{ plan.monthlyPrice }} / {{ plan.yearlyPrice }} {{ plan.currency }} · {{ plan.maximumBranches }} · {{ plan.status }}</span>
              </li>
            }
          </ul>
        </enzo-card>
        <enzo-card [title]="'billing.subscriptions' | t">
          <form class="mb-3 grid gap-2 md:grid-cols-4" (submit)="assign($event)">
            <input class="enzo-control" name="tenantId" [placeholder]="'billing.tenantId' | t" required />
            <select class="enzo-control" name="planId" required>
              @for (plan of plans(); track plan.id) {
                @if (!plan.system) {
                  <option [value]="plan.id">{{ plan.name }}</option>
                }
              }
            </select>
            <select class="enzo-control" name="billingInterval">
              <option value="MONTHLY">{{ 'billing.monthly' | t }}</option>
              <option value="YEARLY">{{ 'billing.yearly' | t }}</option>
            </select>
            <button enzoButton type="submit">{{ 'billing.assign' | t }}</button>
          </form>
          <ul class="grid gap-2 text-sm">
            @for (row of subscriptions(); track row.id) {
              <li class="rounded-md border border-border px-3 py-2">{{ row.tenantName }} · {{ row.planName }} · {{ row.status }} · {{ row.billingInterval }}</li>
            }
          </ul>
        </enzo-card>
        <enzo-card [title]="'billing.invoices' | t">
          <form class="mb-3 grid gap-2 md:grid-cols-4" (submit)="invoice($event)">
            <input class="enzo-control" name="tenantId" [placeholder]="'billing.tenantId' | t" required />
            <input class="enzo-control" name="subscriptionId" [placeholder]="'billing.subscriptionId' | t" required />
            <input class="enzo-control" name="amount" type="number" min="0" step="0.01" [placeholder]="'billing.amount' | t" required />
            <button enzoButton type="submit">{{ 'billing.createInvoice' | t }}</button>
          </form>
          <ul class="grid gap-2 text-sm">
            @for (row of invoices(); track row.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>{{ row.invoiceNumber }} · {{ row.totalAmount }} {{ row.currency }} · {{ row.status }}</span>
                @if (row.status === 'PENDING') {
                  <button enzoButton size="sm" type="button" (click)="pay(row)">{{ 'billing.recordPayment' | t }}</button>
                }
              </li>
            }
          </ul>
        </enzo-card>
      </div>
    }
  `,
})
export class PlatformBillingPage {
  private readonly api = inject(ApiClient);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly subscriptions = signal<SubscriptionRow[]>([]);
  protected readonly invoices = signal<InvoiceRow[]>([]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin([
      this.api.get<{ data: PlanRow[] }>('/v1/platform/billing/plans'),
      this.api.get<{ data: SubscriptionRow[] }>('/v1/platform/billing/subscriptions'),
      this.api.get<{ data: InvoiceRow[] }>('/v1/platform/billing/invoices'),
    ]).subscribe({
      next: ([plans, subscriptions, invoices]) => {
        this.plans.set(plans.data);
        this.subscriptions.set(subscriptions.data);
        this.invoices.set(invoices.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected assign(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const body = Object.fromEntries(new FormData(form).entries());
    this.api.post('/v1/platform/billing/subscriptions', body).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('billing.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected invoice(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form).entries());
    this.api.post('/v1/platform/billing/invoices', {
      tenantId: data['tenantId'],
      subscriptionId: data['subscriptionId'],
      amount: Number(data['amount']),
      taxAmount: 0,
      currency: 'EGP',
      dueDate: new Date().toISOString().slice(0, 10),
    }).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('billing.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected pay(row: InvoiceRow): void {
    this.api.post(`/v1/platform/billing/invoices/${row.id}/payments`, {
      amount: row.totalAmount,
      status: 'PAID',
      reference: 'manual',
      note: '',
    }).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('billing.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
