import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ExpiringBatch, Product, ProductBatch, ProductUpsertRequest } from '../models';
import { RealtimeService } from './realtime.service';

export interface RestockPayload {
  readonly quantity: number;
  readonly expiryDate?: string | null;
  readonly costPerUnit?: number | null;
  readonly note?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly realtime = inject(RealtimeService);

  private readonly _products = signal<Product[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private loaded = false;

  readonly products = this._products.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly activeProducts = computed(() => this._products().filter((p) => p.active));
  readonly lowStockProducts = computed(() =>
    this._products().filter((p) => p.active && p.stock > 0 && p.stock <= 10),
  );
  // Includes oversold products (stock < 0) so the dashboard panel surfaces
  // them alongside exact-zero stock — both need admin attention.
  readonly outOfStockProducts = computed(() => this._products().filter((p) => p.stock <= 0));

  constructor() {
    this.load();

    // Refresh product list when the backend signals inventory changed (new
    // sale, refund, restock, write-off, etc.). Every role can receive
    // inventory.* via the publishToAll broadcast, so this effect works for
    // both the admin and cashier shells.
    effect(() => {
      const event = this.realtime.latestEvent();
      if (event && event.type === 'inventory.changed') {
        this.load();
      }
    });

    // Reload whenever the SSE stream (re)connects. SSE doesn't replay
    // history, so any inventory.changed events fired while the phone was
    // backgrounded and the stream was suspended are lost to us — the
    // safest recovery is a full reload the moment we're back online.
    effect(() => {
      if (this.realtime.connected()) {
        this.load();
      }
    });
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Product[]>('/api/products').subscribe({
      next: (products) => {
        this._products.set(products);
        this._loading.set(false);
        this.loaded = true;
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  ensureLoaded(): void {
    if (!this.loaded && !this._loading()) this.load();
  }

  getById(id: string): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  getByCategory(categoryId: string): Product[] {
    return this._products().filter((p) => p.categoryId === categoryId);
  }

  create(request: ProductUpsertRequest): Observable<Product> {
    return this.http.post<Product>('/api/products', request).pipe(
      // Prepend so the freshly-created product shows up at the top of the list
      // (the backend also orders newest-first, so this matches a fresh GET).
      tap((product) => this._products.update((list) => [product, ...list])),
    );
  }

  update(id: string, request: ProductUpsertRequest): Observable<Product> {
    return this.http.put<Product>(`/api/products/${id}`, request).pipe(
      tap((updated) =>
        this._products.update((list) => list.map((p) => (p.id === id ? updated : p))),
      ),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/products/${id}`).pipe(
      tap(() => this._products.update((list) => list.filter((p) => p.id !== id))),
    );
  }

  restock(id: string, payload: RestockPayload): Observable<Product> {
    return this.http.post<Product>(`/api/products/${id}/restock`, payload).pipe(
      tap((updated) =>
        this._products.update((list) => list.map((p) => (p.id === id ? updated : p))),
      ),
    );
  }

  listBatches(productId: string): Observable<ProductBatch[]> {
    return this.http.get<ProductBatch[]>(`/api/products/${productId}/batches`);
  }

  writeOffBatch(batchId: string): Observable<ProductBatch> {
    return this.http.post<ProductBatch>(`/api/batches/${batchId}/writeoff`, {});
  }

  listExpiring(withinDays: number): Observable<ExpiringBatch[]> {
    const params = new HttpParams().set('withinDays', withinDays);
    return this.http.get<ExpiringBatch[]>('/api/batches/expiring', { params });
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server. Is the backend running?';
    if (err.status === 401) return 'Not authenticated.';
    if (err.status === 403) return 'Not authorized to view products.';
    const apiMessage = (err.error && typeof err.error === 'object' && 'message' in err.error)
      ? String((err.error as { message?: unknown }).message)
      : null;
    return apiMessage ?? `Request failed (${err.status})`;
  }
}
