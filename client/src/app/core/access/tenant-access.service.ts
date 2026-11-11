import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BranchContext } from '../session/branch-context.service';
import { OrganizationApi } from '../../features/organization/organization.api';

/**
 * Display helper for the signed-in tenant user.
 * Menu filtering uses this snapshot. The API still decides every request.
 */
@Injectable({ providedIn: 'root' })
export class TenantAccess {
  private readonly api = inject(OrganizationApi);
  private readonly branches = inject(BranchContext);
  private flight: Promise<void> | null = null;

  readonly permissions = signal<string[]>([]);
  readonly isOwner = signal(false);
  readonly loaded = signal(false);

  readonly permissionSet = computed(() => new Set(this.permissions()));

  load(): Promise<void> {
    if (this.flight) {
      return this.flight;
    }
    this.flight = firstValueFrom(this.api.access())
      .then((response) => {
        this.permissions.set(response.data.permissions);
        this.isOwner.set(response.data.isOwner);
        this.loaded.set(true);
        this.branches.replace(
          response.data.branches
            .filter((branch) => branch.status === 'ACTIVE')
            .map((branch) => ({ id: branch.id, label: branch.name })),
        );
      })
      .catch(() => {
        this.flight = null;
      });
    return this.flight;
  }

  reload(): Promise<void> {
    this.flight = null;
    return this.load();
  }

  clear(): void {
    this.flight = null;
    this.permissions.set([]);
    this.isOwner.set(false);
    this.loaded.set(false);
    this.branches.replace([]);
  }

  can(permission: string): boolean {
    return this.isOwner() || this.permissionSet().has(permission);
  }
}
