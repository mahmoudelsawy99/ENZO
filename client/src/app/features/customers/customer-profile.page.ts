import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { WhatsAppApi } from '../whatsapp/whatsapp.api';
import { localizedLabel, type CustomerNote, type CustomerPackageRecord, type CustomerRecord, type CustomerStats } from '../catalog/catalog.models';

type ProfileTab = 'overview' | 'visits' | 'services' | 'payments' | 'packages' | 'notes';

@Component({
  selector: 'app-customer-profile-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, Badge, Button, KpiCard, TextInput, LoadingState, ErrorState, EmptyState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else if (customer(); as person) {
      <enzo-page-header [title]="person.fullName" [description]="person.customerNumber" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="person.status === 'ACTIVE' ? 'success' : 'warning'">{{ 'status.' + person.status | t }}</enzo-badge>
        @if (access.can('customers.update')) {
          <a enzoButton variant="secondary" [routerLink]="['/customers', person.id, 'edit']">{{ 'customers.edit' | t }}</a>
        }
      </enzo-page-header>
      <div class="mb-4 flex gap-2 overflow-x-auto" role="tablist">
        @for (tab of tabs; track tab) {
          <button enzoButton type="button" [variant]="active() === tab ? 'primary' : 'secondary'" (click)="select(tab)">{{ ('customers.' + tabLabel(tab)) | t }}</button>
        }
      </div>
      @if (active() === 'overview' && stats(); as summary) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <enzo-kpi-card [label]="'customers.totalVisits' | t" [value]="text(summary.totalVisits)" />
          <enzo-kpi-card [label]="'customers.totalPaid' | t" [value]="money(summary.totalPaid ?? summary.totalSpending)" />
          <enzo-kpi-card [label]="'customers.totalRefunds' | t" [value]="money(summary.totalRefunds ?? 0)" />
          <enzo-kpi-card [label]="'customers.netSpending' | t" [value]="money(summary.netSpending ?? summary.totalSpending)" />
          <enzo-kpi-card [label]="'customers.outstanding' | t" [value]="money(summary.outstandingAmount ?? 0)" />
          <enzo-kpi-card [label]="'customers.activePackages' | t" [value]="text(summary.activePackages)" />
          <enzo-kpi-card [label]="'customers.firstVisit' | t" [value]="summary.firstVisit ? date(summary.firstVisit) : ('customers.noneYet' | t)" />
          <enzo-kpi-card [label]="'customers.lastVisit' | t" [value]="summary.lastVisit ? date(summary.lastVisit) : ('customers.noneYet' | t)" />
        </div>
        <enzo-card class="mt-4" [title]="'customers.mostUsed' | t">
          @if (summary.mostUsedServices.length === 0) {
            <p class="text-sm text-text-secondary">{{ 'customers.noneYet' | t }}</p>
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (service of summary.mostUsedServices; track service.serviceId) {
                <li class="flex justify-between gap-3"><span>{{ label(service.name) }}</span><span>{{ text(service.count) }}</span></li>
              }
            </ul>
          }
        </enzo-card>
        @if (person.notes) {
          <enzo-card class="mt-4" [title]="'customers.profileNotes' | t"><p class="text-sm">{{ person.notes }}</p></enzo-card>
        }
        @if (access.can('customers.update') || access.can('notifications.settings.manage')) {
          <enzo-card class="mt-4" [title]="'whatsappCenter.customerPreference' | t">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="person.promotionalOptIn" (change)="savePreference(person, 'promotionalOptIn', checked($event))" />
              {{ 'whatsappCenter.promotionalOptIn' | t }}
            </label>
            <label class="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="person.whatsappOptOut" (change)="savePreference(person, 'whatsappOptOut', checked($event))" />
              {{ 'whatsappCenter.optOut' | t }}
            </label>
            <p class="mt-2 text-sm text-text-secondary">{{ 'whatsappCenter.optOutWins' | t }}</p>
          </enzo-card>
        }
      }
      @if (active() === 'visits') {
        @if (visitRows().length === 0) {
          <div class="rounded-lg border border-border bg-surface">
            <enzo-empty-state [title]="'customers.noVisits' | t" [description]="'customers.noVisitsBody' | t" icon="calendar" />
          </div>
        } @else {
          <ul class="grid gap-2 text-sm">
            @for (row of visitRows(); track $index) {
              <li class="rounded-lg border border-border bg-surface px-4 py-3">{{ rowText(row) }}</li>
            }
          </ul>
        }
      }
      @if (active() === 'services') {
        @if (serviceRows().length === 0) {
          <div class="rounded-lg border border-border bg-surface">
            <enzo-empty-state [title]="'customers.noServices' | t" [description]="'customers.noServicesBody' | t" icon="scissors" />
          </div>
        } @else {
          <ul class="grid gap-2 text-sm">
            @for (row of serviceRows(); track $index) {
              <li class="rounded-lg border border-border bg-surface px-4 py-3">{{ rowText(row) }}</li>
            }
          </ul>
        }
      }
      @if (active() === 'payments') {
        @if (paymentRows().length === 0) {
          <div class="rounded-lg border border-border bg-surface">
            <enzo-empty-state [title]="'customers.noPayments' | t" [description]="'customers.noPaymentsBody' | t" icon="receipt" />
          </div>
        } @else {
          <ul class="grid gap-2 text-sm">
            @for (row of paymentRows(); track $index) {
              <li class="rounded-lg border border-border bg-surface px-4 py-3">{{ rowText(row) }}</li>
            }
          </ul>
        }
      }
      @if (active() === 'packages') {
        @if (packages().length === 0) {
          <div class="rounded-lg border border-border bg-surface">
            <enzo-empty-state [title]="'customers.noPackages' | t" [description]="'customers.noPackagesBody' | t" icon="package" />
          </div>
        } @else {
          <div class="grid gap-4">
            @for (pack of packages(); track pack.id) {
              <enzo-card [title]="label(pack.name)">
                <p class="mb-3 text-sm text-text-secondary">{{ 'status.' + pack.status | t }} · {{ pack.expiresAt ? (('packages.expires' | t) + ' ' + date(pack.expiresAt)) : ('packages.noExpiryValue' | t) }}</p>
                <ul class="grid gap-2 text-sm">
                  @for (item of pack.items; track item.serviceId) {
                    <li class="flex justify-between gap-3">
                      <span>{{ label(item.serviceName) }}</span>
                      <span>{{ 'packages.remaining' | t }} {{ item.remainingQuantity }} / {{ item.purchasedQuantity }}</span>
                    </li>
                  }
                </ul>
              </enzo-card>
            }
          </div>
        }
      }
      @if (active() === 'notes') {
        @if (access.can('customers.notes.create')) {
          <form class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end" [formGroup]="noteForm" (ngSubmit)="addNote()">
            <div class="min-w-0 flex-1">
              <enzo-text-input formControlName="content" [label]="'customers.addNote' | t" [placeholder]="'customers.notePlaceholder' | t" />
            </div>
            <button enzoButton type="submit">{{ 'customers.addNote' | t }}</button>
          </form>
        }
        @if (notes().length === 0) {
          <div class="rounded-lg border border-border bg-surface">
            <enzo-empty-state [title]="'customers.noNotes' | t" [description]="'customers.notePlaceholder' | t" icon="receipt" />
          </div>
        } @else {
          <ol class="grid gap-3">
            @for (note of notes(); track note.id) {
              <li class="rounded-lg border border-border bg-surface p-4">
                <p class="text-sm text-text-primary">{{ note.content }}</p>
                <p class="mt-2 text-xs text-text-secondary">{{ note.createdByName }} · {{ date(note.createdAt) }}</p>
              </li>
            }
          </ol>
        }
      }
    }
  `,
})
export class CustomerProfilePage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly whatsapp = inject(WhatsAppApi);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.customers', link: '/customers' },
    { labelKey: 'customers.view' },
  ];
  readonly tabs: ProfileTab[] = ['overview', 'visits', 'services', 'payments', 'packages', 'notes'];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly active = signal<ProfileTab>('overview');
  readonly customer = signal<CustomerRecord | null>(null);
  readonly stats = signal<CustomerStats | null>(null);
  readonly notes = signal<CustomerNote[]>([]);
  readonly packages = signal<CustomerPackageRecord[]>([]);
  readonly visitRows = signal<unknown[]>([]);
  readonly serviceRows = signal<unknown[]>([]);
  readonly paymentRows = signal<unknown[]>([]);
  readonly noteForm = this.formBuilder.nonNullable.group({ content: ['', [Validators.required, Validators.maxLength(1000)]] });
  private readonly customerId = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    this.api.customer(this.customerId).subscribe({
      next: (result) => {
        this.customer.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
    this.api.stats(this.customerId).subscribe({
      next: (result) => this.stats.set(result.data),
      error: () => this.stats.set({ totalVisits: 0, totalSpending: 0, lastVisit: null, firstVisit: null, mostUsedServices: [], activePackages: 0 }),
    });
  }

  protected tabLabel(tab: ProfileTab): string {
    if (tab === 'services') return 'serviceHistory';
    if (tab === 'packages') return 'packages';
    return tab;
  }

  protected select(tab: ProfileTab): void {
    this.active.set(tab);
    if (tab === 'notes' && this.notes().length === 0) {
      this.api.notes(this.customerId).subscribe({ next: (result) => this.notes.set(result.data), error: () => this.notes.set([]) });
    }
    if (tab === 'packages' && this.packages().length === 0) {
      this.api.customerPackages(this.customerId).subscribe({ next: (result) => this.packages.set(result.data), error: () => this.packages.set([]) });
    }
    if (tab === 'visits') {
      this.api.visits(this.customerId).subscribe({ next: (result) => this.visitRows.set(result.data), error: () => this.visitRows.set([]) });
    }
    if (tab === 'services') {
      this.api.serviceHistory(this.customerId).subscribe({ next: (result) => this.serviceRows.set(result.data), error: () => this.serviceRows.set([]) });
    }
    if (tab === 'payments') {
      this.api.payments(this.customerId).subscribe({ next: (result) => this.paymentRows.set(result.data), error: () => this.paymentRows.set([]) });
    }
  }

  protected rowText(row: unknown): string {
    if (!row || typeof row !== 'object') {
      return '';
    }
    const record = row as Record<string, unknown>;
    const name = record['name'];
    if (name && typeof name === 'object' && 'en' in name) {
      return localizedLabel(name as { en: string; ar: string }, this.i18n.language());
    }
    const title = record['title'] ?? record['serviceName'] ?? record['amount'];
    const when = record['visitedAt'] ?? record['createdAt'] ?? record['paidAt'];
    return [title, when].filter((part) => part !== undefined && part !== null).map(String).join(' · ');
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected date(value: string): string {
    return this.i18n.formatDate(value);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected savePreference(person: CustomerRecord, field: 'promotionalOptIn' | 'whatsappOptOut', value: boolean): void {
    const promotionalOptIn = field === 'whatsappOptOut' && value ? false : field === 'promotionalOptIn' ? value : person.promotionalOptIn === true;
    const whatsappOptOut = field === 'whatsappOptOut' ? value : person.whatsappOptOut === true;
    this.whatsapp.preferences(person.id, { promotionalOptIn, whatsappOptOut }).subscribe({
      next: (result) => {
        this.customer.set({ ...person, ...result.data });
        this.toasts.success(this.i18n.translate('whatsappCenter.saved'));
      },
      error: (error: unknown) => this.toasts.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected addNote(): void {
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    this.api.addNote(this.customerId, this.noteForm.getRawValue().content).subscribe({
      next: (result) => {
        this.notes.set([result.data, ...this.notes()]);
        this.noteForm.reset({ content: '' });
        this.toasts.success(this.i18n.translate('customers.noteSaved'));
      },
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }
}
