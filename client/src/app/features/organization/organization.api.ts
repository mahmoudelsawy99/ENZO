import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  AccessSnapshot,
  ActivityEntry,
  BranchPayload,
  BranchRecord,
  CatalogItem,
  CommissionConfig,
  CommissionRuleView,
  EmployeePayload,
  EmployeeRecord,
  PageResult,
  PermissionModule,
  RoleAssignment,
  RoleRecord,
  UserRecord,
} from './organization.models';

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
export class OrganizationApi {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);

  access() {
    return this.api.get<{ data: AccessSnapshot }>('/v1/access');
  }

  branches(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<BranchRecord>>(`/v1/branches${query(params)}`);
  }

  branch(id: string) {
    return this.api.get<{ data: BranchRecord }>(`/v1/branches/${id}`);
  }

  saveBranch(body: BranchPayload, id?: string) {
    return id ? this.api.put<{ data: BranchRecord }>(`/v1/branches/${id}`, body) : this.api.post<{ data: BranchRecord }>('/v1/branches', body);
  }

  branchStatus(id: string, status: BranchRecord['status']) {
    return this.api.patch<{ data: BranchRecord }>(`/v1/branches/${id}/status`, { status });
  }

  employees(params: { page: number; pageSize: number; search?: string; status?: string; branchId?: string }) {
    return this.api.get<PageResult<EmployeeRecord>>(`/v1/employees${query(params)}`);
  }

  employee(id: string) {
    return this.api.get<{ data: EmployeeRecord }>(`/v1/employees/${id}`);
  }

  saveEmployee(body: EmployeePayload, id?: string) {
    return id
      ? this.api.put<{ data: EmployeeRecord }>(`/v1/employees/${id}`, body)
      : this.api.post<{ data: EmployeeRecord }>('/v1/employees', body);
  }

  employeeStatus(id: string, status: EmployeeRecord['status']) {
    return this.api.patch<{ data: EmployeeRecord }>(`/v1/employees/${id}/status`, { status });
  }

  assignBranch(employeeId: string, branchId: string, isPrimary: boolean) {
    return this.api.post<{ data: EmployeeRecord }>(`/v1/employees/${employeeId}/branches`, { branchId, isPrimary });
  }

  removeBranch(employeeId: string, branchId: string) {
    return this.http.delete<{ data: EmployeeRecord }>(`${this.api.baseUrl}/v1/employees/${employeeId}/branches/${branchId}`);
  }

  primaryBranch(employeeId: string, branchId: string) {
    return this.api.patch<{ data: EmployeeRecord }>(`/v1/employees/${employeeId}/branches/primary`, { branchId });
  }

  activity(employeeId: string) {
    return this.api.get<{ data: ActivityEntry[] }>(`/v1/employees/${employeeId}/activity`);
  }

  uploadPhoto(file: File) {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<{ data: { profileImage: string } }>(`${this.api.baseUrl}/v1/employees/photo`, body);
  }

  employmentTypes() {
    return this.api.get<{ data: CatalogItem[] }>('/v1/employees/employment-types');
  }

  jobTitles() {
    return this.api.get<{ data: CatalogItem[] }>('/v1/employees/job-titles');
  }

  addEmploymentType(name: string) {
    return this.api.post<{ data: CatalogItem }>('/v1/employees/employment-types', { name });
  }

  addJobTitle(name: string) {
    return this.api.post<{ data: CatalogItem }>('/v1/employees/job-titles', { name });
  }

  employmentTypeStatus(id: string, status: CatalogItem['status']) {
    return this.api.patch<{ data: CatalogItem }>(`/v1/employees/employment-types/${id}`, { status });
  }

  jobTitleStatus(id: string, status: CatalogItem['status']) {
    return this.api.patch<{ data: CatalogItem }>(`/v1/employees/job-titles/${id}`, { status });
  }

  roles(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<RoleRecord>>(`/v1/roles${query(params)}`);
  }

  role(id: string) {
    return this.api.get<{ data: RoleRecord }>(`/v1/roles/${id}`);
  }

  saveRole(body: { name: string; description: string; permissions: string[] }, id?: string) {
    return id ? this.api.put<{ data: RoleRecord }>(`/v1/roles/${id}`, body) : this.api.post<{ data: RoleRecord }>('/v1/roles', body);
  }

  roleStatus(id: string, status: RoleRecord['status']) {
    return this.api.patch<{ data: RoleRecord }>(`/v1/roles/${id}/status`, { status });
  }

  duplicateRole(id: string, name: string) {
    return this.api.post<{ data: RoleRecord }>(`/v1/roles/${id}/duplicate`, { name });
  }

  permissions() {
    return this.api.get<{ data: PermissionModule[] }>('/v1/permissions');
  }

  users(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<UserRecord>>(`/v1/users${query(params)}`);
  }

  user(id: string) {
    return this.api.get<{ data: UserRecord }>(`/v1/users/${id}`);
  }

  saveUser(body: { fullName: string; email: string; phone: string; password?: string }, id?: string) {
    if (id) {
      return this.api.put<{ data: UserRecord }>(`/v1/users/${id}`, { fullName: body.fullName, email: body.email, phone: body.phone });
    }
    return this.api.post<{ data: UserRecord }>('/v1/users', body);
  }

  userStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return this.api.patch<{ data: UserRecord }>(`/v1/users/${id}/status`, { status });
  }

  resetPassword(id: string, password: string) {
    return this.http.post(`${this.api.baseUrl}/v1/users/${id}/reset-password`, { password }, { responseType: 'text' });
  }

  revokeSessions(id: string) {
    return this.http.post(`${this.api.baseUrl}/v1/users/${id}/sessions/revoke`, {}, { responseType: 'text' });
  }

  linkEmployee(userId: string, employeeId: string | null) {
    return this.api.put<{ data: UserRecord }>(`/v1/users/${userId}/employee`, { employeeId });
  }

  saveUserRoles(userId: string, assignments: Array<{ roleId: string; branchScope: 'ALL' | 'SELECTED'; branchIds: string[] }>) {
    return this.api.post<{ data: RoleAssignment[] }>(`/v1/users/${userId}/roles`, { assignments });
  }

  commissions() {
    return this.api.get<{ data: CommissionConfig }>('/v1/commissions');
  }

  saveDefaultCommission(kind: 'PERCENTAGE' | 'FIXED', value: number) {
    return this.api.put<{ data: CommissionConfig }>('/v1/commissions/default', { kind, value });
  }

  saveServiceCommission(body: { serviceCode: string; serviceName: string; kind: 'PERCENTAGE' | 'FIXED'; value: number }) {
    return this.api.put<{ data: CommissionConfig }>('/v1/commissions/services', body);
  }

  disableServiceCommission(id: string) {
    return this.api.patch<{ data: CommissionConfig }>(`/v1/commissions/services/${id}/status`, {});
  }

  saveEmployeeCommission(employeeId: string, body: { serviceCode: string; kind: 'PERCENTAGE' | 'FIXED'; value: number }) {
    return this.api.put<{ data: CommissionRuleView[] }>(`/v1/employees/${employeeId}/commissions`, body);
  }
}
