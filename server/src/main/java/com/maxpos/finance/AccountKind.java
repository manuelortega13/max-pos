package com.maxpos.finance;

/**
 * Classifier for an {@link Account}. Drives display ordering and
 * auto-tracking behavior — e.g., GCash cash-in transactions look up
 * the GCASH account by kind, not by name (admin can rename "GCash"
 * without breaking the auto-tracker).
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
    OTHER
}
