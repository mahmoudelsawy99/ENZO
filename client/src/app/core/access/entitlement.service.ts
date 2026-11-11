import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api-client';

export interface EntitlementView {
  unrestricted: boolean;
  status: string;
  features: string[];
  limits: { branches: number; users: number; employees: number; storageMb: number };
  usage: { branches: number; users: number; employees: number; storageMb: number | null };
  subscriptionId: string | null;
  planCode: string | null;
}

@Injectable({ providedIn: 'root' })
export class EntitlementState {
  private readonly api = inject(ApiClient);
  readonly current = signal<EntitlementView | null>(null);

  load(): Promise<void> {
    return firstValueFrom(this.api.get<{ data: EntitlementView }>('/v1/billing/entitlements'))
      .then((response) => {
        this.current.set(response.data);
      })
      .catch(() => {
        this.current.set(null);
      });
  }

  clear(): void {
    this.current.set(null);
  }

  /** Unloaded entitlements stay visible. The API still enforces the plan. */
  allows(feature: string): boolean {
    const current = this.current();
    if (!current || current.unrestricted) {
      return true;
    }
    return current.features.includes(feature);
  }
}
