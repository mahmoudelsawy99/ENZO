import { booleanAttribute, Component, input, output } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Select, type SelectOption } from '../../shared/ui/select';
import { TextInput } from '../../shared/ui/text-input';

@Component({
  selector: 'app-payment-allocation',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Icon, Select, TextInput],
  template: `
    <div class="grid gap-3" [formGroup]="form()">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium text-text-primary">{{ 'finance.payments' | t }}</h2>
        <button enzoButton type="button" size="sm" variant="secondary" (click)="addPayment.emit()">{{ 'finance.addPayment' | t }}</button>
      </div>
      <div formArrayName="payments" class="grid gap-2">
        @for (row of rows(); track $index) {
          <div class="grid items-end gap-2 rounded-lg border border-border p-2" [class.md:grid-cols-4]="!compact()" [class.grid-cols-[minmax(0,1fr)_7rem_auto]]="compact()" [formGroupName]="$index">
            <enzo-select formControlName="method" [label]="'finance.method' | t" [options]="methods()" />
            <enzo-text-input formControlName="amount" type="number" [label]="'finance.amount' | t" />
            @if (!compact()) {
              <enzo-text-input formControlName="referenceNumber" [label]="'finance.reference' | t" />
            }
            @if (compact() || rows().length > 1) {
              <button type="button" class="grid size-9 place-items-center rounded-md text-text-secondary hover:bg-surface-elevated hover:text-danger" [attr.aria-label]="'finance.removePayment' | t" (click)="removePayment.emit($index)">
                @if (compact()) {
                  <enzo-icon name="basket" />
                } @else {
                  <span class="px-2 text-sm">{{ 'finance.removePayment' | t }}</span>
                }
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class PaymentAllocation {
  readonly form = input.required<FormGroup>();
  readonly methods = input.required<SelectOption[]>();
  readonly compact = input(false, { transform: booleanAttribute });
  readonly addPayment = output<void>();
  readonly removePayment = output<number>();

  protected rows(): FormGroup[] {
    return (this.form().controls['payments'] as FormArray).controls as FormGroup[];
  }
}
