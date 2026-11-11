import { Component, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Icon } from './icon';
import { ToastService, type ToastTone } from './toast.service';
import type { IconName } from '../../core/icons/icon-name';

@Component({
  selector: 'enzo-toaster',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="pointer-events-none fixed top-4 z-[70] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2 end-4" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <article
          class="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3 shadow-panel"
          role="status"
          [attr.aria-live]="toast.tone === 'danger' ? 'assertive' : 'polite'"
        >
          <enzo-icon [name]="iconFor(toast.tone)" [class]="toneClass(toast.tone)" />
          <p class="flex-1 text-sm text-text-primary">{{ toast.message }}</p>
          <button
            type="button"
            class="text-text-secondary hover:text-text-primary"
            [attr.aria-label]="'common.close' | t"
            (click)="toasts.dismiss(toast.id)"
          >
            <enzo-icon name="x" class="size-4" />
          </button>
        </article>
      }
    </div>
  `,
})
export class Toaster {
  readonly toasts = inject(ToastService);

  protected iconFor(tone: ToastTone): IconName {
    if (tone === 'success') return 'check';
    if (tone === 'warning' || tone === 'danger') return 'alert';
    return 'info';
  }

  protected toneClass(tone: ToastTone): string {
    if (tone === 'success') return 'text-success';
    if (tone === 'warning') return 'text-warning';
    if (tone === 'danger') return 'text-danger';
    return 'text-info';
  }
}
