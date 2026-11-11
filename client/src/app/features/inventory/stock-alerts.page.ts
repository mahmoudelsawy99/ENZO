import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { InventoryApi } from './inventory.api';
import type { StockAlert } from './inventory.models';

@Component({
  selector: 'app-stock-alerts-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'stock.alerts' | t" [description]="'stock.alertsDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.inventoryTitle', link: '/inventory' }]">
      <a enzoButton variant="secondary" routerLink="/inventory">{{ 'stock.inventoryTitle' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="bell" [title]="'stock.emptyAlerts' | t" [description]="'stock.emptyAlertsBody' | t" /></div>
    } @else {
      <div class="grid gap-3">
        @for (alert of items(); track alert.id) {
          <article class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p class="font-medium">{{ label(alert.productName) }} · {{ alert.sku }}</p>
              <p class="text-sm text-text-secondary">{{ text(alert.quantityOnHand) }} / {{ text(alert.minimumStock) }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <enzo-badge [tone]="alert.kind === 'OUT' ? 'danger' : 'warning'">{{ alert.kind === 'OUT' ? ('stock.out' | t) : ('stock.low' | t) }}</enzo-badge>
              @if (access.can('stock-alerts.manage')) {
                <button enzoButton size="sm" variant="secondary" type="button" (click)="set(alert, 'RESOLVED')">{{ 'stock.resolve' | t }}</button>
                <button enzoButton size="sm" variant="ghost" type="button" (click)="set(alert, 'DISMISSED')">{{ 'stock.dismiss' | t }}</button>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class StockAlertsPage {
  private readonly api = inject(InventoryApi);
  private readonly i18n = inject(LanguageService);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);
  protected readonly items = signal<StockAlert[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected set(alert: StockAlert, status: 'DISMISSED' | 'RESOLVED'): void {
    this.api.setAlert(alert.id, status).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.api.alerts(this.branches.selectedId(), 'ACTIVE').subscribe({
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
