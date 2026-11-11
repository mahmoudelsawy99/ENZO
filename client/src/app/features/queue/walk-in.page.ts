import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { AppointmentApi } from '../appointments/appointment.api';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type CustomerRecord, type ServiceRecord } from '../catalog/catalog.models';

@Component({
  selector: 'app-walk-in-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, SearchInput, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'queue.walkIn' | t" [description]="'queue.walkInDescription' | t" [breadcrumbs]="breadcrumbs" />
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
            <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
            <enzo-select formControlName="barberEmployeeId" [label]="'appointments.barber' | t" [options]="barberOptions()" />
            <enzo-select formControlName="mode" [label]="'queue.customerMode' | t" [options]="modeOptions()" />
            @if (form.controls.mode.value === 'existing') {
              <enzo-select formControlName="customerId" [label]="'appointments.customer' | t" [options]="customerOptions()" />
            } @else {
              <enzo-text-input formControlName="fullName" [label]="'customers.name' | t" [required]="true" />
              <enzo-text-input formControlName="phone" type="tel" [label]="'customers.phone' | t" />
            }
            <enzo-text-input formControlName="notes" [label]="'appointments.notes' | t" />
          </div>
          @if (form.controls.mode.value === 'existing') {
            <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <enzo-search-input formControlName="customerSearch" [label]="'appointments.customerSearch' | t" />
              <div class="flex items-end">
                <button enzoButton type="button" variant="secondary" (click)="findCustomers()">{{ 'common.search' | t }}</button>
              </div>
            </div>
          }
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
          <button enzoButton type="submit" [loading]="saving()">{{ 'queue.addToQueue' | t }}</button>
          <a enzoButton variant="secondary" routerLink="/queue">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class WalkInPage {
  private readonly api = inject(AppointmentApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly branches = inject(BranchContext);
  private readonly formBuilder = inject(FormBuilder);

  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.queue', link: '/queue' },
    { labelKey: 'queue.walkIn' },
  ];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly services = signal<ServiceRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly barbers = signal<Array<{ id: string; fullName: string }>>([]);
  readonly form = this.formBuilder.nonNullable.group({
    branchId: [this.branches.selectedId(), Validators.required],
    mode: ['existing' as 'existing' | 'new'],
    customerId: [''],
    customerSearch: [''],
    fullName: [''],
    phone: [''],
    barberEmployeeId: ['', Validators.required],
    extraBarbers: this.formBuilder.array<ReturnType<WalkInPage['barberGroup']>>([]),
    notes: [''],
    services: this.formBuilder.array([this.serviceGroup()]),
  });

  constructor() {
    const branchId = this.form.controls.branchId.value;
    if (!branchId) {
      this.loadError.set(this.i18n.translate('queue.branchRequired'));
      this.loading.set(false);
      return;
    }
    this.form.controls.branchId.valueChanges.subscribe((next) => {
      if (next) {
        this.loadBarbers(next);
      }
    });
    this.catalog.services({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => {
        this.services.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
        this.loading.set(false);
      },
    });
    this.loadBarbers(branchId);
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected barberOptions(): SelectOption[] {
    return this.barbers().map((barber) => ({ value: barber.id, label: barber.fullName }));
  }

  protected customerOptions(): SelectOption[] {
    return this.customers().map((customer) => ({ value: customer.id, label: customer.fullName }));
  }

  protected serviceOptions(): SelectOption[] {
    return this.services().map((service) => ({ value: service.id, label: localizedLabel(service.name, this.i18n.language()) }));
  }

  protected modeOptions(): SelectOption[] {
    return [
      { value: 'existing', label: this.i18n.translate('queue.existingCustomer') },
      { value: 'new', label: this.i18n.translate('queue.newCustomer') },
    ];
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

  protected findCustomers(): void {
    this.catalog.customers({ page: 1, pageSize: 20, search: this.form.controls.customerSearch.value.trim(), status: 'ACTIVE' }).subscribe({
      next: (result) => this.customers.set(result.data),
      error: () => this.customers.set([]),
    });
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const services = value.services.filter((line) => line.serviceId).map((line) => ({ serviceId: line.serviceId, quantity: Number(line.quantity) || 1 }));
    if (!value.branchId || !value.barberEmployeeId || services.length === 0) {
      this.error.set(this.i18n.translate('appointments.serviceRequired'));
      return;
    }
    if (value.mode === 'existing' && !value.customerId) {
      this.error.set(this.i18n.translate('queue.customerRequired'));
      return;
    }
    if (value.mode === 'new' && value.fullName.trim().length < 2) {
      this.error.set(this.i18n.translate('queue.customerRequired'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .walkIn({
        branchId: value.branchId,
        barberEmployeeId: value.barberEmployeeId,
        extraBarberIds: value.extraBarbers.map((row) => row.barberEmployeeId).filter((id) => id.length > 0),
        services,
        notes: value.notes,
        ...(value.mode === 'existing'
          ? { customerId: value.customerId }
          : {
              customer: {
                fullName: value.fullName.trim(),
                phone: value.phone.trim(),
                email: '',
                dateOfBirth: '',
                gender: '' as const,
                address: '',
                notes: '',
              },
            }),
      })
      .subscribe({
        next: (result) => {
          this.toasts.success(this.i18n.translate('queue.added'));
          void this.router.navigate(['/appointments', result.data.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorTitle'));
        },
      });
  }

  private loadBarbers(branchId: string): void {
    this.api.barbers(branchId).subscribe({
      next: (result) => this.barbers.set(result.data),
      error: () => this.barbers.set([]),
    });
  }

  private serviceGroup() {
    return this.formBuilder.nonNullable.group({
      serviceId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
    });
  }
}
