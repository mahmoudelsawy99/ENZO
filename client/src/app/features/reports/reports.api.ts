import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ApiClient } from '../../core/api/api-client';

export interface ReportPayload {
  kind: string;
  generatedAt: string;
  timezone: string;
  currency: string;
  tenantName: string;
  branchName: string;
  filters: Record<string, string>;
  metrics: Record<string, number>;
  columns: string[];
  rows: Array<Record<string, string | number>>;
  page: number;
  pageSize: number;
  total: number;
  notes: string[];
}

export interface HomePayload {
  generatedAt: string;
  from: string;
  to: string;
  currency: string;
  sales?: Record<string, number>;
  branches?: Array<Record<string, string | number>>;
  customers?: { newCustomers: number; returningCustomers: number };
  employees?: Array<Record<string, string | number>>;
  inventory?: Record<string, number>;
  payroll?: Record<string, number>;
  payrollRows?: Array<Record<string, string | number>>;
  attendance?: Record<string, number>;
  appointmentsToday?: number | null;
  cashier?: { metrics: Record<string, number>; shifts: Array<Record<string, string | number>> };
  supplierPayments?: number;
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);

  home() {
    return this.api.get<{ data: HomePayload }>('/v1/reports/home');
  }

  report(kind: string, query: string) {
    return this.api.get<{ data: ReportPayload }>(`/v1/reports/${kind}?${query}`);
  }

  export(kind: string, query: string) {
    return this.http.get(`${environment.apiUrl}/v1/reports/${kind}/export?${query}`, { responseType: 'blob', observe: 'response' });
  }
}
