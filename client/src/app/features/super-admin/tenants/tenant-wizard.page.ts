import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { PageHeader } from '../../../shared/ui/page-header';
import { PasswordInput } from '../../../shared/ui/password-input';
import { Select, type SelectOption } from '../../../shared/ui/select';
import { TextInput } from '../../../shared/ui/text-input';
import { strongPassword } from '../../auth/password';
import { PlatformApi } from '../platform.api';

@Component({
  selector: 'app-tenant-wizard-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, PasswordInput, Select, Button],
  template: `
    <enzo-page-header
      [title]="'platform.createTenant' | t"
      [description]="'platform.wizardDescription' | t"
      [breadcrumbs]="breadcrumbs"
    />

    <ol class="mb-6 grid gap-2 sm:grid-cols-4" [attr.aria-label]="'platform.steps' | t">
      @for (label of stepKeys; track label; let index = $index) {
        <li
          class="rounded-md border px-3 py-2 text-sm"
          [class.border-brand-red]="step() === index"
          [class.bg-surface]="step() === index"
          [class.border-border]="step() !== index"
          [class.text-text-secondary]="step() !== index"
          [attr.aria-current]="step() === index ? 'step' : null"
        >
          {{ index + 1 }}. {{ label | t }}
        </li>
      }
    </ol>

    @if (error()) {
      <p class="mb-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
    }

    <form [formGroup]="form" (ngSubmit)="submit()">
      <enzo-card>
        @if (step() === 0) {
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="businessName" [label]="'platform.businessName' | t" [required]="true" />
            <enzo-text-input formControlName="slug" [label]="'platform.slug' | t" [hint]="'platform.slugHint' | t" [required]="true" />
            <enzo-text-input formControlName="contactEmail" type="email" autocomplete="off" [label]="'platform.businessEmail' | t" [required]="true" />
            <enzo-text-input formControlName="contactPhone" type="tel" [label]="'auth.phone' | t" [required]="true" />
            <div class="md:col-span-2">
              <enzo-text-input formControlName="address" [label]="'platform.address' | t" />
            </div>
            <div class="md:col-span-2">
              <label class="grid gap-1.5 text-sm">
                <span class="font-medium">{{ 'platform.logo' | t }}</span>
                <input class="enzo-control" type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onLogo($event)" />
                <span class="text-xs text-text-secondary">{{ 'platform.logoHint' | t }}</span>
              </label>
              @if (form.controls.logo.value) {
                <img class="mt-3 h-16 w-16 rounded-md border border-border object-cover" [src]="form.controls.logo.value" alt="" />
              }
            </div>
          </div>
        } @else if (step() === 1) {
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="ownerName" [label]="'auth.name' | t" [required]="true" />
            <enzo-text-input formControlName="ownerEmail" type="email" autocomplete="off" [label]="'auth.email' | t" [required]="true" />
            <enzo-text-input formControlName="ownerPhone" type="tel" [label]="'auth.phone' | t" />
            <enzo-password-input
              formControlName="ownerPassword"
              autocomplete="new-password"
              [label]="'platform.temporaryPassword' | t"
              [hint]="'platform.temporaryPasswordHint' | t"
              [required]="true"
            />
          </div>
        } @else if (step() === 2) {
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-select formControlName="currency" [label]="'platform.currency' | t" [options]="currencyOptions" [required]="true" />
            <enzo-select formControlName="timezone" [label]="'platform.timezone' | t" [options]="timezoneOptions" [required]="true" />
            <enzo-select formControlName="defaultLanguage" [label]="'platform.language' | t" [options]="languageOptions()" [required]="true" />
            <enzo-select formControlName="theme" [label]="'platform.theme' | t" [options]="themeOptions()" [required]="true" />
          </div>
        } @else {
          <dl class="grid gap-4 text-sm sm:grid-cols-2">
            @for (row of review(); track row.label) {
              <div>
                <dt class="text-text-secondary">{{ row.label | t }}</dt>
                <dd class="text-text-primary">{{ row.value || '—' }}</dd>
              </div>
            }
          </dl>
        }
      </enzo-card>

      <div class="mt-4 flex flex-wrap justify-between gap-2">
        <a enzoButton variant="ghost" routerLink="/platform/tenants">{{ 'common.cancel' | t }}</a>
        <div class="flex gap-2">
          @if (step() > 0) {
            <button enzoButton type="button" variant="secondary" (click)="back()">{{ 'common.previous' | t }}</button>
          }
          @if (step() < 3) {
            <button enzoButton type="button" [disabled]="uploading()" (click)="next()">{{ 'common.next' | t }}</button>
          } @else {
            <button enzoButton type="submit" [loading]="submitting()">{{ 'platform.createTenant' | t }}</button>
          }
        </div>
      </div>
    </form>
  `,
})
export class TenantWizardPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PlatformApi);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private updatingSlug = false;
  private slugManual = false;
  private readonly idempotencyKey = crypto.randomUUID();

  readonly step = signal(0);
  readonly submitting = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly stepKeys = ['platform.stepBusiness', 'platform.stepOwner', 'platform.stepRegional', 'platform.stepReview'];
  readonly breadcrumbs = [
    { labelKey: 'platform.dashboard', link: '/platform' },
    { labelKey: 'platform.tenants', link: '/platform/tenants' },
    { labelKey: 'platform.createTenant' },
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
    contactPhone: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(32)]],
    address: ['', Validators.maxLength(240)],
    logo: [''],
    ownerName: ['', [Validators.required, Validators.maxLength(120)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPhone: ['', Validators.maxLength(32)],
    ownerPassword: ['', [Validators.required, Validators.minLength(8), strongPassword]],
    currency: ['EGP', Validators.required],
    timezone: ['Africa/Cairo', Validators.required],
    defaultLanguage: ['en', Validators.required],
    theme: ['dark', Validators.required],
  });

  constructor() {
    this.form.controls.slug.valueChanges.subscribe(() => {
      if (!this.updatingSlug) {
        this.slugManual = true;
      }
    });
    this.form.controls.businessName.valueChanges.subscribe((value) => {
      if (this.slugManual) {
        return;
      }
      this.updatingSlug = true;
      this.form.controls.slug.setValue(slugify(value));
      this.updatingSlug = false;
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

  protected review(): Array<{ label: string; value: string }> {
    const value = this.form.getRawValue();
    return [
      { label: 'platform.businessName', value: value.businessName },
      { label: 'platform.slug', value: value.slug },
      { label: 'platform.businessEmail', value: value.contactEmail },
      { label: 'auth.phone', value: value.contactPhone },
      { label: 'platform.address', value: value.address },
      { label: 'auth.name', value: value.ownerName },
      { label: 'auth.email', value: value.ownerEmail },
      { label: 'platform.currency', value: value.currency },
      { label: 'platform.timezone', value: value.timezone },
      { label: 'platform.language', value: value.defaultLanguage === 'ar' ? this.i18n.translate('language.ar') : this.i18n.translate('language.en') },
      { label: 'platform.theme', value: this.i18n.translate(value.theme === 'light' ? 'platform.themeLight' : 'platform.themeDark') },
    ];
  }

  protected back(): void {
    this.error.set('');
    this.step.update((current) => Math.max(0, current - 1));
  }

  protected next(): void {
    const steps = [
      ['businessName', 'slug', 'contactEmail', 'contactPhone', 'address'],
      ['ownerName', 'ownerEmail', 'ownerPhone', 'ownerPassword'],
      ['currency', 'timezone', 'defaultLanguage', 'theme'],
    ] as const;
    const names = steps[this.step()];
    if (!names) {
      return;
    }
    let invalid = false;
    for (const name of names) {
      const control = this.form.controls[name];
      control.markAsTouched();
      invalid = invalid || control.invalid;
    }
    if (invalid) {
      return;
    }
    this.error.set('');
    this.step.update((current) => Math.min(3, current + 1));
  }

  protected async onLogo(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      return;
    }
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      this.error.set(this.i18n.translate('platform.logoTooLarge'));
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    try {
      this.form.controls.logo.setValue(await this.api.uploadLogo(file));
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('platform.logoFailed'));
    } finally {
      this.uploading.set(false);
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
      const tenant = await this.api.create(
        {
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
          owner: {
            fullName: value.ownerName,
            email: value.ownerEmail,
            phone: value.ownerPhone,
            password: value.ownerPassword,
          },
        },
        this.idempotencyKey,
      );
      await this.router.navigate(['/platform/tenants', tenant.id]);
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('auth.failed'));
    } finally {
      this.submitting.set(false);
    }
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
