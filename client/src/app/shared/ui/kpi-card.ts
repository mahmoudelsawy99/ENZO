import { Component, input } from '@angular/core';

@Component({
  selector: 'enzo-kpi-card',
  host: { class: 'block rounded-lg border border-border bg-surface p-5' },
  template: `
    <p class="text-sm text-text-secondary">{{ label() }}</p>
    <p class="mt-2 font-display text-3xl leading-none text-text-primary">{{ value() }}</p>
    @if (hint()) {
      <p class="mt-3 text-xs text-text-secondary">{{ hint() }}</p>
    }
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
}
