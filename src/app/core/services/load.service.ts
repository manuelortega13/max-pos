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
import { BusinessDayService } from './business-day.service';
import { CreditorService } from './creditor.service';
import { OfflineQueueService, QueuedLoad } from './offline-queue.service';
import {
  OFFLINE_REPLAY_HEADER,
  createWithOfflineFallback,
  newClientRef,
} from './offline-mutation.util';
import { SettingsService } from './settings.service';

/** localStorage key for the cached fee-tier table (see loadTiers/resolveTier). */
const LOAD_TIERS_KEY = 'maxpos.load.tiers.v1';

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
  private readonly offlineQueue = inject(OfflineQueueService);
  private readonly settingsService = inject(SettingsService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly creditorService = inject(CreditorService);

  private readonly _transactions = signal<LoadTransaction[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  /**
   * Cached full tier table — seeded from localStorage for an instant (and
   * offline) first paint, refreshed from the API by {@link loadTiers}. The
   * cashier page reads {@link resolveTier} for the displayed fee.
   */
  private readonly _tiers = signal<LoadFeeTier[]>(this.readCachedTiers());
  private readonly _tiersLoaded = signal<boolean>(this._tiers().length > 0);
  readonly tiers = this._tiers.asReadonly();
  /** True once a tier table is available (from cache or a successful fetch). */
  readonly tiersLoaded = this._tiersLoaded.asReadonly();

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

  /**
   * Refresh the cached tier table from the server (memory + localStorage).
   * On failure the previous cache is kept (offline-friendly).
   */
  loadTiers(): void {
    this.listTiers().subscribe({
      next: (tiers) => {
        this._tiers.set(tiers);
        this._tiersLoaded.set(true);
        this.writeCachedTiers(tiers);
      },
      error: () => {
        /* keep last-known cache */
      },
    });
  }

  /**
   * Resolve the active tier covering {@code amount} from the cached table,
   * mirroring the server match (active, minAmount ≤ amount ≤ maxAmount, lowest
   * minAmount wins). Synchronous — no flicker, no network.
   */
  resolveTier(amount: number): LoadFeeTier | null {
    if (!(amount > 0)) return null;
    let best: LoadFeeTier | null = null;
    for (const t of this._tiers()) {
      if (t.active && t.minAmount <= amount && amount <= t.maxAmount) {
        if (!best || t.minAmount < best.minAmount) best = t;
      }
    }
    return best;
  }

  private readCachedTiers(): LoadFeeTier[] {
    try {
      const raw = localStorage.getItem(LOAD_TIERS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as LoadFeeTier[]) : [];
    } catch {
      return [];
    }
  }

  private writeCachedTiers(tiers: LoadFeeTier[]): void {
    try {
      localStorage.setItem(LOAD_TIERS_KEY, JSON.stringify(tiers));
    } catch {
      /* quota / private mode — cache stays memory-only */
    }
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

  /**
   * Record a load. Like a plain POST online; when offline mode is enabled and
   * the device is offline (or the POST fails with a network error) the load is
   * queued and an optimistic row is returned so the cashier still gets a
   * receipt. A clientRef is always attached for idempotent replay.
   */
  create(req: CreateLoadTransactionRequest): Observable<LoadTransaction> {
    const clientRef = req.clientRef ?? newClientRef('L');
    const payload: CreateLoadTransactionRequest = { ...req, clientRef };
    const offlineEnabled = this.settingsService.settings().offlineModeEnabled;

    return createWithOfflineFallback<LoadTransaction>({
      offlineEnabled,
      post: () =>
        this.http
          .post<LoadTransaction>('/api/load-transactions', payload)
          .pipe(tap((row) => this._transactions.update((list) => [row, ...list]))),
      enqueue: (reason) => this.enqueueOffline(payload, clientRef, reason),
    });
  }

  /**
   * Replay a queued load. The offline-replay header makes the backend skip
   * the open-day + tier-fee checks; on success the optimistic row is swapped
   * for the canonical one.
   */
  replayQueued(entry: QueuedLoad): Observable<LoadTransaction> {
    return this.http
      .post<LoadTransaction>('/api/load-transactions', entry.request, {
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

  private enqueueOffline(
    payload: CreateLoadTransactionRequest,
    clientRef: string,
    reason: string,
  ): LoadTransaction {
    const optimistic = this.buildOptimistic(payload, clientRef);
    this.offlineQueue.enqueue({
      kind: 'load',
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

  /** Synthesize a LoadTransaction locally for the receipt + My Transactions
   *  while the real row is pending. Loads always start PENDING (admin still
   *  has to send from their phone). */
  private buildOptimistic(
    payload: CreateLoadTransactionRequest,
    clientRef: string,
  ): LoadTransaction {
    const user = this.authService.user();
    const now = new Date().toISOString();
    const creditorId = payload.creditorId ?? null;
    const creditorName = creditorId
      ? (this.creditorService.active().find((c) => c.id === creditorId)?.fullName ?? null)
      : null;
    return {
      id: clientRef,
      status: 'PENDING',
      amount: payload.amount,
      fee: payload.fee,
      promo: payload.promo ?? null,
      customerPhone: payload.customerPhone,
      paymentMethod: payload.paymentMethod,
      creditorId,
      creditorName,
      cashierId: user?.id ?? '',
      cashierName: user?.name ?? '',
      businessDayId: this.businessDayService.current()?.id ?? null,
      date: now,
      reference: clientRef,
      notes: payload.notes ?? null,
      completedAt: null,
      completedById: null,
      completedByName: null,
      voidedAt: null,
      voidedById: null,
      voidedByName: null,
      pendingSync: true,
    };
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
