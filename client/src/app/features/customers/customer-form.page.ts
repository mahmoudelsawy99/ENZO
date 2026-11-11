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
import type { CustomerPayload } from '../catalog/catalog.models';

@Component({
  selector: 'app-customer-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, DateField, Select, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'customers.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'customers.overview' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="fullName" [label]="'customers.name' | t" [required]="true" />
            <enzo-text-input formControlName="phone" type="tel" [label]="'customers.phone' | t" />
            <enzo-text-input formControlName="email" type="email" [label]="'customers.email' | t" />
            <enzo-date-field formControlName="dateOfBirth" [label]="'customers.birth' | t" />
            <enzo-select formControlName="gender" [label]="'customers.gender' | t" [options]="genderOptions()" />
            <enzo-text-input formControlName="address" [label]="'customers.address' | t" />
            <div class="md:col-span-2">
              <enzo-text-input formControlName="notes" [label]="'customers.profileNotes' | t" />
            </div>
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/customers">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class CustomerFormPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly customerId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.customerId ? 'customers.edit' : 'customers.add');
  readonly loading = signal(Boolean(this.customerId));
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly breadcrumbs = () => [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.customers', link: '/customers' },
    { labelKey: this.titleKey() },
  ];
  readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    email: [''],
    dateOfBirth: [''],
    gender: ['' as CustomerPayload['gender']],
    address: [''],
    notes: [''],
  });

  constructor() {
    if (!this.customerId) return;
    this.api.customer(this.customerId).subscribe({
      next: (result) => {
        this.form.patchValue(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected genderOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('customers.genderNone') },
      { value: 'MALE', label: this.i18n.translate('customers.male') },
      { value: 'FEMALE', label: this.i18n.translate('customers.female') },
    ];
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    this.api.saveCustomer(value, this.customerId ?? undefined).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.toasts.success(this.i18n.translate('customers.saved'));
        void this.router.navigate(['/customers', result.data.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
