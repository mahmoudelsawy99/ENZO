/** Money and payroll formulas shared by the local database and the tests. */

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function commissionAmount(kind: string, value: number, lineTotal: number, quantity: number): number {
  if (kind === 'FIXED') {
    return roundMoney(value * quantity);
  }
  return roundMoney((lineTotal * value) / 100);
}

export interface SaleTotals {
  packageDiscount: number;
  manualDiscount: number;
  totalDiscount: number;
  totalAmount: number;
  paidAmount: number;
  amountDue: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
}

export function saleTotals(subtotal: number, packageDiscount: number, manualDiscount: number, paid: number): SaleTotals {
  const base = roundMoney(Math.max(0, subtotal));
  const safePackage = roundMoney(Math.min(Math.max(0, packageDiscount), base));
  const afterPackage = roundMoney(base - safePackage);
  const safeManual = roundMoney(Math.min(Math.max(0, manualDiscount), afterPackage));
  const totalDiscount = roundMoney(safePackage + safeManual);
  const totalAmount = roundMoney(Math.max(0, base - totalDiscount));
  const paidAmount = roundMoney(Math.max(0, paid));
  const amountDue = roundMoney(Math.max(0, totalAmount - paidAmount));
  const status = amountDue === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
  return {
    packageDiscount: safePackage,
    manualDiscount: safeManual,
    totalDiscount,
    totalAmount,
    paidAmount,
    amountDue,
    status,
  };
}

/** Moving-average cost after a receipt. Quantity already on hand stays at its previous average. */
export function averageCost(onHand: number, currentAverage: number, incoming: number, unitCost: number): number {
  const nextQty = onHand + incoming;
  if (nextQty <= 0) {
    return roundMoney(unitCost);
  }
  return roundMoney((Math.max(0, onHand) * currentAverage + incoming * unitCost) / nextQty);
}

export interface PayrollParts {
  basicSalary: number;
  commission: number;
  tips: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  attendanceDeductions: number;
  fixedDeductions: number;
  otherDeductions: number;
}

export function payrollNet(parts: PayrollParts): number {
  return roundMoney(
    parts.basicSalary +
      parts.commission +
      parts.tips +
      parts.allowances +
      parts.overtime +
      parts.bonuses -
      parts.attendanceDeductions -
      parts.fixedDeductions -
      parts.otherDeductions,
  );
}
