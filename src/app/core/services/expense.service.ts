import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Expense, ExpenseUpsertRequest } from '../models';

/**
 * HTTP-backed CRUD for {@link Expense}. Admin-only (backend enforces).
 * Holds the fetched range in a signal so the Reports page can recompute
 * totals reactively without re-hitting the API on every filter tweak.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly http = inject(HttpClient);

  private readonly _expenses = signal<Expense[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly expenses = this._expenses.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly total = computed(() =>
    this._expenses().reduce((sum, e) => sum + Number(e.amount), 0),
  );

  /** Fetch all expenses, optionally filtered to a [from, to] date range. */
  load(from?: string, to?: string): void {
    this._loading.set(true);
    this._error.set(null);
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    this.http.get<Expense[]>('/api/expenses', { params }).subscribe({
      next: (list) => {
        this._expenses.set(list);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  create(request: ExpenseUpsertRequest): Observable<Expense> {
    return this.http.post<Expense>('/api/expenses', request).pipe(
      tap((e) => this._expenses.update((list) => [e, ...list])),
    );
  }

  update(id: string, request: ExpenseUpsertRequest): Observable<Expense> {
    return this.http.put<Expense>(`/api/expenses/${id}`, request).pipe(
      tap((updated) =>
        this._expenses.update((list) => list.map((e) => (e.id === id ? updated : e))),
      ),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/expenses/${id}`).pipe(
      tap(() => this._expenses.update((list) => list.filter((e) => e.id !== id))),
    );
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
