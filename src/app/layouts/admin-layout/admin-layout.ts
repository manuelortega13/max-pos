import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
import { NotificationService } from '../../core/services/notification.service';
import { PushService } from '../../core/services/push.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { RefreshService } from '../../core/services/refresh.service';
import { PullToRefreshDirective } from '../../shared/directives/pull-to-refresh.directive';

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
  protected readonly refreshing = signal(false);

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
      this.snackBar.open(
        'Browser denied notifications. Check site settings to allow.',
        'Dismiss',
        { duration: 4000 },
      );
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
