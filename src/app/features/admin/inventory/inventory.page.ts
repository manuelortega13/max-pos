import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StockFilter = 'all' | 'low' | 'out' | 'ok';

@Component({
  selector: 'app-inventory-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventory.page.html',
  styleUrl: './inventory.page.scss',
})
export class InventoryPage {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);

  protected readonly filter = signal<StockFilter>('all');

  protected readonly totals = computed(() => {
    const products = this.productService.products();
    const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
    return {
      totalProducts: products.length,
      totalUnits,
      totalValue,
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= 10).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
    };
  });

  protected readonly rows = computed(() => {
    const products = this.productService.products();
    switch (this.filter()) {
      case 'low':
        return products.filter((p) => p.stock > 0 && p.stock <= 10);
      case 'out':
        return products.filter((p) => p.stock === 0);
      case 'ok':
        return products.filter((p) => p.stock > 10);
      case 'all':
      default:
        return products;
    }
  });

  protected readonly columns = ['image', 'name', 'category', 'stock', 'cost', 'value', 'actions'] as const;

  protected categoryName(id: string): string {
    return this.categoryService.getById(id)?.name ?? '—';
  }

  protected chipClass(stock: number): string {
    if (stock === 0) return 'status-chip--refunded';
    if (stock <= 10) return 'status-chip--warn';
    return 'status-chip--completed';
  }

  protected chipLabel(stock: number): string {
    if (stock === 0) return 'Out of stock';
    if (stock <= 10) return 'Low';
    return 'In stock';
  }
}
