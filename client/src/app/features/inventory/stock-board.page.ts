import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { InventoryApi } from './inventory.api';
import type { StockRow } from './inventory.models';

@Component({
  selector: 'app-stock-board-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'stock.inventoryTitle' | t" [description]="'stock.inventoryDescription' | t">
      @if (access.can('products.view')) {
        <a enzoButton variant="secondary" routerLink="/inventory/products">{{ 'stock.products' | t }}</a>
      }
      @if (access.can('stock-alerts.view')) {
        <a enzoButton variant="secondary" routerLink="/inventory/alerts">{{ 'stock.alerts' | t }}</a>
      }
      @if (access.can('transfers.view')) {
        <a enzoButton variant="secondary" routerLink="/transfers">{{ 'stock.transfers' | t }}</a>
      }
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_12rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <enzo-select formControlName="alert" [label]="'stock.level' | t" [options]="alertOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state icon="boxes" [title]="'stock.emptyStock' | t" [description]="'stock.emptyStockBody' | t" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'stock.inventoryTitle' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.product' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.sku' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.onHand' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.averageCost' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.minimum' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ label(row.productName) }}</td>
                  <td class="px-4 py-3">{{ row.sku }}</td>
                  <td class="px-4 py-3">
                    <enzo-badge [tone]="row.quantityOnHand === 0 ? 'danger' : row.quantityOnHand <= row.minimumStock ? 'warning' : 'success'">{{ text(row.quantityOnHand) }}</enzo-badge>
                  </td>
                  <td class="px-4 py-3">{{ money(row.averageCost) }}</td>
                  <td class="px-4 py-3">{{ text(row.minimumStock) }}</td>
                  <td class="px-4 py-3"><a enzoButton size="sm" variant="ghost" [routerLink]="['/inventory/stock', row.productId]" [queryParams]="{ branchId: filters.controls.branchId.value }">{{ 'stock.history' | t }}</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="mt-4"><enzo-pagination [page]="page()" [pageSize]="20" [total]="total()" (pageChange)="go($event)" /></div>
    }
  `,
})
export class StockBoardPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  protected readonly access = inject(TenantAccess);
  protected readonly branches = inject(BranchContext);
  protected readonly filters = this.formBuilder.nonNullable.group({ search: '', branchId: this.branches.selectedId(), alert: '' });
  protected readonly items = signal<StockRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly total = signal(0);

  constructor() {
    const selected = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    if (selected) {
      this.filters.controls.branchId.setValue(selected);
    }
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected alertOptions(): SelectOption[] {
    return [
      { value: '', label: this.i18n.translate('stock.allLevels') },
      { value: 'low', label: this.i18n.translate('stock.low') },
      { value: 'out', label: this.i18n.translate('stock.out') },
    ];
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
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
    const branchId = this.filters.controls.branchId.value;
    if (!branchId) {
      this.loading.set(false);
      this.items.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const raw = this.filters.getRawValue();
    this.api.stock({ branchId, page: this.page(), pageSize: 20, search: raw.search, alert: raw.alert }).subscribe({
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
