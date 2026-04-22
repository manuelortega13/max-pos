import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { StoreSettings } from '../models';

/** Safe placeholder shown while the first /api/settings call is in flight.
 *  Prevents the MoneyPipe from rendering an empty currency symbol on pages
 *  that load before SettingsService resolves. */
const SETTINGS_FALLBACK: StoreSettings = {
  storeName: '',
  currency: 'USD',
  currencySymbol: '$',
  taxRate: 0,
  receiptFooter: '',
  address: '',
  phone: '',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  private readonly _settings = signal<StoreSettings>(SETTINGS_FALLBACK);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly settings = this._settings.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  constructor() {
    this.load();
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<StoreSettings>('/api/settings').subscribe({
      next: (settings) => {
        this._settings.set(settings);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  save(patch: StoreSettings): Observable<StoreSettings> {
    return this.http.put<StoreSettings>('/api/settings', patch).pipe(
      tap((saved) => this._settings.set(saved)),
    );
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `Request failed (${err.status})`;
  }
}
