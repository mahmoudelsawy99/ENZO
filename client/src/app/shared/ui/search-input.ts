import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Field } from './field';
import { Icon } from './icon';
import { EnzoValueAccessor, createFieldId } from './value-accessor';

@Component({
  selector: 'enzo-search-input',
  imports: [Field, Icon, TranslatePipe],
  host: { class: 'block min-w-0' },
  template: `
    <enzo-field [label]="label()" [inputId]="fieldId">
      <div class="relative">
        <input
          class="enzo-control text-start [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          [class.pe-10]="value()"
          [id]="fieldId"
          type="search"
          [attr.placeholder]="placeholder()"
          [attr.aria-label]="label() || placeholder()"
          [value]="value()"
          [disabled]="isDisabled()"
          (input)="onInput($event)"
          (blur)="markTouched()"
        />
        @if (value()) {
          <button
            type="button"
            class="absolute inset-y-0 end-0 grid w-10 place-items-center text-text-secondary hover:text-text-primary"
            [attr.aria-label]="'common.clear' | t"
            (click)="commit('')"
          >
            <enzo-icon name="x" />
          </button>
        }
      </div>
    </enzo-field>
  `,
})
export class SearchInput extends EnzoValueAccessor<string> {
  readonly label = input('');
  readonly placeholder = input('');
  readonly fieldId = createFieldId();

  protected emptyValue(): string {
    return '';
  }

  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.commit(target.value);
    }
  }
}
