import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, ElementRef, booleanAttribute, computed, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Field } from './field';
import { Icon } from './icon';
import { MENU_POSITIONS } from './overlay-positions';
import { EnzoValueAccessor, createFieldId, fieldMessageId } from './value-accessor';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'enzo-select',
  imports: [Field, Icon, TranslatePipe, CdkOverlayOrigin, CdkConnectedOverlay],
  template: `
    <enzo-field
      [label]="label()"
      [hint]="hint()"
      [error]="shownError()"
      [required]="required()"
      [inputId]="fieldId"
    >
      <button
        #trigger
        #origin="cdkOverlayOrigin"
        cdkOverlayOrigin
        type="button"
        class="enzo-control flex items-center justify-between gap-2 text-start"
        [id]="fieldId"
        [disabled]="isDisabled()"
        [attr.aria-haspopup]="'listbox'"
        [attr.aria-expanded]="open()"
        [attr.aria-invalid]="shownError() ? 'true' : 'false'"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-required]="required()"
        (click)="toggle()"
        (blur)="markTouched()"
        (keydown)="onTriggerKey($event)"
      >
        <span class="truncate" [class.text-text-secondary]="!selected()">
          {{ selected()?.label || placeholder() }}
        </span>
        <enzo-icon name="chevron-down" class="size-4 text-text-secondary" />
      </button>
    </enzo-field>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayPush]="true"
      (overlayOutsideClick)="open.set(false)"
      (detach)="open.set(false)"
    >
      <div class="enzo-menu-panel overflow-hidden" [style.min-width.px]="panelWidth()">
        @if (searchable()) {
          <div class="border-b border-border p-2">
            <input
              #search
              class="enzo-control"
              type="search"
              [attr.placeholder]="'common.search' | t"
              [attr.aria-label]="'common.search' | t"
              [value]="query()"
              (input)="onQuery($event)"
              (keydown)="onSearchKey($event)"
            />
          </div>
        }
      <ul
        #list
        class="max-h-64 overflow-auto p-1"
        role="listbox"
        tabindex="-1"
        [attr.aria-label]="label() || placeholder()"
        (keydown)="onListKey($event)"
      >
        @for (option of visibleOptions(); track option.value; let index = $index) {
          <li
            role="option"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm text-text-primary"
            [class.bg-hover]="index === activeIndex()"
            [class.opacity-40]="option.disabled"
            [attr.aria-selected]="option.value === value()"
            [attr.aria-disabled]="option.disabled || null"
            (mouseenter)="activeIndex.set(index)"
            (click)="choose(option)"
          >
            <span class="truncate">{{ option.label }}</span>
            @if (option.value === value()) {
              <enzo-icon name="check" class="size-4 text-brand-gold" />
            }
          </li>
        } @empty {
          <li class="px-3 py-2 text-sm text-text-secondary">{{ 'common.emptyTitle' | t }}</li>
        }
      </ul>
      </div>
    </ng-template>
  `,
})
export class Select extends EnzoValueAccessor<string> {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly placeholder = input('');
  readonly required = input(false, { transform: booleanAttribute });
  readonly options = input<readonly SelectOption[]>([]);
  readonly searchable = input(false, { transform: booleanAttribute });
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(0);
  readonly panelWidth = signal(0);
  readonly positions = MENU_POSITIONS;
  readonly fieldId = createFieldId();
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  readonly selected = computed(() => this.options().find((option) => option.value === this.value()));
  readonly visibleOptions = computed(() => {
    const query = this.query().trim().toLowerCase();
    const options = this.options();
    if (!query) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(query));
  });

  protected emptyValue(): string {
    return '';
  }

  protected shownError(): string {
    return this.error() || this.validationError();
  }

  protected describedBy(): string | null {
    return this.shownError() || this.hint() ? fieldMessageId(this.fieldId) : null;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.panelWidth.set(this.trigger()?.nativeElement.offsetWidth ?? 0);
    this.query.set('');
    const selectedIndex = this.options().findIndex((option) => option.value === this.value());
    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : 0);
    this.open.set(true);
    queueMicrotask(() => (this.searchable() ? this.search()?.nativeElement.focus() : this.list()?.nativeElement.focus()));
  }

  protected close(): void {
    this.query.set('');
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  protected onQuery(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(0);
      this.list()?.nativeElement.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.visibleOptions()[this.activeIndex()];
      if (option && !option.disabled) {
        this.choose(option);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  protected choose(option: SelectOption): void {
    if (option.disabled) {
      return;
    }
    this.commit(option.value);
    this.close();
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) {
        this.toggle();
      }
    }
  }

  protected onListKey(event: KeyboardEvent): void {
    const indexes = this.visibleOptions()
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (indexes.length === 0) {
      return;
    }
    const current = Math.max(0, indexes.indexOf(this.activeIndex()));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = indexes[(current + step + indexes.length) % indexes.length];
      if (next !== undefined) {
        this.activeIndex.set(next);
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? indexes[0] : indexes[indexes.length - 1];
      if (next !== undefined) {
        this.activeIndex.set(next);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = this.visibleOptions()[this.activeIndex()];
      if (option) {
        this.choose(option);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
