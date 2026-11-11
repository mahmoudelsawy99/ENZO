import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api/api-error';
import { EnzoDatePipe } from '../../../core/i18n/locale.pipe';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { DialogService } from '../../../shared/ui/dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PageHeader } from '../../../shared/ui/page-header';
import { Pagination } from '../../../shared/ui/pagination';
import { SearchInput } from '../../../shared/ui/search-input';
import { Select, type SelectOption } from '../../../shared/ui/select';
import { ToastService } from '../../../shared/ui/toast.service';
import { PlatformApi } from '../platform.api';
import type { TenantRecord, TenantStatus } from '../platform.models';

@Component({
  selector: 'app-tenant-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    EnzoDatePipe,
    PageHeader,
    Button,
    SearchInput,
    Select,
    Badge,
    Pagination,
    LoadingState,
    EmptyState,
    ErrorState,
  ],
  template: `
    <enzo-page-header [title]="'platform.tenants' | t" [description]="'platform.tenantsDescription' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton routerLink="/platform/tenants/new">{{ 'platform.createTenant' | t }}</a>
    </enzo-page-header>

    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="status" [label]="'platform.status' | t" [options]="statusOptions()" />
      <div class="flex items-end">
        <button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button>
      </div>
    </form>

    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" (retry)="load()" />
    } @else if (tenants().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'platform.noTenants' | t" [description]="emptyDescription()" icon="building">
          @if (!hasQuery()) {
            <a enzoButton routerLink="/platform/tenants/new">{{ 'platform.createTenant' | t }}</a>
          }
        </enzo-empty-state>
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'platform.tenants' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'platform.businessName' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'platform.owner' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'auth.email' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'auth.phone' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'platform.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'platform.created' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (tenant of tenants(); track tenant.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ tenant.businessName }}</td>
                  <td class="px-4 py-3">{{ tenant.owner?.fullName || '—' }}</td>
                  <td class="px-4 py-3">{{ tenant.contactEmail }}</td>
                  <td class="px-4 py-3">{{ tenant.contactPhone }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(tenant.status)">{{ statusKey(tenant.status) | t }}</enzo-badge></td>
                  <td class="px-4 py-3">{{ tenant.createdAt | enzoDate }}</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/platform/tenants', tenant.id]">{{ 'platform.view' | t }}</a>
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/platform/tenants', tenant.id, 'edit']">{{ 'platform.edit' | t }}</a>
                      @if (tenant.status !== 'ACTIVE') {
                        <button enzoButton size="sm" variant="secondary" type="button" (click)="changeStatus(tenant, 'ACTIVE')">{{ 'platform.activate' | t }}</button>
                      }
                      @if (tenant.status !== 'SUSPENDED') {
                        <button enzoButton size="sm" variant="secondary" type="button" (click)="changeStatus(tenant, 'SUSPENDED')">{{ 'platform.suspend' | t }}</button>
                      }
                      @if (tenant.status !== 'INACTIVE') {
                        <button enzoButton size="sm" variant="danger" type="button" (click)="changeStatus(tenant, 'INACTIVE')">{{ 'platform.deactivate' | t }}</button>
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
export class TenantListPage {
  private readonly api = inject(PlatformApi);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tenants = signal<TenantRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly breadcrumbs = [{ labelKey: 'platform.dashboard', link: '/platform' }, { labelKey: 'platform.tenants' }];
  readonly filters = this.formBuilder.nonNullable.group({ search: [''], status: [''] });

  constructor() {
    void this.load();
  }

  protected statusOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('platform.allStatuses') },
      { value: 'ACTIVE', label: this.i18n.translate('platform.active') },
      { value: 'SUSPENDED', label: this.i18n.translate('platform.suspended') },
      { value: 'INACTIVE', label: this.i18n.translate('platform.inactive') },
    ];
  }

  protected statusKey(status: TenantStatus): string {
    if (status === 'ACTIVE') return 'platform.active';
    if (status === 'SUSPENDED') return 'platform.suspended';
    return 'platform.inactive';
  }

  protected tone(status: TenantStatus): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'SUSPENDED') return 'warning';
    return 'neutral';
  }

  protected hasQuery(): boolean {
    const value = this.filters.getRawValue();
    return value.search.trim().length > 0 || value.status.length > 0;
  }

  protected emptyDescription(): string {
    this.i18n.language();
    return this.i18n.translate(this.hasQuery() ? 'platform.noMatches' : 'platform.noTenantsBody');
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  protected async changeStatus(tenant: TenantRecord, status: TenantStatus): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      titleKey: status === 'SUSPENDED' ? 'platform.suspendTitle' : status === 'INACTIVE' ? 'platform.deactivateTitle' : 'platform.activateTitle',
      messageKey: status === 'SUSPENDED' ? 'platform.suspendBody' : status === 'INACTIVE' ? 'platform.deactivateBody' : 'platform.activateBody',
      confirmKey: status === 'SUSPENDED' ? 'platform.suspend' : status === 'INACTIVE' ? 'platform.deactivate' : 'platform.activate',
      danger: status !== 'ACTIVE',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.api.setStatus(tenant.id, status);
      this.toasts.success(this.i18n.translate('platform.statusUpdated'));
      await this.load();
    } catch (error) {
      this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const value = this.filters.getRawValue();
    try {
      const result = await this.api.list({
        page: this.page(),
        pageSize: this.pageSize,
        search: value.search.trim(),
        status: value.status,
        sort: 'createdAt',
        order: 'desc',
      });
      this.tenants.set(result.data);
      this.total.set(result.meta.total);
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
    } finally {
      this.loading.set(false);
    }
  }
}
