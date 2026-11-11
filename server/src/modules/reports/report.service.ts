import { Types, type PipelineStage } from 'mongoose';
import { HttpError } from '../../shared/http-error.js';
import { fromMinor, toMinor } from '../../shared/money.js';
import type { TenantAccess } from '../access/access.types.js';
import { assertBranchInScope } from '../access/access.middleware.js';
import type { PermissionKey } from '../access/permissions.js';
import { Appointment } from '../appointments/appointment.model.js';
import { Branch } from '../branches/branch.model.js';
import { Customer } from '../customers/customer.model.js';
import { Employee } from '../employees/employee.model.js';
import { Product, Purchase, PurchasePayment, Stock, StockMovement, StockTransfer, Supplier } from '../inventory/inventory.model.js';
import { CustomerPackage } from '../packages/package.model.js';
import { CommissionSnapshot, Payment, Refund, SaleTransaction, Tip, CashierShift } from '../pos/sale.model.js';
import { Service } from '../services/service.model.js';
import { ServiceCategory } from '../services/service-category.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { Attendance, LeaveBalance, LeaveRequest, LeaveType, Payroll } from '../workforce/workforce.model.js';
import { addDays, eachDate, todayInZone, zonedTime } from '../workforce/workforce.time.js';

const SALE_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const OPEN_SALE_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'] as const;
const METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'] as const;

export interface ReportQuery {
  from: string;
  to: string;
  branchId: string;
  employeeId: string;
  categoryId: string;
  paymentMethod: string;
  status: string;
  section: string;
  payrollStatus: string;
  lang: string;
  page: number;
  pageSize: number;
}

export interface ReportRow {
  [key: string]: string | number;
}

export interface ReportPayload {
  kind: string;
  generatedAt: string;
  timezone: string;
  currency: string;
  tenantName: string;
  branchName: string;
  filters: Record<string, string>;
  metrics: Record<string, number>;
  columns: string[];
  rows: ReportRow[];
  page: number;
  pageSize: number;
  total: number;
  notes: string[];
}

interface Scope extends ReportQuery {
  kind: string;
  access: TenantAccess;
  tenantObjectId: Types.ObjectId;
  timezone: string;
  currency: string;
  tenantName: string;
  branchName: string;
  start: Date;
  end: Date;
  match: Record<string, unknown>;
  branchObjectId: Types.ObjectId | null;
  branchObjectIds: Types.ObjectId[] | null;
}

function can(access: TenantAccess, key: PermissionKey): boolean {
  return access.isOwner || access.permissions.has(key);
}

function canAny(access: TenantAccess, keys: PermissionKey[]): boolean {
  return access.isOwner || keys.some((key) => access.permissions.has(key));
}

function canSeeSales(access: TenantAccess): boolean {
  return canAny(access, ['reports.view', 'reports.sales']);
}

function canSeePayrollAmounts(access: TenantAccess): boolean {
  return can(access, 'payroll.view');
}

function roundField(path: string): Record<string, unknown> {
  return { $round: [{ $multiply: [path, 100] }, 0] };
}

function minor(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function money(value: unknown): number {
  return fromMinor(minor(value));
}

function labelOf(en: unknown, ar: unknown, lang: string): string {
  const english = typeof en === 'string' ? en : '';
  const arabic = typeof ar === 'string' ? ar : '';
  return lang === 'ar' ? arabic || english : english || arabic;
}

function branchFilter(scope: Scope, field = 'branchId'): Record<string, unknown> {
  if (scope.branchObjectId) {
    return { [field]: scope.branchObjectId };
  }
  if (scope.branchObjectIds) {
    return { [field]: { $in: scope.branchObjectIds } };
  }
  return {};
}

function assertKind(access: TenantAccess, kind: string): void {
  const sales = ['dashboard', 'daily', 'weekly', 'monthly', 'branches', 'services', 'products', 'categories', 'payments', 'discounts', 'refunds', 'transactions'];
  if (sales.includes(kind) && !canSeeSales(access)) {
    throw new HttpError(403, 'forbidden', 'You do not have access to sales reports.');
  }
  if ((kind === 'employees' || kind === 'performance') && !can(access, 'reports.employees')) {
    throw new HttpError(403, 'forbidden', 'You do not have access to employee reports.');
  }
  if (kind === 'customers' && !can(access, 'reports.customers')) {
    throw new HttpError(403, 'forbidden', 'You do not have access to customer reports.');
  }
  if (kind === 'inventory' && !can(access, 'reports.inventory')) {
    throw new HttpError(403, 'forbidden', 'You do not have access to inventory reports.');
  }
  if (kind === 'attendance' && !can(access, 'reports.attendance')) {
    throw new HttpError(403, 'forbidden', 'You do not have access to attendance reports.');
  }
  if (kind === 'payroll' && !can(access, 'reports.payroll')) {
    throw new HttpError(403, 'forbidden', 'You do not have access to payroll reports.');
  }
  if (kind === 'cashier' && !canAny(access, ['reports.cashier', 'cashier-shifts.view'])) {
    throw new HttpError(403, 'forbidden', 'You do not have access to cashier reports.');
  }
  if (kind === 'suppliers' && !canAny(access, ['reports.view', 'reports.sales', 'purchases.view'])) {
    throw new HttpError(403, 'forbidden', 'You do not have access to supplier payment reports.');
  }
  const known = [...sales, 'employees', 'performance', 'customers', 'inventory', 'attendance', 'payroll', 'cashier', 'suppliers'];
  if (!known.includes(kind)) {
    throw new HttpError(404, 'not_found', 'Report was not found.');
  }
}

export async function resolveScope(access: TenantAccess, kind: string, query: ReportQuery): Promise<Scope> {
  const tenant = await Tenant.findById(access.tenantId).select('businessName currency timezone');
  if (!tenant) {
    throw new HttpError(404, 'not_found', 'Tenant was not found.');
  }
  const timezone = tenant.timezone || 'Africa/Cairo';
  const today = todayInZone(timezone);
  const from = query.from || today;
  const to = query.to || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || eachDate(from, to).length === 0 || eachDate(from, to).length > 366) {
    throw new HttpError(400, 'validation_error', 'Choose a start and end date within 366 days.');
  }
  let start: Date;
  let end: Date;
  try {
    start = zonedTime(from, '00:00', timezone);
    end = zonedTime(addDays(to, 1), '00:00', timezone);
  } catch {
    throw new HttpError(400, 'validation_error', 'The tenant timezone could not be applied.');
  }
  if (query.branchId) {
    assertBranchInScope(access, query.branchId);
  }
  if (query.employeeId) {
    const employee = await Employee.exists({ _id: query.employeeId, tenantId: access.tenantId });
    if (!employee) {
      throw new HttpError(404, 'not_found', 'Employee was not found.');
    }
  }
  if (query.categoryId) {
    const category = await ServiceCategory.exists({ _id: query.categoryId, tenantId: access.tenantId });
    if (!category) {
      throw new HttpError(404, 'not_found', 'Service category was not found.');
    }
  }
  const branchObjectId = query.branchId ? new Types.ObjectId(query.branchId) : null;
  const branchObjectIds = !query.branchId && access.branchScope === 'SELECTED' ? access.branchIds.map((id) => new Types.ObjectId(id)) : null;
  const match: Record<string, unknown> = {
    tenantId: new Types.ObjectId(access.tenantId),
    createdAt: { $gte: start, $lt: end },
    status: query.status || { $in: [...SALE_STATUSES] },
  };
  if (branchObjectId) {
    match['branchId'] = branchObjectId;
  } else if (branchObjectIds) {
    match['branchId'] = { $in: branchObjectIds };
  }
  if (query.categoryId) {
    const services = await Service.find({ tenantId: access.tenantId, categoryId: query.categoryId }).select('_id');
    match['items.serviceId'] = { $in: services.map((service) => service._id) };
  }
  let branchName = query.lang === 'ar' ? 'كل الفروع' : 'All branches';
  if (query.branchId) {
    const branch = await Branch.findOne({ _id: query.branchId, tenantId: access.tenantId }).select('name');
    branchName = branch?.name || branchName;
  }
  return {
    ...query,
    from,
    to,
    kind,
    access,
    tenantObjectId: new Types.ObjectId(access.tenantId),
    timezone,
    currency: tenant.currency || 'EGP',
    tenantName: tenant.businessName,
    branchName,
    start,
    end,
    match,
    branchObjectId,
    branchObjectIds,
  };
}

