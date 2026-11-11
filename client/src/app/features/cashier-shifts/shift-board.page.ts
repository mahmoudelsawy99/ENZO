import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { FinanceApi } from '../pos/finance.api';
import type { ShiftRecord } from '../pos/finance.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';

@Component({
  selector: 'app-shift-board-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Card, Badge, TextInput, Select, KpiCard, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'finance.shiftsTitle' | t" [description]="'finance.shiftsDescription' | t" [breadcrumbs]="breadcrumbs">
      <a enzoButton variant="secondary" routerLink="/reports">{{ 'finance.dayReport' | t }}</a>
    </enzo-page-header>
    <form class="mb-4 max-w-sm" [formGroup]="branchForm">
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else {
      @if (current(); as shift) {
        <div class="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <enzo-kpi-card [label]="'finance.opening' | t" [value]="money(shift.openingBalance)" />
          <enzo-kpi-card [label]="'finance.cashSales' | t" [value]="money(shift.cashSales)" />
          <enzo-kpi-card [label]="'finance.cashTips' | t" [value]="money(shift.cashTips)" />
          <enzo-kpi-card [label]="'finance.expected' | t" [value]="money(shift.expectedCash ?? 0)" />
        </div>
        <enzo-card [title]="'finance.closeShift' | t">
          <div class="mb-3 flex items-center gap-2">
            <enzo-badge tone="success">{{ 'finance.shiftTypes.' + shift.shiftType | t }}</enzo-badge>
            <span class="text-sm text-text-secondary">{{ 'finance.cashRefunds' | t }}: {{ money(shift.cashRefunds) }}</span>
          </div>
          @if (access.can('cashier-shifts.close')) {
            <form class="grid gap-3 md:grid-cols-2" [formGroup]="closeForm" (ngSubmit)="close(shift.id)">
              <enzo-text-input formControlName="actualCash" type="number" [label]="'finance.actual' | t" />
              <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'finance.closeShift' | t }}</button></div>
            </form>
          }
        </enzo-card>
      } @else {
        <div class="mb-4 rounded-lg border border-border bg-surface">
          <enzo-empty-state [title]="'finance.noShift' | t" [description]="'finance.noShiftBody' | t" icon="wallet" />
        </div>
        @if (access.can('cashier-shifts.open')) {
          <enzo-card [title]="'finance.openShift' | t">
            <form class="grid gap-3 md:grid-cols-3" [formGroup]="openForm" (ngSubmit)="open()">
              <enzo-select formControlName="shiftType" [label]="'finance.shiftType' | t" [options]="shiftTypes()" />
              <enzo-text-input formControlName="openingBalance" type="number" [label]="'finance.opening' | t" />
              <div class="flex items-end"><button enzoButton type="submit" [loading]="saving()">{{ 'finance.openShift' | t }}</button></div>
            </form>
          </enzo-card>
        }
      }
      @if (error()) { <p class="mt-3 text-sm text-danger" role="alert">{{ error() }}</p> }
      <h2 class="mb-3 mt-6 text-sm font-medium text-text-primary">{{ 'finance.history' | t }}</h2>
      @if (history().length === 0) {
        <div class="rounded-lg border border-border bg-surface">
          <enzo-empty-state [title]="'finance.historyEmpty' | t" [description]="'finance.historyEmptyBody' | t" icon="wallet" />
        </div>
      } @else {
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'finance.history' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.shiftType' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.expected' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.actual' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.difference' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (shift of history(); track shift.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3">{{ 'finance.shiftTypes.' + shift.shiftType | t }}</td>
                  <td class="px-4 py-3">{{ money(shift.expectedCash ?? 0) }}</td>
                  <td class="px-4 py-3">{{ shift.actualCash === null ? ('customers.noneYet' | t) : money(shift.actualCash) }}</td>
                  <td class="px-4 py-3">{{ shift.difference === null ? ('customers.noneYet' | t) : money(shift.difference) }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="shift.status === 'OPEN' ? 'success' : 'neutral'">{{ 'status.' + shift.status | t }}</enzo-badge></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class ShiftBoardPage {
  private readonly api = inject(FinanceApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.shifts' }];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly current = signal<ShiftRecord | null>(null);
  readonly history = signal<ShiftRecord[]>([]);
  readonly branchForm = this.formBuilder.nonNullable.group({ branchId: this.branches.selectedId() });
  readonly openForm = this.formBuilder.nonNullable.group({ shiftType: 'MORNING', openingBalance: '0' });
  readonly closeForm = this.formBuilder.nonNullable.group({ actualCash: '0' });

  constructor() {
    effect(() => {
      const selected = this.branches.selectedId() || this.branches.branches()[0]?.id || '';
      if (selected && !this.branchForm.controls.branchId.value) {
        this.branchForm.controls.branchId.setValue(selected);
      }
    });
    this.branchForm.controls.branchId.valueChanges.subscribe(() => this.load());
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected shiftTypes(): SelectOption[] {
    return ['MORNING', 'EVENING'].map((value) => ({ value, label: this.i18n.translate(`finance.shiftTypes.${value}`) }));
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected load(): void {
    const branchId = this.branchForm.getRawValue().branchId;
    if (!branchId) {
      this.loading.set(false);
      this.current.set(null);
      this.history.set([]);
      return;
    }
    this.loading.set(true);
    this.loadError.set('');
    this.api.currentShift(branchId).subscribe({
      next: (result) => this.current.set(result.data),
      error: (error: unknown) => this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
    this.api.shifts(branchId, 1, 20).subscribe({
      next: (result) => {
        this.history.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected open(): void {
    const branchId = this.branchForm.getRawValue().branchId;
    const raw = this.openForm.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.api.openShift({ branchId, shiftType: raw.shiftType, openingBalance: Number(raw.openingBalance) || 0 }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('finance.shiftOpened'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected close(id: string): void {
    this.saving.set(true);
    this.error.set('');
    this.api.closeShift(id, Number(this.closeForm.getRawValue().actualCash) || 0).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('finance.shiftClosed'));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
