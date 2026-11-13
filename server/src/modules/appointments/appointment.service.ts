import type { ClientSession } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { hasDuplicateKey, runInTransaction } from '../../shared/mongo.js';
import { saveDoc } from '../../shared/persist.js';
import { normalizePhone } from '../../shared/phone.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import { assertBranchInScope, assertBranchOperational, assertEmployeeOperational } from '../access/access.middleware.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import type { PermissionKey } from '../access/permissions.js';
import { Branch } from '../branches/branch.model.js';
import { readPolicy } from '../catalog/policy.js';
import { Customer } from '../customers/customer.model.js';
import { createCustomer } from '../customers/customer.service.js';
import type { CustomerBody } from '../customers/customer.validation.js';
import { EmployeeBranch } from '../employees/assignment.model.js';
import { Employee } from '../employees/employee.model.js';
import { Service } from '../services/service.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { Appointment, APPOINTMENT_TRANSITIONS, type AppointmentStatus, type AppointmentType } from './appointment.model.js';
import { publishAppointmentEvent, type AppointmentEvent, type AppointmentEventName } from './appointment.events.js';
import { AppointmentStatusHistory } from './status-history.model.js';
import { QueueEntry, type QueueStatus } from './queue.model.js';
import type { BookingBody, ListAppointmentsQuery, ListQueueQuery, ReorderQueueBody, UpdateAppointmentBody, WalkInBody } from './appointment.validation.js';

interface StoredLine {
  serviceId: unknown;
  serviceNameSnapshot: { en: string; ar?: string | null };
  unitPriceSnapshot: number;
  quantity: number;
  commissionTypeSnapshot: 'PERCENTAGE' | 'FIXED';
  commissionValueSnapshot: number;
  lineTotal: number;
}

export interface PublicServiceLine {
  serviceId: string;
  serviceName: { en: string; ar: string };
  unitPrice: number;
  quantity: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  lineTotal: number;
}

export interface PublicAppointment {
  id: string;
  appointmentNumber: string;
  branchId: string;
  customerId: string;
  customerName: string;
  barberEmployeeId: string;
  barberName: string;
  extraBarberIds: string[];
  type: AppointmentType;
  scheduledAt: string;
  services: PublicServiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: AppointmentStatus;
  checkoutStatus: string;
  notes: string;
  cancellationReason: string;
  checkedInAt: string;
  startedAt: string;
  completedAt: string;
  cancelledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicHistory {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string | null;
  changedByName: string;
  createdAt: string;
}

export interface PublicQueueEntry {
  id: string;
  appointmentId: string;
  appointmentNumber: string;
  customerId: string;
  customerName: string;
  companions: string[];
  barberEmployeeId: string;
  barberName: string;
  branchId: string;
  queueDate: string;
  position: number;
  status: QueueStatus;
  joinedAt: string;
  startedAt: string;
  completedAt: string;
  services: Array<{ serviceName: { en: string; ar: string }; quantity: number }>;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertCan(access: TenantAccess, key: PermissionKey): void {
  if (!access.isOwner && !access.permissions.has(key)) {
    throw new HttpError(403, 'forbidden', 'You do not have access to this action.');
  }
}

function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!APPOINTMENT_TRANSITIONS[from].includes(to)) {
    throw new HttpError(409, 'invalid_transition', `An appointment cannot move from ${from} to ${to}.`);
  }
}

function writeConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && (error.code === 112 || error.code === 251)) {
    return true;
  }
  const labels = 'errorLabels' in error && Array.isArray(error.errorLabels) ? error.errorLabels : [];
  if (labels.includes('TransientTransactionError')) {
    return true;
  }
  return error instanceof Error && error.message.includes('Write conflict');
}

function queueDateFor(value: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // The tenant timezone is invalid. Fall back to the UTC date.
  }
  return value.toISOString().slice(0, 10);
}

async function tenantZone(tenantId: string, session: ClientSession | null): Promise<string> {
  const query = Tenant.findById(tenantId).select('timezone');
  const tenant = session ? await query.session(session) : await query;
  return tenant?.timezone || 'Africa/Cairo';
}

async function requireBranch(access: TenantAccess, branchId: string, operational: boolean, session: ClientSession | null) {
  assertBranchInScope(access, branchId);
  const query = Branch.findOne({ _id: branchId, tenantId: access.tenantId });
  const branch = session ? await query.session(session) : await query;
  if (!branch) {
    throw new HttpError(404, 'not_found', 'Branch was not found.');
  }
  if (operational) {
    assertBranchOperational(branch.status);
  }
  return branch;
}

