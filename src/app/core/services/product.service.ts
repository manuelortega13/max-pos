import { Injectable, computed, signal } from '@angular/core';
import { Product } from '../models';
import { PRODUCTS_MOCK } from '../mock-data/products.mock';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly _products = signal<Product[]>(PRODUCTS_MOCK);

  readonly products = this._products.asReadonly();
  readonly activeProducts = computed(() => this._products().filter((p) => p.active));
  readonly lowStockProducts = computed(() =>
    this._products().filter((p) => p.active && p.stock > 0 && p.stock <= 10),
  );
  readonly outOfStockProducts = computed(() => this._products().filter((p) => p.stock === 0));

  getById(id: string): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  getByCategory(categoryId: string): Product[] {
    return this._products().filter((p) => p.categoryId === categoryId);
  }
}
