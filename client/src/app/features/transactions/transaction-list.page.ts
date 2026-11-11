import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { FinanceApi } from '../pos/finance.api';
import type { TransactionRow } from '../pos/finance.models';

@Component({
  selector: 'app-transaction-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'finance.transactionsTitle' | t" [description]="'finance.transactionsDescription' | t" [breadcrumbs]="breadcrumbs" />
    <form class="mb-4 grid gap-3 md:grid-cols-3" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'finance.transactionsEmpty' | t" [description]="'finance.transactionsEmptyBody' | t" icon="receipt" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'finance.transactionsTitle' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.number' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.customer' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.total' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.refunded' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium">{{ item.transactionNumber }}</td>
                  <td class="px-4 py-3">{{ item.customerName }}</td>
                  <td class="px-4 py-3">{{ money(item.totalAmount) }}</td>
                  <td class="px-4 py-3">{{ money(item.refundedAmount) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(item.status)">{{ 'status.' + item.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3"><a enzoButton size="sm" variant="ghost" [routerLink]="['/transactions', item.id]">{{ 'finance.view' | t }}</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="mt-4"><enzo-pagination [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)" /></div>
    }
  `,
})
export class TransactionListPage {
  private readonly api = inject(FinanceApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.transactions' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<TransactionRow[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', branchId: this.branches.selectedId() });

  constructor() {
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('appointments.allBranches') }, ...this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }))];
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected tone(status: string): BadgeTone {
    if (status === 'PAID') return 'success';
    if (status === 'REFUNDED') return 'danger';
    if (status === 'PARTIALLY_REFUNDED') return 'warning';
    return 'neutral';
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    const filters = this.filters.getRawValue();
    this.api.transactions({ page: this.page(), pageSize: this.pageSize, search: filters.search, branchId: filters.branchId }).subscribe({
      next: (result) => {
        this.items.set(result.data);
        this.total.set(result.meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
