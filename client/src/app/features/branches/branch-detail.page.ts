import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { EnzoDatePipe } from '../../core/i18n/locale.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { DialogService } from '../../shared/ui/dialog';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ToastService } from '../../shared/ui/toast.service';
import { OrganizationApi } from '../organization/organization.api';
import { WEEK_DAYS, type BranchRecord } from '../organization/organization.models';

@Component({
  selector: 'app-branch-detail-page',
  imports: [RouterLink, TranslatePipe, EnzoDatePipe, PageHeader, Button, Badge, Card, LoadingState, ErrorState],
  template: `
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" />
    } @else if (branch(); as item) {
      <enzo-page-header [title]="item.name" [description]="item.code" [breadcrumbs]="breadcrumbs">
        <enzo-badge [tone]="tone(item.status)">{{ 'status.' + item.status | t }}</enzo-badge>
        <a enzoButton variant="secondary" [routerLink]="['/branches', item.id, 'edit']">{{ 'branches.edit' | t }}</a>
        @if (item.status === 'ACTIVE') {
          <button enzoButton variant="danger" type="button" (click)="setStatus('DISABLED')">{{ 'branches.disable' | t }}</button>
        } @else {
          <button enzoButton variant="secondary" type="button" (click)="setStatus('ACTIVE')">{{ 'branches.enable' | t }}</button>
        }
      </enzo-page-header>
      <div class="grid gap-4 lg:grid-cols-2">
        <enzo-card [title]="'branches.details' | t">
          <dl class="grid gap-3 text-sm">
            <div><dt class="text-text-secondary">{{ 'branches.address' | t }}</dt><dd>{{ item.address || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'branches.phone' | t }}</dt><dd>{{ item.phone || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'branches.manager' | t }}</dt><dd>{{ item.managerName || '—' }}</dd></div>
            <div><dt class="text-text-secondary">{{ 'branches.updated' | t }}</dt><dd>{{ item.updatedAt | enzoDate }}</dd></div>
          </dl>
        </enzo-card>
        <enzo-card [title]="'branches.hours' | t">
          <ul class="grid gap-2 text-sm">
            @for (day of days; track day) {
              <li class="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span>{{ 'day.' + day | t }}</span>
                @if (item.workingHours[day].isOpen) {
                  <span>{{ item.workingHours[day].openingTime }} – {{ item.workingHours[day].closingTime }}</span>
                } @else {
                  <span class="text-text-secondary">{{ 'branches.closed' | t }}</span>
                }
              </li>
            }
          </ul>
        </enzo-card>
      </div>
      @if (item.status !== 'ACTIVE') {
        <p class="mt-4 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning">{{ 'branches.disabledNotice' | t }}</p>
      }
    }
  `,
})
export class BranchDetailPage {
  private readonly api = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly access = inject(TenantAccess);

  readonly days = WEEK_DAYS;
  readonly breadcrumbs = [
    { labelKey: 'nav.dashboard', link: '/dashboard' },
    { labelKey: 'nav.branches', link: '/branches' },
    { labelKey: 'branches.view' },
  ];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly branch = signal<BranchRecord | null>(null);

  constructor() {
    this.load();
  }

  protected tone(status: string): BadgeTone {
    if (status === 'ACTIVE') return 'success';
    if (status === 'INACTIVE') return 'warning';
    return 'danger';
  }

  protected async setStatus(status: BranchRecord['status']): Promise<void> {
    const current = this.branch();
    if (!current) return;
    const confirmed = await this.dialogs.confirm({
      titleKey: status === 'ACTIVE' ? 'branches.enableTitle' : 'branches.disableTitle',
      messageKey: status === 'ACTIVE' ? 'branches.enableBody' : 'branches.disableBody',
      confirmKey: status === 'ACTIVE' ? 'branches.enable' : 'branches.disable',
      danger: status !== 'ACTIVE',
    });
    if (!confirmed) return;
    this.api.branchStatus(current.id, status).subscribe({
      next: (response) => {
        this.branch.set(response.data);
        this.toasts.success(this.i18n.translate('branches.saved'));
        void this.access.reload();
      },
      error: (error: unknown) => this.toasts.warning(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  private load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.branch(id).subscribe({
      next: (response) => {
        this.branch.set(response.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }
}
