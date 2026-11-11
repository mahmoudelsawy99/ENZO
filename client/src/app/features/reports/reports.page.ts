import { Component, inject, signal } from '@angular/core';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { EntitlementState } from '../../core/access/entitlement.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { CatalogApi } from '../catalog/catalog.api';
import { localizedLabel, type ServiceCategory } from '../catalog/catalog.models';
import { OrganizationApi } from '../organization/organization.api';
import type { EmployeeRecord } from '../organization/organization.models';
import { Button } from '../../shared/ui/button';
import { DataTable, type TableColumn } from '../../shared/ui/data-table';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ReportsApi, type ReportPayload } from './reports.api';

interface KindOption {
  id: string;
  permission: string;
}

const KINDS: KindOption[] = [
  { id: 'dashboard', permission: 'reports.view' },
  { id: 'daily', permission: 'reports.view' },
  { id: 'weekly', permission: 'reports.view' },
  { id: 'monthly', permission: 'reports.view' },
  { id: 'branches', permission: 'reports.view' },
  { id: 'services', permission: 'reports.view' },
  { id: 'products', permission: 'reports.view' },
  { id: 'categories', permission: 'reports.view' },
  { id: 'payments', permission: 'reports.view' },
  { id: 'discounts', permission: 'reports.view' },
  { id: 'refunds', permission: 'reports.view' },
  { id: 'transactions', permission: 'reports.view' },
  { id: 'employees', permission: 'reports.employees' },
  { id: 'performance', permission: 'reports.employees' },
  { id: 'customers', permission: 'reports.customers' },
  { id: 'inventory', permission: 'reports.inventory' },
  { id: 'attendance', permission: 'reports.attendance' },
  { id: 'payroll', permission: 'reports.payroll' },
  { id: 'cashier', permission: 'reports.cashier' },
  { id: 'suppliers', permission: 'reports.view' },
];

const SALES_ALSO = new Set(['dashboard', 'daily', 'weekly', 'monthly', 'branches', 'services', 'products', 'categories', 'payments', 'discounts', 'refunds', 'transactions', 'suppliers']);