function buildStages(scope: Scope, options: { appointment?: boolean; payments?: boolean } = {}): PipelineStage[] {
  const stages: PipelineStage[] = [{ $match: scope.match }];
  if (options.appointment || scope.employeeId) {
    stages.push(
      { $lookup: { from: Appointment.collection.name, localField: 'appointmentId', foreignField: '_id', as: 'appointment' } },
      { $unwind: { path: '$appointment', preserveNullAndEmptyArrays: false } },
    );
    if (scope.employeeId) {
      stages.push({ $match: { 'appointment.barberEmployeeId': new Types.ObjectId(scope.employeeId) } });
    }
  }
  if (options.payments || scope.paymentMethod) {
    stages.push({ $lookup: { from: Payment.collection.name, localField: '_id', foreignField: 'transactionId', as: 'payments' } });
    if (scope.paymentMethod) {
      stages.push({ $match: { 'payments.method': scope.paymentMethod } });
    }
  }
  return stages;
}

function pageRows(scope: Scope, rows: ReportRow[], total = rows.length): ReportPayload['rows'] {
  if (rows.length > scope.pageSize && total === rows.length) {
    const start = (scope.page - 1) * scope.pageSize;
    return rows.slice(start, start + scope.pageSize);
  }
  return rows;
}

function payload(scope: Scope, columns: string[], rows: ReportRow[], metrics: Record<string, number>, notes: string[], total = rows.length): ReportPayload {
  return {
    kind: scope.kind,
    generatedAt: new Date().toISOString(),
    timezone: scope.timezone,
    currency: scope.currency,
    tenantName: scope.tenantName,
    branchName: scope.branchName,
    filters: {
      from: scope.from,
      to: scope.to,
      branchId: scope.branchId,
      employeeId: scope.employeeId,
      categoryId: scope.categoryId,
      paymentMethod: scope.paymentMethod,
      status: scope.status,
      section: scope.section,
      payrollStatus: scope.payrollStatus,
    },
    metrics,
    columns,
    rows: pageRows(scope, rows, total),
    page: scope.page,
    pageSize: scope.pageSize,
    total,
    notes,
  };
}

async function salesSummary(scope: Scope): Promise<Record<string, number>> {
  const stages = buildStages(scope, { payments: true });
  const totals = await SaleTransaction.aggregate<Record<string, number>>([
    ...stages,
    {
      $group: {
        _id: null,
        grossMinor: { $sum: roundField('$subtotal') },
        discountMinor: { $sum: roundField('$totalDiscount') },
        refundMinor: { $sum: roundField('$refundedAmount') },
        chargedMinor: { $sum: roundField('$totalAmount') },
        tipMinor: { $sum: roundField('$tipTotal') },
        count: { $sum: 1 },
      },
    },
  ]);
  const methodRows = await SaleTransaction.aggregate<{ _id: string; amountMinor: number; refundMinor: number }>([
    ...stages,
    { $unwind: '$payments' },
    ...(scope.paymentMethod ? [{ $match: { 'payments.method': scope.paymentMethod } }] : []),
    {
      $group: {
        _id: '$payments.method',
        amountMinor: { $sum: roundField('$payments.amount') },
        refundMinor: { $sum: roundField('$payments.refundedAmount') },
      },
    },
  ]);
  const quantities = await SaleTransaction.aggregate<{ _id: string; qty: number }>([
    ...buildStages(scope),
    { $unwind: '$items' },
    { $group: { _id: '$items.itemType', qty: { $sum: '$items.quantity' } } },
  ]);
  const history: Record<string, unknown> = { ...scope.match, createdAt: { $lt: scope.end } };
  const customerRows = await SaleTransaction.aggregate<{ firstTime?: number; returning?: number }>([
    { $match: history },
    ...(scope.employeeId
      ? [
          { $lookup: { from: Appointment.collection.name, localField: 'appointmentId', foreignField: '_id', as: 'appointment' } },
          { $unwind: '$appointment' },
          { $match: { 'appointment.barberEmployeeId': new Types.ObjectId(scope.employeeId) } },
        ]
      : []),
    ...(scope.paymentMethod
      ? [
          { $lookup: { from: Payment.collection.name, localField: '_id', foreignField: 'transactionId', as: 'payments' } },
          { $match: { 'payments.method': scope.paymentMethod } },
        ]
      : []),
    {
      $group: {
        _id: '$customerId',
        first: { $min: '$createdAt' },
        inPeriod: { $max: { $cond: [{ $gte: ['$createdAt', scope.start] }, 1, 0] } },
      },
    },
    { $match: { inPeriod: 1 } },
    {
      $group: {
        _id: null,
        returning: { $sum: { $cond: [{ $lt: ['$first', scope.start] }, 1, 0] } },
        firstTime: { $sum: { $cond: [{ $gte: ['$first', scope.start] }, 1, 0] } },
      },
    },
  ]);
  const total = totals[0];
  const charged = minor(total?.['chargedMinor']);
  const refunded = minor(total?.['refundMinor']);
  const count = minor(total?.['count']);
  const netMinor = charged - refunded;
  const methodNet = (method: string) => {
    const row = methodRows.find((item) => item._id === method);
    return row ? fromMinor(minor(row.amountMinor) - minor(row.refundMinor)) : 0;
  };
  const qty = (type: string) => quantities.find((item) => item._id === type)?.qty ?? 0;
  const customers = customerRows[0];
  return {
    gross: money(total?.['grossMinor']),
    discounts: money(total?.['discountMinor']),
    refunds: money(refunded),
    net: fromMinor(netMinor),
    cash: methodNet('CASH'),
    card: methodNet('VISA'),
    wallet: methodNet('WALLET'),
    instapay: methodNet('INSTAPAY'),
    other: methodNet('OTHER'),
    tips: money(total?.['tipMinor']),
    transactions: count,
    average: count ? fromMinor(Math.round(netMinor / count)) : 0,
    servicesSold: qty('SERVICE'),
    productsSold: qty('PRODUCT'),
    newCustomers: minor(customers?.firstTime),
    returningCustomers: minor(customers?.returning),
  };
}

