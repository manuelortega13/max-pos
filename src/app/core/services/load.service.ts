import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, tap } from 'rxjs';
import {
  CreateLoadTransactionRequest,
  LoadFeeTier,
  LoadFeeTierUpsertRequest,
  LoadTransaction,
} from '../models';
import { AuthService } from './auth.service';

/**
 * Thin HTTP layer for the load feature. Tiers are fetched fresh per
 * navigation (same rationale as GCash). Transactions are cached in
 * a signal so admin dashboards (Reports, Dashboard, Sales, EoD) can
 * read one shared list; mutating endpoints update the cache.
 */
@Injectable({ providedIn: 'root' })
export class LoadService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly _transactions = signal<LoadTransaction[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly transactions = this._transactions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Active (non-voided) completed rows — useful for revenue math. */
  readonly completedTransactions = computed(() =>
    this._transactions().filter((t) => !t.voidedAt && t.status === 'COMPLETED'),
  );

  constructor() {
    this.load();
  }

  // ─── fee tiers ──────────────────────────────────────────────────

  listTiers(): Observable<LoadFeeTier[]> {
    return this.http.get<LoadFeeTier[]>('/api/load/fee-tiers');
  }

  /** Active tier matching an amount. 204 No Content → null via EMPTY. */
  lookupTier(amount: number): Observable<LoadFeeTier | null> {
    return this.http
      .get<LoadFeeTier>('/api/load/fee-tiers/lookup', { params: { amount } })
      .pipe(catchError(() => EMPTY));
  }

  createTier(req: LoadFeeTierUpsertRequest): Observable<LoadFeeTier> {
    return this.http.post<LoadFeeTier>('/api/load/fee-tiers', req);
  }

  updateTier(id: string, req: LoadFeeTierUpsertRequest): Observable<LoadFeeTier> {
    return this.http.put<LoadFeeTier>(`/api/load/fee-tiers/${id}`, req);
  }

  deleteTier(id: string): Observable<void> {
    return this.http.delete<void>(`/api/load/fee-tiers/${id}`);
  }

  // ─── transactions ───────────────────────────────────────────────

  /** Refresh the cached transaction list. */
  load(): void {
    if (!this.authService.isAuthenticated()) return;
    const url = this.authService.isAdmin()
      ? '/api/load-transactions'
      : '/api/load-transactions/mine';
    this._loading.set(true);
    this._error.set(null);
    this.http.get<LoadTransaction[]>(url).subscribe({
      next: (rows) => {
        this._transactions.set(rows);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(err.error?.message ?? 'Could not load load transactions.');
        this._loading.set(false);
      },
    });
  }

  create(req: CreateLoadTransactionRequest): Observable<LoadTransaction> {
    return this.http
      .post<LoadTransaction>('/api/load-transactions', req)
      .pipe(tap((row) => this._transactions.update((list) => [row, ...list])));
  }

  listMine(): Observable<LoadTransaction[]> {
    return this.http.get<LoadTransaction[]>('/api/load-transactions/mine');
  }

  listAll(): Observable<LoadTransaction[]> {
    return this.http.get<LoadTransaction[]>('/api/load-transactions');
  }

  complete(id: string): Observable<LoadTransaction> {
    return this.http
      .post<LoadTransaction>(`/api/load-transactions/${id}/complete`, {})
      .pipe(
        tap((updated) =>
          this._transactions.update((list) =>
            list.map((t) => (t.id === id ? updated : t)),
          ),
        ),
      );
  }

  void(id: string, reason?: string | null): Observable<LoadTransaction> {
    return this.http
      .post<LoadTransaction>(`/api/load-transactions/${id}/void`, {
        reason: reason ?? null,
      })
      .pipe(
        tap((updated) =>
          this._transactions.update((list) =>
            list.map((t) => (t.id === id ? updated : t)),
          ),
        ),
      );
  }
}
