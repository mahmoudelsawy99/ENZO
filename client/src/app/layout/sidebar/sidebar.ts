import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { EntitlementState } from '../../core/access/entitlement.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthService } from '../../core/auth/auth.service';
import { NAV_GROUPS, PLATFORM_NAV, staffHome } from '../../core/navigation/navigation';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { ShellState } from '../shell-state.service';

@Component({
  selector: 'app-sidebar',
  host: { class: 'block lg:h-full lg:max-h-full lg:min-h-0 lg:overflow-hidden' },
  imports: [RouterLink, TranslatePipe, Icon, Button],
  template: `
    @if (shell.mobileOpen()) {
      <button
        type="button"
        class="fixed inset-0 z-40 bg-overlay lg:hidden"
        [attr.aria-label]="'shell.closeMenu' | t"
        (click)="shell.closeMobile()"
      ></button>
    }
    <aside
      class="enzo-sidebar fixed inset-y-0 start-0 z-50 flex h-full max-h-full min-h-0 max-lg:w-64 flex-col overflow-hidden border-e border-border bg-sidebar transition-[width,transform] duration-200 lg:static lg:z-auto"
      [class.is-offscreen]="!shell.mobileOpen()"
      [class.lg:w-64]="!shell.collapsed()"
      [class.lg:w-18]="shell.collapsed()"
    >
      <div
        class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3"
        [class.lg:flex-col]="shell.collapsed()"
        [class.lg:px-2]="shell.collapsed()"
      >
        <a class="flex min-w-0 items-center gap-2" [routerLink]="homeLink()" [attr.aria-label]="'ENZO'">
          <span class="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-elevated">
            <span class="absolute inset-x-0 top-0 h-0.5 bg-brand-red"></span>
            <span class="font-display text-sm text-text-primary">E</span>
            <span class="absolute inset-x-0 bottom-0 h-0.5 bg-brand-blue"></span>
          </span>
          <span class="truncate font-display text-xl tracking-[0.14em] text-text-primary" [class.lg:hidden]="shell.collapsed()">
            ENZO
          </span>
        </a>
        <div class="ms-auto hidden shrink-0 lg:block" [class.lg:ms-0]="shell.collapsed()">
          <button
            enzoButton
            variant="ghost"
            type="button"
            [iconOnly]="shell.collapsed()"
            [attr.aria-expanded]="!shell.collapsed()"
            [attr.aria-label]="(shell.collapsed() ? 'shell.expand' : 'shell.collapse') | t"
            (click)="shell.toggleCollapsed()"
          >
            <span class="rtl:hidden"><enzo-icon [name]="shell.collapsed() ? 'chevron-right' : 'chevron-left'" /></span>
            <span class="hidden rtl:inline-flex"><enzo-icon [name]="shell.collapsed() ? 'chevron-left' : 'chevron-right'" /></span>
            @if (!shell.collapsed()) {
              <span>{{ 'shell.collapse' | t }}</span>
            }
          </button>
        </div>
        <div class="ms-auto lg:hidden">
          <button
            enzoButton
            variant="ghost"
            iconOnly
            type="button"
            [attr.aria-label]="'shell.closeMenu' | t"
            (click)="shell.closeMobile()"
          >
            <enzo-icon name="x" />
          </button>
        </div>
      </div>

      <nav #nav class="enzo-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3" [attr.aria-label]="'shell.primaryNav' | t" (focusin)="reveal($event)">
        @for (group of groups(); track group.labelKey) {
          <section class="mb-3">
            <h2
              class="px-3 pb-1 pt-2 text-xs font-medium text-text-secondary ltr:tracking-wide"
              [class.lg:hidden]="shell.collapsed()"
            >
              {{ group.labelKey | t }}
            </h2>
            <ul class="grid gap-1">
              @for (item of group.items; track item.path) {
                <li>
                  <a
                    class="flex items-center gap-3 rounded-md border-s-2 border-transparent px-3 py-2 text-sm text-text-secondary hover:bg-hover hover:text-text-primary"
                    [class.border-brand-red]="isActive(item.path)"
                    [class.bg-surface-elevated]="isActive(item.path)"
                    [class.text-text-primary]="isActive(item.path)"
                    [class.lg:justify-center]="shell.collapsed()"
                    [class.lg:px-2]="shell.collapsed()"
                    [routerLink]="'/' + item.path"
                    [attr.aria-current]="isActive(item.path) ? 'page' : null"
                    [attr.title]="shell.collapsed() ? (item.labelKey | t) : null"
                  >
                    <enzo-icon [name]="item.icon" class="size-4" />
                    <span class="truncate" [class.lg:hidden]="shell.collapsed()">{{ item.labelKey | t }}</span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </nav>
    </aside>
  `,
})
export class Sidebar {
  readonly shell = inject(ShellState);
  private readonly auth = inject(AuthService);
  private readonly access = inject(TenantAccess);
  private readonly entitlements = inject(EntitlementState);
  readonly groups = computed(() => {
    if (this.auth.user()?.userType === 'SUPER_ADMIN') {
      return PLATFORM_NAV;
    }
    const ready = this.access.loaded();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!ready) {
          return true;
        }
        if (item.ownerOnly && !this.access.isOwner()) {
          return false;
        }
        if (item.feature && !this.entitlements.allows(item.feature)) {
          return false;
        }
        if (item.anyPermissions && item.anyPermissions.length > 0) {
          return item.anyPermissions.some((key) => this.access.can(key));
        }
        return !item.permission || this.access.can(item.permission);
      }),
    })).filter((group) => group.items.length > 0);
  });
  readonly homeLink = computed(() => {
    if (this.auth.user()?.userType === 'SUPER_ADMIN') {
      return '/platform';
    }
    if (!this.access.loaded()) {
      return '/dashboard';
    }
    return staffHome((key) => this.access.can(key));
  });
  private readonly nav = viewChild<ElementRef<HTMLElement>>('nav');
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    effect(() => {
      this.url();
      this.shell.closeMobile();
    });
    effect(() => {
      this.url();
      this.groups();
      setTimeout(() => this.scrollCurrent(this.nav()?.nativeElement));
    });
  }

  protected reveal(event: FocusEvent): void {
    const root = this.nav()?.nativeElement;
    const target = event.target;
    if (!root || !(target instanceof HTMLElement)) {
      return;
    }
    this.scrollWithin(root, target);
  }

  private scrollCurrent(root: HTMLElement | undefined): void {
    const current = root?.querySelector<HTMLElement>('[aria-current="page"]');
    if (root && current) {
      this.scrollWithin(root, current);
    }
  }

  private scrollWithin(root: HTMLElement, item: HTMLElement): void {
    const rootRect = root.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < rootRect.top) {
      root.scrollTop -= rootRect.top - itemRect.top;
    } else if (itemRect.bottom > rootRect.bottom) {
      root.scrollTop += itemRect.bottom - rootRect.bottom;
    }
  }

  protected isActive(path: string): boolean {
    const current = (this.url().split('?')[0] ?? '').replace(/\/$/, '') || '/';
    const target = `/${path}`;
    if (path === 'dashboard' || path === 'platform') {
      return current === target;
    }
    return current === target || current.startsWith(`${target}/`);
  }
}
