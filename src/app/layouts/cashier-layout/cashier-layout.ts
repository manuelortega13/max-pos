import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { RefreshService } from '../../core/services/refresh.service';
import { SettingsService } from '../../core/services/settings.service';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';

@Component({
  selector: 'app-cashier-layout',
  imports: [
    TitleCasePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
    PullToRefreshDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cashier-layout.html',
  styleUrl: './cashier-layout.scss',
})
export class CashierLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly realtime = inject(RealtimeService);
  private readonly sync = inject(OfflineSyncService);
  private readonly settingsService = inject(SettingsService);
  private readonly refreshService = inject(RefreshService);
  protected readonly refreshing = signal(false);

  protected readonly currentUser = this.authService.user;
  protected readonly cartItemCount = this.cartService.itemCount;
  protected readonly online = this.sync.online;
  protected readonly pendingSync = this.sync.pendingCount;
  protected readonly syncing = this.sync.syncing;
  /**
   * Show the sync pill only when offline mode is actually in use: either the
   * admin has it enabled (so going offline has an effect worth surfacing),
   * or the queue still has pending sales from a prior session. Suppressing
   * the badge on offline-mode-off avoids showing a misleading "Offline" hint
   * when the app is going to error out on failed POSTs anyway.
   */
  protected readonly showSyncBadge = computed(() => {
    const pending = this.sync.pendingCount() > 0;
    if (pending) return true;
    const offlineEnabled = this.settingsService.settings().offlineModeEnabled;
    return offlineEnabled && !this.sync.online();
  });

  ngOnInit(): void {
    // Cashiers subscribe to the same SSE stream as admins, but the backend
    // only routes broadcast (inventory.*) events their way. This keeps the
    // POS grid's stock numbers in sync when another cashier makes a sale,
    // when an admin restocks, or when a refund returns units to inventory.
    this.realtime.start();
    // Offline queue replay runner — scoped to the cashier shell so admins
    // don't get an unused service when they sign in.
    this.sync.start();
  }

  ngOnDestroy(): void {
    this.realtime.stop();
    this.sync.stop();
  }

  protected retrySync(): void {
    void this.sync.retryNow();
  }

  protected async onPullRefresh(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      await this.refreshService.refreshAll();
    } finally {
      this.refreshing.set(false);
    }
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
