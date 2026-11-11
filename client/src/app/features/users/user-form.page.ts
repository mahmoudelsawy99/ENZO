import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { strongPassword } from '../auth/password';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { PasswordInput } from '../../shared/ui/password-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import type { BranchRecord, EmployeeRecord, RoleRecord } from '../organization/organization.models';

interface RoleChoice {
  id: string;
  name: string;
  isOwner: boolean;
  selected: boolean;
  branchIds: string[];
}

@Component({
  selector: 'app-user-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, PasswordInput, Select, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'users.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="saveProfile()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'users.profile' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="fullName" [label]="'users.name' | t" [required]="true" />
            <enzo-text-input formControlName="email" [label]="'users.email' | t" type="email" [required]="true" />
            <enzo-text-input formControlName="phone" [label]="'users.phone' | t" />
            @if (!userId) {
              <enzo-password-input formControlName="password" [label]="'users.password' | t" [required]="true" />
            }
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
            <a enzoButton variant="secondary" routerLink="/users">{{ 'common.cancel' | t }}</a>
            @if (userId && !isOwner()) {
              <button enzoButton type="button" variant="secondary" (click)="setStatus(status() === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')">
                {{ (status() === 'ACTIVE' ? 'users.deactivate' : 'users.activate') | t }}
              </button>
            }
          </div>
        </enzo-card>
      </form>

      @if (userId) {
        <div class="mt-4 grid gap-4">
          <enzo-card [title]="'users.security' | t">
            <form class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]" [formGroup]="passwordForm" (ngSubmit)="resetPassword()">
              <enzo-password-input formControlName="password" [label]="'users.newPassword' | t" />
              <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'users.resetPassword' | t }}</button></div>
              <div class="flex items-end"><button enzoButton type="button" variant="danger" (click)="revoke()">{{ 'users.revokeSessions' | t }}</button></div>
            </form>
          </enzo-card>
          <enzo-card [title]="'users.employee' | t" [description]="'users.employeeHint' | t">
            <form class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" [formGroup]="linkForm" (ngSubmit)="link()">
              <enzo-select formControlName="employeeId" [label]="'users.employee' | t" [options]="employeeOptions()" />
              <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'users.link' | t }}</button></div>
            </form>
          </enzo-card>
          <enzo-card [title]="'users.access' | t" [description]="'users.accessHint' | t">
            <div class="grid gap-4">
              @for (role of roleChoices(); track role.id) {
                <section class="rounded-md border border-border p-3">
                  <label class="inline-flex items-center gap-2 text-sm font-medium">
                    <input class="enzo-check" type="checkbox" [checked]="role.selected" [disabled]="role.isOwner && isOwner()" (change)="toggleRole(role.id, $event)" />
                    <span>{{ role.name }}</span>
                  </label>
                  @if (role.selected && !(role.isOwner && isOwner())) {
                    <div class="mt-3 grid gap-2 sm:grid-cols-2">
                      @for (branch of branches(); track branch.id) {
                        <label class="inline-flex items-center gap-2 text-sm">
                          <input class="enzo-check" type="checkbox" [checked]="role.branchIds.includes(branch.id)" (change)="toggleBranch(role.id, branch.id, $event)" />
                          <span>{{ branch.name }}</span>
                        </label>
                      }
                    </div>
                  }
                  @if (role.selected && role.isOwner && isOwner()) {
                    <p class="mt-2 text-sm text-text-secondary">{{ 'users.ownerScope' | t }}</p>
                  }
                </section>
              }
            </div>
            <button class="mt-4" enzoButton type="button" [loading]="savingRoles()" (click)="saveRoles()">{{ 'users.saveAccess' | t }}</button>
          </enzo-card>
        </div>
      }
    }
  `,
})
export class UserFormPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly access = inject(TenantAccess);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingRoles = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly userId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.userId ? 'users.edit' : 'users.add');
  readonly isOwner = signal(false);
  readonly status = signal<'ACTIVE' | 'INACTIVE' | 'LOCKED'>('ACTIVE');
  readonly branches = signal<BranchRecord[]>([]);
  readonly employees = signal<EmployeeRecord[]>([]);
  readonly roleChoices = signal<RoleChoice[]>([]);
  readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', this.userId ? [] : [Validators.required, Validators.minLength(8), strongPassword]],
  });
  readonly passwordForm = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), strongPassword]],
  });
  readonly linkForm = this.formBuilder.nonNullable.group({ employeeId: '' });

  constructor() {
    const requests: [
      Promise<{ data: RoleRecord[] }>,
      Promise<{ data: BranchRecord[] }>,
      Promise<{ data: EmployeeRecord[] }>,
    ] = [
      firstValueFrom(this.api.roles({ page: 1, pageSize: 100 })).then((result) => ({ data: result.data })),
      firstValueFrom(this.api.branches({ page: 1, pageSize: 100 })).then((result) => ({ data: result.data })),
      firstValueFrom(this.api.employees({ page: 1, pageSize: 100 })).then((result) => ({ data: result.data })),
    ];
    Promise.all(this.userId ? [...requests, firstValueFrom(this.api.user(this.userId))] : requests)
      .then((result) => {
        const roles = result[0].data.filter((role) => role.status === 'ACTIVE');
        this.branches.set(result[1].data.filter((branch) => branch.status === 'ACTIVE'));
        this.employees.set(result[2].data);
        const user = result[3];
        const assigned = new Map((user?.data.roles ?? []).map((role) => [role.roleId, role]));
        this.roleChoices.set(
          roles.map((role) => ({
            id: role.id,
            name: role.name,
            isOwner: role.isOwner,
            selected: assigned.has(role.id),
            branchIds: assigned.get(role.id)?.branchIds ?? [],
          })),
        );
        if (user) {
          this.form.patchValue({ fullName: user.data.fullName, email: user.data.email, phone: user.data.phone });
          this.isOwner.set(user.data.isOwner);
          this.status.set(user.data.status);
          this.linkForm.patchValue({ employeeId: user.data.employee?.id ?? '' });
        }
        this.loading.set(false);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      });
  }

  protected breadcrumbs() {
    return [
      { labelKey: 'nav.dashboard', link: '/dashboard' },
      { labelKey: 'nav.users', link: '/users' },
      { labelKey: this.titleKey() },
    ];
  }

  protected employeeOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: '', label: this.i18n.translate('users.noEmployee') },
      ...this.employees().map((employee) => ({ value: employee.id, label: `${employee.fullName} · ${employee.employeeNumber}` })),
    ];
  }

  protected saveProfile(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    this.api.saveUser({ fullName: value.fullName.trim(), email: value.email.trim(), phone: value.phone.trim(), password: value.password }, this.userId ?? undefined).subscribe({
      next: (response) => {
        this.toasts.success(this.i18n.translate('users.saved'));
        if (!this.userId) {
          void this.router.navigate(['/users', response.data.id, 'edit']);
          return;
        }
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected setStatus(status: 'ACTIVE' | 'INACTIVE'): void {
    if (!this.userId) return;
    this.api.userStatus(this.userId, status).subscribe({
      next: (response) => {
        this.status.set(response.data.status);
        this.toasts.success(this.i18n.translate('users.saved'));
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected resetPassword(): void {
    if (!this.userId || this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.api.resetPassword(this.userId, this.passwordForm.controls.password.value).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.toasts.success(this.i18n.translate('users.passwordReset'));
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected revoke(): void {
    if (!this.userId) return;
    this.api.revokeSessions(this.userId).subscribe({
      next: () => this.toasts.success(this.i18n.translate('users.sessionsRevoked')),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected link(): void {
    if (!this.userId) return;
    const employeeId = this.linkForm.controls.employeeId.value || null;
    this.api.linkEmployee(this.userId, employeeId).subscribe({
      next: () => this.toasts.success(this.i18n.translate('users.saved')),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected toggleRole(roleId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    this.roleChoices.update((roles) => roles.map((role) => (role.id === roleId ? { ...role, selected: checked } : role)));
  }

  protected toggleBranch(roleId: string, branchId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    this.roleChoices.update((roles) =>
      roles.map((role) => {
        if (role.id !== roleId) return role;
        const branchIds = checked ? [...role.branchIds, branchId] : role.branchIds.filter((id) => id !== branchId);
        return { ...role, branchIds };
      }),
    );
  }

  protected saveRoles(): void {
    if (!this.userId) return;
    const assignments = this.roleChoices()
      .filter((role) => role.selected)
      .map((role) =>
        role.isOwner && this.isOwner()
          ? { roleId: role.id, branchScope: 'ALL' as const, branchIds: [] }
          : { roleId: role.id, branchScope: 'SELECTED' as const, branchIds: role.branchIds },
      );
    if (assignments.some((item) => item.branchScope === 'SELECTED' && item.branchIds.length === 0)) {
      this.error.set(this.i18n.translate('users.pickBranch'));
      return;
    }
    this.savingRoles.set(true);
    this.api.saveUserRoles(this.userId, assignments).subscribe({
      next: () => {
        this.savingRoles.set(false);
        this.toasts.success(this.i18n.translate('users.saved'));
        void this.access.reload();
      },
      error: (error: unknown) => {
        this.savingRoles.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
