import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, catchError, from, of, switchMap, tap, throwError } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest } from '../models';
import { LocalStoreService } from './local-store.service';
import {
  hashPassword,
  isLocalJwt,
  newDeviceSecret,
  signLocalJwt,
  verifyPassword,
} from './local-crypto.util';

const TOKEN_KEY = 'maxpos.token';
const USER_KEY = 'maxpos.user';
const DEVICE_SECRET_KEY = 'maxpos.device-secret';
/** Lifetime of a locally-minted JWT issued while offline. Eight hours
 *  matches the server-issued TTL (JWT_TTL_MINUTES=480) so the offline
 *  session lasts a typical shift. */
const LOCAL_JWT_TTL_SECONDS = 8 * 60 * 60;
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
  private readonly localStore = inject(LocalStoreService);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);
  /** True when the current session was minted locally because the
   *  network was unreachable at login. Drives the "Offline" banner. */
  private readonly _offlineSession = signal<boolean>(false);
  /** Timer that fires expireSession() the moment the JWT's `exp` is hit,
   *  so an idle tab doesn't sit "logged in" past its real validity. */
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly offlineSession = this._offlineSession.asReadonly();

  /**
   * A session is only considered authenticated when BOTH the token and the
   * user profile are present. localStorage can end up inconsistent (older
   * app versions, manual edits, half-written writes), and trusting a lone
   * token would let users past guards without a known identity.
   */
  readonly isAuthenticated = computed(() => this._token() !== null && this._user() !== null);

  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');
  readonly isCashier = computed(() => this._user()?.role === 'CASHIER');

  constructor() {
    this.restoreSession();
  }

  /**
   * Authenticate. Tries the server first; on network failure (status 0)
   * falls back to a locally-cached hash from the last successful login
   * on this device. A real 401 (wrong password) is NOT recovered — the
   * offline path also requires the password to match the cached hash.
   *
   * On successful online login the password is hashed client-side
   * (PBKDF2) and stashed in IndexedDB so subsequent offline attempts
   * work. The server-side bcrypt hash never crosses the wire.
   */
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', credentials).pipe(
      tap((response) => this.storeSession(response, false)),
      tap((response) => void this.cacheCredentials(credentials, response.user)),
      catchError((err: HttpErrorResponse) => {
        // status 0 == network unreachable (CORS preflight failed, DNS
        // failure, server unreachable). Everything else (401, 5xx) is
        // a real server response that we should NOT paper over.
        if (err.status !== 0) return throwError(() => err);
        return from(this.tryLocalLogin(credentials)).pipe(
          switchMap((local) => (local ? of(local) : throwError(() => err))),
        );
      }),
    );
  }

  /** Explicit user-initiated sign-out (Sign out button in the menus). No
   *  snackbar — the user knows what they did. */
  logout(): void {
    this.clearStorageAndTimer();
  }

  /**
   * Adopt an externally-minted store token as the current session. Used for
   * registration auto-login and platform impersonation, where the backend
   * hands back a ready store token. The user identity is read from the
   * token's own claims (sub/email/name/role).
   */
  adoptToken(token: string): boolean {
    const claims = this.decodeClaims(token);
    if (!claims) return false;
    const user: AuthUser = {
      id: String(claims['sub'] ?? ''),
      name: String(claims['name'] ?? ''),
      email: String(claims['email'] ?? ''),
      role: claims['role'] === 'ADMIN' ? 'ADMIN' : 'CASHIER',
    };
    if (!user.id || !user.email) return false;
    this.storeSession({ token, user }, false);
    return true;
  }

  /** Decode a JWT payload (segment 2) to its claims, or null if unparseable. */
  private decodeClaims(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64)) as Record<string, unknown>;
    } catch {
      return null;
    }
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
    this.snackBar.open('Your session has expired. Please sign in again.', 'Dismiss', {
      duration: 4000,
    });
    void this.router.navigate(['/login']);
  }

  private validateWithServer(): void {
    // Fire-and-forget. A 401 here is caught by unauthorizedInterceptor,
    // which calls expireSession() and routes the user to /login. We
    // don't care about the body — only that the request succeeded.
    this.http.get('/api/auth/me').subscribe({ error: () => {} });
  }

  /** Cache the password hash + user record after a successful online
   *  login so the same credentials can unlock the app while offline. */
  private async cacheCredentials(credentials: LoginRequest, user: AuthUser): Promise<void> {
    try {
      const hash = await hashPassword(credentials.password);
      await this.localStore.saveCachedUser({
        email: credentials.email,
        userId: user.id,
        name: user.name,
        role: user.role,
        localHash: JSON.stringify(hash),
        lastUsedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[auth] failed to cache credentials for offline login', err);
    }
  }

  /**
   * Offline login fallback. Returns a synthesized AuthResponse on
   * success (which the outer `login()` pipe treats identically to a
   * server response) or null when no cached user matches.
   */
  private async tryLocalLogin(credentials: LoginRequest): Promise<AuthResponse | null> {
    try {
      const cached = await this.localStore.getCachedUser(credentials.email);
      if (!cached) return null;
      const hash = JSON.parse(cached.localHash);
      const ok = await verifyPassword(credentials.password, hash);
      if (!ok) return null;
      const secret = await this.ensureDeviceSecret();
      const token = await signLocalJwt(
        { sub: cached.userId, email: cached.email, role: cached.role },
        secret,
        LOCAL_JWT_TTL_SECONDS,
      );
      const user: AuthUser = {
        id: cached.userId,
        email: cached.email,
        name: cached.name,
        role: cached.role,
      };
      const response: AuthResponse = { token, user };
      this.storeSession(response, true);
      // Bump lastUsedAt so a stale-cleanup job (future) can purge
      // accounts that haven't been used on this device in a while.
      await this.localStore.saveCachedUser({ ...cached, lastUsedAt: Date.now() });
      return response;
    } catch (err) {
      console.warn('[auth] offline login attempt failed', err);
      return null;
    }
  }

  /** First call on each device generates a 32-byte HMAC key and
   *  persists it; subsequent calls just read it. */
  private async ensureDeviceSecret(): Promise<string> {
    const existing = await this.localStore.kvGet<string>(DEVICE_SECRET_KEY);
    if (existing) return existing;
    const fresh = newDeviceSecret();
    await this.localStore.kvSet(DEVICE_SECRET_KEY, fresh);
    return fresh;
  }

  private clearStorageAndTimer(): void {
    this._token.set(null);
    this._user.set(null);
    this._offlineSession.set(false);
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
      const local = isLocalJwt(token);
      this._token.set(token);
      this._user.set(user);
      this._offlineSession.set(local);
      this.scheduleExpiry(token);
      // Skip the server-validation ping for local-issued tokens — the
      // backend would reject the signature with 401, kicking the user
      // to /login before they ever see whether the app is offline.
      // For real server tokens, the `exp` claim being in the future
      // only proves the token isn't *structurally* expired; ping
      // /api/auth/me so a server-side rejection (rotated JWT_SECRET,
      // user deleted, token revoked) trips unauthorizedInterceptor.
      if (!local) this.validateWithServer();
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

  private storeSession(response: AuthResponse, offline: boolean): void {
    this._token.set(response.token);
    this._user.set(response.user);
    this._offlineSession.set(offline);
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
    this.expiryTimer = setTimeout(() => this.expireSession(), Math.min(ms, MAX_TIMEOUT_MS));
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
