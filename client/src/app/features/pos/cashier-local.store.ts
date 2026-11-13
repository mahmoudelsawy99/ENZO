import { Injectable } from '@angular/core';
import type { QueueEntryRecord } from '../appointments/appointment.models';
import { SHOP_BARBERS } from '../appointments/shop-barbers';
import { SHOP_SERVICES, mergeServices } from '../appointments/shop-services';
import type { ServiceRecord } from '../catalog/catalog.models';
import type { SaleRecord, ShiftRecord } from './finance.models';

const SERVICES_KEY = 'enzo.cashier.services';
const ORDERS_KEY = 'enzo.cashier.orders';
const QUEUE_KEY = 'enzo.cashier.queue';
const SHIFTS_KEY = 'enzo.cashier.shifts';

export interface LocalOrderInput {
  branchId: string;
  barberEmployeeId: string;
  extraBarberIds?: string[];
  customer: { fullName: string; phone: string };
  services: Array<{ serviceId: string; quantity: number }>;
  idempotencyKey: string;
  additionalDiscount: number;
  payments: Array<{ method: string; amount: number; referenceNumber: string }>;
}

export interface LocalWalkInInput {
  branchId: string;
  barberEmployeeId: string;
  extraBarberIds?: string[];
  customerName: string;
  companions?: string[];
  services: Array<{ serviceId: string; quantity: number }>;
  notes?: string;
  queueDate?: string;
}

@Injectable({ providedIn: 'root' })
export class CashierLocalStore {
  services(): ServiceRecord[] {
    const cached = readJson<ServiceRecord[]>(SERVICES_KEY, []);
    return mergeServices(cached.length > 0 ? cached : []);
  }

  rememberServices(remote: ServiceRecord[]): ServiceRecord[] {
    const merged = mergeServices(remote);
    writeJson(SERVICES_KEY, merged);
    return merged;
  }

  orders(): SaleRecord[] {
    return readJson<SaleRecord[]>(ORDERS_KEY, []);
  }