const SALES_NOTES = ['appointments_are_not_sales', 'net_includes_refunds', 'tips_are_separate'];

function periodRow(row: Record<string, unknown>): ReportRow {
  const charged = minor(row['chargedMinor']);
  const refunded = minor(row['refundMinor']);
  return {
    period: String(row['_id'] ?? ''),
    gross: money(row['grossMinor']),
    discounts: money(row['discountMinor']),
    refunds: money(refunded),
    net: fromMinor(charged - refunded),
    tips: money(row['tipMinor']),
    transactions: minor(row['count']),
  };
}

async function groupedSales(scope: Scope, format: string): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const rows = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope),
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt', timezone: scope.timezone } },
        grossMinor: { $sum: roundField('$subtotal') },
        discountMinor: { $sum: roundField('$totalDiscount') },
        refundMinor: { $sum: roundField('$refundedAmount') },
        chargedMinor: { $sum: roundField('$totalAmount') },
        tipMinor: { $sum: roundField('$tipTotal') },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 400 },
  ]);
  return payload(scope, ['period', 'gross', 'discounts', 'refunds', 'net', 'tips', 'transactions'], rows.map(periodRow), metrics, SALES_NOTES);
}

async function branchSales(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const rows = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope),
    {
      $group: {
        _id: '$branchId',
        grossMinor: { $sum: roundField('$subtotal') },
        discountMinor: { $sum: roundField('$totalDiscount') },
        refundMinor: { $sum: roundField('$refundedAmount') },
        chargedMinor: { $sum: roundField('$totalAmount') },
        count: { $sum: 1 },
      },
    },
    { $sort: { chargedMinor: -1 } },
    { $limit: 100 },
  ]);
  const branches = await Branch.find({ tenantId: scope.access.tenantId, _id: { $in: rows.map((row) => row['_id']) } }).select('name');
  const names = new Map(branches.map((branch) => [String(branch._id), branch.name]));
  return payload(
    scope,
    ['label', 'gross', 'discounts', 'refunds', 'net', 'transactions'],
    rows.map((row) => ({ ...periodRow(row), label: names.get(String(row['_id'])) ?? '' })),
    metrics,
    SALES_NOTES,
  );
}

async function lineSales(scope: Scope, itemType: 'SERVICE' | 'PRODUCT'): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const rows = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope),
    { $unwind: '$items' },
    { $match: { 'items.itemType': itemType } },
    {
      $group: {
        _id: itemType === 'SERVICE' ? '$items.serviceId' : '$items.productId',
        en: { $first: '$items.serviceNameSnapshot.en' },
        ar: { $first: '$items.serviceNameSnapshot.ar' },
        sku: { $first: '$items.skuSnapshot' },
        quantity: { $sum: '$items.quantity' },
        grossMinor: { $sum: { $round: [{ $multiply: [{ $add: ['$items.lineTotal', '$items.discount'] }, 100] }, 0] } },
        discountMinor: { $sum: roundField('$items.discount') },
        netMinor: { $sum: roundField('$items.lineTotal') },
      },
    },
    { $sort: { netMinor: -1 } },
    { $limit: 200 },
  ]);
  return payload(
    scope,
    ['label', 'sku', 'quantity', 'gross', 'discounts', 'net'],
    rows.map((row) => ({
      label: labelOf(row['en'], row['ar'], scope.lang),
      sku: String(row['sku'] ?? ''),
      quantity: minor(row['quantity']),
      gross: money(row['grossMinor']),
      discounts: money(row['discountMinor']),
      net: money(row['netMinor']),
    })),
    metrics,
    SALES_NOTES,
  );
}

async function categorySales(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const rows = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope),
    { $unwind: '$items' },
    { $match: { 'items.itemType': 'SERVICE' } },
    { $lookup: { from: Service.collection.name, localField: 'items.serviceId', foreignField: '_id', as: 'service' } },
    { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$service.categoryId',
        quantity: { $sum: '$items.quantity' },
        netMinor: { $sum: roundField('$items.lineTotal') },
      },
    },
    { $sort: { netMinor: -1 } },
  ]);
  const categories = await ServiceCategory.find({ tenantId: scope.access.tenantId, _id: { $in: rows.map((row) => row['_id']).filter(Boolean) } }).select('name');
  const names = new Map(categories.map((category) => [String(category._id), category.name]));
  return payload(
    scope,
    ['label', 'quantity', 'net'],
    rows.map((row) => {
      const name = names.get(String(row['_id']));
      return { label: name ? labelOf(name.en, name.ar, scope.lang) : '', quantity: minor(row['quantity']), net: money(row['netMinor']) };
    }),
    metrics,
    SALES_NOTES,
  );
}

async function paymentReport(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const rows = METHODS.map((method) => ({
    method,
    net: metrics[method === 'VISA' ? 'card' : method.toLowerCase()] ?? 0,
  }));
  return payload(scope, ['method', 'net'], rows, metrics, [...SALES_NOTES, 'payment_net_is_amount_minus_refund']);
}

