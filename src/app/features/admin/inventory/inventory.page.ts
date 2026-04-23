import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { RestockPayload } from '../../../core/services/product.service';
import { BatchesDialog } from './batches-dialog';
import { RestockDialog } from './restock-dialog';

type StockFilter = 'all' | 'low' | 'out' | 'ok';

@Component({
  selector: 'app-inventory-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly filter = signal<StockFilter>('all');
  protected readonly search = signal<string>('');
  protected readonly categoryFilter = signal<string>('all');

  protected readonly categories = this.categoryService.categories;

  /**
   * Summary cards describe the whole catalog, not the filtered subset —
   * otherwise "low stock" and "out of stock" counts collapse to 0 the moment
   * the cashier searches for something, which defeats the at-a-glance purpose.
   */
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
    const term = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    const stock = this.filter();

    return products.filter((p) => {
      if (cat !== 'all' && p.categoryId !== cat) return false;
      if (term) {
        const hit =
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode?.toLowerCase().includes(term) ?? false);
        if (!hit) return false;
      }
      switch (stock) {
        case 'low': return p.stock > 0 && p.stock <= 10;
        case 'out': return p.stock === 0;
        case 'ok':  return p.stock > 10;
        case 'all':
        default:    return true;
      }
    });
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.search() !== '' ||
      this.categoryFilter() !== 'all' ||
      this.filter() !== 'all',
  );

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

  protected openRestock(product: Product): void {
    const ref = this.dialog.open(RestockDialog, {
      width: '620px',
      maxWidth: '95vw',
      autoFocus: false,
      panelClass: 'dialog-fullscreen-mobile',
      data: { product },
    });

    ref.afterClosed().subscribe((payload: RestockPayload | undefined) => {
      if (!payload || !payload.quantity || payload.quantity <= 0) return;
      this.productService.restock(product.id, payload).subscribe({
        next: (updated) => {
          const expiryNote = payload.expiryDate ? ` (expires ${payload.expiryDate})` : '';
          this.snackBar.open(
            `Added ${payload.quantity} to "${updated.name}"${expiryNote}`,
            'Dismiss',
            { duration: 2500 },
          );
        },
        error: (err: HttpErrorResponse) => {
          const msg =
            err.error?.message ??
            (err.status === 403 ? 'Only admins can restock.' : 'Restock failed.');
          this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
        },
      });
    });
  }

  protected openBatches(product: Product): void {
    this.dialog.open(BatchesDialog, {
      width: '860px',
      maxWidth: '95vw',
      autoFocus: false,
      panelClass: 'dialog-fullscreen-mobile',
      data: { product },
    });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.categoryFilter.set('all');
    this.filter.set('all');
  }
}
