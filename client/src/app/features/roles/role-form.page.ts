import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import type { PermissionModule } from '../organization/organization.models';

@Component({
  selector: 'app-role-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'roles.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'roles.details' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-text-input formControlName="name" [label]="'roles.name' | t" [required]="true" />
            <enzo-text-input formControlName="description" [label]="'roles.descriptionField' | t" />
          </div>
        </enzo-card>
        <enzo-card [title]="'roles.matrix' | t" [description]="'roles.matrixHint' | t">
          <div class="grid gap-6">
            @for (module of modules(); track module.module) {
              <fieldset class="grid gap-2">
                <legend class="text-sm font-semibold text-text-primary">{{ 'permModule.' + module.module | t }}</legend>
                <div class="grid gap-2 sm:grid-cols-2">
                  @for (permission of module.permissions; track permission) {
                    <label class="inline-flex items-center gap-2 text-sm" [class.opacity-50]="!canGrant(permission)">
                      <input class="enzo-check" type="checkbox" [checked]="selected().has(permission)" [disabled]="!canGrant(permission)" (change)="toggle(permission, $event)" />
                      <span>{{ 'perm.' + permission | t }}</span>
                    </label>
                  }
                </div>
              </fieldset>
            }
          </div>
        </enzo-card>
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/roles">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class RoleFormPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly access = inject(TenantAccess);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly modules = signal<PermissionModule[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly roleId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.roleId ? 'roles.edit' : 'roles.add');
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: [''],
  });

  constructor() {
    Promise.all([
      firstValueFrom(this.api.permissions()),
      this.roleId ? firstValueFrom(this.api.role(this.roleId)) : Promise.resolve(null),
    ])
      .then(([catalog, role]) => {
        this.modules.set(catalog.data);
        if (role) {
          this.form.patchValue({ name: role.data.name, description: role.data.description });
          this.selected.set(new Set(role.data.permissions));
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
      { labelKey: 'nav.roles', link: '/roles' },
      { labelKey: this.titleKey() },
    ];
  }

  protected canGrant(permission: string): boolean {
    return this.access.can(permission);
  }

  protected toggle(permission: string, event: Event): void {
    if (!this.canGrant(permission)) return;
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    const next = new Set(this.selected());
    if (checked) next.add(permission);
    else next.delete(permission);
    this.selected.set(next);
  }

  protected save(): void {
    if (this.form.invalid || this.selected().size === 0) {
      this.form.markAllAsTouched();
      this.error.set(this.i18n.translate('roles.pickPermission'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    this.api.saveRole({ name: value.name.trim(), description: value.description.trim(), permissions: [...this.selected()] }, this.roleId ?? undefined).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('roles.saved'));
        void this.access.reload();
        void this.router.navigateByUrl('/roles');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
