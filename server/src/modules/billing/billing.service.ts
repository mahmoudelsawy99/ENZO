import { Types } from 'mongoose';
import { fromMinor, toMinor } from '../../shared/money.js';
import { HttpError } from '../../shared/http-error.js';
import { Tenant } from '../tenants/tenant.model.js';
import {
  FEATURES,
  BillingCounter,
  SubscriptionHistory,
  SubscriptionInvoice,
  SubscriptionNotice,
  SubscriptionPayment,
  SubscriptionPlan,
  TenantSubscription,
  type BillingInterval,
  type FeatureKey,
  type SubscriptionStatus,
} from './billing.model.js';

const OPEN = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const CATALOG = [
  { code: 'FREE', name: 'Free', description: 'A single-chair shop.', monthlyPrice: 0, yearlyPrice: 0, maximumBranches: 1, maximumUsers: 2, maximumEmployees: 3, maximumStorage: 100, enabledFeatures: [] as string[], trialDays: 0, system: false },
  { code: 'STARTER', name: 'Starter', description: 'Inventory for one branch.', monthlyPrice: 499, yearlyPrice: 4990, maximumBranches: 1, maximumUsers: 5, maximumEmployees: 8, maximumStorage: 512, enabledFeatures: ['inventory'], trialDays: 14, system: false },
  { code: 'PROFESSIONAL', name: 'Professional', description: 'Payroll, exports, and advanced reports.', monthlyPrice: 999, yearlyPrice: 9990, maximumBranches: 3, maximumUsers: 15, maximumEmployees: 30, maximumStorage: 2048, enabledFeatures: ['inventory', 'payroll', 'reports.advanced', 'exports'], trialDays: 14, system: false },
  { code: 'ENTERPRISE', name: 'Enterprise', description: 'WhatsApp and custom limits.', monthlyPrice: 2499, yearlyPrice: 24990, maximumBranches: 100, maximumUsers: 500, maximumEmployees: 1000, maximumStorage: 20480, enabledFeatures: [...FEATURES], trialDays: 30, system: false },
  { code: 'LEGACY', name: 'Legacy', description: 'Existing shops keep their current access at no charge until a plan is chosen.', monthlyPrice: 0, yearlyPrice: 0, maximumBranches: 1000, maximumUsers: 5000, maximumEmployees: 5000, maximumStorage: 102400, enabledFeatures: [...FEATURES], trialDays: 0, system: true },
] as const;

export interface PaymentGateway {
  readonly code: 'MANUAL';
  capture(input: { invoiceId: string; amount: number; currency: string }): Promise<{ accepted: true }>;
}

/** Manual capture only. No card processor is called. */
export const manualSubscriptionGateway: PaymentGateway = {
  code: 'MANUAL',
  capture() {
    return Promise.resolve({ accepted: true });
  },
};

function addInterval(start: Date, interval: BillingInterval): Date {
  const next = new Date(start.getTime());
  next.setUTCMonth(next.getUTCMonth() + (interval === 'YEARLY' ? 12 : 1));
  return next;
}

function presentPlan(plan: InstanceType<typeof SubscriptionPlan>) {
  return {
    id: String(plan._id),
    code: plan.code,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    maximumBranches: plan.maximumBranches,
    maximumUsers: plan.maximumUsers,
    maximumEmployees: plan.maximumEmployees,
    maximumStorage: plan.maximumStorage,
    enabledFeatures: plan.enabledFeatures,
    trialDays: plan.trialDays,
    system: plan.system,
    status: plan.status,
  };
}

async function writeHistory(subscription: InstanceType<typeof TenantSubscription>, action: string, actorUserId: string | null): Promise<void> {
  await SubscriptionHistory.create({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    action,
    actorUserId,
    snapshot: {
      planId: String(subscription.planId),
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelledAt: subscription.cancelledAt,
    },
  });
}

export async function ensurePlans(): Promise<void> {
  for (const plan of CATALOG) {
    const existing = await SubscriptionPlan.findOne({ code: plan.code });
    if (!existing) {
      await SubscriptionPlan.create({ ...plan, enabledFeatures: [...plan.enabledFeatures], currency: 'EGP', billingInterval: 'MONTHLY', status: 'ACTIVE' });
    }
  }
}

