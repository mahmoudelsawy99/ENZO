import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { AppointmentApi } from './appointment.api';
import type { AppointmentRecord, AppointmentStatus } from './appointment.models';

const STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

@Component({
  selector: 'app-appointment-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, DateField, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'appointments.title' | t" [description]="'appointments.description' | t" [breadcrumbs]="breadcrumbs">
      @if (access.can('appointments.create')) {
        <a enzoButton routerLink="/appointments/new">{{ 'appointments.add' | t }}</a>
      }
    </enzo-page-header>

    <form class="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
      <enzo-select formControlName="type" [label]="'appointments.type' | t" [options]="typeOptions()" />
      <enzo-date-field formControlName="from" [label]="'appointments.from' | t" />
      <enzo-date-field formControlName="to" [label]="'appointments.to' | t" />
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
        <enzo-empty-state [title]="'appointments.empty' | t" [description]="'appointments.emptyBody' | t" icon="calendar" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'appointments.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.number' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.customer' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.barber' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.when' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.type' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'appointments.total' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ item.appointmentNumber }}</td>
                  <td class="px-4 py-3">{{ item.customerName }}</td>
                  <td class="px-4 py-3">{{ item.barberName }}</td>
                  <td class="px-4 py-3">{{ when(item.scheduledAt) }}</td>
                  <td class="px-4 py-3">{{ 'appointments.types.' + item.type | t }}</td>
                  <td class="px-4 py-3">{{ money(item.total) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(item.status)">{{ 'status.' + item.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <a enzoButton size="sm" variant="ghost" [routerLink]="['/appointments', item.id]">{{ 'appointments.view' | t }}</a>
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
export class AppointmentListPage {
  private readonly api = inject(AppointmentApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.appointments' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<AppointmentRecord[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({
    search: '',
    branchId: this.branches.selectedId(),
    status: '',
    type: '',
    from: '',
    to: '',
  });

  constructor() {
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('appointments.allBranches') }, ...this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }))];
  }

  protected statusOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('branches.allStatuses') }, ...STATUSES.map((status) => ({ value: status, label: this.i18n.translate(`status.${status}`) }))];
  }

  protected typeOptions(): SelectOption[] {
    return [
      { value: '', label: this.i18n.translate('appointments.allTypes') },
      { value: 'BOOKING', label: this.i18n.translate('appointments.types.BOOKING') },
      { value: 'WALK_IN', label: this.i18n.translate('appointments.types.WALK_IN') },
    ];
  }

  protected tone(status: AppointmentStatus): BadgeTone {
    if (status === 'COMPLETED') return 'success';
    if (status === 'CANCELLED' || status === 'NO_SHOW') return 'danger';
    if (status === 'IN_SERVICE' || status === 'WAITING') return 'warning';
    if (status === 'CONFIRMED' || status === 'CHECKED_IN') return 'info';
    return 'neutral';
  }

  protected when(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(this.i18n.language() === 'ar' ? 'ar' : 'en');
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
    this.api
      .list({
        page: this.page(),
        pageSize: this.pageSize,
        search: filters.search,
        branchId: filters.branchId,
        status: filters.status,
        type: filters.type,
        from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : '',
        to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : '',
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.data);
          this.total.set(result.meta.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
          this.loading.set(false);
        },
      });
  }
}
