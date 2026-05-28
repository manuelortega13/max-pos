import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  BusinessDay,
  CloseDayRequest,
  CreateFloatAdditionRequest,
  FloatAddition,
  OpenDayRequest,
} from '../models';

/**
 * The currently-open business day (if any) and the open/close lifecycle.
 * Both cashiers and admins read {@link current}; only admins can mutate.
 *
 * The cashier shell calls {@link refreshCurrent} on bootstrap so the POS
 * page can block checkout when no day is open, and the toolbar pill can
 * show open/closed state.
 */
@Injectable({ providedIn: 'root' })
export class BusinessDayService {
  private readonly http = inject(HttpClient);

  private readonly _current = signal<BusinessDay | null>(null);
  private readonly _history = signal<BusinessDay[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  /** The open day, or `null` when no day is open. */
  readonly current = this._current.asReadonly();
  readonly history = this._history.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Convenience: true when there is an open day. */
  readonly isOpen = computed(() => this._current() !== null);

  /**
   * Fetch the current open day. Backend returns 204 No Content when no
   * day is open — Angular's HttpClient surfaces that as a null body,
   * which we map to {@link _current} = null.
   */
  refreshCurrent(): Observable<BusinessDay | null> {
    return this.http
      .get<BusinessDay | null>('/api/business-days/current', { observe: 'body' })
      .pipe(
        tap({
          next: (day) => this._current.set(day ?? null),
          error: (err: HttpErrorResponse) => {
            // 401 is expected before login; don't surface as an error.
            if (err.status !== 401) this._error.set(this.describe(err));
          },
        }),
      );
  }

  loadHistory(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<BusinessDay[]>('/api/business-days').subscribe({
      next: (list) => {
        this._history.set(list);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  open(req: OpenDayRequest): Observable<BusinessDay> {
    return this.http.post<BusinessDay>('/api/business-days/open', req).pipe(
      tap((day) => {
        this._current.set(day);
        this._history.update((list) => [day, ...list]);
      }),
    );
  }

  close(req: CloseDayRequest): Observable<BusinessDay> {
    return this.http.post<BusinessDay>('/api/business-days/close', req).pipe(
      tap((day) => {
        this._current.set(null);
        // Replace the corresponding open row in history with the closed snapshot.
        this._history.update((list) => {
          const idx = list.findIndex((d) => d.id === day.id);
          if (idx < 0) return [day, ...list];
          const next = list.slice();
          next[idx] = day;
          return next;
        });
      }),
    );
  }

  // ─── Float additions (mid-day cash top-ups) ─────────────────────
  //
  // Audit-log endpoints scoped to the currently-open business day.
  // Admin-only — backend enforces with @PreAuthorize. Frontend just
  // wires the HTTP layer; the EoD page owns the UX.

  listFloatAdditions(): Observable<FloatAddition[]> {
    return this.http.get<FloatAddition[]>(
      '/api/business-days/current/float-additions',
    );
  }

  addFloatAddition(req: CreateFloatAdditionRequest): Observable<FloatAddition> {
    return this.http.post<FloatAddition>(
      '/api/business-days/current/float-additions',
      req,
    );
  }

  voidFloatAddition(id: string, reason?: string | null): Observable<FloatAddition> {
    return this.http.post<FloatAddition>(
      `/api/business-days/current/float-additions/${id}/void`,
      { reason: reason ?? null },
    );
  }

  /** Drop cached state on sign-out so a different user doesn't see the prior session. */
  reset(): void {
    this._current.set(null);
    this._history.set([]);
    this._error.set(null);
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
