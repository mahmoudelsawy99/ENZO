import { Component, computed, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'enzo-badge',
  host: { '[class]': 'hostClass()', role: 'status' },
  template: `<ng-content />`,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
  readonly hostClass = computed(
    () => `inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${TONES[this.tone()]}`,
  );
}

const TONES: Record<BadgeTone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  neutral: 'bg-hover text-text-secondary',
};
