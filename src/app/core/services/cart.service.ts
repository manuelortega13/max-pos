import { Injectable, computed, inject, signal } from '@angular/core';
import { CartLine, Product } from '../models';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly settingsService = inject(SettingsService);
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
    this.setQuantity(productId, line.quantity - 1);
  }

  remove(productId: string): void {
    this._lines.update((lines) => lines.filter((line) => line.product.id !== productId));
  }

  clear(): void {
    this._lines.set([]);
  }
}
