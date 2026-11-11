import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type ServiceCategory } from '../catalog/catalog.models';

@Component({
  selector: 'app-service-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'services.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'services.details' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="nameEn" [label]="'services.nameEn' | t" [required]="true" />
            <enzo-text-input formControlName="nameAr" [label]="'services.nameAr' | t" />
            <enzo-text-input formControlName="descriptionEn" [label]="'services.descriptionEn' | t" />
            <enzo-text-input formControlName="descriptionAr" [label]="'services.descriptionAr' | t" />
            <enzo-select formControlName="categoryId" [label]="'services.category' | t" [options]="categoryOptions()" />
            <enzo-text-input formControlName="price" type="number" [label]="'services.price' | t" [required]="true" />
            <enzo-select formControlName="commissionType" [label]="'services.commission' | t" [options]="commissionOptions()" />
            <enzo-text-input formControlName="commissionValue" type="number" [label]="'services.commissionValue' | t" [hint]="capHint()" />
            <div class="md:col-span-2">
              <label class="grid gap-2 text-sm">
                <span class="text-text-secondary">{{ 'services.image' | t }}</span>
                <input class="enzo-control" type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onImage($event)" />
              </label>
            </div>
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/services">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class ServiceFormPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly serviceId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.serviceId ? 'services.edit' : 'services.add');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly categories = signal<ServiceCategory[]>([]);
  readonly cap = signal(100);
  readonly breadcrumbs = () => [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.services', link: '/services' },
    { labelKey: this.titleKey() },
  ];
  readonly form = this.formBuilder.nonNullable.group({
    nameEn: ['', [Validators.required, Validators.minLength(2)]],
    nameAr: [''],
    descriptionEn: [''],
    descriptionAr: [''],
    categoryId: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    commissionType: ['PERCENTAGE' as 'PERCENTAGE' | 'FIXED'],
    commissionValue: [0, [Validators.required, Validators.min(0)]],
    image: [''],
  });

  constructor() {
    this.api.categories().subscribe({
      next: (result) => this.categories.set(result.data.filter((item) => item.status === 'ACTIVE')),
      error: () => this.categories.set([]),
    });
    this.api.serviceSettings().subscribe({
      next: (result) => this.cap.set(result.data.maxCommissionPercent),
      error: () => this.cap.set(100),
    });
    if (!this.serviceId) {
      this.loading.set(false);
      return;
    }
    this.api.service(this.serviceId).subscribe({
      next: (result) => {
        const service = result.data;
        this.form.patchValue({
          nameEn: service.name.en,
          nameAr: service.name.ar,
          descriptionEn: service.description.en,
          descriptionAr: service.description.ar,
          categoryId: service.categoryId,
          price: service.price,
          commissionType: service.commissionType,
          commissionValue: service.commissionValue,
          image: service.image,
        });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected categoryOptions(): SelectOption[] {
    this.i18n.language();
    return this.categories().map((category) => ({ value: category.id, label: localizedLabel(category.name, this.i18n.language()) }));
  }

  protected commissionOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'PERCENTAGE', label: this.i18n.translate('workforce.percentage') },
      { value: 'FIXED', label: this.i18n.translate('workforce.fixed') },
    ];
  }

  protected capHint(): string {
    return this.form.controls.commissionType.value === 'PERCENTAGE' ? `${this.i18n.translate('services.cap')}: ${this.cap()}` : '';
  }

  protected onImage(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.api.uploadServiceImage(input.files[0]).subscribe({
      next: (result) => this.form.controls.image.setValue(result.data.image),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (!value.categoryId) {
      this.error.set(this.i18n.translate('services.category'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .saveService(
        {
          name: { en: value.nameEn, ar: value.nameAr },
          description: { en: value.descriptionEn, ar: value.descriptionAr },
          categoryId: value.categoryId,
          image: value.image,
          price: Number(value.price),
          commissionType: value.commissionType,
          commissionValue: Number(value.commissionValue),
        },
        this.serviceId ?? undefined,
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.toasts.success(this.i18n.translate('services.saved'));
          void this.router.navigate(['/services', result.data.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
        },
      });
  }
}
