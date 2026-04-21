import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

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
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly navItems = NAV_ITEMS;
  protected readonly sidenavOpen = signal(true);

  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.Tablet])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  protected exit(): void {
    this.router.navigate(['/']);
  }
}
