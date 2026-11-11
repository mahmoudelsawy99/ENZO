import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { FinanceApi } from '../pos/finance.api';
import type { CommissionRow } from '../pos/finance.models';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';

@Component({
  selector: 'app-commission-summary-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Button, Select, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'finance.commissionsTitle' | t" [description]="'finance.commissionsDescription' | t" [breadcrumbs]="breadcrumbs" />
    <form class="mb-4 grid gap-3 md:grid-cols-3" [formGroup]="filters" (ngSubmit)="load()">
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'finance.commissionsEmpty' | t" [description]="'finance.commissionsEmptyBody' | t" icon="banknote" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'finance.commissionsTitle' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.employee' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.services' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.commission' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (item of items(); track item.employeeId) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ item.employeeName }}</td>
                <td class="px-4 py-3">{{ text(item.services) }}</td>
                <td class="px-4 py-3">{{ money(item.commissionAmount) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CommissionSummaryPage {
  private readonly api = inject(FinanceApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.commissions' }];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<CommissionRow[]>([]);
  readonly filters = this.formBuilder.nonNullable.group({ branchId: this.branches.selectedId() });

  constructor() {
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('appointments.allBranches') }, ...this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }))];
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.commissions(this.filters.getRawValue().branchId).subscribe({
      next: (result) => {
        this.items.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
