import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Category } from '../models';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly productService = inject(ProductService);

  private readonly _categories = signal<Category[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly categoriesWithCounts = computed(() =>
    this._categories().map((category) => ({
      ...category,
      productCount: this.productService
        .products()
        .filter((p) => p.categoryId === category.id).length,
    })),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Category[]>('/api/categories').subscribe({
      next: (categories) => {
        this._categories.set(categories);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  getById(id: string): Category | undefined {
    return this._categories().find((c) => c.id === id);
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    const apiMessage = (err.error && typeof err.error === 'object' && 'message' in err.error)
      ? String((err.error as { message?: unknown }).message)
      : null;
    return apiMessage ?? `Request failed (${err.status})`;
  }
}
