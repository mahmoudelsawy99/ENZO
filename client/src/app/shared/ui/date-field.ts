import { Component, booleanAttribute, input } from '@angular/core';
import { Field } from './field';
import { EnzoValueAccessor, createFieldId, fieldMessageId } from './value-accessor';

/**
 * Styled date field and the integration point for a future calendar.
 * The value is an ISO date string (yyyy-mm-dd) from the native picker.
 */
@Component({
  selector: 'enzo-date-field',
  imports: [Field],
  template: `
    <enzo-field
      [label]="label()"
      [hint]="hint()"
      [error]="shownError()"
      [required]="required()"
      [inputId]="fieldId"
    >
      <input
        class="enzo-control"
        type="date"
        [id]="fieldId"
        [attr.name]="name()"
        [attr.aria-invalid]="shownError() ? 'true' : 'false'"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-required]="required()"
        [value]="value()"
        [disabled]="isDisabled()"
        (input)="onInput($event)"
        (blur)="markTouched()"
      />
    </enzo-field>
  `,
})
export class DateField extends EnzoValueAccessor<string> {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly name = input('');
  readonly required = input(false, { transform: booleanAttribute });
  readonly fieldId = createFieldId();

  protected emptyValue(): string {
    return '';
  }

  protected shownError(): string {
    return this.error() || this.validationError();
  }

  protected describedBy(): string | null {
    return this.shownError() || this.hint() ? fieldMessageId(this.fieldId) : null;
  }

  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.commit(target.value);
    }
  }
}
