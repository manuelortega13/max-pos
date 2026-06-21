import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Sends a store with no chosen plan to the "choose a plan" page, so the
 * post-sign-up selection can't be skipped. Errors fall through (don't lock the
 * owner out of their own console if the status check fails).
 */
export const planGuard: CanActivateFn = () => {
  const subscription = inject(SubscriptionService);
  const router = inject(Router);

  return subscription.ensureStatus().pipe(
    map((status) => (status.hasPlan ? true : router.createUrlTree(['/subscribe']))),
    catchError(() => of(true)),
  );
};
