import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

@Pipe({ name: 'enzoDate', pure: false })
export class EnzoDatePipe implements PipeTransform, OnDestroy {
  private readonly i18n = inject(LanguageService);
  private readonly view = inject(ChangeDetectorRef);

  constructor() {
    this.i18n.watch(this.view);
  }

  ngOnDestroy(): void {
    this.i18n.unwatch(this.view);
  }

  transform(value: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    this.i18n.language();
    if (value == null || value === '') {
      return '';
    }
    return this.i18n.formatDate(value, options);
  }
}

@Pipe({ name: 'enzoNumber', pure: false })
export class EnzoNumberPipe implements PipeTransform, OnDestroy {
  private readonly i18n = inject(LanguageService);
  private readonly view = inject(ChangeDetectorRef);

  constructor() {
    this.i18n.watch(this.view);
  }

  ngOnDestroy(): void {
    this.i18n.unwatch(this.view);
  }

  transform(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
    this.i18n.language();
    if (value == null || Number.isNaN(value)) {
      return '';
    }
    return this.i18n.formatNumber(value, options);
  }
}
