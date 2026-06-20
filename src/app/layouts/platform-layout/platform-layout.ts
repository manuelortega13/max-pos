import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-platform-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        class="shell__nav"
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset() && sidenavOpen()"
        #sidenav
      >
        <div class="brand">
          <div class="brand__badge"><mat-icon>shield_person</mat-icon></div>
          <div class="brand__text">
            <strong>MaxPOS</strong>
            <small>Platform console</small>
          </div>
        </div>

        <mat-nav-list>
          @for (item of nav; track item.path) {
            <a
              mat-list-item
              [routerLink]="item.path"
              routerLinkActive
              #rla="routerLinkActive"
              [activated]="rla.isActive"
              (click)="closeOnHandset(sidenav)"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        <mat-toolbar class="bar">
          <button mat-icon-button (click)="sidenav.toggle()" aria-label="Toggle menu">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="bar__spacer"></span>
          <button mat-button [matMenuTriggerFor]="acct">
            <mat-icon>account_circle</mat-icon>
            <span class="bar__email">{{ adminEmail() }}</span>
            <mat-icon>arrow_drop_down</mat-icon>
          </button>
          <mat-menu #acct="matMenu">
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>Sign out</span>
            </button>
          </mat-menu>
        </mat-toolbar>

        <main class="page"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .shell {
        height: 100vh;
      }
      .shell__nav {
        width: 240px;
        border-right: 1px solid var(--mat-sys-outline-variant);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.1rem;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .brand__badge {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 0.6rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      .brand__text {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
      }
      .brand__text small {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.75rem;
      }
      .bar {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--mat-sys-surface);
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .bar__spacer {
        flex: 1 1 auto;
      }
      .bar__email {
        margin: 0 0.25rem;
        max-width: 12rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .page {
        display: block;
      }
    `,
  ],
})
export class PlatformLayout {
  private readonly auth = inject(PlatformAuthService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly platformSettings = inject(PlatformSettingsService);

  constructor() {
    // Load platform settings once so pages can format revenue with the
    // platform currency symbol. Non-fatal if it fails (symbol defaults to '$').
    this.platformSettings.load().subscribe({ error: () => {} });
  }

  protected readonly nav: readonly NavItem[] = [
    { path: 'overview', label: 'Overview', icon: 'dashboard' },
    { path: 'stores', label: 'Stores', icon: 'storefront' },
    { path: 'plans', label: 'Plans', icon: 'workspace_premium' },
    { path: 'activity', label: 'Activity', icon: 'history' },
    { path: 'admins', label: 'Platform admins', icon: 'shield_person' },
    { path: 'settings', label: 'Settings', icon: 'settings' },
  ];

  protected readonly sidenavOpen = signal(true);
  protected readonly adminEmail = computed(() => this.auth.admin()?.email ?? '');
  protected readonly isHandset = toSignal(
    this.breakpoints.observe([Breakpoints.Handset, Breakpoints.Tablet]).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected closeOnHandset(sidenav: { close: () => void }): void {
    if (this.isHandset()) sidenav.close();
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/platform/login');
  }
}
