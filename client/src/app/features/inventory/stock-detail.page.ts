import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductRecord, StockMovementRow } from './inventory.models';

@Component({
  selector: 'app-stock-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, Badge, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'stock.history' | t" [description]="'stock.historyDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.inventoryTitle', link: '/inventory' }]">
      <a enzoButton variant="secondary" routerLink="/inventory">{{ 'stock.inventoryTitle' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error() && !product()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (product(); as current) {
      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <enzo-card [title]="'stock.onHand' | t"><p class="text-2xl font-medium">{{ text(quantity()) }}</p></enzo-card>
        <enzo-card [title]="'stock.averageCost' | t"><p class="text-2xl font-medium">{{ money(average()) }}</p></enzo-card>
        <enzo-card [title]="'stock.minimum' | t"><p class="text-2xl font-medium">{{ text(minimum()) }}</p></enzo-card>
      </div>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <p class="text-sm text-text-secondary">{{ label(current.name) }} · {{ current.sku }}</p>
        <enzo-badge [tone]="stockTone()">{{ stockStatusKey() | t }}</enzo-badge>
      </div>
      @if (access.can('inventory.manage')) {
        <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[12rem_auto]" [formGroup]="minimumForm" (ngSubmit)="saveMinimum()">
          <enzo-text-input formControlName="minimumStock" type="number" [label]="'stock.branchMinimum' | t" />
          <div class="flex items-end"><button enzoButton type="submit" [loading]="savingMinimum()">{{ 'common.save' | t }}</button></div>
        </form>
      }
      @if (access.can('inventory.adjust')) {
        <form class="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[12rem_10rem_1fr_auto]" [formGroup]="form" (ngSubmit)="adjust()">
          <enzo-select formControlName="direction" [label]="'stock.direction' | t" [options]="directions()" />
          <enzo-text-input formControlName="quantity" type="number" [label]="'stock.quantity' | t" />
          <enzo-text-input formControlName="notes" [label]="'stock.notes' | t" />
          <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'stock.adjust' | t }}</button></div>
        </form>
      }
      @if (error()) { <p class="mb-3 text-sm text-danger">{{ error() }}</p> }
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'stock.history' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.movement' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.quantity' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.unitCost' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.when' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of movements(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ 'stock.movements.' + row.movementType | t }}</td>
                <td class="px-4 py-3">{{ text(row.quantity) }}</td>
                <td class="px-4 py-3">{{ money(row.unitCost) }}</td>
                <td class="px-4 py-3">{{ row.createdAt }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class StockDetailPage {
  private readonly api = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  protected readonly product = signal<ProductRecord | null>(null);
  protected readonly movements = signal<StockMovementRow[]>([]);
  protected readonly quantity = signal(0);
  protected readonly average = signal(0);
  protected readonly minimum = signal(0);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly savingMinimum = signal(false);
  protected readonly error = signal('');
  protected readonly minimumForm = this.formBuilder.nonNullable.group({
    minimumStock: ['0', [Validators.required, Validators.min(0)]],
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    direction: ['IN', Validators.required],
    quantity: ['1', Validators.required],
    notes: ['', Validators.required],
  });

  constructor() {
    this.load();
  }

  protected directions(): SelectOption[] {
    return [
      { value: 'IN', label: this.i18n.translate('stock.directionIn') },
      { value: 'OUT', label: this.i18n.translate('stock.directionOut') },
    ];
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

  protected stockStatusKey(): string {
    if (this.quantity() <= 0) {
      return 'stock.out';
    }
    return this.quantity() <= this.minimum() ? 'stock.low' : 'stock.inStock';
  }

  protected stockTone(): 'success' | 'warning' | 'danger' {
    if (this.quantity() <= 0) {
      return 'danger';
    }
    return this.quantity() <= this.minimum() ? 'warning' : 'success';
  }

  protected load(): void {
    const productId = this.route.snapshot.paramMap.get('productId') ?? '';
    const branchId = this.route.snapshot.queryParamMap.get('branchId') ?? '';
    this.api.stockDetail(productId, branchId).subscribe({
      next: (result) => {
        this.product.set(result.data.product);
        this.movements.set(result.data.movements);
        this.quantity.set(result.data.stock.quantityOnHand);
        this.average.set(result.data.stock.averageCost);
        this.minimum.set(result.data.stock.minimumStock);
        this.minimumForm.controls.minimumStock.setValue(String(result.data.stock.minimumStock));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected saveMinimum(): void {
    const productId = this.route.snapshot.paramMap.get('productId') ?? '';
    const branchId = this.route.snapshot.queryParamMap.get('branchId') ?? '';
    const minimumStock = Number(this.minimumForm.controls.minimumStock.value);
    if (!Number.isInteger(minimumStock) || minimumStock < 0) {
      this.error.set(this.i18n.translate('stock.minimumInvalid'));
      return;
    }
    this.savingMinimum.set(true);
    this.error.set('');
    this.api.setMinimum({ branchId, productId, minimumStock }).subscribe({
      next: () => {
        this.savingMinimum.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        this.loading.set(true);
        this.load();
      },
      error: (error: unknown) => {
        this.savingMinimum.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected adjust(): void {
    const productId = this.route.snapshot.paramMap.get('productId') ?? '';
    const branchId = this.route.snapshot.queryParamMap.get('branchId') ?? '';
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.api.adjust({ branchId, productId, direction: raw.direction, quantity: Number(raw.quantity), notes: raw.notes }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        this.loading.set(true);
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