async function requireCustomer(tenantId: string, customerId: string, session: ClientSession | null) {
  const query = Customer.findOne({ _id: customerId, tenantId });
  const customer = session ? await query.session(session) : await query;
  if (!customer) {
    throw new HttpError(400, 'validation_error', 'Choose a customer from this barbershop.');
  }
  if (customer.status !== 'ACTIVE') {
    throw new HttpError(409, 'customer_inactive', 'This customer cannot be booked.');
  }
  return customer;
}

async function requireBarber(access: TenantAccess, branchId: string, employeeId: string, session: ClientSession | null) {
  const query = Employee.findOne({ _id: employeeId, tenantId: access.tenantId });
  const employee = session ? await query.session(session) : await query;
  if (!employee) {
    throw new HttpError(400, 'validation_error', 'Choose a barber from this barbershop.');
  }
  assertEmployeeOperational(employee.status);
  const assignmentQuery = EmployeeBranch.findOne({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    status: 'ACTIVE',
  });
  const assignment = session ? await assignmentQuery.session(session) : await assignmentQuery;
  if (!assignment) {
    throw new HttpError(409, 'barber_not_assigned', 'This barber is not assigned to the selected branch.');
  }
  return employee;
}

async function requireExtraBarbers(access: TenantAccess, branchId: string, primaryId: string, extraIds: string[], session: ClientSession | null) {
  const seen = new Set<string>([primaryId]);
  for (const employeeId of extraIds) {
    if (seen.has(employeeId)) {
      throw new HttpError(400, 'validation_error', 'Each barber can be assigned once.');
    }
    seen.add(employeeId);
    await requireBarber(access, branchId, employeeId, session);
  }
}

async function buildLines(tenantId: string, items: Array<{ serviceId: string; quantity: number }>, previous: StoredLine[] | null, session: ClientSession | null) {
  const query = Service.find({ tenantId, _id: { $in: items.map((item) => item.serviceId) } });
  const found = session ? await query.session(session) : await query;
  const byId = new Map(found.map((service) => [String(service._id), service]));
  const previousById = new Map((previous ?? []).map((line) => [String(line.serviceId), line]));
  const lines: StoredLine[] = [];
  for (const item of items) {
    const service = byId.get(item.serviceId);
    if (!service) {
      throw new HttpError(400, 'validation_error', 'One of the services does not belong to this barbershop.');
    }
    const prior = previousById.get(item.serviceId);
    if (!prior && service.status !== 'ACTIVE') {
      throw new HttpError(400, 'validation_error', 'Inactive services cannot be added to an appointment.');
    }
    const unit = prior ? prior.unitPriceSnapshot : service.price;
    const name = prior ? prior.serviceNameSnapshot : service.name;
    lines.push({
      serviceId: service._id,
      serviceNameSnapshot: { en: name.en, ar: name.ar ?? '' },
      unitPriceSnapshot: unit,
      quantity: item.quantity,
      commissionTypeSnapshot: prior ? prior.commissionTypeSnapshot : service.commissionType,
      commissionValueSnapshot: prior ? prior.commissionValueSnapshot : service.commissionValue,
      lineTotal: money(unit * item.quantity),
    });
  }
  return lines;
}

function priceOf(lines: StoredLine[], discount: number) {
  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const normalized = money(discount);
  if (normalized > subtotal) {
    throw new HttpError(400, 'validation_error', 'The discount cannot be greater than the subtotal.');
  }
  return { subtotal, discount: normalized, total: money(subtotal - normalized) };
}

async function nextNumber(tenantId: string, session: ClientSession | null): Promise<string> {
  const query = Appointment.countDocuments({ tenantId });
  const count = session ? await query.session(session) : await query;
  return `APT-${String(count + 1).padStart(4, '0')}`;
}

async function nextPosition(tenantId: string, branchId: string, queueDate: string, session: ClientSession | null): Promise<number> {
  const query = QueueEntry.findOne({ tenantId, branchId, queueDate }).sort({ position: -1 }).select('position');
  const latest = session ? await query.session(session) : await query;
  return (latest?.position ?? 0) + 1;
}

async function loadAppointment(access: TenantAccess, id: string, session: ClientSession | null) {
  const query = Appointment.findOne({ _id: id, tenantId: access.tenantId });
  const appointment = session ? await query.session(session) : await query;
  if (!appointment) {
    throw new HttpError(404, 'not_found', 'Appointment was not found.');
  }
  assertBranchInScope(access, String(appointment.branchId));
  return appointment;
}

function assertEditable(status: AppointmentStatus): void {
  if (status !== 'PENDING' && status !== 'CONFIRMED') {
    throw new HttpError(409, 'appointment_closed', 'This appointment can no longer be edited.');
  }
}

