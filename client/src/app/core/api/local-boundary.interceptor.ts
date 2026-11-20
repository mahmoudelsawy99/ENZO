import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isLocalFirst } from '../local/local-mode';

/** Stops a forgotten HttpClient call from reaching Node, MongoDB, or the cloud while local mode is on. */
export const localBoundaryInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isLocalFirst()) {
    return next(request);
  }
  const url = request.url;
  const api = environment.apiUrl;
  const hitsApi = url.includes('/api/') || (api.startsWith('http') && url.startsWith(api)) || url.startsWith(`${api}/`);
  if (!hitsApi) {
    return next(request);
  }
  return throwError(
    () =>
      new HttpErrorResponse({
        status: 599,
        url,
        error: { error: { code: 'backend_blocked', message: `Local-first mode blocked a backend call to ${url}.` } },
      }),
  );
};
