import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OfflineQueueService } from './offline-queue.service';
import { SaleService } from './sale.service';

/**
 * Drains the {@link OfflineQueueService} FIFO whenever the network is back.
 *
 * Not constructed automatically via `providedIn: 'root'` injection — the
 * cashier layout boots it in `ngOnInit` so it's scoped to the shift. Admin
 * doesn't need it (admins don't ring up sales).
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
    this._online.set(true);
    this.drain();
  };
  private onOffline = () => {
    this._online.set(false);
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
    // Secondary safety net — `navigator.onLine` isn't always reliable
    // (e.g. captive portal, flaky mobile data that says "connected" but
    // drops packets). Retry every 20s while there's backlog so we recover
    // automatically without waiting for an online event that never fires.
    this.poller = setInterval(() => {
      if (this.queue.pendingCount() > 0 && this._online() && !this._syncing()) {
        this.drain();
      }
    }, 20_000);

    // Drain on boot in case sales were enqueued in a previous tab session
    // and we're already online right now.
    if (this._online() && this.queue.pendingCount() > 0) {
      this.drain();
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.poller !== null) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  /** Manually trigger a replay pass — wired to a "Retry sync" UI button. */
  async retryNow(): Promise<void> {
    await this.drain();
  }

  /**
   * Walk the queue FIFO, replaying each sale. Stops early on the first
   * network-layer failure (preserves order and prevents hammering the
   * server during an outage). Backend-validation failures (4xx) bump the
   * attempts counter and keep the entry so the admin can inspect it.
   */
  private async drain(): Promise<void> {
    if (this._syncing()) return;
    const snapshot = this.queue.peekAll();
    if (snapshot.length === 0) return;

    this._syncing.set(true);
    try {
      for (const entry of snapshot) {
        try {
          await firstValueFrom(
            this.saleService.replayQueued(entry.request, entry.optimistic.id),
          );
          this.queue.remove(entry.clientRef);
        } catch (err) {
          const httpErr = err as HttpErrorResponse;
          if (httpErr.status === 0) {
            // Still offline — stop draining; online listener will retry.
            this.queue.markAttempted(entry.clientRef, 'network still down');
            break;
          }
          // Real server-side rejection (409 duplicate, 400 validation,
          // 403 inactive product, etc.). Keep the entry so the user can
          // see it; don't spin-retry.
          this.queue.markAttempted(entry.clientRef, this.describe(httpErr));
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