async function recordHistory(
  access: TenantAccess,
  appointment: { _id: unknown; branchId: unknown },
  previousStatus: string,
  newStatus: AppointmentStatus,
  reason: string,
  session: ClientSession | null,
) {
  const row = new AppointmentStatusHistory({
    tenantId: access.tenantId,
    branchId: appointment.branchId,
    appointmentId: appointment._id,
    previousStatus,
    newStatus,
    changedBy: access.userId,
    reason,
  });
  await saveDoc(row, session);
}

function eventFor(name: AppointmentEventName, appointment: { _id: unknown; tenantId: unknown; branchId: unknown }): AppointmentEvent {
  return {
    name,
    tenantId: String(appointment.tenantId),
    branchId: String(appointment.branchId),
    appointmentId: String(appointment._id),
    at: new Date().toISOString(),
  };
}

function linesOf(appointment: { services: StoredLine[] }): PublicServiceLine[] {
  return appointment.services.map((line) => ({
    serviceId: String(line.serviceId),
    serviceName: { en: line.serviceNameSnapshot.en, ar: line.serviceNameSnapshot.ar ?? '' },
    unitPrice: line.unitPriceSnapshot,
    quantity: line.quantity,
    commissionType: line.commissionTypeSnapshot,
    commissionValue: line.commissionValueSnapshot,
    lineTotal: line.lineTotal,
  }));
}

async function presentMany(tenantId: string, appointments: Array<InstanceType<typeof Appointment>>): Promise<PublicAppointment[]> {
  const customerIds = appointments.map((item) => item.customerId);
  const barberIds = appointments.flatMap((item) => [item.barberEmployeeId, ...(item.extraBarberIds ?? [])]);
  const [customers, barbers] = await Promise.all([
    Customer.find({ tenantId, _id: { $in: customerIds } }).select('fullName'),
    Employee.find({ tenantId, _id: { $in: barberIds } }).select('fullName'),
  ]);
  const customerNames = new Map(customers.map((item) => [String(item._id), item.fullName]));
  const barberNames = new Map(barbers.map((item) => [String(item._id), item.fullName]));
  return appointments.map((item) => ({
    id: String(item._id),
    appointmentNumber: item.appointmentNumber,
    branchId: String(item.branchId),
    customerId: String(item.customerId),
    customerName: customerNames.get(String(item.customerId)) ?? '',
    barberEmployeeId: String(item.barberEmployeeId),
    extraBarberIds: (item.extraBarberIds ?? []).map((id) => String(id)),
    barberName: [item.barberEmployeeId, ...(item.extraBarberIds ?? [])].map((id) => barberNames.get(String(id)) ?? '').filter((name) => name.length > 0).join(', '),
    type: item.type,
    scheduledAt: timestamp(item.scheduledAt),
    services: linesOf(item),
    subtotal: item.subtotal,
    discount: item.discount,
    total: item.total,
    status: item.status,
    checkoutStatus: item.checkoutStatus ?? 'NOT_CHECKED_OUT',
    notes: item.notes ?? '',
    cancellationReason: item.cancellationReason ?? '',
    checkedInAt: timestamp(item.checkedInAt),
    startedAt: timestamp(item.startedAt),
    completedAt: timestamp(item.completedAt),
    cancelledAt: timestamp(item.cancelledAt),
    createdAt: timestamp(item.createdAt),
    updatedAt: timestamp(item.updatedAt),
  }));
}

async function presentOne(access: TenantAccess, id: string): Promise<PublicAppointment> {
  const appointment = await loadAppointment(access, id, null);
  const [presented] = await presentMany(access.tenantId, [appointment]);
  if (!presented) {
    throw new HttpError(404, 'not_found', 'Appointment was not found.');
  }
  return presented;
}

async function appendQueue(access: TenantAccess, appointment: InstanceType<typeof Appointment>, session: ClientSession | null) {
  const now = new Date();
  const queueDate = queueDateFor(now, await tenantZone(access.tenantId, session));
  const entry = new QueueEntry({
    tenantId: access.tenantId,
    branchId: appointment.branchId,
    appointmentId: appointment._id,
    customerId: appointment.customerId,
    barberEmployeeId: appointment.barberEmployeeId,
    queueDate,
    position: await nextPosition(access.tenantId, String(appointment.branchId), queueDate, session),
    status: 'WAITING',
    joinedAt: now,
  });
  try {
    await saveDoc(entry, session);
  } catch (error) {
    if (hasDuplicateKey(error, 'appointmentId')) {
      throw new HttpError(409, 'duplicate_queue', 'This appointment is already in the queue.');
    }
    throw error;
  }
  return entry;
}

