import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey } from '../../shared/mongo.js';
import { normalizePhone } from '../../shared/phone.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import { customerFinancials, customerPaymentHistory } from '../pos/pos.service.js';
import { readPolicy, savePhonePolicy } from '../catalog/policy.js';
import { User } from '../users/user.model.js';
import { Customer, type CustomerStatus } from './customer.model.js';
import { CustomerNote } from './customer-note.model.js';
import type { CustomerBody, ListCustomersQuery } from './customer.validation.js';
import { customerPackages, refreshPackageExpiry } from '../packages/package.service.js';

export interface PublicCustomer {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  notes: string;
  promotionalOptIn: boolean;
  whatsappOptOut: boolean;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface PublicNote {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string;
}

function present(customer: {
  _id: unknown;
  customerNumber: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  notes?: string | null;
  promotionalOptIn?: boolean | null;
  whatsappOptOut?: boolean | null;
  status: CustomerStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: unknown;
  updatedBy?: unknown;
}): PublicCustomer {
  return {
    id: String(customer._id),
    customerNumber: customer.customerNumber,
    fullName: customer.fullName,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    dateOfBirth: customer.dateOfBirth ?? '',
    gender: customer.gender ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
    promotionalOptIn: customer.promotionalOptIn === true,
    whatsappOptOut: customer.whatsappOptOut === true,
    status: customer.status,
    createdAt: timestamp(customer.createdAt),
    updatedAt: timestamp(customer.updatedAt),
    createdBy: customer.createdBy ? String(customer.createdBy) : null,
    updatedBy: customer.updatedBy ? String(customer.updatedBy) : null,
  };
}

async function loadCustomer(tenantId: string, id: string) {
  const customer = await Customer.findOne({ _id: id, tenantId });
  if (!customer) {
    throw new HttpError(404, 'not_found', 'Customer was not found.');
  }
  return customer;
}

async function nextNumber(tenantId: string): Promise<string> {
  const count = await Customer.countDocuments({ tenantId });
  return `CUS-${String(count + 1).padStart(4, '0')}`;
}

function applyCustomer(customer: InstanceType<typeof Customer>, input: CustomerBody, uniquePhone: boolean, actorId: string) {
  const normalized = normalizePhone(input.phone);
  customer.fullName = input.fullName.trim();
  customer.phone = input.phone.trim();
  customer.normalizedPhone = normalized;
  customer.set('phoneUniqueKey', uniquePhone && normalized ? normalized : null);
  customer.email = input.email.trim().toLowerCase();
  customer.dateOfBirth = input.dateOfBirth;
  customer.gender = input.gender;
  customer.address = input.address;
  customer.notes = input.notes;
  customer.set('updatedBy', actorId);
}

export async function customerSettings(tenantId: string) {
  const policy = await readPolicy(tenantId);
  return { uniquePhone: policy.uniquePhone };
}

export async function updateCustomerSettings(access: TenantAccess, uniquePhone: boolean) {
  const policy = await savePhonePolicy(access, uniquePhone);
  return { uniquePhone: policy.uniquePhone };
}

export async function listCustomers(access: TenantAccess, query: ListCustomersQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const digits = normalizePhone(query.search);
    const clauses: Record<string, unknown>[] = [{ fullName: pattern }, { customerNumber: pattern }, { phone: pattern }];
    if (digits) {
      clauses.push({ normalizedPhone: new RegExp(escapeRegex(digits)) });
    }
    filter['$or'] = clauses;
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ fullName: 1 }).skip(skip).limit(query.pageSize),
    Customer.countDocuments(filter),
  ]);
  return {
    data: items.map((item) => present(item)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getCustomer(access: TenantAccess, id: string): Promise<PublicCustomer> {
  return present(await loadCustomer(access.tenantId, id));
}

export async function createCustomer(access: TenantAccess, input: CustomerBody): Promise<PublicCustomer> {
  const policy = await readPolicy(access.tenantId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const customer = new Customer({
      tenantId: access.tenantId,
      customerNumber: await nextNumber(access.tenantId),
      status: 'ACTIVE',
      createdBy: access.userId,
    });
    applyCustomer(customer, input, policy.uniquePhone, access.userId);
    try {
      await customer.save();
      await writeAudit({
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'customer.created',
        entityType: 'customer',
        entityId: String(customer._id),
        summary: `Customer ${customer.fullName} created.`,
      });
      return present(customer);
    } catch (error) {
      if (hasDuplicateKey(error, 'phoneUniqueKey')) {
        throw new HttpError(409, 'duplicate_phone', 'A customer with this phone number already exists.');
      }
      if (hasDuplicateKey(error, 'customerNumber') && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new HttpError(409, 'duplicate_number', 'The customer number could not be reserved.');
}

export async function updateCustomer(access: TenantAccess, id: string, input: CustomerBody): Promise<PublicCustomer> {
  const customer = await loadCustomer(access.tenantId, id);
  const before = { fullName: customer.fullName, phone: customer.phone, email: customer.email, status: customer.status };
  const policy = await readPolicy(access.tenantId);
  applyCustomer(customer, input, policy.uniquePhone, access.userId);
  try {
    await customer.save();
  } catch (error) {
    if (hasDuplicateKey(error, 'phoneUniqueKey')) {
      throw new HttpError(409, 'duplicate_phone', 'A customer with this phone number already exists.');
    }
    throw error;
  }
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'customer.updated',
    entityType: 'customer',
    entityId: String(customer._id),
    summary: `Customer ${customer.fullName} updated.`,
    changes: { before, after: { fullName: customer.fullName, phone: customer.phone, email: customer.email, status: customer.status } },
  });
  return present(customer);
}

export async function setCustomerStatus(access: TenantAccess, id: string, status: CustomerStatus): Promise<PublicCustomer> {
  const customer = await loadCustomer(access.tenantId, id);
  const before = customer.status;
  customer.status = status;
  customer.set('updatedBy', access.userId);
  await customer.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'customer.status',
    entityType: 'customer',
    entityId: String(customer._id),
    summary: `Customer ${customer.fullName} is ${status}.`,
    changes: { before, after: status },
  });
  return present(customer);
}

export async function listNotes(access: TenantAccess, customerId: string): Promise<PublicNote[]> {
  await loadCustomer(access.tenantId, customerId);
  const notes = await CustomerNote.find({ tenantId: access.tenantId, customerId }).sort({ createdAt: -1 }).limit(100);
  const actors = await User.find({ _id: { $in: notes.map((note) => note.createdBy) } }).select('fullName');
  const names = new Map(actors.map((actor) => [String(actor._id), actor.fullName]));
  return notes.map((note) => ({
    id: String(note._id),
    content: note.content,
    createdAt: timestamp(note.createdAt),
    createdBy: note.createdBy ? String(note.createdBy) : null,
    createdByName: names.get(String(note.createdBy)) ?? '',
  }));
}

export async function addNote(access: TenantAccess, customerId: string, content: string): Promise<PublicNote> {
  const customer = await loadCustomer(access.tenantId, customerId);
  const note = await CustomerNote.create({
    tenantId: access.tenantId,
    customerId: customer._id,
    content: content.trim(),
    createdBy: access.userId,
  });
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'customer.note',
    entityType: 'customer-note',
    entityId: String(note._id),
    summary: `Note added for ${customer.fullName}.`,
    changes: { customerId: String(customer._id), noteId: String(note._id) },
  });
  const actor = await User.findById(access.userId).select('fullName');
  return {
    id: String(note._id),
    content: note.content,
    createdAt: timestamp(note.createdAt),
    createdBy: access.userId,
    createdByName: actor?.fullName ?? '',
  };
}

