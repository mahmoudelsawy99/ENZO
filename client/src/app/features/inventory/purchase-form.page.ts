import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BranchContext } from '../../core/session/branch-context.service';
import { localizedLabel } from '../catalog/catalog.models';
import { Button } from '../../shared/ui/button';
import { PageHeader } from '../../shared/ui/page-header';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';
import { ToastService } from '../../shared/ui/toast.service';
import { InventoryApi } from './inventory.api';
import type { ProductRecord, SupplierRecord } from './inventory.models';

type LineGroup = FormGroup<{ productId: FormControl<string>; quantity: FormControl<string>; unitCost: FormControl<string> }>;

@Component({
  selector: 'app-purchase-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Button, TextInput, Select],
  template: `
    <enzo-page-header [title]="'stock.addPurchase' | t" [description]="'stock.purchasesDescription' | t" [breadcrumbs]="[{ labelKey: 'stock.purchases', link: '/purchases' }]">
      <a enzoButton variant="secondary" routerLink="/purchases">{{ 'stock.purchases' | t }}</a>
    </enzo-page-header>
    <form class="grid gap-4" [formGroup]="form" (ngSubmit)="save()">
      <div class="grid gap-3 md:grid-cols-2">
        <enzo-select formControlName="branchId" [label]="'appointments.branch' | t" [options]="branchOptions()" />
        <enzo-select formControlName="supplierId" [label]="'stock.supplier' | t" [options]="supplierOptions()" />
        <enzo-text-input formControlName="discount" type="number" [label]="'stock.discount' | t" />
        <enzo-text-input formControlName="notes" [label]="'stock.notes' | t" />
      </div>
      <div class="grid gap-3" formArrayName="items">
        @for (line of lines.controls; track $index) {
          <div class="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]" [formGroupName]="$index">
            <enzo-select formControlName="productId" [label]="'stock.product' | t" [options]="productOptions()" />
            <enzo-text-input formControlName="quantity" type="number" [label]="'stock.quantity' | t" />
            <enzo-text-input formControlName="unitCost" type="number" [label]="'stock.unitCost' | t" />
            <div class="flex items-end"><button enzoButton type="button" variant="ghost" (click)="remove($index)">{{ 'stock.remove' | t }}</button></div>
          </div>
        }
      </div>
      <div><button enzoButton type="button" variant="secondary" (click)="add()">{{ 'stock.addLine' | t }}</button></div>
      @if (error()) { <p class="text-sm text-danger">{{ error() }}</p> }
      <div><button enzoButton type="submit" [loading]="saving()">{{ 'common.save' | t }}</button></div>
    </form>
  `,
})
export class PurchaseFormPage {
  private readonly api = inject(InventoryApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly i18n = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly branches = inject(BranchContext);
  protected readonly suppliers = signal<SupplierRecord[]>([]);
  protected readonly products = signal<ProductRecord[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    branchId: [this.branches.selectedId() || this.branches.branches()[0]?.id || '', Validators.required],
    supplierId: ['', Validators.required],
    discount: ['0'],
    notes: [''],
    items: this.formBuilder.array<LineGroup>([this.line()]),
  });

  constructor() {
    this.api.suppliers({ page: 1, pageSize: 50, status: 'ACTIVE' }).subscribe({ next: (result) => this.suppliers.set(result.data) });
    this.api.products({ page: 1, pageSize: 50, status: 'ACTIVE' }).subscribe({ next: (result) => this.products.set(result.data) });
  }

  protected get lines(): FormArray<LineGroup> {
    return this.form.controls.items;
  }

  protected branchOptions(): SelectOption[] {
    return this.branches.branches().map((branch) => ({ value: branch.id, label: branch.label }));
  }

  protected supplierOptions(): SelectOption[] {
    return this.suppliers().map((supplier) => ({ value: supplier.id, label: supplier.name }));
  }

  protected productOptions(): SelectOption[] {
    return this.products().map((product) => ({ value: product.id, label: `${localizedLabel(product.name, this.i18n.language())} · ${product.sku}` }));
  }

  protected add(): void {
    this.lines.push(this.line());
  }

  protected remove(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
    }
  }

  protected save(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.api.createPurchase({
      branchId: raw.branchId,
      supplierId: raw.supplierId,
      discount: Number(raw.discount) || 0,
      purchaseDate: new Date().toISOString(),
      notes: raw.notes,
      items: raw.items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), unitCost: Number(item.unitCost) })),
    }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.toast.success(this.i18n.translate('stock.saved'));
        void this.router.navigate(['/purchases', result.data.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof ApiError ? error.message : this.i18n.translate('common.errorBody'));
      },
    });
  }

  private line(): LineGroup {
    return this.formBuilder.nonNullable.group({
      productId: ['', Validators.required],
      quantity: ['1', Validators.required],
      unitCost: ['0', Validators.required],
    });
  }
}
