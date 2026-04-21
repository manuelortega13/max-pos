import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { CartService } from '../../core/services/cart.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-cashier-layout',
  imports: [
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
export class CashierLayout {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly cartService = inject(CartService);

  protected readonly currentUser = this.userService.currentUser;
  protected readonly cartItemCount = this.cartService.itemCount;

  protected exit(): void {
    this.router.navigate(['/']);
  }
}
