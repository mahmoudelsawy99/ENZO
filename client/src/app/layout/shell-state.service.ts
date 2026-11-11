import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'enzo.sidebar';

@Injectable({ providedIn: 'root' })
export class ShellState {
  readonly collapsed = signal(this.read());
  readonly mobileOpen = signal(false);

  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
    localStorage.setItem(STORAGE_KEY, this.collapsed() ? 'collapsed' : 'expanded');
  }

  toggleMobile(): void {
    this.mobileOpen.update((value) => !value);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }

  private read(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'collapsed';
    } catch {
      return false;
    }
  }
}
