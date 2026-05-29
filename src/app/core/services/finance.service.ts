import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Account,
  AccountMovement,
  AccountReconciliation,
  AccountUpsertRequest,
  FinanceOverview,
  ManualMovementRequest,
  ReconcileRequest,
  TransferRequest,
} from '../models';

/**
 * Thin HTTP layer for the Finances admin feature.
 *
 * Stateless on purpose — pages own their snapshots of overview /
 * movements / etc. so refresh semantics stay local to each screen
 * (mat-dialog flows already drive re-fetches via the observable
 * returns).
 */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);

  private readonly base = '/api/finance';

  // ─── overview + accounts ────────────────────────────────────────

  overview(): Observable<FinanceOverview> {
    return this.http.get<FinanceOverview>(`${this.base}/overview`);
  }

  listAccounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${this.base}/accounts`);
  }

  getAccount(id: string): Observable<Account> {
    return this.http.get<Account>(`${this.base}/accounts/${id}`);
  }

  createAccount(req: AccountUpsertRequest): Observable<Account> {
    return this.http.post<Account>(`${this.base}/accounts`, req);
  }

  updateAccount(id: string, req: AccountUpsertRequest): Observable<Account> {
    return this.http.put<Account>(`${this.base}/accounts/${id}`, req);
  }

  // ─── movements ──────────────────────────────────────────────────

  /**
   * Movement feed. With no params, returns the rolling-30-day view
   * across all accounts (server default). Pass {@code accountId} to
   * filter, and {@code from}/{@code to} (ISO instants) to override
   * the window.
   */
  listMovements(opts?: {
    accountId?: string;
    from?: string;
    to?: string;
  }): Observable<AccountMovement[]> {
    let params = new HttpParams();
    if (opts?.accountId) params = params.set('accountId', opts.accountId);
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    return this.http.get<AccountMovement[]>(`${this.base}/movements`, { params });
  }

  recordIn(req: ManualMovementRequest): Observable<AccountMovement> {
    return this.http.post<AccountMovement>(`${this.base}/in`, req);
  }

  recordOut(req: ManualMovementRequest): Observable<AccountMovement> {
    return this.http.post<AccountMovement>(`${this.base}/out`, req);
  }

  transfer(req: TransferRequest): Observable<AccountMovement[]> {
    return this.http.post<AccountMovement[]>(`${this.base}/transfer`, req);
  }

  voidMovement(id: string): Observable<AccountMovement> {
    return this.http.post<AccountMovement>(`${this.base}/movements/${id}/void`, {});
  }

  // ─── reconciliations ────────────────────────────────────────────

  reconcile(req: ReconcileRequest): Observable<AccountReconciliation> {
    return this.http.post<AccountReconciliation>(`${this.base}/reconcile`, req);
  }

  listReconciliations(accountId: string): Observable<AccountReconciliation[]> {
    return this.http.get<AccountReconciliation[]>(
      `${this.base}/accounts/${accountId}/reconciliations`,
    );
  }

  voidReconciliation(id: string): Observable<AccountReconciliation> {
    return this.http.post<AccountReconciliation>(
      `${this.base}/reconciliations/${id}/void`,
      {},
    );
  }
}
