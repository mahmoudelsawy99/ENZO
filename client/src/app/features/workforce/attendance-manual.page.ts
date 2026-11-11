import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { OrganizationApi } from '../organization/organization.api';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';
import type { AttendanceRow } from './workforce.models';

@Component({
  selector: 'app-attendance-manual-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Select, TextInput, EmptyState],
  template: `
    <enzo-page-header [title]="'work.manual' | t" [description]="'work.manualDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]">
      <a enzoButton variant="secondary" routerLink="/attendance/daily">{{ 'work.daily' | t }}</a>
    </enzo-page-header>
    @if (!access.can('attendance.manual-entry') && !access.can('attendance.correct')) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="shield" [title]="'work.noAccess' | t" [description]="'work.noAccessBody' | t" /></div>
    } @else {
      @if (access.can('attendance.manual-entry')) {
        <form class="mb-6 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2" [formGroup]="punchForm" (ngSubmit)="punch('in')">
          <enzo-select formControlName="employeeId" [label]="'work.employee' | t" [options]="employeeOptions()" />
          <enzo-text-input formControlName="notes" [label]="'work.notes' | t" />
          <div class="flex flex-wrap gap-2 md:col-span-2">
            <button enzoButton type="submit" [loading]="saving()">{{ 'work.checkIn' | t }}</button>
            <button enzoButton type="button" variant="secondary" [loading]="saving()" (click)="punch('out')">{{ 'work.checkOut' | t }}</button>
          </div>
        </form>
      }
      @if (access.can('attendance.correct')) {
        <form class="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2" [formGroup]="correctForm" (ngSubmit)="correct()">
          <h2 class="font-medium md:col-span-2">{{ 'work.correct' | t }}</h2>
          <enzo-select formControlName="attendanceId" [label]="'work.record' | t" [options]="recordOptions()" />
          <enzo-text-input formControlName="checkIn" [label]="'work.checkInTime' | t" hint="HH:mm" />
          <enzo-text-input formControlName="checkOut" [label]="'work.checkOutTime' | t" hint="HH:mm" />
          <enzo-text-input formControlName="notes" [label]="'work.notes' | t" />
          <div class="md:col-span-2"><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
        </form>
      }
    }
  `,
})
export class AttendanceManualPage {
  private readonly api = inject(WorkforceApi);
  private readonly people = inject(OrganizationApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly employees = signal<SelectOption[]>([]);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly saving = signal(false);
  protected readonly punchForm = this.formBuilder.nonNullable.group({
    employeeId: ['', Validators.required],
    notes: '',
  });
  protected readonly correctForm = this.formBuilder.nonNullable.group({
    attendanceId: ['', Validators.required],
    checkIn: '',
    checkOut: '',
    notes: ['', Validators.required],
  });

  constructor() {
    this.people.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (result) => this.employees.set(result.data.map((employee) => ({ value: employee.id, label: employee.fullName }))),
    });
    this.loadToday();
  }

  protected employeeOptions(): SelectOption[] {
    return this.employees();
  }

  protected recordOptions(): SelectOption[] {
    return this.rows().map((row) => ({ value: row.id, label: `${row.employeeName} · ${row.attendanceDate}` }));
  }

  protected punch(action: 'in' | 'out'): void {
    if (this.punchForm.invalid) {
      this.punchForm.markAllAsTouched();
      return;
    }
    const branchId = this.branchId();
    if (!branchId) {
      this.toast.danger(this.i18n.translate('work.pickBranch'));
      return;
    }
    this.saving.set(true);
    const body = this.punchForm.getRawValue();
    const request = action === 'in' ? this.api.checkIn(body.employeeId, branchId, body.notes) : this.api.checkOut(body.employeeId, branchId, body.notes);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('work.saved'));
        this.loadToday();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected correct(): void {
    if (this.correctForm.invalid) {
      this.correctForm.markAllAsTouched();
      return;
    }
    const row = this.rows().find((item) => item.id === this.correctForm.controls.attendanceId.value);
    if (!row) {
      return;
    }
    this.saving.set(true);
    const body = this.correctForm.getRawValue();
    this.api.correct(row.id, {
      checkInTime: clockToIso(row.attendanceDate, body.checkIn),
      checkOutTime: clockToIso(row.attendanceDate, body.checkOut),
      notes: body.notes,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('work.saved'));
        this.loadToday();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private branchId(): string {
    return this.branches.selectedId() || this.branches.branches()[0]?.id || '';
  }

  private loadToday(): void {
    const branchId = this.branchId();
    if (!branchId) {
      return;
    }
    const date = today();
    this.api.attendance(branchId, date, date).subscribe({
      next: (result) => this.rows.set(result.data),
    });
  }
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function clockToIso(date: string, clock: string): string {
  if (!/^\d{2}:\d{2}$/.test(clock)) {
    return '';
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0).toISOString();
}
