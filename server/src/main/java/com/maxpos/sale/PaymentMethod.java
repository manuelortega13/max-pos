package com.maxpos.sale;

public enum PaymentMethod {
    CASH,
    CARD,
    TRANSFER,
    /** GCash e-wallet. */
    GCASH,
    /** Maya e-wallet. */
    MAYA,
    /** Direct bank transfer / deposit. */
    BANK,
    /** Charge-on-account — the sale is paid later by a Creditor. */
    CREDIT
}
