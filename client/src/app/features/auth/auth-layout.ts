import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, TranslatePipe, Button, Icon],
  template: `
    <div class="grid min-h-dvh place-items-center bg-background px-4 py-8 text-text-primary">
      <div class="w-full max-w-md">
        <div class="mb-6 flex items-center justify-between gap-3">
          <a class="flex items-center gap-3" routerLink="/login" [attr.aria-label]="'ENZO'">
            <span class="relative grid size-10 place-items-center overflow-hidden rounded-md border border-border bg-surface">
              <span class="absolute inset-x-0 top-0 h-0.5 bg-brand-red"></span>
              <span class="font-display text-lg">E</span>
              <span class="absolute inset-x-0 bottom-0 h-0.5 bg-brand-blue"></span>
            </span>
            <span class="font-display text-2xl tracking-[0.14em]">ENZO</span>
          </a>
          <div class="flex items-center gap-1">
            <div class="inline-flex rounded-md border border-border p-0.5" role="group" [attr.aria-label]="'shell.language' | t">
              <button
                type="button"
                class="rounded-sm px-2 py-1 text-xs"
                [class.bg-surface-elevated]="language.language() === 'en'"
                [attr.aria-pressed]="language.language() === 'en'"
                (click)="language.setLanguage('en')"
              >
                {{ 'language.en' | t }}
              </button>
              <button
                type="button"
                class="rounded-sm px-2 py-1 text-xs"
                [class.bg-surface-elevated]="language.language() === 'ar'"
                [attr.aria-pressed]="language.language() === 'ar'"
                (click)="language.setLanguage('ar')"
              >
                {{ 'language.ar' | t }}
              </button>
            </div>
            <button
              enzoButton
              variant="ghost"
              iconOnly
              type="button"
              [attr.aria-label]="(theme.theme() === 'dark' ? 'shell.themeLight' : 'shell.themeDark') | t"
              (click)="theme.toggle()"
            >
              <enzo-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
          </div>
        </div>
        <section class="rounded-lg border border-border bg-surface p-6 shadow-panel">
          <ng-content />
        </section>
      </div>
    </div>
  `,
})
export class AuthLayout {
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
}
