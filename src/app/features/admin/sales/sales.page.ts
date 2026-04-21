import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { SaleStatus } from '../../../core/models';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = SaleStatus | 'all';

@Component({
  selector: 'app-sales-page',
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatMenuModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);

  protected readonly cashiers = this.userService.cashiers;
  protected readonly search = signal('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly cashier = signal<string>('all');

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const cashier = this.cashier();
    return this.saleService.sales().filter((sale) => {
      if (status !== 'all' && sale.status !== status) return false;
      if (cashier !== 'all' && sale.cashierId !== cashier) return false;
      if (!term) return true;
      return (
        sale.id.toLowerCase().includes(term) ||
        sale.cashierName.toLowerCase().includes(term)
      );
    });
  });

  protected readonly columns = [
    'id',
    'date',
    'cashier',
    'items',
    'payment',
    'total',
    'status',
    'actions',
  ] as const;
}
