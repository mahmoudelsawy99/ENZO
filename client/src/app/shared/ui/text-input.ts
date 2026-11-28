import { Component, booleanAttribute, computed, input, signal } from '@angular/core';
import { Field } from './field';
import { EnzoValueAccessor, createFieldId, fieldMessageId } from './value-accessor';

@Component({
  selector: 'enzo-text-input',
  imports: [Field],
  template: `
    <enzo-field
      [label]="label()"
      [hint]="hint()"
      [error]="shownError()"
      [required]="required()"
      [floating]="floating()"
      [active]="isFloatingActive()"
      [inputId]="fieldId"
    >
      <input
        class="enzo-control"
        [class.enzo-control-floating]="floating()"
        [id]="fieldId"
        [attr.type]="type()"
        [attr.name]="name()"
        [attr.placeholder]="floating() ? ' ' : placeholder()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-invalid]="shownError() ? 'true' : 'false'"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-required]="required()"
        [value]="value()"
        [disabled]="isDisabled()"
        (input)="onInput($event)"
        (focus)="focused.set(true)"
        (blur)="onBlur()"
      />
    </enzo-field>
  `,
})
export class TextInput extends EnzoValueAccessor<string> {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly placeholder = input('');
  readonly name = input('');
  readonly autocomplete = input('off');
  readonly type = input<'text' | 'email' | 'tel' | 'search' | 'time' | 'number'>('text');
  readonly required = input(false, { transform: booleanAttribute });
  readonly floating = input(false, { transform: booleanAttribute });
  readonly fieldId = createFieldId();
  protected readonly focused = signal(false);
  protected readonly isFloatingActive = computed(() => this.focused() || this.value().trim().length > 0);

  protected emptyValue(): string {
    return '';
  }

  protected shownError(): string {
    return this.error() || this.validationError();
  }

  protected describedBy(): string | null {
    return this.shownError() || this.hint() ? fieldMessageId(this.fieldId) : null;
  }

  /** Commits the native input value into the form control. */
  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.commit(target.value);
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.markTouched();
  }
}
