import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { WorkforceApi } from './workforce.api';
import type { PayrollRecord } from './workforce.models';

@Component({
  selector: 'app-payroll-board-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'work.payroll' | t" [description]="'work.payrollDescription' | t">
      <a enzoButton routerLink="/payroll/generate">{{ 'work.generate' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (rows().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="banknote" [title]="'work.emptyPayroll' | t" [description]="'work.emptyPayrollBody' | t" /></div>
    } @else {
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'work.payroll' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.employee' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.period' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.net' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'work.status' | t }}</th>
              <th class="px-4 py-3 text-start" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3">{{ row.employeeName }}</td>
                <td class="px-4 py-3">{{ row.periodStart }} – {{ row.periodEnd }}</td>
                <td class="px-4 py-3">{{ row.netSalary }}</td>
                <td class="px-4 py-3"><enzo-badge>{{ 'work.payrollStatus.' + row.status | t }}</enzo-badge></td>
                <td class="px-4 py-3">
                  <a enzoButton size="sm" variant="ghost" [routerLink]="['/payroll', row.id]">{{ 'work.review' | t }}</a>
                  <a enzoButton size="sm" variant="ghost" [routerLink]="['/payroll', row.id, 'payslip']">{{ 'work.payslip' | t }}</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class PayrollBoardPage {
  private readonly api = inject(WorkforceApi);
  private readonly i18n = inject(LanguageService);
  protected readonly rows = signal<PayrollRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.payroll().subscribe({
      next: (result) => {
        this.rows.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
