import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { AppointmentApi } from '../appointments/appointment.api';
import { mergeBarbers, SHOP_BARBERS } from '../appointments/shop-barbers';
import { SHOP_SERVICES } from '../appointments/shop-services';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type ServiceRecord } from '../catalog/catalog.models';
import { PaymentAllocation } from '../payments/payment-allocation';
import { CashierLocalStore } from './cashier-local.store';
import { FinanceApi } from './finance.api';
import type { SaleRecord } from './finance.models';
import { saveOrderFiles } from './order-file';
import { ReceiptView } from './receipt-view';

type PaymentGroup = FormGroup<{ method: FormControl<string>; amount: FormControl<string>; referenceNumber: FormControl<string> }>;

const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];

@Component({
  selector: 'app-pos-order-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, TextInput, Select, LoadingState, ErrorState, PaymentAllocation, ReceiptView],
  template: `
    <enzo-page-header [title]="'finance.newOrder' | t" [description]="'finance.newOrderDescription' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton variant="secondary" routerLink="/pos">{{ 'finance.readyTitle' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else if (receipt(); as sale) {
      <app-receipt-view [sale]="sale" />
      <div class="mt-4">
        <a enzoButton routerLink="/pos">{{ 'finance.readyTitle' | t }}</a>
      </div>
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        @if (cashWithoutShift()) {
          <p class="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
            {{ 'finance.noShiftBody' | t }}
            <a class="ms-2 text-brand-gold underline" routerLink="/shifts">{{ 'finance.openShift' | t }}</a>
          </p>
        }
        <enzo-card [title]="'finance.customer' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
            <enzo-select formControlName="barberEmployeeId" [label]="'finance.barber' | t" [options]="barberOptions()" [required]="true" />
            <enzo-text-input formControlName="fullName" [label]="'customers.name' | t" [required]="true" />
            <enzo-text-input formControlName="phone" type="tel" [label]="'customers.phone' | t" [required]="true" />
          </div>
          <div class="mt-4 grid gap-3" formArrayName="extraBarbers">
            @for (group of form.controls.extraBarbers.controls; track $index) {
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" [formGroupName]="$index">
                <enzo-select formControlName="barberEmployeeId" [label]="'appointments.extraBarber' | t" [options]="barberOptions()" />
                <div class="flex items-end">
                  <button enzoButton type="button" variant="danger" (click)="removeBarber($index)">{{ 'packages.remove' | t }}</button>
                </div>
              </div>
            }
            <button enzoButton type="button" variant="secondary" (click)="addBarber()">{{ 'appointments.addBarber' | t }}</button>
          </div>
        </enzo-card>
        <enzo-card [title]="'finance.services' | t">
          <div class="grid gap-3" formArrayName="services">
            @for (group of form.controls.services.controls; track $index) {
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]" [formGroupName]="$index">
                <enzo-select formControlName="serviceId" [label]="'services.title' | t" [options]="serviceOptions()" />
                <enzo-text-input formControlName="quantity" type="number" [label]="'packages.quantity' | t" />
                <div class="flex items-end">
                  <button enzoButton type="button" variant="danger" (click)="removeService($index)">{{ 'packages.remove' | t }}</button>
                </div>
              </div>
            }
            <button enzoButton type="button" variant="secondary" (click)="addService()">{{ 'packages.addItem' | t }}</button>
          </div>
          <div class="mt-4 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
            <enzo-text-input formControlName="totalText" type="number" [label]="'finance.total' | t" />
            <enzo-text-input formControlName="cashText" type="number" [label]="'finance.cashAmount' | t" />
          </div>
        </enzo-card>
        @if (access.can('pos.apply-discount') || access.can('payments.apply-discount')) {
          <enzo-text-input formControlName="additionalDiscount" type="number" [label]="'finance.additionalDiscount' | t" />
        }
        <enzo-card [title]="'finance.payments' | t">
          <app-payment-allocation [form]="form" [methods]="methodOptions()" (addPayment)="addPayment()" (removePayment)="removePayment($event)" />
        </enzo-card>
        <div>
          <button enzoButton type="submit" [loading]="saving()">{{ 'finance.takePayment' | t }}</button>
        </div>
      </form>
    }
  `,
})
export class PosOrderPage {
  private readonly api = inject(FinanceApi);
  private readonly local = inject(CashierLocalStore);
  private readonly catalog = inject(CatalogApi);
  private readonly appointments = inject(AppointmentApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.pos', link: '/pos' },
    { labelKey: 'finance.newOrder' },
  ];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly receipt = signal<SaleRecord | null>(null);
  readonly services = signal<ServiceRecord[]>([...SHOP_SERVICES]);
  readonly barbers = signal<Array<{ id: string; fullName: string }>>([...SHOP_BARBERS]);
  readonly shiftOpen = signal(true);
  private readonly revision = signal(0);
  private binding = false;
  private cashTouched = false;
  private bootstrapped = false;
  private readonly idempotencyKey = crypto.randomUUID();
  readonly form = this.formBuilder.nonNullable.group({
    branchId: [this.branches.selectedId(), Validators.required],
    barberEmployeeId: ['', Validators.required],
    extraBarbers: this.formBuilder.array<ReturnType<PosOrderPage['barberGroup']>>([]),
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    additionalDiscount: ['0'],
    totalText: ['0'],
    cashText: ['0'],
    services: this.formBuilder.array([this.serviceGroup()]),
    payments: this.formBuilder.array<PaymentGroup>([]),
  });

