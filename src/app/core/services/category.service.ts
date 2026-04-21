import { Injectable, computed, inject, signal } from '@angular/core';
import { Category } from '../models';
import { CATEGORIES_MOCK } from '../mock-data/categories.mock';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly productService = inject(ProductService);
  private readonly _categories = signal<Category[]>(CATEGORIES_MOCK);

  readonly categories = this._categories.asReadonly();

  readonly categoriesWithCounts = computed(() =>
    this._categories().map((category) => ({
      ...category,
      productCount: this.productService.products().filter((p) => p.categoryId === category.id).length,
    })),
  );

  getById(id: string): Category | undefined {
    return this._categories().find((c) => c.id === id);
  }
}
