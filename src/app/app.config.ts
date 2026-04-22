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
      // Order matters: auth runs first (attaches bearer), then the
      // unauthorized handler wraps the response so it sees resulting 401s.
      withInterceptors([authInterceptor, unauthorizedInterceptor]),
    ),
    // DateAdapter is required by mat-datepicker; its calendar opens in a CDK
    // overlay that resolves providers from the root injector, so this has to
    // live here (importing MatNativeDateModule inside a component isn't enough).
    provideNativeDateAdapter(),
  ],
};
