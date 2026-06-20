import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { PlatformAuthService } from '../services/platform-auth.service';

/**
 * Attach the right bearer token to /api/* calls:
 *   - /api/platform/* → the platform-admin token (its own session);
 *   - everything else → the store-user token.
 * Public endpoints (login, platform login, store registration) get no token
 * — a stale token on those can confuse Spring Security into a 403.
 */
const AUTH_FREE_PATHS = ['/api/auth/login', '/api/platform/auth/login', '/api/stores/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApi = req.url.startsWith('/api/');
  const isAuthEndpoint = AUTH_FREE_PATHS.some((p) => req.url.includes(p));
  if (!isApi || isAuthEndpoint) {
    return next(req);
  }

  const isPlatform = req.url.includes('/api/platform/');
  const token = isPlatform ? inject(PlatformAuthService).token() : inject(AuthService).token();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
