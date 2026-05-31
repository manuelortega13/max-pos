package com.maxpos.finance;

/**
 * Classifier for an {@link Account}. Drives display ordering and
 * auto-tracking behavior — e.g., GCash cash-in transactions look up
 * the GCASH account by kind, not by name (admin can rename "GCash"
 * without breaking the auto-tracker).
 *
 * RECEIVABLES holds money owed by creditors: credit sales raise it,
 * creditor payments draw it down. Functionally an asset account
 * rather than a wallet — the balance reflects what the business is
 * owed, not cash on hand.
 *
 * OTHER is the catch-all for admin-created accounts that don't fit
 * a known wallet type (petty cash, savings, e-wallet brands we don't
 * track natively).
 */
public enum AccountKind {
    CASH,
    GCASH,
    MAYA,
    BANK,
    LOAD_WALLET,
    RECEIVABLES,
    OTHER
}
