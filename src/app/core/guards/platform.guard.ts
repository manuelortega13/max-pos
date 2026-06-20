import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformAuthService } from '../services/platform-auth.service';

/** Protects the platform console; redirects to the platform login. */
export const platformGuard: CanActivateFn = () => {
  const auth = inject(PlatformAuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/platform/login']);
};

/** Keeps an already-authenticated platform admin off the platform login page. */
export const platformPublicOnlyGuard: CanActivateFn = () => {
  const auth = inject(PlatformAuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return router.createUrlTree(['/platform']);
  return true;
};
