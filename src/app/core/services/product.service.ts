import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ExpiringBatch, Page, Product, ProductBatch, ProductUpsertRequest } from '../models';
import { RealtimeService } from './realtime.service';

/**
 * Headers attached to every product/batch GET to defeat the four
 * caching layers that can sneak in between client and backend:
 *   - {@code ngsw-bypass}: makes Angular's service worker pass the
 *     request straight to the network even if a stale dataGroup
 *     config from a previous deploy still lists /api/products.
 *   - {@code Cache-Control: no-cache}: tells browsers/proxies to
 *     revalidate with the origin rather than reuse a stored copy.
 *   - {@code Pragma: no-cache}: legacy HTTP/1.0 fallback for the
 *     same intent — harmless when ignored.
 *
 * Restock / add-product errors prompted this — stale GETs were
 * masking fresh writes.
 */
const NO_CACHE_HEADERS = new HttpHeaders({
  'ngsw-bypass': 'true',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
});

export interface RestockPayload {
  readonly quantity: number;
  readonly expiryDate?: string | null;
  readonly costPerUnit?: number | null;
  readonly note?: string | null;
}

/** Filter + paging inputs for the admin Products table's server query. */
export interface ProductPageQuery {
  readonly search?: string;
  readonly categoryId?: string;
  readonly page: number;
  readonly size: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly realtime = inject(RealtimeService);

  private readonly _products = signal<Product[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private loaded = false;

  /**
   * Bumped on every change to the catalogue (full reload or any
   * create/update/delete/restock). The admin Products table — which now
   * pages server-side instead of reading {@link products} directly —
   * watches this to know when to re-fetch its current page, so it stays
   * in sync with mutations and SSE-driven reloads just like the old
   * signal-backed table did.
   */
  private readonly _revision = signal(0);
  readonly revision = this._revision.asReadonly();

  readonly products = this._products.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly activeProducts = computed(() => this._products().filter((p) => p.active));
  readonly lowStockProducts = computed(() =>
    this._products().filter((p) => p.active && p.stock > 0 && p.stock <= 5),
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
    this.http.get<Product[]>('/api/products', { headers: NO_CACHE_HEADERS }).subscribe({
      next: (products) => {
        this._products.set(products);
        this._loading.set(false);
        this.loaded = true;
        this.bumpRevision();
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

  /** One filtered page for the admin Products table. Separate from
   *  {@link load} (which keeps the full catalogue cached for the POS) so
   *  paging the management view doesn't disturb the rest of the app. */
  page(query: ProductPageQuery): Observable<Page<Product>> {
    let params = new HttpParams().set('page', query.page).set('size', query.size);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.categoryId && query.categoryId !== 'all') {
      params = params.set('categoryId', query.categoryId);
    }
    return this.http.get<Page<Product>>('/api/products/page', {
      params,
      headers: NO_CACHE_HEADERS,
    });
  }

  create(request: ProductUpsertRequest): Observable<Product> {
    return this.http.post<Product>('/api/products', request).pipe(
      // Prepend so the freshly-created product shows up at the top of the list
      // (the backend also orders newest-first, so this matches a fresh GET).
      tap((product) => {
        this._products.update((list) => [product, ...list]);
        this.bumpRevision();
      }),
    );
  }

  update(id: string, request: ProductUpsertRequest): Observable<Product> {
    return this.http.put<Product>(`/api/products/${id}`, request).pipe(
      tap((updated) => {
        this._products.update((list) => list.map((p) => (p.id === id ? updated : p)));
        this.bumpRevision();
      }),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/products/${id}`).pipe(
      tap(() => {
        this._products.update((list) => list.filter((p) => p.id !== id));
        this.bumpRevision();
      }),
    );
  }

  restock(id: string, payload: RestockPayload): Observable<Product> {
    return this.http.post<Product>(`/api/products/${id}/restock`, payload).pipe(
      tap((updated) => {
        this._products.update((list) => list.map((p) => (p.id === id ? updated : p)));
        this.bumpRevision();
      }),
    );
  }

  private bumpRevision(): void {
    this._revision.update((n) => n + 1);
  }

  listBatches(productId: string): Observable<ProductBatch[]> {
    return this.http.get<ProductBatch[]>(`/api/products/${productId}/batches`, {
      headers: NO_CACHE_HEADERS,
    });
  }

  writeOffBatch(batchId: string): Observable<ProductBatch> {
    return this.http.post<ProductBatch>(`/api/batches/${batchId}/writeoff`, {});
  }

  listExpiring(withinDays: number): Observable<ExpiringBatch[]> {
    const params = new HttpParams().set('withinDays', withinDays);
    return this.http.get<ExpiringBatch[]>('/api/batches/expiring', {
      params,
      headers: NO_CACHE_HEADERS,
    });
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
