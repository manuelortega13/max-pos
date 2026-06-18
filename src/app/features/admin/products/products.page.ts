import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { Page, Product } from '../../../core/models';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MarkupDialog, MarkupDialogData } from '../../../shared/dialogs/markup-dialog';
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
    MatPaginatorModule,
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
  private readonly scanner = inject(BarcodeScannerService);

  protected readonly cameraSupported = this.scanner.isSupported;

  protected readonly categories = this.categoryService.categories;
  protected readonly search = signal('');
  protected readonly categoryFilter = signal<string>('all');

  // ─── Pagination ───────────────────────────────────────────────
  protected readonly pageSizeOptions = [10, 25, 50, 100];
  protected readonly pageSize = signal(10);
  protected readonly pageIndex = signal(0);

  private readonly fetching = signal(false);
  private readonly _error = signal<string | null>(null);
  protected readonly loading = this.fetching.asReadonly();
  protected readonly error = this._error.asReadonly();

  /** Bumped to force a re-fetch of the current page after a failed load. */
  private readonly reloadTick = signal(0);

  private readonly emptyPage: Page<Product> = {
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  };

  /**
   * All inputs that should trigger a fetch. `productService.revision()`
   * is included so any create/update/delete/restock (and SSE-driven
   * inventory reloads) refreshes the current page automatically — the
   * mutation dialogs call the service directly, so we don't need to
   * subscribe to each one's result here.
   */
  private readonly queryParams = computed(() => ({
    search: this.search().trim(),
    categoryId: this.categoryFilter(),
    page: this.pageIndex(),
    size: this.pageSize(),
    revision: this.productService.revision(),
    tick: this.reloadTick(),
  }));

  private readonly pageData = toSignal(
    toObservable(this.queryParams).pipe(
      debounceTime(200),
      switchMap((q) => {
        this.fetching.set(true);
        this._error.set(null);
        return this.productService.page(q).pipe(
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

  protected readonly columns = [
    'image',
    'name',
    'sku',
    'category',
    'price',
    'markup',
    'stock',
    'status',
    'actions',
  ] as const;

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
  }

  protected setCategory(value: string): void {
    this.categoryFilter.set(value);
    this.pageIndex.set(0);
  }

  protected retry(): void {
    this.reloadTick.update((t) => t + 1);
  }

  /** Current markup % for a product. Returns 0 (and the chip class
   *  flags it) when cost is missing — markup math is undefined there. */
  protected markupPercent(product: Product): number {
    if (product.cost <= 0) return 0;
    return Math.round(((product.price - product.cost) / product.cost) * 100);
  }

  /** Bucket the markup % into one of the playbook's health bands so
   *  the table at-a-glance flags which products need attention. The
   *  thresholds reflect the playbook's category mix recommendations:
   *  <30% is thin even for soft drinks, 60%+ is healthy, 120%+ is
   *  cooked-food territory (or a setup oddity worth verifying). */
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

  protected categoryName(categoryId: string): string {
    return this.categoryService.getById(categoryId)?.name ?? '—';
  }

  protected stockChipClass(stock: number): string {
    if (stock === 0) return 'status-chip--refunded';
    if (stock <= 5) return 'status-chip--warn';
    return 'status-chip--completed';
  }

  /** Dump the scanned barcode into the list's search so the admin can
   *  locate the existing product matching a physical barcode. */
  protected async scanBarcodeIntoSearch(): Promise<void> {
    const code = await this.scanner.scan();
    if (code) this.setSearch(code);
  }

  protected openCreate(): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'create' },
    });
  }

  protected openEdit(product: Product): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'edit', product },
    });
  }

  protected openDuplicate(product: Product): void {
    this.dialog.open(ProductFormDialog, {
      width: '820px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'duplicate', product },
    });
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

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server. Is the backend running?';
    if (err.status === 401) return 'Not authenticated.';
    if (err.status === 403) return 'Not authorized to view products.';
    return err.error?.message ?? `Request failed (${err.status})`;
  }
}
