/** Generic page envelope returned by server-paginated endpoints.
 *  Mirrors the backend `PageResponse<T>`. */
export interface Page<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/** Discriminator for a unified transaction row. */
export type TransactionKind = 'SALE' | 'GCASH_IN' | 'GCASH_OUT' | 'LOAD';

/** Coarse source filter bucket. */
export type TransactionSource = 'SALE' | 'GCASH' | 'LOAD';

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'VOIDED';

/**
 * One row of the unified admin transaction feed (`/api/transactions`),
 * mirroring the backend `transaction_feed` view. Display labels (type
 * label/icon) are derived on the client from {@link kind}.
 */
export interface TransactionRow {
  readonly id: string;
  readonly kind: TransactionKind;
  readonly source: TransactionSource;
  readonly reference: string;
  readonly date: string;
  readonly cashierId: string;
  readonly cashierName: string;
  /** Line count for sales; null for service rows. */
  readonly itemsCount: number | null;
  readonly paymentLabel: string;
  /** Cash that changed hands, excluding any service fee. */
  readonly principal: number;
  /** Service-fee revenue for GCash/Load; null for sales. */
  readonly fee: number | null;
  readonly status: TransactionStatus;
}
