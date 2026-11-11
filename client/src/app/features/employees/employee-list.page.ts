import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { OrganizationApi } from '../organization/organization.api';
import type { EmployeeRecord } from '../organization/organization.models';

@Component({
  selector: 'app-employee-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'employees.title' | t" [description]="'employees.description' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton routerLink="/employees/new">{{ 'employees.add' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="status" [label]="'employees.status' | t" [options]="statusOptions()" />
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
        <enzo-empty-state [title]="'employees.empty' | t" [description]="'employees.emptyBody' | t" icon="users" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'employees.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'employees.number' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'employees.name' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'employees.jobTitle' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'employees.branches' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'employees.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (employee of items(); track employee.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3">{{ employee.employeeNumber }}</td>
                  <td class="px-4 py-3 font-medium text-text-primary">{{ employee.fullName }}</td>
                  <td class="px-4 py-3">{{ employee.jobTitleName }}</td>
                  <td class="px-4 py-3">{{ branchLabel(employee) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(employee.status)">{{ 'status.' + employee.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/employees', employee.id]">{{ 'employees.view' | t }}</a>
                      <a enzoButton size="sm" variant="ghost" [routerLink]="['/employees', employee.id, 'edit']">{{ 'employees.edit' | t }}</a>
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
export class EmployeeListPage {
  private readonly api = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.employees' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<EmployeeRecord[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', status: '' });

  constructor() {
    this.load();
  }

  protected statusOptions(): SelectOption[] {
    this.i18n.language();
    return ['', 'ACTIVE', 'INACTIVE', 'TERMINATED'].map((value) => ({
      value,
      label: value ? this.i18n.translate(`status.${value}`) : this.i18n.translate('employees.allStatuses'),
    }));
  }

  protected tone(status: string): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'INACTIVE') return 'warning';
    return 'danger';
  }

  protected branchLabel(employee: EmployeeRecord): string {
    const active = employee.branches.filter((branch) => branch.status === 'ACTIVE');
    if (active.length === 0) return '—';
    const primary = active.find((branch) => branch.isPrimary);
    const extra = active.length - 1;
    return extra > 0 ? `${primary?.branchName ?? active[0]?.branchName} +${extra}` : (primary?.branchName ?? active[0]?.branchName ?? '—');
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
    this.api.employees({ page: this.page(), pageSize: this.pageSize, search: filters.search, status: filters.status }).subscribe({
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