async function resolveWalkInCustomer(access: TenantAccess, input: WalkInBody) {
  if (input.customerId) {
    return requireCustomer(access.tenantId, input.customerId, null);
  }
  const profile = input.customer;
  if (!profile) {
    throw new HttpError(400, 'validation_error', 'Choose or create a customer.');
  }
  assertCan(access, 'customers.create');
  const policy = await readPolicy(access.tenantId);
  const normalized = normalizePhone(profile.phone);
  if (policy.uniquePhone && normalized) {
    const existing = await Customer.findOne({ tenantId: access.tenantId, phoneUniqueKey: normalized });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        throw new HttpError(409, 'customer_inactive', 'A customer with this phone exists and is not active.');
      }
      return existing;
    }
  }
  const body: CustomerBody = {
    fullName: profile.fullName,
    phone: profile.phone,
    email: profile.email,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    address: profile.address,
    notes: profile.notes,
  };
  try {
    const created = await createCustomer(access, body);
    const customer = await Customer.findOne({ _id: created.id, tenantId: access.tenantId });
    if (!customer) {
      throw new HttpError(404, 'not_found', 'Customer was not found.');
    }
    return customer;
  } catch (error) {
    if (error instanceof HttpError && error.code === 'duplicate_phone' && normalized) {
      const existing = await Customer.findOne({ tenantId: access.tenantId, phoneUniqueKey: normalized, status: 'ACTIVE' });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const retryable = hasDuplicateKey(error, 'appointmentNumber') || hasDuplicateKey(error, 'position') || writeConflict(error);
      if (retryable && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new HttpError(409, 'queue_conflict', 'The appointment could not be saved. Try again.');
}

export async function listBarbers(access: TenantAccess, branchId: string) {
  await requireBranch(access, branchId, false, null);
  const assignments = await EmployeeBranch.find({ tenantId: access.tenantId, branchId, status: 'ACTIVE' }).select('employeeId');
  const employees = await Employee.find({
    tenantId: access.tenantId,
    _id: { $in: assignments.map((row) => row.employeeId) },
    status: 'ACTIVE',
  })
    .sort({ fullName: 1 })
    .select('fullName');
  return employees.map((employee) => ({ id: String(employee._id), fullName: employee.fullName }));
}

export async function listAppointments(access: TenantAccess, query: ListAppointmentsQuery) {
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.branchId) {
    assertBranchInScope(access, query.branchId);
    filter['branchId'] = query.branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.type) {
    filter['type'] = query.type;
  }
  if (query.barberEmployeeId) {
    filter['barberEmployeeId'] = query.barberEmployeeId;
  }
  if (query.customerId) {
    filter['customerId'] = query.customerId;
  }
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) {
      range['$gte'] = new Date(query.from);
    }
    if (query.to) {
      range['$lte'] = new Date(query.to);
    }
    filter['scheduledAt'] = range;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const customers = await Customer.find({ tenantId: access.tenantId, fullName: pattern }).select('_id').limit(50);
    filter['$or'] = [{ appointmentNumber: pattern }, { customerId: { $in: customers.map((customer) => customer._id) } }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Appointment.find(filter).sort({ scheduledAt: -1 }).skip(skip).limit(query.pageSize),
    Appointment.countDocuments(filter),
  ]);
  return { data: await presentMany(access.tenantId, items), meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getAppointment(access: TenantAccess, id: string): Promise<PublicAppointment> {
  return presentOne(access, id);
}

export async function appointmentHistory(access: TenantAccess, id: string): Promise<PublicHistory[]> {
  const appointment = await loadAppointment(access, id, null);
  const rows = await AppointmentStatusHistory.find({ tenantId: access.tenantId, appointmentId: appointment._id }).sort({ createdAt: 1 });
  const actors = await User.find({ _id: { $in: rows.map((row) => row.changedBy) } }).select('fullName');
  const names = new Map(actors.map((actor) => [String(actor._id), actor.fullName]));
  return rows.map((row) => ({
    id: String(row._id),
    previousStatus: row.previousStatus ?? '',
    newStatus: row.newStatus,
    reason: row.reason ?? '',
    changedBy: row.changedBy ? String(row.changedBy) : null,
    changedByName: names.get(String(row.changedBy)) ?? '',
    createdAt: timestamp(row.createdAt),
  }));
}

export async function createAppointment(access: TenantAccess, input: BookingBody): Promise<PublicAppointment> {
  assertCan(access, 'appointments.create');
  const id = await withRetry(() =>
    runInTransaction(async (session) => {
      await requireBranch(access, input.branchId, true, session);
      await requireCustomer(access.tenantId, input.customerId, session);
      await requireBarber(access, input.branchId, input.barberEmployeeId, session);
      await requireExtraBarbers(access, input.branchId, input.barberEmployeeId, input.extraBarberIds, session);
      const lines = await buildLines(access.tenantId, input.services, null, session);
      const amounts = priceOf(lines, input.discount);
      const appointment = new Appointment({
        tenantId: access.tenantId,
        branchId: input.branchId,
        appointmentNumber: await nextNumber(access.tenantId, session),
        customerId: input.customerId,
        barberEmployeeId: input.barberEmployeeId,
        extraBarberIds: input.extraBarberIds,
        type: 'BOOKING',
        scheduledAt: new Date(input.scheduledAt),
        services: lines,
        ...amounts,
        status: 'PENDING',
        notes: input.notes,
        cancellationReason: '',
        createdBy: access.userId,
        updatedBy: access.userId,
      });
      await saveDoc(appointment, session);
      await recordHistory(access, appointment, '', 'PENDING', 'created', session);
      await writeAudit(
        {
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'appointment.created',
          entityType: 'appointment',
          entityId: String(appointment._id),
          summary: `Appointment ${appointment.appointmentNumber} created.`,
        },
        session,
      );
      return { id: String(appointment._id), event: eventFor('appointment.created', appointment) };
    }),
  );
  publishAppointmentEvent(id.event);
  return presentOne(access, id.id);
}

export async function updateAppointment(access: TenantAccess, id: string, input: UpdateAppointmentBody): Promise<PublicAppointment> {
  assertCan(access, 'appointments.update');
  await runInTransaction(async (session) => {
    const appointment = await loadAppointment(access, id, session);
    assertEditable(appointment.status);
    await requireCustomer(access.tenantId, input.customerId, session);
    await requireBarber(access, String(appointment.branchId), input.barberEmployeeId, session);
    await requireExtraBarbers(access, String(appointment.branchId), input.barberEmployeeId, input.extraBarberIds, session);
    const lines = await buildLines(access.tenantId, input.services, appointment.services, session);
    const amounts = priceOf(lines, input.discount);
    appointment.customerId = input.customerId as unknown as typeof appointment.customerId;
    appointment.barberEmployeeId = input.barberEmployeeId as unknown as typeof appointment.barberEmployeeId;
    appointment.extraBarberIds = input.extraBarberIds as unknown as typeof appointment.extraBarberIds;
    appointment.services = lines as unknown as typeof appointment.services;
    appointment.subtotal = amounts.subtotal;
    appointment.discount = amounts.discount;
    appointment.total = amounts.total;
    appointment.notes = input.notes;
    appointment.set('updatedBy', access.userId);
    await saveDoc(appointment, session);
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'appointment.updated',
        entityType: 'appointment',
        entityId: String(appointment._id),
        summary: `Appointment ${appointment.appointmentNumber} updated.`,
      },
      session,
    );
    return true;
  });
  return presentOne(access, id);
}

