import { Component, input } from '@angular/core';
import { BreadcrumbItem, Breadcrumbs } from './breadcrumbs';

@Component({
  selector: 'enzo-page-header',
  imports: [Breadcrumbs],
  template: `
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        @if (breadcrumbs().length) {
          <enzo-breadcrumbs [items]="breadcrumbs()" />
        }
        <h1 class="mt-2 font-display text-3xl leading-tight text-text-primary">{{ title() }}</h1>
        @if (description()) {
          <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{{ description() }}</p>
        }
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly breadcrumbs = input<readonly BreadcrumbItem[]>([]);
}
