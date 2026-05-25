/** When the creditor is expected to settle their outstanding balance. */
export type PaymentTerm = 'FIFTEENTH' | 'MONTH_END';

/** Human-readable label for {@link PaymentTerm}. */
export const PAYMENT_TERM_LABEL: Readonly<Record<PaymentTerm, string>> = {
  FIFTEENTH: 'On the 15th',
  MONTH_END: 'End of month',
};

export interface Creditor {
  readonly id: string;
  fullName: string;
  phone: string;
  /** Optional. */
  address: string | null;
  paymentTerm: PaymentTerm;
  /** `null` means no credit limit. */
  creditLimit: number | null;
  /** Server-computed sum of unrefunded credit-sale totals. */
  readonly outstandingBalance: number;
  active: boolean;
  readonly createdAt: string;
}

export interface CreditorUpsertRequest {
  fullName: string;
  phone: string;
  address: string | null;
  paymentTerm: PaymentTerm;
  creditLimit: number | null;
  active: boolean;
}
