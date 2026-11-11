import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductCategory } from './inventory.models';

@Component({
  selector: 'app-product-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="(editing() ? 'stock.editProduct' : 'stock.addProduct') | t" [description]="'stock.productsDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.products', link: '/inventory/products' }]">
      <a enzoButton variant="secondary" routerLink="/inventory/products">{{ 'stock.products' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <form class="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2" [formGroup]="form" (ngSubmit)="save()">
        <enzo-text-input formControlName="nameEn" [label]="'stock.nameEn' | t" />
        <enzo-text-input formControlName="nameAr" [label]="'stock.nameAr' | t" />
        <enzo-text-input formControlName="sku" [label]="'stock.sku' | t" />
        <enzo-text-input formControlName="barcode" [label]="'stock.barcode' | t" />
        <enzo-select formControlName="categoryId" [label]="'stock.category' | t" [options]="categoryOptions()" />
        <enzo-text-input formControlName="brand" [label]="'stock.brand' | t" />
        <enzo-text-input formControlName="unit" [label]="'stock.unit' | t" />
        <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
        <enzo-text-input formControlName="costPrice" type="number" [label]="'stock.costPrice' | t" />
        <enzo-text-input formControlName="sellingPrice" type="number" [label]="'stock.sellingPrice' | t" />
        <enzo-text-input formControlName="minimumStock" type="number" [label]="'stock.minimum' | t" />
        <enzo-text-input formControlName="descriptionEn" [label]="'stock.descriptionEn' | t" />
        <enzo-text-input formControlName="descriptionAr" [label]="'stock.descriptionAr' | t" />
        <label class="grid gap-1 text-sm text-text-secondary">
          {{ 'stock.image' | t }}
          <input class="text-text-primary" type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="chooseImage($event)" />
        </label>
        @if (error()) { <p class="text-sm text-danger md:col-span-2">{{ error() }}</p> }
        <div class="md:col-span-2"><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
      </form>
    }
  `,
})
export class ProductFormPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly editing = signal(Boolean(this.id));
  protected readonly categories = signal<ProductCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly loadError = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', Validators.required],
    nameAr: [''],
    sku: ['', Validators.required],
    barcode: [''],
    categoryId: ['', Validators.required],
    brand: [''],
    unit: ['piece', Validators.required],
    status: ['ACTIVE', Validators.required],
    costPrice: ['0', Validators.required],
    sellingPrice: ['0', Validators.required],
    minimumStock: ['0', Validators.required],
    descriptionEn: [''],
    descriptionAr: [''],
    image: [''],
  });

  constructor() {
    this.load();
  }

  protected categoryOptions(): SelectOption[] {
    return this.categories().filter((category) => category.status === 'ACTIVE').map((category) => ({ value: category.id, label: localizedLabel(category.name, this.i18n.language()) }));
  }

  protected statusOptions(): SelectOption[] {
    return [
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected chooseImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.api.uploadImage(file).subscribe({
      next: (result) => this.form.controls.image.setValue(result.data.image),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected load(): void {
    this.api.categories().subscribe({
      next: (result) => {
        this.categories.set(result.data);
        if (!this.id) {
          this.loading.set(false);
          return;
        }
        this.api.product(this.id).subscribe({
          next: (product) => {
            const current = product.data;
            this.form.patchValue({
              nameEn: current.name.en,
              nameAr: current.name.ar,
              sku: current.sku,
              barcode: current.barcode,
              categoryId: current.categoryId,
              brand: current.brand,
              unit: current.unit,
              status: current.status,
              costPrice: String(current.costPrice),
              sellingPrice: String(current.sellingPrice),
              minimumStock: String(current.minimumStock),
              descriptionEn: current.description.en,
              descriptionAr: current.description.ar,
              image: current.image,
            });
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.loading.set(false);
            this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
          },
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
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
    this.error.set('');
    this.api.saveProduct({
      name: { en: raw.nameEn, ar: raw.nameAr },
      sku: raw.sku,
      barcode: raw.barcode,
      description: { en: raw.descriptionEn, ar: raw.descriptionAr },
      categoryId: raw.categoryId,
      brand: raw.brand,
      unit: raw.unit,
      costPrice: Number(raw.costPrice),
      sellingPrice: Number(raw.sellingPrice),
      minimumStock: Number(raw.minimumStock),
      image: raw.image,
      status: raw.status,
    }, this.id || undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        void this.router.navigateByUrl('/inventory/products');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
