import { Component, input } from '@angular/core';
import type { IconName } from '../../core/icons/icon-name';
import { Icon } from './icon';

@Component({
  selector: 'enzo-empty-state',
  imports: [Icon],
  host: { class: 'block px-6 py-10 text-center' },
  template: `
    <div class="mx-auto grid size-10 place-items-center rounded-md border border-border text-brand-gold">
      <enzo-icon [name]="icon()" />
    </div>
    <h2 class="mt-4 text-base font-semibold text-text-primary">{{ title() }}</h2>
    @if (description()) {
      <p class="mx-auto mt-2 max-w-md text-sm text-text-secondary">{{ description() }}</p>
    }
    <div class="mt-4">
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input<IconName>('inbox');
}
