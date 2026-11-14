import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, from, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { changePasswordLocal, loginLocal, logoutLocal, persistedToken, restoreLocal } from '../local/local-auth';
import { LocalGateway } from '../local/local-gateway.service';
import { isLocalFirst } from '../local/local-mode';
import { nileDb } from '../local/local-database';
import { clearPersistedSession } from '../local/local-session';
import type { ApiMessage, ApiResponse, AuthUser, LoginRequest, SessionData } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalGateway);
  private refreshInFlight: Observable<string> | null = null;

  /** Access token stays in memory. The refresh token is an HttpOnly cookie. */
  readonly accessToken = signal<string | null>(null);
  readonly user = signal<AuthUser | null>(null);

  login(body: LoginRequest): Observable<AuthUser> {
    if (isLocalFirst()) {
      return from(this.local.prepare().then(() => loginLocal(nileDb, body.email, body.password, body.rememberMe))).pipe(
        tap((session) => this.remember(session)),
        map((session) => session.user),
      );
    }
    return this.http.post<ApiResponse<SessionData>>(`${environment.apiUrl}/v1/auth/login`, body).pipe(
      tap((response) => this.remember(response.data)),
      map((response) => response.data.user),
    );
  }

  refresh(): Observable<string> {
    if (isLocalFirst()) {
      return from(this.local.prepare().then(() => restoreLocal(nileDb))).pipe(
        tap((session) => {
          if (session) this.remember(session);
        }),
        map((session) => session?.accessToken ?? ''),
      );
    }
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
    if (isLocalFirst()) {
      return this.local.prepare().then(() => restoreLocal(nileDb)).then((session) => {
        if (session) this.remember(session);
      });
    }
    return new Promise((resolve) => {
      this.refresh().subscribe({
        next: () => resolve(),
        error: () => resolve(),
      });
    });
  }

  logout(): Observable<void> {
    if (isLocalFirst()) {
      const token = persistedToken()?.token ?? this.accessToken();
      return from(logoutLocal(nileDb, token)).pipe(
        finalize(() => {
          clearPersistedSession();
          this.clear();
        }),
      );
    }
    return this.http.post(`${environment.apiUrl}/v1/auth/logout`, {}).pipe(
      map(() => undefined),
      finalize(() => this.clear()),
    );
  }

  forgotPassword(email: string): Observable<string> {
    if (isLocalFirst()) {
      return from(
        Promise.resolve(
          email
            ? 'Local mode cannot send email. An owner can set a new password from Users on this computer.'
            : 'Enter the account email.',
        ),
      );
    }
    return this.http
      .post<ApiResponse<ApiMessage>>(`${environment.apiUrl}/v1/auth/forgot-password`, { email })
      .pipe(map((response) => response.data.message));
  }

  resetPassword(token: string, password: string): Observable<string> {
    if (isLocalFirst()) {
      return from(Promise.resolve(token && password ? 'Password reset links are not emailed in local mode. An owner resets passwords from Users.' : 'Password reset is unavailable in local mode.'));
    }
    return this.http
      .post<ApiResponse<ApiMessage>>(`${environment.apiUrl}/v1/auth/reset-password`, { token, password })
      .pipe(map((response) => response.data.message));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    if (isLocalFirst()) {
      const userId = this.user()?.id ?? '';
      return from(changePasswordLocal(nileDb, userId, currentPassword, newPassword)).pipe(
        tap(() => {
          clearPersistedSession();
          this.clear();
        }),
      );
    }
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
