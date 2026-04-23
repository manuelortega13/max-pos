export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';
export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'PENDING';

export interface SaleItem {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
}

export interface Sale {
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly paymentMethod: PaymentMethod;
  readonly status: SaleStatus;
  readonly refundReason: string | null;
  readonly items: readonly SaleItem[];
}

export interface CreateSaleRequest {
  readonly items: readonly { productId: string; quantity: number }[];
  readonly paymentMethod: PaymentMethod;
  /**
   * Client-generated UUID carried with every sale so the backend can
   * idempotently skip duplicates when the offline queue replays a sale
   * that actually landed on a previous attempt.
   */
  readonly clientRef?: string;
}
