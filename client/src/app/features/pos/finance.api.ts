import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  CheckoutContext,
  CommissionRow,
  PageResult,
  ReadyAppointment,
  RefundRow,
  SaleRecord,
  ShiftRecord,
  TransactionRow,
} from './finance.models';

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly api = inject(ApiClient);

  ready(params: { page: number; pageSize: number; search?: string; branchId?: string }) {
    return this.api.get<PageResult<ReadyAppointment>>(`/v1/pos/appointments${query(params)}`);
  }

  context(appointmentId: string) {
    return this.api.get<{ data: CheckoutContext }>(`/v1/pos/appointments/${appointmentId}`);
  }

  createOrder(body: {
    branchId: string;
    barberEmployeeId: string;
    extraBarberIds?: string[];
    customer: { fullName: string; phone: string };
    services: Array<{ serviceId: string; quantity: number }>;
    idempotencyKey: string;
    additionalDiscount: number;
    payments: Array<{ method: string; amount: number; referenceNumber: string }>;
  }) {
    return this.api.post<{ data: SaleRecord }>('/v1/pos/orders', body);
  }

  checkout(body: {
    appointmentId: string;
    idempotencyKey: string;
    redemptions: Array<{ customerPackageId: string; serviceId: string; quantity: number }>;
    additionalDiscount: number;
    payments: Array<{ method: string; amount: number; referenceNumber: string }>;
    tips: Array<{ employeeId: string; amount: number; method: string; referenceNumber: string }>;
    products?: Array<{ productId: string; quantity: number }>;
  }) {
    return this.api.post<{ data: SaleRecord }>('/v1/pos/checkout', body);
  }

  transactions(params: { page: number; pageSize: number; search?: string; branchId?: string }) {
    return this.api.get<PageResult<TransactionRow>>(`/v1/transactions${query(params)}`);
  }

  transaction(id: string) {
    return this.api.get<{ data: SaleRecord }>(`/v1/transactions/${id}`);
  }

  refunds(branchId?: string) {
    return this.api.get<{ data: RefundRow[] }>(`/v1/refunds${query({ branchId })}`);
  }

  requestRefund(body: { transactionId: string; paymentId: string; amount: number; reason: string; method: string; referenceNumber: string; restock?: boolean }) {
    return this.api.post<{ data: { id: string; status: string; amount: number } }>('/v1/refunds', body);
  }

  approveRefund(id: string) {
    return this.api.post<{ data: { id: string; status: string; amount: number } }>(`/v1/refunds/${id}/approve`, {});
  }

  currentShift(branchId: string) {
    return this.api.get<{ data: ShiftRecord | null }>(`/v1/cashier-shifts/current${query({ branchId })}`);
  }

  shifts(branchId: string, page: number, pageSize: number) {
    return this.api.get<PageResult<ShiftRecord>>(`/v1/cashier-shifts${query({ branchId, page, pageSize })}`);
  }

  openShift(body: { branchId: string; shiftType: string; openingBalance: number }) {
    return this.api.post<{ data: ShiftRecord }>('/v1/cashier-shifts', body);
  }

  closeShift(id: string, actualCash: number) {
    return this.api.post<{ data: ShiftRecord }>(`/v1/cashier-shifts/${id}/close`, { actualCash });
  }

  commissions(branchId?: string) {
    return this.api.get<{ data: CommissionRow[] }>(`/v1/commission-reports/summary${query({ branchId })}`);
  }
}
