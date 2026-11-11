import { Component, input } from '@angular/core';

@Component({
  selector: 'enzo-card',
  host: { class: 'block rounded-lg border border-border bg-surface' },
  template: `
    @if (title()) {
      <header class="border-b border-border px-5 py-4">
        <h2 class="text-base font-semibold text-text-primary">{{ title() }}</h2>
        @if (description()) {
          <p class="mt-1 text-sm text-text-secondary">{{ description() }}</p>
        }
      </header>
    }
    <div class="p-5">
      <ng-content />
    </div>
  `,
})
export class Card {
  readonly title = input('');
  readonly description = input('');
}
