export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';
export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'PENDING';

/** % off (value is 0-100) or a flat money amount off. */
export type DiscountType = 'PERCENT' | 'FIXED';

/**
 * Cashier-entered discount input. `value` is the raw input — the
 * percentage for PERCENT, the money for FIXED. Paired with a type the
 * backend recomputes the actual amount.
 */
export interface DiscountInput {
  readonly type: DiscountType;
  readonly value: number;
}

export interface SaleItem {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  /** product.cost at sale time. Nullable for pre-V14 historical rows. */
  readonly unitCost: number | null;
  /** Line subtotal, already NET of any line discount. */
  readonly subtotal: number;
  readonly discountType: DiscountType | null;
  readonly discountValue: number | null;
  readonly discountAmount: number | null;
}

export interface Sale {
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly cashierId: string;
  readonly cashierName: string;
  /** Sum of line.subtotal, which are each already net of per-line discounts. */
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly paymentMethod: PaymentMethod;
  readonly status: SaleStatus;
  readonly refundReason: string | null;
  /** Order-level discount applied after line discounts, before tax. */
  readonly discountType: DiscountType | null;
  readonly discountValue: number | null;
  readonly discountAmount: number | null;
  readonly items: readonly SaleItem[];
}

export interface CreateSaleLine {
  readonly productId: string;
  readonly quantity: number;
  readonly discount?: DiscountInput;
}

export interface CreateSaleRequest {
  readonly items: readonly CreateSaleLine[];
  readonly paymentMethod: PaymentMethod;
  /**
   * Client-generated UUID carried with every sale so the backend can
   * idempotently skip duplicates when the offline queue replays a sale
   * that actually landed on a previous attempt.
   */
  readonly clientRef?: string;
  /** Order-level discount (applied after line discounts, before tax). */
  readonly discount?: DiscountInput;
}
