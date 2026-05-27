import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError } from 'rxjs';
import {
  CreateLoadTransactionRequest,
  LoadFeeTier,
  LoadFeeTierUpsertRequest,
  LoadTransaction,
} from '../models';

/**
 * Thin HTTP layer for the load feature. Tiers + transactions are
 * fetched fresh per navigation (same rationale as GCash) so the
 * cashier always sees the latest fee schedule.
 */
@Injectable({ providedIn: 'root' })
export class LoadService {
  private readonly http = inject(HttpClient);

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

  create(req: CreateLoadTransactionRequest): Observable<LoadTransaction> {
    return this.http.post<LoadTransaction>('/api/load-transactions', req);
  }

  listMine(): Observable<LoadTransaction[]> {
    return this.http.get<LoadTransaction[]>('/api/load-transactions/mine');
  }

  listAll(): Observable<LoadTransaction[]> {
    return this.http.get<LoadTransaction[]>('/api/load-transactions');
  }

  complete(id: string): Observable<LoadTransaction> {
    return this.http.post<LoadTransaction>(`/api/load-transactions/${id}/complete`, {});
  }

  void(id: string, reason?: string | null): Observable<LoadTransaction> {
    return this.http.post<LoadTransaction>(`/api/load-transactions/${id}/void`, {
      reason: reason ?? null,
    });
  }
}
