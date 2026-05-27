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
  readonly salesCount: number | null;
  readonly itemsSold: number | null;
}

export interface OpenDayRequest {
  readonly openingFloat: number;
}

export interface CloseDayRequest {
  readonly countedCash: number;
  readonly notes?: string | null;
}
