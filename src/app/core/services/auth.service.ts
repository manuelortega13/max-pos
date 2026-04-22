import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest } from '../models';

const TOKEN_KEY = 'maxpos.token';
const USER_KEY = 'maxpos.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();

  /**
   * A session is only considered authenticated when BOTH the token and the
   * user profile are present. localStorage can end up inconsistent (older
   * app versions, manual edits, half-written writes), and trusting a lone
   * token would let users past guards without a known identity.
   */
  readonly isAuthenticated = computed(
    () => this._token() !== null && this._user() !== null,
  );

  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');
  readonly isCashier = computed(() => this._user()?.role === 'CASHIER');

  constructor() {
    this.restoreSession();
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', credentials).pipe(
      tap((response) => this.storeSession(response)),
    );
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private restoreSession(): void {
    const token = this.readStoredToken();
    const user = this.readStoredUser();

    if (token && user) {
      this._token.set(token);
      this._user.set(user);
      return;
    }

    // Half-a-session is worse than none. Wipe to force a clean login.
    if (token || user) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  private storeSession(response: AuthResponse): void {
    this._token.set(response.token);
    this._user.set(response.user);
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  }

  private readStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private readStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AuthUser>;
      if (!parsed?.id || !parsed.email || !parsed.role) return null;
      return parsed as AuthUser;
    } catch {
      return null;
    }
  }
}
