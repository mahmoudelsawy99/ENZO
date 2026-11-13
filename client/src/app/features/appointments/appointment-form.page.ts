import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DateField } from '../../shared/ui/date-field';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type CustomerRecord, type ServiceRecord } from '../catalog/catalog.models';
import { AppointmentApi } from './appointment.api';
import { mergeBarbers, SHOP_BARBERS } from './shop-barbers';

@Component({
  selector: 'app-appointment-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, DateField, SearchInput, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'appointments.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        <enzo-card [title]="'appointments.details' | t">
          <div class="grid gap-4 md:grid-cols-2">
            @if (!appointmentId) {
              <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
            }
            <enzo-select formControlName="customerId" [label]="'appointments.customer' | t" [options]="customerOptions()" />
            <enzo-select formControlName="barberEmployeeId" [label]="'appointments.barber' | t" [options]="barberOptions()" />
            <enzo-text-input formControlName="discount" type="number" [label]="'appointments.discount' | t" />
            <enzo-text-input formControlName="notes" [label]="'appointments.notes' | t" />
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
          <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <enzo-search-input formControlName="customerSearch" [label]="'appointments.customerSearch' | t" />
            <div class="flex items-end">
              <button enzoButton type="button" variant="secondary" (click)="findCustomers()">{{ 'common.search' | t }}</button>
            </div>
          </div>
        </enzo-card>

        <enzo-card [title]="'appointments.schedule' | t">
          <div class="grid gap-4 md:grid-cols-2">
            <enzo-date-field formControlName="date" [label]="'appointments.date' | t" />
            <enzo-text-input formControlName="time" type="time" [label]="'appointments.time' | t" />
            @if (appointmentId) {
              <enzo-text-input formControlName="reason" [label]="'appointments.reason' | t" />
            }
          </div>
        </enzo-card>

        <enzo-card [title]="'appointments.services' | t">
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
        </enzo-card>

        <div class="flex flex-wrap gap-2">
          <button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/appointments">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class AppointmentFormPage {
  private readonly api = inject(AppointmentApi);
  private readonly catalog = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly branches = inject(BranchContext);
  private readonly formBuilder = inject(FormBuilder);

  readonly appointmentId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.appointmentId ? 'appointments.edit' : 'appointments.add');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly services = signal<ServiceRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly barbers = signal<Array<{ id: string; fullName: string }>>([...SHOP_BARBERS]);
  readonly originalWhen = signal('');

  readonly form = this.formBuilder.nonNullable.group({
    branchId: [this.branches.selectedId(), Validators.required],
    customerId: ['', Validators.required],
    customerSearch: [''],
    barberEmployeeId: ['', Validators.required],
    extraBarbers: this.formBuilder.array<ReturnType<AppointmentFormPage['barberGroup']>>([]),
    discount: [0, [Validators.min(0)]],
    notes: [''],
    date: ['', Validators.required],
    time: ['10:00', Validators.required],
    reason: [''],
    services: this.formBuilder.array([this.serviceGroup()]),
  });

  constructor() {
    this.form.controls.branchId.valueChanges.subscribe((branchId) => {
      if (branchId) {
        this.loadBarbers(branchId);
      }
    });
    this.catalog.services({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.services.set(result.data),
      error: () => this.services.set([]),
    });
    const branchId = this.form.controls.branchId.value;
    if (branchId) {
      this.loadBarbers(branchId);
    }
    if (!this.appointmentId) {
      this.loading.set(false);
      return;
    }
    this.api.get(this.appointmentId).subscribe({
      next: (result) => {
        const item = result.data;
        if (item.status !== 'PENDING' && item.status !== 'CONFIRMED') {
          this.loadError.set(this.i18n.translate('appointments.closed'));
          this.loading.set(false);
          return;
        }
        const when = this.splitWhen(item.scheduledAt);
        this.originalWhen.set(item.scheduledAt);
        this.form.controls.services.clear();
        for (const line of item.services) {
          this.form.controls.services.push(this.serviceGroup(line.serviceId, line.quantity));
        }
        this.form.controls.extraBarbers.clear();
        for (const barberId of item.extraBarberIds ?? []) {
          this.form.controls.extraBarbers.push(this.barberGroup(barberId));
        }
        this.form.patchValue({
          branchId: item.branchId,
          customerId: item.customerId,
          barberEmployeeId: item.barberEmployeeId,
          discount: item.discount,
          notes: item.notes,
          date: when.date,
          time: when.time,
        });
        this.customers.set([{
          id: item.customerId,
          customerNumber: '',
          fullName: item.customerName,
          phone: '',
          email: '',
          dateOfBirth: '',
          gender: '',
          address: '',
          notes: '',
          status: 'ACTIVE',
          createdAt: '',
          updatedAt: '',
        }]);
        this.loadBarbers(item.branchId);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
        this.loading.set(false);
      },
    });
  }

  protected breadcrumbs() {
    return [
      { labelKey: 'nav.dashboard', link: '/dashboard' },
      { labelKey: 'nav.appointments', link: '/appointments' },
      { labelKey: this.titleKey() },
    ];
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected customerOptions(): SelectOption[] {
    return this.customers().map((customer) => ({ value: customer.id, label: customer.fullName }));
  }

  protected barberOptions(): SelectOption[] {
    return this.barbers().map((barber) => ({ value: barber.id, label: barber.fullName }));
  }

  protected serviceOptions(): SelectOption[] {
    return this.services().map((service) => ({ value: service.id, label: localizedLabel(service.name, this.i18n.language()) }));
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

  protected findCustomers(): void {
    const search = this.form.controls.customerSearch.value.trim();
    this.catalog.customers({ page: 1, pageSize: 20, search, status: 'ACTIVE' }).subscribe({
      next: (result) => this.customers.set(result.data),
      error: () => this.customers.set([]),
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const scheduledAt = new Date(`${value.date}T${value.time}`).toISOString();
    if (Number.isNaN(Date.parse(scheduledAt))) {
      this.error.set(this.i18n.translate('appointments.invalidWhen'));
      return;
    }
    const services = value.services.filter((line) => line.serviceId).map((line) => ({ serviceId: line.serviceId, quantity: Number(line.quantity) || 1 }));
    if (services.length === 0) {
      this.error.set(this.i18n.translate('appointments.serviceRequired'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const extraBarberIds = value.extraBarbers.map((row) => row.barberEmployeeId).filter((id) => id.length > 0);
    const body = {
      customerId: value.customerId,
      barberEmployeeId: value.barberEmployeeId,
      extraBarberIds,
      services,
      discount: Number(value.discount) || 0,
      notes: value.notes,
    };
    const request = this.appointmentId
      ? this.api.update(this.appointmentId, body)
      : this.api.create({ ...body, branchId: value.branchId, scheduledAt });
    request.subscribe({
      next: (result) => {
        const changed = this.appointmentId && scheduledAt !== this.originalWhen();
        if (!changed || !this.appointmentId) {
          this.toasts.success(this.i18n.translate('appointments.saved'));
          void this.router.navigate(['/appointments', result.data.id]);
          return;
        }
        this.api.reschedule(this.appointmentId, scheduledAt, value.reason).subscribe({
          next: (rescheduled) => {
            this.toasts.success(this.i18n.translate('appointments.rescheduled'));
            void this.router.navigate(['/appointments', rescheduled.data.id]);
          },
          error: (error: unknown) => {
            this.saving.set(false);
            this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
          },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
      },
    });
  }

  private loadBarbers(branchId: string): void {
    this.applyBarbers(SHOP_BARBERS);
    this.api.barbers(branchId).subscribe({
      next: (result) => this.applyBarbers(mergeBarbers(result.data)),
      error: () => this.applyBarbers(SHOP_BARBERS),
    });
  }

  private applyBarbers(barbers: Array<{ id: string; fullName: string }>): void {
    this.barbers.set(barbers);
    if (!this.form.controls.barberEmployeeId.value && barbers[0]) {
      this.form.controls.barberEmployeeId.setValue(barbers[0].id);
    }
  }

  protected addBarber(): void {
    this.form.controls.extraBarbers.push(this.barberGroup());
  }

  protected removeBarber(index: number): void {
    this.form.controls.extraBarbers.removeAt(index);
  }

  private barberGroup(barberEmployeeId = '') {
    return this.formBuilder.nonNullable.group({
      barberEmployeeId: [barberEmployeeId, Validators.required],
    });
  }

  private serviceGroup(serviceId = '', quantity = 1) {
    return this.formBuilder.nonNullable.group({
      serviceId: [serviceId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(1)]],
    });
  }

  private splitWhen(value: string): { date: string; time: string } {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { date: '', time: '' };
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return { date: `${date.getFullYear()}-${month}-${day}`, time: `${hours}:${minutes}` };
  }
}
