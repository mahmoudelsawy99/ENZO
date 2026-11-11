import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type ServiceRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-service-detail-page',
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe, PageHeader, Card, Badge, Button, LoadingState, ErrorState, TextInput],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else if (service(); as item) {
      <enzo-page-header [title]="label(item.name)" [description]="label(item.description)" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="item.status === 'ACTIVE' ? 'success' : 'warning'">{{ 'status.' + item.status | t }}</enzo-badge>
        @if (access.can('services.update')) {
          <a enzoButton variant="secondary" [routerLink]="['/services', item.id, 'edit']">{{ 'services.edit' | t }}</a>
        }
      </enzo-page-header>
      <div class="grid gap-4 lg:grid-cols-2">
        <enzo-card [title]="'services.details' | t">
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'services.category' | t }}</dt><dd>{{ label(item.categoryName) }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'services.price' | t }}</dt><dd>{{ money(item.price) }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'services.commission' | t }}</dt><dd>{{ item.commissionType === 'PERCENTAGE' ? item.commissionValue + '%' : money(item.commissionValue) }}</dd></div>
          </dl>
        </enzo-card>
        @if (access.can('services.update')) {
          <enzo-card [title]="'services.cap' | t" [description]="'services.capHint' | t">
            <form class="grid gap-3" [formGroup]="capForm" (ngSubmit)="saveCap()">
              <enzo-text-input formControlName="maxCommissionPercent" type="number" [label]="'services.cap' | t" />
              <button enzoButton type="submit">{{ 'common.save' | t }}</button>
            </form>
          </enzo-card>
        }
      </div>
    }
  `,
})
export class ServiceDetailPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.services', link: '/services' },
    { labelKey: 'services.view' },
  ];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly service = signal<ServiceRecord | null>(null);
  readonly capForm = this.formBuilder.nonNullable.group({
    maxCommissionPercent: [100, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.service(id).subscribe({
      next: (result) => {
        this.service.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
    this.api.serviceSettings().subscribe({
      next: (result) => this.capForm.patchValue(result.data),
      error: () => undefined,
    });
  }

  protected label(value: ServiceRecord['name']): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected saveCap(): void {
    if (this.capForm.invalid) return;
    this.api.saveServiceSettings(Number(this.capForm.getRawValue().maxCommissionPercent)).subscribe({
      next: () => this.toasts.success(this.i18n.translate('services.capSaved')),
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
