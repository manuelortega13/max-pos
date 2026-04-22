export type BackendUserRole = 'ADMIN' | 'CASHIER';

export interface AuthUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: BackendUserRole;
}

export interface AuthResponse {
  readonly token: string;
  readonly user: AuthUser;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}
