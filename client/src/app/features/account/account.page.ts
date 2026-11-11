import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { PageHeader } from '../../shared/ui/page-header';
import { PasswordInput } from '../../shared/ui/password-input';
import { ToastService } from '../../shared/ui/toast.service';
import { strongPassword } from '../auth/password';

@Component({
  selector: 'app-account-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Card, PasswordInput, Button],
  template: `
    <enzo-page-header [title]="'account.title' | t" [description]="'account.description' | t" [breadcrumbs]="breadcrumbs" />
    <div class="grid gap-6 lg:grid-cols-2">
      <enzo-card [title]="'account.profile' | t">
        <dl class="grid gap-3 text-sm">
          <div>
            <dt class="text-text-secondary">{{ 'auth.name' | t }}</dt>
            <dd class="text-text-primary">{{ auth.user()?.fullName }}</dd>
          </div>
          <div>
            <dt class="text-text-secondary">{{ 'auth.email' | t }}</dt>
            <dd class="text-text-primary">{{ auth.user()?.email }}</dd>
          </div>
          <div>
            <dt class="text-text-secondary">{{ 'account.access' | t }}</dt>
            <dd class="text-text-primary">{{ (auth.user()?.userType === 'SUPER_ADMIN' ? 'account.superAdmin' : 'account.tenantUser') | t }}</dd>
          </div>
        </dl>
      </enzo-card>
      <enzo-card [title]="'account.password' | t" [description]="'account.passwordHint' | t">
        @if (error()) {
          <p class="mb-4 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <form class="grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
          <enzo-password-input formControlName="currentPassword" autocomplete="current-password" [label]="'account.currentPassword' | t" [required]="true" />
          <enzo-password-input
            formControlName="newPassword"
            autocomplete="new-password"
            [label]="'auth.newPassword' | t"
            [hint]="'validation.password' | t"
            [required]="true"
          />
          <button enzoButton type="submit" [loading]="submitting()" [disabled]="form.invalid">{{ 'auth.updatePassword' | t }}</button>
        </form>
      </enzo-card>
    </div>
  `,
})
export class AccountPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly breadcrumbs = [{ labelKey: 'account.title' }];
  readonly form = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), strongPassword]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    this.auth.changePassword(value.currentPassword, value.newPassword).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('account.passwordChanged'));
        void this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('auth.failed'));
      },
    });
  }
}
