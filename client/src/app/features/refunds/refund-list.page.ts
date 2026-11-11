import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { FinanceApi } from '../pos/finance.api';
import type { RefundRow } from '../pos/finance.models';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { ToastService } from '../../shared/ui/toast.service';

@Component({
  selector: 'app-refund-list-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Button, Select, Badge, LoadingState, ErrorState, EmptyState],
  template: `
    <enzo-page-header [title]="'finance.refundsTitle' | t" [description]="'finance.refundsDescription' | t" [breadcrumbs]="breadcrumbs" />
    <form class="mb-4 grid gap-3 md:grid-cols-3" [formGroup]="filters" (ngSubmit)="load()">
      <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
      <div class="flex items-end"><button enzoButton type="submit" variant="secondary">{{ 'common.search' | t }}</button></div>
    </form>
    <p class="mb-4 text-sm text-text-secondary">{{ 'finance.refundHint' | t }}</p>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (items().length === 0) {
      <div class="rounded-lg border border-border bg-surface">
        <enzo-empty-state [title]="'finance.refundsEmpty' | t" [description]="'finance.refundsEmptyBody' | t" icon="alert" />
      </div>
    } @else {
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">{{ 'finance.refundsTitle' | t }}</caption>
            <thead class="bg-surface-elevated text-text-secondary">
              <tr>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.amount' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.method' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'finance.reason' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'branches.status' | t }}</th>
                <th class="px-4 py-3 text-start text-xs font-medium" scope="col">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-t border-border">
                  <td class="px-4 py-3">{{ money(item.amount) }}</td>
                  <td class="px-4 py-3">{{ 'finance.methods.' + item.method | t }}</td>
                  <td class="px-4 py-3">{{ item.reason }}</td>
                  <td class="px-4 py-3"><enzo-badge [tone]="tone(item.status)">{{ 'status.' + item.status | t }}</enzo-badge></td>
                  <td class="px-4 py-3">
                    @if (item.status === 'REQUESTED' && access.can('refunds.approve')) {
                      <button enzoButton type="button" size="sm" [loading]="approving() === item.id" (click)="approve(item.id)">{{ 'finance.approveRefund' | t }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class RefundListPage {
  private readonly api = inject(FinanceApi);
  private readonly i18n = inject(LanguageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly branches = inject(BranchContext);
  private readonly toast = inject(ToastService);
  protected readonly access = inject(TenantAccess);
  readonly breadcrumbs = [{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'nav.refunds' }];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly approving = signal('');
  readonly items = signal<RefundRow[]>([]);
  readonly filters = this.formBuilder.nonNullable.group({ branchId: this.branches.selectedId() });

  constructor() {
    this.load();
  }

  protected branchOptions(): SelectOption[] {
    return [{ value: '', label: this.i18n.translate('appointments.allBranches') }, ...this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }))];
  }

  protected money(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected tone(status: string): BadgeTone {
    return status === 'PROCESSED' ? 'success' : 'warning';
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.refunds(this.filters.getRawValue().branchId).subscribe({
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

  protected approve(id: string): void {
    this.approving.set(id);
    this.api.approveRefund(id).subscribe({
      next: () => {
        this.approving.set('');
        this.toast.success(this.i18n.translate('finance.refundApproved'));
        this.load();
      },
      error: (error: unknown) => {
        this.approving.set('');
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
