import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

interface RankedRow {
  label: string;
  value: number;
  count: number;
  color?: string;
  percentage: number;
}

@Component({
  selector: 'app-reports-page',
  imports: [
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatButtonModule,
    MatProgressBarModule,
    MatDividerModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly saleService = inject(SaleService);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly userService = inject(UserService);

  protected readonly completed = this.saleService.completedSales;

  protected readonly summary = computed(() => {
    const sales = this.completed();
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    const itemsSold = sales.reduce(
      (sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0),
      0,
    );
    return {
      revenue,
      itemsSold,
      transactions: sales.length,
      averageTicket: sales.length === 0 ? 0 : revenue / sales.length,
    };
  });

  protected readonly topProducts = computed<RankedRow[]>(() => {
    const counts = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const sale of this.completed()) {
      for (const item of sale.items) {
        const entry = counts.get(item.productId) ?? {
          name: item.productName,
          qty: 0,
          revenue: 0,
        };
        entry.qty += item.quantity;
        entry.revenue += item.subtotal;
        counts.set(item.productId, entry);
      }
    }
    const entries = [...counts.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const max = entries[0]?.revenue ?? 1;
    return entries.map((entry) => ({
      label: entry.name,
      value: entry.revenue,
      count: entry.qty,
      percentage: (entry.revenue / max) * 100,
    }));
  });

  protected readonly byCashier = computed<RankedRow[]>(() => {
    const totals = new Map<string, { name: string; revenue: number; count: number }>();
    for (const sale of this.completed()) {
      const entry = totals.get(sale.cashierId) ?? {
        name: sale.cashierName,
        revenue: 0,
        count: 0,
      };
      entry.revenue += sale.total;
      entry.count += 1;
      totals.set(sale.cashierId, entry);
    }
    const entries = [...totals.values()].sort((a, b) => b.revenue - a.revenue);
    const max = entries[0]?.revenue ?? 1;
    return entries.map((entry) => ({
      label: entry.name,
      value: entry.revenue,
      count: entry.count,
      percentage: (entry.revenue / max) * 100,
    }));
  });

  protected readonly byCategory = computed<RankedRow[]>(() => {
    const totals = new Map<string, { name: string; color: string; revenue: number; count: number }>();
    for (const sale of this.completed()) {
      for (const item of sale.items) {
        const product = this.productService.getById(item.productId);
        if (!product) continue;
        const category = this.categoryService.getById(product.categoryId);
        if (!category) continue;
        const entry = totals.get(category.id) ?? {
          name: category.name,
          color: category.color,
          revenue: 0,
          count: 0,
        };
        entry.revenue += item.subtotal;
        entry.count += item.quantity;
        totals.set(category.id, entry);
      }
    }
    const entries = [...totals.values()].sort((a, b) => b.revenue - a.revenue);
    const max = entries[0]?.revenue ?? 1;
    return entries.map((entry) => ({
      label: entry.name,
      value: entry.revenue,
      count: entry.count,
      color: entry.color,
      percentage: (entry.revenue / max) * 100,
    }));
  });
}
