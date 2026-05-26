export type GcashTransactionType = 'CASH_IN' | 'CASH_OUT';

/** Workflow state. Cash-in lands PENDING (admin sends GCash from
 *  their phone, then marks COMPLETED); cash-out is COMPLETED on
 *  create. One-way transition. */
export type GcashTransactionStatus = 'PENDING' | 'COMPLETED';

/** Admin-configured fee slice. Shared across both directions. */
export interface GcashFeeTier {
  readonly id: string;
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly fee: number;
  readonly active: boolean;
  readonly createdAt: string;
}

export interface GcashFeeTierUpsertRequest {
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly fee: number;
  readonly active: boolean;
}

/** One walk-in encounter. Amount is the customer's cash/GCash
 *  amount; fee is what the store charged.
 *
 *  Phone is required for cash-in (cashier needs the destination
 *  GCash number) — server + DB both enforce this. Name is always
 *  optional. */
export interface GcashTransaction {
  readonly id: string;
  readonly type: GcashTransactionType;
  readonly status: GcashTransactionStatus;
  readonly amount: number;
  readonly fee: number;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly businessDayId: string | null;
  readonly date: string;
  readonly reference: string;
  readonly notes: string | null;
  readonly completedAt: string | null;
  readonly completedById: string | null;
  readonly completedByName: string | null;
  readonly voidedAt: string | null;
  readonly voidedById: string | null;
  readonly voidedByName: string | null;
}

export interface CreateGcashTransactionRequest {
  readonly type: GcashTransactionType;
  readonly amount: number;
  readonly fee: number;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly notes?: string | null;
}
