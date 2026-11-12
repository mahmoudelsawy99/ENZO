import { Types, type ClientSession } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { addMinor, fromMinor, toMinor } from '../../shared/money.js';
import { hasDuplicateKey, runInTransaction } from '../../shared/mongo.js';
import { saveDoc } from '../../shared/persist.js';
import { normalizePhone } from '../../shared/phone.js';
import { escapeRegex, timestamp } from '../../shared/text.js';
import { assertBranchInScope, assertEmployeeOperational } from '../access/access.middleware.js';
import type { TenantAccess } from '../access/access.types.js';
import { writeAudit } from '../access/audit.service.js';
import type { PermissionKey } from '../access/permissions.js';
import { Appointment } from '../appointments/appointment.model.js';
import { AppointmentStatusHistory } from '../appointments/status-history.model.js';
import { Branch } from '../branches/branch.model.js';
import { readPolicy } from '../catalog/policy.js';
import { quoteCommission } from '../commissions/commission.service.js';
import { Customer } from '../customers/customer.model.js';
import { createCustomer } from '../customers/customer.service.js';
import type { CustomerBody } from '../customers/customer.validation.js';
import { EmployeeBranch } from '../employees/assignment.model.js';
import { Employee } from '../employees/employee.model.js';
import { Service } from '../services/service.model.js';
import { CustomerPackage } from '../packages/package.model.js';
import { consumeSaleStock, restockSale } from '../inventory/inventory.service.js';
import { consumeCustomerPackageItem, customerPackages } from '../packages/package.service.js';
import { User } from '../users/user.model.js';
import {
  CashierShift,
  CommissionSnapshot,
  Payment,
  Refund,
  SaleTransaction,
  Tip,
  type PaymentMethod,
  type SaleStatus,
} from './sale.model.js';
import type { CheckoutBody, CounterOrderBody, RefundBody } from './pos.validation.js';

function assertCan(access: TenantAccess, key: PermissionKey): void {
  if (!access.isOwner && !access.permissions.has(key)) {
    throw new HttpError(403, 'forbidden', 'You do not have access to this action.');
  }
}

function assertAny(access: TenantAccess, keys: PermissionKey[]): void {
  if (access.isOwner || keys.some((key) => access.permissions.has(key))) {
    return;
  }
  throw new HttpError(403, 'forbidden', 'You do not have access to this action.');
}

async function requireBranch(access: TenantAccess, branchId: string, session: ClientSession | null) {
  assertBranchInScope(access, branchId);
  const query = Branch.findOne({ _id: branchId, tenantId: access.tenantId });
  const branch = session ? await query.session(session) : await query;
  if (!branch) {
    throw new HttpError(404, 'not_found', 'Branch was not found.');
  }
  return branch;
}

async function openShiftFor(access: TenantAccess, branchId: string, session: ClientSession | null) {
  const query = CashierShift.findOne({
    tenantId: access.tenantId,
    branchId,
    cashierUserId: access.userId,
    status: 'OPEN',
  });
  return session ? query.session(session) : query;
}

function names(value: { en: string; ar?: string | null }) {
  return { en: value.en, ar: value.ar ?? '' };
}

async function presentSale(access: TenantAccess, id: string) {
  const sale = await SaleTransaction.findOne({ _id: id, tenantId: access.tenantId });
  if (!sale) {
    throw new HttpError(404, 'not_found', 'Transaction was not found.');
  }
  assertBranchInScope(access, String(sale.branchId));
  const [payments, refunds, tips, commissions, customer, cashier] = await Promise.all([
    Payment.find({ tenantId: access.tenantId, transactionId: sale._id }).sort({ createdAt: 1 }),
    Refund.find({ tenantId: access.tenantId, transactionId: sale._id }).sort({ createdAt: 1 }),
    Tip.find({ tenantId: access.tenantId, transactionId: sale._id }).sort({ createdAt: 1 }),
    CommissionSnapshot.find({ tenantId: access.tenantId, transactionId: sale._id }),
    Customer.findOne({ _id: sale.customerId, tenantId: access.tenantId }).select('fullName phone'),
    User.findById(sale.cashierUserId).select('fullName'),
  ]);
  const employees = await Employee.find({ tenantId: access.tenantId, _id: { $in: tips.map((tip) => tip.employeeId) } }).select('fullName');
  const employeeNames = new Map(employees.map((employee) => [String(employee._id), employee.fullName]));
  return {
    id: String(sale._id),
    transactionNumber: sale.transactionNumber,
    branchId: String(sale.branchId),
    appointmentId: String(sale.appointmentId),
    customerId: String(sale.customerId),
    customerName: customer?.fullName ?? '',
    customerPhone: customer?.phone ?? '',
    cashierUserId: String(sale.cashierUserId),
    cashierName: cashier?.fullName ?? '',
    items: sale.items.map((item) => ({
      itemType: item.itemType,
      serviceId: item.serviceId ? String(item.serviceId) : null,
      productId: item.productId ? String(item.productId) : null,
      sku: item.skuSnapshot ?? '',
      customerPackageId: item.customerPackageId ? String(item.customerPackageId) : null,
      serviceName: names(item.serviceNameSnapshot),
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      discount: item.discount,
      lineTotal: item.lineTotal,
    })),
    subtotal: sale.subtotal,
    packageDiscount: sale.packageDiscount,
    manualDiscount: sale.manualDiscount,
    totalDiscount: sale.totalDiscount,
    totalAmount: sale.totalAmount,
    paidAmount: sale.paidAmount,
    refundedAmount: sale.refundedAmount,
    amountDue: sale.amountDue,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    tipTotal: sale.tipTotal,
    createdAt: timestamp(sale.createdAt),
    payments: payments.map((payment) => ({
      id: String(payment._id),
      method: payment.method,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      referenceNumber: payment.referenceNumber ?? '',
      status: payment.status,
      receivedAt: timestamp(payment.receivedAt),
    })),
    refunds: refunds.map((refund) => ({
      id: String(refund._id),
      paymentId: String(refund.paymentId),
      amount: refund.amount,
      reason: refund.reason,
      method: refund.method,
      referenceNumber: refund.referenceNumber ?? '',
      status: refund.status,
      createdAt: timestamp(refund.createdAt),
      processedAt: timestamp(refund.processedAt),
    })),
    tips: tips.map((tip) => ({
      id: String(tip._id),
      employeeId: String(tip.employeeId),
      employeeName: employeeNames.get(String(tip.employeeId)) ?? '',
      amount: tip.amount,
      method: tip.method,
    })),
    commissions: commissions.map((row) => ({
      employeeId: String(row.employeeId),
      serviceId: String(row.serviceId),
      commissionType: row.commissionTypeSnapshot,
      commissionRate: row.commissionRateSnapshot,
      commissionAmount: row.commissionAmountSnapshot,
      source: row.source,
    })),
  };
}

