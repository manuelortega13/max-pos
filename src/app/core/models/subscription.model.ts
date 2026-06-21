/**
 * A plan a store owner can pick after sign-up. Priced in the plan's own
 * currency (`currency`/`currencySymbol`); `displayPriceCents` in
 * `displayCurrency` is that price converted into the store's currency when
 * `converted` is true (at `rate` = display units per 1 plan-currency unit).
 */
export interface StorePlan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** > 0 means this is a free-trial plan of that length. */
  readonly trialDays: number;
  readonly maxUsers: number | null;
  readonly maxProducts: number | null;
  readonly priceCents: number;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly displayPriceCents: number;
  readonly displayCurrency: string;
  readonly displaySymbol: string;
  readonly converted: boolean;
  readonly rate: number | null;
}

/** Selectable plans plus the store's own currency (shown in the header). */
export interface StorePlans {
  readonly storeCurrency: string | null;
  readonly storeSymbol: string | null;
  readonly plans: readonly StorePlan[];
}

/** The current store's subscription state. */
export interface SubscriptionStatus {
  readonly hasPlan: boolean;
  readonly planId: string | null;
  readonly planCode: string | null;
  readonly planName: string | null;
  readonly priceCents: number;
  readonly onTrial: boolean;
  readonly trialEndsAt: string | null;
  readonly trialDaysLeft: number | null;
  readonly storeStatus: string;
}
