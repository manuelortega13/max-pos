import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Catches 401 responses on any /api/* call and expires the session.
 * `expireSession()` clears state, shows a "session expired" snackbar,
 * and navigates to /login — same path the JWT-expiry timer takes, so
 * server-rejected-token and locally-expired-token feel identical to
 * the user.
 *
 * The login endpoint is allowed to 401 without triggering this flow
 * (no session exists yet, so there's nothing to clear and the form
 * already shows its own error).
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        auth.isAuthenticated() &&
        !req.url.includes('/api/auth/login')
      ) {
        auth.expireSession();
      }
      return throwError(() => err);
    }),
  );
};
