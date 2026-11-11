import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DateField } from '../../shared/ui/date-field';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type PackageRecord, type ServiceRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-package-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, DateField, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'packages.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'packages.details' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="nameEn" [label]="'services.nameEn' | t" [required]="true" />
            <enzo-text-input formControlName="nameAr" [label]="'services.nameAr' | t" />
            <enzo-text-input formControlName="descriptionEn" [label]="'services.descriptionEn' | t" />
            <enzo-text-input formControlName="descriptionAr" [label]="'services.descriptionAr' | t" />
            <enzo-text-input formControlName="price" type="number" [label]="'packages.price' | t" [required]="true" />
            <enzo-select formControlName="validityType" [label]="'packages.validity' | t" [options]="validityOptions()" />
            @if (form.controls.validityType.value === 'VALIDITY_DAYS') {
              <enzo-text-input formControlName="validityDays" type="number" [label]="'packages.days' | t" />
            }
            @if (form.controls.validityType.value === 'FIXED_EXPIRY') {
              <enzo-date-field formControlName="fixedExpiryDate" [label]="'packages.expiryDate' | t" />
            }
          </div>
        </enzo-card>
        <enzo-card [title]="'packages.items' | t">
          <div class="grid gap-3" formArrayName="items">
            @for (group of form.controls.items.controls; track $index) {
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]" [formGroupName]="$index">
                <enzo-select formControlName="serviceId" [label]="'services.title' | t" [options]="serviceOptions()" />
                <enzo-text-input formControlName="quantity" type="number" [label]="'packages.quantity' | t" />
                <div class="flex items-end">
                  <button enzoButton type="button" variant="danger" (click)="removeItem($index)">{{ 'packages.remove' | t }}</button>
                </div>
              </div>
            }
            <button enzoButton type="button" variant="secondary" (click)="addItem()">{{ 'packages.addItem' | t }}</button>
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/packages">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class PackageFormPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly packageId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.packageId ? 'packages.edit' : 'packages.add');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly services = signal<ServiceRecord[]>([]);
  readonly breadcrumbs = () => [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.packages', link: '/packages' },
    { labelKey: this.titleKey() },
  ];
  readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', [Validators.required, Validators.minLength(2)]],
    nameAr: [''],
    descriptionEn: [''],
    descriptionAr: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    validityType: ['NO_EXPIRY' as PackageRecord['validityType']],
    validityDays: [30],
    fixedExpiryDate: [''],
    image: [''],
    items: this.formBuilder.array([this.itemGroup()]),
  });

  constructor() {
    this.api.services({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.services.set(result.data),
      error: () => this.services.set([]),
    });
    if (!this.packageId) {
      this.loading.set(false);
      return;
    }
    this.api.package(this.packageId).subscribe({
      next: (result) => {
        const item = result.data;
        this.form.patchValue({
          nameEn: item.name.en,
          nameAr: item.name.ar,
          descriptionEn: item.description.en,
          descriptionAr: item.description.ar,
          price: item.price,
          validityType: item.validityType,
          validityDays: item.validityDays ?? 30,
          fixedExpiryDate: item.fixedExpiryDate,
          image: item.image,
        });
        this.form.controls.items.clear();
        for (const entry of item.items) {
          this.form.controls.items.push(this.itemGroup(entry.serviceId, entry.quantity));
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private itemGroup(serviceId = '', quantity = 1) {
    return this.formBuilder.nonNullable.group({
      serviceId: [serviceId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(1)]],
    });
  }

  protected serviceOptions(): SelectOption[] {
    this.i18n.language();
    return this.services().map((service) => ({ value: service.id, label: localizedLabel(service.name, this.i18n.language()) }));
  }

  protected validityOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'NO_EXPIRY', label: this.i18n.translate('packages.noExpiry') },
      { value: 'VALIDITY_DAYS', label: this.i18n.translate('packages.validityDays') },
      { value: 'FIXED_EXPIRY', label: this.i18n.translate('packages.fixedExpiry') },
    ];
  }

  protected addItem(): void {
    this.form.controls.items.push(this.itemGroup());
  }

  protected removeItem(index: number): void {
    this.form.controls.items.removeAt(index);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const rows = value.items
      .map((item) => ({ serviceId: item.serviceId, quantity: Number(item.quantity) }))
      .filter((item) => item.serviceId && item.quantity >= 1);
    if (rows.length === 0) {
      this.error.set(this.i18n.translate('packages.items'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .savePackage(
        {
          name: { en: value.nameEn, ar: value.nameAr },
          description: { en: value.descriptionEn, ar: value.descriptionAr },
          image: value.image,
          items: rows,
          price: Number(value.price),
          validityType: value.validityType,
          validityDays: value.validityType === 'VALIDITY_DAYS' ? Number(value.validityDays) : null,
          fixedExpiryDate: value.validityType === 'FIXED_EXPIRY' ? value.fixedExpiryDate : '',
        },
        this.packageId ?? undefined,
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.toasts.success(this.i18n.translate('packages.saved'));
          void this.router.navigate(['/packages', result.data.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
        },
      });
  }
}
