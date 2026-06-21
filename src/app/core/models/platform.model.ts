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
  /** Revenue in the store's own currency. */
  readonly revenue: number;
  /** The store's own currency code + symbol. */
  readonly currency: string | null;
  readonly currencySymbol: string | null;
  /** Revenue converted into the platform currency (live FX) for the total. */
  readonly revenueConverted: number;
  readonly lastSaleAt: string | null;
  /** Assigned plan + limits. null plan → unassigned; null limit → unlimited. */
  readonly planId: string | null;
  readonly planName: string | null;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
  /** End of the current free trial, or null when not on a trial. */
  readonly trialEndsAt: string | null;
}

/** Live FX rates into the platform currency (from the platform FX endpoint). */
export interface FxRates {
  readonly base: string;
  readonly asOf: string;
  /** False when rates couldn't be loaded — totals are then unconverted. */
  readonly available: boolean;
  /** currency code → units of base per 1 unit of that currency. */
  readonly toBase: Record<string, number>;
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
  /** > 0 means this is a free-trial plan of that length. */
  readonly trialDays: number;
  readonly active: boolean;
  readonly createdAt: string;
  /** Stores currently on this plan; delete is blocked when > 0. */
  readonly subscriberCount: number;
  /** The plan's own pricing currency (set at creation, fixed). */
  readonly currency: string;
  readonly currencySymbol: string;
}

/** Payload to create/edit a plan. (currency is applied on create only.) */
export interface CreatePlanRequest {
  readonly code: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
  readonly sortOrder: number;
  readonly trialDays: number;
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