async function discountReport(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const skip = (scope.page - 1) * scope.pageSize;
  const [page] = await SaleTransaction.aggregate<{ rows: Record<string, unknown>[]; total: Array<{ count: number }> }>([
    ...buildStages(scope),
    { $match: { totalDiscount: { $gt: 0 } } },
    {
      $facet: {
        rows: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: scope.pageSize },
          { $project: { transactionNumber: 1, subtotal: 1, totalDiscount: 1, totalAmount: 1, refundedAmount: 1, status: 1 } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const total = page?.total[0]?.count ?? 0;
  const rows = (page?.rows ?? []).map((row) => ({
    transaction: String(row['transactionNumber'] ?? ''),
    status: String(row['status'] ?? ''),
    gross: Number(row['subtotal'] ?? 0),
    discounts: Number(row['totalDiscount'] ?? 0),
    refunds: Number(row['refundedAmount'] ?? 0),
    net: fromMinor(toMinor(Number(row['totalAmount'] ?? 0)) - toMinor(Number(row['refundedAmount'] ?? 0))),
  }));
  return payload(scope, ['transaction', 'status', 'gross', 'discounts', 'refunds', 'net'], rows, metrics, SALES_NOTES, total);
}

async function refundReport(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const match: Record<string, unknown> = {
    tenantId: scope.tenantObjectId,
    status: 'PROCESSED',
    createdAt: { $gte: scope.start, $lt: scope.end },
    ...branchFilter(scope),
  };
  if (scope.paymentMethod) {
    match['method'] = scope.paymentMethod;
  }
  const skip = (scope.page - 1) * scope.pageSize;
  const [page] = await Refund.aggregate<{ rows: Record<string, unknown>[]; total: Array<{ count: number }> }>([
    { $match: match },
    { $lookup: { from: SaleTransaction.collection.name, localField: 'transactionId', foreignField: '_id', as: 'sale' } },
    { $unwind: { path: '$sale', preserveNullAndEmptyArrays: true } },
    ...(scope.employeeId
      ? [
          { $lookup: { from: Appointment.collection.name, localField: 'sale.appointmentId', foreignField: '_id', as: 'appointment' } },
          { $unwind: '$appointment' },
          { $match: { 'appointment.barberEmployeeId': new Types.ObjectId(scope.employeeId) } },
        ]
      : []),
    {
      $facet: {
        rows: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: scope.pageSize }],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const rows = (page?.rows ?? []).map((row) => ({
    transaction: String((row['sale'] as { transactionNumber?: string } | undefined)?.transactionNumber ?? ''),
    method: String(row['method'] ?? ''),
    amount: Number(row['amount'] ?? 0),
    status: String(row['status'] ?? ''),
  }));
  return payload(scope, ['transaction', 'method', 'amount', 'status'], rows, metrics, SALES_NOTES, page?.total[0]?.count ?? 0);
}

async function transactionReport(scope: Scope): Promise<ReportPayload> {
  const metrics = await salesSummary(scope);
  const skip = (scope.page - 1) * scope.pageSize;
  const [page] = await SaleTransaction.aggregate<{ rows: Record<string, unknown>[]; total: Array<{ count: number }> }>([
    ...buildStages(scope),
    { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        rows: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: scope.pageSize },
          {
            $project: {
              transactionNumber: 1,
              status: 1,
              subtotal: 1,
              totalDiscount: 1,
              refundedAmount: 1,
              totalAmount: 1,
              tipTotal: 1,
              customer: '$customer.fullName',
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const rows = (page?.rows ?? []).map((row) => ({
    transaction: String(row['transactionNumber'] ?? ''),
    customer: String(row['customer'] ?? ''),
    status: String(row['status'] ?? ''),
    gross: Number(row['subtotal'] ?? 0),
    discounts: Number(row['totalDiscount'] ?? 0),
    refunds: Number(row['refundedAmount'] ?? 0),
    net: fromMinor(toMinor(Number(row['totalAmount'] ?? 0)) - toMinor(Number(row['refundedAmount'] ?? 0))),
    tips: Number(row['tipTotal'] ?? 0),
  }));
  return payload(scope, ['transaction', 'customer', 'status', 'gross', 'discounts', 'refunds', 'net', 'tips'], rows, metrics, SALES_NOTES, page?.total[0]?.count ?? 0);
}

async function employeeNames(tenantId: string, ids: unknown[]): Promise<Map<string, string>> {
  const employees = await Employee.find({ tenantId, _id: { $in: ids.filter(Boolean) } }).select('fullName');
  return new Map(employees.map((employee) => [String(employee._id), employee.fullName]));
}

async function performanceReport(scope: Scope): Promise<ReportPayload> {
  const sales = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope, { appointment: true }),
    {
      $group: {
        _id: '$appointment.barberEmployeeId',
        chargedMinor: { $sum: roundField('$totalAmount') },
        refundMinor: { $sum: roundField('$refundedAmount') },
        transactions: { $sum: 1 },
        customers: { $addToSet: '$customerId' },
        services: {
          $sum: {
            $sum: {
              $map: {
                input: { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.itemType', 'SERVICE'] } } },
                as: 'item',
                in: '$$item.quantity',
              },
            },
          },
        },
      },
    },
  ]);
  const commission = await CommissionSnapshot.aggregate<{ _id: Types.ObjectId; minor: number }>([
    { $match: { tenantId: scope.tenantObjectId, ...branchFilter(scope), ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}) } },
    { $lookup: { from: SaleTransaction.collection.name, localField: 'transactionId', foreignField: '_id', as: 'sale' } },
    { $unwind: '$sale' },
    { $match: { 'sale.status': { $in: [...OPEN_SALE_STATUSES] }, 'sale.createdAt': { $gte: scope.start, $lt: scope.end } } },
    { $group: { _id: '$employeeId', minor: { $sum: roundField('$commissionAmountSnapshot') } } },
  ]);
  const tips = await Tip.aggregate<{ _id: Types.ObjectId; minor: number }>([
    { $match: { tenantId: scope.tenantObjectId, ...branchFilter(scope), ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}) } },
    { $lookup: { from: SaleTransaction.collection.name, localField: 'transactionId', foreignField: '_id', as: 'sale' } },
    { $unwind: '$sale' },
    { $match: { 'sale.status': { $in: [...OPEN_SALE_STATUSES] }, 'sale.createdAt': { $gte: scope.start, $lt: scope.end } } },
    { $group: { _id: '$employeeId', minor: { $sum: roundField('$amount') } } },
  ]);
  const appointments = await Appointment.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        tenantId: scope.tenantObjectId,
        status: 'COMPLETED',
        scheduledAt: { $gte: scope.start, $lt: scope.end },
        ...branchFilter(scope),
        ...(scope.employeeId ? { barberEmployeeId: new Types.ObjectId(scope.employeeId) } : {}),
      },
    },
    { $group: { _id: '$barberEmployeeId', count: { $sum: 1 } } },
  ]);
  const attendance = await Attendance.aggregate<Record<string, unknown>>([
    {
      $match: {
        tenantId: scope.tenantObjectId,
        attendanceDate: { $gte: scope.from, $lte: scope.to },
        ...branchFilter(scope),
        ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}),
      },
    },
    {
      $group: {
        _id: '$employeeId',
        late: { $sum: { $cond: [{ $eq: ['$status', 'LATE'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
      },
    },
  ]);
  const leave = await LeaveRequest.aggregate<{ _id: Types.ObjectId; days: number }>([
    {
      $match: {
        tenantId: scope.tenantObjectId,
        status: 'APPROVED',
        startDate: { $lte: scope.to },
        endDate: { $gte: scope.from },
        ...branchFilter(scope),
        ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}),
      },
    },
    { $group: { _id: '$employeeId', days: { $sum: '$totalDays' } } },
  ]);
  const showPay = canSeePayrollAmounts(scope.access);
  const payroll = showPay
    ? await Payroll.aggregate<{ _id: Types.ObjectId; netMinor: number }>([
        {
          $match: {
            tenantId: scope.tenantObjectId,
            status: 'PAID',
            periodStart: { $lte: scope.to },
            periodEnd: { $gte: scope.from },
            ...branchFilter(scope),
            ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}),
          },
        },
        { $group: { _id: '$employeeId', netMinor: { $sum: roundField('$netSalary') } } },
      ])
    : [];
  const ids = [
    ...sales.map((row) => row['_id']),
    ...commission.map((row) => row._id),
    ...tips.map((row) => row._id),
    ...appointments.map((row) => row._id),
    ...attendance.map((row) => row['_id']),
    ...leave.map((row) => row._id),
  ];
  const names = await employeeNames(scope.access.tenantId, ids);
  const keys = new Set(ids.filter(Boolean).map((id) => String(id)));
  const columns = ['label', 'net', 'transactions', 'services', 'visits', 'completedAppointments', 'commission', 'tips', 'late', 'absences', 'approvedLeave'];
  if (showPay) {
    columns.push('payrollPaid');
  }
  const rows = [...keys].map((id) => {
    const sale = sales.find((row) => String(row['_id']) === id);
    const charged = minor(sale?.['chargedMinor']);
    const refunded = minor(sale?.['refundMinor']);
    const row: ReportRow = {
      label: names.get(id) ?? '',
      net: fromMinor(charged - refunded),
      transactions: minor(sale?.['transactions']),
      services: minor(sale?.['services']),
      visits: Array.isArray(sale?.['customers']) ? sale['customers'].length : 0,
      completedAppointments: appointments.find((item) => String(item._id) === id)?.count ?? 0,
      commission: money(commission.find((item) => String(item._id) === id)?.minor),
      tips: money(tips.find((item) => String(item._id) === id)?.minor),
      late: minor(attendance.find((item) => String(item['_id']) === id)?.['late']),
      absences: minor(attendance.find((item) => String(item['_id']) === id)?.['absent']),
      approvedLeave: leave.find((item) => String(item._id) === id)?.days ?? 0,
    };
    if (showPay) {
      row['payrollPaid'] = money(payroll.find((item) => String(item._id) === id)?.netMinor);
    }
    return row;
  });
  rows.sort((left, right) => Number(right['net']) - Number(left['net']));
  const notes = ['commission_from_snapshots', 'tips_are_separate', 'completed_appointments_are_not_sales'];
  if (!showPay) {
    notes.push('payroll_amounts_hidden');
  }
  return payload(scope, columns, rows, { employees: rows.length }, notes);
}