/** Gives shops that predate billing a zero-price plan with every current feature. */
export async function grandfatherTenants(): Promise<number> {
  await ensurePlans();
  const legacy = await SubscriptionPlan.findOne({ code: 'LEGACY', status: 'ACTIVE' });
  if (!legacy) {
    return 0;
  }
  const tenants = await Tenant.find().select('_id');
  let created = 0;
  const start = new Date();
  const end = new Date('2099-01-01T00:00:00.000Z');
  for (const tenant of tenants) {
    const open = await TenantSubscription.findOne({ tenantId: tenant._id, status: { $in: OPEN } });
    if (open) {
      continue;
    }
    const subscription = await TenantSubscription.create({
      tenantId: tenant._id,
      planId: legacy._id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      startDate: start,
      trialEndsAt: null,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      nextBillingDate: end,
      graceEndsAt: null,
      cancelledAt: null,
      customFeaturesSet: false,
    });
    await writeHistory(subscription, 'grandfathered', null);
    created += 1;
  }
  return created;
}

export async function listPlans() {
  await ensurePlans();
  const plans = await SubscriptionPlan.find().sort({ monthlyPrice: 1 });
  return plans.map(presentPlan);
}

export async function savePlan(input: {
  id?: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  maximumBranches: number;
  maximumUsers: number;
  maximumEmployees: number;
  maximumStorage: number;
  enabledFeatures: string[];
  trialDays: number;
  status: 'ACTIVE' | 'INACTIVE';
}) {
  await ensurePlans();
  if (!input.id) {
    throw new HttpError(400, 'validation_error', 'Choose a plan to update. New commercial plans are the four seeded plans.');
  }
  const plan = await SubscriptionPlan.findById(input.id);
  if (!plan) {
    throw new HttpError(404, 'not_found', 'The plan was not found.');
  }
  if (plan.system && input.status === 'INACTIVE') {
    throw new HttpError(409, 'plan_locked', 'The legacy plan stays available for existing shops.');
  }
  plan.name = input.name;
  plan.description = input.description;
  plan.monthlyPrice = input.monthlyPrice;
  plan.yearlyPrice = input.yearlyPrice;
  plan.currency = input.currency;
  plan.maximumBranches = input.maximumBranches;
  plan.maximumUsers = input.maximumUsers;
  plan.maximumEmployees = input.maximumEmployees;
  plan.maximumStorage = input.maximumStorage;
  plan.enabledFeatures = input.enabledFeatures.filter((feature): feature is FeatureKey => FEATURES.includes(feature as FeatureKey));
  plan.trialDays = input.trialDays;
  plan.status = input.status;
  await plan.save();
  return presentPlan(plan);
}

export async function assignSubscription(actorUserId: string, input: { tenantId: string; planId: string; billingInterval: BillingInterval }) {
  await ensurePlans();
  const tenant = await Tenant.findById(input.tenantId);
  const plan = await SubscriptionPlan.findById(input.planId);
  if (!tenant || !plan || plan.status !== 'ACTIVE') {
    throw new HttpError(404, 'not_found', 'Choose an active plan and an existing shop.');
  }
  const now = new Date();
  const trial = plan.trialDays > 0 && plan.monthlyPrice > 0;
  const periodEnd = addInterval(now, input.billingInterval);
  let subscription = await TenantSubscription.findOne({ tenantId: tenant._id, status: { $in: OPEN } });
  if (!subscription) {
    subscription = await TenantSubscription.create({
      tenantId: tenant._id,
      planId: plan._id,
      status: trial ? 'TRIALING' : 'ACTIVE',
      billingInterval: input.billingInterval,
      startDate: now,
      trialEndsAt: trial ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingDate: periodEnd,
      graceEndsAt: null,
      cancelledAt: null,
      customFeaturesSet: false,
    });
    await writeHistory(subscription, 'assigned', actorUserId);
  } else {
    await writeHistory(subscription, 'plan_changed', actorUserId);
    subscription.planId = plan._id;
    subscription.billingInterval = input.billingInterval;
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      subscription.status = trial ? 'TRIALING' : 'ACTIVE';
      subscription.cancelledAt = null;
    }
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd;
    subscription.nextBillingDate = periodEnd;
    subscription.graceEndsAt = null;
    await subscription.save();
  }
  return subscriptionView(subscription);
}

