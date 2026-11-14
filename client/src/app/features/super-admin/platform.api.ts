import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import type { ApiResponse } from '../../core/auth/auth.models';
import type { PlatformDashboard, TenantList, TenantPayload, TenantRecord, TenantStatus } from './platform.models';

@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly api = inject(ApiClient);

  dashboard(): Promise<PlatformDashboard> {
    return firstValueFrom(this.api.get<ApiResponse<PlatformDashboard>>('/v1/platform/dashboard')).then((response) => response.data);
  }

  list(query: { page: number; pageSize: number; search: string; status: string; sort: string; order: string }): Promise<TenantList> {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
      search: query.search,
      sort: query.sort,
      order: query.order,
    });
    if (query.status) {
      params.set('status', query.status);
    }
    return firstValueFrom(this.api.get<TenantList>(`/v1/platform/tenants?${params.toString()}`));
  }

  get(id: string): Promise<TenantRecord> {
    return firstValueFrom(this.api.get<ApiResponse<TenantRecord>>(`/v1/platform/tenants/${id}`)).then((response) => response.data);
  }

  create(body: TenantPayload, idempotencyKey: string): Promise<TenantRecord> {
    return firstValueFrom(this.api.post<ApiResponse<TenantRecord>>('/v1/platform/tenants', body, { 'Idempotency-Key': idempotencyKey })).then(
      (response) => response.data,
    );
  }

  update(id: string, body: Omit<TenantPayload, 'owner'> & { owner: Omit<TenantPayload['owner'], 'password'> }): Promise<TenantRecord> {
    return firstValueFrom(this.api.put<ApiResponse<TenantRecord>>(`/v1/platform/tenants/${id}`, body)).then((response) => response.data);
  }

  setStatus(id: string, status: TenantStatus): Promise<TenantRecord> {
    return firstValueFrom(this.api.patch<ApiResponse<TenantRecord>>(`/v1/platform/tenants/${id}/status`, { status })).then((response) => response.data);
  }

  uploadLogo(file: File): Promise<string> {
    return firstValueFrom(this.api.postFile('/v1/platform/uploads/logo', file, 'logo')).then((response) => response.data.logo);
  }
}
