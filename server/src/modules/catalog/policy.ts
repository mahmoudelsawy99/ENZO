import mongoose from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { Tenant } from '../tenants/tenant.model.js';
import { Customer } from '../customers/customer.model.js';

export interface CatalogPolicy {
  maxCommissionPercent: number;
  uniquePhone: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function policyFrom(settings: unknown): CatalogPolicy {
  const catalog = asRecord(asRecord(settings)['catalog']);
  const max = catalog['maxCommissionPercent'];
  const unique = catalog['uniquePhone'];
  return {
    maxCommissionPercent: typeof max === 'number' && Number.isFinite(max) && max >= 0 && max <= 100 ? max : 100,
    uniquePhone: typeof unique === 'boolean' ? unique : true,
  };
}

export async function readPolicy(tenantId: string): Promise<CatalogPolicy> {
  const tenant = await Tenant.findById(tenantId).select('settings');
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Barbershop was not found.');
  }
  return policyFrom(tenant.settings);
}

async function writeCatalog(access: TenantAccess, patch: Partial<CatalogPolicy>, summary: string): Promise<CatalogPolicy> {
  const tenant = await Tenant.findById(access.tenantId);
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Barbershop was not found.');
  }
  const current = policyFrom(tenant.settings);
  const next = { ...current, ...patch };
  const settings = asRecord(tenant.settings);
  const catalog = asRecord(settings['catalog']);
  tenant.set('settings', { ...settings, catalog: { ...catalog, ...next } });
  tenant.markModified('settings');
  await tenant.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'catalog.settings',
    entityType: 'tenant',
    entityId: access.tenantId,
    summary,
    changes: { before: current, after: next },
  });
  return next;
}

export async function saveCommissionCap(access: TenantAccess, maxCommissionPercent: number): Promise<CatalogPolicy> {
  return writeCatalog(access, { maxCommissionPercent }, 'Service commission limit updated.');
}

export async function savePhonePolicy(access: TenantAccess, uniquePhone: boolean): Promise<CatalogPolicy> {
  if (uniquePhone) {
    const tenantId = access.tenantId;
    const duplicates = await Customer.aggregate<{ _id: string }>([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), normalizedPhone: { $gt: '' } } },
      { $group: { _id: '$normalizedPhone', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
    if (duplicates.length > 0) {
      throw new HttpError(409, 'duplicate_phone', 'More than one customer already uses the same phone number.');
    }
    await Customer.updateMany({ tenantId, normalizedPhone: { $gt: '' } }, [{ $set: { phoneUniqueKey: '$normalizedPhone' } }]);
  } else {
    await Customer.updateMany({ tenantId: access.tenantId }, { $unset: { phoneUniqueKey: '' } });
  }
  return writeCatalog(access, { uniquePhone }, 'Customer phone rule updated.');
}
