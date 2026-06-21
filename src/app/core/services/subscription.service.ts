import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { StorePlans, SubscriptionStatus } from '../models';

/**
 * Owner-facing subscription state. Backs the post-sign-up "choose a plan"
 * step and the plan guard. Caches the current status as a signal so the guard
 * doesn't refetch on every admin navigation.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly http = inject(HttpClient);

  private readonly _status = signal<SubscriptionStatus | null>(null);
  readonly status = this._status.asReadonly();

  /** Plans the owner can choose from (trial + paid), with currency context. */
  listPlans(): Observable<StorePlans> {
    return this.http.get<StorePlans>('/api/plans');
  }

  loadStatus(): Observable<SubscriptionStatus> {
    return this.http
      .get<SubscriptionStatus>('/api/subscription')
      .pipe(tap((s) => this._status.set(s)));
  }

  /** Cached status, fetching once if not yet loaded. */
  ensureStatus(): Observable<SubscriptionStatus> {
    const current = this._status();
    return current ? of(current) : this.loadStatus();
  }

  subscribe(planId: string): Observable<SubscriptionStatus> {
    return this.http
      .post<SubscriptionStatus>('/api/subscription', { planId })
      .pipe(tap((s) => this._status.set(s)));
  }

  /** Drop cached status (e.g. on sign-out) so the next session refetches. */
  reset(): void {
    this._status.set(null);
  }
}
