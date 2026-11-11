import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const PUBLIC_AUTH = ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/forgot-password', '/v1/auth/reset-password'];

export const credentialsInterceptor: HttpInterceptorFn = (request, next) => next(request.clone({ withCredentials: true }));

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const credentialExchange = PUBLIC_AUTH.some((path) => request.url.includes(path));
  const outgoing =
    token && !credentialExchange ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !request.url.includes(environment.apiUrl)) {
        return throwError(() => error);
      }

      const code = readCode(error);
      if (error.status === 403 && (code === 'tenant_unavailable' || code === 'account_unavailable' || code === 'account_locked')) {
        auth.clear();
        if (!router.url.startsWith('/login')) {
          void router.navigate(['/login'], { queryParams: { reason: code } });
        }
        return throwError(() => error);
      }

      const canRefresh =
        error.status === 401 && !credentialExchange && !request.headers.has('X-Retry') && code !== 'invalid_credentials';
      if (!canRefresh) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          auth.clear();
          if (!router.url.startsWith('/login')) {
            void router.navigateByUrl('/login');
          }
          return throwError(() => refreshError);
        }),
        switchMap((accessToken) =>
          next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${accessToken}`, 'X-Retry': '1' },
            }),
          ),
        ),
      );
    }),
  );
};

function readCode(error: HttpErrorResponse): string {
  const payload = error.error as { error?: { code?: string } } | null;
  return payload?.error?.code ?? '';
}
