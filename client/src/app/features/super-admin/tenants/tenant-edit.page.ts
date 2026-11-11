import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '../../../core/api/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PageHeader } from '../../../shared/ui/page-header';
import { Select, type SelectOption } from '../../../shared/ui/select';
import { TextInput } from '../../../shared/ui/text-input';
import { ToastService } from '../../../shared/ui/toast.service';
import { PlatformApi } from '../platform.api';

@Component({
  selector: 'app-tenant-edit-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, Button, LoadingState, ErrorState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" (retry)="reload()" />
    } @else {
      <enzo-page-header [title]="'platform.editTenant' | t" [description]="'platform.editDescription' | t" [breadcrumbs]="breadcrumbs" />
      @if (error()) {
        <p class="mb-4 text-sm text-danger" role="alert">{{ error() }}</p>
      }
      <form class="grid gap-6" [formGroup]="form" (ngSubmit)="submit()">
        <enzo-card [title]="'platform.stepBusiness' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="businessName" [label]="'platform.businessName' | t" [required]="true" />
            <enzo-text-input formControlName="slug" [label]="'platform.slug' | t" [required]="true" />
            <enzo-text-input formControlName="contactEmail" type="email" [label]="'platform.businessEmail' | t" [required]="true" />
            <enzo-text-input formControlName="contactPhone" type="tel" [label]="'auth.phone' | t" [required]="true" />
            <div class="md:col-span-2">
              <enzo-text-input formControlName="address" [label]="'platform.address' | t" />
            </div>
            <div class="md:col-span-2">
              <label class="grid gap-1.5 text-sm">
                <span class="font-medium">{{ 'platform.logo' | t }}</span>
                <input class="enzo-control" type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onLogo($event)" />
              </label>
              @if (form.controls.logo.value) {
                <img class="mt-3 h-16 w-16 rounded-md border border-border object-cover" [src]="form.controls.logo.value" alt="" />
              }
            </div>
          </div>
        </enzo-card>
        <enzo-card [title]="'platform.stepOwner' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="ownerName" [label]="'auth.name' | t" [required]="true" />
            <enzo-text-input formControlName="ownerEmail" type="email" [label]="'auth.email' | t" [required]="true" />
            <enzo-text-input formControlName="ownerPhone" type="tel" [label]="'auth.phone' | t" />
          </div>
        </enzo-card>
        <enzo-card [title]="'platform.stepRegional' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-select formControlName="currency" [label]="'platform.currency' | t" [options]="currencyOptions" [required]="true" />
            <enzo-select formControlName="timezone" [label]="'platform.timezone' | t" [options]="timezoneOptions" [required]="true" />
            <enzo-select formControlName="defaultLanguage" [label]="'platform.language' | t" [options]="languageOptions()" [required]="true" />
            <enzo-select formControlName="theme" [label]="'platform.theme' | t" [options]="themeOptions()" [required]="true" />
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="submitting()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" [routerLink]="['/platform/tenants', tenantId]">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class TenantEditPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PlatformApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly tenantId = signal('');
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly breadcrumbs = [
    { labelKey: 'platform.dashboard', link: '/platform' },
    { labelKey: 'platform.tenants', link: '/platform/tenants' },
    { labelKey: 'platform.editTenant' },
  ];
  readonly currencyOptions: SelectOption[] = ['EGP', 'USD', 'EUR', 'SAR', 'AED'].map((value) => ({ value, label: value }));
  readonly timezoneOptions: SelectOption[] = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC'].map((value) => ({
    value,
    label: value,
  }));
  readonly form = this.formBuilder.nonNullable.group({
    businessName: ['', [Validators.required, Validators.maxLength(120)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    contactPhone: ['', [Validators.required, Validators.minLength(6)]],
    address: [''],
    logo: [''],
    ownerName: ['', Validators.required],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPhone: [''],
    currency: ['EGP', Validators.required],
    timezone: ['Africa/Cairo', Validators.required],
    defaultLanguage: ['en', Validators.required],
    theme: ['dark', Validators.required],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.tenantId.set(params.get('id') ?? '');
      void this.reload();
    });
  }

  protected languageOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'en', label: this.i18n.translate('language.en') },
      { value: 'ar', label: this.i18n.translate('language.ar') },
    ];
  }

  protected themeOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'dark', label: this.i18n.translate('platform.themeDark') },
      { value: 'light', label: this.i18n.translate('platform.themeLight') },
    ];
  }

  protected reload(): void {
    const id = this.tenantId();
    if (!id) return;
    this.loading.set(true);
    this.loadError.set('');
    void this.api
      .get(id)
      .then((tenant) => {
        this.form.setValue({
          businessName: tenant.businessName,
          slug: tenant.slug,
          contactEmail: tenant.contactEmail,
          contactPhone: tenant.contactPhone,
          address: tenant.address,
          logo: tenant.logo,
          ownerName: tenant.owner?.fullName ?? '',
          ownerEmail: tenant.owner?.email ?? '',
          ownerPhone: tenant.owner?.phone ?? '',
          currency: tenant.currency,
          timezone: tenant.timezone,
          defaultLanguage: tenant.defaultLanguage,
          theme: tenant.theme,
        });
      })
      .catch((error: unknown) => this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')))
      .finally(() => this.loading.set(false));
  }

  protected async onLogo(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      this.error.set(this.i18n.translate('platform.logoTooLarge'));
      return;
    }
    try {
      this.form.controls.logo.setValue(await this.api.uploadLogo(file));
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('platform.logoFailed'));
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set('');
    try {
      await this.api.update(this.tenantId(), {
        businessName: value.businessName,
        slug: value.slug,
        contactEmail: value.contactEmail,
        contactPhone: value.contactPhone,
        address: value.address,
        logo: value.logo,
        currency: value.currency,
        timezone: value.timezone,
        defaultLanguage: value.defaultLanguage === 'ar' ? 'ar' : 'en',
        theme: value.theme === 'light' ? 'light' : 'dark',
        owner: { fullName: value.ownerName, email: value.ownerEmail, phone: value.ownerPhone },
      });
      this.toasts.success(this.i18n.translate('platform.saved'));
      await this.router.navigate(['/platform/tenants', this.tenantId()]);
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('auth.failed'));
    } finally {
      this.submitting.set(false);
    }
  }
}
