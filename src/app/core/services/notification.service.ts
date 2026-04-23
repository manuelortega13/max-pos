import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ExpiringBatch } from '../models';
import { AuthService } from './auth.service';
import { ProductService } from './product.service';
import { RealtimeService } from './realtime.service';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WITHIN_DAYS = 30;

/**
 * Polls /api/batches/expiring periodically and exposes the result as a signal.
 * The admin toolbar bell and dashboard card read from here; components don't
 * call the endpoint directly so we don't thrash it with duplicate requests.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly productService = inject(ProductService);
  private readonly authService = inject(AuthService);
  private readonly realtime = inject(RealtimeService);

  private readonly _expiring = signal<ExpiringBatch[]>([]);
  private readonly _loaded = signal<boolean>(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly expiring = this._expiring.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly count = computed(() => this._expiring().length);
  readonly alreadyExpiredCount = computed(
    () => this._expiring().filter((b) => b.daysUntilExpiry < 0).length,
  );

  constructor() {
    // Pair the 5-minute poller with realtime sync — any inventory mutation
    // (restock, write-off, sale) invalidates the expiring cache, so refresh
    // immediately instead of waiting for the next tick.
    effect(() => {
      const event = this.realtime.latestEvent();
      if (event && event.type === 'inventory.changed' && this._loaded()) {
        this.refresh();
      }
    });
  }

  /** Kick off polling. Safe to call repeatedly — de-dupes itself. */
  start(): void {
    if (!this.authService.isAuthenticated()) return;
    this.refresh();
    if (this.timer === null) {
      this.timer = setInterval(() => this.refresh(), POLL_INTERVAL_MS);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._expiring.set([]);
    this._loaded.set(false);
  }

  refresh(): void {
    if (!this.authService.isAuthenticated()) return;
    this.productService.listExpiring(WITHIN_DAYS).subscribe({
      next: (batches) => {
        this._expiring.set(batches);
        this._loaded.set(true);
      },
      error: () => {
        // Silent — we don't want a banner/toast every 5 minutes if the backend
        // is briefly unreachable. The caller can observe `loaded()` if needed.
      },
    });
  }
}
