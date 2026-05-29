package com.maxpos.finance;

/**
 * The kind of business event that produced an {@link AccountMovement}.
 * Used for the source-row lookup (so we can find and void the
 * movements when the source is voided) and to render a friendly
 * "Type" label in the movement feed.
 */
public enum MovementSourceKind {
    SALE,
    REFUND,
    GCASH_TXN,
    LOAD_TXN,
    EXPENSE,
    CREDITOR_PAYMENT,
    FLOAT_ADDITION,
    OPENING_FLOAT,
    /** Manual cash in/out entered by an admin via the Finances page. */
    MANUAL,
    /** Account-to-account transfer; the OUT and IN rows are paired via
     *  {@link AccountMovement#getTransferPair()}. */
    TRANSFER,
    /** Variance adjustment from an {@link AccountReconciliation}. */
    RECONCILE
}
