import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, ElementRef, booleanAttribute, computed, input, output, signal, viewChild } from '@angular/core';
import type { IconName } from '../../core/icons/icon-name';
import { Button } from './button';
import { Icon } from './icon';
import { MENU_POSITIONS, MENU_POSITIONS_END } from './overlay-positions';

export interface MenuEntry {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
}

@Component({
  selector: 'enzo-menu',
  imports: [Button, Icon, CdkOverlayOrigin, CdkConnectedOverlay],
  template: `
    <button
      #triggerButton
      #origin="cdkOverlayOrigin"
      cdkOverlayOrigin
      enzoButton
      variant="ghost"
      type="button"
      [iconOnly]="iconOnly()"
      [attr.aria-label]="label()"
      [attr.aria-haspopup]="'menu'"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      @if (icon()) {
        <enzo-icon [name]="icon()!" />
      }
      @if (!iconOnly()) {
        <span class="max-w-40 truncate">{{ triggerLabel() || label() }}</span>
        <enzo-icon name="chevron-down" class="size-4 text-text-secondary" />
      }
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayPush]="true"
      (overlayOutsideClick)="close(false)"
      (detach)="open.set(false)"
    >
      <div
        #panel
        class="enzo-menu-panel min-w-52 p-1"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="label()"
        (keydown)="onPanelKey($event)"
      >
        @if (entries().length === 0) {
          <p class="px-3 py-2 text-sm text-text-secondary">{{ emptyLabel() }}</p>
        } @else {
          @for (entry of entries(); track entry.id; let index = $index) {
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-hover disabled:opacity-50"
              [class.text-danger]="entry.danger"
              [class.text-text-primary]="!entry.danger"
              [class.bg-hover]="index === activeIndex()"
              [disabled]="entry.disabled"
              (mouseenter)="activeIndex.set(index)"
              (click)="choose(entry)"
            >
              @if (entry.icon) {
                <enzo-icon [name]="entry.icon" class="size-4" />
              }
              <span class="truncate">{{ entry.label }}</span>
              @if (entry.id === activeId()) {
                <enzo-icon name="check" class="ms-auto size-4 text-brand-gold" />
              }
            </button>
          }
        }
      </div>
    </ng-template>
  `,
})
export class Menu {
  readonly label = input.required<string>();
  readonly triggerLabel = input('');
  readonly entries = input<readonly MenuEntry[]>([]);
  readonly align = input<'start' | 'end'>('start');
  readonly icon = input<IconName | null>(null);
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly emptyLabel = input('');
  readonly activeId = input<string | null>(null);
  readonly selected = output<string>();
  readonly open = signal(false);
  readonly activeIndex = signal(0);
  readonly positions = computed(() => (this.align() === 'end' ? MENU_POSITIONS_END : MENU_POSITIONS));
  private readonly origin = viewChild.required(CdkOverlayOrigin);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.activeIndex.set(0);
    this.open.set(true);
    queueMicrotask(() => this.panel()?.nativeElement.focus());
  }

  protected close(restoreFocus: boolean): void {
    this.open.set(false);
    if (restoreFocus) {
      this.origin().elementRef.nativeElement.focus();
    }
  }

  protected choose(entry: MenuEntry): void {
    if (entry.disabled) {
      return;
    }
    this.selected.emit(entry.id);
    this.close(true);
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) {
        this.toggle();
      }
    }
  }

  protected onPanelKey(event: KeyboardEvent): void {
    const enabled = this.entries()
      .map((entry, index) => (entry.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (enabled.length === 0) {
      return;
    }
    const current = Math.max(0, enabled.indexOf(this.activeIndex()));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = enabled[(current + step + enabled.length) % enabled.length];
      if (next !== undefined) {
        this.activeIndex.set(next);
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
      if (next !== undefined) {
        this.activeIndex.set(next);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const entry = this.entries()[this.activeIndex()];
      if (entry) {
        this.choose(entry);
      }
    }
  }
}
