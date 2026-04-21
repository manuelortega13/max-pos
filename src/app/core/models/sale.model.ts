export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type SaleStatus = 'completed' | 'refunded' | 'pending';

export interface SaleItem {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
}

export interface Sale {
  readonly id: string;
  readonly date: string;
  readonly items: readonly SaleItem[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly paymentMethod: PaymentMethod;
  readonly status: SaleStatus;
}
