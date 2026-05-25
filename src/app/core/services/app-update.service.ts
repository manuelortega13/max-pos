import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/**
 * Detect when a new Service Worker version has finished downloading
 * and is waiting to activate, then expose that as a signal the UI
 * can surface ("Update available · Reload"). On the user's tap we
 * call activateUpdate() and reload — the new SW takes over without
 * needing the cashier to force-quit the PWA.
 *
 * Without this, a deployed SW change can sit "waiting" indefinitely
 * because the old SW only releases control once every tab/window
 * is closed, which is rare on a register that stays open all shift.
 *
 * Polling note: Angular's SW does its own update check on app
 * startup + on navigation, neither of which fires on a long-lived
 * single-page session. We additionally poll every 30 min so an
 * open-all-day register actually notices server-side deploys.
 */

const POLL_INTERVAL_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly _updateReady = signal(false);
  /** True when a new SW version is downloaded and ready to activate. */
  readonly updateReady = this._updateReady.asReadonly();

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** Start watching for SW updates. Idempotent. Call once during
   *  app bootstrap; safe to call multiple times. No-op when the SW
   *  isn't enabled (dev mode, unsupported browser). */
  start(): void {
    if (this.started || !this.swUpdate.isEnabled) return;
    this.started = true;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this._updateReady.set(true));

    this.pollHandle = setInterval(() => {
      void this.swUpdate.checkForUpdate().catch(() => {
        // Update checks are best-effort — a transient network blip
        // shouldn't surface as anything user-facing. We'll retry on
        // the next interval.
      });
    }, POLL_INTERVAL_MS);
  }

  /** Activate the waiting SW and reload so the new version takes
   *  over. Called from the "Reload" tap on the update banner. */
  async apply(): Promise<void> {
    if (!this.swUpdate.isEnabled || !this._updateReady()) return;
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      // Always reload — even if activateUpdate threw, the next page
      // load will pick up the new SW eventually.
      document.location.reload();
    }
  }
}
