import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { CommissionRule, type CommissionKind } from './commission.model.js';

export interface CommissionQuote {
  kind: CommissionKind;
  value: number;
  source: 'EMPLOYEE_SERVICE' | 'SERVICE' | 'TENANT' | 'NONE';
  serviceCode: string;
  ruleId: string | null;
  quotedAt: string;
}

/**
 * Priority: employee + service, then service, then the tenant default.
 * The returned object is a copy. A future sale must store this quote, not the rule id alone.
 */
export async function quoteCommission(tenantId: string, employeeId: string | null, serviceCode: string): Promise<CommissionQuote> {
  const code = serviceCode.trim().toUpperCase();
  const quotedAt = new Date().toISOString();
  if (employeeId && code) {
    const override = await CommissionRule.findOne({
      tenantId,
      scope: 'EMPLOYEE_SERVICE',
      employeeId,
      serviceCode: code,
      status: 'ACTIVE',
    });
    if (override) {
      return { kind: override.kind, value: override.value, source: 'EMPLOYEE_SERVICE', serviceCode: code, ruleId: String(override._id), quotedAt };
    }
  }
  if (code) {
    const service = await CommissionRule.findOne({ tenantId, scope: 'SERVICE', serviceCode: code, status: 'ACTIVE' });
    if (service) {
      return { kind: service.kind, value: service.value, source: 'SERVICE', serviceCode: code, ruleId: String(service._id), quotedAt };
    }
  }
  const fallback = await CommissionRule.findOne({ tenantId, scope: 'TENANT', status: 'ACTIVE' });
  if (fallback) {
    return { kind: fallback.kind, value: fallback.value, source: 'TENANT', serviceCode: code, ruleId: String(fallback._id), quotedAt };
  }
  return { kind: 'PERCENTAGE', value: 0, source: 'NONE', serviceCode: code, ruleId: null, quotedAt };
}

function assertValue(kind: CommissionKind, value: number): void {
  if (kind === 'PERCENTAGE' && value > 100) {
    throw new HttpError(400, 'validation_error', 'A percentage commission cannot be above 100.');
  }
}

export async function commissionConfiguration(tenantId: string) {
  const [fallback, services] = await Promise.all([
    CommissionRule.findOne({ tenantId, scope: 'TENANT', status: 'ACTIVE' }),
    CommissionRule.find({ tenantId, scope: 'SERVICE', status: 'ACTIVE' }).sort({ serviceName: 1 }),
  ]);
  return {
    defaultRule: fallback
      ? { id: String(fallback._id), kind: fallback.kind, value: fallback.value }
      : { id: null, kind: 'PERCENTAGE' as const, value: 0 },
    services: services.map((rule) => ({
      id: String(rule._id),
      serviceCode: rule.serviceCode,
      serviceName: rule.serviceName,
      kind: rule.kind,
      value: rule.value,
    })),
  };
}

export async function saveTenantCommission(access: TenantAccess, kind: CommissionKind, value: number) {
  assertValue(kind, value);
  const existing = await CommissionRule.findOne({ tenantId: access.tenantId, scope: 'TENANT', status: 'ACTIVE' });
  if (existing) {
    existing.kind = kind;
    existing.value = value;
    await existing.save();
  } else {
    await CommissionRule.create({
      tenantId: access.tenantId,
      scope: 'TENANT',
      serviceCode: '',
      serviceName: '',
      employeeId: null,
      kind,
      value,
      status: 'ACTIVE',
    });
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'commission.default',
    entityType: 'commission',
    entityId: access.tenantId,
    summary: 'Tenant default commission updated.',
  });
  return commissionConfiguration(access.tenantId);
}

export async function saveServiceCommission(
  access: TenantAccess,
  input: { serviceCode: string; serviceName: string; kind: CommissionKind; value: number },
) {
  assertValue(input.kind, input.value);
  const serviceCode = input.serviceCode.trim().toUpperCase();
  try {
    const existing = await CommissionRule.findOne({
      tenantId: access.tenantId,
      scope: 'SERVICE',
      serviceCode,
      status: 'ACTIVE',
    });
    if (existing) {
      existing.serviceName = input.serviceName.trim();
      existing.kind = input.kind;
      existing.value = input.value;
      await existing.save();
    } else {
      await CommissionRule.create({
        tenantId: access.tenantId,
        scope: 'SERVICE',
        serviceCode,
        serviceName: input.serviceName.trim(),
        employeeId: null,
        kind: input.kind,
        value: input.value,
        status: 'ACTIVE',
      });
    }
  } catch (error) {
    if (hasDuplicateKey(error, 'serviceCode')) {
      throw new HttpError(409, 'duplicate_commission', 'This service already has a commission.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'commission.service',
    entityType: 'commission',
    entityId: serviceCode,
    summary: `Service commission saved for ${serviceCode}.`,
  });
  return commissionConfiguration(access.tenantId);
}

export async function deactivateServiceCommission(access: TenantAccess, id: string) {
  const rule = await CommissionRule.findOne({ _id: id, tenantId: access.tenantId, scope: 'SERVICE' });
  if (!rule) {
    throw new HttpError(404, 'not_found', 'Commission rule was not found.');
  }
  rule.status = 'INACTIVE';
  await rule.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'commission.service.disabled',
    entityType: 'commission',
    entityId: String(rule._id),
    summary: `Service commission disabled for ${rule.serviceCode}.`,
  });
  return commissionConfiguration(access.tenantId);
}

export async function employeeCommissionRules(tenantId: string, employeeId: string) {
  const rules = await CommissionRule.find({
    tenantId,
    scope: 'EMPLOYEE_SERVICE',
    employeeId,
    status: 'ACTIVE',
  }).sort({ serviceCode: 1 });
  return rules.map((rule) => ({
    id: String(rule._id),
    serviceCode: rule.serviceCode,
    kind: rule.kind,
    value: rule.value,
  }));
}

export async function saveEmployeeCommission(
  access: TenantAccess,
  employeeId: string,
  input: { serviceCode: string; kind: CommissionKind; value: number },
) {
  assertValue(input.kind, input.value);
  const serviceCode = input.serviceCode.trim().toUpperCase();
  const existing = await CommissionRule.findOne({
    tenantId: access.tenantId,
    scope: 'EMPLOYEE_SERVICE',
    employeeId,
    serviceCode,
    status: 'ACTIVE',
  });
  if (existing) {
    existing.kind = input.kind;
    existing.value = input.value;
    await existing.save();
  } else {
    await CommissionRule.create({
      tenantId: access.tenantId,
      scope: 'EMPLOYEE_SERVICE',
      serviceCode,
      serviceName: '',
      employeeId,
      kind: input.kind,
      value: input.value,
      status: 'ACTIVE',
    });
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'commission.employee',
    entityType: 'employee',
    entityId: employeeId,
    summary: `Employee commission saved for ${serviceCode}.`,
  });
  return employeeCommissionRules(access.tenantId, employeeId);
}

export async function deactivateEmployeeCommission(access: TenantAccess, employeeId: string, ruleId: string) {
  const rule = await CommissionRule.findOne({
    _id: ruleId,
    tenantId: access.tenantId,
    employeeId,
    scope: 'EMPLOYEE_SERVICE',
  });
  if (!rule) {
    throw new HttpError(404, 'not_found', 'Commission rule was not found.');
  }
  rule.status = 'INACTIVE';
  await rule.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'commission.employee.disabled',
    entityType: 'employee',
    entityId: employeeId,
    summary: `Employee commission disabled for ${rule.serviceCode}.`,
  });
  return employeeCommissionRules(access.tenantId, employeeId);
}
