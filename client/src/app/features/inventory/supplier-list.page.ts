import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { InventoryApi } from './inventory.api';
import type { SupplierRecord } from './inventory.models';

@Component({
  selector: 'app-supplier-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'stock.suppliers' | t" [description]="'stock.suppliersDescription' | t">
      @if (access.can('suppliers.manage')) {
        <a enzoButton routerLink="/suppliers/new">{{ 'stock.addSupplier' | t }}</a>
      }
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="truck" [title]="'stock.emptySuppliers' | t" [description]="'stock.emptySuppliersBody' | t" /></div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'stock.suppliers' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.supplier' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.phone' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (supplier of items(); track supplier.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3 font-medium">{{ supplier.name }}</td>
                <td class="px-4 py-3">{{ supplier.phone }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="supplier.status === 'ACTIVE' ? 'success' : 'neutral'">{{ 'status.' + supplier.status | t }}</enzo-badge></td>
                <td class="px-4 py-3"><a enzoButton size="sm" variant="ghost" [routerLink]="['/suppliers', supplier.id]">{{ 'stock.view' | t }}</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="mt-4"><enzo-pagination [page]="page()" [pageSize]="20" [total]="total()" (pageChange)="go($event)" /></div>
    }
  `,
})
export class SupplierListPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  protected readonly access = inject(TenantAccess);
  protected readonly filters = this.formBuilder.nonNullable.group({ search: '' });
  protected readonly items = signal<SupplierRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly total = signal(0);

  constructor() {
    this.load();
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

  protected go(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.suppliers({ page: this.page(), pageSize: 20, search: this.filters.controls.search.value }).subscribe({
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
