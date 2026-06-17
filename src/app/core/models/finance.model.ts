export type AccountKind =
  | 'CASH'
  | 'GCASH'
  | 'MAYA'
  | 'BANK'
  | 'LOAD_WALLET'
  | 'RECEIVABLES'
  | 'OTHER';

export type MovementDirection = 'IN' | 'OUT';

export type MovementSourceKind =
  | 'SALE'
  | 'REFUND'
  | 'GCASH_TXN'
  | 'LOAD_TXN'
  | 'EXPENSE'
  | 'CREDITOR_PAYMENT'
  | 'FLOAT_ADDITION'
  | 'OPENING_FLOAT'
  | 'MANUAL'
  | 'TRANSFER'
  | 'RECONCILE';

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
}

/** Per-account row on the overview page. Carries both the
 *  running balance and the rolling totals since the last
 *  reconciliation (the "what's been going on" panel). */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly balance: number;
  /** Sum of IN movements since last reconciliation (excludes transfers). */
  readonly periodIn: number;
  /** Sum of OUT movements since last reconciliation (excludes transfers). */
  readonly periodOut: number;
  readonly lastReconciledAt: string | null;
  readonly lastReconciledVariance: number | null;
}

export interface AccountMovement {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly direction: MovementDirection;
  readonly amount: number;
  readonly category: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly recordedById: string | null;
  readonly recordedByName: string | null;
  readonly sourceKind: MovementSourceKind;
  readonly sourceId: string | null;
  readonly transferPairId: string | null;
  readonly voidedAt: string | null;
  readonly voidedById: string | null;
  readonly voidedByName: string | null;
}

export interface AccountReconciliation {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly countedAt: string;
  readonly countedById: string | null;
  readonly countedByName: string | null;
  readonly expectedAmount: number;
  readonly countedAmount: number;
  readonly variance: number;
  readonly note: string | null;
  readonly adjustmentMovementId: string | null;
  readonly voidedAt: string | null;
  readonly voidedById: string | null;
  readonly voidedByName: string | null;
}

export interface FinanceOverview {
  /** Sum of balances across all active accounts. */
  readonly net: number;
  readonly accounts: AccountSummary[];
  /** Last-30-days IN total (gross, transfers excluded). */
  readonly periodIn: number;
  /** Last-30-days OUT total (gross, transfers excluded). */
  readonly periodOut: number;
}

export interface AccountUpsertRequest {
  readonly name: string;
  readonly kind: AccountKind;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface ManualMovementRequest {
  readonly accountId: string;
  readonly amount: number;
  readonly category: string;
  readonly note?: string | null;
}

export interface TransferRequest {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amount: number;
  readonly note?: string | null;
}

export interface ReconcileRequest {
  readonly accountId: string;
  readonly countedAmount: number;
  readonly note?: string | null;
}

/** Display labels for known categories — keeps backend constants
 *  off the UI without forcing every screen to switch over strings. */
export const MOVEMENT_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  CASH_SALE: 'Cash sale',
  CARD_SALE: 'Card sale',
  TRANSFER_SALE: 'Transfer sale',
  GCASH_SALE: 'GCash sale',
  MAYA_SALE: 'Maya sale',
  BANK_SALE: 'Bank sale',
  CREDIT_SALE: 'Credit sale',
  CASH_REFUND: 'Cash refund',
  CARD_REFUND: 'Card refund',
  TRANSFER_REFUND: 'Transfer refund',
  GCASH_REFUND: 'GCash refund',
  MAYA_REFUND: 'Maya refund',
  BANK_REFUND: 'Bank refund',
  CREDIT_REFUND: 'Credit refund',
  GCASH_CASH_IN: 'GCash cash-in',
  GCASH_CASH_OUT: 'GCash cash-out',
  GCASH_FEE: 'GCash fee',
  LOAD_SALE: 'Load sale',
  OPENING_FLOAT: 'Opening float',
  FLOAT_TOPUP: 'Float top-up',
  CREDIT_PAYMENT: 'Credit payment',
  EXPENSE: 'Expense',
  OWNER_DEPOSIT: 'Owner deposit',
  OWNER_WITHDRAWAL: 'Owner withdrawal',
  BANK_DEPOSIT: 'Bank deposit',
  SUPPLIER_PAYMENT: 'Supplier payment',
  OTHER_IN: 'Other (in)',
  OTHER_OUT: 'Other (out)',
  TRANSFER: 'Transfer',
  RECONCILE_OVER: 'Reconcile (over)',
  RECONCILE_SHORT: 'Reconcile (short)',
};

export const ACCOUNT_KIND_LABELS: Readonly<Record<AccountKind, string>> = {
  CASH: 'Cash',
  GCASH: 'GCash',
  MAYA: 'Maya',
  BANK: 'Bank',
  LOAD_WALLET: 'Load wallet',
  RECEIVABLES: 'Receivables',
  OTHER: 'Other',
};