  saveOrder(input: LocalOrderInput): SaleRecord {
    const catalog = this.services();
    const now = new Date().toISOString();
    const id = localId('ord');
    const items = input.services.map((line) => {
      const service = catalog.find((item) => item.id === line.serviceId);
      const unitPrice = service?.price ?? 0;
      const quantity = line.quantity || 1;
      return {
        itemType: 'SERVICE',
        serviceId: line.serviceId,
        productId: null,
        sku: '',
        serviceName: service?.name ?? { en: line.serviceId, ar: line.serviceId },
        quantity,
        unitPrice,
        discount: 0,
        lineTotal: Math.round(unitPrice * quantity * 100) / 100,
      };
    });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const manualDiscount = Math.round((input.additionalDiscount || 0) * 100) / 100;
    const totalAmount = Math.max(0, Math.round((subtotal - manualDiscount) * 100) / 100);
    const paidAmount = Math.round(input.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
    const sale: SaleRecord = {
      id,
      transactionNumber: `LOCAL-${stamp()}`,
      branchId: input.branchId,
      appointmentId: '',
      customerId: '',
      customerName: input.customer.fullName,
      customerPhone: input.customer.phone,
      cashierName: 'Local cashier',
      items,
      subtotal,
      packageDiscount: 0,
      manualDiscount,
      totalDiscount: manualDiscount,
      totalAmount,
      paidAmount,
      refundedAmount: 0,
      amountDue: 0,
      status: 'PAID',
      tipTotal: 0,
      createdAt: now,
      payments: input.payments.map((payment, index) => ({
        id: `${id}-pay-${index + 1}`,
        method: payment.method,
        amount: payment.amount,
        refundedAmount: 0,
        referenceNumber: payment.referenceNumber,
        status: 'CAPTURED',
        receivedAt: now,
      })),
      refunds: [],
      tips: [],
      commissions: [],
    };
    const next = [sale, ...this.orders()];
    writeJson(ORDERS_KEY, next);
    this.addCashSales(input.branchId, cashFrom(input.payments));
    return sale;
  }

  queue(branchId: string, queueDate: string): QueueEntryRecord[] {
    return readJson<QueueEntryRecord[]>(QUEUE_KEY, []).filter(
      (entry) => entry.branchId === branchId && entry.queueDate === queueDate,
    );
  }

  saveWalkIn(input: LocalWalkInInput): QueueEntryRecord {
    const catalog = this.services();
    const barber = SHOP_BARBERS.find((item) => item.id === input.barberEmployeeId);
    const queueDate = input.queueDate || todayCairo();
    const existing = this.queue(input.branchId, queueDate);
    const now = new Date().toISOString();
    const id = localId('que');
    const entry: QueueEntryRecord = {
      id,
      appointmentId: id,
      appointmentNumber: `LOCAL-Q-${stamp()}`,
      customerId: '',
      customerName: input.customerName,
      companions: input.companions ?? [],
      barberEmployeeId: input.barberEmployeeId,
      barberName: barber?.fullName ?? '',
      branchId: input.branchId,
      queueDate,
      position: existing.length + 1,
      status: 'WAITING',
      joinedAt: now,
      startedAt: '',
      completedAt: '',
      services: input.services.map((line) => {
        const service = catalog.find((item) => item.id === line.serviceId);
        return {
          serviceName: service?.name ?? { en: line.serviceId, ar: line.serviceId },
          quantity: line.quantity || 1,
        };
      }),
    };
    const all = readJson<QueueEntryRecord[]>(QUEUE_KEY, []);
    writeJson(QUEUE_KEY, [entry, ...all]);
    return entry;
  }

  rememberQueue(branchId: string, queueDate: string, remote: QueueEntryRecord[]): QueueEntryRecord[] {
    const others = readJson<QueueEntryRecord[]>(QUEUE_KEY, []).filter(
      (entry) => !(entry.branchId === branchId && entry.queueDate === queueDate),
    );
    const localOnly = this.queue(branchId, queueDate).filter((entry) => entry.id.startsWith('local-'));
    const byId = new Map<string, QueueEntryRecord>();
    for (const entry of [...remote, ...localOnly]) {
      byId.set(entry.id, entry);
    }
    const merged = [...byId.values()].sort((left, right) => left.position - right.position);
    writeJson(QUEUE_KEY, [...others, ...merged]);
    return merged;
  }

  updateQueueStatus(id: string, status: QueueEntryRecord['status']): QueueEntryRecord | null {
    const all = readJson<QueueEntryRecord[]>(QUEUE_KEY, []);
    const index = all.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: QueueEntryRecord = {
      ...all[index],
      status,
      startedAt: status === 'IN_SERVICE' ? now : all[index].startedAt,
      completedAt: status === 'COMPLETED' ? now : all[index].completedAt,
    };
    all[index] = updated;
    writeJson(QUEUE_KEY, all);
    return updated;
  }

  reorderQueue(branchId: string, queueDate: string, orderedIds: string[]): QueueEntryRecord[] {
    const day = this.queue(branchId, queueDate);
    const byId = new Map(day.map((entry) => [entry.id, entry]));
    const ordered = orderedIds
      .map((id, index) => {
        const entry = byId.get(id);
        return entry ? { ...entry, position: index + 1 } : null;
      })
      .filter((entry): entry is QueueEntryRecord => entry !== null);
    const others = readJson<QueueEntryRecord[]>(QUEUE_KEY, []).filter(
      (entry) => !(entry.branchId === branchId && entry.queueDate === queueDate),
    );
    writeJson(QUEUE_KEY, [...others, ...ordered]);
    return ordered;
  }

  shifts(branchId: string): ShiftRecord[] {
    return readJson<ShiftRecord[]>(SHIFTS_KEY, []).filter((shift) => shift.branchId === branchId);
  }

  currentShift(branchId: string): ShiftRecord | null {
    return this.shifts(branchId).find((shift) => shift.status === 'OPEN') ?? null;
  }

  rememberShifts(branchId: string, current: ShiftRecord | null, history: ShiftRecord[]): void {
    const others = readJson<ShiftRecord[]>(SHIFTS_KEY, []).filter((shift) => shift.branchId !== branchId);
    const localOpen = this.shifts(branchId).filter((shift) => shift.id.startsWith('local-') && shift.status === 'OPEN');
    const remote = current ? [current, ...history.filter((shift) => shift.id !== current.id)] : history;
    const byId = new Map<string, ShiftRecord>();
    for (const shift of [...remote, ...localOpen]) {
      byId.set(shift.id, shift);
    }
    writeJson(SHIFTS_KEY, [...others, ...byId.values()]);
  }

  openShift(body: { branchId: string; shiftType: string; openingBalance: number }): ShiftRecord {
    const existing = this.currentShift(body.branchId);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const shift: ShiftRecord = {
      id: localId('shf'),
      branchId: body.branchId,
      shiftType: body.shiftType,
      openingBalance: body.openingBalance,
      openedAt: now,
      closedAt: '',
      cashSales: 0,
      cashTips: 0,
      cashRefunds: 0,
      expectedCash: body.openingBalance,
      actualCash: null,
      difference: null,
      status: 'OPEN',
    };
    writeJson(SHIFTS_KEY, [shift, ...readJson<ShiftRecord[]>(SHIFTS_KEY, [])]);
    return shift;
  }

  closeShift(id: string, actualCash: number): ShiftRecord | null {
    const all = readJson<ShiftRecord[]>(SHIFTS_KEY, []);
    const index = all.findIndex((shift) => shift.id === id);
    if (index < 0) {
      return null;
    }
    const open = all[index];
    const expected = open.expectedCash ?? open.openingBalance + open.cashSales + open.cashTips - open.cashRefunds;
    const closed: ShiftRecord = {
      ...open,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      expectedCash: expected,
      actualCash,
      difference: Math.round((actualCash - expected) * 100) / 100,
    };
    all[index] = closed;
    writeJson(SHIFTS_KEY, all);
    return closed;
  }

  private addCashSales(branchId: string, cash: number): void {
    if (cash <= 0) {
      return;
    }
    const all = readJson<ShiftRecord[]>(SHIFTS_KEY, []);
    const index = all.findIndex((shift) => shift.branchId === branchId && shift.status === 'OPEN');
    if (index < 0) {
      return;
    }
    const open = all[index];
    const cashSales = Math.round((open.cashSales + cash) * 100) / 100;
    const expectedCash = Math.round((open.openingBalance + cashSales + open.cashTips - open.cashRefunds) * 100) / 100;
    all[index] = { ...open, cashSales, expectedCash };
    writeJson(SHIFTS_KEY, all);
  }
}

function cashFrom(payments: Array<{ method: string; amount: number }>): number {
  return Math.round(payments.filter((payment) => payment.method === 'CASH').reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function localId(prefix: string): string {
  return `local-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function todayCairo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
