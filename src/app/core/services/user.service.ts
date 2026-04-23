import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { User, UserCreateRequest, UserUpdateRequest } from '../models';
import { AuthService } from './auth.service';

/**
 * Admin-scoped user directory. All `/api/users` endpoints are
 * `@PreAuthorize("hasRole('ADMIN')")` so this service silently no-ops
 * when the current session isn't an admin.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly _users = signal<User[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly admins = computed(() => this._users().filter((u) => u.role === 'ADMIN'));
  readonly cashiers = computed(() => this._users().filter((u) => u.role === 'CASHIER'));
  readonly activeCashiers = computed(() =>
    this._users().filter((u) => u.role === 'CASHIER' && u.active),
  );

  constructor() {
    this.load();
  }

  load(): void {
    if (!this.authService.isAuthenticated() || !this.authService.isAdmin()) return;

    this._loading.set(true);
    this._error.set(null);
    this.http.get<User[]>('/api/users').subscribe({
      next: (users) => {
        this._users.set(users);
        this._loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this._error.set(this.describe(err));
        this._loading.set(false);
      },
    });
  }

  getById(id: string): User | undefined {
    return this._users().find((u) => u.id === id);
  }

  create(request: UserCreateRequest): Observable<User> {
    return this.http.post<User>('/api/users', request).pipe(
      tap((user) => this._users.update((list) => [user, ...list])),
    );
  }

  update(id: string, request: UserUpdateRequest): Observable<User> {
    return this.http.put<User>(`/api/users/${id}`, request).pipe(
      tap((updated) =>
        this._users.update((list) => list.map((u) => (u.id === id ? updated : u))),
      ),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/users/${id}`).pipe(
      tap(() => this._users.update((list) => list.filter((u) => u.id !== id))),
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
