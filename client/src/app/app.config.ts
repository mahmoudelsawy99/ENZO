import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { apiErrorInterceptor } from './core/api/api-error.interceptor';
import { wakeInterceptor } from './core/api/wake.interceptor';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor, credentialsInterceptor } from './core/auth/auth.interceptor';
import { projectJsonInterceptor } from './core/data/project-json.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { ThemeService } from './core/theme/theme.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([projectJsonInterceptor, credentialsInterceptor, apiErrorInterceptor, authInterceptor, wakeInterceptor])),
    provideAppInitializer(() => inject(ThemeService).init()),
    provideAppInitializer(() => inject(LanguageService).init()),
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