@Component({
  selector: 'app-reports-page',
  imports: [TranslatePipe, PageHeader, Button, KpiCard, DataTable, LoadingState, ErrorState],
  template: `
    <div class="print:hidden">
      <enzo-page-header [title]="'reportCenter.title' | t" [description]="'reportCenter.description' | t" />
      <div class="mb-4 flex flex-wrap gap-2">
        @for (kind of visibleKinds(); track kind) {
          <button enzoButton type="button" size="sm" [variant]="selected() === kind ? 'primary' : 'secondary'" (click)="choose(kind)">
            {{ 'reportCenter.kind.' + kind | t }}
          </button>
        }
      </div>
      <div class="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.from' | t }}</span>
          <input class="enzo-control" type="date" [value]="from()" (input)="from.set(valueOf($event))" />
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.to' | t }}</span>
          <input class="enzo-control" type="date" [value]="to()" (input)="to.set(valueOf($event))" />
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.branch' | t }}</span>
          <select class="enzo-control" [value]="branchId()" (change)="branchId.set(valueOf($event))">
            <option value="">{{ 'reportCenter.allBranches' | t }}</option>
            @for (branch of branches.branches(); track branch.id) {
              <option [value]="branch.id">{{ branch.label }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.employee' | t }}</span>
          <select class="enzo-control" [value]="employeeId()" (change)="employeeId.set(valueOf($event))">
            <option value="">{{ 'reportCenter.allEmployees' | t }}</option>
            @for (employee of employees(); track employee.id) {
              <option [value]="employee.id">{{ employee.fullName }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.category' | t }}</span>
          <select class="enzo-control" [value]="categoryId()" (change)="categoryId.set(valueOf($event))">
            <option value="">{{ 'reportCenter.allCategories' | t }}</option>
            @for (category of categories(); track category.id) {
              <option [value]="category.id">{{ categoryLabel(category) }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.paymentMethod' | t }}</span>
          <select class="enzo-control" [value]="paymentMethod()" (change)="paymentMethod.set(valueOf($event))">
            <option value="">{{ 'reportCenter.allMethods' | t }}</option>
            @for (method of methods; track method) {
              <option [value]="method">{{ 'finance.methods.' + method | t }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.transactionStatus' | t }}</span>
          <select class="enzo-control" [value]="status()" (change)="status.set(valueOf($event))">
            <option value="">{{ 'reportCenter.allStatuses' | t }}</option>
            @for (item of statuses; track item) {
              <option [value]="item">{{ 'status.' + item | t }}</option>
            }
          </select>
        </label>
        @if (selected() === 'payroll') {
          <label class="grid gap-1 text-sm">
            <span>{{ 'reportCenter.payrollStatus' | t }}</span>
            <select class="enzo-control" [value]="payrollStatus()" (change)="payrollStatus.set(valueOf($event))">
              <option value="">{{ 'reportCenter.allStatuses' | t }}</option>
              @for (item of payrollStatuses; track item) {
                <option [value]="item">{{ 'reportCenter.metric.' + item | t }}</option>
              }
            </select>
          </label>
        }
        <label class="grid gap-1 text-sm">
          <span>{{ 'reportCenter.section' | t }}</span>
          <select class="enzo-control" [value]="section()" (change)="section.set(valueOf($event))">
            <option value="">{{ 'reportCenter.sectionDefault' | t }}</option>
            @for (item of sections(); track item) {
              <option [value]="item">{{ 'reportCenter.sectionName.' + item | t }}</option>
            }
          </select>
        </label>
      </div>
      <div class="mb-4 flex flex-wrap gap-2">
        <button enzoButton type="button" (click)="load()" [loading]="loading()">{{ 'reportCenter.run' | t }}</button>
        @if (access.can('reports.export') && entitlements.allows('exports')) {
          <button enzoButton type="button" variant="secondary" (click)="download('csv')">CSV</button>
          <button enzoButton type="button" variant="secondary" (click)="download('xlsx')">Excel</button>
          <button enzoButton type="button" variant="secondary" (click)="download('pdf')">PDF</button>
          <button enzoButton type="button" variant="secondary" (click)="printView()">{{ 'reportCenter.print' | t }}</button>
        }
      </div>
    </div>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (error()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="error()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (report(); as current) {
      <p class="mb-3 text-sm text-text-secondary">{{ current.tenantName }} · {{ current.branchName }} · {{ current.currency }} · {{ current.generatedAt }}</p>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        @for (item of metricCards(current); track item.key) {
          <enzo-kpi-card [label]="item.label" [value]="item.value" />
        }
      </div>
      @if (current.columns.length > 0) {
        <div class="mt-4">
          <enzo-data-table [columns]="columns(current)" [rows]="current.rows" [emptyTitle]="'reportCenter.empty' | t" [emptyDescription]="'reportCenter.emptyBody' | t" />
        </div>
      }
      <ul class="mt-4 grid gap-1 text-sm text-text-secondary">
        @for (note of current.notes; track note) {
          <li>{{ 'reportCenter.note.' + note | t }}</li>
        }
      </ul>
    }
  `,
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);
  private readonly i18n = inject(LanguageService);
  protected readonly access = inject(TenantAccess);
  protected readonly entitlements = inject(EntitlementState);
  protected readonly branches = inject(BranchContext);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly report = signal<ReportPayload | null>(null);
  protected readonly employees = signal<EmployeeRecord[]>([]);
  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly selected = signal('dashboard');
  protected readonly from = signal(localDate());
  protected readonly to = signal(localDate());
  protected readonly branchId = signal('');
  protected readonly employeeId = signal('');
  protected readonly categoryId = signal('');
  protected readonly paymentMethod = signal('');
  protected readonly status = signal('');
  protected readonly payrollStatus = signal('');
  protected readonly section = signal('');
  protected readonly methods = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'];
  protected readonly statuses = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
  protected readonly payrollStatuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED'];

  constructor() {
    void this.access.load().then(() => {
      const first = this.visibleKinds()[0];
      if (!first) {
        this.error.set(this.i18n.translate('reportCenter.noAccess'));
        return;
      }
      this.selected.set(first);
      this.loadLists();
      this.load();
    });
  }

  protected categoryLabel(category: ServiceCategory): string {
    return localizedLabel(category.name, this.i18n.language());
  }

  protected visibleKinds(): string[] {
    return KINDS.filter((kind) => this.access.can(kind.permission) || (SALES_ALSO.has(kind.id) && this.access.can('reports.sales')) || (kind.id === 'cashier' && this.access.can('cashier-shifts.view')) || (kind.id === 'suppliers' && this.access.can('purchases.view'))).map((kind) => kind.id);
  }

  protected sections(): string[] {
    const kind = this.selected();
    if (kind === 'inventory') return ['low', 'out', 'movements', 'purchases', 'returns', 'transfers', 'sales', 'adjustments'];
    if (kind === 'attendance') return ['monthly', 'late', 'early', 'absence', 'balances', 'leave'];
    if (kind === 'customers') return ['frequent', 'preferences', 'products', 'packages'];
    if (kind === 'payroll') return ['components', 'corrections'];
    return [];
  }

  protected choose(kind: string): void {
    this.selected.set(kind);
    this.section.set('');
    this.load();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected metricCards(current: ReportPayload): Array<{ key: string; label: string; value: string }> {
    return Object.entries(current.metrics).map(([key, value]) => ({
      key,
      label: this.i18n.translate(`reportCenter.metric.${key}`),
      value: this.i18n.formatNumber(value),
    }));
  }

  protected columns(current: ReportPayload): TableColumn[] {
    return current.columns.map((key) => ({ key, header: this.i18n.translate(`reportCenter.column.${key}`) }));
  }

  protected load(): void {
    if (!this.visibleKinds().includes(this.selected())) {
      this.error.set(this.i18n.translate('reportCenter.noAccess'));
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.report(this.selected(), this.query()).subscribe({
      next: (result) => {
        this.report.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected download(format: 'csv' | 'xlsx' | 'pdf'): void {
    this.api.export(this.selected(), `${this.query()}&format=${format}`).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `enzo-${this.selected()}.${format}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (error: unknown) => this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody')),
    });
  }

  protected printView(): void {
    window.print();
  }

  private query(): string {
    const params = new URLSearchParams({
      from: this.from(),
      to: this.to(),
      branchId: this.branchId(),
      employeeId: this.employeeId(),
      categoryId: this.categoryId(),
      paymentMethod: this.paymentMethod(),
      status: this.status(),
      payrollStatus: this.payrollStatus(),
      section: this.section(),
      lang: this.i18n.language(),
      page: '1',
      pageSize: '25',
    });
    return params.toString();
  }

  private loadLists(): void {
    if (this.access.can('employees.view')) {
      this.organization.employees({ page: 1, pageSize: 100, status: 'ACTIVE' }).subscribe({
        next: (result) => this.employees.set(result.data),
      });
    }
    if (this.access.can('service-categories.view')) {
      this.catalog.categories().subscribe({
        next: (result) => this.categories.set(result.data),
      });
    }
  }
}

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
