export interface LocalizedText {
  en: string;
  ar: string;
}

export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ServiceCategory {
  id: string;
  name: LocalizedText;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  categoryId: string;
  categoryName: LocalizedText;
  image: string;
  price: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ServicePayload {
  name: LocalizedText;
  description: LocalizedText;
  categoryId: string;
  image: string;
  price: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
}

export interface CustomerRecord {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: '' | 'MALE' | 'FEMALE';
  address: string;
  notes: string;
  promotionalOptIn?: boolean;
  whatsappOptOut?: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayload {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: '' | 'MALE' | 'FEMALE';
  address: string;
  notes: string;
}

export interface CustomerNote {
  id: string;
  content: string;
  createdAt: string;
  createdByName: string;
}

export interface CustomerStats {
  totalVisits: number;
  totalSpending: number;
  totalPaid?: number;
  totalRefunds?: number;
  netSpending?: number;
  totalTransactions?: number;
  lastPaidTransaction?: string | null;
  outstandingAmount?: number;
  lastVisit: string | null;
  firstVisit: string | null;
  mostUsedServices: Array<{ serviceId: string; name: LocalizedText; count: number }>;
  activePackages: number;
}

export interface HistoryPage {
  data: unknown[];
  meta: { page: number; pageSize: number; total: number };
  source: 'not_connected' | 'appointments' | 'transactions';
}

export interface PackageItem {
  serviceId: string;
  serviceName: LocalizedText;
  quantity: number;
  unitPrice: number;
}

export interface PackageRecord {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  image: string;
  items: PackageItem[];
  price: number;
  validityType: 'NO_EXPIRY' | 'FIXED_EXPIRY' | 'VALIDITY_DAYS';
  validityDays: number | null;
  fixedExpiryDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface PackagePayload {
  name: LocalizedText;
  description: LocalizedText;
  image: string;
  items: Array<{ serviceId: string; quantity: number }>;
  price: number;
  validityType: PackageRecord['validityType'];
  validityDays: number | null;
  fixedExpiryDate: string;
}

export interface CustomerPackageItem {
  serviceId: string;
  serviceName: LocalizedText;
  purchasedQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
}

export interface CustomerPackageRecord {
  id: string;
  customerId: string;
  packageTemplateId: string;
  name: LocalizedText;
  purchasedAt: string;
  expiresAt: string | null;
  purchasePrice: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
  items: CustomerPackageItem[];
}

export function localizedLabel(value: LocalizedText | undefined, language: string): string {
  if (!value) {
    return '';
  }
  return language === 'ar' && value.ar ? value.ar : value.en;
}
