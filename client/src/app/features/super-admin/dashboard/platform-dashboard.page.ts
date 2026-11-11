import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api/api-error';
import { EnzoDatePipe, EnzoNumberPipe } from '../../../core/i18n/locale.pipe';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { KpiCard } from '../../../shared/ui/kpi-card';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PageHeader } from '../../../shared/ui/page-header';
import { PlatformApi } from '../platform.api';
import type { PlatformDashboard } from '../platform.models';

@Component({
  selector: 'app-platform-dashboard',
  imports: [RouterLink, TranslatePipe, EnzoNumberPipe, EnzoDatePipe, PageHeader, KpiCard, Card, EmptyState, ErrorState, LoadingState, Button],
  template: `
    <enzo-page-header [title]="'platform.dashboard' | t" [description]="'platform.dashboardDescription' | t">
      <a enzoButton routerLink="/platform/tenants/new">{{ 'platform.createTenant' | t }}</a>
    </enzo-page-header>

    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" (retry)="load()" />
    } @else if (data(); as dashboard) {
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <enzo-kpi-card [label]="'platform.totalTenants' | t" [value]="dashboard.totals.tenants | enzoNumber" />
        <enzo-kpi-card [label]="'platform.activeTenants' | t" [value]="dashboard.totals.active | enzoNumber" />
        <enzo-kpi-card [label]="'platform.suspendedTenants' | t" [value]="dashboard.totals.suspended | enzoNumber" />
        <enzo-kpi-card [label]="'platform.inactiveTenants' | t" [value]="dashboard.totals.inactive | enzoNumber" />
        <enzo-kpi-card [label]="'platform.totalUsers' | t" [value]="dashboard.totals.users | enzoNumber" />
      </section>
      <section class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <enzo-kpi-card [label]="'billing.activeSubscriptions' | t" [value]="dashboard.subscriptions.active | enzoNumber" />
        <enzo-kpi-card [label]="'billing.trials' | t" [value]="dashboard.subscriptions.trialing | enzoNumber" />
        <enzo-kpi-card [label]="'billing.pastDue' | t" [value]="dashboard.subscriptions.pastDue | enzoNumber" />
        <enzo-kpi-card [label]="'billing.suspendedSubscriptions' | t" [value]="dashboard.subscriptions.suspended | enzoNumber" />
        <enzo-kpi-card [label]="'billing.cancellations' | t" [value]="dashboard.subscriptions.cancelled | enzoNumber" />
        <enzo-kpi-card [label]="'billing.mrr' | t" [value]="(dashboard.subscriptions.mrr | enzoNumber) + ' ' + dashboard.subscriptions.currency" />
        <enzo-kpi-card [label]="'billing.arr' | t" [value]="(dashboard.subscriptions.arr | enzoNumber) + ' ' + dashboard.subscriptions.currency" />
        <enzo-kpi-card [label]="'billing.collectedThisMonth' | t" [value]="(dashboard.subscriptions.collectedThisMonth | enzoNumber) + ' ' + dashboard.subscriptions.currency" />
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <enzo-card [title]="'platform.statusDistribution' | t">
          @if (dashboard.totals.tenants === 0) {
            <enzo-empty-state [title]="'platform.noTenants' | t" [description]="'platform.noTenantsBody' | t" icon="building" />
          } @else {
            <ul class="grid gap-3">
              @for (item of dashboard.statusDistribution; track item.status) {
                <li>
                  <div class="mb-1 flex items-center justify-between text-sm">
                    <span>{{ statusKey(item.status) | t }}</span>
                    <span class="text-text-secondary">{{ item.count | enzoNumber }}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-hover">
                    <div class="h-full bg-brand-red" [style.width.%]="share(item.count, dashboard.totals.tenants)"></div>
                  </div>
                </li>
              }
            </ul>
          }
        </enzo-card>

        <enzo-card [title]="'platform.newOverTime' | t" [description]="'platform.last30Days' | t">
          @if (dashboard.createdOverTime.length === 0) {
            <enzo-empty-state [title]="'platform.noRecentCreates' | t" [description]="'platform.noRecentCreatesBody' | t" icon="chart" />
          } @else {
            <ul class="grid gap-2">
              @for (point of dashboard.createdOverTime; track point.date) {
                <li class="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                  <span class="text-text-secondary">{{ point.date }}</span>
                  <span class="h-2 overflow-hidden rounded-full bg-hover">
                    <span class="block h-full bg-brand-blue" [style.width.%]="share(point.count, peak())"></span>
                  </span>
                  <span class="text-end">{{ point.count | enzoNumber }}</span>
                </li>
              }
            </ul>
          }
        </enzo-card>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <enzo-card [title]="'billing.planDistribution' | t">
          @if (dashboard.subscriptions.planDistribution.length === 0) {
            <p class="text-sm text-text-secondary">{{ 'billing.noSubscriptionActivity' | t }}</p>
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (item of dashboard.subscriptions.planDistribution; track item.code) {
                <li class="flex justify-between"><span>{{ item.code }}</span><span>{{ item.count | enzoNumber }}</span></li>
              }
            </ul>
          }
        </enzo-card>
        <enzo-card [title]="'billing.recentPayments' | t">
          @if (dashboard.subscriptions.recentPayments.length === 0) {
            <p class="text-sm text-text-secondary">{{ 'billing.noSubscriptionActivity' | t }}</p>
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (payment of dashboard.subscriptions.recentPayments; track payment.id) {
                <li>{{ payment.tenantName }} · {{ payment.amount | enzoNumber }} {{ payment.currency }} · {{ payment.status }}</li>
              }
            </ul>
          }
        </enzo-card>
        <enzo-card [title]="'billing.upcomingRenewals' | t">
          @if (dashboard.subscriptions.upcomingRenewals.length === 0) {
            <p class="text-sm text-text-secondary">{{ 'billing.noSubscriptionActivity' | t }}</p>
          } @else {
            <ul class="grid gap-2 text-sm">
              @for (renewal of dashboard.subscriptions.upcomingRenewals; track renewal.id) {
                <li>{{ renewal.tenantName }} · {{ renewal.nextBillingDate | enzoDate }} · {{ renewal.status }}</li>
              }
            </ul>
          }
        </enzo-card>
      </div>

      <div class="mt-6">
        <enzo-card [title]="'platform.recentTenants' | t">
          @if (dashboard.recentTenants.length === 0) {
            <enzo-empty-state [title]="'platform.noTenants' | t" [description]="'platform.noTenantsBody' | t" icon="inbox">
              <a enzoButton routerLink="/platform/tenants/new">{{ 'platform.createTenant' | t }}</a>
            </enzo-empty-state>
          } @else {
            <ul class="divide-y divide-border">
              @for (tenant of dashboard.recentTenants; track tenant.id) {
                <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <a class="font-medium text-text-primary hover:underline" [routerLink]="['/platform/tenants', tenant.id]">
                      {{ tenant.businessName }}
                    </a>
                    <p class="text-sm text-text-secondary">{{ tenant.owner?.fullName || '—' }} · {{ tenant.createdAt | enzoDate }}</p>
                  </div>
                  <span class="text-sm text-text-secondary">{{ statusKey(tenant.status) | t }}</span>
                </li>
              }
            </ul>
          }
        </enzo-card>
      </div>
    }
  `,
})
export class PlatformDashboardPage {
  private readonly api = inject(PlatformApi);
  private readonly i18n = inject(LanguageService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<PlatformDashboard | null>(null);
  readonly peak = computed(() => Math.max(1, ...(this.data()?.createdOverTime.map((point) => point.count) ?? [1])));

  constructor() {
    void this.load();
  }

  protected statusKey(status: string): string {
    if (status === 'ACTIVE') return 'platform.active';
    if (status === 'SUSPENDED') return 'platform.suspended';
    return 'platform.inactive';
  }

  protected share(count: number, total: number): number {
    if (count <= 0 || total <= 0) {
      return 0;
    }
    return Math.max(4, Math.round((count / total) * 100));
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    void this.api
      .dashboard()
      .then((dashboard) => this.data.set(dashboard))
      .catch((error: unknown) => {
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      })
      .finally(() => this.loading.set(false));
  }
}
