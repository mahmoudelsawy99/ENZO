import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Button } from '../../shared/ui/button';
import { DateField } from '../../shared/ui/date-field';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkforceApi } from './workforce.api';

@Component({
  selector: 'app-attendance-rules-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Button, TextInput, DateField, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="'work.rules' | t" [description]="'work.rulesDescription' | t" [breadcrumbs]="[{ labelKey: 'work.attendance', link: '/attendance' }]" />
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      <form class="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3" [formGroup]="form" (ngSubmit)="save()">
        <enzo-select formControlName="scope" [label]="'work.scope' | t" [options]="scopeOptions()" />
        <enzo-text-input formControlName="graceMinutes" type="number" [label]="'work.grace' | t" />
        <enzo-text-input formControlName="earlyLeaveGraceMinutes" type="number" [label]="'work.earlyGrace' | t" />
        <enzo-text-input formControlName="halfDayRatio" type="number" [label]="'work.halfDay' | t" />
        <enzo-text-input formControlName="overtimeRoundingMinutes" type="number" [label]="'work.rounding' | t" />
        <enzo-text-input formControlName="weeklyDaysOff" [label]="'work.daysOff' | t" />
        <enzo-text-input formControlName="lateDeductionPerMinute" type="number" [label]="'work.lateRate' | t" />
        <enzo-text-input formControlName="earlyLeaveDeductionPerMinute" type="number" [label]="'work.earlyRate' | t" />
        <enzo-select formControlName="absenceDeductionMode" [label]="'work.absenceMode' | t" [options]="modeOptions()" />
        <enzo-text-input formControlName="dailyRateDays" type="number" [label]="'work.dailyRateDays' | t" />
        <enzo-text-input formControlName="halfDayFactor" type="number" [label]="'work.halfFactor' | t" />
        <enzo-text-input formControlName="overtimeMultiplier" type="number" [label]="'work.overtimeRate' | t" />
        <enzo-text-input formControlName="monthlyHours" type="number" [label]="'work.monthlyHours' | t" />
        <enzo-date-field formControlName="holidayDate" [label]="'work.holidayDate' | t" />
        <enzo-text-input formControlName="holidayName" [label]="'work.holidayName' | t" />
        @if (access.can('attendance.rules.manage')) {
          <div class="md:col-span-3"><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
        }
      </form>
      <p class="mt-3 text-sm text-text-secondary">{{ 'work.rulesMoneyHint' | t }}</p>
    }
  `,
})
export class AttendanceRulesPage {
  private readonly api = inject(WorkforceApi);
  private readonly branches = inject(BranchContext);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly access = inject(TenantAccess);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  private holidays: Array<{ date: string; name: string }> = [];
  protected readonly form = this.formBuilder.nonNullable.group({
    scope: 'tenant',
    graceMinutes: ['15', Validators.required],
    earlyLeaveGraceMinutes: ['0', Validators.required],
    halfDayRatio: ['0.5', Validators.required],
    overtimeRoundingMinutes: ['0', Validators.required],
    weeklyDaysOff: '5',
    lateDeductionPerMinute: '0',
    earlyLeaveDeductionPerMinute: '0',
    absenceDeductionMode: 'NONE',
    dailyRateDays: '30',
    halfDayFactor: '0.5',
    overtimeMultiplier: '1.5',
    monthlyHours: '208',
    holidayDate: '',
    holidayName: '',
  });

  constructor() {
    this.load();
  }

  protected scopeOptions(): SelectOption[] {
    return [
      { value: 'tenant', label: this.i18n.translate('work.tenantDefault') },
      { value: 'branch', label: this.i18n.translate('work.branchOverride') },
    ];
  }

  protected modeOptions(): SelectOption[] {
    return [
      { value: 'NONE', label: this.i18n.translate('work.modeNone') },
      { value: 'DAILY_RATE', label: this.i18n.translate('work.modeDaily') },
    ];
  }

  protected load(): void {
    this.loading.set(true);
    this.api.policy('').subscribe({
      next: (result) => {
        const policy = result.data;
        this.holidays = policy.publicHolidays ?? [];
        this.form.patchValue({
          graceMinutes: String(policy.graceMinutes),
          earlyLeaveGraceMinutes: String(policy.earlyLeaveGraceMinutes),
          halfDayRatio: String(policy.halfDayRatio),
          overtimeRoundingMinutes: String(policy.overtimeRoundingMinutes),
          weeklyDaysOff: policy.weeklyDaysOff.join(','),
          lateDeductionPerMinute: String(policy.lateDeductionPerMinute),
          earlyLeaveDeductionPerMinute: String(policy.earlyLeaveDeductionPerMinute),
          absenceDeductionMode: policy.absenceDeductionMode,
          dailyRateDays: String(policy.dailyRateDays),
          halfDayFactor: String(policy.halfDayFactor),
          overtimeMultiplier: String(policy.overtimeMultiplier),
          monthlyHours: String(policy.monthlyHours),
        });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const holidays = [...this.holidays];
    if (value.holidayDate && value.holidayName.trim()) {
      holidays.push({ date: value.holidayDate, name: value.holidayName.trim() });
    }
    const branchId = value.scope === 'branch' ? this.branches.selectedId() || this.branches.branches()[0]?.id || '' : '';
    this.saving.set(true);
    this.api.savePolicy({
      branchId,
      graceMinutes: Number(value.graceMinutes),
      earlyLeaveGraceMinutes: Number(value.earlyLeaveGraceMinutes),
      halfDayRatio: Number(value.halfDayRatio),
      overtimeRoundingMinutes: Number(value.overtimeRoundingMinutes),
      weeklyDaysOff: value.weeklyDaysOff.split(',').map((item) => Number(item.trim())).filter((item) => item >= 0 && item <= 6),
      publicHolidays: holidays,
      lateDeductionPerMinute: Number(value.lateDeductionPerMinute),
      earlyLeaveDeductionPerMinute: Number(value.earlyLeaveDeductionPerMinute),
      absenceDeductionMode: value.absenceDeductionMode === 'DAILY_RATE' ? 'DAILY_RATE' : 'NONE',
      dailyRateDays: Number(value.dailyRateDays),
      halfDayFactor: Number(value.halfDayFactor),
      overtimeMultiplier: Number(value.overtimeMultiplier),
      monthlyHours: Number(value.monthlyHours),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.holidays = holidays;
        this.toast.success(this.i18n.translate('work.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.danger(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