/**
 * Completed appointments count as visits.
 * Spending comes from paid transactions, so an unpaid visit stays at zero.
 */
export async function customerStats(access: TenantAccess, customerId: string) {
  await loadCustomer(access.tenantId, customerId);
  await refreshPackageExpiry(access.tenantId, customerId);
  const packages = await customerPackages(access, customerId);
  const { customerVisitFacts } = await import('../appointments/appointment.service.js');
  const [visits, money] = await Promise.all([
    customerVisitFacts(access.tenantId, customerId),
    customerFinancials(access.tenantId, customerId),
  ]);
  return {
    totalVisits: visits.totalVisits,
    totalSpending: money.netSpending,
    totalPaid: money.totalPaid,
    totalRefunds: money.totalRefunds,
    netSpending: money.netSpending,
    totalTransactions: money.totalTransactions,
    lastPaidTransaction: money.lastPaidTransaction,
    outstandingAmount: money.outstandingAmount,
    lastVisit: visits.lastVisit,
    firstVisit: visits.firstVisit,
    mostUsedServices: visits.mostUsedServices,
    activePackages: packages.filter((item) => item.status === 'ACTIVE').length,
  };
}

export function emptyHistory(page: number, pageSize: number) {
  return {
    data: [] as unknown[],
    meta: { page, pageSize, total: 0 },
    source: 'not_connected' as const,
  };
}
