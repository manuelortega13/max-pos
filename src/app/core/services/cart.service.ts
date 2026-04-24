import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CartLine, DiscountInput, Product } from '../models';
import { SettingsService } from './settings.service';

type CartAction = 'DECREMENT' | 'REMOVE' | 'CLEAR';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly settingsService = inject(SettingsService);
  private readonly http = inject(HttpClient);
  private readonly _lines = signal<CartLine[]>([]);
  /** Order-level discount (applied after line discounts, before tax). */
  private readonly _orderDiscount = signal<DiscountInput | null>(null);

  readonly lines = this._lines.asReadonly();
  readonly orderDiscount = this._orderDiscount.asReadonly();
  readonly itemCount = computed(() =>
    this._lines().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** Sum of line.grossTotal − line.discountAmount, rounded per line. */
  readonly subtotal = computed(() =>
    this._lines().reduce((sum, line) => sum + lineNet(line), 0),
  );

  /** Money off from per-line discounts alone. */
  readonly lineDiscountTotal = computed(() =>
    this._lines().reduce((sum, line) => sum + lineDiscountAmount(line), 0),
  );

  /** Money off from the order-level discount alone. */
  readonly orderDiscountAmount = computed(() =>
    computeDiscount(this.subtotal(), this._orderDiscount()),
  );

  /** subtotal minus the order-level discount — the amount that gets taxed. */
  readonly taxable = computed(() =>
    Math.max(0, this.subtotal() - this.orderDiscountAmount()),
  );

  readonly tax = computed(
    () => this.taxable() * this.settingsService.settings().taxRate,
  );

  readonly total = computed(() => this.taxable() + this.tax());
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

  /** Attach (or replace) a per-line discount. Pass `null` to remove. */
  setLineDiscount(productId: string, discount: DiscountInput | null): void {
    this._lines.update((lines) =>
      lines.map((line) => {
        if (line.product.id !== productId) return line;
        const next = { ...line };
        if (discount) next.discount = discount;
        else delete next.discount;
        return next;
      }),
    );
  }

  /** Set (or clear) the order-level discount. */
  setOrderDiscount(discount: DiscountInput | null): void {
    this._orderDiscount.set(discount);
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
    this._orderDiscount.set(null);
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

/** Gross line total (unit_price × qty), rounded to 2 decimals. */
export function lineGross(line: CartLine): number {
  return round2(line.product.price * line.quantity);
}

/** Money off from this line's discount (0 when none). Clamped to lineGross. */
export function lineDiscountAmount(line: CartLine): number {
  return computeDiscount(lineGross(line), line.discount ?? null);
}

/** Net line total after discount. */
export function lineNet(line: CartLine): number {
  return round2(lineGross(line) - lineDiscountAmount(line));
}

/**
 * Given a base amount and a discount input, return the money off.
 * Mirrors SaleService.computeDiscount on the backend: null / zero value
 * → 0; percent → base × value / 100; fixed → the raw value, capped at base.
 */
export function computeDiscount(
  base: number,
  discount: DiscountInput | null,
): number {
  if (!discount || !Number.isFinite(discount.value) || discount.value <= 0) {
    return 0;
  }
  const raw =
    discount.type === 'PERCENT'
      ? (base * discount.value) / 100
      : discount.value;
  return round2(Math.min(raw, base));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