export async function rescheduleAppointment(access: TenantAccess, id: string, scheduledAt: string, reason: string): Promise<PublicAppointment> {
  assertCan(access, 'appointments.reschedule');
  const event = await runInTransaction(async (session) => {
    const appointment = await loadAppointment(access, id, session);
    assertEditable(appointment.status);
    const previous = appointment.scheduledAt.toISOString();
    const next = new Date(scheduledAt);
    appointment.scheduledAt = next;
    appointment.set('updatedBy', access.userId);
    await saveDoc(appointment, session);
    const note = `Rescheduled from ${previous} to ${next.toISOString()}.${reason ? ` ${reason}` : ''}`;
    await recordHistory(access, appointment, appointment.status, appointment.status, note, session);
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'appointment.rescheduled',
        entityType: 'appointment',
        entityId: String(appointment._id),
        summary: `Appointment ${appointment.appointmentNumber} rescheduled.`,
        changes: { before: previous, after: next.toISOString() },
      },
      session,
    );
    return eventFor('appointment.rescheduled', appointment);
  });
  publishAppointmentEvent(event);
  return presentOne(access, id);
}

async function moveStatus(
  access: TenantAccess,
  id: string,
  status: AppointmentStatus,
  permission: PermissionKey,
  reason: string,
  eventName: AppointmentEventName | null,
): Promise<PublicAppointment> {
  assertCan(access, permission);
  const event = await runInTransaction(async (session) => {
    const appointment = await loadAppointment(access, id, session);
    assertTransition(appointment.status, status);
    const previous = appointment.status;
    appointment.status = status;
    appointment.set('updatedBy', access.userId);
    const now = new Date();
    if (status === 'CHECKED_IN') {
      appointment.checkedInAt = now;
    }
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      appointment.cancelledAt = now;
      appointment.cancellationReason = reason;
    }
    await saveDoc(appointment, session);
    if (status === 'CANCELLED') {
      await QueueEntry.updateOne(
        { tenantId: access.tenantId, appointmentId: appointment._id, status: { $in: ['WAITING', 'IN_SERVICE'] } },
        { $set: { status: 'CANCELLED' } },
        session ? { session } : {},
      );
    }
    await recordHistory(access, appointment, previous, status, reason, session);
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: `appointment.${status.toLowerCase()}`,
        entityType: 'appointment',
        entityId: String(appointment._id),
        summary: `Appointment ${appointment.appointmentNumber} is ${status}.`,
        changes: { before: previous, after: status },
      },
      session,
    );
    return eventName ? eventFor(eventName, appointment) : null;
  });
  if (event) {
    publishAppointmentEvent(event);
  }
  return presentOne(access, id);
}

