import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
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
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { CartService } from '../../../core/services/cart.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Product } from '../../../core/models';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { CheckoutDialog } from './checkout-dialog';
import { QuantityDialog } from './quantity-dialog';
import { StockLimitDialog, StockLimitDialogData } from './stock-limit-dialog';

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
export class PosPage implements AfterViewInit {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly cartService = inject(CartService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly scanner = inject(BarcodeScannerService);

  /** Hide the in-input camera button when the browser can't stream video. */
  protected readonly cameraSupported = this.scanner.isSupported;

  /** Store-level override: lets the cashier oversell past zero stock. */
  protected readonly allowNegativeStock = computed(
    () => this.settingsService.settings().allowNegativeStock,
  );

  protected readonly categories = this.categoryService.categories;
  protected readonly activeCategory = signal<string>('all');
  protected readonly search = signal('');
  protected readonly pendingQuantity = signal<number | null>(null);
  /** Index into filteredProducts() of the tile currently highlighted via keyboard. */
  protected readonly activeIndex = signal<number>(-1);
  /** Mobile-only: whether the bottom-sheet cart is expanded to full-screen. */
  protected readonly cartExpanded = signal<boolean>(false);
  private readonly gridRef = viewChild<ElementRef<HTMLElement>>('productGrid');
  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly catGroupRef = viewChild('catGroup', { read: ElementRef });

  protected readonly filteredProducts = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.activeCategory();
    return this.productService.activeProducts().filter((product) => {
      const matchesCategory = category === 'all' || product.categoryId === category;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.barcode?.includes(term) ?? false) ||
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

  constructor() {
    // Whenever the filtered list changes (cashier types a new search term,
    // clicks a different category, or the product list reloads from the
    // backend), snap the highlighted tile back to index 0 so the next Enter
    // always lands on the first match. -1 when there are no results.
    effect(() => {
      const count = this.filteredProducts().length;
      this.activeIndex.set(count > 0 ? 0 : -1);
    });

    // Capture-phase keydown on the category toggle group so we run *before*
    // Material's own host listener advances the toggle on ArrowDown/ArrowUp.
    // stopImmediatePropagation prevents the key from reaching the Material
    // FocusKeyManager at all — only Left/Right remain as category-switchers.
    effect((onCleanup) => {
      const group = this.catGroupRef()?.nativeElement as HTMLElement | undefined;
      if (!group) return;
      const handler = (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.jumpToGrid(event);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.jumpToSearch(event);
        }
      };
      group.addEventListener('keydown', handler, true);
      onCleanup(() => group.removeEventListener('keydown', handler, true));
    });
  }

  /**
   * Keyboard navigation from the search input:
   *   ←/→     — previous / next tile
   *   ↑/↓     — move one grid row up/down (column count detected from DOM)
   *   Enter   — add the product whose barcode exactly matches the term
   *             (scanner path), else the highlighted tile, else the first
   *             visible. Clears the search after a successful add so the
   *             next scan lands in a clean input.
   * Other keys (typing, shortcuts) pass through unchanged.
   */
  protected onSearchKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'Enter') {
      // Ctrl/Cmd+Enter is the Complete Sale shortcut — let it bubble to the
      // document-level handler without adding the highlighted product first.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();

      const term = this.search().trim();
      if (!term) return;

      // Scanner-friendly path: when the term matches a product's barcode
      // exactly, add that product regardless of what's highlighted. This
      // handles the case where a human was navigating the grid with arrow
      // keys and then scans something — the scan always wins.
      const scanned = this.findByExactBarcode(term);
      if (scanned) {
        this.addToCart(scanned);
        this.clearSearchAndRefocus();
        return;
      }

      const products = this.filteredProducts();
      if (products.length === 0) {
        this.snackBar.open(
          `No product matches "${term}"`,
          'Dismiss',
          { duration: 2000 },
        );
        this.clearSearchAndRefocus();
        return;
      }

      const idx = this.activeIndex();
      const target = products[idx >= 0 ? idx : 0];
      if (target) {
        this.addToCart(target);
        this.clearSearchAndRefocus();
      }
      return;
    }

    // Arrow-key navigation only matters when there's something to navigate.
    if (this.filteredProducts().length === 0) return;

