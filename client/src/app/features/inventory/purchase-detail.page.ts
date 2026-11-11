import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { DialogService } from '../../shared/ui/dialog';
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
import type { PurchaseDetail } from './inventory.models';

const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];
type ReturnLine = FormGroup<{ productId: FormControl<string>; label: FormControl<string>; returnable: FormControl<number>; quantity: FormControl<string> }>;

@Component({
  selector: 'app-purchase-detail-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, Badge, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'stock.purchase' | t" [description]="'stock.purchasesDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.purchases', link: '/purchases' }]">
      <a enzoButton variant="secondary" routerLink="/purchases">{{ 'stock.purchases' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error() && !purchase()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (purchase(); as current) {
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <p class="text-lg font-medium">{{ current.purchaseNumber }} · {{ current.supplierName }}</p>
        <enzo-badge [tone]="current.receiveStatus === 'RECEIVED' ? 'success' : 'warning'">{{ 'stock.receiveStatus.' + current.receiveStatus | t }}</enzo-badge>
        <enzo-badge tone="info">{{ 'stock.payStatus.' + current.paymentStatus | t }}</enzo-badge>
      </div>
      <enzo-card [title]="'stock.items' | t">
        <ul class="grid gap-2 text-sm">
          @for (item of current.items; track item.productId) {
            <li class="flex justify-between gap-3">
              <span>{{ label(item.productName) }} × {{ text(item.quantity) }} · {{ 'stock.returned' | t }} {{ text(item.returnedQuantity) }}</span>
              <span>{{ money(item.totalCost) }}</span>
            </li>
          }
        </ul>
        <p class="mt-3 text-sm">{{ 'stock.total' | t }} {{ money(current.totalAmount) }} · {{ 'stock.remaining' | t }} {{ money(current.remainingAmount) }}</p>
      </enzo-card>
      <div class="mt-4 flex flex-wrap gap-2">
        @if (access.can('purchases.receive') && current.receiveStatus !== 'RECEIVED') {
          <button enzoButton type="button" [loading]="saving()" (click)="receive()">{{ 'stock.receive' | t }}</button>
        }
      </div>
      @if (access.can('purchases.pay') && current.remainingAmount > 0) {
        <form class="mt-4 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[12rem_10rem_1fr_auto]" [formGroup]="form" (ngSubmit)="pay()">
          <enzo-select formControlName="method" [label]="'finance.method' | t" [options]="methodOptions()" />
          <enzo-text-input formControlName="amount" type="number" [label]="'stock.amount' | t" />
          <enzo-text-input formControlName="referenceNumber" [label]="'finance.reference' | t" />
          <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'stock.pay' | t }}</button></div>
        </form>
      }
      @if (canReturn()) {
        <form class="mt-4 grid gap-3 rounded-lg border border-border bg-surface p-4" [formGroup]="returnForm" (ngSubmit)="submitReturn()">
          <h2 class="text-sm font-medium">{{ 'stock.returnTitle' | t }}</h2>
          <enzo-text-input formControlName="reason" [label]="'stock.returnReason' | t" />
          <div class="grid gap-3" formArrayName="lines">
            @for (line of returnLines.controls; track line.controls.productId.value) {
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem]" [formGroup]="line">
                <p class="self-end text-sm">{{ line.controls.label.value }} · {{ 'stock.returnable' | t }} {{ text(line.controls.returnable.value) }}</p>
                <enzo-text-input formControlName="quantity" type="number" [label]="'stock.returnQuantity' | t" />
              </div>
            }
          </div>
          <div><button enzoButton type="submit" [loading]="returning()">{{ 'stock.returnSubmit' | t }}</button></div>
        </form>
      }
      @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      <h2 class="mb-2 mt-6 text-sm font-medium">{{ 'stock.returnHistory' | t }}</h2>
      @if (current.returns.length === 0) {
        <p class="text-sm text-text-secondary">{{ 'stock.noReturns' | t }}</p>
      } @else {
        <ul class="grid gap-2 text-sm">
          @for (row of current.returns; track row.id) {
            <li class="flex justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <span>{{ returnName(current, row.productId) }} × {{ text(row.quantity) }} · {{ row.reason }}</span>
              <span>{{ row.createdAt }}</span>
            </li>
          }
        </ul>
      }
      <h2 class="mb-2 mt-6 text-sm font-medium">{{ 'stock.paymentHistory' | t }}</h2>
      @if (current.payments.length === 0) {
        <p class="text-sm text-text-secondary">{{ 'stock.noPayments' | t }}</p>
      } @else {
        <ul class="grid gap-2 text-sm">
          @for (payment of current.payments; track payment.id) {
            <li class="flex justify-between rounded-lg border border-border bg-surface px-4 py-3"><span>{{ payment.method }} · {{ payment.paidAt }}</span><span>{{ money(payment.amount) }}</span></li>
          }
        </ul>
      }
    }
  `,
})
export class PurchaseDetailPage {
  private readonly api = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly access = inject(TenantAccess);
  protected readonly purchase = signal<PurchaseDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly returning = signal(false);
  protected readonly error = signal('');
  protected readonly returnForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(2)]],
    lines: this.formBuilder.array<ReturnLine>([]),
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    method: ['CASH', Validators.required],
    amount: ['0', Validators.required],
    referenceNumber: [''],
  });

  constructor() {
    this.load();
  }

  protected methodOptions(): SelectOption[] {
    return METHODS.map((method) => ({ value: method, label: this.i18n.translate(`finance.methods.${method}`) }));
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected get returnLines(): FormArray<ReturnLine> {
    return this.returnForm.controls.lines;
  }

  protected canReturn(): boolean {
    const current = this.purchase();
    return Boolean(current && current.receiveStatus === 'RECEIVED' && this.access.can('purchases.receive') && current.items.some((item) => item.returnedQuantity < item.quantity));
  }

  protected returnName(current: PurchaseDetail, productId: string): string {
    const item = current.items.find((row) => row.productId === productId);
    return item ? this.label(item.productName) : productId;
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected load(): void {
    this.api.purchase(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: (result) => {
        this.purchase.set(result.data);
        this.form.controls.amount.setValue(String(result.data.remainingAmount));
        this.fillReturnLines(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected receive(): void {
    this.saving.set(true);
    this.api.receivePurchase(this.purchase()?.id ?? '').subscribe({
      next: (result) => {
        this.purchase.set(result.data);
        this.fillReturnLines(result.data);
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected async submitReturn(): Promise<void> {
    const current = this.purchase();
    const reason = this.returnForm.controls.reason.value.trim();
    if (!current || reason.length < 2) {
      this.returnForm.controls.reason.markAsTouched();
      this.error.set(this.i18n.translate('stock.returnReasonRequired'));
      return;
    }
    const items = [];
    for (const line of this.returnLines.controls) {
      const raw = line.getRawValue();
      const quantity = Number(raw.quantity);
      if (!raw.quantity || quantity === 0) {
        continue;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > raw.returnable) {
        this.error.set(this.i18n.translate('stock.returnQuantityInvalid'));
        return;
      }
      items.push({ productId: raw.productId, quantity });
    }
    if (items.length === 0) {
      this.error.set(this.i18n.translate('stock.returnQuantityInvalid'));
      return;
    }
    const confirmed = await this.dialogs.confirm({
      titleKey: 'stock.returnConfirmTitle',
      messageKey: 'stock.returnConfirm',
      confirmKey: 'stock.returnSubmit',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.returning.set(true);
    this.error.set('');
    this.api.returnPurchase(current.id, { reason, items }).subscribe({
      next: (result) => {
        this.purchase.set(result.data);
        this.form.controls.amount.setValue(String(result.data.remainingAmount));
        this.returnForm.controls.reason.reset('');
        this.fillReturnLines(result.data);
        this.returning.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
      },
      error: (error: unknown) => {
        this.returning.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected pay(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api.payPurchase(this.purchase()?.id ?? '', { method: raw.method, amount: Number(raw.amount), referenceNumber: raw.referenceNumber }).subscribe({
      next: (result) => {
        this.purchase.set(result.data);
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private fillReturnLines(current: PurchaseDetail): void {
    const grouped = new Map<string, { label: string; quantity: number; returnedQuantity: number }>();
    for (const item of current.items) {
      const existing = grouped.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        grouped.set(item.productId, { label: this.label(item.productName), quantity: item.quantity, returnedQuantity: item.returnedQuantity });
      }
    }
    this.returnLines.clear();
    for (const [productId, item] of grouped) {
      const returnable = Math.max(item.quantity - item.returnedQuantity, 0);
      if (returnable < 1) {
        continue;
      }
      this.returnLines.push(this.formBuilder.nonNullable.group({
        productId,
        label: item.label,
        returnable,
        quantity: '0',
      }));
    }
  }
}
