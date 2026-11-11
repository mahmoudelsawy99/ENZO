import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Checkbox } from '../../shared/ui/checkbox';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import { WEEK_DAYS, type UserRecord, type WeekDay } from '../organization/organization.models';

@Component({
  selector: 'app-branch-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, Checkbox, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'branches.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error() && !form) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'branches.details' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="name" [label]="'branches.name' | t" [required]="true" />
            <enzo-text-input formControlName="code" [label]="'branches.code' | t" [required]="true" [hint]="'branches.codeHint' | t" />
            <enzo-text-input formControlName="phone" [label]="'branches.phone' | t" />
            <enzo-text-input formControlName="address" [label]="'branches.address' | t" />
            @if (canPickManager()) {
              <enzo-select formControlName="managerUserId" [label]="'branches.manager' | t" [options]="managerOptions()" />
            }
          </div>
        </enzo-card>
        <enzo-card [title]="'branches.hours' | t" [description]="'branches.hoursHint' | t">
          <div formGroupName="hours" class="grid gap-4">
            @for (day of days; track day) {
              <div class="grid gap-3 border-b border-border pb-4 last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]" [formGroupName]="day">
                <enzo-checkbox formControlName="isOpen" [label]="'day.' + day | t" />
                <enzo-text-input type="time" formControlName="openingTime" [label]="'branches.opens' | t" />
                <enzo-text-input type="time" formControlName="closingTime" [label]="'branches.closes' | t" />
              </div>
            }
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/branches">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class BranchFormPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly access = inject(TenantAccess);
  private readonly formBuilder = inject(FormBuilder);

  readonly days = WEEK_DAYS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly managers = signal<UserRecord[]>([]);
  readonly branchId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.branchId ? 'branches.edit' : 'branches.add');
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]{1,15}$/)]],
    address: [''],
    phone: [''],
    managerUserId: [''],
    hours: this.formBuilder.nonNullable.group(
      Object.fromEntries(WEEK_DAYS.map((day) => [day, this.dayGroup(day !== 'friday')])) as {
        [key in WeekDay]: ReturnType<BranchFormPage['dayGroup']>;
      },
    ),
  });

  constructor() {
    if (this.access.can('users.view')) {
      this.api.users({ page: 1, pageSize: 100 }).subscribe({
        next: (result) => this.managers.set(result.data),
        error: () => this.managers.set([]),
      });
    }
    if (!this.branchId) {
      this.loading.set(false);
      return;
    }
    this.api.branch(this.branchId).subscribe({
      next: (response) => {
        const branch = response.data;
        this.form.patchValue({
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          managerUserId: branch.managerUserId ?? '',
          hours: branch.workingHours,
        });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected breadcrumbs() {
    return [
      { labelKey: 'nav.dashboard', link: '/dashboard' },
      { labelKey: 'nav.branches', link: '/branches' },
      { labelKey: this.titleKey() },
    ];
  }

  protected canPickManager(): boolean {
    return this.access.can('users.view');
  }

  protected managerOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('branches.noManager') },
      ...this.managers().map((user) => ({ value: user.id, label: user.fullName })),
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
    this.api
      .saveBranch(
        {
          name: value.name.trim(),
          code: value.code.trim().toUpperCase(),
          address: value.address.trim(),
          phone: value.phone.trim(),
          managerUserId: value.managerUserId,
          workingHours: value.hours,
        },
        this.branchId ?? undefined,
      )
      .subscribe({
        next: (response) => {
          this.toasts.success(this.i18n.translate('branches.saved'));
          void this.access.reload();
          void this.router.navigate(['/branches', response.data.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
        },
      });
  }

  private dayGroup(isOpen: boolean) {
    return this.formBuilder.nonNullable.group({
      isOpen,
      openingTime: '10:00',
      closingTime: '22:00',
    });
  }
}
