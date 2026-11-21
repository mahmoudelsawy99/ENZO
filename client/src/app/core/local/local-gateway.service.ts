import { Injectable, inject } from '@angular/core';
import { GoogleSyncService } from '../google/google-sync.service';
import { nileDb, openNileDatabase } from './local-database';
import { LocalBackupService } from './local-backup.service';
import { dispatchLocal } from './local-route';
import { dropRetiredServices, dropRetiredStaff, ensureAhmedCashier, ensureCashierExport, ensureCashierSlimMenu, ensureHaircutPrice, ensureHananCashier, ensureMabeaatTabAndCommission, ensureMetaweeCashier, ensureSawyAdmin, ensureSeed, ensureServiceCommissionRates, ensureZiadatRetailMenu } from './local-seed';
import { bindLocalWrites, localUserId, markLocalWrite } from './local-session';
import { isLocalFirst } from './local-mode';

@Injectable({ providedIn: 'root' })
export class LocalGateway {
  private readonly backup = inject(LocalBackupService);
  private readonly googleSync = inject(GoogleSyncService);
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
        this.queueServicesSync(path, result);
        this.queueUsersSync(path, result);
      }
      return result;
    });
  }

  private queueServicesSync(path: string, result: unknown): void {
    const clean = path.split('?')[0] ?? path;
    if (!clean.includes('/v1/services')) {
      return;
    }
    if (clean.includes('/v1/services/settings') || clean.includes('/v1/services/image')) {
      return;
    }
    this.googleSync.noteLocalServicesWrite(this.idsFromWrite(clean, 'services', result, ['settings', 'image']));
  }

  private queueUsersSync(path: string, result: unknown): void {
    const clean = path.split('?')[0] ?? path;
    if (!clean.includes('/v1/users')) {
      return;
    }
    this.googleSync.noteLocalUsersWrite(this.idsFromWrite(clean, 'users', result, []));
  }

  private idsFromWrite(clean: string, collection: string, result: unknown, skip: string[]): string[] {
    const ids: string[] = [];
    const payload = result && typeof result === 'object' ? (result as { data?: { id?: string } }) : null;
    if (payload?.data?.id) {
      ids.push(payload.data.id);
    }
    const parts = clean.split('/').filter(Boolean);
    const index = parts.indexOf(collection);
    const maybeId = index >= 0 ? parts[index + 1] : '';
    if (maybeId && !skip.includes(maybeId)) {
      ids.push(maybeId);
    }
    return ids;
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
    const ziadatAdded = await ensureZiadatRetailMenu(nileDb);
    const mabeaatUpdated = await ensureMabeaatTabAndCommission(nileDb);
    if (servicesDropped || ahmedAdded || metaweeAdded || cashierSlim || priceChanged || commissionChanged || ziadatAdded || mabeaatUpdated) {
      this.backup.markDirty();
    }
  }
}
