import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { ToastService } from '../../shared/ui/toast.service';
import { localizedLabel } from '../catalog/catalog.models';
import { AppointmentApi } from '../appointments/appointment.api';
import type { QueueEntryRecord, QueueStatus } from '../appointments/appointment.models';

@Component({
  selector: 'app-queue-board-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Select, DateField, LoadingState, ErrorState, EmptyState, CdkDropList, CdkDrag, NgTemplateOutlet],
  template: `
    <enzo-page-header [title]="'queue.title' | t" [description]="'queue.description' | t" [breadcrumbs]="breadcrumbs">
      @if (access.can('queue.create')) {
        <a enzoButton routerLink="/queue/walk-in">{{ 'queue.walkIn' | t }}</a>
      }
    </enzo-page-header>

    <form class="mb-4 grid gap-3 md:grid-cols-4" [formGroup]="filters" (ngSubmit)="load()">
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <enzo-select formControlName="barberEmployeeId" [label]="'appointments.barber' | t" [options]="barberOptions()" />
      <enzo-date-field formControlName="queueDate" [label]="'queue.date' | t" />
      <div class="flex items-end">
        <button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button>
      </div>
    </form>

    @if (error()) {
      <p class="mb-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <div class="grid gap-4 lg:grid-cols-3">
        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">{{ 'queue.waiting' | t }}</h2>
          <div class="grid min-h-24 gap-3" cdkDropList [cdkDropListDisabled]="!access.can('queue.reorder')" (cdkDropListDropped)="drop($event)">
            @for (entry of waiting(); track entry.id) {
              <article class="rounded-md border border-border bg-surface-elevated p-3" cdkDrag [cdkDragDisabled]="!access.can('queue.reorder')">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: entry }" />
                @if (access.can('queue.start-service')) {
                  <button class="mt-3" enzoButton size="sm" type="button" (click)="start(entry)">{{ 'queue.start' | t }}</button>
                }
              </article>
            } @empty {
              <enzo-empty-state [title]="'queue.emptyWaiting' | t" icon="queue" />
            }
          </div>
        </section>
        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">{{ 'queue.inService' | t }}</h2>
          <div class="grid gap-3">
            @for (entry of inService(); track entry.id) {
              <article class="rounded-md border border-border bg-surface-elevated p-3">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: entry }" />
                @if (access.can('queue.complete-service')) {
                  <button class="mt-3" enzoButton size="sm" type="button" (click)="complete(entry)">{{ 'queue.complete' | t }}</button>
                }
              </article>
            } @empty {
              <enzo-empty-state [title]="'queue.emptyService' | t" icon="scissors" />
            }
          </div>
        </section>
        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">{{ 'queue.completed' | t }}</h2>
          <div class="grid gap-3">
            @for (entry of completed(); track entry.id) {
              <article class="rounded-md border border-border bg-surface-elevated p-3">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: entry }" />
              </article>
            } @empty {
              <enzo-empty-state [title]="'queue.emptyCompleted' | t" icon="check" />
            }
          </div>
        </section>
      </div>
    }

    <ng-template #card let-entry>
      <p class="text-sm font-semibold text-text-primary">{{ entry.position }}. {{ party(entry) }}</p>
      <p class="text-xs text-text-secondary">{{ entry.appointmentNumber }} · {{ entry.barberName }}</p>
      <p class="mt-1 text-sm">{{ serviceText(entry) }}</p>
    </ng-template>
  `,
})
export class QueueBoardPage {
  private readonly api = inject(AppointmentApi);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly branches = inject(BranchContext);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.queue' }];
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly entries = signal<QueueEntryRecord[]>([]);
  readonly barbers = signal<Array<{ id: string; fullName: string }>>([]);
  readonly filters = this.formBuilder.nonNullable.group({
    branchId: this.branches.selectedId(),
    barberEmployeeId: '',
    queueDate: this.today(),
  });

  constructor() {
    if (this.filters.controls.branchId.value) {
      this.load();
    } else {
      this.loading.set(false);
      this.loadError.set(this.i18n.translate('queue.branchRequired'));
    }
  }

  protected waiting(): QueueEntryRecord[] {
    return this.filtered('WAITING');
  }

  protected inService(): QueueEntryRecord[] {
    return this.filtered('IN_SERVICE');
  }

  protected completed(): QueueEntryRecord[] {
    return this.filtered('COMPLETED');
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected barberOptions(): SelectOption[] {
    return [
      { value: '', label: this.i18n.translate('queue.allBarbers') },
      ...this.barbers().map((barber) => ({ value: barber.id, label: barber.fullName })),
    ];
  }

  protected party(entry: QueueEntryRecord): string {
    const companions = entry.companions ?? [];
    return companions.length > 0 ? `${entry.customerName}, ${companions.join(', ')}` : entry.customerName;
  }

  protected serviceText(entry: QueueEntryRecord): string {
    return entry.services.map((line) => `${localizedLabel(line.serviceName, this.i18n.language())} × ${line.quantity}`).join(', ');
  }

  protected drop(event: CdkDragDrop<QueueEntryRecord[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const items = [...this.waiting()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    const others = this.entries().filter((entry) => entry.status !== 'WAITING');
    this.entries.set([...items, ...others]);
    const filters = this.filters.getRawValue();
    this.api.reorder({ branchId: filters.branchId, queueDate: filters.queueDate, entryIds: items.map((entry) => entry.id) }).subscribe({
      next: (result) => this.entries.set(result.data),
      error: (error: unknown) => {
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('queue.reorderFailed'));
        this.load();
      },
    });
  }

  protected start(entry: QueueEntryRecord): void {
    this.api.startQueue(entry.id).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('queue.started'));
        this.load();
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle')),
    });
  }

  protected complete(entry: QueueEntryRecord): void {
    this.api.completeQueue(entry.id).subscribe({
      next: () => {
        this.toasts.success(this.i18n.translate('queue.completedToast'));
        this.load();
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle')),
    });
  }

  protected load(): void {
    const filters = this.filters.getRawValue();
    if (!filters.branchId || !filters.queueDate) {
      this.loadError.set(this.i18n.translate('queue.branchRequired'));
      this.loading.set(false);
      return;
    }
    this.branches.select(filters.branchId);
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.api.barbers(filters.branchId).subscribe({
      next: (result) => this.barbers.set(result.data),
      error: () => this.barbers.set([]),
    });
    this.api.queue({ branchId: filters.branchId, queueDate: filters.queueDate, barberEmployeeId: filters.barberEmployeeId }).subscribe({
      next: (result) => {
        this.entries.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
        this.loading.set(false);
      },
    });
  }

  private filtered(status: QueueStatus): QueueEntryRecord[] {
    return this.entries().filter((entry) => entry.status === status);
  }

  private today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
