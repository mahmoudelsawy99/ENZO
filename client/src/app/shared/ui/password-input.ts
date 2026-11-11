import { Component, booleanAttribute, input, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Field } from './field';
import { Icon } from './icon';
import { EnzoValueAccessor, createFieldId, fieldMessageId } from './value-accessor';

@Component({
  selector: 'enzo-password-input',
  imports: [Field, Icon, TranslatePipe],
  template: `
    <enzo-field
      [label]="label()"
      [hint]="hint()"
      [error]="shownError()"
      [required]="required()"
      [inputId]="fieldId"
    >
      <div class="relative">
        <input
          class="enzo-control pe-10"
          [id]="fieldId"
          [attr.type]="visible() ? 'text' : 'password'"
          [attr.name]="name()"
          [attr.placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.aria-invalid]="shownError() ? 'true' : 'false'"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-required]="required()"
          [value]="value()"
          [disabled]="isDisabled()"
          (input)="onInput($event)"
          (blur)="markTouched()"
        />
        <button
          type="button"
          class="absolute inset-y-0 end-0 grid w-10 place-items-center text-text-secondary hover:text-text-primary"
          [attr.aria-label]="(visible() ? 'common.hidePassword' : 'common.showPassword') | t"
          [attr.aria-pressed]="visible()"
          (click)="visible.update((open) => !open)"
        >
          <enzo-icon [name]="visible() ? 'eye-off' : 'eye'" />
        </button>
      </div>
    </enzo-field>
  `,
})
export class PasswordInput extends EnzoValueAccessor<string> {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly placeholder = input('');
  readonly name = input('');
  readonly autocomplete = input('current-password');
  readonly required = input(false, { transform: booleanAttribute });
  readonly visible = signal(false);
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
