/**
 * One open-close cycle of the register. `closedAt == null` means the
 * day is still open; once closed, the snapshot fields are populated
 * and frozen for the Z-report.
 */
export interface BusinessDay {
  readonly id: string;
  readonly openedAt: string;
  readonly openedById: string;
  readonly openedByName: string;
  readonly openingFloat: number;
  readonly closedAt: string | null;
  readonly closedById: string | null;
  readonly closedByName: string | null;
  readonly countedCash: number | null;
  readonly notes: string | null;
  readonly expectedCash: number | null;
  readonly variance: number | null;
  readonly totalSales: number | null;
  readonly totalRefunds: number | null;
  readonly cashSales: number | null;
  readonly cashRefunds: number | null;
  readonly cardSales: number | null;
  readonly transferSales: number | null;
  /** E-wallet / bank sales. Like card/transfer, off-drawer. */
  readonly gcashSales: number | null;
  readonly mayaSales: number | null;
  readonly bankSales: number | null;
  /** Charge-on-account total. Doesn't touch the cash drawer. */
  readonly creditSales: number | null;
  readonly cashCreditPayments: number | null;
  /** GCash cash-in: customer hands cash, store sends GCash. Drawer
   *  gains amount + fee. */
  readonly gcashCashInAmount: number | null;
  readonly gcashCashInFees: number | null;
  /** GCash cash-out: customer sends GCash, store hands cash. Drawer
   *  loses amount, keeps fee. */
  readonly gcashCashOutAmount: number | null;
  readonly gcashCashOutFees: number | null;
  /** Load transactions — always cash-in for the till (customer hands
   *  cash, store sends mobile load). Drawer gains amount + fee. */
  readonly loadAmount: number | null;
  readonly loadFees: number | null;
  /** Sum of mid-day cash top-ups to the opening float (excluding
   *  voided additions). Frozen at close time. */
  readonly floatAdditions: number | null;
  readonly salesCount: number | null;
  readonly itemsSold: number | null;
}

/** One audit-log entry for a mid-day cash float top-up. */
export interface FloatAddition {
  readonly id: string;
  readonly businessDayId: string;
  readonly amount: number;
  readonly note: string | null;
  readonly addedAt: string;
  readonly addedById: string;
  readonly addedByName: string;
  readonly voidedAt: string | null;
  readonly voidedById: string | null;
  readonly voidedByName: string | null;
}

export interface CreateFloatAdditionRequest {
  readonly amount: number;
  readonly note?: string | null;
}

export interface OpenDayRequest {
  readonly openingFloat: number;
}

export interface CloseDayRequest {
  readonly countedCash: number;
  readonly notes?: string | null;
}
