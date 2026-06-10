import { PaymentMethod } from './sale.model';

export type LoadTransactionStatus = 'PENDING' | 'COMPLETED';

/** Admin-configured fee slice for cellphone load. Same shape as the
 *  GCash tiers — left-inclusive, right-exclusive range. */
export interface LoadFeeTier {
  readonly id: string;
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly fee: number;
  readonly active: boolean;
  readonly createdAt: string;
}

export interface LoadFeeTierUpsertRequest {
  readonly minAmount: number;
  readonly maxAmount: number;
  readonly fee: number;
  readonly active: boolean;
}

/** One load transaction. Always cash-in for the store; admin marks
 *  PENDING → COMPLETED after sending from their phone. */
export interface LoadTransaction {
  readonly id: string;
  readonly status: LoadTransactionStatus;
  readonly amount: number;
  readonly fee: number;
  readonly promo: string | null;
  readonly customerPhone: string;
  /** How the customer paid: CASH (default) or CREDIT (charged to a creditor). */
  readonly paymentMethod: PaymentMethod;
  /** Set only when paymentMethod = 'CREDIT', null otherwise. */
  readonly creditorId: string | null;
  readonly creditorName: string | null;
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
  /** Client-only flag: true on an optimistic row that was rung up offline
   *  and is still waiting in the sync queue. Never sent by the server. */
  readonly pendingSync?: boolean;
}

export interface CreateLoadTransactionRequest {
  readonly amount: number;
  readonly fee: number;
  readonly promo?: string | null;
  readonly customerPhone: string;
  readonly notes?: string | null;
  /** CASH or CREDIT. Loads support only those two methods. */
  readonly paymentMethod: PaymentMethod;
  /** Required when paymentMethod = 'CREDIT', omitted otherwise. */
  readonly creditorId?: string | null;
  /** Offline-queue idempotency key (UUID-based). Set only for loads rung up
   *  offline; a replayed POST with the same clientRef dedupes server-side. */
  readonly clientRef?: string;
}
