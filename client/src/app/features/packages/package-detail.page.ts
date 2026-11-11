import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { SearchInput } from '../../shared/ui/search-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type CustomerRecord, type PackageRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-package-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, Badge, Button, SearchInput, LoadingState, ErrorState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else if (packageRecord(); as item) {
      <enzo-page-header [title]="label(item.name)" [description]="label(item.description)" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="item.status === 'ACTIVE' ? 'success' : 'warning'">{{ 'status.' + item.status | t }}</enzo-badge>
        @if (access.can('packages.update')) {
          <a enzoButton variant="secondary" [routerLink]="['/packages', item.id, 'edit']">{{ 'packages.edit' | t }}</a>
        }
      </enzo-page-header>
      <div class="grid gap-4 lg:grid-cols-2">
        <enzo-card [title]="'packages.items' | t">
          <p class="mb-3 text-sm text-text-secondary">{{ 'packages.price' | t }}: {{ money(item.price) }} · {{ validity(item) }}</p>
          <ul class="grid gap-2 text-sm">
            @for (entry of item.items; track entry.serviceId) {
              <li class="flex justify-between gap-3">
                <span>{{ label(entry.serviceName) }}</span>
                <span>{{ entry.quantity }} · {{ money(entry.unitPrice) }}</span>
              </li>
            }
          </ul>
        </enzo-card>
        @if (access.can('packages.assign') || access.can('customer-packages.assign')) {
          <enzo-card [title]="'packages.assign' | t" [description]="'packages.assignHint' | t">
            <form class="grid gap-3" [formGroup]="searchForm" (ngSubmit)="searchCustomers()">
              <enzo-search-input formControlName="search" [label]="'packages.customerSearch' | t" />
              <button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button>
            </form>
            <ul class="mt-4 grid gap-2">
              @for (customer of customers(); track customer.id) {
                <li class="flex items-center justify-between gap-3 text-sm">
                  <span>{{ customer.fullName }} · {{ customer.phone || customer.customerNumber }}</span>
                  <button enzoButton size="sm" type="button" [disabled]="item.status !== 'ACTIVE'" (click)="assign(customer)">{{ 'packages.assign' | t }}</button>
                </li>
              }
            </ul>
          </enzo-card>
        }
      </div>
    }
  `,
})
export class PackageDetailPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.packages', link: '/packages' },
    { labelKey: 'packages.view' },
  ];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly packageRecord = signal<PackageRecord | null>(null);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly searchForm = this.formBuilder.nonNullable.group({ search: '' });
  private readonly packageId = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    this.api.package(this.packageId).subscribe({
      next: (result) => {
        this.packageRecord.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected label(value: PackageRecord['name']): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected validity(item: PackageRecord): string {
    if (item.validityType === 'VALIDITY_DAYS') return `${item.validityDays ?? 0} ${this.i18n.translate('packages.days')}`;
    if (item.validityType === 'FIXED_EXPIRY') return item.fixedExpiryDate;
    return this.i18n.translate('packages.noExpiry');
  }

  protected searchCustomers(): void {
    this.api.customers({ page: 1, pageSize: 8, search: this.searchForm.getRawValue().search, status: 'ACTIVE' }).subscribe({
      next: (result) => this.customers.set(result.data),
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected assign(customer: CustomerRecord): void {
    this.api.assignPackage(customer.id, this.packageId).subscribe({
      next: () => this.toasts.success(this.i18n.translate('packages.assigned')),
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
