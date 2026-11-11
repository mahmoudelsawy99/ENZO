import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform, OnDestroy {
  private readonly i18n = inject(LanguageService);
  private readonly view = inject(ChangeDetectorRef);

  constructor() {
    this.i18n.watch(this.view);
  }

  ngOnDestroy(): void {
    this.i18n.unwatch(this.view);
  }

  transform(key: string | null | undefined, params?: Readonly<Record<string, string | number>>): string {
    this.i18n.language();
    if (!key) {
      return '';
    }
    return this.i18n.translate(key, params);
  }
}
