import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { localizedLabel } from '../catalog/catalog.models';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductRecord, TransferRecord } from './inventory.models';

type LineGroup = FormGroup<{ productId: FormControl<string>; quantity: FormControl<string> }>;

@Component({
  selector: 'app-transfer-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, Badge, TextInput, Select, LoadingState, ErrorState],
  template: `
    <enzo-page-header [title]="(creating() ? 'stock.addTransfer' : 'stock.transfer') | t" [description]="'stock.transfersDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.transfers', link: '/transfers' }]">
      <a enzoButton variant="secondary" routerLink="/transfers">{{ 'stock.transfers' | t }}</a>
    </enzo-page-header>
    @if (loading()) {
      <enzo-loading-state [message]="'common.loading' | t" />
    } @else if (loadError()) {
      <enzo-error-state [title]="'common.errorTitle' | t" [message]="loadError()" [retryLabel]="'common.retry' | t" (retry)="load()" />
    } @else if (creating()) {
      <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
        <div class="grid gap-3 md:grid-cols-2">
          <enzo-select formControlName="sourceBranchId" [label]="'stock.source' | t" [options]="branchOptions()" />
          <enzo-select formControlName="destinationBranchId" [label]="'stock.destination' | t" [options]="branchOptions()" />
          <enzo-text-input formControlName="notes" [label]="'stock.notes' | t" />
        </div>
        <div class="grid gap-3" formArrayName="items">
          @for (line of lines.controls; track $index) {
            <div class="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_8rem]" [formGroupName]="$index">
              <enzo-select formControlName="productId" [label]="'stock.product' | t" [options]="productOptions()" />
              <enzo-text-input formControlName="quantity" type="number" [label]="'stock.quantity' | t" />
            </div>
          }
        </div>
        @if (error()) { <p class="text-sm text-danger">{{ error() }}</p> }
        <div><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
      </form>
    } @else if (transfer(); as current) {
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <p class="text-lg font-medium">{{ current.transferNumber }}</p>
        <enzo-badge [tone]="tone(current.status)">{{ 'stock.transferStatus.' + current.status | t }}</enzo-badge>
      </div>
      <ul class="mb-4 grid gap-2 text-sm">
        @for (item of current.items; track item.productId) {
          <li class="rounded-lg border border-border bg-surface px-4 py-3">{{ label(item.productName) }} × {{ text(item.quantity) }}</li>
        }
      </ul>
      <div class="flex flex-wrap gap-2">
        @if (access.can('transfers.send') && current.status === 'DRAFT') {
          <button enzoButton type="button" [loading]="saving()" (click)="send()">{{ 'stock.send' | t }}</button>
        }
        @if (access.can('transfers.receive') && current.status === 'SENT') {
          <button enzoButton type="button" [loading]="saving()" (click)="receive()">{{ 'stock.receiveTransfer' | t }}</button>
        }
        @if (access.can('transfers.send') && (current.status === 'DRAFT' || current.status === 'SENT')) {
          <button enzoButton type="button" variant="secondary" [loading]="saving()" (click)="cancel()">{{ 'stock.cancelTransfer' | t }}</button>
        }
      </div>
      @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
    }
  `,
})
export class TransferPage {
  private readonly api = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly branches = inject(BranchContext);
  protected readonly access = inject(TenantAccess);
  protected readonly creating = signal(!this.route.snapshot.paramMap.get('id'));
  protected readonly transfer = signal<TransferRecord | null>(null);
  protected readonly products = signal<ProductRecord[]>([]);
  protected readonly loading = signal(!this.creating());
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly loadError = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    sourceBranchId: [this.branches.selectedId(), Validators.required],
    destinationBranchId: ['', Validators.required],
    notes: [''],
    items: this.formBuilder.array<LineGroup>([this.line()]),
  });

  constructor() {
    if (this.creating()) {
      this.api.products({ page: 1, pageSize: 50, status: 'ACTIVE' }).subscribe({ next: (result) => this.products.set(result.data) });
    } else {
      this.load();
    }
  }

  protected get lines(): FormArray<LineGroup> {
    return this.form.controls.items;
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected productOptions(): SelectOption[] {
    return this.products().map((product) => ({ value: product.id, label: `${localizedLabel(product.name, this.i18n.language())} · ${product.sku}` }));
  }

  protected label(value: { en: string; ar: string }): string {
    return localizedLabel(value, this.i18n.language());
  }

  protected text(value: number): string {
    return this.i18n.formatNumber(value);
  }

  protected tone(status: string): BadgeTone {
    if (status === 'RECEIVED') return 'success';
    if (status === 'CANCELLED') return 'neutral';
    if (status === 'SENT') return 'info';
    return 'warning';
  }

  protected load(): void {
    this.api.transfer(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: (result) => {
        this.transfer.set(result.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected save(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api.createTransfer({
      sourceBranchId: raw.sourceBranchId,
      destinationBranchId: raw.destinationBranchId,
      notes: raw.notes,
      items: raw.items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })),
    }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        void this.router.navigate(['/transfers', result.data.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  protected send(): void {
    this.act((id) => this.api.sendTransfer(id));
  }

  protected receive(): void {
    this.act((id) => this.api.receiveTransfer(id));
  }

  protected cancel(): void {
    this.act((id) => this.api.cancelTransfer(id));
  }

  private act(call: (id: string) => ReturnType<InventoryApi['sendTransfer']>): void {
    this.saving.set(true);
    call(this.transfer()?.id ?? '').subscribe({
      next: (result) => {
        this.transfer.set(result.data);
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private line(): LineGroup {
    return this.formBuilder.nonNullable.group({ productId: ['', Validators.required], quantity: ['1', Validators.required] });
  }
}
