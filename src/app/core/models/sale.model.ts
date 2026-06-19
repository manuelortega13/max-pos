export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'GCASH' | 'MAYA' | 'BANK' | 'CREDIT';
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
  /** Set only when paymentMethod = 'CREDIT', null otherwise. */
  readonly creditorId: string | null;
  readonly creditorName: string | null;
  /** FK to the business day this sale belongs to. Null for pre-V16
   *  historical rows (before the business-day feature shipped). The
   *  EoD live preview filters by this so it mirrors what the backend
   *  actually aggregates on close, not the looser date-since-openedAt
   *  heuristic. */
  readonly businessDayId: string | null;
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
  /** Required when paymentMethod = 'CREDIT', forbidden otherwise. */
  readonly creditorId?: string;
}

/** One day's completed-sale revenue (UTC calendar day, `yyyy-MM-dd`). */
export interface DailyRevenue {
  readonly date: string;
  readonly total: number;
}

/**
 * Pre-aggregated data for the dashboard Sales Growth chart, from
 * `GET /api/sales/daily-revenue`. `points` is one entry per day across the
 * window (oldest → newest, zero-filled); `previousTotal` is the preceding
 * window's total for the growth-vs-previous badge.
 */
export interface SalesGrowth {
  readonly points: readonly DailyRevenue[];
  readonly previousTotal: number;
}
