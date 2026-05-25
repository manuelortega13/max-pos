import { PaymentMethod } from './sale.model';

/**
 * A creditor's settlement against their outstanding balance. Voided
 * payments still show in history with `voidedAt` populated — they
 * don't disappear, they just stop counting toward the balance.
 */
export interface CreditorPayment {
  readonly id: string;
  readonly creditorId: string;
  readonly creditorName: string;
  readonly amount: number;
  readonly paymentMethod: PaymentMethod;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly businessDayId: string | null;
  readonly date: string;
  readonly reference: string;
  readonly notes: string | null;
  readonly voidedAt: string | null;
  readonly voidedById: string | null;
  readonly voidedByName: string | null;
}

export interface CreateCreditorPaymentRequest {
  readonly creditorId: string;
  readonly amount: number;
  /** Must NOT be 'CREDIT' — backend rejects it. */
  readonly paymentMethod: PaymentMethod;
  readonly notes?: string;
}
