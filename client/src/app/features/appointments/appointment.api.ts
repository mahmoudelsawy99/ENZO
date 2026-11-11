import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  AppointmentHistoryRecord,
  AppointmentPayload,
  AppointmentRecord,
  PageResult,
  QueueEntryRecord,
  WalkInPayload,
} from './appointment.models';

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
export class AppointmentApi {
  private readonly api = inject(ApiClient);

  list(params: {
    page: number;
    pageSize: number;
    search?: string;
    branchId?: string;
    status?: string;
    type?: string;
    barberEmployeeId?: string;
    from?: string;
    to?: string;
  }) {
    return this.api.get<PageResult<AppointmentRecord>>(`/v1/appointments${query(params)}`);
  }

  get(id: string) {
    return this.api.get<{ data: AppointmentRecord }>(`/v1/appointments/${id}`);
  }

  history(id: string) {
    return this.api.get<{ data: AppointmentHistoryRecord[] }>(`/v1/appointments/${id}/history`);
  }

  create(body: AppointmentPayload) {
    return this.api.post<{ data: AppointmentRecord }>('/v1/appointments', body);
  }

  update(id: string, body: Omit<AppointmentPayload, 'branchId' | 'scheduledAt'>) {
    return this.api.put<{ data: AppointmentRecord }>(`/v1/appointments/${id}`, body);
  }

  reschedule(id: string, scheduledAt: string, reason: string) {
    return this.api.post<{ data: AppointmentRecord }>(`/v1/appointments/${id}/reschedule`, { scheduledAt, reason });
  }

  act(id: string, action: 'confirm' | 'check-in' | 'queue' | 'start' | 'complete' | 'cancel' | 'no-show', reason = '') {
    const body = action === 'cancel' || action === 'no-show' ? { reason } : {};
    return this.api.post<{ data: AppointmentRecord }>(`/v1/appointments/${id}/${action}`, body);
  }

  walkIn(body: WalkInPayload) {
    return this.api.post<{ data: AppointmentRecord }>('/v1/appointments/walk-in', body);
  }

  barbers(branchId: string) {
    return this.api.get<{ data: Array<{ id: string; fullName: string }> }>(`/v1/appointments/barbers${query({ branchId })}`);
  }

  queue(params: { branchId: string; queueDate: string; barberEmployeeId?: string; status?: string }) {
    return this.api.get<{ data: QueueEntryRecord[] }>(`/v1/queue${query(params)}`);
  }

  reorder(body: { branchId: string; queueDate: string; entryIds: string[] }) {
    return this.api.post<{ data: QueueEntryRecord[] }>('/v1/queue/reorder', body);
  }

  startQueue(id: string) {
    return this.api.post<{ data: AppointmentRecord }>(`/v1/queue/${id}/start`, {});
  }

  completeQueue(id: string) {
    return this.api.post<{ data: AppointmentRecord }>(`/v1/queue/${id}/complete`, {});
  }
}
