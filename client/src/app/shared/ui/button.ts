import { Component, ElementRef, booleanAttribute, computed, inject, input } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'button[enzoButton], a[enzoButton]',
  template: `
    @if (loading()) {
      <span class="enzo-spinner" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  host: {
    '[class]': 'hostClass()',
    '[attr.type]': 'isButton ? type() : null',
    '[attr.disabled]': 'isButton && (disabled() || loading()) ? "" : null',
    '[attr.aria-busy]': 'loading()',
  },
})
export class Button {
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly isButton = this.hostElement.nativeElement.tagName === 'BUTTON';
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly iconOnly = input(false, { transform: booleanAttribute });

  readonly hostClass = computed(() => {
    const sizeClass = this.iconOnly()
      ? this.size() === 'sm'
        ? 'size-8 px-0'
        : 'size-10 px-0'
      : this.size() === 'sm'
        ? 'h-8 px-3 text-xs'
        : 'h-10 px-4 text-sm';
    return `${BASE} ${sizeClass} ${VARIANTS[this.variant()]}`;
  });
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-red text-on-brand hover:bg-brand-red-hover',
  secondary: 'border border-border bg-surface text-text-primary hover:bg-hover',
  danger: 'border border-danger bg-danger-subtle text-danger hover:bg-hover',
  ghost: 'bg-transparent text-text-primary hover:bg-hover',
};
