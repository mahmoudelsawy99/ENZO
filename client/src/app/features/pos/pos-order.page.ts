import { Component, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { ShellState } from '../../layout/shell-state.service';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { AppointmentApi } from '../appointments/appointment.api';
import { mergeBarbers, SHOP_BARBERS } from '../appointments/shop-barbers';
import { activeServices } from '../appointments/shop-services';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type CustomerRecord, type ServiceRecord } from '../catalog/catalog.models';
import { PaymentAllocation } from '../payments/payment-allocation';
import { MABEAAT_CATEGORY_ID } from '../../core/local/local-seed';
import { CashierLocalStore } from './cashier-local.store';
import { FinanceApi } from './finance.api';
import type { SaleRecord } from './finance.models';
import { saveOrderFiles } from './order-file';
import { ReceiptView } from './receipt-view';

type PaymentGroup = FormGroup<{ method: FormControl<string>; amount: FormControl<string>; referenceNumber: FormControl<string> }>;

const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];
const REFERRAL_SOURCES = ['FRIEND', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'GOOGLE', 'WALK_IN', 'OTHER'] as const;

@Component({
  selector: 'app-pos-order-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, TextInput, Select, LoadingState, ErrorState, PaymentAllocation, ReceiptView],
  template: `
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
        <div class="grid items-stretch gap-4 lg:grid-cols-[28rem_minmax(0,1fr)]" dir="ltr">
          <section class="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:order-2 lg:h-[calc(100dvh-8.5rem)]" [attr.dir]="direction()">
            <div class="shrink-0 border-b border-border px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-base font-semibold">{{ 'finance.services' | t }}</h2>
                <span class="text-xs text-text-secondary">{{ 'finance.tapService' | t }}</span>
              </div>
              <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
                <button type="button" class="shrink-0 rounded-full px-3 py-1.5 text-sm" [class.bg-brand-red]="menuCategory() === ''" [class.text-on-brand]="menuCategory() === ''" [class.bg-surface-elevated]="menuCategory() !== ''" [class.text-text-secondary]="menuCategory() !== ''" (click)="menuCategory.set('')">{{ 'finance.menuAll' | t }}</button>
                @for (category of menuCategories(); track category.id) {
                  <button type="button" class="shrink-0 rounded-full px-3 py-1.5 text-sm" [class.bg-brand-red]="menuCategory() === category.id" [class.text-on-brand]="menuCategory() === category.id" [class.bg-surface-elevated]="menuCategory() !== category.id" [class.text-text-secondary]="menuCategory() !== category.id" (click)="menuCategory.set(category.id)">{{ category.label }}</button>
                }
              </div>
              <input class="enzo-control mt-3" type="search" [attr.placeholder]="'common.search' | t" [attr.aria-label]="'common.search' | t" [value]="menuQuery()" (input)="menuQuery.set(valueOf($event))" />
            </div>
            <div class="enzo-scroll grid min-h-0 flex-1 content-start grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 overflow-y-auto p-3">
              @for (service of visibleServices(); track service.id) {
                <button type="button" class="relative flex min-h-[5.25rem] flex-col justify-between rounded-lg border px-3 py-2.5 text-start transition-colors" [attr.aria-pressed]="quantityOf(service.id) > 0" [class.border-brand-red]="quantityOf(service.id) > 0" [class.bg-surface-elevated]="quantityOf(service.id) > 0" [class.border-border]="quantityOf(service.id) === 0" [class.bg-surface]="quantityOf(service.id) === 0" (click)="pickService(service)">
                  <span class="line-clamp-2 pe-6 text-sm font-medium leading-snug">{{ serviceName(service) }}</span>
                  <span class="text-sm font-semibold text-brand-gold">{{ money(service.price) }}</span>
                  @if (quantityOf(service.id) > 0) {
                    <span class="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-brand-red text-[11px] font-medium text-on-brand">{{ text(quantityOf(service.id)) }}</span>
                  }
                </button>
              }
            </div>
          </section>
          <section class="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:order-1 lg:h-[calc(100dvh-8.5rem)]" [attr.dir]="direction()">
            <header class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 class="text-base font-semibold">{{ 'finance.currentOrder' | t }}</h2>
              <span class="rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary">{{ text(orderLines().length) }}</span>
            </header>
            <div class="grid shrink-0 gap-2 border-b border-border px-3 py-2">
              @if (!singleBranch()) {
                <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
              }
              <div class="grid grid-cols-2 gap-2">
                <div class="relative min-w-0">
                  <enzo-text-input formControlName="fullName" [label]="'appointments.customerSearch' | t" />
                  @if (customerMatches().length > 0) {
                    <ul class="enzo-scroll absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface shadow-md" role="listbox">
                      @for (customer of customerMatches(); track customer.id) {
                        <li>
                          <button type="button" class="flex w-full flex-col gap-0.5 px-3 py-2 text-start text-sm hover:bg-surface-elevated" (click)="pickCustomer(customer)">
                            <span class="font-medium text-text-primary">{{ customer.fullName }}</span>
                            <span class="text-xs text-text-secondary">{{ customer.phone || ('customers.noPhone' | t) }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>
                <div class="min-w-0">
                  <enzo-text-input formControlName="phone" type="tel" [label]="'customers.phone' | t" />
                </div>
              </div>
              <enzo-select formControlName="referralSource" [label]="'finance.referralSource' | t" [options]="referralOptions()" />
              @if (referralIsOther()) {
                <enzo-text-input formControlName="referralOther" [label]="'finance.referralOther' | t" [required]="true" />
              }
            </div>
            <div #linesPane class="enzo-scroll grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain p-3" formArrayName="services">
              @if (orderLines().length === 0) {
                <p class="px-2 py-8 text-center text-sm text-text-secondary">{{ 'finance.emptyOrder' | t }}</p>
              }
              @for (line of orderLines(); track line.index) {
                <div class="rounded-lg border border-border bg-surface-elevated px-3 py-2" [formGroupName]="line.index">
                  <div class="flex items-start justify-between gap-3">
                    <span class="text-sm font-medium leading-snug">{{ line.name }}</span>
                    <span class="shrink-0 text-sm font-semibold text-brand-gold">{{ money(line.total) }}</span>
                  </div>
                  <div class="mt-1.5 flex items-center gap-2">
                    <select class="enzo-control h-9 min-w-0 flex-1 text-sm" formControlName="barberEmployeeId" [attr.aria-label]="'finance.barber' | t">
                      @for (barber of barbers(); track barber.id) {
                        <option [value]="barber.id">{{ barber.fullName }}</option>
                      }
                    </select>
                    <div class="flex shrink-0 items-center rounded-md border border-border bg-surface">
                      <button type="button" class="size-8 text-lg leading-none" [attr.aria-label]="'finance.less' | t" (click)="changeQty(line.index, -1)">−</button>
                      <span class="w-6 text-center text-sm font-medium">{{ text(line.quantity) }}</span>
                      <button type="button" class="size-8 text-lg leading-none" [attr.aria-label]="'finance.more' | t" (click)="changeQty(line.index, 1)">+</button>
                    </div>
                  </div>
                </div>
              }
            </div>
            <footer class="grid shrink-0 gap-2 border-t border-border bg-surface-elevated px-3 py-3">
              <div class="flex items-end justify-between gap-3">
                <span class="text-sm text-text-secondary">{{ 'finance.total' | t }}</span>
                <span class="text-3xl font-semibold leading-none">{{ money(amountDue()) }}</span>
              </div>
              <enzo-text-input formControlName="offerText" type="number" floating [label]="'finance.offer' | t" />
              <div class="grid gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5">
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-text-secondary">{{ 'finance.cashBefore' | t }}</span>
                  <span class="font-medium tabular-nums">{{ money(servicesSubtotal()) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-text-secondary">{{ 'finance.offer' | t }}</span>
                  <span class="font-medium tabular-nums text-danger">−{{ money(offerAmount() + roundingDiscount()) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-sm">
                  <span class="font-medium text-text-primary">{{ 'finance.cashAfter' | t }}</span>
                  <span class="text-base font-semibold tabular-nums">{{ money(cashAfterDiscount()) }}</span>
                </div>
              </div>
              <input type="hidden" formControlName="cashText" />
              <div class="enzo-scroll max-h-36 overflow-y-auto overscroll-contain">
                <app-payment-allocation [form]="form" [methods]="methodOptions()" [compact]="true" (addPayment)="addPayment()" (removePayment)="removePayment($event)" />
              </div>
              <button enzoButton type="submit" [loading]="saving()">{{ 'finance.takePayment' | t }}</button>
            </footer>
          </section>
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
  private readonly shell = inject(ShellState);
  protected readonly access = inject(TenantAccess);
  private readonly linesPane = viewChild<ElementRef<HTMLElement>>('linesPane');

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
  readonly services = signal<ServiceRecord[]>(activeServices());
  readonly menuCategory = signal('');
  readonly menuQuery = signal('');
  readonly barbers = signal<Array<{ id: string; fullName: string }>>([...SHOP_BARBERS]);
  readonly customerMatches = signal<CustomerRecord[]>([]);
  readonly shiftOpen = signal(true);
  readonly referralIsOther = signal(false);
  private readonly revision = signal(0);
  private bootstrapped = false;
  private pickingCustomer = false;
  private customerSearchTimer: number | null = null;
  private customerSearchSub: Subscription | null = null;
  private readonly idempotencyKey = crypto.randomUUID();
  readonly form = this.formBuilder.nonNullable.group({
    branchId: [this.branches.selectedId(), Validators.required],
    barberEmployeeId: [''],
    fullName: [''],
    phone: [''],
    referralSource: [''],
    referralOther: [''],
    offerText: ['0'],
    totalText: ['0'],
    cashText: ['0'],
    services: this.formBuilder.array<ReturnType<PosOrderPage['serviceGroup']>>([]),
    payments: this.formBuilder.array<PaymentGroup>([]),
  });

  constructor() {
    this.shell.setNav('finance.newOrder', this.breadcrumbs);
    inject(DestroyRef).onDestroy(() => this.shell.clearNav());
    this.form.controls.services.valueChanges.subscribe(() => {
      this.revision.update((value) => value + 1);
      this.bindAmounts();
    });
    this.form.controls.offerText.valueChanges.subscribe(() => {
      this.revision.update((value) => value + 1);
      this.bindAmounts();
    });
    this.form.controls.totalText.disable({ emitEvent: false });
    this.form.controls.cashText.disable({ emitEvent: false });
    this.form.controls.payments.valueChanges.subscribe(() => this.bindAmounts());
    this.form.controls.fullName.valueChanges.subscribe((value) => {
      if (!this.pickingCustomer) {
        this.scheduleCustomerSearch(value);
      }
    });
    this.form.controls.referralSource.valueChanges.subscribe((source) => {
      this.referralIsOther.set(source === 'OTHER');
      if (source !== 'OTHER') {
        this.form.controls.referralOther.setValue('');
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

  protected menuCategories(): Array<{ id: string; label: string }> {
    this.i18n.language();
    const seen = new Set<string>();
    const categories: Array<{ id: string; label: string }> = [];
    for (const service of this.services()) {
      if (!service.categoryId || seen.has(service.categoryId)) {
        continue;
      }
      seen.add(service.categoryId);
      categories.push({ id: service.categoryId, label: localizedLabel(service.categoryName, this.i18n.language()) || service.categoryId });
    }
    const last = categories.filter((category) => category.id === MABEAAT_CATEGORY_ID);
    const rest = categories.filter((category) => category.id !== MABEAAT_CATEGORY_ID);
    return [...rest, ...last];
  }

  protected visibleServices(): ServiceRecord[] {
    const category = this.menuCategory();
    const query = this.menuQuery().trim().toLowerCase();
    return this.services().filter((service) => {
      if (service.status === 'INACTIVE') {
        return false;
      }
      if (category && service.categoryId !== category) {
        return false;
      }
      if (!query) {
        return true;
      }
      const name = `${localizedLabel(service.name, 'ar')} ${localizedLabel(service.name, 'en')}`.toLowerCase();
      return name.includes(query);
    });
  }

  protected serviceName(service: ServiceRecord): string {
    return localizedLabel(service.name, this.i18n.language());
  }

  protected quantityOf(serviceId: string): number {
    this.revision();
    return this.form.controls.services.controls
      .filter((group) => group.controls.serviceId.value === serviceId)
      .reduce((sum, group) => sum + (Number(group.controls.quantity.value) || 0), 0);
  }

  protected direction(): 'ltr' | 'rtl' {
    return this.i18n.direction();
  }

  protected orderLines(): Array<{ index: number; serviceId: string; name: string; quantity: number; total: number }> {
    this.revision();
    return this.form.controls.services.controls.flatMap((group, index) => {
      const service = this.services().find((item) => item.id === group.controls.serviceId.value);
      if (!service) {
        return [];
      }
      const quantity = Number(group.controls.quantity.value) || 1;
      return [{ index, serviceId: service.id, name: this.serviceName(service), quantity, total: Math.round(service.price * quantity * 100) / 100 }];
    });
  }

  protected pickService(service: ServiceRecord): void {
    const rows = this.form.controls.services;
    rows.push(this.serviceGroup(service.id, this.defaultBarberId()));
    this.scrollOrderLines();
  }

  private scrollOrderLines(): void {
    queueMicrotask(() => {
      const pane = this.linesPane()?.nativeElement;
      pane?.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    });
  }

  protected singleBranch(): boolean {
    return this.branchOptions().length <= 1;
  }

  protected changeQty(index: number, delta: number): void {
    const group = this.form.controls.services.at(index);
    const next = (Number(group.controls.quantity.value) || 1) + delta;
    if (next <= 0) {
      this.form.controls.services.removeAt(index);
      return;
    }
    group.controls.quantity.setValue(next);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected pickCustomer(customer: CustomerRecord): void {
    this.pickingCustomer = true;
    this.form.controls.fullName.setValue(customer.fullName);
    this.form.controls.phone.setValue(customer.phone || '');
    this.customerMatches.set([]);
    this.pickingCustomer = false;
  }

  protected methodOptions(): SelectOption[] {
    return METHODS.filter((method) => method !== 'CASH').map((method) => ({ value: method, label: this.i18n.translate(`finance.methods.${method}`) }));
  }

  protected referralOptions(): SelectOption[] {
    return [
      { value: '', label: this.i18n.translate('finance.referralSourceEmpty') },
      ...REFERRAL_SOURCES.map((source) => ({ value: source, label: this.i18n.translate(`finance.referralSources.${source}`) })),
    ];
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected servicesSubtotal(): number {
    this.revision();
    const subtotal = this.form.controls.services.getRawValue().reduce((sum, row) => {
      const service = this.services().find((item) => item.id === row.serviceId);
      const quantity = Number(row.quantity) || 0;
      return sum + (service ? service.price * quantity : 0);
    }, 0);
    return Math.max(0, Math.round(subtotal * 100) / 100);
  }

  protected offerPercent(): number {
    this.revision();
    const percent = Math.max(0, Number(this.form.controls.offerText.value) || 0);
    return Math.min(percent, 100);
  }

  protected offerAmount(): number {
    const subtotal = this.servicesSubtotal();
    return Math.max(0, Math.round(subtotal * (this.offerPercent() / 100) * 100) / 100);
  }

  protected rawAmountDue(): number {
    return Math.max(0, Math.round((this.servicesSubtotal() - this.offerAmount()) * 100) / 100);
  }

  /** Round cash totals down to a clean 5 (e.g. 632 → 630). */
  protected roundCashAmount(amount: number): number {
    return Math.max(0, Math.floor(amount / 5) * 5);
  }

  protected amountDue(): number {
    return this.roundCashAmount(this.rawAmountDue());
  }

  protected roundingDiscount(): number {
    return Math.max(0, Math.round((this.rawAmountDue() - this.amountDue()) * 100) / 100);
  }

  protected cashAfterDiscount(): number {
    this.revision();
    const other = this.form.controls.payments.getRawValue().reduce((sum, payment) => {
      const amount = Number(payment.amount);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    return Math.max(0, Math.round((this.amountDue() - other) * 100) / 100);
  }

  protected cashWithoutShift(): boolean {
    return !this.shiftOpen() && Number(this.form.controls.cashText.value) > 0;
  }

  protected addPayment(): void {
    this.form.controls.payments.push(this.paymentGroup());
  }

  protected removePayment(index: number): void {
    this.form.controls.payments.removeAt(index);
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    const services = value.services
      .filter((line) => line.serviceId)
      .map((line) => ({ serviceId: line.serviceId, quantity: Number(line.quantity) || 1, barberEmployeeId: line.barberEmployeeId }));
    const phone = value.phone.trim();
    const primaryBarber = services.find((line) => line.barberEmployeeId)?.barberEmployeeId ?? '';
    if (!value.branchId || !primaryBarber || services.some((line) => !line.barberEmployeeId) || services.length === 0) {
      this.error.set(this.i18n.translate('finance.orderInvalid'));
      return;
    }
    const percent = Math.max(0, Number(value.offerText) || 0);
    if (percent > 100) {
      this.error.set(this.i18n.translate('finance.offerTooHigh'));
      return;
    }
    const discount = Math.round((this.offerAmount() + this.roundingDiscount()) * 100) / 100;
    const total = this.amountDue();
    const cash = Math.max(0, Math.round((Number(value.cashText) || 0) * 100) / 100);
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
    const referralSource = value.referralSource.trim();
    const referralOther = value.referralOther.trim();
    if (referralSource === 'OTHER' && !referralOther) {
      this.error.set(this.i18n.translate('finance.referralOtherRequired'));
      return;
    }
    saveOrderFiles({
      savedAt: new Date().toISOString(),
      customer: value.fullName.trim(),
      phone,
      barber: [...new Set(services.map((line) => line.barberEmployeeId))]
        .map((id) => this.barberName(id))
        .filter((name) => name.length > 0)
        .join(', '),
      branch: this.branchOptions().find((branch) => branch.value === value.branchId)?.label ?? '',
      discount: Math.round(discount * 100) / 100,
      total,
      cash,
      amountDue: total,
      referralSource,
      referralOther: referralSource === 'OTHER' ? referralOther : '',
      services: services.map((line) => {
        const service = this.services().find((item) => item.id === line.serviceId);
        return {
          service: service ? localizedLabel(service.name, this.i18n.language()) : line.serviceId,
          quantity: line.quantity,
          price: service?.price ?? 0,
          barber: this.barberName(line.barberEmployeeId),
        };
      }),
      payments,
    });
    this.toast.success(this.i18n.translate('finance.orderFileSaved'));
    this.saving.set(true);
    this.error.set('');
    const orderBody = {
      branchId: value.branchId,
      barberEmployeeId: primaryBarber,
      extraBarberIds: [...new Set(services.map((line) => line.barberEmployeeId))].filter((id) => id !== primaryBarber),
      customer: { fullName: value.fullName.trim(), phone },
      referralSource,
      referralOther: referralSource === 'OTHER' ? referralOther : '',
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

  private scheduleCustomerSearch(raw: string): void {
    if (this.customerSearchTimer !== null) {
      window.clearTimeout(this.customerSearchTimer);
    }
    const search = raw.trim();
    if (search.length < 2) {
      this.customerMatches.set([]);
      this.customerSearchSub?.unsubscribe();
      this.customerSearchSub = null;
      return;
    }
    this.customerSearchTimer = window.setTimeout(() => this.searchCustomers(search), 250);
  }

  private searchCustomers(search: string): void {
    this.customerSearchSub?.unsubscribe();
    this.customerSearchSub = this.catalog.customers({ page: 1, pageSize: 8, search, status: 'ACTIVE' }).subscribe({
      next: (result) => this.customerMatches.set(result.data),
      error: () => this.customerMatches.set([]),
    });
  }

  private bindAmounts(): void {
    const due = this.amountDue();
    const other = this.form.controls.payments.getRawValue().reduce((sum, payment) => {
      const amount = Number(payment.amount);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    const cash = Math.max(0, Math.round((due - other) * 100) / 100);
    this.form.controls.totalText.setValue(String(due), { emitEvent: false });
    this.form.controls.cashText.setValue(String(cash), { emitEvent: false });
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
    const fallback = barbers[0]?.id ?? '';
    if (!this.form.controls.barberEmployeeId.value && fallback) {
      this.form.controls.barberEmployeeId.setValue(fallback);
    }
    for (const group of this.form.controls.services.controls) {
      const current = group.controls.barberEmployeeId.value;
      if (!current || !barbers.some((barber) => barber.id === current)) {
        group.controls.barberEmployeeId.setValue(fallback);
      }
    }
  }

  private defaultBarberId(): string {
    return this.form.controls.barberEmployeeId.value || this.barbers()[0]?.id || '';
  }

  private barberName(id: string): string {
    return this.barbers().find((barber) => barber.id === id)?.fullName ?? '';
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

  private serviceGroup(serviceId = '', barberEmployeeId = '') {
    return this.formBuilder.nonNullable.group({
      serviceId: [serviceId, Validators.required],
      barberEmployeeId: [barberEmployeeId],
      quantity: [1, [Validators.required, Validators.min(1)]],
    });
  }

  private paymentGroup(): PaymentGroup {
    return this.formBuilder.nonNullable.group({ method: 'VISA', amount: '', referenceNumber: '' });
  }
}
