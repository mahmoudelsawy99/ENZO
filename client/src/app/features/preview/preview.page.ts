import { DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { EnzoDatePipe, EnzoNumberPipe } from '../../core/i18n/locale.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Checkbox } from '../../shared/ui/checkbox';
import { DataTable, type TableColumn } from '../../shared/ui/data-table';
import { DateField } from '../../shared/ui/date-field';
import { DialogService, DialogShell } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { KpiCard } from '../../shared/ui/kpi-card';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Pagination } from '../../shared/ui/pagination';
import { PasswordInput } from '../../shared/ui/password-input';
import { SearchInput } from '../../shared/ui/search-input';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { Toggle } from '../../shared/ui/toggle';

@Component({
  selector: 'app-preview-note',
  imports: [DialogShell, Button, TranslatePipe],
  template: `
    <enzo-dialog-shell [title]="'preview.dialogTitle' | t" (closed)="ref.close()">
      <p>{{ 'preview.dialogBody' | t }}</p>
      <button enzoDialogActions enzoButton variant="secondary" type="button" (click)="ref.close()">
        {{ 'common.close' | t }}
      </button>
    </enzo-dialog-shell>
  `,
})
export class PreviewNoteDialog {
  readonly ref = inject(DialogRef);
}

@Component({
  selector: 'app-preview-page',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    EnzoDatePipe,
    EnzoNumberPipe,
    PageHeader,
    Card,
    Button,
    TextInput,
    PasswordInput,
    Select,
    DateField,
    SearchInput,
    Checkbox,
    Toggle,
    Badge,
    KpiCard,
    DataTable,
    Pagination,
    EmptyState,
    LoadingState,
    ErrorState,
  ],
  template: `
    <enzo-page-header
      [title]="'preview.title' | t"
      [description]="'preview.description' | t"
      [breadcrumbs]="[{ labelKey: 'nav.dashboard', link: '/dashboard' }, { labelKey: 'preview.title' }]"
    />

    <div class="grid gap-4">
      <enzo-card [title]="'preview.sectionButtons' | t">
        <div class="flex flex-wrap gap-2">
          <button enzoButton type="button" (click)="toasts.success(successMessage())">{{ 'status.success' | t }}</button>
          <button enzoButton variant="secondary" type="button" (click)="toasts.info(infoMessage())">{{ 'status.info' | t }}</button>
          <button enzoButton variant="danger" type="button" (click)="confirm()">{{ 'preview.openConfirm' | t }}</button>
          <button enzoButton variant="ghost" type="button" (click)="openNote()">{{ 'preview.openDialog' | t }}</button>
          <button enzoButton variant="secondary" type="button" [loading]="true">{{ 'common.loading' | t }}</button>
        </div>
      </enzo-card>

      <enzo-card [title]="'preview.sectionForm' | t">
        <form class="grid gap-4 md:grid-cols-2" [formGroup]="form" (ngSubmit)="submit()">
          <enzo-text-input formControlName="name" [label]="'preview.name' | t" [required]="true" />
          <enzo-text-input formControlName="email" type="email" autocomplete="email" [label]="'preview.email' | t" [required]="true" />
          <enzo-password-input formControlName="password" [label]="'preview.password' | t" [hint]="'preview.passwordHint' | t" [required]="true" />
          <enzo-select formControlName="branch" [label]="'preview.branch' | t" [placeholder]="'preview.choose' | t" [options]="branchOptions()" [required]="true" />
          <enzo-date-field formControlName="date" [label]="'preview.date' | t" />
          <enzo-search-input formControlName="search" [placeholder]="'preview.search' | t" [label]="'preview.search' | t" />
          <enzo-checkbox formControlName="active" [label]="'preview.active' | t" />
          <enzo-toggle formControlName="notify" [label]="'preview.notify' | t" />
          <div class="md:col-span-2">
            <button enzoButton type="submit">{{ 'preview.save' | t }}</button>
          </div>
        </form>
        <p class="mt-4 text-sm text-text-secondary">
          {{ 'preview.today' | t }}: {{ today | enzoDate }} · {{ 'preview.sampleNumber' | t }}: {{ 12850.5 | enzoNumber: { style: 'decimal', maximumFractionDigits: 1 } }}
        </p>
      </enzo-card>

      <enzo-card [title]="'preview.sectionStatus' | t">
        <div class="flex flex-wrap gap-2">
          <enzo-badge tone="success">{{ 'status.success' | t }}</enzo-badge>
          <enzo-badge tone="warning">{{ 'status.warning' | t }}</enzo-badge>
          <enzo-badge tone="danger">{{ 'status.danger' | t }}</enzo-badge>
          <enzo-badge tone="info">{{ 'status.info' | t }}</enzo-badge>
          <enzo-badge tone="neutral">{{ 'status.neutral' | t }}</enzo-badge>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <enzo-kpi-card [label]="'dashboard.kpiSales' | t" value="—" [hint]="'dashboard.noData' | t" />
          <enzo-kpi-card [label]="'dashboard.kpiQueue' | t" value="—" [hint]="'dashboard.noData' | t" />
        </div>
      </enzo-card>

      <enzo-card [title]="'preview.sectionData' | t">
        <enzo-data-table [columns]="columns()" [rows]="pagedRows()" [caption]="'preview.caption' | t" />
        <div class="mt-4">
          <enzo-pagination [page]="page()" [pageSize]="pageSize" [total]="rows().length" (pageChange)="page.set($event)" />
        </div>
      </enzo-card>

      <enzo-card [title]="'preview.sectionFeedback' | t">
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-lg border border-border">
            <enzo-empty-state [title]="'common.emptyTitle' | t" [description]="'common.emptyBody' | t" />
          </div>
          <div class="rounded-lg border border-border">
            <enzo-loading-state [message]="'common.loading' | t" />
          </div>
          <div class="rounded-lg border border-border">
            <enzo-error-state [title]="'common.errorTitle' | t" [message]="'common.errorBody' | t" (retry)="toasts.warning(warningMessage())" />
          </div>
        </div>
      </enzo-card>
    </div>
  `,
})
export class PreviewPage {
  private readonly i18n = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  readonly toasts = inject(ToastService);
  readonly today = new Date();
  readonly page = signal(1);
  readonly pageSize = 5;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    branch: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
    notify: new FormControl(false, { nonNullable: true }),
  });

  readonly branchOptions = computed<SelectOption[]>(() => {
    this.i18n.language();
    return [
      { value: 'a', label: this.i18n.translate('preview.optionA') },
      { value: 'b', label: this.i18n.translate('preview.optionB') },
    ];
  });

  readonly columns = computed<TableColumn[]>(() => {
    this.i18n.language();
    return [
      { key: 'item', header: this.i18n.translate('preview.columnItem') },
      { key: 'status', header: this.i18n.translate('preview.columnStatus') },
      { key: 'updated', header: this.i18n.translate('preview.columnUpdated') },
    ];
  });

  readonly rows = computed(() => {
    this.i18n.language();
    return Array.from({ length: 12 }, (_, index) => ({
      item: this.i18n.translate('preview.sampleItem', { n: this.i18n.formatNumber(index + 1) }),
      status: this.i18n.translate(index % 2 === 0 ? 'status.active' : 'status.pending'),
      updated: this.i18n.formatDate(new Date(2026, 9, 10 - (index % 5))),
    }));
  });

  readonly pagedRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.rows().slice(start, start + this.pageSize);
  });

  protected successMessage(): string {
    return this.i18n.translate('preview.toastSuccess');
  }

  protected infoMessage(): string {
    return this.i18n.translate('preview.toastInfo');
  }

  protected warningMessage(): string {
    return this.i18n.translate('preview.toastWarning');
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.toasts.success(this.i18n.translate('preview.saved'));
  }

  protected async confirm(): Promise<void> {
    const accepted = await this.dialogs.confirm({
      titleKey: 'dialog.confirmTitle',
      messageKey: 'dialog.confirmBody',
      danger: true,
    });
    if (accepted) {
      this.toasts.success(this.i18n.translate('preview.confirmed'));
    }
  }

  protected openNote(): void {
    this.dialogs.open(PreviewNoteDialog);
  }
}
