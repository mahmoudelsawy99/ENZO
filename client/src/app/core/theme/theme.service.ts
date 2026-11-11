import { Injectable, signal } from '@angular/core';

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'enzo.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeName>(this.read());

  init(): void {
    this.apply(this.theme());
  }

  set(theme: ThemeName): void {
    this.theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.apply(theme);
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: ThemeName): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  }

  private read(): ThemeName {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
}