export function confirmAppointment(access: TenantAccess, id: string) {
  return moveStatus(access, id, 'CONFIRMED', 'appointments.confirm', 'confirmed', 'appointment.confirmed');
}

export function checkInAppointment(access: TenantAccess, id: string) {
  return moveStatus(access, id, 'CHECKED_IN', 'appointments.check-in', 'checked in', 'appointment.checked_in');
}

export function cancelAppointment(access: TenantAccess, id: string, reason: string) {
  return moveStatus(access, id, 'CANCELLED', 'appointments.cancel', reason, 'appointment.cancelled');
}

export function markNoShow(access: TenantAccess, id: string, reason: string) {
  return moveStatus(access, id, 'NO_SHOW', 'appointments.mark-no-show', reason, null);
}

export async function joinQueue(access: TenantAccess, id: string): Promise<PublicAppointment> {
  assertCan(access, 'queue.create');
  await withRetry(() =>
    runInTransaction(async (session) => {
      const appointment = await loadAppointment(access, id, session);
      assertTransition(appointment.status, 'WAITING');
      const previous = appointment.status;
      appointment.status = 'WAITING';
      appointment.set('updatedBy', access.userId);
      await saveDoc(appointment, session);
      await appendQueue(access, appointment, session);
      await recordHistory(access, appointment, previous, 'WAITING', 'joined the queue', session);
      await writeAudit(
        {
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'appointment.waiting',
          entityType: 'appointment',
          entityId: String(appointment._id),
          summary: `Appointment ${appointment.appointmentNumber} joined the queue.`,
        },
        session,
      );
      return true;
    }),
  );
  return presentOne(access, id);
}

async function stampService(access: TenantAccess, id: string, status: 'IN_SERVICE' | 'COMPLETED') {
  const permission: PermissionKey = status === 'IN_SERVICE' ? 'queue.start-service' : 'queue.complete-service';
  assertCan(access, permission);
  const event = await runInTransaction(async (session) => {
    const appointment = await loadAppointment(access, id, session);
    const expected = status === 'IN_SERVICE' ? 'WAITING' : 'IN_SERVICE';
    assertTransition(appointment.status, status);
    const now = new Date();
    const updated = await Appointment.findOneAndUpdate(
      { _id: appointment._id, tenantId: access.tenantId, status: expected },
      {
        $set: {
          status,
          updatedBy: access.userId,
          ...(status === 'IN_SERVICE' ? { startedAt: now } : { completedAt: now }),
        },
      },
      session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
    );
    if (!updated) {
      throw new HttpError(409, 'invalid_transition', 'This appointment was already updated.');
    }
    const queueStatus = status === 'IN_SERVICE' ? 'WAITING' : 'IN_SERVICE';
    const queue = await QueueEntry.findOneAndUpdate(
      { tenantId: access.tenantId, appointmentId: appointment._id, status: queueStatus },
      { $set: status === 'IN_SERVICE' ? { status: 'IN_SERVICE', startedAt: now } : { status: 'COMPLETED', completedAt: now } },
      session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
    );
    if (!queue) {
      throw new HttpError(409, 'queue_missing', 'This appointment is not in the expected queue state.');
    }
    await recordHistory(access, updated, expected, status, status === 'IN_SERVICE' ? 'service started' : 'service completed', session);
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: status === 'IN_SERVICE' ? 'appointment.started' : 'appointment.completed',
        entityType: 'appointment',
        entityId: String(updated._id),
        summary: `Appointment ${updated.appointmentNumber} is ${status}.`,
        changes: { at: now.toISOString() },
      },
      session,
    );
    return status === 'COMPLETED' ? eventFor('appointment.completed', updated) : null;
  });
  if (event) {
    publishAppointmentEvent(event);
  }
  return presentOne(access, id);
}

export function startAppointment(access: TenantAccess, id: string) {
  return stampService(access, id, 'IN_SERVICE');
}

export function completeAppointment(access: TenantAccess, id: string) {
  return stampService(access, id, 'COMPLETED');
}

