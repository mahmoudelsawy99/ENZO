import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';

/**
 * Normalizes API failures. It does not authorize requests.
 * Tenant, branch, and permission checks belong on the server.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const payload = error.error as { error?: { code?: string; message?: string } } | null;
        const waking = error.status === 0;
        return throwError(
          () =>
            new ApiError(
              error.status,
              waking ? 'server_waking' : (payload?.error?.code ?? 'http_error'),
              waking ? 'The shop server is waking up. Wait a moment and try again.' : (payload?.error?.message ?? error.message),
            ),
        );
      }
      return throwError(() => error);
    }),
  );
