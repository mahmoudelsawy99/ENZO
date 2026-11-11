import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localizedLabel } from '../catalog/catalog.models';
import { PaymentAllocation } from '../payments/payment-allocation';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from '../inventory/inventory.api';
import type { StockRow } from '../inventory/inventory.models';
import { FinanceApi } from './finance.api';
import type { CheckoutContext, SaleRecord } from './finance.models';
import { ReceiptView } from './receipt-view';

type PaymentGroup = FormGroup<{ method: FormControl<string>; amount: FormControl<string>; referenceNumber: FormControl<string> }>;
type RedeemGroup = FormGroup<{ label: FormControl<string>; customerPackageId: FormControl<string>; serviceId: FormControl<string>; quantity: FormControl<string> }>;
type ProductGroup = FormGroup<{ productId: FormControl<string>; quantity: FormControl<string> }>;

const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];

@Component({
  selector: 'app-pos-checkout-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, Badge, TextInput, Select, LoadingState, ErrorState, PaymentAllocation, ReceiptView],
  template: `
    <enzo-page-header [title]="'finance.checkoutTitle' | t" [description]="'finance.checkoutDescription' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton variant="secondary" routerLink="/pos">{{ 'finance.readyTitle' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error() && !context()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (receipt(); as sale) {
      <app-receipt-view [sale]="sale" />
    } @else if (context(); as current) {
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-lg font-medium text-text-primary">{{ current.appointment.appointmentNumber }}</p>
          <p class="text-sm text-text-secondary">{{ current.appointment.customerName }} · {{ current.appointment.customerPhone }}</p>
        </div>
        <enzo-badge tone="info">{{ current.appointment.barberName }}</enzo-badge>
      </div>
      <div class="grid gap-4 xl:grid-cols-2">
        <enzo-card [title]="'finance.services' | t">
          <ul class="grid gap-2 text-sm">
            @for (line of current.appointment.services; track line.serviceId) {
              <li class="flex justify-between gap-3">
                <span>{{ label(line.serviceName) }} × {{ text(line.quantity) }}</span>
                <span>{{ money(line.lineTotal) }}</span>
              </li>
            }
          </ul>
          <div class="mt-3 grid gap-1 border-t border-border pt-3 text-sm">
            <div class="flex justify-between"><span>{{ 'finance.subtotal' | t }}</span><span>{{ money(current.appointment.subtotal) }}</span></div>
            <div class="flex justify-between"><span>{{ 'finance.existingDiscount' | t }}</span><span>{{ money(current.appointment.discount) }}</span></div>
            <div class="flex justify-between font-medium"><span>{{ 'finance.amountDue' | t }}</span><span>{{ money(previewDue()) }}</span></div>
          </div>
        </enzo-card>
        <enzo-card [title]="'finance.packages' | t">
          @if (redemptions.controls.length === 0) {
            <p class="text-sm text-text-secondary">{{ 'finance.noPackages' | t }}</p>
          } @else {
            <div class="grid gap-3">
              @for (row of redemptions.controls; track $index) {
                <div [formGroup]="row">
                  <enzo-text-input formControlName="quantity" type="number" [label]="row.controls.label.value" />
                </div>
              }
            </div>
          }
        </enzo-card>
        @if (stock().length > 0) {
          <enzo-card [title]="'stock.products' | t">
            <div class="grid gap-3">
              @for (row of products.controls; track $index) {
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem]" [formGroup]="row">
                  <enzo-select formControlName="productId" [label]="'stock.product' | t" [options]="productOptions()" />
                  <enzo-text-input formControlName="quantity" type="number" [label]="'stock.quantity' | t" />
                </div>
              }
            </div>
            <div class="mt-3"><button enzoButton type="button" variant="secondary" (click)="addProduct()">{{ 'stock.addLine' | t }}</button></div>
          </enzo-card>
        }
      </div>
      <form class="mt-4 grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        @if (access.can('pos.apply-discount') || access.can('payments.apply-discount')) {
          <enzo-text-input formControlName="additionalDiscount" type="number" [label]="'finance.additionalDiscount' | t" />
        }
        <app-payment-allocation [form]="form" [methods]="methodOptions()" (addPayment)="addPayment()" (removePayment)="removePayment($event)" />
        @if (access.can('tips.manage')) {
          <div class="grid gap-3 md:grid-cols-2">
            <enzo-text-input formControlName="tipAmount" type="number" [label]="'finance.tipAmount' | t" />
            <enzo-select formControlName="tipMethod" [label]="'finance.method' | t" [options]="methodOptions()" />
          </div>
        }
        @if (error()) {
          <p class="text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <div>
          <button enzoButton type="submit" [loading]="saving()" [disabled]="current.appointment.checkoutStatus !== 'NOT_CHECKED_OUT'">{{ 'finance.takePayment' | t }}</button>
        </div>
      </form>
    }
  `,
})
export class PosCheckoutPage {
  private readonly api = inject(FinanceApi);
  private readonly inventory = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.pos', link: '/pos' }, { labelKey: 'finance.checkoutTitle' }];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly context = signal<CheckoutContext | null>(null);
  readonly receipt = signal<SaleRecord | null>(null);
  readonly redemptions = new FormArray<RedeemGroup>([]);
  readonly products = new FormArray<ProductGroup>([]);
  readonly stock = signal<StockRow[]>([]);
  private readonly revision = signal(0);
  readonly form = this.formBuilder.nonNullable.group({
    additionalDiscount: '0',
    tipAmount: '0',
    tipMethod: 'CASH',
    payments: this.formBuilder.array<PaymentGroup>([this.paymentGroup()]),
  });
  private readonly idempotencyKey = crypto.randomUUID();
  private readonly appointmentId = this.route.snapshot.paramMap.get('appointmentId') ?? '';

