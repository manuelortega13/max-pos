import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError } from 'rxjs';
import {
  CreateGcashTransactionRequest,
  GcashFeeTier,
  GcashFeeTierUpsertRequest,
  GcashTransaction,
} from '../models';

/**
 * Thin HTTP layer for the GCash service feature.
 *
 * Tiers + transactions are intentionally fetched fresh on each
 * navigation rather than cached in service state: the admin can
 * change tiers at any moment and the cashier's tier lookup must
 * always see the latest schedule.
 */
@Injectable({ providedIn: 'root' })
export class GcashService {
  private readonly http = inject(HttpClient);

  // ─── fee tiers ──────────────────────────────────────────────────

  listTiers(): Observable<GcashFeeTier[]> {
    return this.http.get<GcashFeeTier[]>('/api/gcash/fee-tiers');
  }

  /**
   * Active tier matching an amount. Resolves to `null` when no
   * active tier covers it — the cashier UI then unlocks the fee
   * field for manual entry.
   *
   * 204 No Content (no match) is mapped to `null` via catchError +
   * EMPTY so the caller's pipeline emits cleanly.
   */
  lookupTier(amount: number): Observable<GcashFeeTier | null> {
    return this.http
      .get<GcashFeeTier>('/api/gcash/fee-tiers/lookup', { params: { amount } })
      .pipe(catchError(() => EMPTY));
  }

  createTier(req: GcashFeeTierUpsertRequest): Observable<GcashFeeTier> {
    return this.http.post<GcashFeeTier>('/api/gcash/fee-tiers', req);
  }

  updateTier(id: string, req: GcashFeeTierUpsertRequest): Observable<GcashFeeTier> {
    return this.http.put<GcashFeeTier>(`/api/gcash/fee-tiers/${id}`, req);
  }

  deleteTier(id: string): Observable<void> {
    return this.http.delete<void>(`/api/gcash/fee-tiers/${id}`);
  }

  // ─── transactions ───────────────────────────────────────────────

  create(req: CreateGcashTransactionRequest): Observable<GcashTransaction> {
    return this.http.post<GcashTransaction>('/api/gcash-transactions', req);
  }

  /** Calling cashier's own — drives My Transactions card. */
  listMine(): Observable<GcashTransaction[]> {
    return this.http.get<GcashTransaction[]>('/api/gcash-transactions/mine');
  }

  /** Admin — used by End-of-Day live preview. */
  listAll(): Observable<GcashTransaction[]> {
    return this.http.get<GcashTransaction[]>('/api/gcash-transactions');
  }

  /** Admin marks a PENDING cash-in as COMPLETED. One-way. */
  complete(id: string): Observable<GcashTransaction> {
    return this.http.post<GcashTransaction>(`/api/gcash-transactions/${id}/complete`, {});
  }

  /** Admin soft-void. */
  void(id: string, reason?: string | null): Observable<GcashTransaction> {
    return this.http.post<GcashTransaction>(`/api/gcash-transactions/${id}/void`, {
      reason: reason ?? null,
    });
  }
}
