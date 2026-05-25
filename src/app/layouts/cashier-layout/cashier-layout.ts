import { HttpErrorResponse } from '@angular/common/http';
import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { OpenDayDialog, OpenDayDialogResult } from '../../features/admin/end-of-day/open-day-dialog';
import { AuthService } from '../../core/services/auth.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { CartService } from '../../core/services/cart.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { PrinterService } from '../../core/services/printer.service';
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
    MatDividerModule,
    PullToRefreshDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cashier-layout.html',
  styleUrl: './cashier-layout.scss',
})
export class CashierLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly realtime = inject(RealtimeService);
  private readonly sync = inject(OfflineSyncService);
  private readonly settingsService = inject(SettingsService);
  private readonly refreshService = inject(RefreshService);
  private readonly printerService = inject(PrinterService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly refreshing = signal(false);
  /** Latch so we don't re-prompt the cashier inside a single layout
   *  lifecycle if they dismiss the auto-shown open-day dialog. */
  private openDayPromptShown = false;

  protected readonly currentUser = this.authService.user;
  protected readonly offlineSession = this.authService.offlineSession;
  protected readonly cartItemCount = this.cartService.itemCount;
  protected readonly online = this.sync.online;
  protected readonly pendingSync = this.sync.pendingCount;
  protected readonly syncing = this.sync.syncing;
  protected readonly currentDay = this.businessDayService.current;
  /** Time the current day opened, formatted "HH:mm" in the cashier's
   *  local zone. Empty string when no day is open. */
  protected readonly dayOpenedLabel = computed(() => {
    const d = this.currentDay();
    if (!d) return '';
    const opened = new Date(d.openedAt);
    return `${opened.getHours().toString().padStart(2, '0')}:${opened.getMinutes().toString().padStart(2, '0')}`;
  });

  /** Handset-class viewport (phones, any orientation). Drives the
   *  bottom-nav swap — tablets keep the top-bar nav. */
  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  /**
   * Are we currently on /cashier/pos? The POS page already owns the
   * bottom-of-screen real estate via its fixed cart bar (on mobile),
   * so the bottom nav has to step aside there to avoid stacking two
   * fixed bars on the same edge. Anywhere else (Transactions) it shows.
   */
  protected readonly isPosRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
      map((url) => url.startsWith('/cashier/pos') || url === '/cashier'),
    ),
    { initialValue: true },
  );

  /** Show the mobile bottom nav only when phone-class AND not on POS. */
  protected readonly showBottomNav = computed(
    () => this.isHandset() && !this.isPosRoute(),
  );

  /**
   * Truly-offline banner — full-width strip below the toolbar so a lost
   * connection is impossible to miss. Distinct from showSyncBadge below,
   * which now handles only the queued-while-online state.
   */
  protected readonly showOfflineBanner = computed(
    () =>
      this.settingsService.settings().offlineModeEnabled && !this.sync.online(),
  );

  /**
   * Sync pill — kept for the "back online but still draining the queue"
   * state. Goes hidden while offline (the banner takes over) and when
   * the queue is empty.
   */
  protected readonly showSyncBadge = computed(
    () => this.sync.pendingCount() > 0 && this.sync.online(),
  );

  ngOnInit(): void {
    // Cashiers subscribe to the same SSE stream as admins, but the backend
    // only routes broadcast (inventory.*) events their way. This keeps the
    // POS grid's stock numbers in sync when another cashier makes a sale,
    // when an admin restocks, or when a refund returns units to inventory.
    this.realtime.start();
    // Offline queue replay runner — scoped to the cashier shell so admins
    // don't get an unused service when they sign in.
    this.sync.start();
    // Cache the current open business day so the POS page can gate
    // checkout and the toolbar can show open/closed state.
    // After refreshing, if no day is open auto-prompt the cashier to
    // open it. Cashiers used to need an admin to walk over and do
    // this; now any logged-in user can open the day with just the
    // opening float. They can still dismiss the dialog and re-trigger
    // from the POS "Open day" banner button.
    this.businessDayService.refreshCurrent().subscribe((day) => {
      if (!day && !this.openDayPromptShown) this.promptOpenDay();
    });
  }

  ngOnDestroy(): void {
    this.realtime.stop();
    this.sync.stop();
  }

  protected retrySync(): void {
    void this.sync.retryNow();
  }

  /**
   * Show the open-day dialog and, on confirm, POST to the backend.
   * Public so the POS page can ping us via the cashier shell (router
   * outlet child) — but practically used by ngOnInit too.
   */
  promptOpenDay(): void {
    if (this.openDayPromptShown) return;
    this.openDayPromptShown = true;
    const ref = this.dialog.open<OpenDayDialog, void, OpenDayDialogResult>(
      OpenDayDialog,
      { width: '420px', panelClass: 'dialog-fullscreen-mobile', autoFocus: false },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) {
        // Dismissed without confirming — allow re-prompt if the
        // cashier reloads or hits the banner button.
        this.openDayPromptShown = false;
        return;
      }
      this.businessDayService.open({ openingFloat: result.openingFloat }).subscribe({
        next: () =>
          this.snackBar.open('Business day opened.', 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.openDayPromptShown = false;
          this.snackBar.open(err.error?.message ?? 'Could not open day.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
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

  /**
   * Ctrl/Cmd+D — pop the cash drawer manually. Lives at the shell
   * level so it works from POS, Transactions, anywhere in the cashier
   * section. preventDefault stops the browser's "Bookmark this page"
   * gesture. Silently no-ops when the helper isn't configured (the
   * browser path can't kick the drawer anyway).
   */
  @HostListener('document:keydown', ['$event'])
  protected onCashierKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      void this.printerService.kickDrawer();
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
