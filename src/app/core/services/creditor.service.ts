import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Creditor, CreditorUpsertRequest, Sale } from '../models';

/**
 * HTTP-backed CRUD for {@link Creditor}. The active-only list is
 * exposed via {@link active} since the POS picker only ever needs
 * those (a deactivated creditor shouldn't be selectable at checkout).
 *
 * Credit-limit enforcement lives in the POS dialog — this service
 * just owns the data. Outstanding balance is server-computed.
 */
@Injectable({ providedIn: 'root' })
export class CreditorService {
  private readonly http = inject(HttpClient);

  private readonly _creditors = signal<Creditor[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly creditors = this._creditors.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Selectable in POS — active creditors only, sorted by name. */
  readonly active = computed(() => this._creditors().filter((c) => c.active));

  /** Full list including inactive — admin Creditors page. */
  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Creditor[]>('/api/creditors').subscribe({
      next: (list) => {
        this._creditors.set(list);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  /** Fetch a single creditor by id — drives the detail page. The
   *  Creditors list isn't guaranteed to be loaded (e.g. user landed
   *  via a deep link), so always hit the server. */
  get(id: string): Observable<Creditor> {
    return this.http.get<Creditor>(`/api/creditors/${id}`);
  }

  /** Active-only fetch — used by the POS checkout dialog. Cashiers
   *  hit this endpoint without admin role; the backend gates the
   *  full /api/creditors list to admins separately. */
  loadActive(): void {
    this.http.get<Creditor[]>('/api/creditors/active').subscribe({
      next: (list) => this._creditors.set(list),
      error: (err: HttpErrorResponse) => this._error.set(this.describe(err)),
    });
  }

  create(req: CreditorUpsertRequest): Observable<Creditor> {
    return this.http.post<Creditor>('/api/creditors', req).pipe(
      tap((c) => this._creditors.update((list) => [...list, c])),
    );
  }

  update(id: string, req: CreditorUpsertRequest): Observable<Creditor> {
    return this.http.put<Creditor>(`/api/creditors/${id}`, req).pipe(
      tap((updated) =>
        this._creditors.update((list) => list.map((c) => (c.id === id ? updated : c))),
      ),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/creditors/${id}`).pipe(
      tap(() => this._creditors.update((list) => list.filter((c) => c.id !== id))),
    );
  }

  /** Purchase history for a single creditor — every credit sale ever
   *  rung up against them, newest first. Fetched on demand from the
   *  "View sales" action so the dialog always shows fresh data on open. */
  listSales(id: string): Observable<Sale[]> {
    return this.http.get<Sale[]>(`/api/creditors/${id}/sales`);
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Admin access required.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `Request failed (${err.status})`;
  }
}
