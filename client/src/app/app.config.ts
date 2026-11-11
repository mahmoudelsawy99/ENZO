import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { apiErrorInterceptor } from './core/api/api-error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor, credentialsInterceptor } from './core/auth/auth.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { ThemeService } from './core/theme/theme.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([credentialsInterceptor, apiErrorInterceptor, authInterceptor])),
    provideAppInitializer(() => inject(ThemeService).init()),
    provideAppInitializer(() => inject(LanguageService).init()),
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
