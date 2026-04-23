import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { RealtimeService } from '../../core/services/realtime.service';

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

  protected readonly currentUser = this.authService.user;
  protected readonly cartItemCount = this.cartService.itemCount;

  ngOnInit(): void {
    // Cashiers subscribe to the same SSE stream as admins, but the backend
    // only routes broadcast (inventory.*) events their way. This keeps the
    // POS grid's stock numbers in sync when another cashier makes a sale,
    // when an admin restocks, or when a refund returns units to inventory.
    this.realtime.start();
  }

  ngOnDestroy(): void {
    this.realtime.stop();
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
