import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CartLine, Product } from '../models';
import { SettingsService } from './settings.service';

type CartAction = 'DECREMENT' | 'REMOVE' | 'CLEAR';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly settingsService = inject(SettingsService);
  private readonly http = inject(HttpClient);
  private readonly _lines = signal<CartLine[]>([]);

  readonly lines = this._lines.asReadonly();
  readonly itemCount = computed(() =>
    this._lines().reduce((sum, line) => sum + line.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this._lines().reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  );
  readonly tax = computed(() => this.subtotal() * this.settingsService.settings().taxRate);
  readonly total = computed(() => this.subtotal() + this.tax());
  readonly isEmpty = computed(() => this._lines().length === 0);

  add(product: Product, quantity = 1): void {
    this._lines.update((lines) => {
      const existing = lines.find((line) => line.product.id === product.id);
      if (existing) {
        return lines.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...lines, { product, quantity }];
    });
  }

  setQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this._lines.update((lines) =>
      lines.map((line) =>
        line.product.id === productId ? { ...line, quantity } : line,
      ),
    );
  }

  increment(productId: string): void {
    this._lines.update((lines) =>
      lines.map((line) =>
        line.product.id === productId
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      ),
    );
  }

  decrement(productId: string): void {
    const line = this._lines().find((l) => l.product.id === productId);
    if (!line) return;
    const previousQty = line.quantity;
    const remaining = previousQty - 1;

    if (remaining <= 0) {
      this._lines.update((lines) => lines.filter((l) => l.product.id !== productId));
      this.reportRemoval(line.product, previousQty, 0, 'REMOVE');
    } else {
      this._lines.update((lines) =>
        lines.map((l) => (l.product.id === productId ? { ...l, quantity: remaining } : l)),
      );
      this.reportRemoval(line.product, previousQty, remaining, 'DECREMENT');
    }
  }

  remove(productId: string): void {
    const line = this._lines().find((l) => l.product.id === productId);
    this._lines.update((lines) => lines.filter((l) => l.product.id !== productId));
    if (line) {
      this.reportRemoval(line.product, line.quantity, 0, 'REMOVE');
    }
  }

  /**
   * Clear the cart. Pass `{ silent: true }` after a completed sale — the
   * checkout flow already cleared it intentionally, so notifying admins
   * would be noise. User-initiated clears (trash-sweep button) use the
   * default, which fans out a 'CLEAR' cart-event.
   */
  clear(options: { silent?: boolean } = {}): void {
    const hadItems = this._lines().length > 0;
    this._lines.set([]);
    if (hadItems && !options.silent) {
      this.reportRemoval(null, 0, 0, 'CLEAR');
    }
  }

  /** Fire-and-forget — admin notifications shouldn't block the cashier. */
  private reportRemoval(
    product: Product | null,
    previousQty: number,
    remainingQty: number,
    action: CartAction,
  ): void {
    this.http
      .post('/api/cart-events/removed', {
        productId: product?.id ?? 'n/a',
        productName: product?.name ?? 'the cart',
        previousQty: previousQty || 1,
        remainingQty,
        action,
      })
      .subscribe({
        error: () => {
          /* silent — failing to notify shouldn't break the POS */
        },
      });
  }
}
