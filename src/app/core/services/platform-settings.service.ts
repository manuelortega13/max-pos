import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { PlatformSettings } from '../models/platform.model';

/**
 * Holds the platform settings as signals for the console. Loaded once by the
 * platform layout and read by pages (e.g. to format aggregated revenue with
 * the platform currency symbol).
 */
@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private readonly http = inject(HttpClient);

  private readonly _settings = signal<PlatformSettings | null>(null);
  readonly settings = this._settings.asReadonly();

  /** Currency symbol for display; falls back to '$' before settings load. */
  readonly currencySymbol = computed(() => this._settings()?.defaultCurrencySymbol ?? '$');

  load(): Observable<PlatformSettings> {
    return this.http
      .get<PlatformSettings>('/api/platform/settings')
      .pipe(tap((s) => this._settings.set(s)));
  }

  save(body: {
    defaultCurrency: string;
    defaultCurrencySymbol: string;
  }): Observable<PlatformSettings> {
    return this.http
      .put<PlatformSettings>('/api/platform/settings', body)
      .pipe(tap((s) => this._settings.set(s)));
  }
}
