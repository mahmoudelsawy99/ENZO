import { Component, computed, inject, input, output } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { Button } from './button';
import { Icon } from './icon';

@Component({
  selector: 'enzo-pagination',
  imports: [Button, Icon],
  host: { class: 'flex flex-wrap items-center justify-between gap-3' },
  template: `
    <p class="text-sm text-text-secondary">{{ summary() }}</p>
    <div class="flex items-center gap-2">
      <button
        enzoButton
        variant="secondary"
        size="sm"
        type="button"
        [disabled]="page() <= 1"
        [attr.aria-label]="previousLabel()"
        (click)="pageChange.emit(page() - 1)"
      >
        <enzo-icon name="chevron-left" class="size-4 rtl:rotate-180" />
        <span class="hidden sm:inline">{{ previousLabel() }}</span>
      </button>
      <span class="min-w-10 text-center text-sm text-text-primary">{{ pageLabel() }}</span>
      <button
        enzoButton
        variant="secondary"
        size="sm"
        type="button"
        [disabled]="page() >= totalPages()"
        [attr.aria-label]="nextLabel()"
        (click)="pageChange.emit(page() + 1)"
      >
        <span class="hidden sm:inline">{{ nextLabel() }}</span>
        <enzo-icon name="chevron-right" class="size-4 rtl:rotate-180" />
      </button>
    </div>
  `,
})
export class Pagination {
  private readonly i18n = inject(LanguageService);
  readonly page = input(1);
  readonly pageSize = input(10);
  readonly total = input(0);
  readonly pageChange = output<number>();

  readonly totalPages = computed(() => {
    if (this.total() <= 0) {
      return 1;
    }
    return Math.ceil(this.total() / this.pageSize());
  });

  readonly summary = computed(() => {
    this.i18n.language();
    const from = this.total() <= 0 ? 0 : (this.page() - 1) * this.pageSize() + 1;
    const to = this.total() <= 0 ? 0 : Math.min(this.page() * this.pageSize(), this.total());
    return this.i18n.translate('common.showing', {
      from: this.i18n.formatNumber(from),
      to: this.i18n.formatNumber(to),
      total: this.i18n.formatNumber(this.total()),
    });
  });

  protected previousLabel(): string {
    this.i18n.language();
    return this.i18n.translate('common.previous');
  }

  protected nextLabel(): string {
    this.i18n.language();
    return this.i18n.translate('common.next');
  }

  protected pageLabel(): string {
    this.i18n.language();
    return this.i18n.formatNumber(this.page());
  }
}
