import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, tap } from 'rxjs';
import {
  CreateGcashTransactionRequest,
  GcashFeeTier,
  GcashFeeTierUpsertRequest,
  GcashTransaction,
} from '../models';
import { AuthService } from './auth.service';
import { BusinessDayService } from './business-day.service';
import { OfflineQueueService, QueuedGcash } from './offline-queue.service';
import {
  OFFLINE_REPLAY_HEADER,
  createWithOfflineFallback,
  newClientRef,
} from './offline-mutation.util';
import { SettingsService } from './settings.service';

/**
 * Thin HTTP layer for the GCash service feature.
 *
 * Tiers are fetched fresh on each navigation — the admin can change
 * tiers at any moment and the cashier's tier lookup must always see
 * the latest schedule.
 *
 * Transactions are cached in a signal so admin dashboards (Reports,
 * Dashboard, Sales, EoD) can read the same list without each page
 * issuing its own GET. Mutating endpoints (create, complete, void)
 * update the signal optimistically/post-response so the cache stays
 * in sync.
 */
@Injectable({ providedIn: 'root' })
export class GcashService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly offlineQueue = inject(OfflineQueueService);
  private readonly settingsService = inject(SettingsService);
  private readonly businessDayService = inject(BusinessDayService);

  private readonly _transactions = signal<GcashTransaction[]>([]);
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

  /** Refresh the cached transaction list. Admins fetch every row;
   *  cashiers fetch their own. No-op when unauthenticated. */
  load(): void {
    if (!this.authService.isAuthenticated()) return;
    const url = this.authService.isAdmin()
      ? '/api/gcash-transactions'
      : '/api/gcash-transactions/mine';
    this._loading.set(true);
    this._error.set(null);
    this.http.get<GcashTransaction[]>(url).subscribe({
      next: (rows) => {
        this._transactions.set(rows);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(err.error?.message ?? 'Could not load GCash transactions.');
        this._loading.set(false);
      },
    });
  }

  /**
   * Record a GCash transaction. Behaves like a plain POST online. When the
   * store has offline mode enabled and the device is offline (or the POST
   * fails with a network error), the transaction is queued to
   * {@link OfflineQueueService} and an optimistic row is returned so the
   * cashier still gets a receipt; {@link OfflineSyncService} replays it once
   * the network is back. A clientRef is always attached so a lost response
   * can be replayed without creating a duplicate (backend dedupes on it).
   */
  create(req: CreateGcashTransactionRequest): Observable<GcashTransaction> {
    const clientRef = req.clientRef ?? newClientRef('G');
    const payload: CreateGcashTransactionRequest = { ...req, clientRef };
    const offlineEnabled = this.settingsService.settings().offlineModeEnabled;

    return createWithOfflineFallback<GcashTransaction>({
      offlineEnabled,
      post: () =>
        this.http
          .post<GcashTransaction>('/api/gcash-transactions', payload)
          .pipe(tap((row) => this._transactions.update((list) => [row, ...list]))),
      enqueue: (reason) => this.enqueueOffline(payload, clientRef, reason),
    });
  }

  /**
   * Replay a queued GCash transaction. The offline-replay header tells the
   * backend to skip the open-day + tier-fee checks. On success the optimistic
   * row is swapped for the canonical one (matched by the optimistic id).
   */
  replayQueued(entry: QueuedGcash): Observable<GcashTransaction> {
    return this.http
      .post<GcashTransaction>('/api/gcash-transactions', entry.request, {
        headers: OFFLINE_REPLAY_HEADER,
      })
      .pipe(
        tap((row) =>
          this._transactions.update((list) => {
            const idx = list.findIndex((t) => t.id === entry.optimistic.id);
            if (idx < 0) return [row, ...list];
            const next = list.slice();
            next[idx] = row;
            return next;
          }),
        ),
      );
  }

  /** Build the optimistic row, enqueue the request, and prepend it to the
   *  cache so My Transactions reflects it immediately. */
  private enqueueOffline(
    payload: CreateGcashTransactionRequest,
    clientRef: string,
    reason: string,
  ): GcashTransaction {
    const optimistic = this.buildOptimistic(payload, clientRef);
    this.offlineQueue.enqueue({
      kind: 'gcash',
      clientRef,
      request: payload,
      optimistic,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: reason,
    });
    this._transactions.update((list) => [optimistic, ...list]);
    return optimistic;
  }

  /** Synthesize a GcashTransaction locally so the receipt + My Transactions
   *  have something to show while the real row is pending in the queue.
   *  Mirrors the server's status defaults: cash-in lands PENDING, cash-out
   *  is COMPLETED at the till. */
  private buildOptimistic(
    payload: CreateGcashTransactionRequest,
    clientRef: string,
  ): GcashTransaction {
    const user = this.authService.user();
    const now = new Date().toISOString();
    const isCashIn = payload.type === 'CASH_IN';
    return {
      id: clientRef,
      type: payload.type,
      status: isCashIn ? 'PENDING' : 'COMPLETED',
      amount: payload.amount,
      fee: payload.fee,
      customerName: payload.customerName ?? null,
      customerPhone: payload.customerPhone ?? null,
      inboundRef: payload.inboundRef ?? null,
      cashierId: user?.id ?? '',
      cashierName: user?.name ?? '',
      businessDayId: this.businessDayService.current()?.id ?? null,
      date: now,
      reference: clientRef,
      notes: payload.notes ?? null,
      completedAt: isCashIn ? null : now,
      completedById: isCashIn ? null : (user?.id ?? null),
      completedByName: isCashIn ? null : (user?.name ?? null),
      voidedAt: null,
      voidedById: null,
      voidedByName: null,
      pendingSync: true,
    };
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
    return this.http
      .post<GcashTransaction>(`/api/gcash-transactions/${id}/complete`, {})
      .pipe(
        tap((updated) =>
          this._transactions.update((list) =>
            list.map((t) => (t.id === id ? updated : t)),
          ),
        ),
      );
  }

  /** Admin soft-void. */
  void(id: string, reason?: string | null): Observable<GcashTransaction> {
    return this.http
      .post<GcashTransaction>(`/api/gcash-transactions/${id}/void`, {
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
