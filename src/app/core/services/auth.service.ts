import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, tap } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest } from '../models';

const TOKEN_KEY = 'maxpos.token';
const USER_KEY = 'maxpos.user';
/** setTimeout's millisecond delay is internally clamped to a signed 32-bit
 *  int, so anything beyond ~24.85 days silently fires immediately. Clamp
 *  our scheduled expiry to that ceiling — in practice JWT TTLs are minutes
 *  to hours, so this is just defensive. */
const MAX_TIMEOUT_MS = 2_147_483_647;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);
  /** Timer that fires expireSession() the moment the JWT's `exp` is hit,
   *  so an idle tab doesn't sit "logged in" past its real validity. */
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Explicit user-initiated sign-out (Sign out button in the menus). No
   *  snackbar — the user knows what they did. */
  logout(): void {
    this.clearStorageAndTimer();
  }

  /**
   * Auto-logout triggered by either the JWT expiring (timer) or the server
   * rejecting a request with 401 (unauthorizedInterceptor). Clears state
   * exactly like logout() and additionally:
   *   - tells the user what happened via a snackbar
   *   - navigates them to /login so they re-authenticate
   * No-ops if there's nothing to expire (already signed out).
   */
  expireSession(): void {
    if (!this._token() && !this._user()) return;
    this.clearStorageAndTimer();
    this.snackBar.open(
      'Your session has expired. Please sign in again.',
      'Dismiss',
      { duration: 4000 },
    );
    void this.router.navigate(['/login']);
  }

  private clearStorageAndTimer(): void {
    this._token.set(null);
    this._user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // localStorage unavailable — best effort.
    }
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private restoreSession(): void {
    const token = this.readStoredToken();
    const user = this.readStoredUser();

    // Refuse to restore an already-expired token. Without this check the
    // UI would briefly show the user as signed in until their next HTTP
    // request, which is confusing and lets through whichever screen they
    // last landed on before a refresh.
    if (token && user && !this.isTokenExpired(token)) {
      this._token.set(token);
      this._user.set(user);
      this.scheduleExpiry(token);
      return;
    }

    // Half-a-session or expired-a-session is worse than none. Wipe to
    // force a clean login.
    if (token || user) {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {
        // ignore
      }
    }
  }

  private storeSession(response: AuthResponse): void {
    this._token.set(response.token);
    this._user.set(response.user);
    try {
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    } catch {
      // ignore
    }
    this.scheduleExpiry(response.token);
  }

  private isTokenExpired(token: string): boolean {
    const exp = this.tokenExp(token);
    if (exp === null) return false; // no exp claim — treat as never-expires
    return exp * 1000 <= Date.now();
  }

  /** Decode the JWT payload (segment 2) and return its `exp` claim in
   *  Unix seconds, or null if the token isn't a JWT or has no `exp`. */
  private tokenExp(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      // JWT uses base64url; flip the alphabet to standard base64 for atob.
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(b64);
      const decoded = JSON.parse(json) as { exp?: number };
      return typeof decoded.exp === 'number' ? decoded.exp : null;
    } catch {
      return null;
    }
  }

  private scheduleExpiry(token: string): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const exp = this.tokenExp(token);
    if (exp === null) return;
    const ms = exp * 1000 - Date.now();
    if (ms <= 0) {
      this.expireSession();
      return;
    }
    this.expiryTimer = setTimeout(
      () => this.expireSession(),
      Math.min(ms, MAX_TIMEOUT_MS),
    );
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
