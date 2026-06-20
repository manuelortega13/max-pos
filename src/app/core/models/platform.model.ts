/** A platform admin's identity (from platform login / me). */
export interface PlatformAdmin {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
}

/** Result of platform login. */
export interface PlatformAuthResponse {
  readonly token: string;
  readonly admin: PlatformAdmin;
}

/** One store row in the platform console, with cross-store stats. */
export interface PlatformStore {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
  readonly createdAt: string;
  readonly users: number;
  readonly products: number;
  readonly sales: number;
  readonly revenue: number;
  readonly lastSaleAt: string | null;
}

/** Result of impersonating a store. */
export interface ImpersonationResponse {
  readonly token: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly actingAsEmail: string;
}

/** A platform-admin account in the console's admins list. */
export interface PlatformAdminAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly active: boolean;
  readonly createdAt: string;
}

/** Payload to create another platform admin. */
export interface CreatePlatformAdminRequest {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}
