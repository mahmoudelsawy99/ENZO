export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface TenantOwner {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface TenantRecord {
  id: string;
  businessName: string;
  slug: string;
  logo: string;
  ownerUserId: string | null;
  owner: TenantOwner | null;
  contactEmail: string;
  contactPhone: string;
  address: string;
  currency: string;
  timezone: string;
  defaultLanguage: 'en' | 'ar';
  theme: 'dark' | 'light';
  status: TenantStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TenantList {
  data: TenantRecord[];
  meta: { page: number; pageSize: number; total: number };
}

export interface PlatformDashboard {
  totals: { tenants: number; active: number; suspended: number; inactive: number; users: number };
  statusDistribution: Array<{ status: TenantStatus; count: number }>;
  createdOverTime: Array<{ date: string; count: number }>;
  recentTenants: TenantRecord[];
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
    mrr: number;
    arr: number;
    collectedThisMonth: number;
    currency: string;
    planDistribution: Array<{ code: string; count: number }>;
    recentPayments: Array<{ id: string; tenantName: string; amount: number; currency: string; status: string; paidAt: string | null }>;
    upcomingRenewals: Array<{ id: string; tenantName: string; nextBillingDate: string; status: string }>;
  };
}

export interface TenantPayload {
  businessName: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  logo: string;
  currency: string;
  timezone: string;
  defaultLanguage: 'en' | 'ar';
  theme: 'dark' | 'light';
  owner: {
    fullName: string;
    email: string;
    phone: string;
    password?: string;
  };
}
