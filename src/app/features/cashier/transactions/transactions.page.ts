import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

@Component({
  selector: 'app-transactions-page',
  imports: [
    DatePipe,
    TitleCasePipe,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    MatButtonModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.scss',
})
export class TransactionsPage {
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);

  protected readonly currentUser = this.userService.currentUser;

  protected readonly sales = computed(() => {
    const user = this.currentUser();
    if (!user) return [];
    return this.saleService.byCashier(user.id);
  });

  protected readonly totals = computed(() => {
    const sales = this.sales().filter((s) => s.status === 'completed');
    return {
      transactions: sales.length,
      revenue: sales.reduce((sum, s) => sum + s.total, 0),
      items: sales.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0), 0),
    };
  });

  protected readonly columns = ['id', 'date', 'items', 'payment', 'total', 'status'] as const;
}
