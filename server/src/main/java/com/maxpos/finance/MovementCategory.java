package com.maxpos.finance;

/**
 * Canonical category strings used by the auto-tracker. Kept as
 * constants (not an enum) so manual entries and future event types
 * can use new categories without a code change.
 *
 * Naming pattern: SCREAMING_SNAKE_CASE, stable across versions —
 * these are persisted to {@code account_movements.category} and
 * drive the breakdown panel grouping.
 */
public final class MovementCategory {
    private MovementCategory() {}

    // Sales
    public static final String CASH_SALE     = "CASH_SALE";
    public static final String CARD_SALE     = "CARD_SALE";
    public static final String TRANSFER_SALE = "TRANSFER_SALE";
    public static final String CREDIT_SALE   = "CREDIT_SALE";

    // Refunds
    public static final String CASH_REFUND     = "CASH_REFUND";
    public static final String CARD_REFUND     = "CARD_REFUND";
    public static final String TRANSFER_REFUND = "TRANSFER_REFUND";
    public static final String CREDIT_REFUND   = "CREDIT_REFUND";

    // GCash service (in/out + fees)
    public static final String GCASH_CASH_IN  = "GCASH_CASH_IN";
    public static final String GCASH_CASH_OUT = "GCASH_CASH_OUT";
    public static final String GCASH_FEE      = "GCASH_FEE";

    // Cellphone load
    public static final String LOAD_SALE = "LOAD_SALE";

    // Floats
    public static final String OPENING_FLOAT = "OPENING_FLOAT";
    public static final String FLOAT_TOPUP   = "FLOAT_TOPUP";

    // Creditor payments
    public static final String CREDIT_PAYMENT = "CREDIT_PAYMENT";

    // Expenses (any expense category lives here unless the expense
    // row's own category column overrides — see auto-tracker).
    public static final String EXPENSE = "EXPENSE";

    // Manual + reconciliation
    public static final String OWNER_DEPOSIT       = "OWNER_DEPOSIT";
    public static final String OWNER_WITHDRAWAL    = "OWNER_WITHDRAWAL";
    public static final String BANK_DEPOSIT        = "BANK_DEPOSIT";
    public static final String SUPPLIER_PAYMENT    = "SUPPLIER_PAYMENT";
    public static final String OTHER_IN            = "OTHER_IN";
    public static final String OTHER_OUT           = "OTHER_OUT";
    public static final String TRANSFER            = "TRANSFER";
    public static final String RECONCILE_OVER      = "RECONCILE_OVER";
    public static final String RECONCILE_SHORT     = "RECONCILE_SHORT";
}
