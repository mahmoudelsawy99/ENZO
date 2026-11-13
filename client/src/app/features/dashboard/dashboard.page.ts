import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { staffHome, seesDashboard } from '../../core/navigation/navigation';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ReportsApi, type HomePayload } from '../reports/reports.api';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-dashboard-page',
  imports: [PageHeader, KpiCard, EmptyState, ErrorState, LoadingState, Button, RouterLink, TranslatePipe],
  template: `
    <enzo-page-header [title]="'nav.dashboard' | t" [description]="'pages.dashboard' | t">
      <a enzoButton variant="secondary" routerLink="/preview">{{ 'shell.previewLink' | t }}</a>
    </enzo-page-header>

    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="reload()" />
    } @else {
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      @if (home()?.sales; as sales) {
        <enzo-kpi-card [label]="'reportCenter.metric.gross' | t" [value]="text(sales['gross'])" />
        <enzo-kpi-card [label]="'reportCenter.metric.refunds' | t" [value]="text(sales['refunds'])" />
        <enzo-kpi-card [label]="'reportCenter.metric.net' | t" [value]="text(sales['net'])" />
        <enzo-kpi-card [label]="'reportCenter.metric.transactions' | t" [value]="text(sales['transactions'])" />
      }
      @if (home()?.customers; as customers) {
        <enzo-kpi-card [label]="'reportCenter.metric.newCustomers' | t" [value]="text(customers.newCustomers)" />
        <enzo-kpi-card [label]="'reportCenter.metric.returningCustomers' | t" [value]="text(customers.returningCustomers)" />
      }
      @if (home()?.inventory; as inventory) {
        <a routerLink="/inventory/alerts"><enzo-kpi-card [label]="'stock.low' | t" [value]="text(inventory['lowStock'])" [hint]="'stock.lowHint' | t" /></a>
        <a routerLink="/inventory/alerts"><enzo-kpi-card [label]="'stock.out' | t" [value]="text(inventory['outOfStock'])" [hint]="'stock.outHint' | t" /></a>
      }
      @if (home()?.attendance; as attendance) {
        <enzo-kpi-card [label]="'reportCenter.metric.LATE' | t" [value]="text(numberOf(attendance['LATE']))" />
        <enzo-kpi-card [label]="'reportCenter.metric.ABSENT' | t" [value]="text(numberOf(attendance['ABSENT']))" />
      }
      @if (home()?.appointmentsToday !== undefined && home()?.appointmentsToday !== null) {
        <enzo-kpi-card [label]="'reportCenter.appointmentsToday' | t" [value]="text(home()?.appointmentsToday ?? 0)" />
      }
      @if (home()?.supplierPayments !== undefined) {
        <enzo-kpi-card [label]="'reportCenter.metric.supplierPayments' | t" [value]="text(home()?.supplierPayments ?? 0)" [hint]="'reportCenter.note.supplier_payments_are_separate' | t" />
      }
      @if (home()?.cashier; as cashier) {
        <enzo-kpi-card [label]="'reportCenter.metric.expectedCash' | t" [value]="text(cashier.metrics['expectedCash'])" />
      }
      @if (home()?.payroll; as payroll) {
        @for (key of payrollKeys(payroll); track key) {
          <enzo-kpi-card [label]="'reportCenter.metric.' + key | t" [value]="text(numberOf(payroll[key]))" />
        }
      }
    </section>

    @if (home()?.branches; as branches) {
      <section class="mt-4 rounded-lg border border-border bg-surface p-4">
        <h2 class="mb-3 text-sm font-medium">{{ 'reportCenter.branches' | t }}</h2>
        @if (branches.length === 0) {
          <p class="text-sm text-text-secondary">{{ 'dashboard.noData' | t }}</p>
        } @else {
          <ul class="grid gap-2">
            @for (branch of branches; track $index) {
              <li class="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                <span>{{ branch['label'] }}</span>
                <span class="h-2 rounded-full bg-brand" [style.width.%]="bar(branch)"></span>
                <span>{{ text(numberOf(branch['net'])) }}</span>
              </li>
            }
          </ul>
        }
      </section>
    }

    @if (home()?.employees; as employees) {
      <section class="mt-4 rounded-lg border border-border bg-surface p-4">
        <h2 class="mb-3 text-sm font-medium">{{ 'reportCenter.employees' | t }}</h2>
        @if (employees.length === 0) {
          <p class="text-sm text-text-secondary">{{ 'dashboard.noData' | t }}</p>
        } @else {
          <ul class="grid gap-2 text-sm">
            @for (employee of employees; track $index) {
              <li class="flex justify-between gap-3"><span>{{ employee['label'] }}</span><span>{{ text(numberOf(employee['net'])) }}</span></li>
            }
          </ul>
        }
      </section>
    }

    @if (home()?.cashier?.shifts; as shifts) {
      @if (shifts.length > 0) {
        <section class="mt-4 rounded-lg border border-border bg-surface p-4">
          <h2 class="mb-3 text-sm font-medium">{{ 'reportCenter.kind.cashier' | t }}</h2>
          <ul class="grid gap-2 text-sm">
            @for (shift of shifts; track $index) {
              <li class="flex justify-between gap-3">
                <span>{{ shift['status'] }}</span>
                <span>{{ text(numberOf(shift['expectedCash'])) }}</span>
              </li>
            }
          </ul>
        </section>
      }
    }

    @if (!home()?.sales && !home()?.inventory && !home()?.attendance && !home()?.cashier && !home()?.payroll) {
      <section class="mt-4 rounded-lg border border-border bg-surface">
        <enzo-empty-state icon="inbox" [title]="'dashboard.activity' | t" [description]="'dashboard.activityEmpty' | t" />
      </section>
    }
    }
  `,
})
export class DashboardPage {
  private readonly reports = inject(ReportsApi);
  private readonly i18n = inject(LanguageService);
  private readonly access = inject(TenantAccess);
  private readonly router = inject(Router);
  private started = false;
  protected readonly home = signal<HomePayload | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      if (!this.access.loaded() || this.started) {
        return;
      }
      if (!seesDashboard((key) => this.access.can(key))) {
        this.started = true;
        void this.router.navigateByUrl(staffHome((key) => this.access.can(key)));
        return;
      }
      this.started = true;
      this.reload();
    });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.reports.home().subscribe({
      next: (result) => {
        this.home.set(result.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected payrollKeys(payroll: Record<string, number>): string[] {
    return ['DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED'].filter((key) => payroll[key] !== undefined);
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected numberOf(value: string | number | undefined): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  protected bar(branch: Record<string, string | number>): number {
    const rows = this.home()?.branches ?? [];
    const max = Math.max(...rows.map((row) => this.numberOf(row['net'])), 1);
    return Math.max(4, Math.round((this.numberOf(branch['net']) / max) * 100));
  }
}