  constructor() {
    this.form.controls.services.valueChanges.subscribe(() => {
      this.revision.update((value) => value + 1);
      this.bindAmounts();
    });
    this.form.controls.totalText.disable({ emitEvent: false });
    this.form.controls.additionalDiscount.valueChanges.subscribe(() => {
      this.revision.update((value) => value + 1);
      this.bindAmounts();
    });
    this.form.controls.cashText.valueChanges.subscribe(() => {
      if (!this.binding) {
        this.cashTouched = true;
      }
    });
    this.form.controls.branchId.valueChanges.subscribe((branchId) => {
      this.form.controls.barberEmployeeId.setValue('');
      if (branchId) {
        this.loadBarbers(branchId);
        this.loadShift(branchId);
      }
    });
    effect(() => {
      if (!this.access.loaded() || this.bootstrapped) {
        return;
      }
      const branchId = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
      this.bootstrapped = true;
      if (!branchId) {
        this.loadError.set(this.i18n.translate('finance.branchRequired'));
        this.loading.set(false);
        return;
      }
      this.form.controls.branchId.setValue(branchId, { emitEvent: false });
      this.services.set(this.local.services());
      this.catalog.services({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
        next: (result) => {
          this.services.set(this.local.rememberServices(result.data));
          this.loading.set(false);
          this.bindAmounts();
        },
        error: () => {
          this.services.set(this.local.services());
          this.loading.set(false);
          this.bindAmounts();
        },
      });
      this.loadBarbers(branchId);
      this.loadShift(branchId);
    });
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected barberOptions(): SelectOption[] {
    return this.barbers().map((barber) => ({ value: barber.id, label: barber.fullName }));
  }

  protected serviceOptions(): SelectOption[] {
    return this.services().map((service) => ({
      value: service.id,
      label: `${localizedLabel(service.name, this.i18n.language())} · ${this.money(service.price)}`,
    }));
  }

  protected methodOptions(): SelectOption[] {
    return METHODS.map((method) => ({ value: method, label: this.i18n.translate(`finance.methods.${method}`) }));
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected amountDue(): number {
    this.revision();
    const discount = Number(this.form.controls.additionalDiscount.value) || 0;
    const subtotal = this.form.controls.services.getRawValue().reduce((sum, row) => {
      const service = this.services().find((item) => item.id === row.serviceId);
      const quantity = Number(row.quantity) || 0;
      return sum + (service ? service.price * quantity : 0);
    }, 0);
    return Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  }

  protected cashWithoutShift(): boolean {
    return !this.shiftOpen() && Number(this.form.controls.cashText.value) > 0;
  }

  protected addService(): void {
    this.form.controls.services.push(this.serviceGroup());
  }

  protected removeService(index: number): void {
    if (this.form.controls.services.length === 1) {
      return;
    }
    this.form.controls.services.removeAt(index);
  }

  protected addPayment(): void {
    this.form.controls.payments.push(this.paymentGroup());
  }

  protected removePayment(index: number): void {
    this.form.controls.payments.removeAt(index);
  }

  protected addBarber(): void {
    if (this.form.controls.extraBarbers.length >= 10) {
      return;
    }
    this.form.controls.extraBarbers.push(this.barberGroup());
  }

  protected removeBarber(index: number): void {
    this.form.controls.extraBarbers.removeAt(index);
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    const services = value.services
      .filter((line) => line.serviceId)
      .map((line) => ({ serviceId: line.serviceId, quantity: Number(line.quantity) || 1 }));
    const phone = value.phone.trim();
    if (!value.branchId || !value.barberEmployeeId || value.fullName.trim().length < 2 || phone.length < 8 || services.length === 0) {
      this.error.set(this.i18n.translate('finance.orderInvalid'));
      return;
    }
    const total = this.amountDue();
    const cash = Math.round((Number(value.cashText) || 0) * 100) / 100;
    const canDiscount = this.access.can('pos.apply-discount') || this.access.can('payments.apply-discount');
    const discount = canDiscount ? Number(value.additionalDiscount) || 0 : 0;
    const otherPayments = value.payments
      .map((payment) => ({ method: payment.method, amount: Number(payment.amount), referenceNumber: payment.referenceNumber.trim() }))
      .filter((payment) => payment.method !== 'CASH' && payment.amount > 0);
    const payments = cash > 0
      ? [{ method: 'CASH', amount: cash, referenceNumber: '' }, ...otherPayments]
      : otherPayments;
    const paid = Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100);
    if (payments.length === 0 || paid !== Math.round(total * 100)) {
      this.error.set(this.i18n.translate('finance.paymentMismatch'));
      return;
    }
    saveOrderFiles({
      savedAt: new Date().toISOString(),
      customer: value.fullName.trim(),
      phone,
      barber: [value.barberEmployeeId, ...value.extraBarbers.map((row) => row.barberEmployeeId)]
        .map((id) => this.barbers().find((barber) => barber.id === id)?.fullName ?? '')
        .filter((name) => name.length > 0)
        .join(', '),
      branch: this.branchOptions().find((branch) => branch.value === value.branchId)?.label ?? '',
      discount: Math.round(discount * 100) / 100,
      total,
      cash,
      amountDue: total,
      services: services.map((line) => {
        const service = this.services().find((item) => item.id === line.serviceId);
        return {
          service: service ? localizedLabel(service.name, this.i18n.language()) : line.serviceId,
          quantity: line.quantity,
          price: service?.price ?? 0,
        };
      }),
      payments,
    });
    this.toast.success(this.i18n.translate('finance.orderFileSaved'));
    this.saving.set(true);
    this.error.set('');
    const orderBody = {
      branchId: value.branchId,
      barberEmployeeId: value.barberEmployeeId,
      extraBarberIds: value.extraBarbers.map((row) => row.barberEmployeeId).filter((id) => id.length > 0 && id !== value.barberEmployeeId),
      customer: { fullName: value.fullName.trim(), phone },
      services,
      idempotencyKey: this.idempotencyKey,
      additionalDiscount: Math.round(discount * 100) / 100,
      payments,
    };
    this.api.createOrder(orderBody).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.receipt.set(result.data);
        this.toast.success(this.i18n.translate('finance.orderSaved'));
      },
      error: () => {
        const sale = this.local.saveOrder(orderBody);
        this.saving.set(false);
        this.receipt.set(sale);
        this.toast.success(this.i18n.translate('finance.orderSavedLocal'));
      },
    });
  }

  private bindAmounts(): void {
    const text = String(this.amountDue());
    this.binding = true;
    this.form.controls.totalText.setValue(text, { emitEvent: false });
    if (!this.cashTouched) {
      this.form.controls.cashText.setValue(text, { emitEvent: false });
    }
    this.binding = false;
  }

  private loadBarbers(branchId: string): void {
    this.applyBarbers(SHOP_BARBERS);
    this.appointments.barbers(branchId).subscribe({
      next: (result) => this.applyBarbers(mergeBarbers(result.data)),
      error: () => this.applyBarbers(SHOP_BARBERS),
    });
  }

  private applyBarbers(barbers: Array<{ id: string; fullName: string }>): void {
    this.barbers.set(barbers);
    const current = this.form.controls.barberEmployeeId.value;
    if (!current && barbers[0]) {
      this.form.controls.barberEmployeeId.setValue(barbers[0].id);
    }
  }

  private loadShift(branchId: string): void {
    this.shiftOpen.set(Boolean(this.local.currentShift(branchId)));
    this.api.currentShift(branchId).subscribe({
      next: (result) => {
        this.local.rememberShifts(branchId, result.data, this.local.shifts(branchId));
        this.shiftOpen.set(Boolean(result.data ?? this.local.currentShift(branchId)));
      },
      error: () => this.shiftOpen.set(Boolean(this.local.currentShift(branchId))),
    });
  }

  private barberGroup(barberEmployeeId = '') {
    return this.formBuilder.nonNullable.group({
      barberEmployeeId: [barberEmployeeId, Validators.required],
    });
  }

  private serviceGroup() {
    return this.formBuilder.nonNullable.group({
      serviceId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
    });
  }

  private paymentGroup(): PaymentGroup {
    return this.formBuilder.nonNullable.group({ method: 'VISA', amount: '', referenceNumber: '' });
  }
}
