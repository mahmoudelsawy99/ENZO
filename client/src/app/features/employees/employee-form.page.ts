import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DateField } from '../../shared/ui/date-field';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import type { AccessSnapshot, CatalogItem } from '../organization/organization.models';

@Component({
  selector: 'app-employee-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Card, TextInput, Select, DateField, Button, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="titleKey() | t" [description]="'employees.formDescription' | t" [breadcrumbs]="breadcrumbs()" />
    <ol class="mb-6 grid gap-2 sm:grid-cols-4">
      @for (label of stepKeys; track label; let index = $index) {
        <li class="rounded-md border px-3 py-2 text-sm" [class.border-brand-red]="step() === index" [class.bg-surface]="step() === index" [class.border-border]="step() !== index" [attr.aria-current]="step() === index ? 'step' : null">
          {{ index + 1 }}. {{ label | t }}
        </li>
      }
    </ol>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" />
    } @else {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="next()">
        @if (error()) {
          <p class="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{{ error() }}</p>
        }
        @if (step() === 0) {
          <enzo-card [title]="'employees.personal' | t">
            <div class="grid gap-4 md:grid-cols-2">
              <enzo-text-input formControlName="fullName" [label]="'employees.name' | t" [required]="true" />
              <enzo-text-input formControlName="email" [label]="'employees.email' | t" type="email" />
              <enzo-text-input formControlName="phone" [label]="'employees.phone' | t" />
              <enzo-text-input formControlName="nationalId" [label]="'employees.nationalId' | t" [hint]="'employees.nationalIdHint' | t" />
              <enzo-text-input formControlName="address" [label]="'employees.address' | t" />
              <enzo-date-field formControlName="dateOfBirth" [label]="'employees.birthDate' | t" />
              <div class="md:col-span-2">
                <label class="grid gap-1 text-sm">
                  <span class="text-text-secondary">{{ 'employees.photo' | t }}</span>
                  <input class="enzo-control" type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onPhoto($event)" />
                </label>
                @if (form.controls.profileImage.value) {
                  <img class="mt-3 size-16 rounded-md border border-border object-cover" [src]="form.controls.profileImage.value" alt="" />
                }
              </div>
            </div>
          </enzo-card>
        }
        @if (step() === 1) {
          <enzo-card [title]="'employees.employment' | t">
            <div class="grid gap-4 md:grid-cols-2">
              <enzo-text-input formControlName="employeeNumber" [label]="'employees.number' | t" [hint]="'employees.numberHint' | t" />
              <enzo-date-field formControlName="joiningDate" [label]="'employees.joiningDate' | t" [required]="true" />
              <enzo-select formControlName="employmentTypeId" [label]="'employees.employmentType' | t" [options]="catalogOptions(employmentTypes())" [required]="true" />
              <enzo-select formControlName="jobTitleId" [label]="'employees.jobTitle' | t" [options]="catalogOptions(jobTitles())" [required]="true" />
              <div class="md:col-span-2">
                <enzo-text-input formControlName="notes" [label]="'employees.notes' | t" />
              </div>
            </div>
          </enzo-card>
        }
        @if (step() === 2) {
          <enzo-card [title]="'employees.branches' | t" [description]="'employees.branchesHint' | t">
            @if (branchChoices().length === 0) {
              <p class="text-sm text-text-secondary">{{ 'employees.noBranches' | t }}</p>
            }
            <ul class="grid gap-3">
              @for (branch of branchChoices(); track branch.id) {
                <li class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input class="enzo-check" type="checkbox" [checked]="isSelected(branch.id)" (change)="toggleBranch(branch.id, $event)" />
                    <span>{{ branch.name }}</span>
                  </label>
                  <label class="inline-flex items-center gap-2 text-sm text-text-secondary">
                    <input type="radio" name="primaryBranch" [checked]="primaryId() === branch.id" [disabled]="!isSelected(branch.id)" (change)="primaryId.set(branch.id)" />
                    <span>{{ 'employees.primary' | t }}</span>
                  </label>
                </li>
              }
            </ul>
          </enzo-card>
        }
        @if (step() === 3) {
          <enzo-card [title]="'employees.salary' | t" [description]="'employees.salaryHint' | t">
            <div class="grid gap-4 md:grid-cols-2" formGroupName="salary">
              <enzo-select formControlName="period" [label]="'employees.period' | t" [options]="periodOptions()" />
              <enzo-text-input formControlName="basicSalary" type="number" [label]="'employees.basic' | t" />
              <enzo-text-input formControlName="allowances" type="number" [label]="'employees.allowances' | t" />
              <enzo-text-input formControlName="tips" type="number" [label]="'employees.tips' | t" />
              <enzo-text-input formControlName="deductions" type="number" [label]="'employees.deductions' | t" />
            </div>
            <p class="mt-4 text-sm text-text-secondary">{{ 'employees.formula' | t }}</p>
          </enzo-card>
        }
        <div class="flex flex-wrap gap-2">
          @if (step() > 0) {
            <button enzoButton type="button" variant="secondary" (click)="step.set(step() - 1)">{{ 'common.previous' | t }}</button>
          }
          <button enzoButton type="submit" [loading]="saving()">{{ (step() === 3 ? 'common.save' : 'common.next') | t }}</button>
          <a enzoButton variant="ghost" routerLink="/employees">{{ 'common.cancel' | t }}</a>
        </div>
      </form>
    }
  `,
})
export class EmployeeFormPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  readonly stepKeys = ['employees.personal', 'employees.employment', 'employees.branches', 'employees.salary'];
  readonly step = signal(0);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly employmentTypes = signal<CatalogItem[]>([]);
  readonly jobTitles = signal<CatalogItem[]>([]);
  readonly branchChoices = signal<AccessSnapshot['branches']>([]);
  readonly selectedBranches = signal<string[]>([]);
  readonly primaryId = signal('');
  readonly employeeId = this.route.snapshot.paramMap.get('id');
  readonly titleKey = signal(this.employeeId ? 'employees.edit' : 'employees.add');
  readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: [''],
    phone: [''],
    nationalId: [''],
    address: [''],
    dateOfBirth: [''],
    profileImage: [''],
    employeeNumber: [''],
    joiningDate: ['', Validators.required],
    employmentTypeId: ['', Validators.required],
    jobTitleId: ['', Validators.required],
    notes: [''],
    salary: this.formBuilder.nonNullable.group({
      period: ['MONTHLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY'],
      basicSalary: [0],
      allowances: [0],
      tips: [0],
      deductions: [0],
    }),
  });

  constructor() {
    Promise.all([
      firstValueFrom(this.api.employmentTypes()),
      firstValueFrom(this.api.jobTitles()),
      firstValueFrom(this.api.access()),
      this.employeeId ? firstValueFrom(this.api.employee(this.employeeId)) : Promise.resolve(null),
    ])
      .then(([types, titles, access, employee]) => {
        this.employmentTypes.set((types?.data ?? []).filter((item) => item.status === 'ACTIVE'));
        this.jobTitles.set((titles?.data ?? []).filter((item) => item.status === 'ACTIVE'));
        this.branchChoices.set(access?.data.branches ?? []);
        if (employee) {
          const record = employee.data;
          this.form.patchValue({
            fullName: record.fullName,
            email: record.email,
            phone: record.phone,
            address: record.address,
            dateOfBirth: record.dateOfBirth,
            profileImage: record.profileImage,
            employeeNumber: record.employeeNumber,
            joiningDate: record.joiningDate,
            employmentTypeId: record.employmentTypeId,
            jobTitleId: record.jobTitleId,
            notes: record.notes,
            salary: record.salary,
          });
          const active = record.branches.filter((branch) => branch.status === 'ACTIVE');
          this.selectedBranches.set(active.map((branch) => branch.branchId));
          this.primaryId.set(active.find((branch) => branch.isPrimary)?.branchId ?? active[0]?.branchId ?? '');
        }
        this.loading.set(false);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      });
  }

  protected breadcrumbs() {
    return [
      { labelKey: 'nav.dashboard', link: '/dashboard' },
      { labelKey: 'nav.employees', link: '/employees' },
      { labelKey: this.titleKey() },
    ];
  }

  protected catalogOptions(items: CatalogItem[]): SelectOption[] {
    return items.map((item) => ({ value: item.id, label: item.name }));
  }

  protected periodOptions(): SelectOption[] {
    this.i18n.language();
    return (['MONTHLY', 'WEEKLY', 'DAILY'] as const).map((value) => ({ value, label: this.i18n.translate(`employees.period_${value}`) }));
  }

  protected isSelected(id: string): boolean {
    return this.selectedBranches().includes(id);
  }

  protected toggleBranch(id: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    const next = checked ? [...this.selectedBranches(), id] : this.selectedBranches().filter((item) => item !== id);
    this.selectedBranches.set(next);
    if (!next.includes(this.primaryId())) {
      this.primaryId.set(next[0] ?? '');
    }
  }

  protected onPhoto(event: Event): void {
    const input = event.target;
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;
    this.api.uploadPhoto(file).subscribe({
      next: (response) => this.form.controls.profileImage.setValue(response.data.profileImage),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected next(): void {
    this.error.set('');
    if (this.step() === 0 && this.form.controls.fullName.invalid) {
      this.form.controls.fullName.markAsTouched();
      return;
    }
    if (this.step() === 1 && (this.form.controls.joiningDate.invalid || this.form.controls.employmentTypeId.invalid || this.form.controls.jobTitleId.invalid)) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.step() < 3) {
      this.step.update((value) => value + 1);
      return;
    }
    this.save();
  }

  private save(): void {
    const selected = this.selectedBranches();
    const primary = this.primaryId() || selected[0] || '';
    const value = this.form.getRawValue();
    const salary = value.salary;
    this.saving.set(true);
    this.api
      .saveEmployee(
        {
          employeeNumber: value.employeeNumber.trim(),
          fullName: value.fullName.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          profileImage: value.profileImage,
          nationalId: value.nationalId.trim(),
          address: value.address.trim(),
          dateOfBirth: value.dateOfBirth,
          joiningDate: value.joiningDate,
          employmentTypeId: value.employmentTypeId,
          jobTitleId: value.jobTitleId,
          notes: value.notes.trim(),
          salary: {
            period: salary.period,
            basicSalary: Number(salary.basicSalary) || 0,
            allowances: Number(salary.allowances) || 0,
            tips: Number(salary.tips) || 0,
            deductions: Number(salary.deductions) || 0,
          },
          branches: selected.map((branchId) => ({ branchId, isPrimary: branchId === primary })),
        },
        this.employeeId ?? undefined,
      )
      .subscribe({
        next: (response) => {
          this.toasts.success(this.i18n.translate('employees.saved'));
          void this.router.navigate(['/employees', response.data.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
        },
      });
  }
}