async function customerReport(scope: Scope): Promise<ReportPayload> {
  const summary = await salesSummary(scope);
  if (scope.section === 'preferences') {
    const report = await lineSales(scope, 'SERVICE');
    return { ...report, kind: 'customers', notes: [...SALES_NOTES, 'spending_uses_transactions'] };
  }
  if (scope.section === 'products') {
    const report = await lineSales(scope, 'PRODUCT');
    return { ...report, kind: 'customers', notes: [...SALES_NOTES, 'spending_uses_transactions'] };
  }
  if (scope.section === 'packages') {
    const rows = await CustomerPackage.aggregate<Record<string, unknown>>([
      { $match: { tenantId: scope.tenantObjectId, purchasedAt: { $gte: scope.start, $lt: scope.end } } },
      {
        $group: {
          _id: '$packageTemplateId',
          en: { $first: '$packageNameSnapshot.en' },
          ar: { $first: '$packageNameSnapshot.ar' },
          purchased: { $sum: 1 },
          priceMinor: { $sum: roundField('$purchasePrice') },
          used: { $sum: { $sum: '$items.usedQuantity' } },
          remaining: { $sum: { $sum: '$items.remainingQuantity' } },
        },
      },
      { $sort: { purchased: -1 } },
    ]);
    return payload(
      scope,
      ['label', 'purchased', 'used', 'remaining', 'price'],
      rows.map((row) => ({
        label: labelOf(row['en'], row['ar'], scope.lang),
        purchased: minor(row['purchased']),
        used: minor(row['used']),
        remaining: minor(row['remaining']),
        price: money(row['priceMinor']),
      })),
      summary,
      ['package_price_is_not_added_to_net_sales', 'spending_uses_transactions'],
    );
  }
  const rows = await SaleTransaction.aggregate<Record<string, unknown>>([
    ...buildStages(scope),
    {
      $group: {
        _id: '$customerId',
        chargedMinor: { $sum: roundField('$totalAmount') },
        refundMinor: { $sum: roundField('$refundedAmount') },
        visits: { $sum: 1 },
      },
    },
    { $sort: scope.section === 'frequent' ? { visits: -1 } : { chargedMinor: -1 } },
    { $limit: 100 },
  ]);
  const customers = await Customer.find({ tenantId: scope.access.tenantId, _id: { $in: rows.map((row) => row['_id']) } }).select('fullName');
  const names = new Map(customers.map((customer) => [String(customer._id), customer.fullName]));
  return payload(
    scope,
    ['label', 'visits', 'net', 'average'],
    rows.map((row) => {
      const netMinor = minor(row['chargedMinor']) - minor(row['refundMinor']);
      const visits = minor(row['visits']);
      return {
        label: names.get(String(row['_id'])) ?? '',
        visits,
        net: fromMinor(netMinor),
        average: visits ? fromMinor(Math.round(netMinor / visits)) : 0,
      };
    }),
    summary,
    ['spending_uses_transactions', 'new_customers_are_first_paid_sale'],
  );
}

