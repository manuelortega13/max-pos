import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

@Component({
  selector: 'app-products-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatMenuModule,
    MatChipsModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products.page.html',
  styleUrl: './products.page.scss',
})
export class ProductsPage {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);

  protected readonly categories = this.categoryService.categories;
  protected readonly search = signal('');
  protected readonly categoryFilter = signal<string>('all');

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.productService.products().filter((product) => {
      const matchesCategory = category === 'all' || product.categoryId === category;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode.includes(term)
      );
    });
  });

  protected readonly columns = [
    'image',
    'name',
    'sku',
    'category',
    'price',
    'stock',
    'status',
    'actions',
  ] as const;

  protected categoryName(categoryId: string): string {
    return this.categoryService.getById(categoryId)?.name ?? '—';
  }

  protected stockChipClass(stock: number): string {
    if (stock === 0) return 'status-chip--refunded';
    if (stock <= 10) return 'status-chip--warn';
    return 'status-chip--completed';
  }
}
