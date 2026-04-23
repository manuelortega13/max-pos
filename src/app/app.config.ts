import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';

import { routes } from './app.routes';
import { apiBaseUrlInterceptor } from './core/interceptors/api-base-url.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { unauthorizedInterceptor } from './core/interceptors/unauthorized.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideAnimationsAsync(),
    provideHttpClient(
      withFetch(),
      // Order matters. Requests flow top→bottom:
      //   1. authInterceptor stamps the bearer on relative /api/* paths.
      //   2. unauthorizedInterceptor wraps the response to catch 401s.
      //   3. apiBaseUrlInterceptor rewrites /api/* to the absolute backend
      //      URL last, so earlier passes still see the relative form.
      withInterceptors([authInterceptor, unauthorizedInterceptor, apiBaseUrlInterceptor]),
    ),
    provideNativeDateAdapter(),
  ],
};
