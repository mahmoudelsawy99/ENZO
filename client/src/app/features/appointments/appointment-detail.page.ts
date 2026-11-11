import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { localizedLabel } from '../catalog/catalog.models';
import { AppointmentApi } from './appointment.api';
import type { AppointmentHistoryRecord, AppointmentRecord, AppointmentStatus } from './appointment.models';

@Component({
  selector: 'app-appointment-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, Badge, Button, TextInput, LoadingState, ErrorState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (item(); as appointment) {
      <enzo-page-header [title]="appointment.appointmentNumber" [description]="appointment.customerName" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="tone(appointment.status)">{{ 'status.' + appointment.status | t }}</enzo-badge>
        @if (canEdit(appointment.status) && access.can('appointments.update')) {
          <a enzoButton variant="secondary" [routerLink]="['/appointments', appointment.id, 'edit']">{{ 'appointments.edit' | t }}</a>
        }
      </enzo-page-header>

      <div class="mb-4 flex flex-wrap gap-2">
        @if (appointment.status === 'PENDING' && access.can('appointments.confirm')) {
          <button enzoButton type="button" (click)="act('confirm')">{{ 'appointments.confirm' | t }}</button>
        }
        @if (appointment.status === 'CONFIRMED' && access.can('appointments.check-in')) {
          <button enzoButton type="button" (click)="act('check-in')">{{ 'appointments.checkIn' | t }}</button>
        }
        @if (appointment.status === 'CHECKED_IN' && access.can('queue.create')) {
          <button enzoButton type="button" (click)="act('queue')">{{ 'appointments.joinQueue' | t }}</button>
        }
        @if (appointment.status === 'WAITING' && access.can('queue.start-service')) {
          <button enzoButton type="button" (click)="act('start')">{{ 'queue.start' | t }}</button>
        }
        @if (appointment.status === 'IN_SERVICE' && access.can('queue.complete-service')) {
          <button enzoButton type="button" (click)="act('complete')">{{ 'queue.complete' | t }}</button>
        }
        @if (canCancel(appointment.status) && access.can('appointments.cancel')) {
          <button enzoButton type="button" variant="danger" (click)="reasonMode.set('cancel')">{{ 'appointments.cancel' | t }}</button>
        }
        @if (appointment.status === 'CONFIRMED' && access.can('appointments.mark-no-show')) {
          <button enzoButton type="button" variant="secondary" (click)="reasonMode.set('no-show')">{{ 'appointments.noShow' | t }}</button>
        }
      </div>

      @if (reasonMode()) {
        <form class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" [formGroup]="reasonForm" (ngSubmit)="submitReason()">
          <enzo-text-input formControlName="reason" [label]="'appointments.reason' | t" [required]="true" />
          <div class="flex items-end gap-2">
            <button enzoButton type="submit">{{ 'common.save' | t }}</button>
            <button enzoButton type="button" variant="secondary" (click)="reasonMode.set('')">{{ 'common.cancel' | t }}</button>
          </div>
        </form>
      }
      @if (actionError()) {
        <p class="mb-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ actionError() }}</p>
      }

      <div class="grid gap-4 lg:grid-cols-2">
        <enzo-card [title]="'appointments.details' | t">
          <dl class="grid gap-3 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.customer' | t }}</dt><dd>{{ appointment.customerName }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.barber' | t }}</dt><dd>{{ appointment.barberName }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.type' | t }}</dt><dd>{{ 'appointments.types.' + appointment.type | t }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.when' | t }}</dt><dd>{{ when(appointment.scheduledAt) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.subtotal' | t }}</dt><dd>{{ money(appointment.subtotal) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.discount' | t }}</dt><dd>{{ money(appointment.discount) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-text-secondary">{{ 'appointments.total' | t }}</dt><dd>{{ money(appointment.total) }}</dd></div>
            @if (appointment.notes) {
              <div><dt class="text-text-secondary">{{ 'appointments.notes' | t }}</dt><dd class="mt-1">{{ appointment.notes }}</dd></div>
            }
            @if (appointment.cancellationReason) {
              <div><dt class="text-text-secondary">{{ 'appointments.reason' | t }}</dt><dd class="mt-1">{{ appointment.cancellationReason }}</dd></div>
            }
          </dl>
        </enzo-card>
        <enzo-card [title]="'appointments.services' | t">
          <ul class="grid gap-2">
            @for (line of appointment.services; track line.serviceId) {
              <li class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span>{{ label(line.serviceName) }} × {{ line.quantity }}</span>
                <span>{{ money(line.lineTotal) }}</span>
              </li>
            }
          </ul>
          <p class="mt-3 text-xs text-text-secondary">{{ 'appointments.snapshotHint' | t }}</p>
        </enzo-card>
      </div>

      <div class="mt-4">
        <enzo-card [title]="'appointments.history' | t">
          @if (history().length === 0) {
            <p class="text-sm text-text-secondary">{{ 'appointments.historyEmpty' | t }}</p>
          } @else {
            <ol class="grid gap-3">
              @for (row of history(); track row.id) {
                <li class="rounded-md border border-border px-3 py-2 text-sm">
                  <p class="font-medium text-text-primary">{{ statusLabel(row.previousStatus) }} → {{ 'status.' + row.newStatus | t }}</p>
                  <p class="text-text-secondary">{{ row.reason }}</p>
                  <p class="text-xs text-text-secondary">{{ when(row.createdAt) }} · {{ row.changedByName }}</p>
                </li>
              }
            </ol>
          }
        </enzo-card>
      </div>
    }
  `,
})
export class AppointmentDetailPage {
  private readonly api = inject(AppointmentApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.appointments', link: '/appointments' },
    { labelKey: 'appointments.view' },
  ];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly item = signal<AppointmentRecord | null>(null);
  readonly history = signal<AppointmentHistoryRecord[]>([]);
  readonly reasonMode = signal<'' | 'cancel' | 'no-show'>('');
  readonly reasonForm = this.formBuilder.nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(2)]] });

  constructor() {
    this.load();
  }

  protected tone(status: AppointmentStatus): BadgeTone {
    if (status === 'COMPLETED') return 'success';
    if (status === 'CANCELLED' || status === 'NO_SHOW') return 'danger';
    if (status === 'IN_SERVICE' || status === 'WAITING') return 'warning';
    if (status === 'CONFIRMED' || status === 'CHECKED_IN') return 'info';
    return 'neutral';
  }

  protected canEdit(status: AppointmentStatus): boolean {
    return status === 'PENDING' || status === 'CONFIRMED';
  }

  protected canCancel(status: AppointmentStatus): boolean {
    return status === 'PENDING' || status === 'CONFIRMED' || status === 'CHECKED_IN' || status === 'WAITING';
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected when(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(this.i18n.language() === 'ar' ? 'ar' : 'en');
  }

  protected statusLabel(status: string): string {
    return status ? this.i18n.translate(`status.${status}`) : this.i18n.translate('appointments.created');
  }

  protected act(action: 'confirm' | 'check-in' | 'queue' | 'start' | 'complete'): void {
    const current = this.item();
    if (!current) {
      return;
    }
    this.actionError.set('');
    this.api.act(current.id, action).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('appointments.updated'));
        this.load();
      },
      error: (error: unknown) => this.actionError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle')),
    });
  }

  protected submitReason(): void {
    const current = this.item();
    const mode = this.reasonMode();
    if (!current || !mode || this.reasonForm.invalid) {
      this.reasonForm.markAllAsTouched();
      return;
    }
    this.api.act(current.id, mode, this.reasonForm.controls.reason.value.trim()).subscribe({
      next: () => {
        this.reasonMode.set('');
        this.reasonForm.reset({ reason: '' });
        this.toasts.success(this.i18n.translate('appointments.updated'));
        this.load();
      },
      error: (error: unknown) => this.actionError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle')),
    });
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set(this.i18n.translate('common.errorTitle'));
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (result) => {
        this.item.set(result.data);
        this.loading.set(false);
        this.api.history(id).subscribe({ next: (history) => this.history.set(history.data), error: () => this.history.set([]) });
      },
      error: (error: unknown) => {
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
        this.loading.set(false);
      },
    });
  }
}
