import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { InventoryApi } from './inventory.api';
import type { TransferRecord } from './inventory.models';

@Component({
  selector: 'app-transfer-list-page',
  imports: [RouterLink, TranslatePipe, PageHeader, Button, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'stock.transfers' | t" [description]="'stock.transfersDescription' | t">
      @if (access.can('transfers.create')) {
        <a enzoButton routerLink="/transfers/new">{{ 'stock.addTransfer' | t }}</a>
      }
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface"><enzo-empty-state icon="boxes" [title]="'stock.emptyTransfers' | t" [description]="'stock.emptyTransfersBody' | t" /></div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">{{ 'stock.transfers' | t }}</caption>
          <thead class="bg-surface-elevated text-text-secondary">
            <tr>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'stock.transferNumber' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
              <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of items(); track row.id) {
              <tr class="border-t border-border">
                <td class="px-4 py-3 font-medium">{{ row.transferNumber }}</td>
                <td class="px-4 py-3"><enzo-badge [tone]="tone(row.status)">{{ 'stock.transferStatus.' + row.status | t }}</enzo-badge></td>
                <td class="px-4 py-3"><a enzoButton size="sm" variant="ghost" [routerLink]="['/transfers', row.id]">{{ 'stock.view' | t }}</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class TransferListPage {
  private readonly api = inject(InventoryApi);
  private readonly i18n = inject(LanguageService);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);
  protected readonly items = signal<TransferRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  protected tone(status: string): BadgeTone {
    if (status === 'RECEIVED') return 'success';
    if (status === 'CANCELLED') return 'neutral';
    if (status === 'SENT') return 'info';
    return 'warning';
  }

  protected load(): void {
    this.loading.set(true);
    this.api.transfers(this.branches.selectedId()).subscribe({
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
