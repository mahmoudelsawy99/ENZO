import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
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
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductCategory, ProductRecord } from './inventory.models';

@Component({
  selector: 'app-product-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'stock.products' | t" [description]="'stock.productsDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.inventoryTitle', link: '/inventory' }]">
      @if (access.can('products.create')) {
        <a enzoButton variant="secondary" routerLink="/inventory/categories">{{ 'stock.categories' | t }}</a>
        <a enzoButton routerLink="/inventory/products/new">{{ 'stock.addProduct' | t }}</a>
      }
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_12rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="categoryId" [label]="'stock.category' | t" [options]="categoryOptions()" />
      <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state icon="boxes" [title]="'stock.emptyProducts' | t" [description]="'stock.emptyProductsBody' | t" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'stock.products' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.product' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.sku' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.sellingPrice' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (product of items(); track product.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ label(product.name) }}</td>
                  <td class="px-4 py-3">{{ product.sku }}</td>
                  <td class="px-4 py-3">{{ money(product.sellingPrice) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="product.status === 'ACTIVE' ? 'success' : 'neutral'">{{ 'status.' + product.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      @if (access.can('products.update')) {
                        <a enzoButton size="sm" variant="ghost" [routerLink]="['/inventory/products', product.id]">{{ 'stock.edit' | t }}</a>
                      }
                      @if (access.can('products.deactivate') && product.status === 'ACTIVE') {
                        <button enzoButton size="sm" variant="ghost" type="button" (click)="deactivate(product)">{{ 'stock.deactivate' | t }}</button>
                      }
                    </div>
                  </td>
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
export class ProductListPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  protected readonly filters = this.formBuilder.nonNullable.group({ search: '', categoryId: '', status: '' });
  protected readonly items = signal<ProductRecord[]>([]);
  protected readonly categories = signal<ProductCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly total = signal(0);

  constructor() {
    this.api.categories().subscribe({ next: (result) => this.categories.set(result.data), error: () => this.categories.set([]) });
    this.load();
  }

  protected categoryOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('stock.allCategories') }, ...this.categories().map((category) => ({ value: category.id, label: localizedLabel(category.name, this.i18n.language()) }))];
  }

  protected statusOptions(): SelectOption[] {
    return [
      { value: '', label: this.i18n.translate('stock.allStatuses') },
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
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

  protected deactivate(product: ProductRecord): void {
    this.api.deactivateProduct(product.id).subscribe({
      next: () => {
        this.toast.success(this.i18n.translate('stock.saved'));
        this.load();
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    const raw = this.filters.getRawValue();
    this.api.products({ page: this.page(), pageSize: 20, search: raw.search, status: raw.status, categoryId: raw.categoryId, sort: 'name', direction: 'asc' }).subscribe({
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
