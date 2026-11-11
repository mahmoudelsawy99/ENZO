import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TenantAccess } from '../../core/access/tenant-access.service';
import { EntitlementState } from '../../core/access/entitlement.service';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TranslatePipe, Sidebar, Topbar],
  template: `
    <a class="skip-link" href="#main">{{ 'shell.skip' | t }}</a>
    <div class="min-h-dvh overflow-x-hidden bg-background text-text-primary lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[auto_minmax(0,1fr)] lg:overflow-hidden">
      <app-sidebar />
      <div class="flex min-h-dvh min-w-0 flex-col lg:h-full lg:min-h-0">
        <app-topbar />
        <main id="main" class="flex-1 px-4 py-6 md:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-8" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly access = inject(TenantAccess);
  private readonly entitlements = inject(EntitlementState);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user?.userType === 'TENANT_USER') {
        void this.access.load().then(() => {
          if (this.access.isOwner()) {
            void this.entitlements.load();
          }
        });
      } else {
        this.access.clear();
        this.entitlements.clear();
      }
    });
  }
}
