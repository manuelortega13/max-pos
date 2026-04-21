import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CartService } from '../../../core/services/cart.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { Product } from '../../../core/models';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { CheckoutDialog } from './checkout-dialog';
import { QuantityDialog } from './quantity-dialog';

@Component({
  selector: 'app-pos-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pos.page.html',
  styleUrl: './pos.page.scss',
})
export class PosPage {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly cartService = inject(CartService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categories = this.categoryService.categories;
  protected readonly activeCategory = signal<string>('all');
  protected readonly search = signal('');
  protected readonly pendingQuantity = signal<number | null>(null);

  protected readonly filteredProducts = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.activeCategory();
    return this.productService.activeProducts().filter((product) => {
      const matchesCategory = category === 'all' || product.categoryId === category;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.barcode.includes(term) ||
        product.sku.toLowerCase().includes(term)
      );
    });
  });

  protected readonly cart = this.cartService.lines;
  protected readonly subtotal = this.cartService.subtotal;
  protected readonly tax = this.cartService.tax;
  protected readonly total = this.cartService.total;
  protected readonly itemCount = this.cartService.itemCount;
  protected readonly isEmpty = this.cartService.isEmpty;

  protected addToCart(product: Product): void {
    if (product.stock === 0) {
      this.snackBar.open(`${product.name} is out of stock`, 'Dismiss', { duration: 2000 });
      return;
    }
    const quantity = this.pendingQuantity() ?? 1;
    this.cartService.add(product, quantity);
    if (this.pendingQuantity() !== null) {
      this.pendingQuantity.set(null);
    }
  }

  protected clearPendingQuantity(): void {
    this.pendingQuantity.set(null);
  }

  protected openQuantityDialog(): void {
    if (this.dialog.openDialogs.length > 0) return;
    const ref = this.dialog.open(QuantityDialog, {
      width: '460px',
      maxWidth: '95vw',
      autoFocus: false,
      data: { initial: this.pendingQuantity() ?? 1 },
    });
    ref.afterClosed().subscribe((quantity) => {
      if (typeof quantity === 'number' && quantity > 0) {
        this.pendingQuantity.set(quantity);
      }
    });
  }

  protected increment(productId: string): void {
    this.cartService.increment(productId);
  }

  protected decrement(productId: string): void {
    this.cartService.decrement(productId);
  }

  protected remove(productId: string): void {
    this.cartService.remove(productId);
  }

  protected clearCart(): void {
    this.cartService.clear();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.dialog.openDialogs.length > 0) return;

    const isChargeShortcut = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
    if (isChargeShortcut) {
      if (this.isEmpty()) return;
      event.preventDefault();
      this.checkout();
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      this.openQuantityDialog();
    }
  }

  protected checkout(): void {
    if (this.isEmpty()) return;
    const ref = this.dialog.open(CheckoutDialog, {
      width: '800px',
      maxWidth: '95vw',
      panelClass: 'checkout-dialog-panel',
      autoFocus: false,
      data: {
        subtotal: this.subtotal(),
        tax: this.tax(),
        total: this.total(),
        lines: this.cart(),
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.cartService.clear();
        this.snackBar.open('Sale completed', 'Dismiss', { duration: 2500 });
      }
    });
  }
}