export async function listReadyAppointments(access: TenantAccess, query: { page: number; pageSize: number; branchId: string; search: string }) {
  assertCan(access, 'pos.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId, status: 'COMPLETED', checkoutStatus: 'NOT_CHECKED_OUT' };
  if (query.branchId) {
    await requireBranch(access, query.branchId, null);
    filter['branchId'] = query.branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const digits = normalizePhone(query.search);
    const customerFilter: Record<string, unknown>[] = [{ fullName: pattern }, { phone: pattern }];
    if (digits) {
      customerFilter.push({ normalizedPhone: digits });
    }
    const customers = await Customer.find({ tenantId: access.tenantId, $or: customerFilter }).select('_id').limit(40);
    filter['$or'] = [{ appointmentNumber: pattern }, { customerId: { $in: customers.map((customer) => customer._id) } }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    Appointment.find(filter).sort({ completedAt: -1 }).skip(skip).limit(query.pageSize),
    Appointment.countDocuments(filter),
  ]);
  const customers = await Customer.find({ tenantId: access.tenantId, _id: { $in: items.map((item) => item.customerId) } }).select('fullName phone');
  const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));
  return {
    data: items.map((item) => ({
      id: String(item._id),
      appointmentNumber: item.appointmentNumber,
      branchId: String(item.branchId),
      customerId: String(item.customerId),
      customerName: customerById.get(String(item.customerId))?.fullName ?? '',
      customerPhone: customerById.get(String(item.customerId))?.phone ?? '',
      total: item.total,
      discount: item.discount,
      completedAt: timestamp(item.completedAt),
      checkoutStatus: item.checkoutStatus,
    })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function checkoutContext(access: TenantAccess, appointmentId: string) {
  assertCan(access, 'pos.view');
  const appointment = await Appointment.findOne({ _id: appointmentId, tenantId: access.tenantId });
  if (!appointment) {
    throw new HttpError(404, 'not_found', 'Appointment was not found.');
  }
  assertBranchInScope(access, String(appointment.branchId));
  const [customer, barbers, packages] = await Promise.all([
    Customer.findOne({ _id: appointment.customerId, tenantId: access.tenantId }).select('fullName phone'),
    Employee.find({ _id: { $in: [appointment.barberEmployeeId, ...(appointment.extraBarberIds ?? [])] }, tenantId: access.tenantId }).select('fullName'),
    customerPackages(access, String(appointment.customerId)),
  ]);
  const barberNames = new Map(barbers.map((item) => [String(item._id), item.fullName]));
  return {
    appointment: {
      id: String(appointment._id),
      appointmentNumber: appointment.appointmentNumber,
      branchId: String(appointment.branchId),
      customerId: String(appointment.customerId),
      customerName: customer?.fullName ?? '',
      customerPhone: customer?.phone ?? '',
      barberEmployeeId: String(appointment.barberEmployeeId),
      barberName: [appointment.barberEmployeeId, ...(appointment.extraBarberIds ?? [])].map((id) => barberNames.get(String(id)) ?? '').filter((name) => name.length > 0).join(', '),
      status: appointment.status,
      checkoutStatus: appointment.checkoutStatus,
      subtotal: appointment.subtotal,
      discount: appointment.discount,
      total: appointment.total,
      services: appointment.services.map((line) => ({
        serviceId: String(line.serviceId),
        serviceName: names(line.serviceNameSnapshot),
        quantity: line.quantity,
        unitPrice: line.unitPriceSnapshot,
        lineTotal: line.lineTotal,
      })),
    },
    packages: packages.filter((item) => item.status === 'ACTIVE'),
  };
}

async function nextNumber(tenantId: string, session: ClientSession | null) {
  const query = SaleTransaction.countDocuments({ tenantId });
  const count = session ? await query.session(session) : await query;
  return `TXN-${String(count + 1).padStart(4, '0')}`;
}

export async function checkout(access: TenantAccess, input: CheckoutBody) {
  assertCan(access, 'pos.checkout');
  if (input.additionalDiscount > 0) {
    assertAny(access, ['pos.apply-discount', 'payments.apply-discount']);
  }
  if (input.tips.length > 0) {
    assertCan(access, 'tips.manage');
  }
  const replay = await SaleTransaction.findOne({ tenantId: access.tenantId, idempotencyKey: input.idempotencyKey });
  if (replay) {
    if (String(replay.appointmentId) !== input.appointmentId) {
      throw new HttpError(409, 'idempotency_conflict', 'This payment key was already used for another appointment.');
    }
    return presentSale(access, String(replay._id));
  }
  let claimedByMe = false;
  try {
    const saleId = await runInTransaction(async (session) => {
      const claimed = await Appointment.findOneAndUpdate(
        { _id: input.appointmentId, tenantId: access.tenantId, status: 'COMPLETED', checkoutStatus: 'NOT_CHECKED_OUT' },
        { $set: { checkoutStatus: 'CHECKOUT_PENDING', updatedBy: access.userId } },
        session ? { returnDocument: 'after', session } : { returnDocument: 'after' },
      );
      if (!claimed) {
        const existing = await Appointment.findOne({ _id: input.appointmentId, tenantId: access.tenantId }).select('status checkoutStatus branchId');
        if (!existing) {
          throw new HttpError(404, 'not_found', 'Appointment was not found.');
        }
        assertBranchInScope(access, String(existing.branchId));
        if (existing.status !== 'COMPLETED') {
          throw new HttpError(409, 'appointment_not_ready', 'Only a completed appointment can be checked out.');
        }
        throw new HttpError(409, 'duplicate_checkout', 'This appointment already has a checkout.');
      }
      claimedByMe = true;
      assertBranchInScope(access, String(claimed.branchId));
      await requireBranch(access, String(claimed.branchId), session);

      const redeemed = new Map<string, number>();
      const seen = new Set<string>();
      for (const redemption of input.redemptions) {
        const key = `${redemption.customerPackageId}:${redemption.serviceId}`;
        if (seen.has(key)) {
          throw new HttpError(400, 'validation_error', 'Each package service can be redeemed once per checkout.');
        }
        seen.add(key);
        const line = claimed.services.find((item) => String(item.serviceId) === redemption.serviceId);
        if (!line) {
          throw new HttpError(400, 'validation_error', 'A redeemed service is not on this appointment.');
        }
        const used = (redeemed.get(redemption.serviceId) ?? 0) + redemption.quantity;
        if (used > line.quantity) {
          throw new HttpError(409, 'insufficient_quantity', 'The redeemed quantity is higher than the appointment quantity.');
        }
        redeemed.set(redemption.serviceId, used);
        const ownedQuery = CustomerPackage.findOne({
          _id: redemption.customerPackageId,
          tenantId: access.tenantId,
          customerId: claimed.customerId,
        }).select('_id');
        const owned = session ? await ownedQuery.session(session) : await ownedQuery;
        if (!owned) {
          throw new HttpError(404, 'not_found', 'Customer package was not found.');
        }
      }

      const serviceItems = claimed.services.map((line) => ({
        itemType: 'SERVICE' as const,
        serviceId: line.serviceId,
        customerPackageId: null,
        serviceNameSnapshot: names(line.serviceNameSnapshot),
        quantity: line.quantity,
        unitPriceSnapshot: line.unitPriceSnapshot,
        discount: 0,
        lineTotal: line.lineTotal,
      }));
      const redemptionItems = [];
      let packageMinor = 0;
      for (const redemption of input.redemptions) {
        const line = claimed.services.find((item) => String(item.serviceId) === redemption.serviceId);
        if (!line) {
          throw new HttpError(400, 'validation_error', 'A redeemed service is not on this appointment.');
        }
        const value = toMinor(line.unitPriceSnapshot) * redemption.quantity;
        packageMinor += value;
        redemptionItems.push({
          itemType: 'PACKAGE_REDEMPTION' as const,
          serviceId: line.serviceId,
          customerPackageId: redemption.customerPackageId,
          serviceNameSnapshot: names(line.serviceNameSnapshot),
          quantity: redemption.quantity,
          unitPriceSnapshot: line.unitPriceSnapshot,
          discount: fromMinor(value),
          lineTotal: 0,
        });
        await consumeCustomerPackageItem(access.tenantId, redemption.customerPackageId, redemption.serviceId, redemption.quantity, session);
      }

      const saleId = new Types.ObjectId();
      const productItems = await consumeSaleStock(access, String(claimed.branchId), saleId, input.products, session);
      const serviceMinor = addMinor(serviceItems.map((item) => toMinor(item.lineTotal)));
      const productMinor = addMinor(productItems.map((item) => toMinor(item.lineTotal)));
      const subtotalMinor = serviceMinor + productMinor;
      const manualMinor = toMinor(claimed.discount) + toMinor(input.additionalDiscount);
      if (packageMinor > serviceMinor || packageMinor + manualMinor > subtotalMinor) {
        throw new HttpError(400, 'validation_error', 'Discounts cannot be greater than the service total.');
      }
      const totalMinor = subtotalMinor - packageMinor - manualMinor;
      const paidMinor = addMinor(input.payments.map((payment) => toMinor(payment.amount)));
      if (input.payments.some((payment) => toMinor(payment.amount) <= 0) || paidMinor !== totalMinor) {
        throw new HttpError(400, 'payment_mismatch', 'Payments must add up to the amount due.');
      }
      const needsCash = input.payments.some((payment) => payment.method === 'CASH') || input.tips.some((tip) => tip.method === 'CASH');
      const shift = needsCash ? await openShiftFor(access, String(claimed.branchId), session) : null;
      if (needsCash && !shift) {
        throw new HttpError(409, 'shift_required', 'Open a cash shift before recording cash.');
      }

      const sale = new SaleTransaction({
        _id: saleId,
        tenantId: access.tenantId,
        branchId: claimed.branchId,
        transactionNumber: await nextNumber(access.tenantId, session),
        appointmentId: claimed._id,
        customerId: claimed.customerId,
        cashierUserId: access.userId,
        items: [...serviceItems, ...productItems, ...redemptionItems],
        subtotal: fromMinor(subtotalMinor),
        packageDiscount: fromMinor(packageMinor),
        manualDiscount: fromMinor(manualMinor),
        totalDiscount: fromMinor(packageMinor + manualMinor),
        totalAmount: fromMinor(totalMinor),
        paidAmount: fromMinor(paidMinor),
        refundedAmount: 0,
        amountDue: 0,
        status: 'PAID',
        paymentStatus: 'PAID',
        tipTotal: fromMinor(addMinor(input.tips.map((tip) => toMinor(tip.amount)))),
        idempotencyKey: input.idempotencyKey,
      });
      await saveDoc(sale, session);
      const now = new Date();
      let cashMinor = 0;
      for (const payment of input.payments) {
        const row = new Payment({
          tenantId: access.tenantId,
          branchId: claimed.branchId,
          transactionId: sale._id,
          shiftId: payment.method === 'CASH' ? shift?._id ?? null : null,
          method: payment.method,
          amount: fromMinor(toMinor(payment.amount)),
          refundedAmount: 0,
          referenceNumber: payment.referenceNumber,
          status: 'RECORDED',
          receivedBy: access.userId,
          receivedAt: now,
        });
        await saveDoc(row, session);
        if (payment.method === 'CASH') {
          cashMinor += toMinor(payment.amount);
        }
      }
      let tipCashMinor = 0;
      for (const tip of input.tips) {
        const employee = await Employee.findOne({ _id: tip.employeeId, tenantId: access.tenantId, status: 'ACTIVE' });
        if (!employee) {
          throw new HttpError(400, 'validation_error', 'Choose an active barber for the tip.');
        }
        const row = new Tip({
          tenantId: access.tenantId,
          branchId: claimed.branchId,
          transactionId: sale._id,
          shiftId: tip.method === 'CASH' ? shift?._id ?? null : null,
          employeeId: employee._id,
          amount: fromMinor(toMinor(tip.amount)),
          method: tip.method,
          referenceNumber: tip.referenceNumber,
          cashierUserId: access.userId,
        });
        await saveDoc(row, session);
        if (tip.method === 'CASH') {
          tipCashMinor += toMinor(tip.amount);
        }
      }
      if (shift && (cashMinor > 0 || tipCashMinor > 0)) {
        shift.cashSales = fromMinor(toMinor(shift.cashSales) + cashMinor);
        shift.cashTips = fromMinor(toMinor(shift.cashTips) + tipCashMinor);
        await saveDoc(shift, session);
      }
      for (const line of claimed.services) {
        const quote = await quoteCommission(access.tenantId, String(claimed.barberEmployeeId), String(line.serviceId));
        const chargeable = line.quantity - (redeemed.get(String(line.serviceId)) ?? 0);
        const base = toMinor(line.unitPriceSnapshot) * Math.max(chargeable, 0);
        const amount = chargeable <= 0 ? 0 : quote.kind === 'PERCENTAGE' ? Math.round((base * quote.value) / 100) : toMinor(quote.value) * chargeable;
        const snapshot = new CommissionSnapshot({
          tenantId: access.tenantId,
          branchId: claimed.branchId,
          transactionId: sale._id,
          employeeId: claimed.barberEmployeeId,
          serviceId: line.serviceId,
          commissionTypeSnapshot: quote.kind,
          commissionRateSnapshot: quote.value,
          commissionAmountSnapshot: fromMinor(amount),
          source: quote.source,
        });
        await saveDoc(snapshot, session);
      }
      claimed.checkoutStatus = 'PAID';
      claimed.set('updatedBy', access.userId);
      await saveDoc(claimed, session);
      await writeAudit({
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'checkout.created',
        entityType: 'sale',
        entityId: String(sale._id),
        summary: `Checkout ${sale.transactionNumber} recorded.`,
        changes: { appointmentId: String(claimed._id), totalAmount: sale.totalAmount, packageDiscount: sale.packageDiscount },
      }, session);
      await writeAudit({
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'payment.allocated',
        entityType: 'sale',
        entityId: String(sale._id),
        summary: `Payments recorded for ${sale.transactionNumber}.`,
        changes: { payments: input.payments.map((payment) => ({ method: payment.method, amount: fromMinor(toMinor(payment.amount)) })) },
      }, session);
      if (input.redemptions.length > 0) {
        await writeAudit({
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'package.consumed',
          entityType: 'sale',
          entityId: String(sale._id),
          summary: `Package uses consumed for ${sale.transactionNumber}.`,
          changes: { redemptions: input.redemptions },
        }, session);
      }
      await writeAudit({
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'commission.snapshotted',
        entityType: 'sale',
        entityId: String(sale._id),
        summary: `Commission snapshotted for ${sale.transactionNumber}.`,
        changes: { employeeId: String(claimed.barberEmployeeId) },
      }, session);
      return String(sale._id);
    });
    return presentSale(access, saleId);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'payment_mismatch') {
      await writeAudit({
        tenantId: access.tenantId,
        actorUserId: access.userId,
        action: 'payment.failed',
        entityType: 'appointment',
        entityId: input.appointmentId,
        summary: 'Checkout payments did not match the amount due.',
        changes: { payments: input.payments.map((payment) => ({ method: payment.method, amount: payment.amount })) },
      });
    }
    if (hasDuplicateKey(error, 'idempotencyKey') || hasDuplicateKey(error, 'appointmentId')) {
      const existing = await SaleTransaction.findOne({
        tenantId: access.tenantId,
        $or: [{ idempotencyKey: input.idempotencyKey }, { appointmentId: input.appointmentId }],
      });
      if (existing && existing.idempotencyKey === input.idempotencyKey && String(existing.appointmentId) === input.appointmentId) {
        return presentSale(access, String(existing._id));
      }
      throw new HttpError(409, 'duplicate_checkout', 'This appointment already has a checkout.');
    }
    if (claimedByMe) {
      const saved = await SaleTransaction.findOne({ tenantId: access.tenantId, appointmentId: input.appointmentId }).select('_id');
      if (!saved) {
        await Appointment.updateOne(
          { _id: input.appointmentId, tenantId: access.tenantId, checkoutStatus: 'CHECKOUT_PENDING' },
          { $set: { checkoutStatus: 'NOT_CHECKED_OUT' } },
        );
      }
    }
    throw error;
  }
}

function orderMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resolveOrderCustomer(access: TenantAccess, profile: CounterOrderBody['customer']) {
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
    email: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    notes: '',
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

async function requireOrderBarber(access: TenantAccess, branchId: string, employeeId: string) {
  const employee = await Employee.findOne({ _id: employeeId, tenantId: access.tenantId });
  if (!employee) {
    throw new HttpError(400, 'validation_error', 'Choose a barber from this barbershop.');
  }
  assertEmployeeOperational(employee.status);
  const assignment = await EmployeeBranch.findOne({
    tenantId: access.tenantId,
    employeeId,
    branchId,
    status: 'ACTIVE',
  });
  if (!assignment) {
    throw new HttpError(409, 'barber_not_assigned', 'This barber is not assigned to the selected branch.');
  }
}

async function buildOrderLines(tenantId: string, items: CounterOrderBody['services'], session: ClientSession | null) {
  const query = Service.find({ tenantId, _id: { $in: items.map((item) => item.serviceId) } });
  const found = session ? await query.session(session) : await query;
  const byId = new Map(found.map((service) => [String(service._id), service]));
  return items.map((item) => {
    const service = byId.get(item.serviceId);
    if (!service || service.status !== 'ACTIVE') {
      throw new HttpError(400, 'validation_error', 'Choose an active service from this barbershop.');
    }
    return {
      serviceId: service._id,
      serviceNameSnapshot: { en: service.name.en, ar: service.name.ar ?? '' },
      unitPriceSnapshot: service.price,
      quantity: item.quantity,
      commissionTypeSnapshot: service.commissionType,
      commissionValueSnapshot: service.commissionValue,
      lineTotal: orderMoney(service.price * item.quantity),
    };
  });
}

async function createReadyAppointment(access: TenantAccess, input: CounterOrderBody, customerId: unknown) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runInTransaction(async (session) => {
        const lines = await buildOrderLines(access.tenantId, input.services, session);
        const subtotal = orderMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
        const countQuery = Appointment.countDocuments({ tenantId: access.tenantId });
        const count = session ? await countQuery.session(session) : await countQuery;
        const now = new Date();
        const appointment = new Appointment({
          tenantId: access.tenantId,
          branchId: input.branchId,
          appointmentNumber: `APT-${String(count + 1).padStart(4, '0')}`,
          customerId,
          barberEmployeeId: input.barberEmployeeId,
          extraBarberIds: [],
          type: 'WALK_IN',
          scheduledAt: now,
          services: lines,
          subtotal,
          discount: 0,
          total: subtotal,
          status: 'COMPLETED',
          checkoutStatus: 'NOT_CHECKED_OUT',
          notes: '',
          cancellationReason: '',
          createdBy: access.userId,
          updatedBy: access.userId,
          startedAt: now,
          completedAt: now,
        });
        await saveDoc(appointment, session);
        await saveDoc(new AppointmentStatusHistory({
          tenantId: access.tenantId,
          branchId: input.branchId,
          appointmentId: appointment._id,
          previousStatus: '',
          newStatus: 'COMPLETED',
          changedBy: access.userId,
          reason: 'counter order',
        }), session);
        await writeAudit({
          tenantId: access.tenantId,
          actorUserId: access.userId,
          action: 'appointment.counter_order',
          entityType: 'appointment',
          entityId: String(appointment._id),
          summary: `Counter order ${appointment.appointmentNumber} is ready for payment.`,
        }, session);
        return String(appointment._id);
      });
    } catch (error) {
      if (hasDuplicateKey(error, 'appointmentNumber') && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new HttpError(409, 'duplicate_number', 'The appointment number could not be reserved.');
}

/**
 * Cashier counter sale: customer name and phone, services, and payment in one step.
 * A completed walk-in is stored so the existing checkout, shift, and commission rules still apply.
 */
export async function createCounterOrder(access: TenantAccess, input: CounterOrderBody) {
  assertCan(access, 'pos.checkout');
  const replay = await SaleTransaction.findOne({ tenantId: access.tenantId, idempotencyKey: input.idempotencyKey });
  if (replay) {
    return presentSale(access, String(replay._id));
  }
  await requireBranch(access, input.branchId, null);
  await requireOrderBarber(access, input.branchId, input.barberEmployeeId);
  const customer = await resolveOrderCustomer(access, input.customer);
  const appointmentId = await createReadyAppointment(access, input, customer._id);
  try {
    return await checkout(access, {
      appointmentId,
      idempotencyKey: input.idempotencyKey,
      redemptions: [],
      additionalDiscount: input.additionalDiscount,
      payments: input.payments,
      tips: input.tips,
      products: input.products,
    });
  } catch (error) {
    const saved = await SaleTransaction.findOne({
      tenantId: access.tenantId,
      $or: [{ appointmentId }, { idempotencyKey: input.idempotencyKey }],
    }).select('_id idempotencyKey');
    if (saved && saved.idempotencyKey === input.idempotencyKey) {
      return presentSale(access, String(saved._id));
    }
    if (!saved) {
      await Appointment.deleteOne({
        _id: appointmentId,
        tenantId: access.tenantId,
        checkoutStatus: { $in: ['NOT_CHECKED_OUT', 'CHECKOUT_PENDING'] },
      });
      await AppointmentStatusHistory.deleteMany({ tenantId: access.tenantId, appointmentId });
    }
    throw error;
  }
}

function saleState(paidMinor: number, refundedMinor: number): SaleStatus {
  if (refundedMinor <= 0) {
    return 'PAID';
  }
  if (refundedMinor >= paidMinor) {
    return 'REFUNDED';
  }
  return 'PARTIALLY_REFUNDED';
}

export async function listTransactions(access: TenantAccess, query: { page: number; pageSize: number; branchId: string; search: string }) {
  assertCan(access, 'transactions.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.branchId) {
    await requireBranch(access, query.branchId, null);
    filter['branchId'] = query.branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  if (query.search) {
    filter['transactionNumber'] = new RegExp(escapeRegex(query.search), 'i');
  }
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    SaleTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    SaleTransaction.countDocuments(filter),
  ]);
  const customers = await Customer.find({ tenantId: access.tenantId, _id: { $in: items.map((item) => item.customerId) } }).select('fullName');
  const namesById = new Map(customers.map((customer) => [String(customer._id), customer.fullName]));
  return {
    data: items.map((item) => ({
      id: String(item._id),
      transactionNumber: item.transactionNumber,
      customerName: namesById.get(String(item.customerId)) ?? '',
      totalAmount: item.totalAmount,
      paidAmount: item.paidAmount,
      refundedAmount: item.refundedAmount,
      status: item.status,
      createdAt: timestamp(item.createdAt),
    })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getTransaction(access: TenantAccess, id: string) {
  assertCan(access, 'transactions.view');
  return presentSale(access, id);
}

function planRestock(
  sale: InstanceType<typeof SaleTransaction>,
  requested: Array<{ productId: string; quantity: number }>,
  prior: Array<{ restockItems?: Array<{ productId: unknown; quantity: number }> | null }>,
) {
  const sold = new Map<string, number>();
  for (const item of sale.items) {
    if (item.itemType === 'PRODUCT' && item.productId) {
      const id = String(item.productId);
      sold.set(id, (sold.get(id) ?? 0) + item.quantity);
    }
  }
  const used = new Map<string, number>();
  for (const refund of prior) {
    for (const line of refund.restockItems ?? []) {
      const id = String(line.productId);
      used.set(id, (used.get(id) ?? 0) + line.quantity);
    }
  }
  const lines = requested.length > 0
    ? requested
    : [...sold.entries()].map(([productId, quantity]) => ({ productId, quantity: quantity - (used.get(productId) ?? 0) })).filter((line) => line.quantity > 0);
  for (const line of lines) {
    const allowed = (sold.get(line.productId) ?? 0) - (used.get(line.productId) ?? 0);
    if (!sold.has(line.productId) || line.quantity > allowed) {
      throw new HttpError(409, 'restock_limit', 'The restock quantity is higher than the quantity sold.');
    }
  }
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
}

export async function createRefund(access: TenantAccess, input: RefundBody) {
  assertCan(access, 'refunds.create');
  const sale = await SaleTransaction.findOne({ _id: input.transactionId, tenantId: access.tenantId });
  if (!sale) {
    throw new HttpError(404, 'not_found', 'Transaction was not found.');
  }
  assertBranchInScope(access, String(sale.branchId));
  const payment = await Payment.findOne({ _id: input.paymentId, tenantId: access.tenantId, transactionId: sale._id });
  if (!payment) {
    throw new HttpError(404, 'not_found', 'Payment was not found.');
  }
  const amount = toMinor(input.amount);
  if (amount > toMinor(payment.amount) - toMinor(payment.refundedAmount)) {
    throw new HttpError(409, 'refund_limit', 'The refund is higher than the remaining payment.');
  }
  if (amount > toMinor(sale.paidAmount) - toMinor(sale.refundedAmount)) {
    throw new HttpError(409, 'refund_limit', 'The refund is higher than the amount paid.');
  }
  const prior = input.restock
    ? await Refund.find({ tenantId: access.tenantId, transactionId: sale._id, restock: true })
    : [];
  const restockItems = input.restock ? planRestock(sale, input.restockItems, prior) : [];
  const refund = await Refund.create({
    tenantId: access.tenantId,
    branchId: sale.branchId,
    transactionId: sale._id,
    paymentId: payment._id,
    amount: fromMinor(amount),
    reason: input.reason,
    method: input.method,
    referenceNumber: input.referenceNumber,
    status: 'REQUESTED',
    restock: input.restock && restockItems.length > 0,
    restockItems,
    requestedBy: access.userId,
  });
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'refund.requested',
    entityType: 'refund',
    entityId: String(refund._id),
    summary: `Refund requested for ${sale.transactionNumber}.`,
    changes: { amount: refund.amount, paymentId: String(payment._id) },
  });
  return { id: String(refund._id), status: refund.status, amount: refund.amount };
}

export async function approveRefund(access: TenantAccess, id: string) {
  assertCan(access, 'refunds.approve');
  await runInTransaction(async (session) => {
    const query = Refund.findOne({ _id: id, tenantId: access.tenantId, status: 'REQUESTED' });
    const refund = session ? await query.session(session) : await query;
    if (!refund) {
      throw new HttpError(404, 'not_found', 'Refund request was not found.');
    }
    assertBranchInScope(access, String(refund.branchId));
    const saleQuery = SaleTransaction.findOne({ _id: refund.transactionId, tenantId: access.tenantId });
    const sale = session ? await saleQuery.session(session) : await saleQuery;
    const paymentQuery = Payment.findOne({ _id: refund.paymentId, tenantId: access.tenantId });
    const payment = session ? await paymentQuery.session(session) : await paymentQuery;
    if (!sale || !payment) {
      throw new HttpError(404, 'not_found', 'The original payment was not found.');
    }
    const amount = toMinor(refund.amount);
    if (amount > toMinor(payment.amount) - toMinor(payment.refundedAmount) || amount > toMinor(sale.paidAmount) - toMinor(sale.refundedAmount)) {
      throw new HttpError(409, 'refund_limit', 'The refund is higher than the amount paid.');
    }
    let shiftId: unknown = null;
    if (refund.method === 'CASH') {
      const shift = await openShiftFor(access, String(refund.branchId), session);
      if (!shift) {
        throw new HttpError(409, 'shift_required', 'Open a cash shift before recording a cash refund.');
      }
      shift.cashRefunds = fromMinor(toMinor(shift.cashRefunds) + amount);
      await saveDoc(shift, session);
      shiftId = shift._id;
    }
    payment.refundedAmount = fromMinor(toMinor(payment.refundedAmount) + amount);
    payment.status = toMinor(payment.refundedAmount) >= toMinor(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await saveDoc(payment, session);
    sale.refundedAmount = fromMinor(toMinor(sale.refundedAmount) + amount);
    const next = saleState(toMinor(sale.paidAmount), toMinor(sale.refundedAmount));
    sale.status = next;
    sale.paymentStatus = next;
    await saveDoc(sale, session);
    if (refund.restock && refund.restockItems.length > 0) {
      await restockSale(
        access,
        String(sale.branchId),
        refund._id,
        refund.restockItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        session,
      );
    }
    await Appointment.updateOne(
      { _id: sale.appointmentId, tenantId: access.tenantId },
      { $set: { checkoutStatus: next } },
      session ? { session } : {},
    );
    refund.status = 'PROCESSED';
    refund.set('processedBy', access.userId);
    refund.processedAt = new Date();
    if (shiftId) {
      refund.set('shiftId', shiftId);
    }
    await saveDoc(refund, session);
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'refund.approved',
      entityType: 'refund',
      entityId: String(refund._id),
      summary: `Refund processed for ${sale.transactionNumber}.`,
      changes: { amount: refund.amount, status: next },
    }, session);
    return true;
  });
  const refund = await Refund.findOne({ _id: id, tenantId: access.tenantId });
  return { id, status: refund?.status ?? 'PROCESSED', amount: refund?.amount ?? 0 };
}

export async function listRefunds(access: TenantAccess, branchId: string) {
  assertCan(access, 'refunds.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (branchId) {
    await requireBranch(access, branchId, null);
    filter['branchId'] = branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  const refunds = await Refund.find(filter).sort({ createdAt: -1 }).limit(100);
  return refunds.map((refund) => ({
    id: String(refund._id),
    transactionId: String(refund.transactionId),
    paymentId: String(refund.paymentId),
    amount: refund.amount,
    reason: refund.reason,
    method: refund.method,
    status: refund.status,
    createdAt: timestamp(refund.createdAt),
  }));
}

function presentShift(shift: InstanceType<typeof CashierShift>) {
  const expected = fromMinor(toMinor(shift.openingBalance) + toMinor(shift.cashSales) + toMinor(shift.cashTips) - toMinor(shift.cashRefunds));
  return {
    id: String(shift._id),
    branchId: String(shift.branchId),
    cashierUserId: String(shift.cashierUserId),
    shiftType: shift.shiftType,
    openingBalance: shift.openingBalance,
    openedAt: timestamp(shift.openedAt),
    closedAt: timestamp(shift.closedAt),
    cashSales: shift.cashSales,
    cashTips: shift.cashTips,
    cashRefunds: shift.cashRefunds,
    expectedCash: shift.status === 'CLOSED' ? shift.expectedCash : expected,
    actualCash: shift.actualCash,
    difference: shift.difference,
    status: shift.status,
  };
}

export async function openShift(access: TenantAccess, input: { branchId: string; shiftType: 'MORNING' | 'EVENING'; openingBalance: number }) {
  assertCan(access, 'cashier-shifts.open');
  await requireBranch(access, input.branchId, null);
  const existing = await openShiftFor(access, input.branchId, null);
  if (existing) {
    throw new HttpError(409, 'shift_open', 'This cashier already has an open shift at this branch.');
  }
  try {
    const shift = await CashierShift.create({
      tenantId: access.tenantId,
      branchId: input.branchId,
      cashierUserId: access.userId,
      shiftType: input.shiftType,
      openingBalance: fromMinor(toMinor(input.openingBalance)),
      openedAt: new Date(),
      cashSales: 0,
      cashTips: 0,
      cashRefunds: 0,
      status: 'OPEN',
      openedBy: access.userId,
    });
    await writeAudit({
      tenantId: access.tenantId,
      actorUserId: access.userId,
      action: 'shift.opened',
      entityType: 'cashier-shift',
      entityId: String(shift._id),
      summary: `${input.shiftType} shift opened.`,
      changes: { openingBalance: shift.openingBalance, branchId: input.branchId },
    });
    return presentShift(shift);
  } catch (error) {
    if (hasDuplicateKey(error, 'cashierUserId')) {
      throw new HttpError(409, 'shift_open', 'This cashier already has an open shift at this branch.');
    }
    throw error;
  }
}

export async function currentShift(access: TenantAccess, branchId: string) {
  assertCan(access, 'cashier-shifts.view');
  await requireBranch(access, branchId, null);
  const shift = await openShiftFor(access, branchId, null);
  return shift ? presentShift(shift) : null;
}

export async function listShifts(access: TenantAccess, branchId: string, page: number, pageSize: number) {
  assertCan(access, 'cashier-shifts.view');
  await requireBranch(access, branchId, null);
  const filter = { tenantId: access.tenantId, branchId };
  const [items, total] = await Promise.all([
    CashierShift.find(filter).sort({ openedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    CashierShift.countDocuments(filter),
  ]);
  return { data: items.map((item) => presentShift(item)), meta: { page, pageSize, total } };
}

export async function closeShift(access: TenantAccess, id: string, actualCash: number) {
  assertCan(access, 'cashier-shifts.close');
  const shift = await CashierShift.findOne({ _id: id, tenantId: access.tenantId, status: 'OPEN' });
  if (!shift) {
    throw new HttpError(404, 'not_found', 'Open shift was not found.');
  }
  assertBranchInScope(access, String(shift.branchId));
  const [payments, tips, refunds] = await Promise.all([
    Payment.find({ tenantId: access.tenantId, shiftId: shift._id, method: 'CASH' }),
    Tip.find({ tenantId: access.tenantId, shiftId: shift._id, method: 'CASH' }),
    Refund.find({ tenantId: access.tenantId, shiftId: shift._id, method: 'CASH', status: 'PROCESSED' }),
  ]);
  const cashSales = fromMinor(addMinor(payments.map((payment) => toMinor(payment.amount))));
  const cashTips = fromMinor(addMinor(tips.map((tip) => toMinor(tip.amount))));
  const cashRefunds = fromMinor(addMinor(refunds.map((refund) => toMinor(refund.amount))));
  const expected = fromMinor(toMinor(shift.openingBalance) + toMinor(cashSales) + toMinor(cashTips) - toMinor(cashRefunds));
  const actual = fromMinor(toMinor(actualCash));
  shift.cashSales = cashSales;
  shift.cashTips = cashTips;
  shift.cashRefunds = cashRefunds;
  shift.expectedCash = expected;
  shift.actualCash = actual;
  shift.difference = fromMinor(toMinor(actual) - toMinor(expected));
  shift.closingBalance = actual;
  shift.status = 'CLOSED';
  shift.closedAt = new Date();
  shift.set('closedBy', access.userId);
  await shift.save();
  await writeAudit({
    tenantId: access.tenantId,
    actorUserId: access.userId,
    action: 'shift.closed',
    entityType: 'cashier-shift',
    entityId: String(shift._id),
    summary: 'Cash shift closed.',
    changes: { expectedCash: expected, actualCash: actual, difference: shift.difference },
  });
  return presentShift(shift);
}

export async function commissionSummary(access: TenantAccess, query: { branchId: string; from: string; to: string }) {
  assertCan(access, 'commissions.view');
  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.branchId) {
    await requireBranch(access, query.branchId, null);
    filter['branchId'] = query.branchId;
  } else if (access.branchScope === 'SELECTED') {
    filter['branchId'] = { $in: access.branchIds };
  }
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) {
      range['$gte'] = new Date(query.from);
    }
    if (query.to) {
      range['$lte'] = new Date(query.to);
    }
    filter['createdAt'] = range;
  }
  const rows = await CommissionSnapshot.find(filter);
  const employees = await Employee.find({ tenantId: access.tenantId, _id: { $in: rows.map((row) => row.employeeId) } }).select('fullName');
  const employeeNames = new Map(employees.map((employee) => [String(employee._id), employee.fullName]));
  const grouped = new Map<string, { employeeId: string; employeeName: string; amountMinor: number; services: number }>();
  for (const row of rows) {
    const id = String(row.employeeId);
    const current = grouped.get(id) ?? { employeeId: id, employeeName: employeeNames.get(id) ?? '', amountMinor: 0, services: 0 };
    current.amountMinor += toMinor(row.commissionAmountSnapshot);
    current.services += 1;
    grouped.set(id, current);
  }
  return [...grouped.values()].map((row) => ({
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    commissionAmount: fromMinor(row.amountMinor),
    services: row.services,
  }));
}

export async function customerFinancials(tenantId: string, customerId: string) {
  const sales = await SaleTransaction.find({ tenantId, customerId }).select('paidAmount refundedAmount amountDue createdAt');
  const paidMinor = addMinor(sales.map((sale) => toMinor(sale.paidAmount)));
  const refundMinor = addMinor(sales.map((sale) => toMinor(sale.refundedAmount)));
  const outstandingMinor = addMinor(sales.map((sale) => toMinor(sale.amountDue)));
  const last = sales
    .map((sale) => sale.createdAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return {
    totalPaid: fromMinor(paidMinor),
    totalRefunds: fromMinor(refundMinor),
    netSpending: fromMinor(paidMinor - refundMinor),
    totalTransactions: sales.length,
    lastPaidTransaction: last ? last.toISOString() : null,
    outstandingAmount: fromMinor(outstandingMinor),
  };
}

export async function customerPaymentHistory(tenantId: string, customerId: string) {
  const sales = await SaleTransaction.find({ tenantId, customerId }).sort({ createdAt: -1 }).limit(20);
  return {
    data: sales.map((sale) => ({
      id: String(sale._id),
      title: sale.transactionNumber,
      amount: fromMinor(toMinor(sale.paidAmount) - toMinor(sale.refundedAmount)),
      paidAt: timestamp(sale.createdAt),
      status: sale.status,
    })),
    meta: { page: 1, pageSize: 20, total: await SaleTransaction.countDocuments({ tenantId, customerId }) },
    source: 'transactions' as const,
  };
}

export type { PaymentMethod };
