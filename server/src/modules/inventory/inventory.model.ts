import { Schema, model } from 'mongoose';

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'PURCHASE_RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;
export const PURCHASE_PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export const RECEIVE_STATUSES = ['NOT_RECEIVED', 'RECEIVED'] as const;
export const TRANSFER_STATUSES = ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'] as const;
export const ALERT_KINDS = ['LOW', 'OUT'] as const;
export const ALERT_STATUSES = ['ACTIVE', 'DISMISSED', 'RESOLVED'] as const;

const nameSchema = new Schema(
  { en: { type: String, required: true, trim: true, maxlength: 120 }, ar: { type: String, default: '', trim: true, maxlength: 120 } },
  { _id: false },
);

const categorySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: nameSchema, required: true },
    nameKeyEn: { type: String, required: true, trim: true, maxlength: 120 },
    nameKeyAr: { type: String, default: '', trim: true, maxlength: 120 },
    status: { type: String, required: true, enum: PRODUCT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);
categorySchema.index({ tenantId: 1, nameKeyEn: 1 }, { unique: true });

const productSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: nameSchema, required: true },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    barcode: { type: String, default: '', trim: true, maxlength: 64 },
    description: {
      type: new Schema(
        { en: { type: String, default: '', trim: true, maxlength: 120 }, ar: { type: String, default: '', trim: true, maxlength: 120 } },
        { _id: false },
      ),
      required: true,
    },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ProductCategory', required: true, index: true },
    brand: { type: String, default: '', trim: true, maxlength: 80 },
    unit: { type: String, required: true, trim: true, maxlength: 20 },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    minimumStock: { type: Number, required: true, min: 0, default: 0 },
    image: { type: String, default: '', trim: true, maxlength: 200 },
    status: { type: String, required: true, enum: PRODUCT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);
productSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
productSchema.index({ tenantId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $gt: '' } } });
productSchema.index({ tenantId: 1, status: 1, 'name.en': 1 });

const stockSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    quantityOnHand: { type: Number, required: true, min: 0, default: 0 },
    averageCost: { type: Number, required: true, min: 0, default: 0 },
    minimumStock: { type: Number, required: true, min: 0, default: 0 },
    lastStockMovementAt: { type: Date, default: null },
  },
  { timestamps: true },
);
stockSchema.index({ tenantId: 1, branchId: 1, productId: 1 }, { unique: true });
stockSchema.index({ tenantId: 1, branchId: 1, updatedAt: -1 });

const movementSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    movementType: { type: String, required: true, enum: MOVEMENT_TYPES },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    referenceType: { type: String, required: true, trim: true, maxlength: 40 },
    referenceId: { type: Schema.Types.ObjectId, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index(
  { tenantId: 1, movementType: 1, referenceType: 1, referenceId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: { $type: 'objectId' },
      movementType: { $in: ['PURCHASE', 'SALE', 'SALE_RETURN', 'TRANSFER_IN', 'TRANSFER_OUT'] },
    },
  },
);
movementSchema.index({ tenantId: 1, branchId: 1, productId: 1, createdAt: -1 });

const supplierSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    email: { type: String, default: '', trim: true, maxlength: 120 },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    taxNumber: { type: String, default: '', trim: true, maxlength: 40 },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, required: true, enum: PRODUCT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);
supplierSchema.index({ tenantId: 1, name: 1 });

const purchaseItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productNameSnapshot: { type: nameSchema, required: true },
    skuSnapshot: { type: String, required: true, trim: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const purchaseSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    purchaseNumber: { type: String, required: true, trim: true, maxlength: 32 },
    items: { type: [purchaseItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    paymentStatus: { type: String, required: true, enum: PURCHASE_PAYMENT_STATUSES, default: 'UNPAID' },
    receiveStatus: { type: String, required: true, enum: RECEIVE_STATUSES, default: 'NOT_RECEIVED' },
    purchaseDate: { type: Date, required: true },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
purchaseSchema.index({ tenantId: 1, purchaseNumber: 1 }, { unique: true });
purchaseSchema.index({ tenantId: 1, supplierId: 1, purchaseDate: -1 });

const purchasePaymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    method: { type: String, required: true, enum: ['CASH', 'VISA', 'WALLET', 'INSTAPAY', 'OTHER'] },
    amount: { type: Number, required: true, min: 0.01 },
    referenceNumber: { type: String, default: '', trim: true, maxlength: 80 },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const transferItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productNameSnapshot: { type: nameSchema, required: true },
    skuSnapshot: { type: String, required: true, trim: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const transferSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    transferNumber: { type: String, required: true, trim: true, maxlength: 32 },
    sourceBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    destinationBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    items: { type: [transferItemSchema], required: true },
    status: { type: String, required: true, enum: TRANSFER_STATUSES, default: 'DRAFT' },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
transferSchema.index({ tenantId: 1, transferNumber: 1 }, { unique: true });

const alertSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    kind: { type: String, required: true, enum: ALERT_KINDS },
    status: { type: String, required: true, enum: ALERT_STATUSES, default: 'ACTIVE' },
    quantityOnHand: { type: Number, required: true, min: 0 },
    minimumStock: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
alertSchema.index(
  { tenantId: 1, branchId: 1, productId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

export const ProductCategory = model('ProductCategory', categorySchema);
export const Product = model('Product', productSchema);
export const Stock = model('Stock', stockSchema);
export const StockMovement = model('StockMovement', movementSchema);
export const Supplier = model('Supplier', supplierSchema);
export const Purchase = model('Purchase', purchaseSchema);
export const PurchasePayment = model('PurchasePayment', purchasePaymentSchema);
export const StockTransfer = model('StockTransfer', transferSchema);
export const StockAlert = model('StockAlert', alertSchema);
