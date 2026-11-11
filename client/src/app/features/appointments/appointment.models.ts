export type AppointmentType = 'BOOKING' | 'WALK_IN';

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'WAITING'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type QueueStatus = 'WAITING' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';

export interface AppointmentServiceLine {
  serviceId: string;
  serviceName: { en: string; ar: string };
  unitPrice: number;
  quantity: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  lineTotal: number;
}

export interface AppointmentRecord {
  id: string;
  appointmentNumber: string;
  branchId: string;
  customerId: string;
  customerName: string;
  barberEmployeeId: string;
  barberName: string;
  extraBarberIds?: string[];
  type: AppointmentType;
  scheduledAt: string;
  services: AppointmentServiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: AppointmentStatus;
  notes: string;
  cancellationReason: string;
  checkedInAt: string;
  startedAt: string;
  completedAt: string;
  cancelledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentHistoryRecord {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string | null;
  changedByName: string;
  createdAt: string;
}

export interface QueueEntryRecord {
  id: string;
  appointmentId: string;
  appointmentNumber: string;
  customerId: string;
  customerName: string;
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

export interface AppointmentPayload {
  branchId: string;
  customerId: string;
  barberEmployeeId: string;
  extraBarberIds?: string[];
  scheduledAt: string;
  services: Array<{ serviceId: string; quantity: number }>;
  discount: number;
  notes: string;
}

export interface WalkInPayload {
  branchId: string;
  customerId?: string;
  customer?: {
    fullName: string;
    phone: string;
    email: string;
    dateOfBirth: string;
    gender: '' | 'MALE' | 'FEMALE';
    address: string;
    notes: string;
  };
  barberEmployeeId: string;
  extraBarberIds?: string[];
  services: Array<{ serviceId: string; quantity: number }>;
  notes: string;
}

export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
