import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CreateSaleRequest, Sale } from '../models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

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

  create(request: CreateSaleRequest): Observable<Sale> {
    return this.http.post<Sale>('/api/sales', request).pipe(
      tap((sale) => this._sales.update((list) => [sale, ...list])),
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
