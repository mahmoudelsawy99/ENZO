import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { timer, throwError } from 'rxjs';
import { retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

const WAKE_ATTEMPTS = 5;
const WAKE_DELAY_MS = 12_000;

/**
 * The free host answers with an HTML wake page and no CORS headers while the
 * container is asleep. The browser reports that as status 0. The first call
 * starts the wake, and later attempts reach the API.
 */
export const wakeInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiUrl)) {
    return next(request);
  }
  return next(request).pipe(
    retry({
      count: WAKE_ATTEMPTS,
      delay: (error) => (error instanceof HttpErrorResponse && error.status === 0 ? timer(WAKE_DELAY_MS) : throwError(() => error)),
    }),
  );
};
