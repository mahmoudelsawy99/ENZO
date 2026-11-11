import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { TextInput } from '../../shared/ui/text-input';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AuthLayout, Button, TextInput],
  template: `
    <app-auth-layout>
      <h1 class="font-display text-3xl text-text-primary">{{ 'auth.forgotTitle' | t }}</h1>
      <p class="mt-2 text-sm leading-6 text-text-secondary">{{ 'auth.forgotHint' | t }}</p>
      @if (message()) {
        <p class="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" role="status">
          {{ message() }}
        </p>
      }
      @if (error()) {
        <p class="mt-4 text-sm text-danger" role="alert">{{ error() }}</p>
      }
      <form class="mt-6 grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <enzo-text-input formControlName="email" type="email" autocomplete="username" [label]="'auth.email' | t" [required]="true" />
        <button enzoButton type="submit" [loading]="submitting()" [disabled]="form.invalid">{{ 'auth.sendReset' | t }}</button>
      </form>
      <a class="mt-4 inline-flex text-sm text-text-secondary hover:text-text-primary" routerLink="/login">{{ 'auth.backToSignIn' | t }}</a>
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(LanguageService);
  readonly submitting = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    this.auth.forgotPassword(this.form.controls.email.value).subscribe({
      next: (message) => {
        this.submitting.set(false);
        this.message.set(`${message} ${this.i18n.translate('auth.emailNotConfigured')}`);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('auth.failed'));
      },
    });
  }
}
