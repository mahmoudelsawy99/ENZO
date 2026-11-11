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
import type { UserRecord } from '../organization/organization.models';

@Component({
  selector: 'app-user-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'users.title' | t" [description]="'users.description' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton routerLink="/users/new">{{ 'users.add' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="status" [label]="'users.status' | t" [options]="statusOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'users.empty' | t" [description]="'users.emptyBody' | t" icon="user" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'users.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'users.name' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'users.email' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'users.roles' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'users.employee' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'users.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (user of items(); track user.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ user.fullName }}</td>
                  <td class="px-4 py-3">{{ user.email }}</td>
                  <td class="px-4 py-3">{{ user.roles.map((role) => role.roleName).join(', ') || '—' }}</td>
                  <td class="px-4 py-3">{{ user.employee?.fullName || '—' }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(user.status)">{{ 'status.' + user.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <a enzoButton size="sm" variant="ghost" [routerLink]="['/users', user.id, 'edit']">{{ 'users.edit' | t }}</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="mt-4"><enzo-pagination [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)" /></div>
    }
  `,
})
export class UserListPage {
  private readonly api = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.users' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<UserRecord[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', status: '' });

  constructor() {
    this.load();
  }

  protected statusOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('users.allStatuses') },
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
      { value: 'LOCKED', label: this.i18n.translate('status.LOCKED') },
    ];
  }

  protected tone(status: string): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'LOCKED') return 'danger';
    return 'warning';
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
    this.api.users({ page: this.page(), pageSize: this.pageSize, search: filters.search, status: filters.status }).subscribe({
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