    if (key !== 'ArrowLeft' && key !== 'ArrowRight'
        && key !== 'ArrowUp' && key !== 'ArrowDown') return;

    event.preventDefault();
    const cols = this.detectColumnCount();
    const current = Math.max(0, this.activeIndex());
    let next = current;
    switch (key) {
      case 'ArrowRight': next = current + 1; break;
      case 'ArrowLeft':  next = current - 1; break;
      case 'ArrowDown':  next = current + cols + 1; break;
      case 'ArrowUp':    next = current - cols - 1; break;
    }
    next = Math.max(0, Math.min(this.filteredProducts().length - 1, next));
    if (next !== current || this.activeIndex() < 0) {
      this.activeIndex.set(next);
      this.scrollActiveIntoView(next);
    }
  }

  /**
   * Explicitly focus the search input on first render. The HTML `autofocus`
   * attribute is racey with Angular's view mount — on slow devices or when
   * a dialog opened during navigation the browser often doesn't apply it —
   * so we force it here once the viewChild ref is actually resolved.
   * preventScroll keeps the page from jumping on iOS when the soft keyboard
   * doesn't need to appear (external scanner / physical keyboard).
   */
  ngAfterViewInit(): void {
    queueMicrotask(() => {
      const input = this.searchInputRef()?.nativeElement;
      input?.focus({ preventScroll: true });
    });
  }

  /**
   * Open the camera barcode scanner. On a successful read, treat the
   * result exactly like an Enter-pressed scan — exact-barcode lookup
   * against active products, add to cart if found, snackbar otherwise.
   */
  protected async openCameraScanner(): Promise<void> {
    const code = await this.scanner.scan();
    if (!code) return;
    const product = this.findByExactBarcode(code);
    if (product) {
      this.addToCart(product);
    } else {
      this.snackBar.open(
        `No product with barcode ${code}`,
        'Dismiss',
        { duration: 2500 },
      );
    }
    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  /** Exact (case-sensitive) barcode match across active products. */
  private findByExactBarcode(term: string): Product | undefined {
    return this.productService
      .activeProducts()
      .find((p) => p.barcode === term);
  }

  /**
   * Reset the search input and hand focus back to it. Called after every
   * keyboard-triggered add so a keyboard-wedge scanner can fire the next
   * barcode without concatenating it onto the previous one.
   */
  private clearSearchAndRefocus(): void {
    this.search.set('');
    this.activeIndex.set(-1);
    // Defer so Angular's ngModel write-back settles before we focus.
    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  /**
   * ArrowDown from a focused category toggle: highlight the first visible
   * product tile and return keyboard focus to the search input so that
   * subsequent arrow keys / Enter use the same nav model the cashier is
   * already familiar with.
   */
  protected jumpToGrid(event: Event): void {
    if (this.filteredProducts().length === 0) return;
    event.preventDefault();
    this.activeIndex.set(0);
    this.scrollActiveIntoView(0);
    this.searchInputRef()?.nativeElement.focus();
  }

  /** ArrowUp from a focused category toggle: return focus to the search input
   *  (without selecting a product tile). Left/Right keep switching categories
   *  via Material's built-in toggle-group key manager. */
  protected jumpToSearch(event: Event): void {
    event.preventDefault();
    this.searchInputRef()?.nativeElement.focus();
  }

  private detectColumnCount(): number {
    const grid = this.gridRef()?.nativeElement;
    if (!grid) return 1;
    const tile = grid.querySelector<HTMLElement>('.product-tile');
    if (!tile) return 1;
    const style = getComputedStyle(grid);
    const gapPx = parseFloat(style.columnGap || style.gap || '0') || 0;
    const inner = grid.clientWidth - (parseFloat(style.paddingLeft || '0') || 0)
      - (parseFloat(style.paddingRight || '0') || 0);
    const tileWidth = tile.offsetWidth || 150;
    const cols = Math.floor((inner + gapPx) / (tileWidth + gapPx));
    return Math.max(1, cols);
  }

  private scrollActiveIntoView(index: number): void {
    // Defer so Angular has rendered the class change before we query the DOM.
    queueMicrotask(() => {
      const grid = this.gridRef()?.nativeElement;
      const tile = grid?.querySelectorAll<HTMLElement>('.product-tile')[index];
      tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  protected addToCart(product: Product): void {
    // Always consult the live ProductService signal — stock may have changed
    // via realtime updates since the tile was rendered.
    const fresh = this.productService.getById(product.id) ?? product;
    const allowNegative = this.allowNegativeStock();

    // Hard-stop on zero stock unless the store has opted in to oversells.
    if (fresh.stock === 0 && !allowNegative) {
      this.showStockLimit({ reason: 'out-of-stock', productName: fresh.name, stock: 0 });
      return;
    }

    const existing = this.cart().find((l) => l.product.id === fresh.id);
    const inCart = existing?.quantity ?? 0;
    const available = fresh.stock - inCart;
    if (!allowNegative && available <= 0) {
      this.showStockLimit({ reason: 'at-limit', productName: fresh.name, stock: fresh.stock });
      return;
    }

    const requested = this.pendingQuantity() ?? 1;
    // With allowNegative on, add the full requested quantity regardless of
    // available batches — the backend will drive batches negative.
    const toAdd = allowNegative ? requested : Math.min(requested, available);
    this.cartService.add(fresh, toAdd);

    if (!allowNegative && toAdd < requested) {
      this.showStockLimit({
        reason: 'partial',
        productName: fresh.name,
        stock: fresh.stock,
        requested,
        added: toAdd,
      });
    }
    if (this.pendingQuantity() !== null) {
      this.pendingQuantity.set(null);
    }
  }

  /**
   * Open the stock-limit modal instead of surfacing a snackbar: cashiers
   * glance past toasts at the bottom of the screen, but a modal forces an
   * acknowledgement and prevents ringing up the wrong quantity by accident.
   * De-duped so rapid clicks can't stack modals on top of each other.
   */
  private showStockLimit(data: StockLimitDialogData): void {
    const alreadyOpen = this.dialog.openDialogs.some(
      (d) => d.componentInstance instanceof StockLimitDialog,
    );
    if (alreadyOpen) return;
    this.dialog.open(StockLimitDialog, {
      width: '440px',
      maxWidth: '95vw',
      autoFocus: true,
      data,
    });
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
      panelClass: 'dialog-fullscreen-mobile',
      data: { initial: this.pendingQuantity() ?? 1 },
    });
    ref.afterClosed().subscribe((quantity) => {
      if (typeof quantity === 'number' && quantity > 0) {
        this.pendingQuantity.set(quantity);
      }
      // Return focus to the search input so the cashier can immediately
      // scan/type the product the quantity should apply to — whether they
      // confirmed a value or cancelled out.
      this.searchInputRef()?.nativeElement.focus();
    });
  }

  protected increment(productId: string): void {
    const fresh = this.productService.getById(productId);
    const line = this.cart().find((l) => l.product.id === productId);
    if (!fresh || !line) return;
    if (!this.allowNegativeStock() && line.quantity >= fresh.stock) {
      this.showStockLimit({
        reason: 'at-limit',
        productName: fresh.name,
        stock: fresh.stock,
      });
      return;
    }
    this.cartService.increment(productId);
  }

  /** Per-line helper for the template: is the cart already at max stock? */
  protected isAtMaxStock(productId: string, currentQty: number): boolean {
    if (this.allowNegativeStock()) return false;
    const fresh = this.productService.getById(productId);
    return fresh ? currentQty >= fresh.stock : false;
  }

  protected decrement(productId: string): void {
    this.cartService.decrement(productId);
  }

  protected remove(productId: string): void {
    this.cartService.remove(productId);
  }

  protected clearCart(): void {
    this.cartService.clear();
    this.cartExpanded.set(false);
  }

  protected toggleCart(): void {
    if (this.isEmpty()) return;
    this.cartExpanded.update((v) => !v);
  }

  protected closeCart(): void {
    this.cartExpanded.set(false);
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
      panelClass: ['checkout-dialog-panel', 'dialog-fullscreen-mobile'],
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
        // Silent so admins don't get a "cart cleared" ping for every sale —
        // cart-event notifications are only for mid-sale removals.
        this.cartService.clear({ silent: true });
        this.snackBar.open('Sale completed', 'Dismiss', { duration: 2500 });
        this.cartExpanded.set(false);
      }
      // Return focus to the search input in every close path (confirm or
      // cancel) so a keyboard-wedge scanner's next shot lands in the input.
      queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
    });
  }
}
