export interface StoreSettings {
  storeName: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  receiptFooter: string;
  address: string;
  phone: string;
  /**
   * When true the POS lets cashiers ring up products past their available
   * stock, driving batches negative so the sale still goes through.
   */
  allowNegativeStock: boolean;
}
