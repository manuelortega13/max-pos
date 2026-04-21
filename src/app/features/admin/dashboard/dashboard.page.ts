import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    DecimalPipe,
    TitleCasePipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatDividerModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly saleService = inject(SaleService);
  private readonly productService = inject(ProductService);
  private readonly userService = inject(UserService);

  protected readonly todayRevenue = this.saleService.todayRevenue;
  protected readonly todayTransactions = this.saleService.todayTransactionCount;
  protected readonly averageTicket = this.saleService.averageTicket;
  protected readonly activeCashiers = computed(() => this.userService.activeCashiers().length);
  protected readonly lowStock = this.productService.lowStockProducts;
  protected readonly recentSales = computed(() => this.saleService.sales().slice(0, 5));

  protected readonly saleColumns = ['id', 'date', 'cashier', 'items', 'total', 'status'] as const;
}
