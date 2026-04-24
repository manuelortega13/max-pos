import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OfflineQueueService } from './offline-queue.service';
import { SaleService } from './sale.service';

/**
 * Drains the {@link OfflineQueueService} FIFO whenever the network is back.
 *
 * Design notes — why this is more aggressive than it looks:
 *   navigator.onLine is unreliable on mobile browsers, and the
 *   `online` / `offline` events are even flakier — iOS Safari PWAs in
 *   particular can get stuck reporting offline or simply never fire the
 *   `online` event after a reconnect. We treat the browser's flag as a
 *   hint only. The real "am I online?" answer comes from trying an HTTP
 *   call and seeing what happens, so the poller runs unconditionally and
 *   the drain's status-0 handling is what updates the signal.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly queue = inject(OfflineQueueService);
  private readonly saleService = inject(SaleService);

  private readonly _online = signal<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  private readonly _syncing = signal<boolean>(false);
  readonly online = this._online.asReadonly();
  readonly syncing = this._syncing.asReadonly();
  readonly pendingCount = this.queue.pendingCount;
  readonly showsOfflineBadge = computed(
    () => !this._online() || this.queue.pendingCount() > 0,
  );

  private onOnline = () => {
    // Browser thinks it's back. Treat as a best-guess and kick a drain —
    // the actual HTTP response is still the source of truth.
    console.info('[offline-sync] online event fired');
    this._online.set(true);
    void this.drain();
  };
  private onOffline = () => {
    console.info('[offline-sync] offline event fired');
    this._online.set(false);
  };
  private onVisible = () => {
    // Coming back to the tab / app after being backgrounded is a
    // classic moment the network recovers without an online event.
    if (document.visibilityState === 'visible' && this.queue.pendingCount() > 0) {
      void this.drain();
    }
  };
  private poller: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** Call once from the cashier layout ngOnInit. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (typeof window === 'undefined') return;

    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);

    // Poll aggressively when there's backlog — try every 10s regardless
    // of what navigator.onLine claims. Drain itself is a no-op if the
    // queue is empty or a pass is already running, and short-circuits
    // cleanly on status-0 so this isn't a hammering loop.
    this.poller = setInterval(() => {
      if (!this._syncing() && this.queue.pendingCount() > 0) {
        void this.drain();
      }
    }, 10_000);

    // Drain on boot in case sales were queued in a previous tab session.
    if (this.queue.pendingCount() > 0) {
      void this.drain();
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.poller !== null) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  /** Manually trigger a replay pass — wired to the "Retry sync" pill. */
  async retryNow(): Promise<void> {
    await this.drain();
  }

  /**
   * Walk the queue FIFO, replaying each sale. The HTTP outcome also
   * updates the online signal so the UI reflects reality instead of
   * whatever navigator.onLine happens to be lying about. Stops early on
   * the first status-0 failure (preserves order; next poller tick will
   * try again); 4xx bumps the attempts counter and moves on.
   */
  private async drain(): Promise<void> {
    if (this._syncing()) return;
    const snapshot = this.queue.peekAll();
    if (snapshot.length === 0) return;

    console.info('[offline-sync] draining', snapshot.length, 'queued sale(s)');
    this._syncing.set(true);
    try {
      for (const entry of snapshot) {
        try {
          await firstValueFrom(
            this.saleService.replayQueued(entry.request, entry.optimistic.id),
          );
          console.info('[offline-sync] replayed', entry.clientRef);
          this.queue.remove(entry.clientRef);
          // A successful HTTP round-trip is the most reliable "I'm
          // online" signal we can get — promote the flag even if the
          // browser never fired the online event.
          if (!this._online()) this._online.set(true);
        } catch (err) {
          const httpErr = err as HttpErrorResponse;
          if (httpErr.status === 0) {
            console.info('[offline-sync] still offline, pausing drain');
            this.queue.markAttempted(entry.clientRef, 'network still down');
            // Trust the drain outcome over the browser flag.
            if (this._online()) this._online.set(false);
            break;
          }
          console.warn(
            '[offline-sync] replay failed for',
            entry.clientRef,
            httpErr.status,
            httpErr.error,
          );
          this.queue.markAttempted(entry.clientRef, this.describe(httpErr));
          // A real 4xx / 5xx means we ARE online — keep the flag honest
          // so the UI doesn't say "Offline" when the backend is reachable
          // but rejecting specific sales.
          if (!this._online()) this._online.set(true);
        }
      }
    } finally {
      this._syncing.set(false);
    }
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'network unreachable';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `replay failed (${err.status})`;
  }
}
