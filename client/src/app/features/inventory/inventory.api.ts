import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type {
  PageResult,
  ProductCategory,
  ProductRecord,
  PurchaseDetail,
  PurchaseRow,
  StockAlert,
  StockMovementRow,
  StockRow,
  SupplierRecord,
  TransferRecord,
} from './inventory.models';

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
export class InventoryApi {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);

  categories() {
    return this.api.get<{ data: ProductCategory[] }>('/v1/product-categories');
  }

  saveCategory(body: { name: { en: string; ar: string }; status: string }, id?: string) {
    return id
      ? this.api.put<{ data: ProductCategory }>(`/v1/product-categories/${id}`, body)
      : this.api.post<{ data: ProductCategory }>('/v1/product-categories', body);
  }

  products(params: { page: number; pageSize: number; search?: string; status?: string; categoryId?: string; sort?: string; direction?: string }) {
    return this.api.get<PageResult<ProductRecord>>(`/v1/products${query(params)}`);
  }

  product(id: string) {
    return this.api.get<{ data: ProductRecord }>(`/v1/products/${id}`);
  }

  saveProduct(body: unknown, id?: string) {
    return id ? this.api.put<{ data: ProductRecord }>(`/v1/products/${id}`, body) : this.api.post<{ data: ProductRecord }>('/v1/products', body);
  }

  deactivateProduct(id: string) {
    return this.api.post<{ data: ProductRecord }>(`/v1/products/${id}/deactivate`, {});
  }

  uploadImage(file: File) {
    const body = new FormData();
    body.set('image', file);
    return this.http.post<{ data: { image: string } }>(`${this.api.baseUrl}/v1/products/image`, body);
  }

  stock(params: { branchId: string; page: number; pageSize: number; search?: string; alert?: string }) {
    return this.api.get<PageResult<StockRow>>(`/v1/inventory${query(params)}`);
  }

  stockDetail(productId: string, branchId: string) {
    return this.api.get<{ data: { product: ProductRecord; stock: { quantityOnHand: number; averageCost: number; minimumStock: number; lastStockMovementAt: string }; movements: StockMovementRow[] } }>(
      `/v1/inventory/${productId}${query({ branchId })}`,
    );
  }

  adjust(body: { branchId: string; productId: string; direction: string; quantity: number; notes: string }) {
    return this.api.post<{ data: unknown }>('/v1/inventory/adjustments', body);
  }

  summary(branchId?: string) {
    return this.api.get<{ data: { lowStock: number; outOfStock: number } }>(`/v1/inventory/summary${query({ branchId })}`);
  }

  suppliers(params: { page: number; pageSize: number; search?: string; status?: string }) {
    return this.api.get<PageResult<SupplierRecord>>(`/v1/suppliers${query(params)}`);
  }

  supplier(id: string) {
    return this.api.get<{ data: SupplierRecord }>(`/v1/suppliers/${id}`);
  }

  saveSupplier(body: unknown, id?: string) {
    return id ? this.api.put<{ data: SupplierRecord }>(`/v1/suppliers/${id}`, body) : this.api.post<{ data: SupplierRecord }>('/v1/suppliers', body);
  }

  purchases(params: { page: number; pageSize: number; branchId?: string; supplierId?: string }) {
    return this.api.get<PageResult<PurchaseRow>>(`/v1/purchases${query(params)}`);
  }

  purchase(id: string) {
    return this.api.get<{ data: PurchaseDetail }>(`/v1/purchases/${id}`);
  }

  createPurchase(body: unknown) {
    return this.api.post<{ data: PurchaseDetail }>('/v1/purchases', body);
  }

  receivePurchase(id: string) {
    return this.api.post<{ data: PurchaseDetail }>(`/v1/purchases/${id}/receive`, {});
  }

  payPurchase(id: string, body: { method: string; amount: number; referenceNumber: string }) {
    return this.api.post<{ data: PurchaseDetail }>(`/v1/purchases/${id}/payments`, body);
  }

  returnPurchase(id: string, body: { reason: string; items: Array<{ productId: string; quantity: number }> }) {
    return this.api.post<{ data: PurchaseDetail }>(`/v1/purchases/${id}/return`, body);
  }

  setMinimum(body: { branchId: string; productId: string; minimumStock: number }) {
    return this.api.put<{ data: { quantityOnHand: number; averageCost: number; minimumStock: number } }>('/v1/inventory/minimum', body);
  }

  transfers(branchId?: string) {
    return this.api.get<{ data: TransferRecord[] }>(`/v1/transfers${query({ branchId })}`);
  }

  transfer(id: string) {
    return this.api.get<{ data: TransferRecord }>(`/v1/transfers/${id}`);
  }

  createTransfer(body: unknown) {
    return this.api.post<{ data: TransferRecord }>('/v1/transfers', body);
  }

  sendTransfer(id: string) {
    return this.api.post<{ data: TransferRecord }>(`/v1/transfers/${id}/send`, {});
  }

  receiveTransfer(id: string) {
    return this.api.post<{ data: TransferRecord }>(`/v1/transfers/${id}/receive`, {});
  }

  cancelTransfer(id: string) {
    return this.api.post<{ data: TransferRecord }>(`/v1/transfers/${id}/cancel`, {});
  }

  alerts(branchId?: string, status = 'ACTIVE') {
    return this.api.get<{ data: StockAlert[] }>(`/v1/stock-alerts${query({ branchId, status })}`);
  }

  setAlert(id: string, status: 'DISMISSED' | 'RESOLVED') {
    return this.api.post<{ data: { id: string; status: string } }>(`/v1/stock-alerts/${id}/status`, { status });
  }
}
