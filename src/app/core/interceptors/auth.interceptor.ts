import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Attach the current bearer token to every /api/* call — except the auth
 * endpoints themselves. The login POST is not an authenticated call (that's
 * the whole point of logging in), and a stale token on that request can
 * confuse Spring Security into 403-ing the attempt.
 */
const AUTH_FREE_PATHS = ['/api/auth/login'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const isApi = req.url.startsWith('/api/');
  const isAuthEndpoint = AUTH_FREE_PATHS.some((p) => req.url.includes(p));

  if (!token || !isApi || isAuthEndpoint) {
    return next(req);
  }

  const authed = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authed);
};