async function inventoryReport(scope: Scope): Promise<ReportPayload> {
  const stockMatch: Record<string, unknown> = { tenantId: scope.tenantObjectId, ...branchFilter(scope) };
  const [valuation] = await Stock.aggregate<{ minor: number; low: number; out: number }>([
    { $match: stockMatch },
    {
      $group: {
        _id: null,
        minor: { $sum: { $round: [{ $multiply: ['$averageCost', '$quantityOnHand', 100] }, 0] } },
        low: { $sum: { $cond: [{ $and: [{ $gt: ['$quantityOnHand', 0] }, { $lte: ['$quantityOnHand', '$minimumStock'] }] }, 1, 0] } },
        out: { $sum: { $cond: [{ $eq: ['$quantityOnHand', 0] }, 1, 0] } },
      },
    },
  ]);
  const metrics = { valuation: money(valuation?.minor), lowStock: minor(valuation?.low), outOfStock: minor(valuation?.out) };
  const notes = ['valuation_uses_branch_average_cost', 'valuation_is_current'];
  if (scope.section === 'movements' || scope.section === 'returns' || scope.section === 'adjustments') {
    const types = scope.section === 'returns' ? ['PURCHASE_RETURN'] : scope.section === 'adjustments' ? ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] : [];
    const filter: Record<string, unknown> = {
      tenantId: scope.tenantObjectId,
      createdAt: { $gte: scope.start, $lt: scope.end },
      ...branchFilter(scope),
    };
    if (types.length) {
      filter['movementType'] = { $in: types };
    }
    const total = await StockMovement.countDocuments(filter);
    const movements = await StockMovement.find(filter).sort({ createdAt: -1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
    const products = await Product.find({ tenantId: scope.access.tenantId, _id: { $in: movements.map((row) => row.productId) } }).select('name sku');
    const names = new Map(products.map((product) => [String(product._id), product]));
    return payload(
      scope,
      ['label', 'sku', 'type', 'quantity', 'unitCost'],
      movements.map((row) => {
        const product = names.get(String(row.productId));
        return {
          label: product ? labelOf(product.name.en, product.name.ar, scope.lang) : '',
          sku: product?.sku ?? '',
          type: row.movementType,
          quantity: row.quantity,
          unitCost: row.unitCost,
        };
      }),
      metrics,
      notes,
      total,
    );
  }
  if (scope.section === 'purchases') {
    const filter = { tenantId: scope.tenantObjectId, purchaseDate: { $gte: scope.start, $lt: scope.end }, ...branchFilter(scope) };
    const total = await Purchase.countDocuments(filter);
    const purchases = await Purchase.find(filter).sort({ purchaseDate: -1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
    const suppliers = await Supplier.find({ tenantId: scope.access.tenantId, _id: { $in: purchases.map((row) => row.supplierId) } }).select('name');
    const names = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name]));
    return payload(
      scope,
      ['number', 'supplier', 'total', 'paid', 'remaining', 'paymentStatus'],
      purchases.map((row) => ({
        number: row.purchaseNumber,
        supplier: names.get(String(row.supplierId)) ?? '',
        total: row.totalAmount,
        paid: row.paidAmount,
        remaining: row.remainingAmount,
        paymentStatus: row.paymentStatus,
      })),
      metrics,
      [...notes, 'supplier_payments_are_not_pos_sales'],
      total,
    );
  }
  if (scope.section === 'transfers') {
    const branchClause = scope.branchObjectId
      ? { $or: [{ sourceBranchId: scope.branchObjectId }, { destinationBranchId: scope.branchObjectId }] }
      : scope.branchObjectIds
        ? { $or: [{ sourceBranchId: { $in: scope.branchObjectIds } }, { destinationBranchId: { $in: scope.branchObjectIds } }] }
        : {};
    const filter = { tenantId: scope.tenantObjectId, createdAt: { $gte: scope.start, $lt: scope.end }, ...branchClause };
    const total = await StockTransfer.countDocuments(filter);
    const transfers = await StockTransfer.find(filter).sort({ createdAt: -1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
    return payload(
      scope,
      ['number', 'status', 'lines'],
      transfers.map((row) => ({ number: row.transferNumber, status: row.status, lines: row.items.length })),
      metrics,
      notes,
      total,
    );
  }
  if (scope.section === 'sales') {
    const report = await lineSales(scope, 'PRODUCT');
    return { ...report, kind: 'inventory', metrics: { ...report.metrics, ...metrics }, notes: [...report.notes, ...notes] };
  }
  const filter: Record<string, unknown> = { ...stockMatch };
  if (scope.section === 'low') {
    filter['$expr'] = { $and: [{ $gt: ['$quantityOnHand', 0] }, { $lte: ['$quantityOnHand', '$minimumStock'] }] };
  } else if (scope.section === 'out') {
    filter['quantityOnHand'] = 0;
  }
  const total = await Stock.countDocuments(filter);
  const stocks = await Stock.find(filter).sort({ quantityOnHand: 1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
  const products = await Product.find({ tenantId: scope.access.tenantId, _id: { $in: stocks.map((row) => row.productId) } }).select('name sku');
  const names = new Map(products.map((product) => [String(product._id), product]));
  return payload(
    scope,
    ['label', 'sku', 'onHand', 'minimum', 'averageCost', 'value'],
    stocks.map((row) => {
      const product = names.get(String(row.productId));
      return {
        label: product ? labelOf(product.name.en, product.name.ar, scope.lang) : '',
        sku: product?.sku ?? '',
        onHand: row.quantityOnHand,
        minimum: row.minimumStock,
        averageCost: row.averageCost,
        value: fromMinor(toMinor(row.averageCost) * row.quantityOnHand),
      };
    }),
    metrics,
    notes,
    total,
  );
}

async function attendanceReport(scope: Scope): Promise<ReportPayload> {
  const match: Record<string, unknown> = {
    tenantId: scope.tenantObjectId,
    attendanceDate: { $gte: scope.from, $lte: scope.to },
    ...branchFilter(scope),
    ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}),
  };
  const counts = await Attendance.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const early = await Attendance.countDocuments({ ...match, earlyLeaveMinutes: { $gt: 0 } });
  const metrics: Record<string, number> = { earlyDepartures: early };
  for (const row of counts) {
    metrics[row._id] = row.count;
  }
  if (scope.section === 'monthly') {
    const rows = await Attendance.aggregate<Record<string, unknown>>([
      { $match: match },
      {
        $group: {
          _id: { $substrBytes: ['$attendanceDate', 0, 7] },
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'LATE'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
          early: { $sum: { $cond: [{ $gt: ['$earlyLeaveMinutes', 0] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return payload(
      scope,
      ['period', 'present', 'late', 'absent', 'early'],
      rows.map((row) => ({ period: String(row['_id']), present: minor(row['present']), late: minor(row['late']), absent: minor(row['absent']), early: minor(row['early']) })),
      metrics,
      ['attendance_is_not_payroll'],
    );
  }
  if (scope.section === 'balances') {
    const year = Number(scope.to.slice(0, 4));
    const balances = await LeaveBalance.find({ tenantId: scope.access.tenantId, year, ...(scope.employeeId ? { employeeId: scope.employeeId } : {}) }).limit(200);
    const people = await employeeNames(scope.access.tenantId, balances.map((row) => row.employeeId));
    const types = await LeaveType.find({ tenantId: scope.access.tenantId, _id: { $in: balances.map((row) => row.leaveTypeId) } }).select('name');
    const typeNames = new Map(types.map((type) => [String(type._id), type.name]));
    return payload(
      scope,
      ['employee', 'leaveType', 'entitled', 'used', 'pending', 'remaining'],
      balances.map((row) => ({
        employee: people.get(String(row.employeeId)) ?? '',
        leaveType: labelOf(typeNames.get(String(row.leaveTypeId))?.en, typeNames.get(String(row.leaveTypeId))?.ar, scope.lang),
        entitled: row.entitled,
        used: row.used,
        pending: row.pending,
        remaining: fromMinor(toMinor(row.entitled) + toMinor(row.adjustmentDays) - toMinor(row.used) - toMinor(row.pending)),
      })),
      metrics,
      ['leave_remaining_uses_stored_balance'],
    );
  }
  if (scope.section === 'leave') {
    const requests = await LeaveRequest.find({
      tenantId: scope.access.tenantId,
      status: 'APPROVED',
      startDate: { $lte: scope.to },
      endDate: { $gte: scope.from },
      ...branchFilter(scope),
      ...(scope.employeeId ? { employeeId: scope.employeeId } : {}),
    }).limit(200);
    const people = await employeeNames(scope.access.tenantId, requests.map((row) => row.employeeId));
    return payload(
      scope,
      ['employee', 'start', 'end', 'days', 'status'],
      requests.map((row) => ({ employee: people.get(String(row.employeeId)) ?? '', start: row.startDate, end: row.endDate, days: row.totalDays, status: row.status })),
      metrics,
      ['approved_leave_only'],
    );
  }
  const narrowed = { ...match };
  if (scope.section === 'late') {
    narrowed['status'] = 'LATE';
  } else if (scope.section === 'early') {
    narrowed['earlyLeaveMinutes'] = { $gt: 0 };
  } else if (scope.section === 'absence') {
    narrowed['status'] = 'ABSENT';
  }
  const total = await Attendance.countDocuments(narrowed);
  const rows = await Attendance.find(narrowed).sort({ attendanceDate: -1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
  const people = await employeeNames(scope.access.tenantId, rows.map((row) => row.employeeId));
  return payload(
    scope,
    ['date', 'employee', 'status', 'lateMinutes', 'earlyMinutes'],
    rows.map((row) => ({
      date: row.attendanceDate,
      employee: people.get(String(row.employeeId)) ?? '',
      status: row.status,
      lateMinutes: row.lateMinutes,
      earlyMinutes: row.earlyLeaveMinutes,
    })),
    metrics,
    ['attendance_is_not_payroll'],
    total,
  );
}

async function payrollReport(scope: Scope): Promise<ReportPayload> {
  const showPay = canSeePayrollAmounts(scope.access);
  const filter: Record<string, unknown> = {
    tenantId: scope.tenantObjectId,
    periodStart: { $lte: scope.to },
    periodEnd: { $gte: scope.from },
    ...branchFilter(scope),
    ...(scope.employeeId ? { employeeId: new Types.ObjectId(scope.employeeId) } : {}),
  };
  if (scope.payrollStatus) {
    filter['status'] = scope.payrollStatus;
  }
  if (scope.section === 'corrections') {
    filter['correctsPayrollId'] = { $ne: null };
  }
  const statusCounts = await Payroll.aggregate<{ _id: string; count: number }>([
    { $match: { ...filter, status: filter['status'] ?? { $exists: true } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const metrics: Record<string, number> = {};
  for (const row of statusCounts) {
    metrics[row._id] = row.count;
  }
  const notes = ['payroll_status_is_explicit', 'paid_rows_are_finalized_records'];
  if (!showPay) {
    notes.push('payroll_amounts_hidden');
  }
  const payrolls = await Payroll.find(filter).sort({ periodStart: -1 }).limit(200);
  const people = await employeeNames(scope.access.tenantId, payrolls.map((row) => row.employeeId));
  if (scope.section === 'components') {
    if (!showPay) {
      return payload(scope, ['employee', 'period', 'status'], payrolls.map((row) => ({ employee: people.get(String(row.employeeId)) ?? '', period: `${row.periodStart} ${row.periodEnd}`, status: row.status })), metrics, notes);
    }
    const rows: ReportRow[] = [];
    for (const row of payrolls) {
      const employee = people.get(String(row.employeeId)) ?? '';
      const components: Array<[string, number]> = [
        ['basic', row.basicSalary],
        ['commission', row.commission],
        ['tips', row.tips],
        ['allowances', row.allowances],
        ['overtime', row.overtime],
        ['attendanceDeductions', row.attendanceDeductions],
        ['fixedDeductions', row.fixedDeductions],
        ['otherDeductions', row.otherDeductions],
        ['bonuses', row.bonuses],
        ['net', row.netSalary],
      ];
      for (const [component, amount] of components) {
        rows.push({ employee, period: `${row.periodStart} ${row.periodEnd}`, status: row.status, component, amount });
      }
    }
    return payload(scope, ['employee', 'period', 'status', 'component', 'amount'], rows, metrics, notes);
  }
  const columns = showPay ? ['employee', 'period', 'status', 'basic', 'commission', 'tips', 'allowances', 'deductions', 'net', 'correction'] : ['employee', 'period', 'status', 'correction'];
  return payload(
    scope,
    columns,
    payrolls.map((row) => {
      const base: ReportRow = {
        employee: people.get(String(row.employeeId)) ?? '',
        period: `${row.periodStart} ${row.periodEnd}`,
        status: row.status,
        correction: row.correctsPayrollId ? 'yes' : 'no',
      };
      if (showPay) {
        base['basic'] = row.basicSalary;
        base['commission'] = row.commission;
        base['tips'] = row.tips;
        base['allowances'] = row.allowances;
        base['deductions'] = fromMinor(toMinor(row.attendanceDeductions) + toMinor(row.fixedDeductions) + toMinor(row.otherDeductions));
        base['net'] = row.netSalary;
      }
      return base;
    }),
    metrics,
    notes,
  );
}

async function supplierTotal(scope: Scope): Promise<number> {
  const [row] = await PurchasePayment.aggregate<{ minor: number }>([
    { $match: { tenantId: scope.tenantObjectId, paidAt: { $gte: scope.start, $lt: scope.end }, ...branchFilter(scope) } },
    { $group: { _id: null, minor: { $sum: roundField('$amount') } } },
  ]);
  return money(row?.minor);
}

async function cashierReport(scope: Scope): Promise<ReportPayload> {
  const ownOnly = !scope.access.isOwner && !can(scope.access, 'reports.view');
  const filter: Record<string, unknown> = {
    tenantId: scope.tenantObjectId,
    openedAt: { $gte: scope.start, $lt: scope.end },
    ...branchFilter(scope),
  };
  if (ownOnly) {
    filter['cashierUserId'] = new Types.ObjectId(scope.access.userId);
  }
  const shifts = await CashierShift.find(filter).sort({ openedAt: -1 }).limit(200);
  const rows = shifts.map((shift) => {
    const formula = fromMinor(toMinor(shift.openingBalance) + toMinor(shift.cashSales) + toMinor(shift.cashTips) - toMinor(shift.cashRefunds));
    return {
      status: shift.status,
      opening: shift.openingBalance,
      cashSales: shift.cashSales,
      cashTips: shift.cashTips,
      cashRefunds: shift.cashRefunds,
      expectedCash: shift.expectedCash ?? formula,
      formulaExpected: formula,
      actualCash: shift.actualCash ?? 0,
      difference: shift.difference ?? 0,
    };
  });
  const suppliers = await supplierTotal(scope);
  const sum = (key: 'expectedCash' | 'actualCash' | 'difference' | 'cashSales') => fromMinor(rows.reduce((total, row) => total + toMinor(row[key]), 0));
  return payload(scope, ['status', 'opening', 'cashSales', 'cashTips', 'cashRefunds', 'expectedCash', 'formulaExpected', 'actualCash', 'difference'], rows, {
    shifts: rows.length,
    expectedCash: sum('expectedCash'),
    actualCash: sum('actualCash'),
    difference: sum('difference'),
    cashSales: sum('cashSales'),
    supplierPayments: suppliers,
  }, ['expected_cash_is_opening_plus_cash_sales_plus_cash_tips_minus_cash_refunds', 'supplier_payments_are_separate']);
}

async function supplierReport(scope: Scope): Promise<ReportPayload> {
  const filter = { tenantId: scope.tenantObjectId, paidAt: { $gte: scope.start, $lt: scope.end }, ...branchFilter(scope) };
  const total = await PurchasePayment.countDocuments(filter);
  const payments = await PurchasePayment.find(filter).sort({ paidAt: -1 }).skip((scope.page - 1) * scope.pageSize).limit(scope.pageSize);
  const suppliers = await Supplier.find({ tenantId: scope.access.tenantId, _id: { $in: payments.map((row) => row.supplierId) } }).select('name');
  const names = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name]));
  const purchases = await Purchase.find({ tenantId: scope.access.tenantId, _id: { $in: payments.map((row) => row.purchaseId) } }).select('purchaseNumber');
  const numbers = new Map(purchases.map((purchase) => [String(purchase._id), purchase.purchaseNumber]));
  return payload(
    scope,
    ['supplier', 'purchase', 'method', 'amount'],
    payments.map((row) => ({
      supplier: names.get(String(row.supplierId)) ?? '',
      purchase: numbers.get(String(row.purchaseId)) ?? '',
      method: row.method,
      amount: row.amount,
    })),
    { supplierPayments: await supplierTotal(scope), payments: total },
    ['supplier_payments_are_not_pos_sales', 'supplier_payments_are_not_in_expected_cash'],
    total,
  );
}

export async function runReport(access: TenantAccess, kind: string, query: ReportQuery): Promise<ReportPayload> {
  assertKind(access, kind);
  const scope = await resolveScope(access, kind, query);
  if (kind === 'dashboard') {
    return payload(scope, [], [], await salesSummary(scope), SALES_NOTES, 0);
  }
  if (kind === 'daily') {
    return groupedSales(scope, '%Y-%m-%d');
  }
  if (kind === 'weekly') {
    return groupedSales(scope, '%G-W%V');
  }
  if (kind === 'monthly') {
    return groupedSales(scope, '%Y-%m');
  }
  if (kind === 'branches') {
    return branchSales(scope);
  }
  if (kind === 'employees') {
    const report = await performanceReport(scope);
    return { ...report, kind: 'employees', columns: ['label', 'net', 'transactions', 'services', 'visits', 'commission', 'tips'] };
  }
  if (kind === 'services') {
    return lineSales(scope, 'SERVICE');
  }
  if (kind === 'products') {
    return lineSales(scope, 'PRODUCT');
  }
  if (kind === 'categories') {
    return categorySales(scope);
  }
  if (kind === 'payments') {
    return paymentReport(scope);
  }
  if (kind === 'discounts') {
    return discountReport(scope);
  }
  if (kind === 'refunds') {
    return refundReport(scope);
  }
  if (kind === 'transactions') {
    return transactionReport(scope);
  }
  if (kind === 'performance') {
    return performanceReport(scope);
  }
  if (kind === 'customers') {
    return customerReport(scope);
  }
  if (kind === 'inventory') {
    return inventoryReport(scope);
  }
  if (kind === 'attendance') {
    return attendanceReport(scope);
  }
  if (kind === 'payroll') {
    return payrollReport(scope);
  }
  if (kind === 'cashier') {
    return cashierReport(scope);
  }
  return supplierReport(scope);
}

export async function reportHome(access: TenantAccess): Promise<Record<string, unknown>> {
  const today = todayInZone((await Tenant.findById(access.tenantId).select('timezone'))?.timezone || 'Africa/Cairo');
  const monthStart = `${today.slice(0, 8)}01`;
  const query: ReportQuery = {
    from: monthStart,
    to: today,
    branchId: '',
    employeeId: '',
    categoryId: '',
    paymentMethod: '',
    status: '',
    section: '',
    payrollStatus: '',
    lang: 'en',
    page: 1,
    pageSize: 8,
  };
  const scope = await resolveScope(access, 'home', query);
  const result: Record<string, unknown> = { generatedAt: new Date().toISOString(), from: monthStart, to: today, currency: scope.currency };
  if (canSeeSales(access)) {
    result['sales'] = await salesSummary(scope);
    const branches = await branchSales(scope);
    result['branches'] = branches.rows;
  }
  if (can(access, 'reports.customers') || canSeeSales(access)) {
    const sales = (result['sales'] as { newCustomers: number; returningCustomers: number } | undefined) ?? (await salesSummary(scope));
    result['customers'] = { newCustomers: sales.newCustomers, returningCustomers: sales.returningCustomers };
  }
  if (can(access, 'reports.employees')) {
    const people = await performanceReport({ ...scope, kind: 'performance' });
    result['employees'] = people.rows.slice(0, 5);
  }
  if (can(access, 'reports.inventory') || can(access, 'stock-alerts.view')) {
    const stock = await inventoryReport({ ...scope, kind: 'inventory' });
    result['inventory'] = can(access, 'reports.inventory') ? stock.metrics : { lowStock: stock.metrics['lowStock'], outOfStock: stock.metrics['outOfStock'] };
  }
  if (can(access, 'reports.payroll') || can(access, 'payroll.view')) {
    const payroll = await payrollReport({ ...scope, kind: 'payroll', access });
    result['payroll'] = payroll.metrics;
    if (canSeePayrollAmounts(access)) {
      result['payrollRows'] = payroll.rows.slice(0, 5);
    }
  }
  if (can(access, 'reports.attendance') || can(access, 'attendance.view')) {
    const todayScope = await resolveScope(access, 'attendance', { ...query, from: today, to: today });
    const attendance = await attendanceReport(todayScope);
    result['attendance'] = attendance.metrics;
    result['appointmentsToday'] = can(access, 'appointments.view') || access.isOwner
      ? await Appointment.countDocuments({
          tenantId: scope.tenantObjectId,
          scheduledAt: { $gte: todayScope.start, $lt: todayScope.end },
          status: { $nin: ['CANCELLED', 'NO_SHOW'] },
          ...branchFilter(todayScope),
        })
      : null;
  } else if (can(access, 'appointments.view')) {
    const todayScope = await resolveScope(access, 'attendance', { ...query, from: today, to: today });
    result['appointmentsToday'] = await Appointment.countDocuments({
      tenantId: scope.tenantObjectId,
      scheduledAt: { $gte: todayScope.start, $lt: todayScope.end },
      status: { $nin: ['CANCELLED', 'NO_SHOW'] },
      ...branchFilter(todayScope),
    });
  }
  if (canAny(access, ['reports.cashier', 'cashier-shifts.view'])) {
    const cashier = await cashierReport({ ...scope, kind: 'cashier' });
    result['cashier'] = { metrics: cashier.metrics, shifts: cashier.rows.slice(0, 5) };
  }
  if (canAny(access, ['purchases.view', 'reports.view', 'reports.sales'])) {
    result['supplierPayments'] = await supplierTotal(scope);
  }
  return result;
}
