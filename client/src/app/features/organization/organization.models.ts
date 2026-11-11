export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

export interface DayHours {
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
}

export const WEEK_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface BranchRecord {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  workingHours: Record<WeekDay, DayHours>;
  managerUserId: string | null;
  managerName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface BranchPayload {
  name: string;
  code: string;
  address: string;
  phone: string;
  managerUserId: string;
  workingHours: Record<WeekDay, DayHours>;
}

export interface CatalogItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SalaryStructure {
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  basicSalary: number;
  allowances: number;
  tips: number;
  deductions: number;
}

export interface BranchAssignment {
  id: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  branchStatus: string;
  status: 'ACTIVE' | 'REMOVED';
  isPrimary: boolean;
  assignedAt: string;
  removedAt: string | null;
}

export interface CommissionRuleView {
  id: string;
  serviceCode: string;
  serviceName?: string;
  kind: 'PERCENTAGE' | 'FIXED';
  value: number;
}

export interface EmployeeRecord {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  profileImage: string;
  nationalIdMasked: string;
  address: string;
  dateOfBirth: string;
  joiningDate: string;
  employmentTypeId: string;
  employmentTypeName: string;
  jobTitleId: string;
  jobTitleName: string;
  userId: string | null;
  user: { id: string; fullName: string; email: string; status: string } | null;
  salary: SalaryStructure;
  salaryFormula: { gross: string; net: string };
  commissionRules: CommissionRuleView[];
  branches: BranchAssignment[];
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayload {
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  profileImage: string;
  nationalId: string;
  address: string;
  dateOfBirth: string;
  joiningDate: string;
  employmentTypeId: string;
  jobTitleId: string;
  salary: SalaryStructure;
  notes: string;
  branches: Array<{ branchId: string; isPrimary: boolean }>;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  status: 'ACTIVE' | 'INACTIVE';
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionModule {
  module: string;
  permissions: string[];
}

export interface RoleAssignment {
  id: string;
  roleId: string;
  roleName: string;
  roleStatus: string;
  permissions: string[];
  branchScope: 'ALL' | 'SELECTED';
  branchIds: string[];
}

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  isOwner: boolean;
  employee: { id: string; fullName: string; employeeNumber: string } | null;
  roles: RoleAssignment[];
  lastLoginAt: string | null;
}

export interface CommissionConfig {
  defaultRule: { id: string | null; kind: 'PERCENTAGE' | 'FIXED'; value: number };
  services: Array<{ id: string; serviceCode: string; serviceName: string; kind: 'PERCENTAGE' | 'FIXED'; value: number }>;
}

export interface AccessSnapshot {
  isOwner: boolean;
  permissions: string[];
  branchScope: 'ALL' | 'SELECTED';
  branches: Array<{ id: string; name: string; code: string; status: string }>;
}

export interface ActivityEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
}
