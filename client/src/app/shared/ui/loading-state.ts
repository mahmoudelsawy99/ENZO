import { Component, input } from '@angular/core';

@Component({
  selector: 'enzo-loading-state',
  host: { class: 'flex items-center justify-center gap-3 px-6 py-10 text-sm text-text-secondary', role: 'status' },
  template: `
    <span class="enzo-spinner" aria-hidden="true"></span>
    <span>{{ message() }}</span>
  `,
})
export class LoadingState {
  readonly message = input.required<string>();
}
