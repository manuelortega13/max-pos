import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CreateSaleRequest, Sale, SaleItem } from '../models';
import { computeDiscount } from './cart.service';
import { AuthService } from './auth.service';
import { OfflineQueueService } from './offline-queue.service';
import { ProductService } from './product.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly offlineQueue = inject(OfflineQueueService);
  private readonly productService = inject(ProductService);
  private readonly settingsService = inject(SettingsService);

  private readonly _sales = signal<Sale[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly sales = this._sales.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly completedSales = computed(() =>
    this._sales().filter((s) => s.status === 'COMPLETED'),
  );

  readonly todaySales = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.completedSales().filter((s) => s.date.startsWith(today));
  });

  readonly todayRevenue = computed(() =>
    this.todaySales().reduce((sum, s) => sum + s.total, 0),
  );

  readonly todayTransactionCount = computed(() => this.todaySales().length);

  readonly averageTicket = computed(() => {
    const sales = this.completedSales();
    if (sales.length === 0) return 0;
    return sales.reduce((sum, s) => sum + s.total, 0) / sales.length;
  });

  constructor() {
    this.load();
  }

  /**
   * Admins fetch every sale (/api/sales). Cashiers fetch their own
   * (/api/sales/mine). Runs on service construction; can be re-run manually.
   */
  load(): void {
    if (!this.authService.isAuthenticated()) return;
    const url = this.authService.isAdmin() ? '/api/sales' : '/api/sales/mine';

    this._loading.set(true);
    this._error.set(null);
    this.http.get<Sale[]>(url).subscribe({
      next: (sales) => {
        this._sales.set(sales);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  byCashier(cashierId: string): Sale[] {
    return this._sales().filter((s) => s.cashierId === cashierId);
  }

  /**
   * Ring up a sale. Behaves exactly like the online flow when the network
   * cooperates. When the device is offline (`navigator.onLine === false`)
   * or the POST fails with a network error (status 0), the sale is queued
   * to {@link OfflineQueueService} and an optimistic `Sale` is returned so
   * the POS can still show the receipt and clear the cart. The sync
   * runner replays queued sales once the network is back.
   */
  create(request: CreateSaleRequest): Observable<Sale> {
    const clientRef = request.clientRef ?? this.generateClientRef();
    const payload: CreateSaleRequest = { ...request, clientRef };
    const offlineEnabled = this.settingsService.settings().offlineModeEnabled;

    // Only short-circuit to the offline queue when the admin has explicitly
    // enabled offline mode in Settings. Otherwise keep the legacy behavior
    // (network errors surface to the caller so the cashier sees them).
    if (
      offlineEnabled &&
      typeof navigator !== 'undefined' &&
      navigator.onLine === false
    ) {
      return of(this.enqueueOffline(payload, clientRef, 'device offline'));
    }

    return this.http.post<Sale>('/api/sales', payload).pipe(
      tap((sale) => this._sales.update((list) => [sale, ...list])),
      catchError((err: HttpErrorResponse) => {
        // Status 0 = couldn't reach the server (DNS, TCP, CORS blocked by
        // network layer). With offline mode on, enqueue and return an
        // optimistic sale; otherwise bubble the error to the caller.
        if (err.status === 0 && offlineEnabled) {
          return of(this.enqueueOffline(payload, clientRef, 'network unreachable'));
        }
        return throwError(() => err);
      }),
    );
  }

  refund(id: string, reason?: string | null): Observable<Sale> {
    const body = reason && reason.trim() ? { reason: reason.trim() } : {};
    return this.http.post<Sale>(`/api/sales/${id}/refund`, body).pipe(
      tap((updated) =>
        this._sales.update((list) => list.map((s) => (s.id === id ? updated : s))),
      ),
    );
  }

  /**
   * Replay a previously queued sale. On backend success the optimistic
   * Sale in the list is swapped for the canonical one (matching ids) and
   * the queue entry is dropped. Used by {@link OfflineSyncService}.
   */
  replayQueued(payload: CreateSaleRequest, optimisticId: string): Observable<Sale> {
    return this.http.post<Sale>('/api/sales', payload).pipe(
      tap((sale) => {
        this._sales.update((list) => {
          // Replace the optimistic record (keyed by its clientRef-as-id)
          // with the backend's canonical one; fall back to prepending if
          // it's no longer in the list for whatever reason.
          const idx = list.findIndex((s) => s.id === optimisticId);
          if (idx < 0) return [sale, ...list];
          const next = list.slice();
          next[idx] = sale;
          return next;
        });
      }),
    );
  }

  private enqueueOffline(
    payload: CreateSaleRequest,
    clientRef: string,
    reason: string,
  ): Sale {
    const optimistic = this.buildOptimisticSale(payload, clientRef);
    this.offlineQueue.enqueue({
      clientRef,
      request: payload,
      optimistic,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: reason,
    });
    this._sales.update((list) => [optimistic, ...list]);
    return optimistic;
  }

  /**
   * Synthesize a Sale locally so the checkout dialog's receipt step has
   * something to render while the real sale is pending in the queue. Uses
   * the current ProductService cache to resolve item details and the
   * SettingsService tax rate so totals match what the UI already showed.
   */
  private buildOptimisticSale(payload: CreateSaleRequest, clientRef: string): Sale {
    const user = this.authService.user();
    const taxRate = this.settingsService.settings().taxRate;

    const items: SaleItem[] = payload.items.map((line) => {
      const product = this.productService.getById(line.productId);
      const unitPrice = product?.price ?? 0;
      const gross = round2(unitPrice * line.quantity);
      const lineDiscountAmount = computeDiscount(gross, line.discount ?? null);
      const subtotal = round2(gross - lineDiscountAmount);
      return {
        productId: line.productId,
        productName: product?.name ?? '(offline)',
        quantity: line.quantity,
        unitPrice,
        unitCost: product?.cost ?? null,
        subtotal,
        discountType: line.discount?.type ?? null,
        discountValue: line.discount?.value ?? null,
        discountAmount: line.discount ? lineDiscountAmount : null,
      };
    });

    const subtotal = round2(items.reduce((sum, i) => sum + i.subtotal, 0));
    const orderDiscountAmount = computeDiscount(subtotal, payload.discount ?? null);
    const taxable = round2(Math.max(0, subtotal - orderDiscountAmount));
    const tax = round2(taxable * taxRate);
    const total = round2(taxable + tax);

    return {
      id: clientRef,
      reference: clientRef,
      date: new Date().toISOString(),
      cashierId: user?.id ?? '',
      cashierName: user?.name ?? '',
      subtotal,
      tax,
      total,
      paymentMethod: payload.paymentMethod,
      status: 'COMPLETED',
      refundReason: null,
      discountType: payload.discount?.type ?? null,
      discountValue: payload.discount?.value ?? null,
      discountAmount: payload.discount ? orderDiscountAmount : null,
      items,
    };
  }

  private generateClientRef(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `S-${(crypto as { randomUUID(): string }).randomUUID()}`;
    }
    // Fallback for ancient runtimes — timestamp + random suffix is
    // collision-resistant enough for per-cashier offline queues.
    return `S-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Not authorized to view these sales.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `Request failed (${err.status})`;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
