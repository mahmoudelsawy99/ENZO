import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  AttendanceCounts,
  AttendancePolicy,
  AttendanceRow,
  DeviceSyncLog,
  FingerprintDevice,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PayrollRecord,
  WorkSchedule,
} from './workforce.models';

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
export class WorkforceApi {
  private readonly api = inject(ApiClient);

  summary(branchId: string, date: string) {
    return this.api.get<{ data: AttendanceCounts }>(`/v1/attendance/summary${query({ branchId, date })}`);
  }

  attendance(branchId: string, from: string, to: string, employeeId = '') {
    return this.api.get<{ counts: AttendanceCounts; data: AttendanceRow[] }>(`/v1/attendance${query({ branchId, from, to, employeeId })}`);
  }

  checkIn(employeeId: string, branchId: string, notes: string) {
    return this.api.post<{ data: AttendanceRow }>('/v1/attendance/check-in', { employeeId, branchId, notes });
  }

  checkOut(employeeId: string, branchId: string, notes: string) {
    return this.api.post<{ data: AttendanceRow }>('/v1/attendance/check-out', { employeeId, branchId, notes });
  }

  correct(id: string, body: { checkInTime: string; checkOutTime: string; notes: string }) {
    return this.api.patch<{ data: AttendanceRow }>(`/v1/attendance/${id}`, body);
  }

  closeDay(branchId: string, date: string) {
    return this.api.post<{ data: { created: number } }>('/v1/attendance/close-day', { branchId, date });
  }

  policy(branchId = '') {
    return this.api.get<{ data: AttendancePolicy }>(`/v1/attendance/policy${query({ branchId })}`);
  }

  savePolicy(body: Omit<AttendancePolicy, 'id'>) {
    return this.api.put<{ data: AttendancePolicy }>('/v1/attendance/policy', body);
  }

  schedules(employeeId = '', branchId = '') {
    return this.api.get<{ data: WorkSchedule[] }>(`/v1/schedules${query({ employeeId, branchId })}`);
  }

  saveSchedule(body: Omit<WorkSchedule, 'id'>, id?: string) {
    return id ? this.api.put<{ data: { id: string } }>(`/v1/schedules/${id}`, body) : this.api.post<{ data: { id: string } }>('/v1/schedules', body);
  }

  devices() {
    return this.api.get<{ data: FingerprintDevice[] }>('/v1/fingerprint-devices');
  }

  registerDevice(body: { branchId: string; name: string; serialNumber: string; provider: string; deviceType: string }) {
    return this.api.post<{ data: { device: FingerprintDevice; apiKey: string } }>('/v1/fingerprint-devices', body);
  }

  deviceStatus(id: string, status: 'ENABLED' | 'DISABLED') {
    return this.api.post<{ data: FingerprintDevice }>(`/v1/fingerprint-devices/${id}/status`, { status });
  }

  mapDevice(id: string, employeeId: string, externalEmployeeId: string) {
    return this.api.post<{ data: { id: string } }>(`/v1/fingerprint-devices/${id}/employees`, { employeeId, externalEmployeeId });
  }

  syncDevice(id: string) {
    return this.api.post<{ data: { status: string; eventCount: number; failures: string[] } }>(`/v1/fingerprint-devices/${id}/sync`, {});
  }

  syncLogs() {
    return this.api.get<{ data: DeviceSyncLog[] }>('/v1/fingerprint-devices/logs');
  }

  leaveTypes() {
    return this.api.get<{ data: LeaveType[] }>('/v1/leave-types');
  }

  saveLeaveType(body: Omit<LeaveType, 'id'>, id?: string) {
    return id ? this.api.put<{ data: LeaveType }>(`/v1/leave-types/${id}`, body) : this.api.post<{ data: LeaveType }>('/v1/leave-types', body);
  }

  leaveRequests(status = '', employeeId = '') {
    return this.api.get<{ data: LeaveRequest[] }>(`/v1/leave-requests${query({ status, employeeId })}`);
  }

  createLeave(body: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; portion: string; reason: string; override: boolean }) {
    return this.api.post<{ data: LeaveRequest }>('/v1/leave-requests', body);
  }

  decideLeave(id: string, status: 'APPROVED' | 'REJECTED', rejectionReason: string, override: boolean) {
    return this.api.post<{ data: LeaveRequest }>(`/v1/leave-requests/${id}/decision`, { status, rejectionReason, override });
  }

  cancelLeave(id: string) {
    return this.api.post<{ data: LeaveRequest }>(`/v1/leave-requests/${id}/cancel`, {});
  }

  balances(employeeId: string, year: number) {
    return this.api.get<{ data: LeaveBalance[] }>(`/v1/leave-balances${query({ employeeId, year })}`);
  }

  adjustBalance(body: { employeeId: string; leaveTypeId: string; year: number; days: number; reason: string }) {
    return this.api.post<{ data: { remaining: number } }>('/v1/leave-balances/adjustments', body);
  }

  payroll(periodStart = '', periodEnd = '', status = '') {
    return this.api.get<{ data: PayrollRecord[] }>(`/v1/payroll${query({ periodStart, periodEnd, status })}`);
  }

  payrollOne(id: string) {
    return this.api.get<{ data: PayrollRecord }>(`/v1/payroll/${id}`);
  }

  generatePayroll(body: { periodStart: string; periodEnd: string; branchId: string; employeeIds: string[] }) {
    return this.api.post<{ data: PayrollRecord[] }>('/v1/payroll/generate', body);
  }

  adjustPayroll(id: string, body: { kind: 'BONUS' | 'DEDUCTION'; label: string; amount: number; reason: string }) {
    return this.api.post<{ data: PayrollRecord }>(`/v1/payroll/${id}/adjustments`, body);
  }

  submitPayroll(id: string) {
    return this.api.post<{ data: PayrollRecord }>(`/v1/payroll/${id}/submit`, {});
  }

  approvePayroll(id: string) {
    return this.api.post<{ data: PayrollRecord }>(`/v1/payroll/${id}/approve`, {});
  }

  payPayroll(id: string, method: string, reference: string) {
    return this.api.post<{ data: PayrollRecord }>(`/v1/payroll/${id}/pay`, { method, reference });
  }

  correctPayroll(id: string) {
    return this.api.post<{ data: PayrollRecord }>(`/v1/payroll/${id}/corrections`, {});
  }
}
