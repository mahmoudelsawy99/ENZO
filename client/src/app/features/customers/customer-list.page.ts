import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DialogService } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { ToastService } from '../../shared/ui/toast.service';
import { Toggle } from '../../shared/ui/toggle';
import { CatalogApi } from '../catalog/catalog.api';
import type { CustomerRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-customer-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, Card, Toggle, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'customers.title' | t" [description]="'customers.description' | t" [breadcrumbs]="breadcrumbs">
      @if (access.can('customers.create')) {
        <a enzoButton routerLink="/customers/new">{{ 'customers.add' | t }}</a>
      }
    </enzo-page-header>

    @if (access.can('customers.update')) {
      <enzo-card class="mb-4" [title]="'customers.uniquePhone' | t" [description]="'customers.uniquePhoneHint' | t">
        <form class="flex flex-wrap items-center justify-between gap-3" [formGroup]="policy" (ngSubmit)="savePolicy()">
          <enzo-toggle formControlName="uniquePhone" [ariaLabel]="'customers.uniquePhone' | t" />
          <button enzoButton type="submit" variant="secondary">{{ 'common.save' | t }}</button>
        </form>
      </enzo-card>
    }

    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
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
        <enzo-empty-state [title]="'customers.empty' | t" [description]="'customers.emptyBody' | t" icon="users" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'customers.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'customers.number' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'customers.name' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'customers.phone' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (customer of items(); track customer.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3">{{ customer.customerNumber }}</td>
                  <td class="px-4 py-3 font-medium text-text-primary">{{ customer.fullName }}</td>
                  <td class="px-4 py-3">{{ customer.phone || '—' }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(customer.status)">{{ 'status.' + customer.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/customers', customer.id]">{{ 'customers.view' | t }}</a>
                      @if (access.can('customers.update')) {
                        <a enzoButton size="sm" variant="ghost" [routerLink]="['/customers', customer.id, 'edit']">{{ 'customers.edit' | t }}</a>
                      }
                      @if (access.can('customers.disable')) {
                        <button enzoButton size="sm" [variant]="customer.status === 'ACTIVE' ? 'danger' : 'secondary'" type="button" (click)="setStatus(customer)">
                          {{ (customer.status === 'ACTIVE' ? 'customers.deactivate' : 'customers.activate') | t }}
                        </button>
                      }
                    </div>
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
export class CustomerListPage {
  private readonly api = inject(CatalogApi);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.customers' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<CustomerRecord[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', status: '' });
  readonly policy = this.formBuilder.nonNullable.group({ uniquePhone: true });

  constructor() {
    this.api.customerSettings().subscribe({
      next: (result) => this.policy.patchValue(result.data),
      error: () => undefined,
    });
    this.load();
  }

  protected statusOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('branches.allStatuses') },
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected tone(status: string): BadgeTone {
    return status === 'ACTIVE' ? 'success' : 'warning';
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
    this.api.customers({ page: this.page(), pageSize: this.pageSize, search: filters.search, status: filters.status }).subscribe({
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

  protected savePolicy(): void {
    this.api.saveCustomerSettings(this.policy.getRawValue().uniquePhone).subscribe({
      next: () => this.toasts.success(this.i18n.translate('customers.policySaved')),
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected async setStatus(customer: CustomerRecord): Promise<void> {
    const next = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.dialogs.confirm({
      titleKey: next === 'ACTIVE' ? 'customers.activateTitle' : 'customers.deactivateTitle',
      messageKey: next === 'ACTIVE' ? 'customers.activateBody' : 'customers.deactivateBody',
      confirmKey: next === 'ACTIVE' ? 'customers.activate' : 'customers.deactivate',
      danger: next !== 'ACTIVE',
    });
    if (!confirmed) return;
    this.api.customerStatus(customer.id, next).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('customers.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
