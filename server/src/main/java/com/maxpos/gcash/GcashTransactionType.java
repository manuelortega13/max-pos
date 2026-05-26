package com.maxpos.gcash;

/**
 * Direction of a GCash service transaction.
 *
 *   CASH_IN   — customer hands cash; store sends to their GCash.
 *               Drawer gains amount + fee.
 *   CASH_OUT  — customer sends to store's GCash; store hands cash.
 *               Drawer loses amount, gains fee.
 */
public enum GcashTransactionType {
    CASH_IN,
    CASH_OUT
}
