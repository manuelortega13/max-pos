export type UserRole = 'ADMIN' | 'CASHIER';

export interface User {
  readonly id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  readonly createdAt: string;
}

export interface UserCreateRequest {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active?: boolean;
}

export interface UserUpdateRequest {
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  /** Optional; when present, resets the user's password. */
  password?: string | null;
}
