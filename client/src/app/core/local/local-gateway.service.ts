import { Injectable, inject } from '@angular/core';
import { nileDb, openNileDatabase } from './local-database';
import { LocalBackupService } from './local-backup.service';
import { dispatchLocal } from './local-route';
import { dropRetiredServices, dropRetiredStaff, ensureAhmedCashier, ensureCashierExport, ensureCashierSlimMenu, ensureHaircutPrice, ensureHananCashier, ensureMetaweeCashier, ensureSawyAdmin, ensureSeed, ensureServiceCommissionRates } from './local-seed';
import { bindLocalWrites, localUserId, markLocalWrite } from './local-session';
import { isLocalFirst } from './local-mode';

@Injectable({ providedIn: 'root' })
export class LocalGateway {
  private readonly backup = inject(LocalBackupService);
  private ready: Promise<void> | null = null;

  prepare(): Promise<void> {
    if (!isLocalFirst()) {
      return Promise.resolve();
    }
    this.ready ??= this.boot();
    return this.ready;
  }

  call(method: string, path: string, body: unknown = null): Promise<unknown> {
    return this.prepare().then(async () => {
      const result = await dispatchLocal({ db: nileDb, method, path, body, userId: localUserId() });
      if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        markLocalWrite();
      }
      return result;
    });
  }

  private async boot(): Promise<void> {
    bindLocalWrites(() => this.backup.markDirty());
    await openNileDatabase();
    await ensureSeed(nileDb);
    await dropRetiredStaff(nileDb);
    const servicesDropped = await dropRetiredServices(nileDb);
    await ensureSawyAdmin(nileDb);
    await ensureHananCashier(nileDb);
    const ahmedAdded = await ensureAhmedCashier(nileDb);
    const metaweeAdded = await ensureMetaweeCashier(nileDb);
    await ensureCashierExport(nileDb);
    const cashierSlim = await ensureCashierSlimMenu(nileDb);
    await this.backup.hydrate();
    const priceChanged = await ensureHaircutPrice(nileDb);
    const commissionChanged = await ensureServiceCommissionRates(nileDb);
    if (servicesDropped || ahmedAdded || metaweeAdded || cashierSlim || priceChanged || commissionChanged) {
      this.backup.markDirty();
    }
  }
}
