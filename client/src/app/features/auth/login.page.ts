import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Checkbox } from '../../shared/ui/checkbox';
import { PasswordInput } from '../../shared/ui/password-input';
import { TextInput } from '../../shared/ui/text-input';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AuthLayout, Button, TextInput, PasswordInput, Checkbox],
  template: `
    <app-auth-layout>
      <h1 class="font-display text-3xl text-text-primary">{{ 'auth.signIn' | t }}</h1>
      <p class="mt-2 text-sm leading-6 text-text-secondary">{{ 'auth.signInHint' | t }}</p>

      @if (notice()) {
        <p class="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" role="status">
          {{ notice() }}
        </p>
      }
      @if (error()) {
        <p class="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
          {{ error() }}
        </p>
      }

      <form class="mt-6 grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <enzo-text-input formControlName="email" type="email" autocomplete="username" [label]="'auth.email' | t" [required]="true" />
        <enzo-password-input formControlName="password" autocomplete="current-password" [label]="'auth.password' | t" [required]="true" />
        <div class="flex items-center justify-between gap-3">
          <enzo-checkbox formControlName="rememberMe" [label]="'auth.rememberMe' | t" />
          <a class="text-sm text-text-secondary hover:text-text-primary" routerLink="/forgot-password">{{ 'auth.forgot' | t }}</a>
        </div>
        <button enzoButton type="submit" [loading]="submitting()" [disabled]="form.invalid">{{ 'auth.signIn' | t }}</button>
      </form>
    </app-auth-layout>
  `,
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [false],
  });

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'tenant_unavailable') {
      this.notice.set(this.i18n.translate('auth.tenantBlocked'));
    } else if (reason === 'account_unavailable' || reason === 'account_locked') {
      this.notice.set(this.i18n.translate('auth.accountBlocked'));
    } else if (reason === 'reset') {
      this.notice.set(this.i18n.translate('auth.passwordUpdated'));
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    const waiting = window.setTimeout(() => {
      if (this.submitting()) {
        this.notice.set(this.i18n.translate('auth.waking'));
      }
    }, 2000);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        window.clearTimeout(waiting);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
        void this.router.navigateByUrl(this.safeReturn(returnUrl) ?? this.auth.homeUrl());
      },
      error: (error: unknown) => {
        window.clearTimeout(waiting);
        this.submitting.set(false);
        this.error.set(
          error instanceof ApiError && error.code === 'server_waking'
            ? this.i18n.translate('auth.waking')
            : error instanceof ApiError
              ? error.message
              : this.i18n.translate('auth.failed'),
        );
      },
    });
  }

  private safeReturn(url: string): string | null {
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('://')) {
      return null;
    }
    const user = this.auth.user();
    if (!user) {
      return null;
    }
    if (user.userType === 'SUPER_ADMIN') {
      return url.startsWith('/platform') || url.startsWith('/account') ? url : null;
    }
    return url.startsWith('/platform') ? null : url;
  }
}
