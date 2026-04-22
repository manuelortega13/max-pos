import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { ProductFormDialog } from './product-form-dialog';

@Component({
  selector: 'app-products-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categories = this.categoryService.categories;
  protected readonly loading = this.productService.loading;
  protected readonly error = this.productService.error;
  protected readonly search = signal('');
  protected readonly categoryFilter = signal<string>('all');

  protected retry(): void {
    this.productService.load();
  }

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
        (product.barcode?.includes(term) ?? false)
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

  protected openCreate(): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'create' },
    });
  }

  protected openEdit(product: Product): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'edit', product },
    });
  }

  protected openDuplicate(product: Product): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { mode: 'duplicate', product },
    });
  }

  protected confirmDelete(product: Product): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete product',
        message: `Delete "${product.name}"? This can't be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete_forever',
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.productService.delete(product.id).subscribe({
        next: () => {
          this.snackBar.open(`Deleted "${product.name}"`, 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          const msg =
            err.error?.message ??
            (err.status === 409 ? 'Cannot delete — product is referenced by existing sales.' : 'Delete failed.');
          this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
