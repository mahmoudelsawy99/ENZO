export interface LocalizedName {
  en: string;
  ar: string;
}

export interface ProductCategory {
  id: string;
  name: LocalizedName;
  status: string;
}

export interface ProductRecord {
  id: string;
  name: LocalizedName;
  sku: string;
  barcode: string;
  description: LocalizedName;
  categoryId: string;
  brand: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock: number;
  image: string;
  status: string;
}

export interface StockRow {
  id: string;
  productId: string;
  productName: LocalizedName;
  sku: string;
  quantityOnHand: number;
  averageCost: number;
  minimumStock: number;
  sellingPrice: number;
  status: string;
  lastStockMovementAt: string;
}

export interface StockMovementRow {
  id: string;
  movementType: string;
  quantity: number;
  unitCost: number;
  referenceType: string;
  referenceId: string | null;
  notes: string;
  createdAt: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  notes: string;
  status: string;
  outstanding?: number;
  purchases?: PurchaseRow[];
}

export interface PurchaseRow {
  id: string;
  purchaseNumber: string;
  branchId?: string;
  totalAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  receiveStatus: string;
  purchaseDate: string;
}

export interface PurchaseDetail extends PurchaseRow {
  supplierId: string;
  supplierName: string;
  items: Array<{ productId: string; productName: LocalizedName; sku: string; quantity: number; unitCost: number; totalCost: number; returnedQuantity: number }>;
  subtotal: number;
  discount: number;
  paidAmount: number;
  notes: string;
  payments: Array<{ id: string; method: string; amount: number; referenceNumber: string; paidAt: string }>;
  returns: Array<{ id: string; productId: string; quantity: number; unitCost: number; reason: string; createdAt: string }>;
}

export interface TransferRecord {
  id: string;
  transferNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  items: Array<{ productId: string; productName: LocalizedName; sku: string; quantity: number; unitCost: number }>;
  status: string;
  notes: string;
  sentAt: string;
  receivedAt: string;
  createdAt: string;
}

export interface StockAlert {
  id: string;
  branchId: string;
  productId: string;
  productName: LocalizedName;
  sku: string;
  kind: string;
  status: string;
  quantityOnHand: number;
  minimumStock: number;
}

export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
