import { Component, booleanAttribute, input } from '@angular/core';
import { EnzoValueAccessor, createFieldId } from './value-accessor';

@Component({
  selector: 'enzo-checkbox',
  template: `
    <label class="inline-flex items-center gap-2 text-sm text-text-primary" [attr.for]="fieldId">
      <input
        class="enzo-check"
        type="checkbox"
        [id]="fieldId"
        [checked]="value()"
        [disabled]="isDisabled()"
        [attr.aria-invalid]="validationError() ? 'true' : 'false'"
        (change)="onChangeChecked($event)"
        (blur)="markTouched()"
      />
      <span>{{ label() }}</span>
    </label>
    @if (validationError()) {
      <p class="mt-1 text-xs text-danger" role="alert">{{ validationError() }}</p>
    }
  `,
})
export class Checkbox extends EnzoValueAccessor<boolean> {
  readonly label = input('');
  readonly required = input(false, { transform: booleanAttribute });
  readonly fieldId = createFieldId();

  protected emptyValue(): boolean {
    return false;
  }

  protected onChangeChecked(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.commit(target.checked);
    }
  }
}
