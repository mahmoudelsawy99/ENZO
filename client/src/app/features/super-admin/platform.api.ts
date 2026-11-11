import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../../core/auth/auth.models';
import type { PlatformDashboard, TenantList, TenantPayload, TenantRecord, TenantStatus } from './platform.models';

@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/platform`;

  dashboard(): Promise<PlatformDashboard> {
    return firstValueFrom(this.http.get<ApiResponse<PlatformDashboard>>(`${this.base}/dashboard`)).then((response) => response.data);
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
    return firstValueFrom(this.http.get<TenantList>(`${this.base}/tenants?${params.toString()}`));
  }

  get(id: string): Promise<TenantRecord> {
    return firstValueFrom(this.http.get<ApiResponse<TenantRecord>>(`${this.base}/tenants/${id}`)).then((response) => response.data);
  }

  create(body: TenantPayload, idempotencyKey: string): Promise<TenantRecord> {
    return firstValueFrom(
      this.http.post<ApiResponse<TenantRecord>>(`${this.base}/tenants`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ).then((response) => response.data);
  }

  update(id: string, body: Omit<TenantPayload, 'owner'> & { owner: Omit<TenantPayload['owner'], 'password'> }): Promise<TenantRecord> {
    return firstValueFrom(this.http.put<ApiResponse<TenantRecord>>(`${this.base}/tenants/${id}`, body)).then((response) => response.data);
  }

  setStatus(id: string, status: TenantStatus): Promise<TenantRecord> {
    return firstValueFrom(this.http.patch<ApiResponse<TenantRecord>>(`${this.base}/tenants/${id}/status`, { status })).then(
      (response) => response.data,
    );
  }

  uploadLogo(file: File): Promise<string> {
    const body = new FormData();
    body.set('logo', file);
    return firstValueFrom(this.http.post<ApiResponse<{ logo: string }>>(`${this.base}/uploads/logo`, body)).then((response) => response.data.logo);
  }
}
