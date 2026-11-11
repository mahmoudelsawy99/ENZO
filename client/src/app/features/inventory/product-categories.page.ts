import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductCategory } from './inventory.models';

@Component({
  selector: 'app-product-categories-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select, Badge, LoadingState, EmptyState],
  template: `
    <enzo-page-header [title]="'stock.categories' | t" [description]="'stock.categoriesDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.products', link: '/inventory/products' }]">
      <a enzoButton variant="secondary" routerLink="/inventory/products">{{ 'stock.products' | t }}</a>
    </enzo-page-header>
    @if (access.can('products.create')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_12rem_auto]" [formGroup]="form" (ngSubmit)="save()">
        <enzo-text-input formControlName="nameEn" [label]="'stock.nameEn' | t" />
        <enzo-text-input formControlName="nameAr" [label]="'stock.nameAr' | t" />
        <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
        <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ (editing() ? 'common.save' : 'stock.addCategory') | t }}</button></div>
      </form>
    }
    @if (error()) { <p class="mb-3 text-sm text-danger">{{ error() }}</p> }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="boxes" [title]="'stock.emptyCategories' | t" [description]="'stock.emptyCategoriesBody' | t" /></div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'stock.categories' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.category' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (category of items(); track category.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ label(category.name) }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="category.status === 'ACTIVE' ? 'success' : 'neutral'">{{ 'status.' + category.status | t }}</enzo-badge></td>
                <td class="px-4 py-3">@if (access.can('products.update')) { <button enzoButton size="sm" variant="ghost" type="button" (click)="edit(category)">{{ 'stock.edit' | t }}</button> }</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class ProductCategoriesPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  protected readonly items = signal<ProductCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly editing = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', Validators.required],
    nameAr: [''],
    status: ['ACTIVE', Validators.required],
  });

  constructor() {
    this.load();
  }

  protected statusOptions(): SelectOption[] {
    return [
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected edit(category: ProductCategory): void {
    this.editing.set(category.id);
    this.form.patchValue({ nameEn: category.name.en, nameAr: category.name.ar, status: category.status });
  }

  protected load(): void {
    this.loading.set(true);
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

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api.saveCategory({ name: { en: raw.nameEn, ar: raw.nameAr }, status: raw.status }, this.editing() || undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set('');
        this.form.reset({ nameEn: '', nameAr: '', status: 'ACTIVE' });
        this.toast.success(this.i18n.translate('stock.saved'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
