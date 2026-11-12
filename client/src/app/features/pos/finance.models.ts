export interface LocalizedName {
  en: string;
  ar: string;
}

export interface ReadyAppointment {
  id: string;
  appointmentNumber: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  total: number;
  discount: number;
  completedAt: string;
  checkoutStatus: string;
}

export interface CheckoutService {
  serviceId: string;
  serviceName: LocalizedName;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CheckoutPackageItem {
  serviceId: string;
  serviceName: LocalizedName;
  remainingQuantity: number;
}

export interface CheckoutPackage {
  id: string;
  name: LocalizedName;
  status: string;
  expiresAt: string | null;
  items: CheckoutPackageItem[];
}

export interface CheckoutContext {
  appointment: {
    id: string;
    appointmentNumber: string;
    branchId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    barberEmployeeId: string;
    barberName: string;
    status: string;
    checkoutStatus: string;
    subtotal: number;
    discount: number;
    total: number;
    services: CheckoutService[];
  };
  packages: CheckoutPackage[];
}

export interface SalePayment {
  id: string;
  method: string;
  amount: number;
  refundedAmount: number;
  referenceNumber: string;
  status: string;
  receivedAt: string;
}

export interface SaleRefund {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  method: string;
  referenceNumber: string;
  status: string;
  createdAt: string;
  processedAt: string;
}

export interface SaleRecord {
  id: string;
  transactionNumber: string;
  branchId: string;
  appointmentId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  items: Array<{
    itemType: string;
    serviceId: string | null;
    productId?: string | null;
    sku?: string;
    serviceName: LocalizedName;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
  subtotal: number;
  packageDiscount: number;
  manualDiscount: number;
  totalDiscount: number;
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  amountDue: number;
  status: string;
  tipTotal: number;
  createdAt: string;
  payments: SalePayment[];
  refunds: SaleRefund[];
  tips: Array<{ id: string; employeeId: string; employeeName: string; amount: number; method: string }>;
  commissions: Array<{ employeeId: string; serviceId: string; commissionType: string; commissionRate: number; commissionAmount: number; source: string }>;
}

export interface TransactionRow {
  id: string;
  transactionNumber: string;
  customerName: string;
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  status: string;
  createdAt: string;
}

export interface RefundRow {
  id: string;
  transactionId: string;
  paymentId: string;
  amount: number;
  reason: string;
  method: string;
  status: string;
  createdAt: string;
}

export interface ShiftRecord {
  id: string;
  branchId: string;
  shiftType: string;
  openingBalance: number;
  openedAt: string;
  closedAt: string;
  cashSales: number;
  cashTips: number;
  cashRefunds: number;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  status: string;
}

export interface CommissionRow {
  employeeId: string;
  employeeName: string;
  commissionAmount: number;
  services: number;
}

export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
