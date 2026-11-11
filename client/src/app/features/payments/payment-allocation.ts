import { Component, input, output } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';

@Component({
  selector: 'app-payment-allocation',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Select, TextInput],
  template: `
    <div class="grid gap-3" [formGroup]="form()">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium text-text-primary">{{ 'finance.payments' | t }}</h2>
        <button enzoButton type="button" size="sm" variant="secondary" (click)="addPayment.emit()">{{ 'finance.addPayment' | t }}</button>
      </div>
      <div formArrayName="payments" class="grid gap-3">
        @for (row of rows(); track $index) {
          <div class="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-4" [formGroupName]="$index">
            <enzo-select formControlName="method" [label]="'finance.method' | t" [options]="methods()" />
            <enzo-text-input formControlName="amount" type="number" [label]="'finance.amount' | t" />
            <enzo-text-input formControlName="referenceNumber" [label]="'finance.reference' | t" />
            <div class="flex items-end">
              @if (rows().length > 1) {
                <button enzoButton type="button" size="sm" variant="ghost" (click)="removePayment.emit($index)">{{ 'finance.removePayment' | t }}</button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PaymentAllocation {
  readonly form = input.required<FormGroup>();
  readonly methods = input.required<SelectOption[]>();
  readonly addPayment = output<void>();
  readonly removePayment = output<number>();

  protected rows(): FormGroup[] {
    return (this.form().controls['payments'] as FormArray).controls as FormGroup[];
  }
}
