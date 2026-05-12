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
import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { CartLine, Product } from '../../../core/models';
import {
  lineDiscountAmount,
  lineGross,
  lineNet,
} from '../../../core/services/cart.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import {
  DiscountDialog,
  DiscountDialogData,
  DiscountDialogResult,
} from '../../../shared/dialogs/discount-dialog';
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

  /** Active A-Z filter — 'all' means no letter restriction. */
  protected readonly activeLetter = signal<string>('all');
  protected readonly search = signal('');

  /**
   * Letters that actually appear as the first character of at least one
   * active product, sorted A-Z. Used to render the filter strip so the
   * cashier never sees a dead letter with no matches behind it.
   */
  protected readonly availableLetters = computed(() => {
    const seen = new Set<string>();
    for (const p of this.productService.activeProducts()) {
      const c = p.name.charAt(0).toUpperCase();
      if (c >= 'A' && c <= 'Z') seen.add(c);
    }
    return Array.from(seen).sort();
  });
  protected readonly pendingQuantity = signal<number | null>(null);
  /** Index into filteredProducts() of the tile currently highlighted via keyboard. */
  protected readonly activeIndex = signal<number>(-1);
  /** Mobile-only: whether the bottom-sheet cart is expanded to full-screen. */
  protected readonly cartExpanded = signal<boolean>(false);
  /**
   * Index of the cart line the cashier is navigating with keyboard focus
   * (enter with F4). `null` means we're not in cart-navigation mode — the
   * usual search-input focus applies.
   */
  protected readonly cartFocusIndex = signal<number | null>(null);
  private readonly gridRef = viewChild<ElementRef<HTMLElement>>('productGrid');
  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly letterGroupRef = viewChild('letterGroup', { read: ElementRef });

  protected readonly filteredProducts = computed(() => {
    const term = this.search().trim().toLowerCase();
    const letter = this.activeLetter();
    const matches = this.productService.activeProducts().filter((product) => {
      const matchesLetter =
        letter === 'all' || product.name.charAt(0).toUpperCase() === letter;
      if (!matchesLetter) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.barcode?.includes(term) ?? false) ||
        product.sku.toLowerCase().includes(term)
      );
    });
    // Sort A→Z by name so letter buckets read naturally and the grid
    // doesn't reshuffle by insertion order. localeCompare keeps accented
    // names ordered correctly for non-ASCII locales.
    return matches.sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly cart = this.cartService.lines;
  protected readonly subtotal = this.cartService.subtotal;
  protected readonly tax = this.cartService.tax;
  protected readonly total = this.cartService.total;
  protected readonly itemCount = this.cartService.itemCount;
  protected readonly isEmpty = this.cartService.isEmpty;
  protected readonly orderDiscount = this.cartService.orderDiscount;
  protected readonly orderDiscountAmount = this.cartService.orderDiscountAmount;
  protected readonly lineDiscountTotal = this.cartService.lineDiscountTotal;

  // Template helpers — keep math in one place (cart.service.ts).
  protected lineGross = lineGross;
  protected lineNet = lineNet;
  protected lineDiscountAmount = lineDiscountAmount;

  constructor() {
    // Whenever the filtered list changes (cashier types a new search term,
    // picks a different A-Z letter, or the product list reloads from the
    // backend), snap the highlighted tile back to index 0 so the next Enter
    // always lands on the first match. -1 when there are no results.
    effect(() => {
      const count = this.filteredProducts().length;
      this.activeIndex.set(count > 0 ? 0 : -1);
    });

    // Capture-phase keydown on the A-Z toggle group so we run *before*
    // Material's own host listener advances the toggle on ArrowDown/ArrowUp.
    // stopImmediatePropagation prevents the key from reaching the Material
    // FocusKeyManager at all — only Left/Right remain as letter-switchers.
    effect((onCleanup) => {
      const group = this.letterGroupRef()?.nativeElement as HTMLElement | undefined;
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

      // Scanner-friendly path: when there's a term AND it exactly matches
      // a product's barcode, add that product regardless of what's
      // highlighted. The scan always wins over arrow-key navigation.
      if (term) {
        const scanned = this.findByExactBarcode(term);
        if (scanned) {
          this.addToCart(scanned);
          this.clearSearchAndRefocus();
          return;
        }
      }

      const products = this.filteredProducts();
      if (products.length === 0) {
        // Only show "no matches" when the cashier actually typed
        // something. An empty search + empty grid is just an empty
        // store — silently no-op.
        if (term) {
          this.snackBar.open(
            `No product matches "${term}"`,
            'Dismiss',
            { duration: 2000 },
          );
          this.clearSearchAndRefocus();
        }
        return;
      }

      // Empty search + visible products: Enter still adds the
      // currently highlighted tile (activeIndex stays at 0 by default
      // via the filteredProducts effect), so the cashier doesn't have
      // to type something just to confirm an arrow-key selection.
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
      case 'ArrowDown':  next = current + cols; break;
      case 'ArrowUp':    next = current - cols; break;
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
   * ArrowDown from a focused A-Z toggle: highlight the first visible
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

  /** ArrowUp from a focused A-Z toggle: return focus to the search input
   *  (without selecting a product tile). Left/Right keep switching letters
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

  /** Select-all on focus so a cashier can type the replacement in one tap. */
  protected onQtyInputFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    // queueMicrotask because iOS Safari ignores .select() called
    // synchronously from the focus event in some PWA contexts.
    queueMicrotask(() => input.select());
  }

  /** Commit the typed quantity on change (fires on blur / Enter). */
  protected onQtyInputChange(productId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const line = this.cart().find((l) => l.product.id === productId);
    const currentQty = line?.quantity ?? 1;
    const parsed = parseInt(input.value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      // Garbage / empty / 0 — revert to what's actually in the cart.
      input.value = String(currentQty);
      return;
    }

    const fresh = this.productService.getById(productId);
    if (fresh && !this.allowNegativeStock() && parsed > fresh.stock) {
      // Clamp to stock ceiling and surface the limit modal so the cashier
      // knows why their typed value didn't fully stick.
      this.cartService.setQuantity(productId, fresh.stock);
      input.value = String(fresh.stock);
      this.showStockLimit({
        reason: 'at-limit',
        productName: fresh.name,
        stock: fresh.stock,
      });
      return;
    }

    this.cartService.setQuantity(productId, parsed);
    input.value = String(parsed);
  }

  /** Enter should blur the input so (change) fires and the value commits. */
  protected commitQty(event: Event): void {
    (event.target as HTMLInputElement | null)?.blur();
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

  /** Open the discount dialog scoped to a single cart line. */
  protected openLineDiscount(line: CartLine): void {
    const base = this.lineGross(line);
    if (base <= 0) return;
    const ref = this.dialog.open<DiscountDialog, DiscountDialogData, DiscountDialogResult>(
      DiscountDialog,
      {
        width: '480px',
        panelClass: 'dialog-fullscreen-mobile',
        data: {
          target: line.product.name,
          baseAmount: base,
          current: line.discount ?? null,
        },
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.cartService.setLineDiscount(line.product.id, result.discount);
    });
  }

  /** Open the discount dialog scoped to the whole sale. */
  protected openOrderDiscount(): void {
    const base = this.subtotal();
    if (base <= 0) return;
    const ref = this.dialog.open<DiscountDialog, DiscountDialogData, DiscountDialogResult>(
      DiscountDialog,
      {
        width: '480px',
        panelClass: 'dialog-fullscreen-mobile',
        data: {
          target: 'sale total',
          baseAmount: base,
          current: this.orderDiscount(),
        },
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.cartService.setOrderDiscount(result.discount);
    });
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
    const evt = event;
    if (this.dialog.openDialogs.length > 0) return;

    // Shift+F4 — jump straight to the order-level discount dialog.
    if (evt.key === 'F4' && evt.shiftKey) {
      evt.preventDefault();
      this.cartFocusIndex.set(null);
      if (!this.isEmpty()) this.openOrderDiscount();
      return;
    }

    // Cart-navigation mode — only active once F4 has been pressed once.
    if (this.cartFocusIndex() !== null) {
      if (evt.key === 'ArrowUp') {
        evt.preventDefault();
        this.moveCartFocus(-1);
        return;
      }
      if (evt.key === 'ArrowDown' || evt.key === 'F4') {
        evt.preventDefault();
        this.moveCartFocus(+1);
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.openLineDiscountAtFocus();
        return;
      }
      if (evt.key === 'Escape') {
        evt.preventDefault();
        this.exitCartFocus();
        return;
      }
      // Any other key quietly exits the mode so normal typing resumes.
      this.exitCartFocus();
    }

    const isChargeShortcut = (evt.ctrlKey || evt.metaKey) && evt.key === 'Enter';
    if (isChargeShortcut) {
      if (this.isEmpty()) return;
      evt.preventDefault();
      this.checkout();
      return;
    }

    // F4 (no modifier) — enter cart-navigation mode if the cart has items.
    if (evt.key === 'F4' && !evt.shiftKey && this.cartFocusIndex() === null) {
      evt.preventDefault();
      if (!this.isEmpty()) this.enterCartFocus();
      return;
    }

    if (evt.key === 'F3') {
      evt.preventDefault();
      this.openQuantityDialog();
    }
  }

  private enterCartFocus(): void {
    this.cartFocusIndex.set(0);
    // Release the search input so arrow keys reach the document-level
    // handler instead of moving the caret.
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private exitCartFocus(): void {
    this.cartFocusIndex.set(null);
    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  private moveCartFocus(delta: number): void {
    const count = this.cart().length;
    if (count === 0) {
      this.cartFocusIndex.set(null);
      return;
    }
    const current = this.cartFocusIndex() ?? 0;
    this.cartFocusIndex.set((current + delta + count) % count);
  }

  private openLineDiscountAtFocus(): void {
    const idx = this.cartFocusIndex();
    if (idx === null) return;
    const line = this.cart()[idx];
    this.cartFocusIndex.set(null);
    if (line) this.openLineDiscount(line);
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
        orderDiscount: this.orderDiscount(),
        orderDiscountAmount: this.orderDiscountAmount(),
        lineDiscountTotal: this.lineDiscountTotal(),
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
