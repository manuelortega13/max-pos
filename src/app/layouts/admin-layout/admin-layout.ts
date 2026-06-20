import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ExpiringBatch } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BackupService } from '../../core/services/backup.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { NotificationService } from '../../core/services/notification.service';
import { SettingsService } from '../../core/services/settings.service';
import { PushService } from '../../core/services/push.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { RefreshService } from '../../core/services/refresh.service';
import { PlaybookPanel } from '../../shared/components/playbook-panel/playbook-panel';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';
import { downloadBlob } from '../../shared/utils/download';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: 'products', label: 'Products', icon: 'inventory_2' },
  { path: 'categories', label: 'Categories', icon: 'category' },
  { path: 'inventory', label: 'Inventory', icon: 'warehouse' },
  { path: 'sales', label: 'Sales', icon: 'receipt_long' },
  { path: 'users', label: 'Users', icon: 'group' },
  { path: 'reports', label: 'Reports', icon: 'bar_chart' },
  { path: 'creditors', label: 'Creditors', icon: 'account_balance_wallet' },
  { path: 'end-of-day', label: 'End of Day', icon: 'event_busy' },
  { path: 'gcash', label: 'GCash', icon: 'smartphone' },
  { path: 'load', label: 'Load', icon: 'sim_card' },
  { path: 'finances', label: 'Finances', icon: 'account_balance' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];

@Component({
  selector: 'app-admin-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatBadgeModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
    MatTooltipModule,
    PlaybookPanel,
    PullToRefreshDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly realtime = inject(RealtimeService);
  private readonly pushService = inject(PushService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly refreshService = inject(RefreshService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly backupService = inject(BackupService);
  protected readonly refreshing = signal(false);
  /** Session latch so the daily client-side auto-download fires at most once
   *  per app load (the effect re-runs whenever settings change). */
  private clientBackupAttempted = false;

  constructor() {
    // Client-side half of daily auto-backup: when the store has auto-backup
    // enabled and this device hasn't downloaded one today, fetch a backup and
    // save it to the admin's computer. Runs once settings have loaded (the
    // effect re-runs when the settings signal resolves from its fallback).
    effect(() => {
      if (!this.settingsService.settings().autoBackupEnabled) return;
      this.maybeClientAutoBackup();
    });
  }

  private maybeClientAutoBackup(): void {
    if (this.clientBackupAttempted) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = 'maxpos.autobackup.lastClientDate';
    let last: string | null = null;
    try {
      last = localStorage.getItem(key);
    } catch {
      /* storage unavailable — fall through and attempt once */
    }
    if (last === today) {
      this.clientBackupAttempted = true;
      return;
    }
    // Latch before the request so a settings re-emit can't double-trigger.
    this.clientBackupAttempted = true;
    this.backupService.exportDatabase().subscribe({
      next: (blob) => {
        downloadBlob(blob, `maxpos-backup-${today}.json`);
        try {
          localStorage.setItem(key, today);
        } catch {
          /* ignore */
        }
      },
      // Leave the date unset on failure so the next app load retries; unlatch
      // so a later settings change this session can try again too.
      error: () => {
        this.clientBackupAttempted = false;
      },
    });
  }

  /** Floating playbook panel state. Persists for the session via the
   *  signal; user can flip it open/closed without re-mounting the
   *  component. Stays open across navigations so admins can keep it
   *  visible while pricing products on different pages. */
  protected readonly playbookOpen = signal(false);

  protected togglePlaybook(): void {
    this.playbookOpen.update((v) => !v);
  }

  protected closePlaybook(): void {
    this.playbookOpen.set(false);
  }

  protected readonly navItems = NAV_ITEMS;
  protected readonly sidenavOpen = signal(true);
  protected readonly currentUser = this.authService.user;
  protected readonly expiringBatches = this.notifications.expiring;
  protected readonly expiringCount = this.notifications.count;
  protected readonly pushSubscribed = this.pushService.subscribed;
  protected readonly pushPermission = this.pushService.permission;

  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.Tablet])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  ngOnInit(): void {
    this.notifications.start();
    this.realtime.start();
    this.pushService.refreshState();
    // Cache the current open business day so the End-of-Day page and
    // the cross-cutting open/closed indicator have data on first render.
    this.businessDayService.refreshCurrent().subscribe();
  }

  ngOnDestroy(): void {
    this.notifications.stop();
    this.realtime.stop();
  }

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  protected goToInventory(): void {
    this.router.navigate(['/admin/inventory']);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  protected async togglePush(): Promise<void> {
    if (this.pushSubscribed()) {
      await this.pushService.disable();
      this.snackBar.open('Push notifications disabled', 'Dismiss', { duration: 2500 });
      return;
    }
    const ok = await this.pushService.enable();
    if (ok) {
      this.snackBar.open('Push notifications enabled', 'Dismiss', { duration: 2500 });
    } else if (this.pushPermission() === 'denied') {
      this.snackBar.open('Browser denied notifications. Check site settings to allow.', 'Dismiss', {
        duration: 4000,
      });
    } else if (this.pushPermission() === 'unsupported') {
      this.snackBar.open('This browser does not support push notifications.', 'Dismiss', {
        duration: 4000,
      });
    } else {
      this.snackBar.open('Push setup failed — see console.', 'Dismiss', { duration: 4000 });
    }
  }

  protected expiryClass(batch: ExpiringBatch): string {
    if (batch.daysUntilExpiry < 0) return 'expiring-item--expired';
    if (batch.daysUntilExpiry <= 7) return 'expiring-item--soon';
    return 'expiring-item--ok';
  }

  protected expiryLabel(batch: ExpiringBatch): string {
    const d = batch.daysUntilExpiry;
    if (d < 0) return `Expired ${-d}d ago`;
    if (d === 0) return 'Expires today';
    if (d === 1) return 'Expires tomorrow';
    return `${d}d left`;
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
}
