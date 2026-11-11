import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import type { ServiceCategory } from '../catalog/catalog.models';

@Component({
  selector: 'app-service-categories-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Button, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'categories.title' | t" [description]="'categories.description' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton variant="secondary" routerLink="/services">{{ 'services.title' | t }}</a>
    </enzo-page-header>
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      @if (loading()) {
        <enzo-loading-state [message]="'common.loading' | t" />
      } @else if (error()) {
        <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
      } @else if (items().length === 0) {
        <div class="rounded-lg border border-border bg-surface">
          <enzo-empty-state [title]="'categories.empty' | t" [description]="'categories.emptyBody' | t" icon="scissors" />
        </div>
      } @else {
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'categories.title' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'categories.nameEn' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'categories.nameAr' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (category of items(); track category.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-medium">{{ category.name.en }}</td>
                  <td class="px-4 py-3">{{ category.name.ar || '—' }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="category.status === 'ACTIVE' ? 'success' : 'warning'">{{ 'status.' + category.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    @if (access.can('service-categories.update')) {
                      <button enzoButton size="sm" variant="ghost" type="button" (click)="edit(category)">{{ 'categories.edit' | t }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (access.can('service-categories.create') || editing()) {
        <enzo-card [title]="(editing() ? 'categories.edit' : 'categories.add') | t">
          <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
            @if (formError()) {
              <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ formError() }}</p>
            }
            <enzo-text-input formControlName="nameEn" [label]="'categories.nameEn' | t" [required]="true" />
            <enzo-text-input formControlName="nameAr" [label]="'categories.nameAr' | t" />
            <div class="flex flex-wrap gap-2">
              <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
              @if (editing()) {
                <button enzoButton type="button" variant="secondary" (click)="reset()">{{ 'common.cancel' | t }}</button>
              }
            </div>
          </form>
        </enzo-card>
      }
    </div>
  `,
})
export class ServiceCategoriesPage {
  private readonly api = inject(CatalogApi);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.services', link: '/services' },
    { labelKey: 'categories.title' },
  ];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly items = signal<ServiceCategory[]>([]);
  readonly editing = signal<ServiceCategory | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', [Validators.required, Validators.minLength(2)]],
    nameAr: [''],
    status: ['ACTIVE' as ServiceCategory['status']],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.categories().subscribe({
      next: (result) => {
        this.items.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected edit(category: ServiceCategory): void {
    this.editing.set(category);
    this.form.patchValue({ nameEn: category.name.en, nameAr: category.name.ar, status: category.status });
  }

  protected reset(): void {
    this.editing.set(null);
    this.form.reset({ nameEn: '', nameAr: '', status: 'ACTIVE' });
    this.formError.set('');
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    const value = this.form.getRawValue();
    const current = this.editing();
    this.api.saveCategory({ name: { en: value.nameEn, ar: value.nameAr }, status: current?.status ?? 'ACTIVE' }, current?.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.toasts.success(this.i18n.translate('categories.saved'));
        this.reset();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
