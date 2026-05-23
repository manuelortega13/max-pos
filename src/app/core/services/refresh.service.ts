import { Injectable, inject, signal } from '@angular/core';
import { BusinessDayService } from './business-day.service';
import { CategoryService } from './category.service';
import { LocalStoreService } from './local-store.service';
import { ProductService } from './product.service';
import { SaleService } from './sale.service';
import { SettingsService } from './settings.service';
import { UserService } from './user.service';

const LAST_SYNC_KEY = 'maxpos.last-sync-at';

/**
 * Soft refresh of every top-level data service the app shell reads from.
 * Called by the pull-to-refresh gesture and the admin "Sync now" button.
 * Avoids `location.reload()` (which on a PWA means re-bootstrapping
 * Angular — slow and jarring).
 *
 * The individual services' `load()` methods are fire-and-forget; each
 * one manages its own loading signal. We wait 800 ms after kicking them
 * off to give the spinner a visible "working…" moment even on a fast
 * network, then stamp {@link lastSyncAt}. The timestamp is persisted in
 * IndexedDB so the admin UI can show "synced 4 minutes ago" across
 * reloads / new sessions.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);
  private readonly settingsService = inject(SettingsService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly localStore = inject(LocalStoreService);

  /** ms-epoch of the last completed refreshAll, or null if never. */
  private readonly _lastSyncAt = signal<number | null>(null);
  readonly lastSyncAt = this._lastSyncAt.asReadonly();

  constructor() {
    void this.restoreLastSyncAt();
  }

  async refreshAll(): Promise<void> {
    this.productService.load();
    this.categoryService.load();
    this.saleService.load();
    this.userService.load();
    this.settingsService.load();
    this.businessDayService.refreshCurrent().subscribe({ error: () => {} });
    // Minimum visible spinner duration so the user gets feedback that
    // *something* happened even when the network responds instantly.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const now = Date.now();
    this._lastSyncAt.set(now);
    void this.localStore.kvSet(LAST_SYNC_KEY, now).catch(() => {});
  }

  private async restoreLastSyncAt(): Promise<void> {
    try {
      const saved = await this.localStore.kvGet<number>(LAST_SYNC_KEY);
      if (typeof saved === 'number') this._lastSyncAt.set(saved);
    } catch {
      // IDB unavailable — last-sync timestamp just stays null.
    }
  }
}