export async function createWalkIn(access: TenantAccess, input: WalkInBody): Promise<PublicAppointment> {
  assertCan(access, 'appointments.create');
  assertCan(access, 'queue.create');
  const customer = await resolveWalkInCustomer(access, input);
  const saved = await withRetry(() =>
    runInTransaction(async (session) => {
      await requireBranch(access, input.branchId, true, session);
      await requireBarber(access, input.branchId, input.barberEmployeeId, session);
      await requireExtraBarbers(access, input.branchId, input.barberEmployeeId, input.extraBarberIds, session);
      const lines = await buildLines(access.tenantId, input.services, null, session);
      const amounts = priceOf(lines, 0);
      const now = new Date();
      const appointment = new Appointment({
        tenantId: access.tenantId,
        branchId: input.branchId,
        appointmentNumber: await nextNumber(access.tenantId, session),
        customerId: customer._id,
        companions: input.companions.map((person) => ({ fullName: person.fullName, phone: person.phone })),
        barberEmployeeId: input.barberEmployeeId,
        extraBarberIds: input.extraBarberIds,
        type: 'WALK_IN',
        scheduledAt: now,
        services: lines,
        ...amounts,
        status: 'WAITING',
        notes: input.notes,
        cancellationReason: '',
        createdBy: access.userId,
        updatedBy: access.userId,
      });
      await saveDoc(appointment, session);
      await appendQueue(access, appointment, session);
      await recordHistory(access, appointment, '', 'WAITING', 'walk-in', session);
      await writeAudit(
        {
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'appointment.walk_in',
          entityType: 'appointment',
          entityId: String(appointment._id),
          summary: `Walk-in ${appointment.appointmentNumber} joined the queue.`,
        },
        session,
      );
      return { id: String(appointment._id), event: eventFor('appointment.created', appointment) };
    }),
  );
  publishAppointmentEvent(saved.event);
  return presentOne(access, saved.id);
}

export async function listQueue(access: TenantAccess, query: ListQueueQuery): Promise<PublicQueueEntry[]> {
  assertCan(access, 'queue.view');
  await requireBranch(access, query.branchId, false, null);
  const filter: Record<string, unknown> = {
    tenantId: access.tenantId,
    branchId: query.branchId,
    queueDate: query.queueDate,
  };
  if (query.status) {
    filter['status'] = query.status;
  }
  if (query.barberEmployeeId) {
    filter['barberEmployeeId'] = query.barberEmployeeId;
  }
  const entries = await QueueEntry.find(filter).sort({ position: 1 });
  const appointments = await Appointment.find({ tenantId: access.tenantId, _id: { $in: entries.map((entry) => entry.appointmentId) } });
  const appointmentById = new Map(appointments.map((item) => [String(item._id), item]));
  const [customers, barbers] = await Promise.all([
    Customer.find({ tenantId: access.tenantId, _id: { $in: entries.map((entry) => entry.customerId) } }).select('fullName'),
    Employee.find({ tenantId: access.tenantId, _id: { $in: entries.map((entry) => entry.barberEmployeeId) } }).select('fullName'),
  ]);
  const customerNames = new Map(customers.map((item) => [String(item._id), item.fullName]));
  const barberNames = new Map(barbers.map((item) => [String(item._id), item.fullName]));
  return entries.map((entry) => {
    const appointment = appointmentById.get(String(entry.appointmentId));
    return {
      id: String(entry._id),
      appointmentId: String(entry.appointmentId),
      appointmentNumber: appointment?.appointmentNumber ?? '',
      customerId: String(entry.customerId),
      customerName: customerNames.get(String(entry.customerId)) ?? '',
      companions: (appointment?.companions ?? []).map((person) => person.fullName),
      barberEmployeeId: String(entry.barberEmployeeId),
      barberName: barberNames.get(String(entry.barberEmployeeId)) ?? '',
      branchId: String(entry.branchId),
      queueDate: entry.queueDate,
      position: entry.position,
      status: entry.status,
      joinedAt: timestamp(entry.joinedAt),
      startedAt: timestamp(entry.startedAt),
      completedAt: timestamp(entry.completedAt),
      services: (appointment?.services ?? []).map((line) => ({
        serviceName: { en: line.serviceNameSnapshot.en, ar: line.serviceNameSnapshot.ar ?? '' },
        quantity: line.quantity,
      })),
    };
  });
}