  constructor() {
    this.form.valueChanges.subscribe(() => this.revision.update((value) => value + 1));
    this.redemptions.valueChanges.subscribe(() => this.revision.update((value) => value + 1));
    this.products.valueChanges.subscribe(() => this.revision.update((value) => value + 1));
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

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected previewDue(): number {
    this.revision();
    const current = this.context();
    if (!current) {
      return 0;
    }
    const extra = Number(this.form.controls.additionalDiscount.value) || 0;
    const redeemed = this.redemptions.getRawValue().reduce((total, row) => {
      const quantity = Number(row.quantity) || 0;
      const line = current.appointment.services.find((item) => item.serviceId === row.serviceId);
      return total + (line ? line.unitPrice * quantity : 0);
    }, 0);
    const productTotal = this.products.getRawValue().reduce((total, row) => {
      const quantity = Number(row.quantity) || 0;
      const item = this.stock().find((stock) => stock.productId === row.productId);
      return total + (item ? item.sellingPrice * quantity : 0);
    }, 0);
    return Math.max(0, current.appointment.subtotal + productTotal - current.appointment.discount - extra - redeemed);
  }

  protected productOptions(): SelectOption[] {
    return this.stock().map((row) => ({
      value: row.productId,
      label: `${this.label(row.productName)} · ${this.text(row.quantityOnHand)}`,
    }));
  }

  protected addProduct(): void {
    this.products.push(this.formBuilder.nonNullable.group({ productId: this.stock()[0]?.productId ?? '', quantity: '1' }));
  }

  protected addPayment(): void {
    this.form.controls.payments.push(this.paymentGroup());
  }

  protected removePayment(index: number): void {
    this.form.controls.payments.removeAt(index);
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.context(this.appointmentId).subscribe({
      next: (result) => {
        this.context.set(result.data);
        this.redemptions.clear();
        for (const pack of result.data.packages) {
          for (const item of pack.items) {
            const line = result.data.appointment.services.find((service) => service.serviceId === item.serviceId);
            if (!line || item.remainingQuantity < 1) {
              continue;
            }
            const max = Math.min(line.quantity, item.remainingQuantity);
            this.redemptions.push(this.formBuilder.nonNullable.group({
              label: `${this.label(pack.name)} · ${this.label(item.serviceName)} (${this.i18n.translate('finance.remaining')} ${this.text(max)})`,
              customerPackageId: pack.id,
              serviceId: item.serviceId,
              quantity: '0',
            }));
          }
        }
        this.products.clear();
        if (this.access.can('inventory.view') || this.access.can('products.view')) {
          this.inventory.stock({ branchId: result.data.appointment.branchId, page: 1, pageSize: 50 }).subscribe({
            next: (stock) => {
              const available = stock.data.filter((row) => row.quantityOnHand > 0 && row.status === 'ACTIVE');
              this.stock.set(available);
            },
          });
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected submit(): void {
    const current = this.context();
    if (!current) {
      return;
    }
    const raw = this.form.getRawValue();
    const payments = raw.payments
      .map((payment) => ({ method: payment.method, amount: Number(payment.amount), referenceNumber: payment.referenceNumber }))
      .filter((payment) => payment.amount > 0);
    const tipAmount = Number(raw.tipAmount) || 0;
    this.saving.set(true);
    this.error.set('');
    this.api.checkout({
      appointmentId: current.appointment.id,
      idempotencyKey: this.idempotencyKey,
      additionalDiscount: Number(raw.additionalDiscount) || 0,
      redemptions: this.redemptions.getRawValue()
        .map((row) => ({ customerPackageId: row.customerPackageId, serviceId: row.serviceId, quantity: Number(row.quantity) || 0 }))
        .filter((row) => row.quantity > 0),
      payments,
      tips: tipAmount > 0 ? [{ employeeId: current.appointment.barberEmployeeId, amount: tipAmount, method: raw.tipMethod, referenceNumber: '' }] : [],
      products: this.products.getRawValue()
        .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) || 0 }))
        .filter((row) => row.productId && row.quantity > 0),
    }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.receipt.set(result.data);
        this.toast.success(this.i18n.translate('finance.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private paymentGroup(): PaymentGroup {
    return this.formBuilder.nonNullable.group({ method: 'CASH', amount: '', referenceNumber: '' });
  }
}
