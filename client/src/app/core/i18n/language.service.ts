import { Directionality } from '@angular/cdk/bidi';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AppLanguage = 'en' | 'ar';

const STORAGE_KEY = 'enzo.lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly http = inject(HttpClient);
  private readonly directionality = inject(Directionality);
  private readonly watchers = new Set<ChangeDetectorRef>();

  readonly language = signal<AppLanguage>(this.read());
  readonly ready = signal(false);
  private readonly messages = signal<Readonly<Record<string, string>>>({});

  watch(view: ChangeDetectorRef): void {
    this.watchers.add(view);
  }

  unwatch(view: ChangeDetectorRef): void {
    this.watchers.delete(view);
  }

  async init(): Promise<void> {
    await this.apply(this.read());
  }

  async setLanguage(language: AppLanguage): Promise<void> {
    if (language === this.language() && this.ready()) {
      return;
    }
    await this.apply(language);
  }

  translate(key: string, params?: Readonly<Record<string, string | number>>): string {
    const template = this.messages()[key] ?? key;
    if (!params) {
      return template;
    }
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) => {
      const value = params[token];
      return value === undefined ? '' : String(value);
    });
  }

  formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(this.locale(), options ?? { dateStyle: 'medium' }).format(date);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }

  direction(): 'ltr' | 'rtl' {
    return this.language() === 'ar' ? 'rtl' : 'ltr';
  }

  private locale(): string {
    return this.language() === 'ar' ? 'ar' : 'en';
  }

  private async apply(language: AppLanguage): Promise<void> {
    try {
      const payload = await firstValueFrom(
        this.http.get<unknown>(`assets/i18n/${language}.json`),
      );
      this.messages.set(flattenMessages(payload));
    } catch (error) {
      console.error('[enzo] Unable to load translations.', error);
      this.messages.set({});
    }

    this.language.set(language);
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    const root = document.documentElement;
    root.lang = language;
    root.dir = direction;
    localStorage.setItem(STORAGE_KEY, language);
    this.directionality.valueSignal.set(direction);
    this.directionality.change.emit(direction);
    this.ready.set(true);
    for (const view of this.watchers) {
      view.markForCheck();
    }
  }

  private read(): AppLanguage {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en';
    } catch {
      return 'en';
    }
  }
}

function flattenMessages(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') {
    if (prefix) {
      out[prefix] = value;
    }
    return out;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    flattenMessages(child, next, out);
  }
  return out;
}
