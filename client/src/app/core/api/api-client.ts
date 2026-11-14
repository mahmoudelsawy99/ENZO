import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from './api-error';
import { LocalGateway } from '../local/local-gateway.service';
import { isLocalFirst } from '../local/local-mode';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalGateway);
  readonly baseUrl = environment.apiUrl;

  get<T>(path: string): Observable<T> {
    if (isLocalFirst()) return this.localCall<T>('GET', path);
    return this.http.get<T>(`${this.baseUrl}${path}`);
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Observable<T> {
    if (isLocalFirst()) return this.localCall<T>('POST', path, body);
    return this.http.post<T>(`${this.baseUrl}${path}`, body, headers ? { headers: new HttpHeaders(headers) } : {});
  }

  put<T>(path: string, body: unknown): Observable<T> {
    if (isLocalFirst()) return this.localCall<T>('PUT', path, body);
    return this.http.put<T>(`${this.baseUrl}${path}`, body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    if (isLocalFirst()) return this.localCall<T>('PATCH', path, body);
    return this.http.patch<T>(`${this.baseUrl}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    if (isLocalFirst()) return this.localCall<T>('DELETE', path);
    return this.http.delete<T>(`${this.baseUrl}${path}`);
  }

  postText(path: string, body: unknown): Observable<string> {
    if (isLocalFirst()) return from(this.local.call('POST', path, body).then(() => 'ok'));
    return this.http.post(`${this.baseUrl}${path}`, body, { responseType: 'text' });
  }

  postFile(path: string, file: File, field: string): Observable<{ data: { image: string; profileImage: string; logo: string } }> {
    if (isLocalFirst()) {
      return from(readFile(file).then((image) => ({ data: { image, profileImage: image, logo: image } })));
    }
    const body = new FormData();
    body.set(field, file);
    return this.http.post<{ data: { image: string; profileImage: string; logo: string } }>(`${this.baseUrl}${path}`, body);
  }

  getBlob(path: string): Observable<Blob> {
    if (isLocalFirst()) {
      return from(
        this.local.call('GET', path).then((result) => {
          if (result instanceof Blob) return result;
          throw new ApiError(500, 'export_failed', 'Local export did not return a file.');
        }),
      );
    }
    return this.http.get(`${this.baseUrl}${path}`, { responseType: 'blob' });
  }

  private localCall<T>(method: string, path: string, body?: unknown): Observable<T> {
    return from(this.local.call(method, path, body).then((result) => result as T));
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
