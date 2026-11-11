import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { FinanceApi } from './finance.api';
import type { ReadyAppointment } from './finance.models';

@Component({
  selector: 'app-pos-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'finance.readyTitle' | t" [description]="'finance.readyDescription' | t" [breadcrumbs]="breadcrumbs" />
    <form class="mb-4 grid gap-3 md:grid-cols-3" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <div class="flex items-end">
        <button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button>
      </div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'finance.readyEmpty' | t" [description]="'finance.readyEmptyBody' | t" icon="card" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'finance.readyTitle' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.number' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.customer' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.total' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium">{{ item.appointmentNumber }}</td>
                  <td class="px-4 py-3">{{ item.customerName }}<span class="block text-xs text-text-secondary">{{ item.customerPhone }}</span></td>
                  <td class="px-4 py-3">{{ money(item.total) }}</td>
                  <td class="px-4 py-3"><enzo-badge tone="warning">{{ 'status.' + item.checkoutStatus | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    @if (access.can('pos.checkout')) {
                      <a enzoButton size="sm" [routerLink]="['/pos', item.id]">{{ 'finance.openCheckout' | t }}</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="mt-4">
        <enzo-pagination [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)" />
      </div>
    }
  `,
})
export class PosListPage {
  private readonly api = inject(FinanceApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.pos' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<ReadyAppointment[]>([]);
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
    this.api.ready({ page: this.page(), pageSize: this.pageSize, search: filters.search, branchId: filters.branchId }).subscribe({
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
