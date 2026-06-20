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
  /** Assigned plan + limits. null plan → unassigned; null limit → unlimited. */
  readonly planId: string | null;
  readonly planName: string | null;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
}

/** Platform-wide settings owned by the super admin. */
export interface PlatformSettings {
  readonly defaultCurrency: string;
  readonly defaultCurrencySymbol: string;
  readonly updatedAt: string;
}

/** A subscription plan in the catalog. Null limits mean unlimited. */
export interface Plan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly priceCents: number;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
  readonly sortOrder: number;
  readonly active: boolean;
  readonly createdAt: string;
}

/** Payload to create a plan. */
export interface CreatePlanRequest {
  readonly code: string;
  readonly name: string;
  readonly priceCents: number;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
  readonly sortOrder: number;
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

/** A user belonging to a store, as listed in the platform console. */
export interface StoreUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly active: boolean;
  readonly createdAt: string;
}

/** One platform activity-log entry. */
export interface PlatformAuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actorEmail: string | null;
  readonly action: string;
  readonly targetStoreId: string | null;
  readonly targetLabel: string | null;
  readonly detail: string | null;
}
