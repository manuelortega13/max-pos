import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { Page, Product } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { CategoryService } from '../../../core/services/category.service';
import { PrinterService, LowStockRow, InventoryRow } from '../../../core/services/printer.service';
import {
  InventoryStats,
  ProductService,
  RestockPayload,
  StockFilter,
} from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MarkupDialog, MarkupDialogData } from '../../../shared/dialogs/markup-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { BatchesDialog } from './batches-dialog';
import { RestockDialog } from './restock-dialog';

const EMPTY_STATS: InventoryStats = {
  totalProducts: 0,
  totalUnits: 0,
  totalValue: 0,
  lowStock: 0,
  outOfStock: 0,
};

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
    MatPaginatorModule,
    MatProgressBarModule,
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

  // ─── Pagination ───────────────────────────────────────────────
  protected readonly pageSizeOptions = [10, 25, 50, 100];
  protected readonly pageSize = signal(10);
  protected readonly pageIndex = signal(0);

  private readonly fetching = signal(false);
  private readonly _error = signal<string | null>(null);
  protected readonly loading = this.fetching.asReadonly();
  protected readonly error = this._error.asReadonly();

  private readonly emptyPage: Page<Product> = {
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  };

  /**
   * Inputs that drive a table re-fetch. `productService.revision()` is
   * included so a restock (which bumps it) refreshes the current page and
   * the summary automatically.
   */
  private readonly queryParams = computed(() => ({
    search: this.search().trim(),
    categoryId: this.categoryFilter(),
    stock: this.filter(),
    page: this.pageIndex(),
    size: this.pageSize(),
    revision: this.productService.revision(),
  }));

  private readonly pageData = toSignal(
    toObservable(this.queryParams).pipe(
      debounceTime(200),
      switchMap((q) => {
        this.fetching.set(true);
        this._error.set(null);
        return this.productService.inventoryPage(q).pipe(
          catchError((err: HttpErrorResponse) => {
            this._error.set(this.describe(err));
            return of(this.emptyPage);
          }),
        );
      }),
      tap(() => this.fetching.set(false)),
    ),
    { initialValue: this.emptyPage },
  );

  protected readonly rows = computed(() => this.pageData().content);
  protected readonly total = computed(() => this.pageData().totalElements);

  /** Page index capped to the available range so a shrinking filter
   *  result never strands the view on an empty page. */
  protected readonly clampedPageIndex = computed(() => {
    const lastPage = Math.max(0, Math.ceil(this.total() / this.pageSize()) - 1);
    return Math.min(this.pageIndex(), lastPage);
  });

  /**
   * Summary cards: whole-catalog totals from a dedicated endpoint
   * (deliberately independent of the table's filters). Re-fetched when the
   * catalogue changes (revision bump on restock / other mutations).
   */
  protected readonly totals = toSignal(
    toObservable(computed(() => this.productService.revision())).pipe(
      switchMap(() =>
        this.productService.inventorySummary().pipe(catchError(() => of(EMPTY_STATS))),
      ),
    ),
    { initialValue: EMPTY_STATS },
  );

  protected readonly hasActiveFilters = computed(
    () => this.search() !== '' || this.categoryFilter() !== 'all' || this.filter() !== 'all',
  );

  protected readonly columns = [
    'image',
    'name',
    'category',
    'stock',
    'cost',
    'price',
    'markup',
    'value',
    'actions',
  ] as const;

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // Filter mutators reset to the first page so a narrower filter doesn't
  // leave the view past the new last page.
  protected setSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
  }

  protected setCategory(value: string): void {
    this.categoryFilter.set(value);
    this.pageIndex.set(0);
  }

  protected setStock(value: StockFilter): void {
    this.filter.set(value);
    this.pageIndex.set(0);
  }

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
          // restock() bumps productService.revision(), which re-fetches
          // the current page and the summary — no manual reload needed.
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
    if (code) this.setSearch(code);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.categoryFilter.set('all');
    this.filter.set('all');
    this.pageIndex.set(0);
  }

  /**
   * Print the restocking sheet: out-of-stock first (alphabetical), then
   * low-stock (urgent first — by remaining stock ascending). Only active
   * products are eligible. Fetches the full active set from the server
   * (the printout covers the whole catalog, not the visible page).
   */
  protected printLowStock(): void {
    this.productService.inventoryExport({ activeOnly: true }).subscribe({
      next: (active) => {
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
      },
      error: () =>
        this.snackBar.open('Could not load products to print.', 'Dismiss', { duration: 3000 }),
    });
  }

  /**
   * Print the inventory sheet — exactly the rows matching the current
   * filters (the whole matching set, not just the visible page), sorted by
   * name, with a note of any active filters.
   */
  protected printInventory(): void {
    this.productService
      .inventoryExport({
        search: this.search().trim(),
        categoryId: this.categoryFilter(),
        stock: this.filter(),
      })
      .subscribe({
        next: (products) => {
          const rows: InventoryRow[] = products
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => ({
              name: p.name,
              sku: p.sku,
              category: this.categoryName(p.categoryId),
              stock: p.stock,
              cost: p.cost,
              price: p.price,
            }));

          if (rows.length === 0) {
            this.snackBar.open('No products to print for the current filters.', 'Dismiss', {
              duration: 2500,
            });
            return;
          }

          const s = this.settings.settings();
          void this.printer.printInventoryReport({
            storeName: s.storeName,
            address: s.address,
            phone: s.phone,
            footer: s.receiptFooter,
            currencySymbol: s.currencySymbol,
            generatedAt: new Date().toISOString(),
            generatedByName: this.authService.user()?.name ?? '—',
            filterNote: this.filterNote(),
            rows,
          });
        },
        error: () =>
          this.snackBar.open('Could not load products to print.', 'Dismiss', { duration: 3000 }),
      });
  }

  /** Human-readable summary of the active filters for the printout header. */
  private filterNote(): string {
    const parts: string[] = [];
    const stock = this.filter();
    if (stock !== 'all') {
      const label = { low: 'low stock', out: 'out of stock', ok: 'in stock' }[stock];
      parts.push(label);
    }
    if (this.categoryFilter() !== 'all') {
      parts.push(`category "${this.categoryName(this.categoryFilter())}"`);
    }
    const term = this.search().trim();
    if (term) parts.push(`search "${term}"`);
    return parts.join(', ');
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Admin access required.';
    return err.error?.message ?? `Request failed (${err.status})`;
  }
}
