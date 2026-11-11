import { Branch } from '../branches/branch.model.js';
import { Employee } from '../employees/employee.model.js';
import { User } from '../users/user.model.js';
import { HttpError } from '../../shared/http-error.js';
import {
  FEATURES,
  SubscriptionPlan,
  TenantSubscription,
  type FeatureKey,
} from './billing.model.js';

const OPEN = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface Entitlement {
  unrestricted: boolean;
  status: string;
  features: FeatureKey[];
  limits: { branches: number; users: number; employees: number; storageMb: number };
  usage: { branches: number; users: number; employees: number; storageMb: null };
  subscriptionId: string | null;
  planCode: string | null;
}

function asFeature(value: string): FeatureKey | null {
  return FEATURES.includes(value as FeatureKey) ? (value as FeatureKey) : null;
}

/** Moves elapsed trials and overdue periods forward. Does not delete tenant data. */
export async function evaluateSubscription(tenantId: string): Promise<void> {
  const subscription = await TenantSubscription.findOne({ tenantId, status: { $in: OPEN } });
  if (!subscription) {
    return;
  }
  const now = Date.now();
  if (subscription.status === 'TRIALING' && subscription.trialEndsAt && subscription.trialEndsAt.getTime() <= now) {
    subscription.status = 'PAST_DUE';
    subscription.graceEndsAt = new Date(subscription.trialEndsAt.getTime() + GRACE_MS);
  } else if (subscription.status === 'ACTIVE' && subscription.currentPeriodEnd.getTime() <= now) {
    subscription.status = 'PAST_DUE';
    subscription.graceEndsAt = new Date(subscription.currentPeriodEnd.getTime() + GRACE_MS);
  }
  if (subscription.status === 'PAST_DUE' && subscription.graceEndsAt && subscription.graceEndsAt.getTime() <= now) {
    subscription.status = 'SUSPENDED';
  }
  if (subscription.isModified()) {
    await subscription.save();
  }
}

export async function resolveEntitlement(tenantId: string): Promise<Entitlement> {
  await evaluateSubscription(tenantId);
  const [branches, users, employees, subscription] = await Promise.all([
    Branch.countDocuments({ tenantId }),
    User.countDocuments({ tenantId, userType: 'TENANT_USER' }),
    Employee.countDocuments({ tenantId }),
    TenantSubscription.findOne({ tenantId, status: { $in: OPEN } }),
  ]);
  const usage = { branches, users, employees, storageMb: null as null };
  if (!subscription) {
    return {
      unrestricted: true,
      status: 'UNASSIGNED',
      features: [...FEATURES],
      limits: { branches: 100000, users: 100000, employees: 100000, storageMb: 100000 },
      usage,
      subscriptionId: null,
      planCode: null,
    };
  }
  const plan = await SubscriptionPlan.findById(subscription.planId);
  const overrides = subscription.limitOverrides;
  const features = subscription.customFeaturesSet
    ? (subscription.customFeatures ?? []).flatMap((feature) => {
        const known = asFeature(feature);
        return known ? [known] : [];
      })
    : (plan?.enabledFeatures ?? []).flatMap((feature) => {
        const known = asFeature(feature);
        return known ? [known] : [];
      });
  const blocked = subscription.status === 'SUSPENDED' || subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED';
  return {
    unrestricted: false,
    status: subscription.status,
    features: blocked ? [] : features,
    limits: {
      branches: overrides?.maximumBranches ?? plan?.maximumBranches ?? 1,
      users: overrides?.maximumUsers ?? plan?.maximumUsers ?? 1,
      employees: overrides?.maximumEmployees ?? plan?.maximumEmployees ?? 1,
      storageMb: overrides?.maximumStorage ?? plan?.maximumStorage ?? 1,
    },
    usage,
    subscriptionId: String(subscription._id),
    planCode: plan?.code ?? null,
  };
}

export async function tenantHasFeature(tenantId: string, feature: FeatureKey): Promise<boolean> {
  const entitlement = await resolveEntitlement(tenantId);
  return entitlement.unrestricted || entitlement.features.includes(feature);
}

export async function assertWithinLimit(tenantId: string, resource: 'branches' | 'users' | 'employees'): Promise<void> {
  const entitlement = await resolveEntitlement(tenantId);
  if (entitlement.unrestricted) {
    return;
  }
  if (entitlement.status === 'SUSPENDED' || entitlement.status === 'CANCELLED' || entitlement.status === 'EXPIRED') {
    throw new HttpError(402, 'subscription_inactive', 'The subscription is not active. Existing records are unchanged.');
  }
  const limit = entitlement.limits[resource];
  const used = entitlement.usage[resource];
  if (used >= limit) {
    throw new HttpError(402, 'plan_limit_reached', `The current plan allows ${limit} ${resource}. Existing records were kept.`);
  }
}
