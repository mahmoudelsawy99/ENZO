import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { PurchaseRow } from './inventory.models';

@Component({
  selector: 'app-supplier-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="(creating() ? 'stock.addSupplier' : 'stock.supplier') | t" [description]="'stock.suppliersDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.suppliers', link: '/suppliers' }]">
      <a enzoButton variant="secondary" routerLink="/suppliers">{{ 'stock.suppliers' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      @if (!creating()) {
        <p class="mb-4 text-sm text-text-secondary">{{ 'stock.outstanding' | t }}: {{ money(outstanding()) }}</p>
      }
      @if (access.can('suppliers.manage')) {
        <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2" [formGroup]="form" (ngSubmit)="save()">
          <enzo-text-input formControlName="name" [label]="'stock.supplier' | t" />
          <enzo-text-input formControlName="phone" [label]="'stock.phone' | t" />
          <enzo-text-input formControlName="email" type="email" [label]="'stock.email' | t" />
          <enzo-text-input formControlName="taxNumber" [label]="'stock.taxNumber' | t" />
          <enzo-text-input formControlName="address" [label]="'stock.address' | t" />
          <enzo-select formControlName="status" [label]="'branches.status' | t" [options]="statusOptions()" />
          <enzo-text-input formControlName="notes" [label]="'stock.notes' | t" />
          @if (error()) { <p class="text-sm text-danger md:col-span-2">{{ error() }}</p> }
          <div><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
        </form>
      }
      @if (!creating()) {
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'stock.purchases' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.purchaseNumber' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.total' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.remaining' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.paymentStatus' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of purchases(); track row.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3"><a class="text-text-primary underline" [routerLink]="['/purchases', row.id]">{{ row.purchaseNumber }}</a></td>
                  <td class="px-4 py-3">{{ money(row.totalAmount) }}</td>
                  <td class="px-4 py-3">{{ money(row.remainingAmount) }}</td>
                  <td class="px-4 py-3">{{ 'stock.payStatus.' + row.paymentStatus | t }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class SupplierDetailPage {
  private readonly api = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  protected readonly creating = signal(!this.route.snapshot.paramMap.get('id'));
  protected readonly loading = signal(!this.creating());
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly loadError = signal('');
  protected readonly outstanding = signal(0);
  protected readonly purchases = signal<PurchaseRow[]>([]);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    phone: [''],
    email: [''],
    address: [''],
    taxNumber: [''],
    notes: [''],
    status: ['ACTIVE', Validators.required],
  });

  constructor() {
    if (!this.creating()) {
      this.load();
    }
  }

  protected statusOptions(): SelectOption[] {
    return [
      { value: 'ACTIVE', label: this.i18n.translate('status.ACTIVE') },
      { value: 'INACTIVE', label: this.i18n.translate('status.INACTIVE') },
    ];
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.supplier(id).subscribe({
      next: (result) => {
        const current = result.data;
        this.form.patchValue({
          name: current.name,
          phone: current.phone,
          email: current.email,
          address: current.address,
          taxNumber: current.taxNumber,
          notes: current.notes,
          status: current.status,
        });
        this.outstanding.set(current.outstanding ?? 0);
        this.purchases.set(current.purchases ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const id = this.creating() ? undefined : this.route.snapshot.paramMap.get('id') ?? undefined;
    this.saving.set(true);
    this.api.saveSupplier(this.form.getRawValue(), id).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        void this.router.navigate(['/suppliers', result.data.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
