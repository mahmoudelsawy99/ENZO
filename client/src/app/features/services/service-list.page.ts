import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DialogService } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type ServiceCategory, type ServiceRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-service-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'services.title' | t" [description]="'services.description' | t" [breadcrumbs]="breadcrumbs">
      @if (access.can('service-categories.view')) {
        <a enzoButton variant="secondary" routerLink="/services/categories">{{ 'services.categories' | t }}</a>
      }
      @if (access.can('services.create')) {
        <a enzoButton routerLink="/services/new">{{ 'services.add' | t }}</a>
      }
    </enzo-page-header>

    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="categoryId" [label]="'services.category' | t" [options]="categoryOptions()" />
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
        <enzo-empty-state [title]="'services.empty' | t" [description]="'services.emptyBody' | t" icon="scissors" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'services.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'services.nameEn' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'services.category' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'services.price' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'services.commission' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (service of items(); track service.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ label(service.name) }}</td>
                  <td class="px-4 py-3">{{ label(service.categoryName) }}</td>
                  <td class="px-4 py-3">{{ money(service.price) }}</td>
                  <td class="px-4 py-3">{{ commission(service) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(service.status)">{{ 'status.' + service.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/services', service.id]">{{ 'services.view' | t }}</a>
                      @if (access.can('services.update')) {
                        <a enzoButton size="sm" variant="ghost" [routerLink]="['/services', service.id, 'edit']">{{ 'services.edit' | t }}</a>
                      }
                      @if (access.can('services.disable')) {
                        <button enzoButton size="sm" [variant]="service.status === 'ACTIVE' ? 'danger' : 'secondary'" type="button" (click)="setStatus(service)">
                          {{ (service.status === 'ACTIVE' ? 'services.deactivate' : 'services.activate') | t }}
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
export class ServiceListPage {
  private readonly api = inject(CatalogApi);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.services' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<ServiceRecord[]>([]);
  readonly categories = signal<ServiceCategory[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', status: '', categoryId: '' });

  constructor() {
    this.api.categories().subscribe({
      next: (result) => this.categories.set(result.data),
      error: () => this.categories.set([]),
    });
    this.load();
  }

  protected label(value: ServiceRecord['name']): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected commission(service: ServiceRecord): string {
    return service.commissionType === 'PERCENTAGE' ? `${service.commissionValue}%` : this.money(service.commissionValue);
  }

  protected categoryOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('services.allCategories') },
      ...this.categories().map((category) => ({ value: category.id, label: this.label(category.name) })),
    ];
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
    this.api.services({ page: this.page(), pageSize: this.pageSize, search: filters.search, status: filters.status, categoryId: filters.categoryId }).subscribe({
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

  protected async setStatus(service: ServiceRecord): Promise<void> {
    const next = service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.dialogs.confirm({
      titleKey: next === 'ACTIVE' ? 'services.activateTitle' : 'services.deactivateTitle',
      messageKey: next === 'ACTIVE' ? 'services.activateBody' : 'services.deactivateBody',
      confirmKey: next === 'ACTIVE' ? 'services.activate' : 'services.deactivate',
      danger: next !== 'ACTIVE',
    });
    if (!confirmed) return;
    this.api.serviceStatus(service.id, next).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('services.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