export async function updateSubscription(actorUserId: string, id: string, input: {
  status?: SubscriptionStatus | undefined;
  billingInterval?: BillingInterval | undefined;
  maximumBranches?: number | undefined;
  maximumUsers?: number | undefined;
  maximumEmployees?: number | undefined;
  enabledFeatures?: string[] | undefined;
}) {
  const subscription = await TenantSubscription.findById(id);
  if (!subscription) {
    throw new HttpError(404, 'not_found', 'The subscription was not found.');
  }
  await writeHistory(subscription, 'updated', actorUserId);
  if (input.status) {
    subscription.status = input.status;
    if (input.status === 'CANCELLED') {
      subscription.cancelledAt = new Date();
    }
  }
  if (input.billingInterval) {
    subscription.billingInterval = input.billingInterval;
  }
  const limits = subscription.limitOverrides ?? {};
  if (input.maximumBranches !== undefined) limits.maximumBranches = input.maximumBranches;
  if (input.maximumUsers !== undefined) limits.maximumUsers = input.maximumUsers;
  if (input.maximumEmployees !== undefined) limits.maximumEmployees = input.maximumEmployees;
  subscription.limitOverrides = limits;
  if (input.enabledFeatures) {
    subscription.customFeatures = input.enabledFeatures.filter((feature): feature is FeatureKey => FEATURES.includes(feature as FeatureKey));
    subscription.customFeaturesSet = true;
  }
  await subscription.save();
  return subscriptionView(subscription);
}

async function subscriptionView(subscription: InstanceType<typeof TenantSubscription>) {
  const plan = await SubscriptionPlan.findById(subscription.planId);
  const tenant = await Tenant.findById(subscription.tenantId).select('businessName');
  return {
    id: String(subscription._id),
    tenantId: String(subscription.tenantId),
    tenantName: tenant?.businessName ?? '',
    planId: String(subscription.planId),
    planCode: plan?.code ?? '',
    planName: plan?.name ?? '',
    status: subscription.status,
    billingInterval: subscription.billingInterval,
    startDate: subscription.startDate,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    nextBillingDate: subscription.nextBillingDate,
    graceEndsAt: subscription.graceEndsAt,
    cancelledAt: subscription.cancelledAt,
    customFeaturesSet: subscription.customFeaturesSet,
    customFeatures: subscription.customFeatures ?? [],
    limitOverrides: subscription.limitOverrides ?? {},
  };
}

export async function listSubscriptions(status: string) {
  const rows = status
    ? await TenantSubscription.find({ status: status as SubscriptionStatus }).sort({ nextBillingDate: 1 }).limit(100)
    : await TenantSubscription.find().sort({ nextBillingDate: 1 }).limit(100);
  const views = [];
  for (const row of rows) {
    views.push(await subscriptionView(row as InstanceType<typeof TenantSubscription>));
  }
  return views;
}

