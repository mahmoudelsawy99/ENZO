import { Schema, model, type InferSchemaType } from 'mongoose';

export const CHECKOUT_STATUSES = ['NOT_CHECKED_OUT', 'CHECKOUT_PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export const SALE_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const ITEM_TYPES = ['SERVICE', 'PRODUCT', 'PACKAGE_REDEMPTION'] as const;
export type SaleItemType = (typeof ITEM_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['RECORDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentRecordStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ['REQUESTED', 'PROCESSED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const SHIFT_TYPES = ['MORNING', 'EVENING'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

const nameSchema = new Schema(
  {
    en: { type: String, required: true, trim: true, maxlength: 120 },
    ar: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { _id: false },
);

/**
 * Financial lines are snapshots. Product rows deduct branch stock only after the sale is saved.
 */
const itemSchema = new Schema(
  {
    itemType: { type: String, required: true, enum: ITEM_TYPES },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    customerPackageId: { type: Schema.Types.ObjectId, ref: 'CustomerPackage', default: null },
    serviceNameSnapshot: { type: nameSchema, required: true },
    skuSnapshot: { type: String, default: '', trim: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceSnapshot: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const restockItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    transactionNumber: { type: String, required: true, trim: true, maxlength: 32 },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    cashierUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [itemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    packageDiscount: { type: Number, required: true, min: 0, default: 0 },
    manualDiscount: { type: Number, required: true, min: 0, default: 0 },
    totalDiscount: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    refundedAmount: { type: Number, required: true, min: 0, default: 0 },
    amountDue: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: SALE_STATUSES },
    paymentStatus: { type: String, required: true, enum: SALE_STATUSES },
    tipTotal: { type: Number, required: true, min: 0, default: 0 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);

saleSchema.index({ tenantId: 1, transactionNumber: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, appointmentId: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

const paymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'CashierShift', default: null },
    method: { type: String, required: true, enum: PAYMENT_METHODS },
    amount: { type: Number, required: true, min: 0 },
    refundedAmount: { type: Number, required: true, min: 0, default: 0 },
    referenceNumber: { type: String, default: '', trim: true, maxlength: 80 },
    /** Reserved for a future payment provider. Checkout records the method manually. */
    provider: { type: String, default: '', trim: true, maxlength: 40 },
    status: { type: String, required: true, enum: PAYMENT_STATUSES, default: 'RECORDED' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true },
);
paymentSchema.index({ tenantId: 1, branchId: 1, receivedAt: -1 });
paymentSchema.index({ tenantId: 1, transactionId: 1, method: 1 });

const refundSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'CashierShift', default: null },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    method: { type: String, required: true, enum: PAYMENT_METHODS },
    referenceNumber: { type: String, default: '', trim: true, maxlength: 80 },
    status: { type: String, required: true, enum: REFUND_STATUSES, default: 'REQUESTED' },
    restock: { type: Boolean, required: true, default: false },
    restockItems: { type: [restockItemSchema], default: [] },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
refundSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
refundSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const tipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'CashierShift', default: null },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true, enum: PAYMENT_METHODS },
    referenceNumber: { type: String, default: '', trim: true, maxlength: 80 },
    cashierUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const shiftSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    cashierUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shiftType: { type: String, required: true, enum: SHIFT_TYPES },
    openingBalance: { type: Number, required: true, min: 0 },
    openedAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    closingBalance: { type: Number, default: null },
    cashSales: { type: Number, required: true, min: 0, default: 0 },
    cashTips: { type: Number, required: true, min: 0, default: 0 },
    cashRefunds: { type: Number, required: true, min: 0, default: 0 },
    expectedCash: { type: Number, default: null },
    actualCash: { type: Number, default: null },
    difference: { type: Number, default: null },
    status: { type: String, required: true, enum: SHIFT_STATUSES, default: 'OPEN' },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

shiftSchema.index(
  { tenantId: 1, branchId: 1, cashierUserId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } },
);

const commissionSnapshotSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    commissionTypeSnapshot: { type: String, required: true, enum: ['PERCENTAGE', 'FIXED'] },
    commissionRateSnapshot: { type: Number, required: true, min: 0 },
    commissionAmountSnapshot: { type: Number, required: true, min: 0 },
    source: { type: String, required: true, enum: ['EMPLOYEE_SERVICE', 'SERVICE', 'TENANT', 'NONE'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const SaleTransaction = model('SaleTransaction', saleSchema);
export const Payment = model('Payment', paymentSchema);
export const Refund = model('Refund', refundSchema);
export const Tip = model('Tip', tipSchema);
export const CashierShift = model('CashierShift', shiftSchema);
export const CommissionSnapshot = model('CommissionSnapshot', commissionSnapshotSchema);

export type SaleDocument = InferSchemaType<typeof saleSchema> & { _id: Schema.Types.ObjectId };
