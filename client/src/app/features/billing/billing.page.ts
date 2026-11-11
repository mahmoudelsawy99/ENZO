import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ApiError } from '../../core/api/api-error';
import { ApiClient } from '../../core/api/api-client';
import { EntitlementState } from '../../core/access/entitlement.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  currency: string;
  status: string;
  dueDate: string;
}

@Component({
  selector: 'app-billing-page',
  imports: [TranslatePipe, PageHeader, Button, Card, KpiCard, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'billing.title' | t" [description]="'billing.description' | t" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      @if (entitlements.current(); as current) {
        <section class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <enzo-kpi-card [label]="'billing.plan' | t" [value]="current.planCode || ('billing.unassigned' | t)" />
          <enzo-kpi-card [label]="'billing.branches' | t" [value]="current.usage.branches + ' / ' + current.limits.branches" />
          <enzo-kpi-card [label]="'billing.users' | t" [value]="current.usage.users + ' / ' + current.limits.users" />
          <enzo-kpi-card [label]="'billing.employees' | t" [value]="current.usage.employees + ' / ' + current.limits.employees" />
        </section>
        <p class="mb-4 text-sm text-text-secondary">{{ 'billing.separate' | t }}</p>
      }
      <enzo-card [title]="'billing.invoices' | t">
        @if (invoices().length === 0) {
          <p class="text-sm text-text-secondary">{{ 'billing.noInvoices' | t }}</p>
        } @else {
          <ul class="grid gap-2 text-sm">
            @for (row of invoices(); track row.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>{{ row.invoiceNumber }} · {{ row.totalAmount }} {{ row.currency }} · {{ row.status }} · {{ row.dueDate }}</span>
                <button enzoButton size="sm" variant="secondary" type="button" (click)="download(row)">PDF</button>
              </li>
            }
          </ul>
        }
      </enzo-card>
    }
  `,
})
export class BillingPage {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(LanguageService);
  protected readonly entitlements = inject(EntitlementState);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly invoices = signal<InvoiceRow[]>([]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    void this.entitlements.load();
    this.api.get<{ data: InvoiceRow[] }>('/v1/billing/invoices').subscribe({
      next: (result) => {
        this.invoices.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected download(row: InvoiceRow): void {
    this.http.get(`${environment.apiUrl}/v1/billing/invoices/${row.id}/download?format=pdf`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${row.invoiceNumber}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set(this.i18n.translate('common.errorBody')),
    });
  }
}
