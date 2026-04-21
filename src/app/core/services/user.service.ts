import { Injectable, computed, signal } from '@angular/core';
import { User } from '../models';
import { CURRENT_CASHIER_ID, USERS_MOCK } from '../mock-data/users.mock';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly _users = signal<User[]>(USERS_MOCK);
  private readonly _currentUserId = signal<string>(CURRENT_CASHIER_ID);

  readonly users = this._users.asReadonly();
  readonly admins = computed(() => this._users().filter((u) => u.role === 'admin'));
  readonly cashiers = computed(() => this._users().filter((u) => u.role === 'cashier'));
  readonly activeCashiers = computed(() =>
    this._users().filter((u) => u.role === 'cashier' && u.active),
  );
  readonly currentUser = computed(() =>
    this._users().find((u) => u.id === this._currentUserId()) ?? null,
  );

  getById(id: string): User | undefined {
    return this._users().find((u) => u.id === id);
  }
}
