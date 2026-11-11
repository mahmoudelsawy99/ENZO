import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { OrganizationApi } from '../organization/organization.api';
import type { RoleRecord } from '../organization/organization.models';

@Component({
  selector: 'app-role-list-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, SearchInput, Select, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'roles.title' | t" [description]="'roles.description' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton routerLink="/roles/new">{{ 'roles.add' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" [formGroup]="filters" (ngSubmit)="search()">
      <enzo-search-input formControlName="search" [label]="'common.search' | t" />
      <enzo-select formControlName="status" [label]="'roles.status' | t" [options]="statusOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'roles.empty' | t" [description]="'roles.emptyBody' | t" icon="shield" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'roles.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'roles.name' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'roles.permissions' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'roles.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (role of items(); track role.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium text-text-primary">{{ role.name }}</td>
                  <td class="px-4 py-3">{{ role.permissions.length }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(role.status)">{{ 'status.' + role.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      @if (!role.isOwner) {
                        <a enzoButton size="sm" variant="ghost" [routerLink]="['/roles', role.id, 'edit']">{{ 'roles.edit' | t }}</a>
                      }
                      <button enzoButton size="sm" variant="ghost" type="button" (click)="duplicate(role)">{{ 'roles.duplicate' | t }}</button>
                      @if (!role.isOwner && role.status === 'ACTIVE') {
                        <button enzoButton size="sm" variant="danger" type="button" (click)="setStatus(role, 'INACTIVE')">{{ 'roles.disable' | t }}</button>
                      }
                      @if (!role.isOwner && role.status !== 'ACTIVE') {
                        <button enzoButton size="sm" variant="secondary" type="button" (click)="setStatus(role, 'ACTIVE')">{{ 'roles.enable' | t }}</button>
                      }
                    </div>
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
export class RoleListPage {
  private readonly api = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.roles' }];
  readonly pageSize = 10;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<RoleRecord[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly filters = this.formBuilder.nonNullable.group({ search: '', status: '' });

  constructor() {
    this.load();
  }

  protected statusOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('roles.allStatuses') },
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

  protected async duplicate(role: RoleRecord): Promise<void> {
    const name = window.prompt(this.i18n.translate('roles.duplicatePrompt'), `${role.name} copy`);
    if (!name?.trim()) return;
    this.api.duplicateRole(role.id, name.trim()).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('roles.saved'));
        this.load();
      },
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected async setStatus(role: RoleRecord, status: RoleRecord['status']): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      titleKey: status === 'ACTIVE' ? 'roles.enableTitle' : 'roles.disableTitle',
      messageKey: status === 'ACTIVE' ? 'roles.enableBody' : 'roles.disableBody',
      danger: status !== 'ACTIVE',
    });
    if (!confirmed) return;
    this.api.roleStatus(role.id, status).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    const filters = this.filters.getRawValue();
    this.api.roles({ page: this.page(), pageSize: this.pageSize, search: filters.search, status: filters.status }).subscribe({
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
