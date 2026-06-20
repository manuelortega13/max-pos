import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { LoginRequest } from '../models';
import { PlatformAdmin, PlatformAuthResponse } from '../models/platform.model';

const TOKEN_KEY = 'maxpos.platform-token';
const ADMIN_KEY = 'maxpos.platform-admin';

/**
 * Auth for the platform (super-admin) console. Kept entirely separate from
 * the store-user {@link AuthService}: its own token (different localStorage
 * key) so a platform session and a store session can't be confused, and the
 * auth interceptor attaches this token only to /api/platform/* calls.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(this.read(TOKEN_KEY));
  private readonly _admin = signal<PlatformAdmin | null>(this.readAdmin());

  readonly token = this._token.asReadonly();
  readonly admin = this._admin.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null && this._admin() !== null);

  login(credentials: LoginRequest): Observable<PlatformAuthResponse> {
    return this.http
      .post<PlatformAuthResponse>('/api/platform/auth/login', credentials)
      .pipe(tap((res) => this.store(res)));
  }

  logout(): void {
    this._token.set(null);
    this._admin.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      // best effort
    }
  }

  private store(res: PlatformAuthResponse): void {
    this._token.set(res.token);
    this._admin.set(res.admin);
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(ADMIN_KEY, JSON.stringify(res.admin));
    } catch {
      // best effort
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private readAdmin(): PlatformAdmin | null {
    try {
      const raw = localStorage.getItem(ADMIN_KEY);
      return raw ? (JSON.parse(raw) as PlatformAdmin) : null;
    } catch {
      return null;
    }
  }
}
