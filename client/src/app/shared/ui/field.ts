import { Component, computed, input } from '@angular/core';
import { fieldMessageId } from './value-accessor';

@Component({
  selector: 'enzo-field',
  host: { class: 'block' },
  template: `
    <div class="grid gap-1.5">
      @if (label()) {
        <label class="text-sm font-medium text-text-primary" [attr.for]="inputId()">
          {{ label() }}
          @if (required()) {
            <span class="text-danger" aria-hidden="true">*</span>
          }
        </label>
      }
      <ng-content />
      @if (error()) {
        <p class="text-xs text-danger" role="alert" [id]="messageId()">{{ error() }}</p>
      } @else if (hint()) {
        <p class="text-xs text-text-secondary" [id]="messageId()">{{ hint() }}</p>
      }
    </div>
  `,
})
export class Field {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(false);
  readonly inputId = input.required<string>();
  readonly messageId = computed(() => fieldMessageId(this.inputId()));
}
