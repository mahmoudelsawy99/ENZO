import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { InventoryApi } from './inventory.api';
import type { PurchaseRow } from './inventory.models';

@Component({
  selector: 'app-purchase-list-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, Badge, LoadingState, ErrorState, EmptyState, Pagination],
  template: `
    <enzo-page-header [title]="'stock.purchases' | t" [description]="'stock.purchasesDescription' | t">
      @if (access.can('purchases.create')) {
        <a enzoButton routerLink="/purchases/new">{{ 'stock.addPurchase' | t }}</a>
      }
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="cart" [title]="'stock.emptyPurchases' | t" [description]="'stock.emptyPurchasesBody' | t" /></div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'stock.purchases' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.purchaseNumber' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.total' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.remaining' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.received' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of items(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3 font-medium">{{ row.purchaseNumber }}</td>
                <td class="px-4 py-3">{{ money(row.totalAmount) }}</td>
                <td class="px-4 py-3">{{ money(row.remainingAmount) }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="row.receiveStatus === 'RECEIVED' ? 'success' : 'warning'">{{ 'stock.receiveStatus.' + row.receiveStatus | t }}</enzo-badge></td>
                <td class="px-4 py-3"><a enzoButton size="sm" variant="ghost" [routerLink]="['/purchases', row.id]">{{ 'stock.view' | t }}</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="mt-4"><enzo-pagination [page]="page()" [pageSize]="20" [total]="total()" (pageChange)="go($event)" /></div>
    }
  `,
})
export class PurchaseListPage {
  private readonly api = inject(InventoryApi);
  private readonly i18n = inject(LanguageService);
  protected readonly access = inject(TenantAccess);
  private readonly branches = inject(BranchContext);
  protected readonly items = signal<PurchaseRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly total = signal(0);

  constructor() {
    this.load();
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected go(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.purchases({ page: this.page(), pageSize: 20, branchId: this.branches.selectedId() }).subscribe({
      next: (result) => {
        this.items.set(result.data);
        this.total.set(result.meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
