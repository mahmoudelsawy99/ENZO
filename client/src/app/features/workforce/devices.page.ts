import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { OrganizationApi } from '../organization/organization.api';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { FingerprintDevice } from './workforce.models';

@Component({
  selector: 'app-devices-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.devices' | t" [description]="'work.devicesDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]">
      <a enzoButton variant="secondary" routerLink="/attendance/device-logs">{{ 'work.logs' | t }}</a>
    </enzo-page-header>
    <p class="mb-4 rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-text-secondary">{{ 'work.mockOnly' | t }}</p>
    @if (apiKey()) {
      <p class="mb-4 rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-sm">{{ 'work.apiKeyOnce' | t }} <span class="font-mono">{{ apiKey() }}</span></p>
    }
    @if (access.can('fingerprint-devices.manage')) {
      <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-4" [formGroup]="form" (ngSubmit)="register()">
        <enzo-text-input formControlName="name" [label]="'work.deviceName' | t" />
        <enzo-text-input formControlName="serialNumber" [label]="'work.serial' | t" />
        <enzo-text-input formControlName="provider" [label]="'work.provider' | t" />
        <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'work.register' | t }}</button></div>
      </form>
    }
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="clock" [title]="'work.emptyDevices' | t" [description]="'work.emptyDevicesBody' | t" /></div>
    } @else {
      <div class="grid gap-3">
        @for (device of rows(); track device.id) {
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-medium">{{ device.name }}</p>
                <p class="text-sm text-text-secondary">{{ device.serialNumber }} · {{ device.provider }} · {{ device.connectionStatus }}</p>
              </div>
              <enzo-badge [tone]="device.status === 'ENABLED' ? 'success' : 'neutral'">{{ device.status }}</enzo-badge>
            </div>
            <p class="mt-2 text-xs text-text-secondary">{{ 'work.lastSync' | t }}: {{ device.lastSyncAt || '—' }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              @if (access.can('fingerprint-devices.manage')) {
                <button enzoButton size="sm" variant="secondary" type="button" (click)="toggle(device)">{{ device.status === 'ENABLED' ? ('work.disable' | t) : ('work.enable' | t) }}</button>
              }
              @if (access.can('fingerprint-devices.sync')) {
                <button enzoButton size="sm" variant="ghost" type="button" (click)="sync(device)">{{ 'work.sync' | t }}</button>
              }
            </div>
            @if (access.can('fingerprint-devices.manage')) {
              <form class="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]" [formGroup]="mapForm" (ngSubmit)="map(device.id)">
                <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
                <enzo-text-input formControlName="externalEmployeeId" [label]="'work.externalId' | t" />
                <div class="flex items-end"><button enzoButton size="sm" type="submit">{{ 'work.map' | t }}</button></div>
              </form>
            }
          </article>
        }
      </div>
    }
  `,
})
export class DevicesPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly rows = signal<FingerprintDevice[]>([]);
  protected readonly employees = signal<SelectOption[]>([]);
  protected readonly apiKey = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    serialNumber: ['', Validators.required],
    provider: 'mock',
  });
  protected readonly mapForm = this.formBuilder.nonNullable.group({
    employeeId: ['', Validators.required],
    externalEmployeeId: ['', Validators.required],
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.employees.set(result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))),
    });
    this.load();
  }

  protected employeeOptions(): SelectOption[] {
    return this.employees();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.devices().subscribe({
      next: (result) => {
        this.rows.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected register(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
    if (!branchId) {
      this.toast.danger(this.i18n.translate('work.pickBranch'));
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api.registerDevice({ ...value, branchId, deviceType: 'fingerprint' }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.apiKey.set(result.data.apiKey);
        this.toast.success(this.i18n.translate('work.saved'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected toggle(device: FingerprintDevice): void {
    this.api.deviceStatus(device.id, device.status === 'ENABLED' ? 'DISABLED' : 'ENABLED').subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected sync(device: FingerprintDevice): void {
    this.api.syncDevice(device.id).subscribe({
      next: (result) => {
        this.toast.success(`${result.data.status} · ${result.data.eventCount}`);
        this.load();
      },
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected map(deviceId: string): void {
    if (this.mapForm.invalid) {
      this.mapForm.markAllAsTouched();
      return;
    }
    const value = this.mapForm.getRawValue();
    this.api.mapDevice(deviceId, value.employeeId, value.externalEmployeeId).subscribe({
      next: () => this.toast.success(this.i18n.translate('work.saved')),
      error: (error: unknown) => this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
