import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Button } from './button';
import { Icon } from './icon';

@Component({
  selector: 'enzo-error-state',
  imports: [Button, Icon, TranslatePipe],
  host: { class: 'block px-6 py-10 text-center', role: 'alert' },
  template: `
    <div class="mx-auto grid size-10 place-items-center rounded-md border border-border text-danger">
      <enzo-icon name="alert" />
    </div>
    <h2 class="mt-4 text-base font-semibold text-text-primary">{{ title() }}</h2>
    @if (message()) {
      <p class="mx-auto mt-2 max-w-md text-sm text-text-secondary">{{ message() }}</p>
    }
    @if (retryLabel()) {
      <button enzoButton class="mt-4" variant="secondary" type="button" (click)="retry.emit()">
        {{ retryLabel() }}
      </button>
    } @else {
      <button enzoButton class="mt-4" variant="secondary" type="button" (click)="retry.emit()">
        {{ 'common.retry' | t }}
      </button>
    }
  `,
})
export class ErrorState {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly retryLabel = input('');
  readonly retry = output<void>();
}
