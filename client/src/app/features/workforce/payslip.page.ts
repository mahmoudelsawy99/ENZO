import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { WorkforceApi } from './workforce.api';
import type { PayrollRecord } from './workforce.models';

@Component({
  selector: 'app-payslip-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, LoadingState, ErrorState],
  template: `
    <div class="print:hidden">
      <enzo-page-header [title]="'work.payslip' | t" [description]="'work.payslipDescription' | t" [breadcrumbs]="[{ labelKey: 'work.payroll', link: '/payroll' }]">
        <button enzoButton type="button" (click)="print()">{{ 'work.print' | t }}</button>
      </enzo-page-header>
    </div>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (row(); as item) {
      <article class="mx-auto max-w-xl rounded-lg border border-border bg-surface p-6 print:border-0">
        <h1 class="font-display text-3xl">{{ 'work.payslip' | t }}</h1>
        <p class="mt-2">{{ item.employeeName }}</p>
        <p class="text-sm text-text-secondary">{{ item.periodStart }} – {{ item.periodEnd }}</p>
        <dl class="mt-6 grid gap-2 text-sm">
          <div class="flex justify-between"><dt>{{ 'work.basic' | t }}</dt><dd>{{ item.basicSalary }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.commission' | t }}</dt><dd>{{ item.commission }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.tips' | t }}</dt><dd>{{ item.tips }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.allowances' | t }}</dt><dd>{{ item.allowances }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.overtime' | t }}</dt><dd>{{ item.overtime }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.bonus' | t }}</dt><dd>{{ item.bonuses }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.attendanceDeductions' | t }}</dt><dd>{{ item.attendanceDeductions }}</dd></div>
          <div class="flex justify-between"><dt>{{ 'work.otherDeductions' | t }}</dt><dd>{{ item.otherDeductions }}</dd></div>
          <div class="mt-2 flex justify-between border-t border-border pt-2 text-base font-medium"><dt>{{ 'work.net' | t }}</dt><dd>{{ item.netSalary }}</dd></div>
        </dl>
        @if (item.paymentMethod) {
          <p class="mt-4 text-sm text-text-secondary">{{ item.paymentMethod }} {{ item.paymentReference }}</p>
        }
        <a class="mt-6 inline-block text-sm print:hidden" [routerLink]="['/payroll', item.id]">{{ 'work.review' | t }}</a>
      </article>
    }
  `,
})
export class PayslipPage {
  private readonly api = inject(WorkforceApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  protected readonly row = signal<PayrollRecord | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.api.payrollOne(id).subscribe({
      next: (result) => {
        this.row.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected print(): void {
    window.print();
  }
}
