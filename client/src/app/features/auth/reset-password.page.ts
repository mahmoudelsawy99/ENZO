import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { PasswordInput } from '../../shared/ui/password-input';
import { AuthLayout } from './auth-layout';
import { strongPassword } from './password';

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AuthLayout, Button, PasswordInput],
  template: `
    <app-auth-layout>
      <h1 class="font-display text-3xl text-text-primary">{{ 'auth.resetTitle' | t }}</h1>
      <p class="mt-2 text-sm leading-6 text-text-secondary">{{ 'auth.resetHint' | t }}</p>
      @if (!token) {
        <p class="mt-4 text-sm text-danger" role="alert">{{ 'auth.missingToken' | t }}</p>
      }
      @if (error()) {
        <p class="mt-4 text-sm text-danger" role="alert">{{ error() }}</p>
      }
      <form class="mt-6 grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <enzo-password-input
          formControlName="password"
          autocomplete="new-password"
          [label]="'auth.newPassword' | t"
          [hint]="'validation.password' | t"
          [required]="true"
        />
        <button enzoButton type="submit" [loading]="submitting()" [disabled]="form.invalid || !token">
          {{ 'auth.updatePassword' | t }}
        </button>
      </form>
      <a class="mt-4 inline-flex text-sm text-text-secondary hover:text-text-primary" routerLink="/login">{{ 'auth.backToSignIn' | t }}</a>
    </app-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly form = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), strongPassword]],
  });

  protected submit(): void {
    if (this.form.invalid || !this.token) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    this.auth.resetPassword(this.token, this.form.controls.password.value).subscribe({
      next: () => void this.router.navigate(['/login'], { queryParams: { reason: 'reset' } }),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('auth.failed'));
      },
    });
  }
}
