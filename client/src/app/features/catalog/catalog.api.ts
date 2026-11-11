import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  CustomerNote,
  CustomerPackageRecord,
  CustomerPayload,
  CustomerRecord,
  CustomerStats,
  HistoryPage,
  PackagePayload,
  PackageRecord,
  PageResult,
  ServiceCategory,
  ServicePayload,
  ServiceRecord,
} from './catalog.models';

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
export class CatalogApi {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);

  categories() {
    return this.api.get<{ data: ServiceCategory[] }>('/v1/service-categories');
  }

  saveCategory(body: { name: { en: string; ar: string }; status: ServiceCategory['status'] }, id?: string) {
    return id
      ? this.api.put<{ data: ServiceCategory }>(`/v1/service-categories/${id}`, body)
      : this.api.post<{ data: ServiceCategory }>('/v1/service-categories', body);
  }

  services(params: { page: number; pageSize: number; search?: string; status?: string; categoryId?: string }) {
    return this.api.get<PageResult<ServiceRecord>>(`/v1/services${query(params)}`);
  }

  service(id: string) {
    return this.api.get<{ data: ServiceRecord }>(`/v1/services/${id}`);
  }

  saveService(body: ServicePayload, id?: string) {
    return id ? this.api.put<{ data: ServiceRecord }>(`/v1/services/${id}`, body) : this.api.post<{ data: ServiceRecord }>('/v1/services', body);
  }

  serviceStatus(id: string, status: ServiceRecord['status']) {
    return this.api.patch<{ data: ServiceRecord }>(`/v1/services/${id}/status`, { status });
  }

  serviceSettings() {
    return this.api.get<{ data: { maxCommissionPercent: number } }>('/v1/services/settings');
  }

  saveServiceSettings(maxCommissionPercent: number) {
    return this.api.put<{ data: { maxCommissionPercent: number } }>('/v1/services/settings', { maxCommissionPercent });
  }

  uploadServiceImage(file: File) {
    const body = new FormData();
    body.append('image', file);
    return this.http.post<{ data: { image: string } }>(`${this.api.baseUrl}/v1/services/image`, body);
  }

  customers(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<CustomerRecord>>(`/v1/customers${query(params)}`);
  }

  customer(id: string) {
    return this.api.get<{ data: CustomerRecord }>(`/v1/customers/${id}`);
  }

  saveCustomer(body: CustomerPayload, id?: string) {
    return id ? this.api.put<{ data: CustomerRecord }>(`/v1/customers/${id}`, body) : this.api.post<{ data: CustomerRecord }>('/v1/customers', body);
  }

  customerStatus(id: string, status: CustomerRecord['status']) {
    return this.api.patch<{ data: CustomerRecord }>(`/v1/customers/${id}/status`, { status });
  }

  customerSettings() {
    return this.api.get<{ data: { uniquePhone: boolean } }>('/v1/customers/settings');
  }

  saveCustomerSettings(uniquePhone: boolean) {
    return this.api.put<{ data: { uniquePhone: boolean } }>('/v1/customers/settings', { uniquePhone });
  }

  stats(id: string) {
    return this.api.get<{ data: CustomerStats }>(`/v1/customers/${id}/stats`);
  }

  visits(id: string) {
    return this.api.get<HistoryPage>(`/v1/customers/${id}/visits`);
  }

  serviceHistory(id: string) {
    return this.api.get<HistoryPage>(`/v1/customers/${id}/service-history`);
  }

  payments(id: string) {
    return this.api.get<HistoryPage>(`/v1/customers/${id}/payments`);
  }

  notes(id: string) {
    return this.api.get<{ data: CustomerNote[] }>(`/v1/customers/${id}/notes`);
  }

  addNote(id: string, content: string) {
    return this.api.post<{ data: CustomerNote }>(`/v1/customers/${id}/notes`, { content });
  }

  customerPackages(id: string) {
    return this.api.get<{ data: CustomerPackageRecord[] }>(`/v1/customers/${id}/packages`);
  }

  assignPackage(customerId: string, packageTemplateId: string) {
    return this.api.post<{ data: CustomerPackageRecord }>(`/v1/customers/${customerId}/packages`, { packageTemplateId });
  }

  packages(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<PackageRecord>>(`/v1/packages${query(params)}`);
  }

  package(id: string) {
    return this.api.get<{ data: PackageRecord }>(`/v1/packages/${id}`);
  }

  savePackage(body: PackagePayload, id?: string) {
    return id ? this.api.put<{ data: PackageRecord }>(`/v1/packages/${id}`, body) : this.api.post<{ data: PackageRecord }>('/v1/packages', body);
  }

  packageStatus(id: string, status: PackageRecord['status']) {
    return this.api.patch<{ data: PackageRecord }>(`/v1/packages/${id}/status`, { status });
  }

  uploadPackageImage(file: File) {
    const body = new FormData();
    body.append('image', file);
    return this.http.post<{ data: { image: string } }>(`${this.api.baseUrl}/v1/packages/image`, body);
  }
}
