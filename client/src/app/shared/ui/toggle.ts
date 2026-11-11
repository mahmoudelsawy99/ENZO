import { Component, input } from '@angular/core';
import { EnzoValueAccessor, createFieldId } from './value-accessor';

@Component({
  selector: 'enzo-toggle',
  template: `
    <div class="flex items-center justify-between gap-3">
      @if (label()) {
        <label class="text-sm text-text-primary" [attr.for]="fieldId">{{ label() }}</label>
      }
      <button
        class="enzo-switch"
        type="button"
        role="switch"
        [id]="fieldId"
        [attr.aria-checked]="value()"
        [attr.aria-label]="ariaLabel() || label()"
        [disabled]="isDisabled()"
        (click)="commit(!value())"
        (blur)="markTouched()"
      >
        <span class="enzo-switch-thumb"></span>
      </button>
    </div>
  `,
})
export class Toggle extends EnzoValueAccessor<boolean> {
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly fieldId = createFieldId();

  protected emptyValue(): boolean {
    return false;
  }
}
