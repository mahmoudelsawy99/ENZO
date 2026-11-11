import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '../../../core/api/api-error';
import { EnzoDatePipe } from '../../../core/i18n/locale.pipe';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { DialogService } from '../../../shared/ui/dialog';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PageHeader } from '../../../shared/ui/page-header';
import { ToastService } from '../../../shared/ui/toast.service';
import { PlatformApi } from '../platform.api';
import type { TenantRecord, TenantStatus } from '../platform.models';

@Component({
  selector: 'app-tenant-detail-page',
  imports: [RouterLink, TranslatePipe, EnzoDatePipe, PageHeader, Card, Badge, Button, LoadingState, ErrorState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" (retry)="reload()" />
    } @else if (tenant(); as record) {
      <enzo-page-header [title]="record.businessName" [description]="record.slug" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="tone(record.status)">{{ statusKey(record.status) | t }}</enzo-badge>
        <a enzoButton variant="secondary" [routerLink]="['/platform/tenants', record.id, 'edit']">{{ 'platform.edit' | t }}</a>
      </enzo-page-header>

      <div class="mb-6 flex flex-wrap gap-2">
        @if (record.status !== 'ACTIVE') {
          <button enzoButton type="button" (click)="changeStatus(record, 'ACTIVE')">{{ 'platform.activate' | t }}</button>
        }
        @if (record.status !== 'SUSPENDED') {
          <button enzoButton variant="secondary" type="button" (click)="changeStatus(record, 'SUSPENDED')">{{ 'platform.suspend' | t }}</button>
        }
        @if (record.status !== 'INACTIVE') {
          <button enzoButton variant="danger" type="button" (click)="changeStatus(record, 'INACTIVE')">{{ 'platform.deactivate' | t }}</button>
        }
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <enzo-card [title]="'platform.stepBusiness' | t">
          @if (record.logo) {
            <img class="mb-4 h-16 w-16 rounded-md border border-border object-cover" [src]="record.logo" alt="" />
          }
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'platform.businessName' | t }}</dt><dd>{{ record.businessName }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.businessEmail' | t }}</dt><dd>{{ record.contactEmail }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'auth.phone' | t }}</dt><dd>{{ record.contactPhone }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.address' | t }}</dt><dd>{{ record.address || '—' }}</dd></div>
          </dl>
        </enzo-card>
        <enzo-card [title]="'platform.stepOwner' | t">
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'auth.name' | t }}</dt><dd>{{ record.owner?.fullName || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'auth.email' | t }}</dt><dd>{{ record.owner?.email || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'auth.phone' | t }}</dt><dd>{{ record.owner?.phone || '—' }}</dd></div>
          </dl>
        </enzo-card>
        <enzo-card [title]="'platform.stepRegional' | t">
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'platform.currency' | t }}</dt><dd>{{ record.currency }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.timezone' | t }}</dt><dd>{{ record.timezone }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.language' | t }}</dt><dd>{{ (record.defaultLanguage === 'ar' ? 'language.ar' : 'language.en') | t }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.theme' | t }}</dt><dd>{{ (record.theme === 'light' ? 'platform.themeLight' : 'platform.themeDark') | t }}</dd></div>
          </dl>
        </enzo-card>
        <enzo-card [title]="'platform.accountStatus' | t">
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'platform.status' | t }}</dt><dd>{{ statusKey(record.status) | t }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.created' | t }}</dt><dd>{{ record.createdAt | enzoDate }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'platform.updated' | t }}</dt><dd>{{ record.updatedAt | enzoDate }}</dd></div>
          </dl>
        </enzo-card>
      </div>
    }
  `,
})
export class TenantDetailPage {
  private readonly api = inject(PlatformApi);
  private readonly route = inject(ActivatedRoute);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private currentId = '';

  readonly loading = signal(true);
  readonly error = signal('');
  readonly tenant = signal<TenantRecord | null>(null);
  readonly breadcrumbs = [
    { labelKey: 'platform.dashboard', link: '/platform' },
    { labelKey: 'platform.tenants', link: '/platform/tenants' },
    { labelKey: 'platform.tenantDetails' },
  ];

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.currentId = params.get('id') ?? '';
      void this.reload();
    });
  }

  protected statusKey(status: TenantStatus): string {
    if (status === 'ACTIVE') return 'platform.active';
    if (status === 'SUSPENDED') return 'platform.suspended';
    return 'platform.inactive';
  }

  protected tone(status: TenantStatus): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'SUSPENDED') return 'warning';
    return 'neutral';
  }

  protected reload(): void {
    if (!this.currentId) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    void this.api
      .get(this.currentId)
      .then((tenant) => this.tenant.set(tenant))
      .catch((error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')))
      .finally(() => this.loading.set(false));
  }

  protected async changeStatus(record: TenantRecord, status: TenantStatus): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      titleKey: status === 'SUSPENDED' ? 'platform.suspendTitle' : status === 'INACTIVE' ? 'platform.deactivateTitle' : 'platform.activateTitle',
      messageKey: status === 'SUSPENDED' ? 'platform.suspendBody' : status === 'INACTIVE' ? 'platform.deactivateBody' : 'platform.activateBody',
      confirmKey: status === 'SUSPENDED' ? 'platform.suspend' : status === 'INACTIVE' ? 'platform.deactivate' : 'platform.activate',
      danger: status !== 'ACTIVE',
    });
    if (!confirmed) {
      return;
    }
    try {
      this.tenant.set(await this.api.setStatus(record.id, status));
      this.toasts.success(this.i18n.translate('platform.statusUpdated'));
    } catch (error) {
      this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
    }
  }
}