export async function reorderQueue(access: TenantAccess, input: ReorderQueueBody): Promise<PublicQueueEntry[]> {
  assertCan(access, 'queue.reorder');
  await requireBranch(access, input.branchId, false, null);
  await runInTransaction(async (session) => {
    const query = QueueEntry.find({
      tenantId: access.tenantId,
      branchId: input.branchId,
      queueDate: input.queueDate,
      status: 'WAITING',
    });
    const waiting = session ? await query.session(session) : await query;
    const current = new Set(waiting.map((entry) => String(entry._id)));
    const unique = new Set(input.entryIds);
    if (input.entryIds.length !== waiting.length || unique.size !== input.entryIds.length || input.entryIds.some((id) => !current.has(id))) {
      throw new HttpError(409, 'queue_changed', 'The waiting queue changed. Refresh and try again.');
    }
    const byId = new Map(waiting.map((entry) => [String(entry._id), entry]));
    for (let index = 0; index < input.entryIds.length; index += 1) {
      const entry = byId.get(input.entryIds[index] ?? '');
      if (!entry) {
        throw new HttpError(409, 'queue_changed', 'The waiting queue changed. Refresh and try again.');
      }
      entry.position = -(index + 1);
      await saveDoc(entry, session);
    }
    for (let index = 0; index < input.entryIds.length; index += 1) {
      const entry = byId.get(input.entryIds[index] ?? '');
      if (!entry) {
        throw new HttpError(409, 'queue_changed', 'The waiting queue changed. Refresh and try again.');
      }
      entry.position = index + 1;
      await saveDoc(entry, session);
    }
    await writeAudit(
      {
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'queue.reordered',
        entityType: 'queue',
        entityId: input.branchId,
        summary: `Queue for ${input.queueDate} was reordered.`,
        changes: { entryIds: input.entryIds },
      },
      session,
    );
    return true;
  });
  return listQueue(access, { branchId: input.branchId, queueDate: input.queueDate, barberEmployeeId: '', status: '' });
}

async function queueAppointmentId(access: TenantAccess, entryId: string, status: QueueStatus) {
  const entry = await QueueEntry.findOne({ _id: entryId, tenantId: access.tenantId, status });
  if (!entry) {
    throw new HttpError(404, 'not_found', 'Queue entry was not found.');
  }
  assertBranchInScope(access, String(entry.branchId));
  return String(entry.appointmentId);
}

export async function startQueueEntry(access: TenantAccess, entryId: string) {
  return startAppointment(access, await queueAppointmentId(access, entryId, 'WAITING'));
}

export async function completeQueueEntry(access: TenantAccess, entryId: string) {
  return completeAppointment(access, await queueAppointmentId(access, entryId, 'IN_SERVICE'));
}

export async function customerVisits(tenantId: string, customerId: string) {
  const items = await Appointment.find({ tenantId, customerId }).sort({ scheduledAt: -1 }).limit(20);
  return {
    data: items.map((item) => ({
      id: String(item._id),
      title: item.appointmentNumber,
      visitedAt: timestamp(item.completedAt ?? item.scheduledAt),
      status: item.status,
      total: item.total,
    })),
    meta: { page: 1, pageSize: 20, total: await Appointment.countDocuments({ tenantId, customerId }) },
    source: 'appointments' as const,
  };
}

export async function customerServiceHistory(tenantId: string, customerId: string) {
  const items = await Appointment.find({
    tenantId,
    customerId,
    status: { $nin: ['CANCELLED', 'NO_SHOW'] },
  })
    .sort({ scheduledAt: -1 })
    .limit(20);
  const data = items.flatMap((item) =>
    item.services.map((line) => ({
      serviceName: line.serviceNameSnapshot.en,
      createdAt: timestamp(item.scheduledAt),
      quantity: line.quantity,
    })),
  );
  return { data, meta: { page: 1, pageSize: 20, total: data.length }, source: 'appointments' as const };
}

/**
 * Completed appointments are visits. Spending stays at zero until payments exist.
 * Service names come from the stored snapshots.
 */
export async function customerVisitFacts(tenantId: string, customerId: string) {
  const completed = await Appointment.find({ tenantId, customerId, status: 'COMPLETED' }).select('services completedAt');
  const times = completed
    .map((item) => item.completedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime());
  const counts = new Map<string, { name: { en: string; ar: string }; count: number }>();
  for (const appointment of completed) {
    for (const line of appointment.services) {
      const id = String(line.serviceId);
      const current = counts.get(id);
      if (current) {
        current.count += line.quantity;
      } else {
        counts.set(id, {
          name: { en: line.serviceNameSnapshot.en, ar: line.serviceNameSnapshot.ar ?? '' },
          count: line.quantity,
        });
      }
    }
  }
  return {
    totalVisits: completed.length,
    firstVisit: times[0]?.toISOString() ?? null,
    lastVisit: times.at(-1)?.toISOString() ?? null,
    mostUsedServices: [...counts.entries()]
      .map(([serviceId, value]) => ({ serviceId, name: value.name, count: value.count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}
