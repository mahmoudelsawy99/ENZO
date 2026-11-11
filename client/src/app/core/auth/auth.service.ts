import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiMessage, ApiResponse, AuthUser, LoginRequest, SessionData } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private refreshInFlight: Observable<string> | null = null;

  /** Access token stays in memory. The refresh token is an HttpOnly cookie. */
  readonly accessToken = signal<string | null>(null);
  readonly user = signal<AuthUser | null>(null);

  login(body: LoginRequest): Observable<AuthUser> {
    return this.http.post<ApiResponse<SessionData>>(`${environment.apiUrl}/v1/auth/login`, body).pipe(
      tap((response) => this.remember(response.data)),
      map((response) => response.data.user),
    );
  }

  refresh(): Observable<string> {
    this.refreshInFlight ??= this.http.post<ApiResponse<SessionData>>(`${environment.apiUrl}/v1/auth/refresh`, {}).pipe(
      tap((response) => this.remember(response.data)),
      map((response) => response.data.accessToken),
      finalize(() => {
        this.refreshInFlight = null;
      }),
      shareReplay(1),
    );
    return this.refreshInFlight;
  }

  restore(): Promise<void> {
    return new Promise((resolve) => {
      this.refresh().subscribe({
        next: () => resolve(),
        error: () => resolve(),
      });
    });
  }

  logout(): Observable<void> {
    return this.http.post(`${environment.apiUrl}/v1/auth/logout`, {}).pipe(
      map(() => undefined),
      finalize(() => this.clear()),
    );
  }

  forgotPassword(email: string): Observable<string> {
    return this.http
      .post<ApiResponse<ApiMessage>>(`${environment.apiUrl}/v1/auth/forgot-password`, { email })
      .pipe(map((response) => response.data.message));
  }

  resetPassword(token: string, password: string): Observable<string> {
    return this.http
      .post<ApiResponse<ApiMessage>>(`${environment.apiUrl}/v1/auth/reset-password`, { token, password })
      .pipe(map((response) => response.data.message));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post(`${environment.apiUrl}/v1/auth/change-password`, { currentPassword, newPassword }).pipe(
      tap(() => this.clear()),
      map(() => undefined),
    );
  }

  homeUrl(): string {
    return this.user()?.userType === 'SUPER_ADMIN' ? '/platform' : '/dashboard';
  }

  clear(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }

  private remember(session: SessionData): void {
    this.accessToken.set(session.accessToken);
    this.user.set(session.user);
  }
}