export async function subscriptionForTenant(tenantId: string) {
  const subscription = await TenantSubscription.findOne({ tenantId, status: { $in: [...OPEN, 'CANCELLED', 'EXPIRED'] } }).sort({ createdAt: -1 });
  return subscription ? subscriptionView(subscription) : null;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await BillingCounter.findOneAndUpdate(
    { key: `saas-invoice-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return `ENZ-${year}-${String(row?.value ?? 1).padStart(4, '0')}`;
}

function presentInvoice(invoice: InstanceType<typeof SubscriptionInvoice>) {
  return {
    id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    tenantId: String(invoice.tenantId),
    subscriptionId: String(invoice.subscriptionId),
    amount: invoice.amount,
    currency: invoice.currency,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    status: invoice.status,
    createdAt: invoice.createdAt,
  };
}

export async function createInvoice(input: { tenantId: string; subscriptionId: string; amount: number; taxAmount: number; currency: string; dueDate: string }) {
  const subscription = await TenantSubscription.findOne({ _id: input.subscriptionId, tenantId: input.tenantId });
  if (!subscription) {
    throw new HttpError(404, 'not_found', 'The subscription was not found for this shop.');
  }
  const total = fromMinor(toMinor(input.amount) + toMinor(input.taxAmount));
  const invoice = await SubscriptionInvoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    tenantId: input.tenantId,
    subscriptionId: subscription._id,
    amount: input.amount,
    currency: input.currency,
    taxAmount: input.taxAmount,
    totalAmount: total,
    dueDate: input.dueDate,
    paidAt: null,
    status: 'PENDING',
  });
  return presentInvoice(invoice);
}

export async function listInvoices(tenantId: string | null) {
  const filter = tenantId ? { tenantId } : {};
  const rows = await SubscriptionInvoice.find(filter).sort({ createdAt: -1 }).limit(100);
  return rows.map(presentInvoice);
}

export async function getInvoice(id: string, tenantId: string | null) {
  const invoice = await SubscriptionInvoice.findOne({ _id: id, ...(tenantId ? { tenantId } : {}) });
  if (!invoice) {
    throw new HttpError(404, 'not_found', 'The invoice was not found.');
  }
  return invoice;
}

export async function recordPayment(actorUserId: string, invoiceId: string, input: { amount: number; status: 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED'; reference: string; note: string }) {
  const invoice = await SubscriptionInvoice.findById(invoiceId);
  if (!invoice) {
    throw new HttpError(404, 'not_found', 'The invoice was not found.');
  }
  const amountBefore = invoice.amount;
  const taxBefore = invoice.taxAmount;
  const totalBefore = invoice.totalAmount;
  if (input.status === 'PAID') {
    if (invoice.status === 'PAID') {
      throw new HttpError(409, 'invoice_closed', 'This invoice is already paid.');
    }
    if (toMinor(input.amount) !== toMinor(invoice.totalAmount)) {
      throw new HttpError(400, 'amount_mismatch', 'Record the full invoice total.');
    }
    await manualSubscriptionGateway.capture({ invoiceId: invoice.id, amount: input.amount, currency: invoice.currency });
    invoice.status = 'PAID';
    invoice.paidAt = new Date();
    const subscription = await TenantSubscription.findById(invoice.subscriptionId);
    if (subscription && (subscription.status === 'PAST_DUE' || subscription.status === 'TRIALING' || subscription.status === 'SUSPENDED')) {
      const start = new Date();
      subscription.status = 'ACTIVE';
      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = addInterval(start, subscription.billingInterval);
      subscription.nextBillingDate = subscription.currentPeriodEnd;
      subscription.graceEndsAt = null;
      await subscription.save();
      await writeHistory(subscription, 'payment_activated', actorUserId);
    }
  } else if (input.status === 'REFUNDED') {
    if (invoice.status !== 'PAID') {
      throw new HttpError(409, 'invoice_closed', 'Only a paid invoice can be refunded.');
    }
    invoice.status = 'REFUNDED';
  } else if (input.status === 'CANCELLED' && invoice.status === 'PENDING') {
    invoice.status = 'CANCELLED';
  } else if (input.status === 'FAILED' && invoice.status === 'PENDING') {
    invoice.status = 'FAILED';
  } else {
    throw new HttpError(409, 'invoice_closed', 'This invoice can no longer take that payment.');
  }
  invoice.amount = amountBefore;
  invoice.taxAmount = taxBefore;
  invoice.totalAmount = totalBefore;
  await invoice.save();
  const payment = await SubscriptionPayment.create({
    tenantId: invoice.tenantId,
    invoiceId: invoice._id,
    subscriptionId: invoice.subscriptionId,
    amount: input.amount,
    currency: invoice.currency,
    status: input.status,
    method: 'MANUAL',
    reference: input.reference,
    note: input.note,
    recordedBy: actorUserId,
    paidAt: input.status === 'PAID' ? invoice.paidAt ?? null : null,
  });
  return { invoice: presentInvoice(invoice), paymentId: String(payment._id), gateway: manualSubscriptionGateway.code };
}

export async function subscriptionOverview() {
  await ensurePlans();
  const [subscriptions, payments, plans] = await Promise.all([
    TenantSubscription.find().limit(500),
    SubscriptionPayment.find({ status: 'PAID' }).sort({ paidAt: -1 }).limit(8),
    SubscriptionPlan.find(),
  ]);
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  const count = (status: string) => subscriptions.filter((row) => row.status === status).length;
  let mrrMinor = 0;
  for (const subscription of subscriptions) {
    if (subscription.status !== 'ACTIVE') {
      continue;
    }
    const plan = planById.get(String(subscription.planId));
    if (!plan) {
      continue;
    }
    mrrMinor += subscription.billingInterval === 'YEARLY' ? Math.round(toMinor(plan.yearlyPrice) / 12) : toMinor(plan.monthlyPrice);
  }
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const collected = await SubscriptionPayment.aggregate<{ total: number }>([
    { $match: { status: 'PAID', paidAt: { $gte: monthStart } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const collectedMinor = toMinor(collected[0]?.total ?? 0);
  const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const distribution = new Map<string, number>();
  for (const subscription of subscriptions.filter((row) => OPEN.includes(row.status as (typeof OPEN)[number]))) {
    const code = planById.get(String(subscription.planId))?.code ?? 'UNKNOWN';
    distribution.set(code, (distribution.get(code) ?? 0) + 1);
  }
  const tenantIds = [...new Set(subscriptions.map((row) => String(row.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('businessName');
  const names = new Map(tenants.map((tenant) => [String(tenant._id), tenant.businessName]));
  return {
    active: count('ACTIVE'),
    trialing: count('TRIALING'),
    pastDue: count('PAST_DUE'),
    suspended: count('SUSPENDED'),
    cancelled: count('CANCELLED'),
    mrr: fromMinor(mrrMinor),
    arr: fromMinor(mrrMinor * 12),
    collectedThisMonth: fromMinor(collectedMinor),
    currency: 'EGP',
    planDistribution: [...distribution.entries()].map(([code, total]) => ({ code, count: total })),
    recentPayments: payments.map((payment) => ({
      id: String(payment._id),
      tenantId: String(payment.tenantId),
      tenantName: names.get(String(payment.tenantId)) ?? '',
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
    })),
    upcomingRenewals: subscriptions
      .filter((row) => (row.status === 'ACTIVE' || row.status === 'TRIALING') && row.nextBillingDate.getTime() <= soon)
      .slice(0, 8)
      .map((row) => ({
        id: String(row._id),
        tenantName: names.get(String(row.tenantId)) ?? '',
        nextBillingDate: row.nextBillingDate,
        status: row.status,
      })),
  };
}

export async function queueRenewalNotices(): Promise<number> {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const due = await TenantSubscription.find({ status: { $in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, nextBillingDate: { $lte: soon } }).limit(50);
  let created = 0;
  for (const subscription of due) {
    const key = `renewal:${String(subscription._id)}:${subscription.nextBillingDate.toISOString()}`;
    const existing = await SubscriptionNotice.findOne({ idempotencyKey: key });
    if (existing) {
      continue;
    }
    await SubscriptionNotice.create({
      tenantId: subscription.tenantId,
      kind: 'renewal',
      idempotencyKey: key,
      message: 'Subscription period is ending. This notice is recorded once and is not a customer message.',
    });
    created += 1;
  }
  const overdue = await SubscriptionInvoice.find({ status: 'PENDING', dueDate: { $lte: new Date().toISOString().slice(0, 10) } }).limit(50);
  for (const invoice of overdue) {
    const key = `overdue:${invoice.invoiceNumber}`;
    const existing = await SubscriptionNotice.findOne({ idempotencyKey: key });
    if (existing) {
      continue;
    }
    await SubscriptionNotice.create({
      tenantId: invoice.tenantId,
      kind: 'overdue',
      idempotencyKey: key,
      message: `Invoice ${invoice.invoiceNumber} is due. No customer message was sent.`,
    });
    created += 1;
  }
  return created;
}

export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}
