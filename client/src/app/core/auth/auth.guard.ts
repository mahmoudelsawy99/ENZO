import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.user()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
  });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.user();
  if (!user) {
    return true;
  }
  return inject(Router).createUrlTree([user.userType === 'SUPER_ADMIN' ? '/platform' : '/dashboard']);
};

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.user()?.userType === 'SUPER_ADMIN') {
    return true;
  }
  return inject(Router).createUrlTree(['/dashboard']);
};

export const tenantGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.user()?.userType === 'TENANT_USER') {
    return true;
  }
  return inject(Router).createUrlTree(['/platform']);
};
