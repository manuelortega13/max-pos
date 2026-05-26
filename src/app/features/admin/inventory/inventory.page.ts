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
import { AuthService } from '../../../core/services/auth.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { CategoryService } from '../../../core/services/category.service';
import { PrinterService, LowStockRow } from '../../../core/services/printer.service';
import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MarkupDialog, MarkupDialogData } from '../../../shared/dialogs/markup-dialog';
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
  private readonly scanner = inject(BarcodeScannerService);
  private readonly printer = inject(PrinterService);
  private readonly settings = inject(SettingsService);
  private readonly authService = inject(AuthService);

  protected readonly cameraSupported = this.scanner.isSupported;

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
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
      // "Out of stock" tile includes negatives so oversold products aren't
      // silently dropped from the count.
      outOfStock: products.filter((p) => p.stock <= 0).length,
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
          p.barcodes.some((b) => b.toLowerCase().includes(term));
        if (!hit) return false;
      }
      switch (stock) {
        case 'low': return p.stock > 0 && p.stock <= 5;
        case 'out': return p.stock <= 0; // includes oversold / negative
        case 'ok':  return p.stock > 5;
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

  protected readonly columns = ['image', 'name', 'category', 'stock', 'cost', 'price', 'markup', 'value', 'actions'] as const;

  /** Current markup % for a product. Returns 0 when cost is missing. */
  protected markupPercent(product: Product): number {
    if (product.cost <= 0) return 0;
    return Math.round(((product.price - product.cost) / product.cost) * 100);
  }

  /** Same chip-class bucketing as the Products page so the visual
   *  language is consistent between the two views. */
  protected markupChipClass(product: Product): string {
    if (product.cost <= 0) return 'status-chip--refunded';
    const m = this.markupPercent(product);
    if (m < 30) return 'status-chip--warn';
    if (m < 60) return 'status-chip--pending';
    if (m <= 120) return 'status-chip--completed';
    return 'status-chip--high';
  }

  protected markupLabel(product: Product): string {
    if (product.cost <= 0) return 'No cost';
    return `${this.markupPercent(product)}%`;
  }

  protected openMarkup(product: Product): void {
    this.dialog.open<MarkupDialog, MarkupDialogData>(MarkupDialog, {
      width: '560px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { product },
    });
  }

  protected categoryName(id: string): string {
    return this.categoryService.getById(id)?.name ?? '—';
  }

  protected chipClass(stock: number): string {
    if (stock < 0) return 'status-chip--oversold';
    if (stock === 0) return 'status-chip--refunded';
    if (stock <= 5) return 'status-chip--warn';
    return 'status-chip--completed';
  }

  protected chipLabel(stock: number): string {
    if (stock < 0) return 'Oversold';
    if (stock === 0) return 'Out of stock';
    if (stock <= 5) return 'Low';
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

  /** Push the scanned barcode straight into the filter search. */
  protected async scanBarcodeIntoSearch(): Promise<void> {
    const code = await this.scanner.scan();
    if (code) this.search.set(code);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.categoryFilter.set('all');
    this.filter.set('all');
  }

  /**
   * Print the restocking sheet: out-of-stock first (alphabetical),
   * then low-stock (urgent first — sorted by remaining stock ascending).
   * Only active products are eligible — inactive SKUs shouldn't show
   * up on a restocking run.
   *
   * Disabled in the UI when both buckets are empty, but we re-check
   * here to keep the method safe if it's ever called from elsewhere.
   */
  protected printLowStock(): void {
    const active = this.productService.products().filter((p) => p.active);
    const toRow = (p: Product): LowStockRow => ({
      name: p.name,
      stock: p.stock,
      cost: p.cost,
    });
    const outOfStock = active
      .filter((p) => p.stock <= 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toRow);
    const lowStock = active
      .filter((p) => p.stock > 0 && p.stock <= 5)
      .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
      .map(toRow);

    if (outOfStock.length === 0 && lowStock.length === 0) {
      this.snackBar.open('Nothing to restock — stock looks healthy.', 'Dismiss', {
        duration: 2500,
      });
      return;
    }

    const s = this.settings.settings();
    void this.printer.printLowStockReport({
      storeName: s.storeName,
      address: s.address,
      phone: s.phone,
      footer: s.receiptFooter,
      currencySymbol: s.currencySymbol,
      generatedAt: new Date().toISOString(),
      generatedByName: this.authService.user()?.name ?? '—',
      outOfStock,
      lowStock,
    });
  }
}
