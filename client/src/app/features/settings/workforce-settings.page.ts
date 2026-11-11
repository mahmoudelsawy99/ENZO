import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import type { CatalogItem, CommissionConfig } from '../organization/organization.models';

@Component({
  selector: 'app-workforce-settings-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Card, TextInput, Select, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'workforce.title' | t" [description]="'workforce.description' | t" [breadcrumbs]="breadcrumbs" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <div class="grid gap-4 lg:grid-cols-2">
        <enzo-card [title]="'workforce.employmentTypes' | t">
          <form class="mb-4 flex flex-wrap gap-2" [formGroup]="typeForm" (ngSubmit)="addType()">
            <div class="min-w-48 flex-1"><enzo-text-input formControlName="name" [label]="'workforce.name' | t" /></div>
            <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'workforce.add' | t }}</button></div>
          </form>
          <ul class="grid gap-2 text-sm">
            @for (item of types(); track item.id) {
              <li class="flex items-center justify-between gap-2 border-b border-border py-2">
                <span>{{ item.name }}</span>
                <button enzoButton size="sm" variant="ghost" type="button" (click)="toggleType(item)">{{ (item.status === 'ACTIVE' ? 'workforce.disable' : 'workforce.enable') | t }}</button>
              </li>
            }
          </ul>
        </enzo-card>
        <enzo-card [title]="'workforce.jobTitles' | t">
          <form class="mb-4 flex flex-wrap gap-2" [formGroup]="titleForm" (ngSubmit)="addTitle()">
            <div class="min-w-48 flex-1"><enzo-text-input formControlName="name" [label]="'workforce.name' | t" /></div>
            <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'workforce.add' | t }}</button></div>
          </form>
          <ul class="grid gap-2 text-sm">
            @for (item of titles(); track item.id) {
              <li class="flex items-center justify-between gap-2 border-b border-border py-2">
                <span>{{ item.name }}</span>
                <button enzoButton size="sm" variant="ghost" type="button" (click)="toggleTitle(item)">{{ (item.status === 'ACTIVE' ? 'workforce.disable' : 'workforce.enable') | t }}</button>
              </li>
            }
          </ul>
        </enzo-card>
        <enzo-card [title]="'workforce.defaultCommission' | t" [description]="'workforce.priority' | t">
          <form class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]" [formGroup]="defaultForm" (ngSubmit)="saveDefault()">
            <enzo-select formControlName="kind" [label]="'workforce.kind' | t" [options]="kindOptions()" />
            <enzo-text-input formControlName="value" type="number" [label]="'workforce.value' | t" />
            <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.save' | t }}</button></div>
          </form>
        </enzo-card>
        <enzo-card [title]="'workforce.serviceCommission' | t">
          <form class="grid gap-3" [formGroup]="serviceForm" (ngSubmit)="saveService()">
            <div class="grid gap-3 md:grid-cols-2">
              <enzo-text-input formControlName="serviceCode" [label]="'workforce.serviceCode' | t" />
              <enzo-text-input formControlName="serviceName" [label]="'workforce.serviceName' | t" />
              <enzo-select formControlName="kind" [label]="'workforce.kind' | t" [options]="kindOptions()" />
              <enzo-text-input formControlName="value" type="number" [label]="'workforce.value' | t" />
            </div>
            <button enzoButton type="submit" variant="secondary">{{ 'workforce.add' | t }}</button>
          </form>
          <ul class="mt-4 grid gap-2 text-sm">
            @for (rule of commission()?.services ?? []; track rule.id) {
              <li class="flex items-center justify-between gap-2 border-b border-border py-2">
                <span>{{ rule.serviceName }} · {{ rule.serviceCode }} · {{ rule.kind === 'PERCENTAGE' ? rule.value + '%' : rule.value }}</span>
                <button enzoButton size="sm" variant="ghost" type="button" (click)="disableService(rule.id)">{{ 'workforce.disable' | t }}</button>
              </li>
            }
          </ul>
        </enzo-card>
      </div>
    }
  `,
})
export class WorkforceSettingsPage {
  private readonly api = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.settings' }];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly types = signal<CatalogItem[]>([]);
  readonly titles = signal<CatalogItem[]>([]);
  readonly commission = signal<CommissionConfig | null>(null);
  readonly typeForm = this.formBuilder.nonNullable.group({ name: ['', Validators.required] });
  readonly titleForm = this.formBuilder.nonNullable.group({ name: ['', Validators.required] });
  readonly defaultForm = this.formBuilder.nonNullable.group({
    kind: ['PERCENTAGE' as 'PERCENTAGE' | 'FIXED'],
    value: [0],
  });
  readonly serviceForm = this.formBuilder.nonNullable.group({
    serviceCode: ['', Validators.required],
    serviceName: ['', Validators.required],
    kind: ['PERCENTAGE' as 'PERCENTAGE' | 'FIXED'],
    value: [0],
  });

  constructor() {
    this.load();
  }

  protected kindOptions(): SelectOption[] {
    this.i18n.language();
    return [
      { value: 'PERCENTAGE', label: this.i18n.translate('workforce.percentage') },
      { value: 'FIXED', label: this.i18n.translate('workforce.fixed') },
    ];
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.employmentTypes().subscribe({
      next: (types) => {
        this.types.set(types.data);
        this.api.jobTitles().subscribe({
          next: (titles) => {
            this.titles.set(titles.data);
            this.api.commissions().subscribe({
              next: (commission) => {
                this.commission.set(commission.data);
                this.defaultForm.patchValue({ kind: commission.data.defaultRule.kind, value: commission.data.defaultRule.value });
                this.loading.set(false);
              },
              error: (error: unknown) => this.fail(error),
            });
          },
          error: (error: unknown) => this.fail(error),
        });
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected addType(): void {
    const name = this.typeForm.controls.name.value.trim();
    if (!name) return;
    this.api.addEmploymentType(name).subscribe({
      next: () => {
        this.typeForm.reset();
        this.reloadCatalogs();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected addTitle(): void {
    const name = this.titleForm.controls.name.value.trim();
    if (!name) return;
    this.api.addJobTitle(name).subscribe({
      next: () => {
        this.titleForm.reset();
        this.reloadCatalogs();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected toggleType(item: CatalogItem): void {
    this.api.employmentTypeStatus(item.id, item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE').subscribe({
      next: () => this.reloadCatalogs(),
      error: (error: unknown) => this.fail(error),
    });
  }

  protected toggleTitle(item: CatalogItem): void {
    this.api.jobTitleStatus(item.id, item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE').subscribe({
      next: () => this.reloadCatalogs(),
      error: (error: unknown) => this.fail(error),
    });
  }

  protected saveDefault(): void {
    const value = this.defaultForm.getRawValue();
    this.api.saveDefaultCommission(value.kind, Number(value.value) || 0).subscribe({
      next: (response) => {
        this.commission.set(response.data);
        this.toasts.success(this.i18n.translate('workforce.saved'));
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected saveService(): void {
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }
    const value = this.serviceForm.getRawValue();
    this.api.saveServiceCommission({ ...value, value: Number(value.value) || 0 }).subscribe({
      next: (response) => {
        this.commission.set(response.data);
        this.serviceForm.reset({ serviceCode: '', serviceName: '', kind: 'PERCENTAGE', value: 0 });
        this.toasts.success(this.i18n.translate('workforce.saved'));
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected disableService(id: string): void {
    this.api.disableServiceCommission(id).subscribe({
      next: (response) => this.commission.set(response.data),
      error: (error: unknown) => this.fail(error),
    });
  }

  private reloadCatalogs(): void {
    this.api.employmentTypes().subscribe({ next: (result) => this.types.set(result.data) });
    this.api.jobTitles().subscribe({ next: (result) => this.titles.set(result.data) });
    this.toasts.success(this.i18n.translate('workforce.saved'));
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    const message = error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody');
    this.error.set(message);
    this.toasts.warning(message);
  }
}
