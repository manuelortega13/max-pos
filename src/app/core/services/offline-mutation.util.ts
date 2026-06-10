import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Shared helpers for the cashier-register offline write path. GCash and Load
 * transactions both follow the same "try the server, fall back to the queue"
 * shape that {@link SaleService} pioneered; this centralizes the two pieces
 * that are genuinely type-agnostic so the two services don't duplicate them.
 *
 * The per-feature bits (building the optimistic row, updating the cached
 * signal, the replay HTTP call) stay in each service — they're type-specific.
 */

/** Header that marks a POST as a replay from the offline queue. The backend
 *  uses it to bypass the open-day + tier-fee checks for a transaction that
 *  already physically happened at the till while disconnected. */
export const OFFLINE_REPLAY_HEADER = { 'X-Maxpos-Offline-Replay': 'true' } as const;

/**
 * Generate a client-side idempotency key, e.g. `G-<uuid>` / `L-<uuid>`. It is
 * sent on every create (online and offline) so a POST whose response is lost
 * can be safely replayed: the backend dedupes on it instead of inserting a
 * duplicate row.
 */
export function newClientRef(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${(crypto as { randomUUID(): string }).randomUUID()}`;
  }
  // Fallback for ancient runtimes — timestamp + random suffix is
  // collision-resistant enough for a single device's offline queue.
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True when the browser reports the device is offline. A hint only — the
 *  authoritative answer is the HTTP outcome (status 0), handled below. */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Run a create with the offline-queue fallback the cashier flows share.
 *
 *  - Offline mode off → behaves exactly like a plain POST (errors surface to
 *    the caller; legacy behavior preserved).
 *  - Offline mode on + device offline → skips the network entirely and
 *    returns the optimistic row from {@code enqueue}.
 *  - Offline mode on + POST fails with status 0 (server unreachable) → falls
 *    back to {@code enqueue} so the cashier still gets a receipt.
 *
 * {@code enqueue} is responsible for building the optimistic row, pushing the
 * request onto {@link OfflineQueueService}, and updating the service's cache;
 * it returns the optimistic row to emit.
 */
export function createWithOfflineFallback<T>(opts: {
  offlineEnabled: boolean;
  post: () => Observable<T>;
  enqueue: (reason: string) => T;
}): Observable<T> {
  if (opts.offlineEnabled && isDeviceOffline()) {
    return of(opts.enqueue('device offline'));
  }
  return opts.post().pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 0 && opts.offlineEnabled) {
        return of(opts.enqueue('network unreachable'));
      }
      return throwError(() => err);
    }),
  );
}
