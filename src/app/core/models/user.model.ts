export type UserRole = 'admin' | 'cashier';

export interface User {
  readonly id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  readonly createdAt: string;
}
