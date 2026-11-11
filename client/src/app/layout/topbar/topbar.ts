import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Menu, type MenuEntry } from '../../shared/ui/menu';
import { ShellState } from '../shell-state.service';

@Component({
  selector: 'app-topbar',
  imports: [TranslatePipe, Button, Icon, Menu],
  template: `
    <header class="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 md:px-4">
      <div class="lg:hidden">
        <button
          enzoButton
          variant="ghost"
          iconOnly
          type="button"
          [attr.aria-label]="'shell.openMenu' | t"
          (click)="shell.toggleMobile()"
        >
          <enzo-icon name="menu" />
        </button>
      </div>

      <div class="ms-auto flex flex-wrap items-center gap-1 sm:gap-2">
        <!-- Branch dropdown hidden -->

        <div
          class="inline-flex rounded-md border border-border p-0.5"
          role="group"
          [attr.aria-label]="'shell.language' | t"
        >
          <button
            type="button"
            class="rounded-sm px-2 py-1 text-xs"
            [class.bg-surface-elevated]="language.language() === 'en'"
            [class.text-text-primary]="language.language() === 'en'"
            [class.text-text-secondary]="language.language() !== 'en'"
            [attr.aria-pressed]="language.language() === 'en'"
            (click)="language.setLanguage('en')"
          >
            {{ 'language.en' | t }}
          </button>
          <button
            type="button"
            class="rounded-sm px-2 py-1 text-xs"
            [class.bg-surface-elevated]="language.language() === 'ar'"
            [class.text-text-primary]="language.language() === 'ar'"
            [class.text-text-secondary]="language.language() !== 'ar'"
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
          [attr.aria-pressed]="theme.theme() === 'light'"
          (click)="theme.toggle()"
        >
          <enzo-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
        </button>

        <enzo-menu
          [label]="'shell.notifications' | t"
          icon="bell"
          iconOnly
          align="end"
          [entries]="[]"
          [emptyLabel]="'shell.noNotifications' | t"
        />

        <enzo-menu
          [label]="'shell.account' | t"
          [triggerLabel]="auth.user()?.fullName || ('shell.userName' | t)"
          icon="user"
          align="end"
          [entries]="profileEntries()"
          (selected)="onAccount($event)"
        />
      </div>
    </header>
  `,
})
export class Topbar {
  readonly shell = inject(ShellState);
  readonly theme = inject(ThemeService);
  readonly language = inject(LanguageService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly profileEntries = computed<MenuEntry[]>(() => {
    this.language.language();
    return [
      { id: 'profile', label: this.language.translate('shell.profile'), icon: 'user' },
      { id: 'signout', label: this.language.translate('shell.signOut'), icon: 'logout' },
    ];
  });

  protected onAccount(id: string): void {
    if (id === 'signout') {
      this.auth.logout().subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: () => void this.router.navigateByUrl('/login'),
      });
      return;
    }
    void this.router.navigateByUrl('/account');
  }
}
