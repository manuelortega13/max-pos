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
  /**
   * When true the cashier POS queues failed sale POSTs in localStorage and
   * replays them when the network comes back (see OfflineQueueService).
   * Requires `allowNegativeStock === true` because queued sales may land
   * against exhausted stock on replay; the backend enforces the pairing.
   */
  offlineModeEnabled: boolean;
  /**
   * Finance account that card sales credit by default. Picked once
   * in Settings — the auto-tracker reads this when writing the IN
   * movement for a card sale or card credit payment.
   */
  cardAccountId: string | null;
  /**
   * Finance account that transfer (e-wallet send) sales credit by
   * default. Typical mapping is GCash but the admin picks.
   */
  transferAccountId: string | null;
}
